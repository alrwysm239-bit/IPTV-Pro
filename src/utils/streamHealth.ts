import Hls from 'hls.js';
import { FETCH_TIMEOUT_MS } from '../constants/sources';
import { Channel, HealthStatus } from '../types/iptv';

// طابور تحميل الشعارات: حد أقصى 40 صورة متزامنة لتحقيق أقصى سلاسة
const MAX_CONCURRENT_LOGOS = 40;
let activeLogoLoads = 0;
const logoQueue: Array<() => void> = [];

export function acquireLogoSlot(): Promise<void> {
  if (activeLogoLoads < MAX_CONCURRENT_LOGOS) {
    activeLogoLoads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    logoQueue.push(() => {
      activeLogoLoads++;
      resolve();
    });
  });
}

export function releaseLogoSlot(): void {
  activeLogoLoads = Math.max(0, activeLogoLoads - 1);
  const next = logoQueue.shift();
  if (next) next();
}

// التحقق الحقيقي من اتصال الإنترنت قبل تسجيل أي فشل أو حذف
export async function checkInternetConnected(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const ping = async (target: string): Promise<boolean> => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 3500);
    try {
      await fetch(target, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(t);
    }
  };
  if (await ping('https://www.gstatic.com/generate_204')) return true;
  if (await ping('https://1.1.1.1/cdn-cgi/trace')) return true;
  return false;
}

// التحقق من اتصال واي فاي عند تفعيل خيار توفير البيانات قبل الفحص التلقائي
export function isWifiAllowedForAutoScan(dataSaver: boolean): boolean {
  if (!dataSaver) return true;
  const nav = navigator as Navigator & {
    connection?: { type?: string; saveData?: boolean };
    mozConnection?: { type?: string; saveData?: boolean };
    webkitConnection?: { type?: string; saveData?: boolean };
  };
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return true;
  if (conn.saveData) return false;
  if (conn.type && conn.type !== 'wifi' && conn.type !== 'ethernet') return false;
  return true;
}

// جلب مصدر M3U مع مهلة 15 ثانية وتجربة الوسيط البديل عند حظر CORS
export async function fetchM3UText(
  url: string,
  corsProxy: string
): Promise<{ text: string; usedProxy: boolean }> {
  const tryFetch = async (targetUrl: string): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        cache: 'no-cache',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const text = await tryFetch(url);
    return { text, usedProxy: false };
  } catch (directErr) {
    if (!corsProxy) throw directErr;
    const proxiedUrl = `${corsProxy}${encodeURIComponent(url)}`;
    const text = await tryFetch(proxiedUrl);
    return { text, usedProxy: true };
  }
}

export interface UrlCheckResult {
  status: Exclude<HealthStatus, 'untested' | 'checking'>;
  latencyMs: number;
}

const STREAM_TIMEOUT_MS = 8000; // مهلة 8 ثوانٍ لكل محاولة

// Web Worker لفحص روابط HLS في الخلفية دون إبطاء الواجهة
const HEALTH_WORKER_CODE = `
  function extractFirstHlsTarget(txt, base) {
    const lines = txt.split(/\\r?\\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || l.startsWith('#')) continue;
      try { return new URL(l, base).href; } catch { return l; }
    }
    return null;
  }

  self.onmessage = async function(ev) {
    const { id, url, dataSaver, timeoutMs } = ev.data;
    const start = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (res.status === 404 || res.status === 403 || res.status >= 500 || !res.ok) {
        self.postMessage({ id, status: 'dead', latencyMs: Math.round(performance.now() - start) });
        return;
      }
      const txt = (await res.text()).trim();
      if (!txt.startsWith('#EXTM3U')) {
        self.postMessage({ id, status: 'dead', latencyMs: Math.round(performance.now() - start) });
        return;
      }
      const firstTarget = extractFirstHlsTarget(txt, url);
      if (!firstTarget) {
        self.postMessage({ id, status: 'dead', latencyMs: Math.round(performance.now() - start) });
        return;
      }
      if (dataSaver) {
        self.postMessage({ id, status: 'online', latencyMs: Math.round(performance.now() - start) });
        return;
      }
      const segRes = await fetch(firstTarget, {
        signal: ctrl.signal,
        headers: { Range: 'bytes=0-1023' },
        cache: 'no-store'
      });
      if (segRes.status === 404 || segRes.status === 403 || segRes.status >= 500) {
        self.postMessage({ id, status: 'dead', latencyMs: Math.round(performance.now() - start) });
        return;
      }
      self.postMessage({
        id,
        status: (segRes.ok || segRes.status === 206) ? 'online' : 'dead',
        latencyMs: Math.round(performance.now() - start)
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        self.postMessage({ id, status: 'dead', latencyMs: timeoutMs || 8000 });
      } else {
        self.postMessage({ id, status: 'uncertain', latencyMs: Math.round(performance.now() - start) });
      }
    } finally {
      clearTimeout(timer);
    }
  };
`;

class HealthWorkerClient {
  private worker: Worker | null = null;
  private blobUrl: string | null = null;
  private seq = 0;
  private pending = new Map<number, (r: UrlCheckResult) => void>();

  private ensureWorker(): Worker | null {
    if (typeof Worker === 'undefined') return null;
    if (this.worker) return this.worker;
    try {
      const blob = new Blob([HEALTH_WORKER_CODE], { type: 'application/javascript' });
      this.blobUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.blobUrl);
      this.worker.onmessage = (ev) => {
        const { id, status, latencyMs } = ev.data || {};
        const resolver = this.pending.get(id);
        if (resolver) {
          this.pending.delete(id);
          resolver({ status, latencyMs });
        }
      };
      this.worker.onerror = () => {
        this.pending.forEach((res) => res({ status: 'uncertain', latencyMs: 0 }));
        this.pending.clear();
      };
      return this.worker;
    } catch {
      return null;
    }
  }

  probeHls(url: string, dataSaver: boolean, signal?: AbortSignal): Promise<UrlCheckResult> {
    const w = this.ensureWorker();
    if (!w) return probeHlsDirect(url, dataSaver, signal);

    return new Promise((resolve) => {
      const id = ++this.seq;
      const onAbort = () => {
        this.pending.delete(id);
        resolve({ status: 'uncertain', latencyMs: 0 });
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, (result) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(result);
      });
      w.postMessage({ id, url, dataSaver, timeoutMs: STREAM_TIMEOUT_MS });
    });
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    this.pending.clear();
  }
}

const healthWorker = new HealthWorkerClient();

function extractFirstHlsTarget(playlistText: string, baseUrl: string): string | null {
  const lines = playlistText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    try {
      return new URL(line, baseUrl).href;
    } catch {
      return line;
    }
  }
  return null;
}

// فحص احتياطي مباشر إذا لم يتوفر Worker
async function probeHlsDirect(
  url: string,
  dataSaver: boolean,
  signal?: AbortSignal
): Promise<UrlCheckResult> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (res.status === 404 || res.status === 403 || res.status >= 500 || !res.ok) {
      return { status: 'dead', latencyMs: Math.round(performance.now() - start) };
    }
    const text = (await res.text()).trim();
    if (!text.startsWith('#EXTM3U')) {
      return { status: 'dead', latencyMs: Math.round(performance.now() - start) };
    }
    const firstTarget = extractFirstHlsTarget(text, url);
    if (!firstTarget) {
      return { status: 'dead', latencyMs: Math.round(performance.now() - start) };
    }
    if (dataSaver) {
      return { status: 'online', latencyMs: Math.round(performance.now() - start) };
    }
    const segRes = await fetch(firstTarget, {
      signal: controller.signal,
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store',
    });
    if (segRes.status === 404 || segRes.status === 403 || segRes.status >= 500) {
      return { status: 'dead', latencyMs: Math.round(performance.now() - start) };
    }
    return {
      status: segRes.ok || segRes.status === 206 ? 'online' : 'dead',
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return { status: 'dead', latencyMs: STREAM_TIMEOUT_MS };
    }
    return { status: 'uncertain', latencyMs: Math.round(performance.now() - start) };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// فحص رابط عبر عنصر video مخفي (MP4/TS أو HLS fallback) مع تنظيف كامل للذاكرة (src='' ثم load())
function probeViaHiddenVideo(url: string, dataSaver: boolean): Promise<UrlCheckResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;';
    document.body.appendChild(video);

    let settled = false;
    let hls: Hls | null = null;
    const isHlsUrl = /\.m3u8(\?|$)/i.test(url) || url.toLowerCase().includes('m3u8');

    const cleanup = () => {
      if (hls) {
        try {
          hls.destroy();
        } catch {
          // تجاهل
        }
        hls = null;
      }
      try {
        video.pause();
        video.src = '';
        video.removeAttribute('src');
        video.load();
        video.remove();
      } catch {
        // تجاهل
      }
    };

    const finish = (status: UrlCheckResult['status']) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - start);
      cleanup();
      resolve({ status, latencyMs });
    };

    const timer = window.setTimeout(() => {
      finish('dead');
    }, STREAM_TIMEOUT_MS);

    if (isHlsUrl && Hls.isSupported()) {
      let manifestOk = false;
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: dataSaver ? 2 : 5,
        maxMaxBufferLength: dataSaver ? 4 : 8,
        manifestLoadingTimeOut: STREAM_TIMEOUT_MS - 500,
        fragLoadingTimeOut: STREAM_TIMEOUT_MS - 500,
        manifestLoadingMaxRetry: 0,
        levelLoadingMaxRetry: 0,
        fragLoadingMaxRetry: 0,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        manifestOk = true;
        if (dataSaver) finish('online');
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        finish('online');
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        const code = (data.response as { code?: number } | undefined)?.code;
        if (code === 404 || code === 403 || (code && code >= 500)) {
          finish('dead');
          return;
        }
        if (code === 0 && !manifestOk) {
          finish('uncertain');
          return;
        }
        finish(manifestOk ? 'uncertain' : 'dead');
      });

      try {
        hls.loadSource(url);
        hls.attachMedia(video);
      } catch {
        finish('dead');
      }
      return;
    }

    const onOk = () => finish('online');
    const onErr = () => finish('dead');

    video.addEventListener('loadedmetadata', onOk, { once: true });
    video.addEventListener('canplay', onOk, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.src = url;
    try {
      video.load();
    } catch {
      finish('dead');
    }
  });
}

// فحص رابط واحد مع إعادة المحاولة مرة واحدة قبل الحكم بالموت
async function checkUrlWithRetry(
  url: string,
  dataSaver: boolean,
  signal?: AbortSignal
): Promise<UrlCheckResult> {
  const isHls = /\.m3u8(\?|$)/i.test(url) || url.toLowerCase().includes('m3u8');

  const singleAttempt = async (): Promise<UrlCheckResult> => {
    if (signal?.aborted) return { status: 'uncertain', latencyMs: 0 };
    if (isHls) {
      const workerAttempt = await healthWorker.probeHls(url, dataSaver, signal);
      if (workerAttempt.status === 'online') return workerAttempt;
      if (workerAttempt.status === 'uncertain') {
        const videoAttempt = await probeViaHiddenVideo(url, dataSaver);
        return videoAttempt.status === 'dead'
          ? { status: 'uncertain', latencyMs: videoAttempt.latencyMs }
          : videoAttempt;
      }
      return workerAttempt;
    } else {
      const videoAttempt = await probeViaHiddenVideo(url, dataSaver);
      if (videoAttempt.status === 'online') return videoAttempt;
      try {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
        window.clearTimeout(t);
        if (res.status === 404 || res.status === 403 || res.status >= 500) {
          return { status: 'dead', latencyMs: videoAttempt.latencyMs };
        }
        return res.ok
          ? { status: 'online', latencyMs: videoAttempt.latencyMs }
          : { status: 'dead', latencyMs: videoAttempt.latencyMs };
      } catch {
        return videoAttempt.status === 'dead'
          ? { status: 'dead', latencyMs: videoAttempt.latencyMs }
          : { status: 'uncertain', latencyMs: videoAttempt.latencyMs };
      }
    }
  };

  const first = await singleAttempt();
  if (first.status === 'online' || first.status === 'uncertain' || signal?.aborted) {
    return first;
  }
  return await singleAttempt();
}

export interface ChannelCheckOutcome {
  channelId: string;
  status: Exclude<HealthStatus, 'untested' | 'checking'>;
  latencyMs: number;
  lastCheckedAt: number;
  survivingUrl: string;
  survivingFallbacks: string[];
  removedUrls: string[];
}

// فحص قناة واحدة مع اختبار الروابط البديلة وإزالة الميت منها فقط
export async function checkChannelWithFallbacks(
  channel: Channel,
  dataSaver: boolean,
  signal?: AbortSignal
): Promise<ChannelCheckOutcome> {
  const candidates = [channel.url, ...(channel.fallbacks || [])].filter(Boolean);
  const working: string[] = [];
  const uncertain: string[] = [];
  const dead: string[] = [];
  let bestLatency = 0;

  for (let i = 0; i < candidates.length; i++) {
    if (signal?.aborted) break;
    const u = candidates[i];
    const res = await checkUrlWithRetry(u, dataSaver, signal);
    if (res.status === 'online') {
      working.push(u);
      if (!bestLatency || res.latencyMs < bestLatency) bestLatency = res.latencyMs;
      break;
    } else if (res.status === 'uncertain') {
      uncertain.push(u);
      if (!bestLatency) bestLatency = res.latencyMs;
    } else {
      dead.push(u);
      if (!bestLatency) bestLatency = res.latencyMs;
    }
  }

  const testedCount = working.length + uncertain.length + dead.length;
  const untouched = candidates.slice(testedCount);
  const surviving = [...working, ...uncertain, ...untouched];
  const finalStatus: ChannelCheckOutcome['status'] =
    working.length > 0 ? 'online' : uncertain.length > 0 ? 'uncertain' : 'dead';

  return {
    channelId: channel.id,
    status: finalStatus,
    latencyMs: bestLatency,
    lastCheckedAt: Date.now(),
    survivingUrl: surviving[0] || channel.url,
    survivingFallbacks: surviving.slice(1),
    removedUrls: dead,
  };
}

// فحص مجموعة قنوات بمجمع متوازٍ (Pool من 5 إلى 40، الافتراضي 15) مع دعم الإيقاف المؤقت والإلغاء
export async function runHealthCheckPool(opts: {
  channels: Channel[];
  poolSize: number;
  dataSaver: boolean;
  isPaused: () => boolean;
  signal: AbortSignal;
  onChannelStart: (channelId: string) => void;
  onChannelDone: (outcome: ChannelCheckOutcome) => void;
}): Promise<void> {
  const { channels, poolSize, dataSaver, isPaused, signal, onChannelStart, onChannelDone } = opts;
  const clampedPool = Math.max(5, Math.min(40, poolSize || 15));
  let idx = 0;

  const waitIfPaused = async () => {
    while (isPaused() && !signal.aborted) {
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const worker = async () => {
    while (idx < channels.length) {
      if (signal.aborted) return;
      await waitIfPaused();
      if (signal.aborted) return;

      const current = channels[idx++];
      if (!current) continue;
      onChannelStart(current.id);
      const outcome = await checkChannelWithFallbacks(current, dataSaver, signal);
      if (signal.aborted) return;
      onChannelDone(outcome);
    }
  };

  const workers = Array.from(
    { length: Math.min(clampedPool, Math.max(1, channels.length)) },
    () => worker()
  );
  await Promise.all(workers);
}

// تصدير القنوات الشغالة كملف M3U نظيف
export function buildCleanM3U(channels: Channel[]): string {
  const lines = ['#EXTM3U'];
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const safeName = c.name.replace(/[\r\n]/g, ' ');
    const safeLogo = (c.logo || '').replace(/"/g, '');
    const safeGroup = (c.group || 'Variety').replace(/"/g, '');
    const safeId = (c.tvgId || '').replace(/"/g, '');
    lines.push(
      `#EXTINF:-1 tvg-id="${safeId}" tvg-logo="${safeLogo}" group-title="${safeGroup}",${safeName}`
    );
    lines.push(c.url);
  }
  return lines.join('\n');
}
