import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface CachedResponse {
  status: number;
  contentType: string;
  body: string;
  fetchedAt: number;
}

const FRESH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 دقائق
const STALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 ساعة كنسخة احتياطية عند 429/تعطل مؤقت
const HOST_MIN_GAP_MS = 450;
const CACHE_DIR = path.join(os.tmpdir(), 'iptv-xtream-proxy-cache');

const memoryCache = new Map<string, CachedResponse>();
const inFlightRequests = new Map<string, Promise<CachedResponse>>();
const hostQueueTail = new Map<string, Promise<void>>();
const hostLastCallAt = new Map<string, number>();

try {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch {
  // تجاهل
}

function getCacheFilePath(url: string): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  return path.join(CACHE_DIR, `${hash}.json`);
}

function readCached(url: string, maxAgeMs: number): CachedResponse | null {
  const now = Date.now();
  const mem = memoryCache.get(url);
  if (mem && now - mem.fetchedAt <= maxAgeMs) {
    return mem;
  }
  try {
    const file = getCacheFilePath(url);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CachedResponse;
      if (parsed && parsed.body && now - parsed.fetchedAt <= maxAgeMs) {
        memoryCache.set(url, parsed);
        return parsed;
      }
    }
  } catch {
    // تجاهل
  }
  return null;
}

function writeCached(url: string, entry: CachedResponse): void {
  memoryCache.set(url, entry);
  try {
    fs.writeFileSync(getCacheFilePath(url), JSON.stringify(entry), 'utf8');
  } catch {
    // تجاهل
  }
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runHostPaced<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const prev = hostQueueTail.get(host) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  hostQueueTail.set(host, current);
  await prev;
  try {
    const last = hostLastCallAt.get(host) || 0;
    const elapsed = Date.now() - last;
    if (elapsed < HOST_MIN_GAP_MS) {
      await waitMs(HOST_MIN_GAP_MS - elapsed);
    }
    hostLastCallAt.set(host, Date.now());
    return await fn();
  } finally {
    release();
  }
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower === '::1' ||
    lower === '0:0:0:0:0:0:0:1'
  ) {
    return true;
  }

  const ipType = net.isIP(lower);
  if (ipType === 4) {
    const parts = lower.split('.').map(Number);
    if (parts[0] === 127 || parts[0] === 10 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  } else if (ipType === 6) {
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

function validateRemoteUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isUsablePayload(status: number, body: string): boolean {
  if (status < 200 || status >= 300) return false;
  const trimmed = body.trim();
  if (!trimmed) return false;
  if (/^errer\b/i.test(trimmed)) return false;
  if (/^<!doctype\s+html|^<html/i.test(trimmed)) return false;
  return true;
}

async function fetchXtreamWithCoalescing(target: URL): Promise<CachedResponse> {
  const urlStr = target.toString();

  const fresh = readCached(urlStr, FRESH_CACHE_TTL_MS);
  if (fresh) {
    return fresh;
  }

  const existing = inFlightRequests.get(urlStr);
  if (existing) {
    return existing;
  }

  const task = (async (): Promise<CachedResponse> => {
    try {
      return await runHostPaced(target.host, async () => {
        const freshAfterWait = readCached(urlStr, FRESH_CACHE_TTL_MS);
        if (freshAfterWait) return freshAfterWait;

        let lastStatus = 502;
        let lastBody = '';
        let lastCt = 'application/json; charset=utf-8';

        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) {
            await waitMs(1200);
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 35000);
          try {
            const upstream = await fetch(urlStr, {
              headers: {
                'User-Agent': BROWSER_UA,
                Accept: 'application/json, text/plain, */*',
              },
              redirect: 'follow',
              signal: controller.signal,
            });
            lastStatus = upstream.status;
            lastCt = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
            lastBody = await upstream.text();

            if (isUsablePayload(lastStatus, lastBody)) {
              const entry: CachedResponse = {
                status: lastStatus,
                contentType: lastCt,
                body: lastBody,
                fetchedAt: Date.now(),
              };
              writeCached(urlStr, entry);
              return entry;
            }

            if (lastStatus !== 429 && lastStatus < 500) {
              break;
            }
          } finally {
            clearTimeout(timer);
          }
        }

        const stale = readCached(urlStr, STALE_CACHE_TTL_MS);
        if (stale) {
          return stale;
        }

        return {
          status: lastStatus,
          contentType: lastCt,
          body: lastBody,
          fetchedAt: Date.now(),
        };
      });
    } catch (err) {
      const stale = readCached(urlStr, STALE_CACHE_TTL_MS);
      if (stale) {
        return stale;
      }
      throw err;
    } finally {
      inFlightRequests.delete(urlStr);
    }
  })();

  inFlightRequests.set(urlStr, task);
  return task;
}

function rewriteM3U8(content: string, finalPlaylistUrl: string): string {
  const toProxyUrl = (rawRef: string): string => {
    try {
      const abs = new URL(rawRef, finalPlaylistUrl).toString();
      return `/api/stream?url=${encodeURIComponent(abs)}`;
    } catch {
      return rawRef;
    }
  };

  return content
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_m, uri: string) => {
          return `URI="${toProxyUrl(uri)}"`;
        });
      }
      return toProxyUrl(trimmed);
    })
    .join('\n');
}

async function startServer() {
  const app = express();

  app.use((req: Request, res: Response, next) => {
    if (req.path.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  });

  // وسيط جلب بيانات Xtream وقوائم M3U مع تخزين مؤقت ومنع ضغط 429
  app.get('/api/xtream', async (req: Request, res: Response) => {
    const target = validateRemoteUrl(req.query.url);
    if (!target) {
      res.status(400).json({ error: 'Invalid or disallowed target URL' });
      return;
    }

    try {
      const result = await fetchXtreamWithCoalescing(target);
      res.status(result.status);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.send(result.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upstream fetch failed';
      res.status(502).json({ error: msg });
    }
  });

  // وسيط تشغيل البث المباشر (HLS M3U8 + TS + MP4) مع إعادة كتابة روابط قوائم التشغيل
  app.get('/api/stream', async (req: Request, res: Response) => {
    const target = validateRemoteUrl(req.query.url);
    if (!target) {
      res.status(400).json({ error: 'Invalid or disallowed stream URL' });
      return;
    }

    const controller = new AbortController();
    const connectTimer = setTimeout(() => controller.abort(), 25000);
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const forwardHeaders: Record<string, string> = {
        'User-Agent': BROWSER_UA,
        Accept: '*/*',
      };
      if (typeof req.headers.range === 'string') {
        forwardHeaders.Range = req.headers.range;
      }

      const upstream = await fetch(target.toString(), {
        headers: forwardHeaders,
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(connectTimer);

      const contentType = upstream.headers.get('content-type') || '';
      const finalUrl = upstream.url || target.toString();
      const isPlaylist =
        /mpegurl/i.test(contentType) || /\.m3u8?(\?|$)/i.test(finalUrl);

      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }

      if (isPlaylist) {
        const text = await upstream.text();
        const rewritten = rewriteM3U8(text, finalUrl);
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(rewritten);
        return;
      }

      res.status(upstream.status);
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      } else if (/\.ts(\?|$)/i.test(finalUrl)) {
        res.setHeader('Content-Type', 'video/mp2t');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      res.setHeader('Cache-Control', 'no-store');

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as Parameters<typeof Readable.fromWeb>[0]
      );
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502);
        res.end();
      });
      nodeStream.pipe(res);
    } catch (err) {
      clearTimeout(connectTimer);
      if (!res.headersSent) {
        const msg = err instanceof Error ? err.message : 'Stream proxy error';
        res.status(502).json({ error: msg });
      } else {
        res.end();
      }
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
