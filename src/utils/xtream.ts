import {
  CategoryId,
  Channel,
  QualityTier,
  XtreamCategory,
  XtreamSource,
  XtreamUserInfo,
} from '../types/iptv';

interface XtreamRawStream {
  num?: number;
  name?: string;
  stream_display_name?: string;
  stream_type?: string;
  stream_id?: number | string;
  stream_icon?: string;
  epg_channel_id?: string;
  added?: string | number;
  category_id?: string | number;
  container_extension?: string;
}

const XTREAM_TIMEOUT_MS = 45000;

function inferCategoryFromGroup(groupName: string, streamName: string): Exclude<CategoryId, 'all'> {
  const txt = `${groupName} ${streamName}`.toUpperCase();
  if (/SPORT|BEIN|SSC|KASS|ALKASS|AD SPORT|ON TIME|ARRIADIA|FOOT/.test(txt)) return 'sports';
  if (/NEWS|ALJAZEERA|ARABIYA|HADATH|SKY NEWS|BBC|CNN|FRANCE 24|TRT/.test(txt)) return 'news';
  if (/MOVIE|DRAMA|FILM|CINEMA|SHAHID|OSN|ROTANA|MBC|SERIE|ART|AFLEM|HIKAYAT|ONDEMAND/.test(txt)) {
    return 'movies';
  }
  if (/CARTOON|KIDS|SPACETOON|TOYOR|NICK|DISNEY|MBC3|BARAEM|MAJID|ATFAL/.test(txt)) return 'kids';
  if (/ISLAM|QURAN|SUNNAH|MAKKAH|MADINAH|IQRA|RESALAH|RELIG/.test(txt)) return 'religious';
  if (/MUSIC|MUSIQUE|AGHANI|MAZZIKA|TARAB|GHAZAL/.test(txt)) return 'music';
  if (/DOC|GEO|NAT GEO|DISCOVERY|JAZEERA DOC|HISTORY/.test(txt)) return 'docs';
  return 'variety';
}

function inferCountryFromGroup(groupName: string): string {
  const g = groupName.toUpperCase();
  if (/SAUDI|\bKSA\b|السعودية/.test(g)) return 'السعودية';
  if (/\bUAE\b|EMIRAT|DUBAI|ABU DHABI|الإمارات/.test(g)) return 'الإمارات';
  if (/QATAR|ALKASS|قطر/.test(g)) return 'قطر';
  if (/KUWAIT|الكويت/.test(g)) return 'الكويت';
  if (/IRAQ|العراق/.test(g)) return 'العراق';
  if (/JORDAN|الأردن/.test(g)) return 'الأردن';
  if (/EGYPT|مصر/.test(g)) return 'مصر';
  if (/MAROC|MOROCCO|المغرب/.test(g)) return 'المغرب';
  if (/ALGERI|الجزائر/.test(g)) return 'الجزائر';
  if (/TUNIS|\bTN\b|تونس/.test(g)) return 'تونس';
  if (/LEBANON|LIBAN|لبنان/.test(g)) return 'لبنان';
  if (/SYRIA|سوريا/.test(g)) return 'سوريا';
  if (/TURK|تركيا/.test(g)) return 'تركيا';
  if (/FRANCE|فرنسا/.test(g)) return 'فرنسا';
  if (/\bUK\b|UNITED KINGDOM|BRITAIN/.test(g)) return 'بريطانيا';
  if (/\bUSA\b|\bUS\b|AMERICA/.test(g)) return 'أمريكا';
  if (/KING|SHAHID|MBC|BEIN|SPORT ARAB|ARAB|عرب/.test(g)) return 'عربية';
  return 'متنوعة';
}

function inferQualityFromName(name: string, groupName: string): QualityTier {
  const s = `${name} ${groupName}`.toUpperCase();
  if (/\b4K\b|\bUHD\b|2160/.test(s)) return '4K';
  if (/\bFHD\b|1080|HEVC|H265/.test(s)) return 'FHD';
  if (/\bHD\b|720/.test(s)) return 'HD';
  return 'HD';
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchJsonWithTimeout<T>(url: string, externalSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), XTREAM_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<') || /^errer\b/i.test(trimmed)) {
      throw new Error('Non-JSON response');
    }
    return JSON.parse(trimmed) as T;
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function fetchXtreamApi<T>(
  source: XtreamSource,
  action: string,
  corsProxy: string,
  signal?: AbortSignal
): Promise<{ data: T; usedProxy: boolean }> {
  const base = source.server.trim().replace(/\/+$/, '');
  const params = new URLSearchParams({
    username: source.username.trim(),
    password: source.password.trim(),
  });
  if (action) {
    params.set('action', action);
  }
  const targetUrl = `${base}/player_api.php?${params.toString()}`;
  const localProxyUrl = `/api/xtream?url=${encodeURIComponent(targetUrl)}`;

  // 1. المحاولة عبر الوسيط المدمج (/api/xtream) — يعمل في الويب وفي APK بدون قيود CORS/Mixed Content
  try {
    const data = await fetchJsonWithTimeout<T>(localProxyUrl, signal);
    return { data, usedProxy: false };
  } catch (localErr) {
    if (signal?.aborted) throw localErr;

    // إعادة محاولة واحدة بعد مهلة قصيرة عند ضغط السيرفر (429/502)
    const errMsg = localErr instanceof Error ? localErr.message : '';
    if (errMsg.includes('429') || errMsg.includes('502')) {
      await sleepWithSignal(1200, signal);
      if (!signal?.aborted) {
        try {
          const data = await fetchJsonWithTimeout<T>(localProxyUrl, signal);
          return { data, usedProxy: false };
        } catch {
          // متابعة للمحاولة البديلة
        }
      }
    }

    // 2. المحاولة المباشرة (تعمل إذا كان السيرفر يدعم CORS أو HTTPS)
    try {
      const data = await fetchJsonWithTimeout<T>(targetUrl, signal);
      return { data, usedProxy: false };
    } catch (directErr) {
      if (signal?.aborted) throw directErr;
      // 3. وسيط CORS مخصص إن وُجد
      const customProxies = [corsProxy].filter((p) => p && p.trim().length > 0);
      let lastErr: unknown = localErr || directErr;
      for (const proxy of customProxies) {
        try {
          const proxied = `${proxy}${encodeURIComponent(targetUrl)}`;
          const data = await fetchJsonWithTimeout<T>(proxied, signal);
          return { data, usedProxy: true };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Failed to fetch Xtream API');
    }
  }
}

export interface XtreamFetchResult {
  categories: XtreamCategory[];
  channels: Channel[];
  userInfo: XtreamUserInfo | null;
  usedProxy: boolean;
}

export async function fetchXtreamSourceData(
  source: XtreamSource,
  corsProxy: string,
  signal?: AbortSignal
): Promise<XtreamFetchResult> {
  const base = source.server.trim().replace(/\/+$/, '');
  const user = encodeURIComponent(source.username.trim());
  const pass = encodeURIComponent(source.password.trim());

  // جلب الأقسام ثم القنوات بشكل متسلسل لتجنب حظر 429 من سيرفرات Xtream
  const catsRes = await fetchXtreamApi<XtreamCategory[]>(
    source,
    'get_live_categories',
    corsProxy,
    signal
  );
  await sleepWithSignal(350, signal);
  const streamsRes = await fetchXtreamApi<XtreamRawStream[]>(
    source,
    'get_live_streams',
    corsProxy,
    signal
  );

  let userInfo: XtreamUserInfo | null = null;
  try {
    await sleepWithSignal(350, signal);
    const authRes = await fetchXtreamApi<{ user_info?: XtreamUserInfo }>(source, '', corsProxy, signal);
    if (authRes.data?.user_info) {
      userInfo = authRes.data.user_info;
      if (userInfo.auth === 0) {
        throw new Error('بيانات الاشتراك غير مقبولة من السيرفر');
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('غير مقبولة')) {
      throw err;
    }
  }

  const rawCategories = Array.isArray(catsRes.data) ? catsRes.data : [];
  const rawStreams = Array.isArray(streamsRes.data) ? streamsRes.data : [];

  const allowedSet =
    source.allowedCategoryIds && source.allowedCategoryIds.length > 0
      ? new Set(source.allowedCategoryIds.map(String))
      : null;

  const orderMap = new Map<string, number>();
  source.allowedCategoryIds?.forEach((id, idx) => orderMap.set(String(id), idx));

  const categories = rawCategories
    .map((c) => ({
      category_id: String(c.category_id),
      category_name: String(c.category_name || c.category_id),
      parent_id: c.parent_id,
    }))
    .filter((c) => !allowedSet || allowedSet.has(c.category_id))
    .sort((a, b) => {
      const oa = orderMap.get(a.category_id) ?? 9999;
      const ob = orderMap.get(b.category_id) ?? 9999;
      return oa - ob;
    });

  const catNameById = new Map<string, string>();
  for (const c of categories) {
    catNameById.set(c.category_id, c.category_name);
  }

  const now = Date.now();
  const channels: Channel[] = [];

  for (let i = 0; i < rawStreams.length; i++) {
    const st = rawStreams[i];
    if (st.stream_id === undefined || st.stream_id === null) continue;
    const catId = String(st.category_id ?? '');
    if (allowedSet && !allowedSet.has(catId)) continue;

    const groupName = catNameById.get(catId) || 'قنوات عامة';
    const cleanName = String(st.name || st.stream_display_name || `Channel ${st.stream_id}`).trim();
    const sid = encodeURIComponent(String(st.stream_id));
    const m3u8Url = `${base}/live/${user}/${pass}/${sid}.m3u8`;
    const tsUrl = `${base}/live/${user}/${pass}/${sid}.ts`;
    const ext = String(st.container_extension || '').replace(/^\./, '');
    const extraUrl =
      ext && ext !== 'm3u8' && ext !== 'ts' ? `${base}/live/${user}/${pass}/${sid}.${ext}` : null;

    const fallbacks = extraUrl ? [tsUrl, extraUrl] : [tsUrl];

    channels.push({
      id: `xt_${source.id}_${st.stream_id}`,
      streamId: st.stream_id,
      xtreamCategoryId: catId,
      name: cleanName,
      rawName: cleanName,
      normName: cleanName.toLowerCase(),
      url: m3u8Url,
      fallbacks,
      logo: st.stream_icon ? String(st.stream_icon) : '',
      group: groupName,
      category: inferCategoryFromGroup(groupName, cleanName),
      country: inferCountryFromGroup(groupName),
      language: /FRANCE/i.test(groupName) ? 'الفرنسية' : 'العربية',
      isArabic: !/FRANCE/i.test(groupName),
      quality: inferQualityFromName(cleanName, groupName),
      tvgId: st.epg_channel_id ? String(st.epg_channel_id) : '',
      source: source.name,
      sources: [source.name],
      addedAt: st.added ? Number(st.added) * 1000 || now : now - i,
      watchCount: 0,
      health: 'untested',
    });
  }

  return {
    categories,
    channels,
    userInfo,
    usedProxy: catsRes.usedProxy || streamsRes.usedProxy,
  };
}
