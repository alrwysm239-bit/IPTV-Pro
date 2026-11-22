import { AppSettings, Channel, DeletedLogItem, FavoriteGroup, HistoryItem, M3USource } from '../types/iptv';

const DB_NAME = 'iptv_pro_db';
const DB_VERSION = 1;
const STORE_CHANNELS = 'channels';
const STORE_META = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

// فتح قاعدة IndexedDB بشكل آمن
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

export async function saveChannelsCache(channels: Channel[], updatedAt: number): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_CHANNELS, STORE_META], 'readwrite');
      const store = tx.objectStore(STORE_CHANNELS);
      store.clear();
      // تخزين القنوات على دفعة واحدة داخل نفس المعاملة لسرعة فائقة
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
      tx.objectStore(STORE_META).delete('sources');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // تجاهل
  }
}

// دوال مساعدة لحفظ الإعدادات والمفضلة والمصادر والسجل
export const loadSettings = (def: AppSettings) => getMeta<AppSettings>('settings', def);
export const saveSettings = (s: AppSettings) => setMeta('settings', s);
export const loadSources = (def: M3USource[]) => getMeta<M3USource[]>('sources', def);
export const saveSources = (s: M3USource[]) => setMeta('sources', s);
export const loadFavorites = () => getMeta<FavoriteGroup[]>('favGroups', [{ id: 'grp_all', name: 'المفضلة العامة', channelIds: [] }]);
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

