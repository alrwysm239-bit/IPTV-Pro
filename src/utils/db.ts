import {
  AppSettings,
  Channel,
  DeletedLogItem,
  FavoriteGroup,
  HistoryItem,
  M3USource,
  XtreamCategory,
  XtreamSource,
} from '../types/iptv';

const DB_NAME = 'iptv_pro_db';
const DB_VERSION = 1;
const STORE_CHANNELS = 'channels';
const STORE_META = 'meta';
const MIGRATION_KEY = 'sourceMigrationVersion';
const CURRENT_MIGRATION = 'v5_admin_124_and_sync_fix';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CHANNELS)) {
          db.createObjectStore(STORE_CHANNELS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
  return dbPromise;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result ? (req.result.value as T) : fallback);
      req.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // تجاهل أخطاء التخزين بصمت
  }
}

// تنظيف تام لجميع المصادر والقنوات السابقة عند الترحيل إلى المصدر الجديد من السكربت
export async function migrateOldSourcesIfNeeded(defaultSettings: AppSettings): Promise<boolean> {
  try {
    const current = await getMeta<string>(MIGRATION_KEY, '');
    if (current === CURRENT_MIGRATION) return false;

    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_CHANNELS, STORE_META], 'readwrite');
      tx.objectStore(STORE_CHANNELS).clear();
      const meta = tx.objectStore(STORE_META);
      meta.delete('lastUpdated');
      meta.delete('sources');
      meta.delete('xtreamSources');
      meta.delete('xtreamCategories');
      meta.delete('deletedBlacklist');
      meta.delete('deletedLog');
      meta.delete('history');
      meta.delete('favGroups');
      meta.delete('pinnedIds');
      meta.put({ key: 'settings', value: defaultSettings });
      meta.put({ key: MIGRATION_KEY, value: CURRENT_MIGRATION });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return true;
  } catch {
    return false;
  }
}

export async function saveChannelsCache(channels: Channel[], updatedAt: number): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_CHANNELS, STORE_META], 'readwrite');
      const store = tx.objectStore(STORE_CHANNELS);
      store.clear();
      for (let i = 0; i < channels.length; i++) {
        store.put(channels[i]);
      }
      tx.objectStore(STORE_META).put({ key: 'lastUpdated', value: updatedAt });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // تجاهل
  }
}

export async function loadChannelsCache(): Promise<{ channels: Channel[]; lastUpdated: number | null }> {
  try {
    const db = await openDB();
    const [channels, lastUpdated] = await Promise.all([
      new Promise<Channel[]>((resolve) => {
        const tx = db.transaction(STORE_CHANNELS, 'readonly');
        const req = tx.objectStore(STORE_CHANNELS).getAll();
        req.onsuccess = () => resolve((req.result as Channel[]) || []);
        req.onerror = () => resolve([]);
      }),
      getMeta<number | null>('lastUpdated', null),
    ]);
    return { channels, lastUpdated };
  } catch {
    return { channels: [], lastUpdated: null };
  }
}

export async function updateChannelHealthInDB(channel: Channel): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_CHANNELS, 'readwrite');
      tx.objectStore(STORE_CHANNELS).put(channel);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // تجاهل
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_CHANNELS, STORE_META], 'readwrite');
      tx.objectStore(STORE_CHANNELS).clear();
      tx.objectStore(STORE_META).delete('lastUpdated');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // تجاهل
  }
}

export const loadSettings = (def: AppSettings) => getMeta<AppSettings>('settings', def);
export const saveSettings = (s: AppSettings) => setMeta('settings', s);
export const loadSources = (def: M3USource[]) => getMeta<M3USource[]>('sources', def);
export const saveSources = (s: M3USource[]) => setMeta('sources', s);
export const loadXtreamSources = (def: XtreamSource[]) =>
  getMeta<XtreamSource[]>('xtreamSources', def);
export const saveXtreamSources = (s: XtreamSource[]) => setMeta('xtreamSources', s);
export const loadXtreamCategories = (def: XtreamCategory[]) =>
  getMeta<XtreamCategory[]>('xtreamCategories', def);
export const saveXtreamCategories = (c: XtreamCategory[]) => setMeta('xtreamCategories', c);
export const loadFavorites = () =>
  getMeta<FavoriteGroup[]>('favGroups', [{ id: 'grp_all', name: 'المفضلة العامة', channelIds: [] }]);
export const saveFavorites = (g: FavoriteGroup[]) => setMeta('favGroups', g);
export const loadPinned = () => getMeta<string[]>('pinnedIds', []);
export const savePinned = (ids: string[]) => setMeta('pinnedIds', ids);
export const loadHistory = () => getMeta<HistoryItem[]>('history', []);
export const saveHistory = (h: HistoryItem[]) => setMeta('history', h);
export const loadBlacklist = () => getMeta<string[]>('deletedBlacklist', []);
export const saveBlacklist = (urls: string[]) => setMeta('deletedBlacklist', urls);
export const loadDeletedLog = () => getMeta<DeletedLogItem[]>('deletedLog', []);
export const saveDeletedLog = (items: DeletedLogItem[]) =>
  setMeta('deletedLog', items.slice(0, 100));
