import {
  AppSettings,
  CategoryId,
  M3USource,
  TelegramLink,
  XtreamCategory,
  XtreamSource,
} from '../types/iptv';

// حذف جميع مصادر M3U السابقة بالكامل — التطبيق يعتمد على المصدر المستخرج من السكربت فقط
export const DEFAULT_SOURCES: M3USource[] = [];

// الأقسام الـ 33 المستخرجة من السكربت
export const DEFAULT_XTREAM_CATEGORIES: XtreamCategory[] = [
  { category_id: '76', category_name: 'MUSIC' },
  { category_id: '556', category_name: 'SERIE TN  LIVE' },
  { category_id: '62', category_name: 'MBC MYHD' },
  { category_id: '209', category_name: 'MAROC' },
  { category_id: '51', category_name: 'ALGERIE' },
  { category_id: '13', category_name: 'NEWS' },
  { category_id: '530', category_name: 'DRAMA ARAB' },
  { category_id: '529', category_name: 'MOVIE ARAB' },
  { category_id: '63', category_name: 'EGYPT' },
  { category_id: '83', category_name: 'LEBANON' },
  { category_id: '575', category_name: 'SHAHID' },
  { category_id: '528', category_name: 'KING' },
  { category_id: '52', category_name: 'SPORT ARAB' },
  { category_id: '438', category_name: 'TUNISIE*' },
  { category_id: '439', category_name: 'BEINSPORTS*' },
  { category_id: '441', category_name: 'BEINSPORTS H265*' },
  { category_id: '440', category_name: 'BEIN ENTERTAINMENT*' },
  { category_id: '442', category_name: 'FRANCE*' },
  { category_id: '477', category_name: 'FRANCE H265*' },
  { category_id: '443', category_name: 'CARTOON*' },
  { category_id: '444', category_name: 'SPORT ARAB*' },
  { category_id: '445', category_name: 'ALGERIE*' },
  { category_id: '446', category_name: 'MAROC*' },
  { category_id: '447', category_name: 'MBC ROTANA*' },
  { category_id: '448', category_name: 'OSN-ART*' },
  { category_id: '501', category_name: 'CHALLENGE ONDEMAND*' },
  { category_id: '455', category_name: 'EGYPT*' },
  { category_id: '456', category_name: 'NEWS*' },
  { category_id: '457', category_name: 'ISLAM*' },
  { category_id: '458', category_name: 'LIBAN' },
  { category_id: '459', category_name: 'SYRIA*' },
  { category_id: '460', category_name: 'MUSIQUE*' },
  { category_id: '461', category_name: 'ARABE DIVERS*' },
];

// السيرفرات الثلاثة المطلوبة بعد حذف المصادر السابقة بالكامل
export const DEFAULT_XTREAM_SOURCES: XtreamSource[] = [
  {
    id: 'xtream_server_1',
    name: 'السيرفر 1',
    server: 'http://line.irav25.biz:8080',
    username: '542500725351739675',
    password: '8457561352755875',
    enabled: true,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'xtream_server_2',
    name: 'السيرفر 2',
    server: 'http://startseven.tn:2052',
    username: '09746171',
    password: '15445345',
    enabled: true,
    channelCount: 0,
    status: 'idle',
  },
  {
    id: 'xtream_server_3',
    name: 'السيرفر 3 (باقة السكربت)',
    server: 'http://startseven.tn:2052',
    username: '09746171',
    password: '15445345',
    allowedCategoryIds: DEFAULT_XTREAM_CATEGORIES.map((c) => c.category_id),
    enabled: true,
    channelCount: 0,
    status: 'idle',
  },
];

// قنوات تيليجرام الرسمية للاشتراك
export const DEFAULT_TELEGRAM_LINKS: TelegramLink[] = [
  {
    id: 'tg_bot',
    name: 'بوت القنوات',
    url: 'https://t.me/qweqwe2019bot2bot',
    description: 'بوت القنوات والتحديثات المباشرة',
  },
  {
    id: 'tg_abu2saleh',
    name: 'قناة أبو صالح',
    url: 'https://t.me/Abu2Saleh',
    description: 'قناة أبو صالح الرسمية على تيليجرام',
  },
  {
    id: 'tg_pixels',
    name: 'Pixels X Mods APK',
    url: 'https://t.me/pixels_x_mods_apk',
    description: 'تطبيقات ونسخ أندرويد معدلة وحصرية',
  },
];

export const DEV_NAME = 'Hamodi9005';
export const DEV_URL = 'http://t.me/Hamodi9005';
export const ADMIN_DEFAULT_PIN = '124+098123';
export const TELEGRAM_URL = 'https://t.me/qweqwe2019bot2bot';

export const CORS_PROXY_PRESETS = [
  { label: 'CorsProxy.io (سريع)', value: 'https://corsproxy.io/?' },
  { label: 'AllOrigins Raw', value: 'https://api.allorigins.win/raw?url=' },
  { label: 'بدون وسيط (APK / WebView)', value: '' },
];

export const CATEGORIES: { id: CategoryId; ar: string; en: string }[] = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'sports', ar: 'رياضة', en: 'Sports' },
  { id: 'movies', ar: 'أفلام ومسلسلات', en: 'Movies & Series' },
  { id: 'news', ar: 'أخبار', en: 'News' },
  { id: 'variety', ar: 'منوعة وترفيه', en: 'Variety' },
  { id: 'kids', ar: 'أطفال', en: 'Kids' },
  { id: 'religious', ar: 'دينية', en: 'Religious' },
  { id: 'music', ar: 'موسيقى', en: 'Music' },
  { id: 'docs', ar: 'وثائقي', en: 'Docs' },
  { id: 'other', ar: 'أخرى', en: 'Other' },
];

export const CATEGORY_ORDER: Record<Exclude<CategoryId, 'all'>, number> = {
  sports: 0,
  movies: 1,
  news: 2,
  variety: 3,
  kids: 4,
  religious: 5,
  music: 6,
  docs: 7,
  other: 8,
};

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
  adminPin: ADMIN_DEFAULT_PIN,
  appName: 'IPTV PRO',
  tagline: 'قنوات مباشرة بجودة عالية مع مشغل احترافي ولوحة تحكم متكاملة',
  notice: '',
  activeXtreamSourceId: 'xtream_server_1',
  hiddenCategoryIds: [],
  telegramLinks: DEFAULT_TELEGRAM_LINKS,
  devName: DEV_NAME,
  devUrl: DEV_URL,
  copyrightText: '',
  showCopyButton: true,
  hideOffline: false,
  onlineOnlyFilter: false,
  healthPoolSize: 15,
  autoScanIntervalHours: 24,
  autoDeleteDead: true,
  lastHealthCheckAt: null,
  lastChannelId: null,
  volume: 0.9,
  channelsSortBy: 'default',
  channelsCategory: 'all',
};

export const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const HEALTH_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 15000;
