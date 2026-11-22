import { AppSettings, CategoryId, M3USource } from '../types/iptv';

// المصادر الـ 11 المدمجة افتراضياً
export const DEFAULT_SOURCES: M3USource[] = [
  {
    id: 'src_iptv_org',
    name: 'IPTV-Org العالمي',
    url: 'https://iptv-org.github.io/iptv/index.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_hunter_38a8',
    name: 'باقة Hunter 38A8',
    url: 'https://raw.githubusercontent.com/mesbahikarim10-source/hot-dodo/main/FIW_1795379754_1_ebfb23_Hunter_38A8.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_hunter_ce50',
    name: 'باقة Hunter CE50',
    url: 'https://raw.githubusercontent.com/mesbahikarim10-source/hot-dodo/main/FIW_1795379806_1_f1d2eb_Hunter_CE50.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_hunter_5780',
    name: 'باقة Hunter 5780',
    url: 'https://raw.githubusercontent.com/mesbahikarim10-source/hot-dodo/main/FIW_1795379822_2_f24022_Hunter_5780.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_hunter_9c87',
    name: 'باقة Hunter 9C87',
    url: 'https://raw.githubusercontent.com/mesbahikarim10-source/hot-dodo/main/FIW_1795379821_2_064819_Hunter_9C87.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_hunter_9ce5',
    name: 'باقة Hunter 9CE5',
    url: 'https://raw.githubusercontent.com/mesbahikarim10-source/hot-dodo/main/FIW_1795379919_1_64443e_Hunter_9CE5.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_hunter_a7ff',
    name: 'باقة Hunter A7FF',
    url: 'https://raw.githubusercontent.com/mesbahikarim10-source/hot-dodo/main/FIW_1795379924_2_05c5bf_Hunter_A7FF.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_uguu_1',
    name: 'مصدر Uguu 1',
    url: 'https://n.uguu.se/sqhMXmUYeLUc.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_uguu_2',
    name: 'مصدر Uguu 2',
    url: 'https://d.uguu.se/EcTmanQPjxhm.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_hunter_ea0b',
    name: 'باقة Hunter EA0B',
    url: 'https://raw.githubusercontent.com/mesbahikarim10-source/hot-dodo/main/FIW_1795379951_1_cf9570_Hunter_EA0B.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'src_uguu_3',
    name: 'مصدر Uguu 3',
    url: 'https://n.uguu.se/dnfDPzwOrTHb.m3u',
    enabled: true,
    custom: false,
    channelCount: 0,
    status: 'idle',
  },
];

export const CORS_PROXY_PRESETS = [
  { label: 'CorsProxy.io (سريع)', value: 'https://corsproxy.io/?' },
  { label: 'AllOrigins Raw', value: 'https://api.allorigins.win/raw?url=' },
  { label: 'بدون وسيط (APK / WebView)', value: '' },
];

export const CATEGORIES: { id: CategoryId; ar: string; en: string }[] = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'sports', ar: 'رياضة', en: 'Sports' },
  { id: 'news', ar: 'أخبار', en: 'News' },
  { id: 'movies', ar: 'أفلام', en: 'Movies' },
  { id: 'kids', ar: 'أطفال', en: 'Kids' },
  { id: 'music', ar: 'موسيقى', en: 'Music' },
  { id: 'docs', ar: 'وثائقي', en: 'Docs' },
  { id: 'variety', ar: 'منوعة', en: 'Variety' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'ar',
  themeAccent: 'cyan-violet',
  defaultQuality: 'auto',
  bufferLevel: 'medium',
  backgroundAudio: true,
  pipEnabled: true,
  dataSaver: false,
  corsProxy: 'https://corsproxy.io/?',
  pinEnabled: false,
  pinCode: '0000',
  hideOffline: false,
  onlineOnlyFilter: false,
  healthPoolSize: 15,
  autoScanIntervalHours: 24,
  autoDeleteDead: true,
  lastHealthCheckAt: null,
  lastChannelId: null,
  volume: 0.9,
};

export const TELEGRAM_URL = 'https://t.me/qweqwe2019bot2bot';
export const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 ساعة
export const HEALTH_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 ساعة لنتائج الفحص
export const ONE_HOUR_MS = 60 * 60 * 1000; // ساعة واحدة كفاصل بين أخطاء التشغيل
export const FETCH_TIMEOUT_MS = 15000; // 15 ثانية لكل مصدر
