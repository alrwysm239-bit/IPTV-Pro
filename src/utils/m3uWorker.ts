// Web Worker داخلي لتحليل ملفات M3U بسرعة فائقة دون تجميد الواجهة
const WORKER_SCRIPT = `
const COUNTRY_MAP = {
  sa: 'السعودية', ksa: 'السعودية', eg: 'مصر', egypt: 'مصر', ae: 'الإمارات', uae: 'الإمارات',
  qa: 'قطر', kw: 'الكويت', bh: 'البحرين', om: 'عُمان', jo: 'الأردن', lb: 'لبنان',
  sy: 'سوريا', iq: 'العراق', ma: 'المغرب', dz: 'الجزائر', tn: 'تونس', ly: 'ليبيا',
  sd: 'السودان', ye: 'اليمن', ps: 'فلسطين', uk: 'بريطانيا', gb: 'بريطانيا',
  us: 'أمريكا', usa: 'أمريكا', fr: 'فرنسا', de: 'ألمانيا', tr: 'تركيا',
  es: 'إسبانيا', it: 'إيطاليا', ru: 'روسيا', in: 'الهند', pk: 'باكستان'
};

const ARABIC_KEYWORDS = [
  'arab', 'arabic', 'bein', 'mbc', 'rotana', 'jazeera', 'alarabiya', 'sky news arabia',
  'nile', 'dmc', 'cbc', 'ontv', 'alhayat', 'maspero', 'ssc', 'alkass', 'dubai', 'abudhabi',
  'abu dhabi', 'sharjah', 'qatar', 'kuwait', 'saudi', 'aloula', 'iqraa', 'spacetoon',
  'majid', 'osn', 'shahid', 'art ', 'lbc', 'mtv lebanon', 'aljadeed', 'roya', 'alghad',
  'asharq', 'samira', 'ennahar', 'echorouk', 'nessma', 'elhiwar', '2m', 'al aoula', 'arriadia'
];

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\\b(hd|fhd|uhd|4k|sd|1080p|720p|480p|hevc|h265|vip|backup|live|tv|channel)\\b/gi, '')
    .replace(/[\\u064B-\\u065F\\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[^a-z0-9\\u0600-\\u06FF]/g, '');
}

function detectCategory(group, name) {
  const s = (group + ' ' + name).toLowerCase();
  if (/sport|bein|ssc|kass|arriadia|football|soccer|ufc|wwe|nba|f1|رياض|كأس|دوري/.test(s)) return 'sports';
  if (/news|jazeera|arabiya|bbc|cnn|sky news|france 24|rt |alghad|asharq|أخبار|اخبار|الجزيرة|العربية/.test(s)) return 'news';
  if (/movie|film|cinema|aflam|rotana cinema|mbc 2|mbc max|mbc action|box office|hbo|أفلام|افلام|سينما/.test(s)) return 'movies';
  if (/kid|cartoon|spacetoon|nickelodeon|disney|cn |mbc3|majid|baraem|jeem|أطفال|اطفال|كرتون|سبيستون/.test(s)) return 'kids';
  if (/music|mtv|mazzika|rotana music|aghani|hits|radio|fm|موسيقى|أغاني|طرب/.test(s)) return 'music';
  if (/doc|nat geo|national geographic|discovery|history|animal|science|وثائق|ناشيونال/.test(s)) return 'docs';
  return 'variety';
}

function detectQuality(name, group) {
  const s = (name + ' ' + group).toUpperCase();
  if (s.includes('4K') || s.includes('UHD') || s.includes('2160')) return '4K';
  if (s.includes('FHD') || s.includes('1080')) return 'FHD';
  if (s.includes('HD') || s.includes('720')) return 'HD';
  return 'SD';
}

function inferCountryAndLang(name, group, tvgId, tvgCountry, tvgLang) {
  const hasArabicScript = /[\\u0600-\\u06FF]/.test(name + ' ' + group);
  const lower = (name + ' ' + group + ' ' + tvgId).toLowerCase();
  const isArabicKeyword = ARABIC_KEYWORDS.some(k => lower.includes(k));
  let country = tvgCountry || '';
  if (!country && tvgId && tvgId.includes('.')) {
    const tld = tvgId.split('.').pop().toLowerCase().replace(/[^a-z]/g, '');
    if (COUNTRY_MAP[tld]) country = COUNTRY_MAP[tld];
  }
  if (!country) {
    for (const [code, label] of Object.entries(COUNTRY_MAP)) {
      if (new RegExp('\\\\b' + code + '\\\\b', 'i').test(lower) || lower.includes(label)) {
        country = label;
        break;
      }
    }
  }
  const arabCountries = ['السعودية','مصر','الإمارات','قطر','الكويت','البحرين','عُمان','الأردن','لبنان','سوريا','العراق','المغرب','الجزائر','تونس','ليبيا','السودان','اليمن','فلسطين'];
  const isArabCountry = arabCountries.includes(country);
  const isArabic = hasArabicScript || isArabicKeyword || isArabCountry || (tvgLang && tvgLang.toLowerCase().includes('arab'));
  if (!country) country = isArabic ? 'عربي' : 'دولي';
  const language = tvgLang || (isArabic ? 'العربية' : 'دولية');
  return { country, language, isArabic };
}

function parseAttr(line, attr) {
  const re = new RegExp(attr + '=["\\']([^"\\']*)["\\']', 'i');
  const m = line.match(re);
  return m ? m[1].trim() : '';
}

self.onmessage = function(e) {
  const { text, sourceName, sourceId } = e.data;
  const lines = text.split(/\\r?\\n/);
  const channels = [];
  let currentMeta = null;
  let vlcUa = '';
  let vlcRef = '';
  const now = Date.now();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.lastIndexOf(',');
      const rawName = commaIdx !== -1 ? line.slice(commaIdx + 1).trim() : '';
      const tvgName = parseAttr(line, 'tvg-name');
      const name = rawName || tvgName || 'قناة بث مباشر';
      const tvgId = parseAttr(line, 'tvg-id');
      const logo = parseAttr(line, 'tvg-logo');
      const group = parseAttr(line, 'group-title') || 'منوعة';
      const tvgCountry = parseAttr(line, 'tvg-country');
      const tvgLang = parseAttr(line, 'tvg-language');
      currentMeta = { name, tvgId, logo, group, tvgCountry, tvgLang };
      vlcUa = '';
      vlcRef = '';
    } else if (line.startsWith('#EXTVLCOPT:')) {
      const opt = line.slice(11);
      if (opt.toLowerCase().startsWith('http-user-agent=')) {
        vlcUa = opt.slice(16).trim();
      } else if (opt.toLowerCase().startsWith('http-referrer=')) {
        vlcRef = opt.slice(14).trim();
      }
    } else if (!line.startsWith('#')) {
      let cleanUrl = line;
      let userAgent = vlcUa;
      let referer = vlcRef;

      const pipeIdx = line.indexOf('|');
      if (pipeIdx !== -1) {
        cleanUrl = line.slice(0, pipeIdx).trim();
        const params = line.slice(pipeIdx + 1);
        const uaMatch = params.match(/User-Agent=([^&]+)/i);
        const refMatch = params.match(/Referer=([^&]+)/i);
        if (uaMatch) userAgent = decodeURIComponent(uaMatch[1]);
        if (refMatch) referer = decodeURIComponent(refMatch[1]);
      }

      if (/^https?:\\/\\//i.test(cleanUrl)) {
        const meta = currentMeta || { name: 'قناة غير مسماة', tvgId: '', logo: '', group: 'منوعة', tvgCountry: '', tvgLang: '' };
        const normName = normalizeName(meta.name) || cleanUrl;
        const { country, language, isArabic } = inferCountryAndLang(meta.name, meta.group, meta.tvgId, meta.tvgCountry, meta.tvgLang);
        const category = detectCategory(meta.group, meta.name);
        const quality = detectQuality(meta.name, meta.group);

        channels.push({
          id: sourceId + '_' + i,
          name: meta.name,
          normName,
          url: cleanUrl,
          fallbacks: [],
          logo: meta.logo,
          group: meta.group,
          category,
          country,
          language,
          isArabic,
          quality,
          tvgId: meta.tvgId,
          source: sourceName,
          sources: [sourceName],
          userAgent: userAgent || undefined,
          referer: referer || undefined,
          addedAt: now,
          watchCount: 0
        });
      }
      currentMeta = null;
      vlcUa = '';
      vlcRef = '';
    }
  }

  self.postMessage({ sourceId, sourceName, channels });
};
`;

export function parseM3UInWorker(
  text: string,
  sourceId: string,
  sourceName: string
): Promise<import('../types/iptv').Channel[]> {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        const channels = e.data?.channels || [];
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        resolve(channels);
      };

      worker.onerror = (err) => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        reject(err);
      };

      worker.postMessage({ text, sourceId, sourceName });
    } catch (err) {
      reject(err);
    }
  });
}

// دمج القنوات وإزالة التكرار مع الاحتفاظ بروابط بديلة وترتيب العربي أولاً
export function mergeAndDeduplicateChannels(
  existing: import('../types/iptv').Channel[],
  incoming: import('../types/iptv').Channel[]
): import('../types/iptv').Channel[] {
  const byUrl = new Map<string, import('../types/iptv').Channel>();
  const byNormName = new Map<string, import('../types/iptv').Channel>();
  const result: import('../types/iptv').Channel[] = [];

  const insert = (ch: import('../types/iptv').Channel) => {
    const cleanUrl = ch.url.trim();
    if (byUrl.has(cleanUrl)) {
      const prev = byUrl.get(cleanUrl)!;
      if (!prev.sources.includes(ch.source)) {
        prev.sources.push(ch.source);
      }
      return;
    }

    if (ch.normName && ch.normName.length >= 2 && byNormName.has(ch.normName)) {
      const prev = byNormName.get(ch.normName)!;
      if (prev.url !== cleanUrl && !prev.fallbacks.includes(cleanUrl)) {
        prev.fallbacks.push(cleanUrl);
      }
      if (!prev.logo && ch.logo) prev.logo = ch.logo;
      if (!prev.sources.includes(ch.source)) prev.sources.push(ch.source);
      byUrl.set(cleanUrl, prev);
      return;
    }

    const clone: import('../types/iptv').Channel = {
      ...ch,
      fallbacks: [...(ch.fallbacks || [])],
      sources: [...(ch.sources || [ch.source])],
    };
    byUrl.set(cleanUrl, clone);
    if (clone.normName && clone.normName.length >= 2) {
      byNormName.set(clone.normName, clone);
    }
    result.push(clone);
  };

  for (let i = 0; i < existing.length; i++) insert(existing[i]);
  for (let i = 0; i < incoming.length; i++) insert(incoming[i]);

  // ترتيب: العربي أولاً ثم الباقي
  result.sort((a, b) => {
    if (a.isArabic !== b.isArabic) return a.isArabic ? -1 : 1;
    return 0;
  });

  return result;
}
