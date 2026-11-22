export type TabId = 'home' | 'channels' | 'favorites' | 'settings';

export type CategoryId =
  | 'all'
  | 'news'
  | 'sports'
  | 'movies'
  | 'variety'
  | 'kids'
  | 'docs'
  | 'religious'
  | 'music'
  | 'other';

export type QualityTier = '4K' | 'FHD' | 'HD' | 'SD';

export type HealthStatus = 'untested' | 'checking' | 'online' | 'dead' | 'uncertain';

export type SortOption =
  | 'default'
  | 'name-asc'
  | 'name-desc'
  | 'views'
  | 'newest'
  | 'quality'
  | 'country';

export interface ChannelServer {
  url: string;
  quality: QualityTier;
  source: string;
  latencyMs?: number;
}

export interface Channel {
  id: string;
  name: string;
  rawName?: string;
  nameAr?: string;
  nameEn?: string;
  badges?: string[];
  fameScore?: number;
  normName: string;
  url: string;
  fallbacks: string[];
  servers?: ChannelServer[];
  logo: string;
  group: string;
  category: Exclude<CategoryId, 'all'>;
  country: string;
  language: string;
  isArabic: boolean;
  quality: QualityTier;
  tvgId: string;
  source: string;
  sources: string[];
  userAgent?: string;
  referer?: string;
  addedAt: number;
  watchCount: number;
  health?: HealthStatus;
  latencyMs?: number;
  lastCheckedAt?: number;
  failCount?: number;
  lastFailAt?: number;
  consecutiveScanFails?: number;
}

export interface DeletedLogItem {
  id: string;
  name: string;
  url: string;
  fallbacks?: string[];
  source: string;
  reason: string;
  deletedAt: number;
}

export interface M3USource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  custom: boolean;
  channelCount: number;
  status: 'idle' | 'loading' | 'success' | 'error';
  lastError?: string;
}

export interface FavoriteGroup {
  id: string;
  name: string;
  channelIds: string[];
}

export interface HistoryItem {
  channelId: string;
  watchedAt: number;
  durationSec?: number;
}

export interface AppSettings {
  language: 'ar' | 'en';
  themeAccent: 'cyan-violet' | 'emerald-teal' | 'gold-amber';
  defaultQuality: 'auto' | '1080' | '720' | '480';
  bufferLevel: 'low' | 'medium' | 'high';
  backgroundAudio: boolean;
  pipEnabled: boolean;
  dataSaver: boolean;
  corsProxy: string;
  pinEnabled: boolean;
  pinCode: string;
  hideOffline: boolean;
  onlineOnlyFilter: boolean;
  healthPoolSize: number;
  autoScanIntervalHours: 0 | 6 | 12 | 24;
  autoDeleteDead: boolean;
  lastHealthCheckAt: number | null;
  lastChannelId: string | null;
  volume: number;
  channelsSortBy: SortOption;
  channelsCategory: CategoryId;
}

export interface SourceFetchStats {
  totalLoaded: number;
  completedSources: number;
  totalSources: number;
  usingCache: boolean;
  corsFallbackUsed: boolean;
  lastUpdated: number | null;
  notice?: string;
}

export interface HealthScanProgress {
  active: boolean;
  paused: boolean;
  minimized: boolean;
  finished: boolean;
  mode: 'quick' | 'full' | 'retry-dead';
  total: number;
  checked: number;
  online: number;
  dead: number;
  uncertain: number;
  startedAt: number;
  speedPerSec: number;
  etaSec: number;
}
