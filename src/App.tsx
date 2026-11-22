import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Undo2, AlertCircle } from 'lucide-react';
import {
  CACHE_MAX_AGE_MS,
  DEFAULT_SETTINGS,
  DEFAULT_SOURCES,
  HEALTH_CACHE_AGE_MS,
  ONE_HOUR_MS,
} from './constants/sources';
import {
  AppSettings,
  CategoryId,
  Channel,
  DeletedLogItem,
  FavoriteGroup,
  HealthScanProgress,
  HistoryItem,
  M3USource,
  SourceFetchStats,
  TabId,
} from './types/iptv';
import {
  clearAllCache,
  loadBlacklist,
  loadChannelsCache,
  loadDeletedLog,
  loadFavorites,
  loadHistory,
  loadPinned,
  loadSettings,
  loadSources,
  saveBlacklist,
  saveChannelsCache,
  saveDeletedLog,
  saveFavorites,
  saveHistory,
  savePinned,
  saveSettings,
  saveSources,
  updateChannelHealthInDB,
} from './utils/db';
import { mergeAndDeduplicateChannels, parseM3UInWorker } from './utils/m3uWorker';
import {
  buildCleanM3U,
  checkChannelWithFallbacks,
  checkInternetConnected,
  fetchM3UText,
  isWifiAllowedForAutoScan,
  runHealthCheckPool,
} from './utils/streamHealth';
import { BottomNav } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { ChannelsView } from './components/ChannelsView';
import { FavoritesView } from './components/FavoritesView';
import { SettingsView } from './components/SettingsView';
import { ProPlayerModal } from './components/ProPlayerModal';
import { HealthScanModal } from './components/HealthScanModal';

const INITIAL_SCAN: HealthScanProgress = {
  active: false,
  paused: false,
  minimized: false,
  finished: false,
  mode: 'quick',
  total: 0,
  checked: 0,
  online: 0,
  dead: 0,
  uncertain: 0,
  startedAt: 0,
  speedPerSec: 0,
  etaSec: 0,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [channelsCategoryJump, setChannelsCategoryJump] = useState<CategoryId>('all');

  const [channels, setChannels] = useState<Channel[]>([]);
  const [sources, setSources] = useState<M3USource[]>(DEFAULT_SOURCES);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [favGroups, setFavGroups] = useState<FavoriteGroup[]>([
    { id: 'grp_all', name: 'المفضلة العامة', channelIds: [] },
  ]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [deletedLog, setDeletedLog] = useState<DeletedLogItem[]>([]);

  const [isFetching, setIsFetching] = useState(false);
  const [stats, setStats] = useState<SourceFetchStats>({
    totalLoaded: 0,
    completedSources: 0,
    totalSources: DEFAULT_SOURCES.length,
    usingCache: false,
    corsFallbackUsed: false,
    lastUpdated: null,
  });

  const [playerChannel, setPlayerChannel] = useState<Channel | null>(null);
  const [playerMinimized, setPlayerMinimized] = useState(false);

  const [scan, setScan] = useState<HealthScanProgress>(INITIAL_SCAN);
  const scanAbortRef = useRef<AbortController | null>(null);
  const scanPausedRef = useRef(false);

  const [globalToast, setGlobalToast] = useState<string>('');
  const toastTimerRef = useRef<number | null>(null);

  const [pendingDeletePrompt, setPendingDeletePrompt] = useState<{
    ids: string[];
    reason: string;
    message: string;
  } | null>(null);

  // لقطة تراجع 10 ثوانٍ بعد الحذف الجماعي أو التلقائي
  const [undoSnapshot, setUndoSnapshot] = useState<{
    channels: Channel[];
    blacklist: string[];
    deletedLog: DeletedLogItem[];
    removedCount: number;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);

  const channelsRef = useRef<Channel[]>([]);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  const blacklistRef = useRef<string[]>([]);
  useEffect(() => {
    blacklistRef.current = blacklist;
  }, [blacklist]);

  const deletedLogRef = useRef<DeletedLogItem[]>([]);
  useEffect(() => {
    deletedLogRef.current = deletedLog;
  }, [deletedLog]);

  const settingsRef = useRef<AppSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const showToast = useCallback((msg: string) => {
    setGlobalToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setGlobalToast(''), 3200);
  }, []);

  // تطبيق اللغة والاتجاه والمظهر
  useEffect(() => {
    const isAr = settings.language === 'ar';
    document.documentElement.lang = isAr ? 'ar' : 'en';
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';

    const root = document.documentElement;
    if (settings.themeAccent === 'emerald-teal') {
      root.style.setProperty('--neon-cyan', '#10B981');
      root.style.setProperty('--neon-violet', '#00E5FF');
    } else if (settings.themeAccent === 'gold-amber') {
      root.style.setProperty('--neon-cyan', '#FFC857');
      root.style.setProperty('--neon-violet', '#FF6B6B');
    } else {
      root.style.setProperty('--neon-cyan', '#00E5FF');
      root.style.setProperty('--neon-violet', '#7C4DFF');
    }
  }, [settings.language, settings.themeAccent]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const favoriteIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of favGroups) {
      for (const id of g.channelIds) set.add(id);
    }
    return set;
  }, [favGroups]);

  // تصفية القنوات حسب القائمة السوداء مع إبقاء القنوات التي لديها رابط بديل سليم
  const filterAgainstBlacklist = useCallback((list: Channel[], bl: string[]): Channel[] => {
    if (!bl.length) return list;
    const blSet = new Set(bl);
    const out: Channel[] = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const candidates = [c.url, ...(c.fallbacks || [])].filter((u) => !blSet.has(u));
      if (candidates.length === 0) continue;
      out.push({
        ...c,
        url: candidates[0],
        fallbacks: candidates.slice(1),
      });
    }
    return out;
  }, []);

  // حذف قنوات فعلياً من IndexedDB + القائمة السوداء + سجل آخر 100 محذوفة + تراجع 10 ثوانٍ
  const performBulkDelete = useCallback(
    async (predicateToDelete: (c: Channel) => boolean, reason: string) => {
      const prevChannels = channelsRef.current;
      const prevBlacklist = blacklistRef.current;
      const prevLog = deletedLogRef.current;

      const toRemove = prevChannels.filter(predicateToDelete);
      if (toRemove.length === 0) return 0;

      const kept = prevChannels.filter((c) => !predicateToDelete(c));
      const newBlUrls: string[] = [];
      const now = Date.now();
      const newLogEntries: DeletedLogItem[] = [];

      for (const ch of toRemove) {
        newBlUrls.push(ch.url, ...(ch.fallbacks || []));
        newLogEntries.push({
          id: ch.id,
          name: ch.name,
          url: ch.url,
          fallbacks: ch.fallbacks,
          source: ch.source,
          reason,
          deletedAt: now,
        });
      }

      const nextBlacklist = Array.from(new Set([...prevBlacklist, ...newBlUrls]));
      const nextLog = [...newLogEntries, ...prevLog].slice(0, 100);

      setChannels(kept);
      setBlacklist(nextBlacklist);
      setDeletedLog(nextLog);

      await Promise.all([
        saveChannelsCache(kept, stats.lastUpdated || now),
        saveBlacklist(nextBlacklist),
        saveDeletedLog(nextLog),
      ]);

      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      setUndoSnapshot({
        channels: prevChannels,
        blacklist: prevBlacklist,
        deletedLog: prevLog,
        removedCount: toRemove.length,
      });
      undoTimerRef.current = window.setTimeout(() => {
        setUndoSnapshot(null);
      }, 10000);

      return toRemove.length;
    },
    [stats.lastUpdated]
  );

  const handleUndoDelete = useCallback(async () => {
    if (!undoSnapshot) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setChannels(undoSnapshot.channels);
    setBlacklist(undoSnapshot.blacklist);
    setDeletedLog(undoSnapshot.deletedLog);
    await Promise.all([
      saveChannelsCache(undoSnapshot.channels, stats.lastUpdated || Date.now()),
      saveBlacklist(undoSnapshot.blacklist),
      saveDeletedLog(undoSnapshot.deletedLog),
    ]);
    setUndoSnapshot(null);
  }, [undoSnapshot, stats.lastUpdated]);

  // تشغيل محرك فحص القنوات وحذف غير الشغالة بأولوية (الظاهرة + المفضلة ثم الباقي)
  const startHealthScan = useCallback(
    async (
      mode: 'quick' | 'full' | 'retry-dead',
      priorityVisible: Channel[] = [],
      backgroundAuto = false
    ) => {
      if (scanAbortRef.current) return;
      const s = settingsRef.current;

      // لا يبدأ الفحص التلقائي في الخلفية إلا عند اتصال واي فاي إذا كان توفير البيانات مفعلاً
      if (backgroundAuto && !isWifiAllowedForAutoScan(s.dataSaver)) {
        return;
      }

      // التحقق من اتصال الإنترنت قبل الفحص
      const onlineNow = await checkInternetConnected();
      if (!onlineNow) {
        if (!backgroundAuto) {
          showToast(
            s.language === 'ar'
              ? 'لا يوجد اتصال بالإنترنت — تعذر بدء الفحص'
              : 'Internet offline — scan skipped'
          );
        }
        return;
      }

      const all = channelsRef.current;
      if (all.length === 0) return;

      const now = Date.now();
      const targets = all.filter((c) => {
        if (mode === 'full') return true;
        if (mode === 'retry-dead') return c.health === 'dead';
        const fresh =
          c.lastCheckedAt && now - c.lastCheckedAt < HEALTH_CACHE_AGE_MS;
        if (c.health === 'dead' || !c.health || c.health === 'untested') return true;
        return !fresh;
      });

      if (targets.length === 0) {
        if (!backgroundAuto) {
          setScan({
            ...INITIAL_SCAN,
            finished: true,
            mode,
            total: 0,
            online: all.filter((c) => c.health === 'online').length,
            dead: all.filter((c) => c.health === 'dead').length,
            uncertain: all.filter((c) => c.health === 'uncertain').length,
          });
        }
        return;
      }

      // ترتيب الأولوية: الظاهرة على الشاشة أولاً ثم المفضلة ثم الباقي
      const visibleIds = new Set(priorityVisible.map((c) => c.id));
      const ordered = [...targets].sort((a, b) => {
        const aScore = (visibleIds.has(a.id) ? 2 : 0) + (favoriteIds.has(a.id) ? 1 : 0);
        const bScore = (visibleIds.has(b.id) ? 2 : 0) + (favoriteIds.has(b.id) ? 1 : 0);
        return bScore - aScore;
      });

      const controller = new AbortController();
      scanAbortRef.current = controller;
      scanPausedRef.current = false;

      const startedAt = Date.now();
      setScan({
        active: true,
        paused: false,
        minimized: backgroundAuto,
        finished: false,
        mode,
        total: ordered.length,
        checked: 0,
        online: 0,
        dead: 0,
        uncertain: 0,
        startedAt,
        speedPerSec: 0,
        etaSec: 0,
      });

      const newlyDeadFallbackUrls: string[] = [];
      let checked = 0;
      let online = 0;
      let dead = 0;
      let uncertain = 0;

      await runHealthCheckPool({
        channels: ordered,
        poolSize: s.healthPoolSize || 15,
        dataSaver: s.dataSaver,
        isPaused: () => scanPausedRef.current,
        signal: controller.signal,
        onChannelStart: (chId) => {
          setChannels((prev) =>
            prev.map((c) => (c.id === chId ? { ...c, health: 'checking' } : c))
          );
        },
        onChannelDone: (outcome) => {
          checked++;
          if (outcome.status === 'online') online++;
          else if (outcome.status === 'dead') dead++;
          else uncertain++;

          if (outcome.removedUrls.length > 0 && outcome.status !== 'dead') {
            newlyDeadFallbackUrls.push(...outcome.removedUrls);
          }

          setChannels((prev) =>
            prev.map((c) => {
              if (c.id !== outcome.channelId) return c;
              const nextConsecFails =
                outcome.status === 'dead'
                  ? (c.consecutiveScanFails || 0) + 1
                  : outcome.status === 'online'
                    ? 0
                    : c.consecutiveScanFails || 0;
              return {
                ...c,
                health: outcome.status,
                latencyMs: outcome.latencyMs,
                lastCheckedAt: outcome.lastCheckedAt,
                url: outcome.survivingUrl,
                fallbacks: outcome.survivingFallbacks,
                consecutiveScanFails: nextConsecFails,
                ...(outcome.status === 'online' ? { failCount: 0, lastFailAt: 0 } : {}),
              };
            })
          );

          const elapsedSec = Math.max(0.5, (Date.now() - startedAt) / 1000);
          const speedPerSec = checked / elapsedSec;
          const remaining = ordered.length - checked;
          const etaSec = speedPerSec > 0 ? remaining / speedPerSec : 0;

          setScan((prev) => ({
            ...prev,
            checked,
            online,
            dead,
            uncertain,
            speedPerSec,
            etaSec,
          }));
        },
      });

      scanAbortRef.current = null;

      if (newlyDeadFallbackUrls.length > 0) {
        const mergedBl = Array.from(
          new Set([...blacklistRef.current, ...newlyDeadFallbackUrls])
        );
        setBlacklist(mergedBl);
        await saveBlacklist(mergedBl);
      }

      await saveChannelsCache(channelsRef.current, stats.lastUpdated || Date.now());
      updateSettings({ lastHealthCheckAt: Date.now() });

      // التحقق من القنوات التي فشلت في فحصين متتاليين (غير المؤكدة لا تُحذف أبداً)
      if (!controller.signal.aborted) {
        const twoFailDead = channelsRef.current.filter(
          (c) => c.health === 'dead' && (c.consecutiveScanFails || 0) >= 2
        );

        if (twoFailDead.length > 0) {
          if (settingsRef.current.autoDeleteDead) {
            const idSet = new Set(twoFailDead.map((c) => c.id));
            await performBulkDelete(
              (c) => idSet.has(c.id),
              s.language === 'ar'
                ? 'حذف تلقائي: فشل في فحصين متتاليين'
                : 'Auto-deleted: failed 2 consecutive scans'
            );
            showToast(
              s.language === 'ar'
                ? `تم حذف ${twoFailDead.length.toLocaleString()} قناة ميتة تلقائياً (فشل مرتين)`
                : `Auto-deleted ${twoFailDead.length} channels (failed 2 scans)`
            );
          } else {
            setPendingDeletePrompt({
              ids: twoFailDead.map((c) => c.id),
              reason:
                s.language === 'ar'
                  ? 'فشل في فحصين متتاليين'
                  : 'Failed 2 consecutive scans',
              message:
                s.language === 'ar'
                  ? `فشلت ${twoFailDead.length.toLocaleString()} قناة في فحصين متتاليين. هل تريد حذفها؟`
                  : `${twoFailDead.length} channels failed 2 consecutive scans. Delete them?`,
            });
          }
        }
      }

      setScan((prev) => ({
        ...prev,
        active: false,
        minimized: false,
        finished: !backgroundAuto && !controller.signal.aborted,
      }));
    },
    [favoriteIds, stats.lastUpdated, updateSettings, performBulkDelete, showToast]
  );

  // جلب ودمج المصادر تدريجياً بالتوازي + فحص تلقائي بعد كل تحديث للمصادر
  const syncAllSources = useCallback(
    async (
      targetSources: M3USource[],
      activeProxy: string,
      hasCachedData: boolean,
      overrideBlacklist?: string[]
    ) => {
      const enabledSources = targetSources.filter((s) => s.enabled);
      if (enabledSources.length === 0) return;

      setIsFetching(true);
      setStats((prev) => ({
        ...prev,
        completedSources: 0,
        totalSources: enabledSources.length,
        corsFallbackUsed: false,
        notice: undefined,
      }));

      setSources((prev) =>
        prev.map((s) => (s.enabled ? { ...s, status: 'loading' } : { ...s, status: 'idle' }))
      );

      let workingChannels: Channel[] = [];
      let completed = 0;
      let anySucceeded = false;
      let usedProxyAny = false;
      const activeBl = overrideBlacklist ?? blacklistRef.current;

      await Promise.allSettled(
        enabledSources.map(async (src) => {
          try {
            const { text, usedProxy } = await fetchM3UText(src.url, activeProxy);
            if (usedProxy) usedProxyAny = true;

            const parsed = await parseM3UInWorker(text, src.id, src.name);
            anySucceeded = true;

            workingChannels = mergeAndDeduplicateChannels(workingChannels, parsed);
            const cleaned = filterAgainstBlacklist(workingChannels, activeBl);
            setChannels(cleaned);

            setSources((prev) =>
              prev.map((item) =>
                item.id === src.id
                  ? { ...item, status: 'success', channelCount: parsed.length }
                  : item
              )
            );
          } catch {
            setSources((prev) =>
              prev.map((item) =>
                item.id === src.id ? { ...item, status: 'error', channelCount: 0 } : item
              )
            );
          } finally {
            completed++;
            setStats((prev) => ({
              ...prev,
              completedSources: completed,
              totalLoaded: workingChannels.length,
              corsFallbackUsed: usedProxyAny,
            }));
          }
        })
      );

      const finalClean = filterAgainstBlacklist(workingChannels, activeBl);
      const now = Date.now();
      if (anySucceeded && finalClean.length > 0) {
        await saveChannelsCache(finalClean, now);
        setStats((prev) => ({
          ...prev,
          lastUpdated: now,
          usingCache: false,
          notice: usedProxyAny
            ? settingsRef.current.language === 'ar'
              ? 'تم الجلب بنجاح عبر وسيط CORS البديل'
              : 'Synced via CORS fallback proxy'
            : undefined,
        }));

        // فحص تلقائي في الخلفية بعد كل تحديث للمصادر (إذا كان الفحص التلقائي غير معطّل ومسموح على الواي فاي)
        if (
          settingsRef.current.autoScanIntervalHours > 0 &&
          isWifiAllowedForAutoScan(settingsRef.current.dataSaver)
        ) {
          setTimeout(() => startHealthScan('quick', [], true), 800);
        }
      } else if (hasCachedData) {
        setStats((prev) => ({
          ...prev,
          usingCache: true,
          notice:
            settingsRef.current.language === 'ar'
              ? 'تعذر الاتصال المباشر بالمصادر، يتم عرض آخر نسخة محفوظة.'
              : 'Could not reach sources; displaying last cached snapshot.',
        }));
      }

      setIsFetching(false);
    },
    [filterAgainstBlacklist, startHealthScan]
  );

  // التهيئة الأولية: stale-while-revalidate من IndexedDB + الفحص التلقائي الدوري
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [
        loadedSettings,
        loadedSources,
        loadedFavs,
        loadedPinned,
        loadedHistory,
        loadedBlacklist,
        loadedLog,
        cache,
      ] = await Promise.all([
        loadSettings(DEFAULT_SETTINGS),
        loadSources(DEFAULT_SOURCES),
        loadFavorites(),
        loadPinned(),
        loadHistory(),
        loadBlacklist(),
        loadDeletedLog(),
        loadChannelsCache(),
      ]);

      if (!mounted) return;
      const mergedSettings = { ...DEFAULT_SETTINGS, ...loadedSettings };
      setSettings(mergedSettings);
      setSources(loadedSources);
      setFavGroups(loadedFavs);
      setPinnedIds(loadedPinned);
      setHistory(loadedHistory);
      setBlacklist(loadedBlacklist);
      setDeletedLog(loadedLog);

      const filteredCached = filterAgainstBlacklist(cache.channels, loadedBlacklist);
      const hasCached = filteredCached.length > 0;
      if (hasCached) {
        setChannels(filteredCached);
        setStats((prev) => ({
          ...prev,
          lastUpdated: cache.lastUpdated,
          usingCache: true,
          totalLoaded: filteredCached.length,
        }));
      }

      const isStale =
        !cache.lastUpdated || Date.now() - cache.lastUpdated > CACHE_MAX_AGE_MS;

      if (!hasCached || isStale) {
        await syncAllSources(
          loadedSources,
          mergedSettings.corsProxy,
          hasCached,
          loadedBlacklist
        );
      } else if (
        mergedSettings.autoScanIntervalHours > 0 &&
        channelsRef.current.length > 0 &&
        isWifiAllowedForAutoScan(mergedSettings.dataSaver) &&
        (!mergedSettings.lastHealthCheckAt ||
          Date.now() - mergedSettings.lastHealthCheckAt >=
            mergedSettings.autoScanIntervalHours * ONE_HOUR_MS)
      ) {
        startHealthScan('quick', [], true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [syncAllSources, filterAgainstBlacklist, startHealthScan]);

  // تحديث المصادر تلقائياً كل 12 ساعة
  useEffect(() => {
    const id = window.setInterval(() => {
      syncAllSources(sources, settings.corsProxy, channelsRef.current.length > 0);
    }, CACHE_MAX_AGE_MS);
    return () => window.clearInterval(id);
  }, [sources, settings.corsProxy, syncAllSources]);

  // مؤقت الفحص الدوري التلقائي في الخلفية (6 / 12 / 24 ساعة)
  useEffect(() => {
    if (!settings.autoScanIntervalHours) return;
    const ms = settings.autoScanIntervalHours * ONE_HOUR_MS;
    const id = window.setInterval(() => {
      if (isWifiAllowedForAutoScan(settings.dataSaver)) {
        startHealthScan('quick', [], true);
      }
    }, ms);
    return () => window.clearInterval(id);
  }, [settings.autoScanIntervalHours, settings.dataSaver, startHealthScan]);

  useEffect(() => {
    saveSources(sources);
  }, [sources]);

  // نجاح تشغيل القناة يصفّر عداد فشلها
  const handlePlaybackSuccess = useCallback((channelId: string) => {
    let updatedChannel: Channel | null = null;
    setChannels((prev) =>
      prev.map((c) => {
        if (c.id !== channelId) return c;
        updatedChannel = {
          ...c,
          health: 'online',
          lastCheckedAt: Date.now(),
          failCount: 0,
          lastFailAt: 0,
          consecutiveScanFails: 0,
        };
        return updatedChannel;
      })
    );
    if (updatedChannel) {
      updateChannelHealthInDB(updatedChannel);
    }
  }, []);

  // الانتقال للقناة التالية بعد الفشل
  const skipToNextFrom = useCallback((failedChannelId: string) => {
    const list = channelsRef.current;
    const idx = list.findIndex((c) => c.id === failedChannelId);
    if (idx !== -1 && list.length > 1) {
      const next = list[(idx + 1) % list.length];
      setPlayerChannel(next);
    } else if (list.length <= 1) {
      setPlayerChannel(null);
    }
  }, []);

  // عند فشل كل محاولات تشغيل القناة (الروابط البديلة + إعادة محاولة واحدة)
  const handlePlaybackAllFailed = useCallback(
    async (ch: Channel, reason: string) => {
      const isAr = settingsRef.current.language === 'ar';
      const internetOk = await checkInternetConnected();
      if (!internetOk) {
        showToast(
          isAr
            ? 'الإنترنت منقطع — لم يتم تسجيل فشل للقناة'
            : 'No internet — failure not recorded'
        );
        return;
      }

      const now = Date.now();
      const target = channelsRef.current.find((c) => c.id === ch.id) || ch;
      const canIncrementFail =
        !target.lastFailAt || now - target.lastFailAt >= ONE_HOUR_MS;
      const nextFailCount = canIncrementFail
        ? (target.failCount || 0) + 1
        : target.failCount || 1;

      if (canIncrementFail) {
        const updated: Channel = {
          ...target,
          failCount: nextFailCount,
          lastFailAt: now,
          health: 'dead',
          lastCheckedAt: now,
        };
        setChannels((prev) =>
          prev.map((item) => (item.id === ch.id ? updated : item))
        );
        await updateChannelHealthInDB(updated);
      }

      // تخطي القناة تلقائياً إلى التالية مع الإشعار المطلوب
      skipToNextFrom(ch.id);
      showToast(
        isAr
          ? 'تعذّر تشغيل القناة، تم تخطيها'
          : 'Playback failed, channel skipped'
      );

      // حذف تلقائي عند الوصول إلى 3 مرات فشل في أوقات مختلفة (بفاصل ساعة)
      if (nextFailCount >= 3) {
        if (settingsRef.current.autoDeleteDead) {
          await performBulkDelete(
            (c) => c.id === ch.id,
            isAr
              ? `حذف تلقائي بعد فشل التشغيل 3 مرات (${reason})`
              : `Auto-deleted after 3 playback failures (${reason})`
          );
          showToast(
            isAr
              ? `تم حذف "${ch.name}" تلقائياً بعد 3 حالات فشل`
              : `Auto-deleted "${ch.name}" after 3 failures`
          );
        } else {
          setPendingDeletePrompt({
            ids: [ch.id],
            reason: isAr
              ? `فشل التشغيل 3 مرات (${reason})`
              : `3 playback failures (${reason})`,
            message: isAr
              ? `فشلت قناة "${ch.name}" 3 مرات أثناء المشاهدة. هل تريد حذفها؟`
              : `"${ch.name}" failed 3 times. Delete it?`,
          });
        }
      }
    },
    [performBulkDelete, showToast, skipToNextFrom]
  );

  // زر "بلّغ أنها لا تعمل" في المشغل: فحص فوري وحذف إذا فشلت
  const handleReportNotWorking = useCallback(
    async (ch: Channel) => {
      const isAr = settingsRef.current.language === 'ar';
      const internetOk = await checkInternetConnected();
      if (!internetOk) {
        showToast(
          isAr ? 'الإنترنت منقطع — تحقق من اتصالك أولاً' : 'Internet offline'
        );
        return;
      }

      const outcome = await checkChannelWithFallbacks(ch, settingsRef.current.dataSaver);
      if (outcome.status === 'dead') {
        skipToNextFrom(ch.id);
        await performBulkDelete(
          (c) => c.id === ch.id,
          isAr ? 'بلاغ مستخدم (فحص فوري فاشل)' : 'User report (failed instant check)'
        );
        showToast(
          isAr
            ? `تم حذف "${ch.name}" لعدم عملها والانتقال للتالية`
            : `Deleted "${ch.name}" and skipped`
        );
      } else if (outcome.status === 'online') {
        const updated: Channel = {
          ...ch,
          health: 'online',
          latencyMs: outcome.latencyMs,
          lastCheckedAt: outcome.lastCheckedAt,
          url: outcome.survivingUrl,
          fallbacks: outcome.survivingFallbacks,
          failCount: 0,
          lastFailAt: 0,
          consecutiveScanFails: 0,
        };
        setChannels((prev) => prev.map((c) => (c.id === ch.id ? updated : c)));
        await updateChannelHealthInDB(updated);
        showToast(
          isAr
            ? `البث يستجيب (${outcome.latencyMs}ms) — جرب إعادة التحميل`
            : `Stream responded (${outcome.latencyMs}ms)`
        );
      } else {
        showToast(
          isAr
            ? 'تعذر الحسم بسبب قيود CORS — يمكنك حذفها يدوياً من زر الحذف'
            : 'Uncertain due to CORS — use manual delete if broken'
        );
      }
    },
    [performBulkDelete, showToast, skipToNextFrom]
  );

  // حذف قناة واحدة يدوياً
  const handleDeleteSingleChannel = useCallback(
    async (ch: Channel) => {
      const isAr = settingsRef.current.language === 'ar';
      if (playerChannel?.id === ch.id) {
        skipToNextFrom(ch.id);
      }
      await performBulkDelete(
        (c) => c.id === ch.id,
        isAr ? 'حذف يدوي من المستخدم' : 'Manual single delete'
      );
    },
    [playerChannel, performBulkDelete, skipToNextFrom]
  );

  // حذف مجموعة محددة يدوياً
  const handleDeleteMultiChannels = useCallback(
    async (ids: string[]) => {
      const isAr = settingsRef.current.language === 'ar';
      const idSet = new Set(ids);
      await performBulkDelete(
        (c) => idSet.has(c.id),
        isAr ? 'حذف يدوي متعدد' : 'Manual multi-select delete'
      );
    },
    [performBulkDelete]
  );

  // فحص قناة واحدة من قائمة السياق بالضغط المطول
  const handleCheckSingleChannel = useCallback(
    async (ch: Channel) => {
      const isAr = settingsRef.current.language === 'ar';
      showToast(isAr ? `جاري فحص ${ch.name}...` : `Checking ${ch.name}...`);
      const outcome = await checkChannelWithFallbacks(ch, settingsRef.current.dataSaver);
      const updated: Channel = {
        ...ch,
        health: outcome.status,
        latencyMs: outcome.latencyMs,
        lastCheckedAt: outcome.lastCheckedAt,
        url: outcome.survivingUrl,
        fallbacks: outcome.survivingFallbacks,
        consecutiveScanFails:
          outcome.status === 'dead'
            ? (ch.consecutiveScanFails || 0) + 1
            : outcome.status === 'online'
              ? 0
              : ch.consecutiveScanFails || 0,
      };
      setChannels((prev) => prev.map((c) => (c.id === ch.id ? updated : c)));
      await updateChannelHealthInDB(updated);
      showToast(
        outcome.status === 'online'
          ? isAr
            ? `${ch.name}: شغالة (${outcome.latencyMs}ms)`
            : `${ch.name}: Online (${outcome.latencyMs}ms)`
          : outcome.status === 'dead'
            ? isAr
              ? `${ch.name}: ميتة`
              : `${ch.name}: Dead`
            : isAr
              ? `${ch.name}: غير مؤكدة (CORS)`
              : `${ch.name}: Uncertain`
      );
    },
    [showToast]
  );

  const handleExportWorkingM3U = useCallback(() => {
    const working = channelsRef.current.filter((c) => c.health === 'online');
    const list = working.length > 0 ? working : channelsRef.current;
    const content = buildCleanM3U(list);
    const blob = new Blob([content], { type: 'audio/x-mpegurl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IPTV-Pro-Working.m3u';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleToggleFavorite = useCallback((channelId: string) => {
    setFavGroups((prev) => {
      const existsInAny = prev.some((g) => g.channelIds.includes(channelId));
      const next = existsInAny
        ? prev.map((g) => ({
            ...g,
            channelIds: g.channelIds.filter((id) => id !== channelId),
          }))
        : prev.map((g, idx) =>
            idx === 0 ? { ...g, channelIds: [channelId, ...g.channelIds] } : g
          );
      saveFavorites(next);
      return next;
    });
  }, []);

  const handlePlayChannel = useCallback(
    (ch: Channel) => {
      setPlayerChannel(ch);
      setPlayerMinimized(false);
      updateSettings({ lastChannelId: ch.id });

      setChannels((prev) =>
        prev.map((item) =>
          item.id === ch.id ? { ...item, watchCount: (item.watchCount || 0) + 1 } : item
        )
      );

      setHistory((prev) => {
        const filtered = prev.filter((h) => h.channelId !== ch.id);
        const next = [{ channelId: ch.id, watchedAt: Date.now() }, ...filtered].slice(0, 60);
        saveHistory(next);
        return next;
      });
    },
    [updateSettings]
  );

  const handleAddSourceUrl = useCallback(
    (name: string, url: string) => {
      const newSource: M3USource = {
        id: `src_custom_${Date.now()}`,
        name,
        url,
        enabled: true,
        custom: true,
        channelCount: 0,
        status: 'loading',
      };
      const nextSources = [newSource, ...sources];
      setSources(nextSources);
      syncAllSources(nextSources, settings.corsProxy, channelsRef.current.length > 0);
    },
    [sources, settings.corsProxy, syncAllSources]
  );

  const handleUploadSourceFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const srcId = `src_file_${Date.now()}`;
        const parsed = await parseM3UInWorker(text, srcId, file.name);
        const newSource: M3USource = {
          id: srcId,
          name: file.name,
          url: 'local://file',
          enabled: true,
          custom: true,
          channelCount: parsed.length,
          status: 'success',
        };
        setSources((prev) => [newSource, ...prev]);
        setChannels((prev) => {
          const merged = filterAgainstBlacklist(
            mergeAndDeduplicateChannels(prev, parsed),
            blacklistRef.current
          );
          saveChannelsCache(merged, Date.now());
          return merged;
        });
      } catch {
        // تجاهل
      }
    },
    [filterAgainstBlacklist]
  );

  const historyIds = useMemo(() => history.map((h) => h.channelId), [history]);
  const totalDeadInLibrary = useMemo(
    () => channels.filter((c) => c.health === 'dead').length,
    [channels]
  );
  const totalOnlineInLibrary = useMemo(
    () => channels.filter((c) => c.health === 'online').length,
    [channels]
  );

  // شاشة القفل العائلي PIN
  if (settings.pinEnabled && !pinUnlocked) {
    return (
      <div className="min-h-screen bg-[#090C16] flex items-center justify-center p-6">
        <div className="glass-card w-full max-w-sm rounded-3xl p-6 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl neon-gradient mx-auto flex items-center justify-center shadow-lg">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">IPTV PRO</h1>
            <p className="text-xs text-slate-400 mt-1">
              {settings.language === 'ar'
                ? 'أدخل رمز القفل العائلي للمتابعة'
                : 'Enter Parental PIN to continue'}
            </p>
          </div>
          <input
            type="password"
            maxLength={4}
            inputMode="numeric"
            value={pinEntry}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
              setPinEntry(val);
              setPinError(false);
              if (val.length === 4) {
                if (val === settings.pinCode) {
                  setPinUnlocked(true);
                } else {
                  setPinError(true);
                  setPinEntry('');
                }
              }
            }}
            placeholder="••••"
            className="w-full bg-[#090C16] border border-white/15 rounded-2xl py-3.5 text-center text-2xl tracking-[0.6em] text-white font-bold focus:outline-none focus:border-[#00E5FF]"
          />
          {pinError && (
            <p className="text-xs font-bold text-[#FF3B5C]">
              {settings.language === 'ar' ? 'رمز PIN غير صحيح' : 'Incorrect PIN'}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090C16] text-white relative">
      {/* خلفية توهج نيون خفيفة */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 right-1/4 w-96 h-96 rounded-full bg-[#00E5FF]/5 blur-[120px]" />
        <div className="absolute top-1/3 -left-32 w-96 h-96 rounded-full bg-[#7C4DFF]/10 blur-[140px]" />
      </div>

      {/* إشعار عائم غير معطل */}
      {globalToast && (
        <div className="fixed top-4 inset-x-0 z-[70] px-4 flex justify-center pointer-events-none">
          <div className="glass-card rounded-2xl px-4 py-2.5 border border-[#00E5FF]/60 shadow-2xl text-xs font-extrabold text-white">
            {globalToast}
          </div>
        </div>
      )}

      {/* شريط التراجع (10 ثوانٍ) بعد الحذف الجماعي أو التلقائي */}
      {undoSnapshot && (
        <div className="fixed top-14 inset-x-0 z-[65] px-4 flex justify-center pointer-events-none">
          <div className="pointer-events-auto glass-card rounded-2xl px-4 py-2.5 border border-[#00E5FF] shadow-2xl flex items-center gap-3 text-xs">
            <span className="font-bold text-white">
              {settings.language === 'ar'
                ? `تم حذف ${undoSnapshot.removedCount.toLocaleString()} قناة`
                : `Deleted ${undoSnapshot.removedCount.toLocaleString()} channels`}
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="neon-gradient px-3 py-1 rounded-xl font-extrabold text-white inline-flex items-center gap-1 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>{settings.language === 'ar' ? 'تراجع' : 'Undo'}</span>
            </button>
          </div>
        </div>
      )}

      {/* نافذة "اسألني قبل الحذف" عند تعطيل الحذف التلقائي */}
      {pendingDeletePrompt && (
        <div className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-sm rounded-3xl p-5 border border-[#FF3B5C]/40 space-y-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-[#FF3B5C] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-white">
                  {settings.language === 'ar' ? 'تأكيد حذف القنوات الميتة' : 'Confirm Dead Channels Removal'}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {pendingDeletePrompt.message}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={async () => {
                  const idSet = new Set(pendingDeletePrompt.ids);
                  await performBulkDelete((c) => idSet.has(c.id), pendingDeletePrompt.reason);
                  setPendingDeletePrompt(null);
                }}
                className="py-2.5 rounded-2xl bg-[#FF3B5C] text-white font-extrabold cursor-pointer"
              >
                {settings.language === 'ar' ? 'نعم، احذفها' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setPendingDeletePrompt(null)}
                className="py-2.5 rounded-2xl glass-card text-slate-200 font-bold cursor-pointer"
              >
                {settings.language === 'ar' ? 'إبقاء الآن' : 'Keep'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="relative z-10 max-w-6xl mx-auto px-4">
        {activeTab === 'home' && (
          <HomeView
            channels={channels}
            historyIds={historyIds}
            favoriteIds={favoriteIds}
            currentChannelId={playerChannel?.id || null}
            settings={settings}
            stats={stats}
            isFetching={isFetching}
            onPlay={handlePlayChannel}
            onToggleFavorite={handleToggleFavorite}
            onRefresh={() =>
              syncAllSources(sources, settings.corsProxy, channels.length > 0)
            }
            onGoToChannels={(cat) => {
              if (cat) setChannelsCategoryJump(cat);
              setActiveTab('channels');
            }}
          />
        )}

        {activeTab === 'channels' && (
          <ChannelsView
            channels={channels}
            favoriteIds={favoriteIds}
            currentChannelId={playerChannel?.id || null}
            settings={settings}
            initialCategory={channelsCategoryJump}
            isCheckingHealth={scan.active}
            onPlay={handlePlayChannel}
            onToggleFavorite={handleToggleFavorite}
            onStartHealthScan={(mode, visible) => startHealthScan(mode, visible)}
            onOpenScanProgress={() => setScan((s) => ({ ...s, minimized: false }))}
            onToggleHideOffline={() =>
              updateSettings({ hideOffline: !settings.hideOffline })
            }
            onToggleOnlineOnly={() =>
              updateSettings({ onlineOnlyFilter: !settings.onlineOnlyFilter })
            }
            onDeleteChannel={handleDeleteSingleChannel}
            onDeleteSelected={handleDeleteMultiChannels}
            onCheckSingleChannel={handleCheckSingleChannel}
          />
        )}

        {activeTab === 'favorites' && (
          <FavoritesView
            channels={channels}
            groups={favGroups}
            pinnedIds={pinnedIds}
            history={history}
            settings={settings}
            onPlay={handlePlayChannel}
            onTogglePin={(chId) => {
              setPinnedIds((prev) => {
                const next = prev.includes(chId)
                  ? prev.filter((id) => id !== chId)
                  : [chId, ...prev];
                savePinned(next);
                return next;
              });
            }}
            onRemoveFromGroup={(grpId, chId) => {
              setFavGroups((prev) => {
                const next = prev.map((g) =>
                  g.id === grpId
                    ? { ...g, channelIds: g.channelIds.filter((id) => id !== chId) }
                    : g
                );
                saveFavorites(next);
                return next;
              });
            }}
            onCreateGroup={(name) => {
              setFavGroups((prev) => {
                const next = [
                  ...prev,
                  { id: `grp_${Date.now()}`, name, channelIds: [] },
                ];
                saveFavorites(next);
                return next;
              });
            }}
            onDeleteGroup={(grpId) => {
              setFavGroups((prev) => {
                const next = prev.filter((g) => g.id !== grpId);
                saveFavorites(next);
                return next;
              });
            }}
            onReorderGroup={(grpId, fromIdx, toIdx) => {
              setFavGroups((prev) => {
                const next = prev.map((g) => {
                  if (g.id !== grpId) return g;
                  const arr = [...g.channelIds];
                  const [moved] = arr.splice(fromIdx, 1);
                  arr.splice(toIdx, 0, moved);
                  return { ...g, channelIds: arr };
                });
                saveFavorites(next);
                return next;
              });
            }}
            onAssignToGroup={(grpId, chId) => {
              setFavGroups((prev) => {
                const next = prev.map((g) =>
                  g.id === grpId && !g.channelIds.includes(chId)
                    ? { ...g, channelIds: [chId, ...g.channelIds] }
                    : g
                );
                saveFavorites(next);
                return next;
              });
            }}
            onClearHistory={() => {
              setHistory([]);
              saveHistory([]);
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            sources={sources}
            stats={stats}
            totalChannels={channels.length}
            blacklistCount={blacklist.length}
            deletedLog={deletedLog}
            isFetching={isFetching}
            isCheckingHealth={scan.active}
            onUpdateSettings={updateSettings}
            onToggleSource={(id) => {
              setSources((prev) =>
                prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
              );
            }}
            onDeleteSource={(id) => {
              setSources((prev) => prev.filter((s) => s.id !== id));
            }}
            onAddSourceUrl={handleAddSourceUrl}
            onUploadSourceFile={handleUploadSourceFile}
            onRefreshSources={() =>
              syncAllSources(sources, settings.corsProxy, channels.length > 0)
            }
            onClearCache={async () => {
              await clearAllCache();
              setChannels([]);
              setStats({
                totalLoaded: 0,
                completedSources: 0,
                totalSources: sources.length,
                usingCache: false,
                corsFallbackUsed: false,
                lastUpdated: null,
              });
            }}
            onStartHealthScan={(mode) => startHealthScan(mode)}
            onClearBlacklistAndRestore={async () => {
              setBlacklist([]);
              await saveBlacklist([]);
              syncAllSources(sources, settings.corsProxy, false, []);
            }}
            onClearDeletedLog={async () => {
              setDeletedLog([]);
              await saveDeletedLog([]);
            }}
            onExportWorkingM3U={handleExportWorkingM3U}
          />
        )}
      </main>

      {/* شريط التنقل السفلي العائم */}
      <BottomNav
        activeTab={activeTab}
        onChange={setActiveTab}
        lang={settings.language}
      />

      {/* نافذة/شريط تقدم فحص القنوات والملخص */}
      <HealthScanModal
        scan={scan}
        isAr={settings.language === 'ar'}
        totalDeadInLibrary={totalDeadInLibrary}
        totalOnlineInLibrary={totalOnlineInLibrary}
        onPauseToggle={() => {
          scanPausedRef.current = !scanPausedRef.current;
          setScan((s) => ({ ...s, paused: scanPausedRef.current }));
        }}
        onCancel={() => {
          scanAbortRef.current?.abort();
          scanAbortRef.current = null;
          setScan(INITIAL_SCAN);
        }}
        onMinimize={(min) => setScan((s) => ({ ...s, minimized: min }))}
        onCloseSummary={() => setScan(INITIAL_SCAN)}
        onDeleteDead={() =>
          performBulkDelete(
            (c) => c.health === 'dead',
            settings.language === 'ar' ? 'حذف القنوات الميتة بعد الفحص' : 'Manual delete dead'
          )
        }
        onKeepOnlineOnly={() =>
          performBulkDelete(
            (c) => c.health !== 'online',
            settings.language === 'ar' ? 'إبقاء القنوات الشغالة فقط' : 'Keep working only'
          )
        }
        onRetryDead={() => startHealthScan('retry-dead')}
        onExportWorkingM3U={handleExportWorkingM3U}
      />

      {/* المشغل الاحترافي */}
      {playerChannel && (
        <ProPlayerModal
          channel={playerChannel}
          allChannels={channels}
          isFavorite={favoriteIds.has(playerChannel.id)}
          settings={settings}
          minimized={playerMinimized}
          onMinimize={setPlayerMinimized}
          onClose={() => setPlayerChannel(null)}
          onSwitchChannel={handlePlayChannel}
          onToggleFavorite={handleToggleFavorite}
          onUpdateVolume={(vol) => updateSettings({ volume: vol })}
          onPlaybackSuccess={handlePlaybackSuccess}
          onPlaybackAllFailed={handlePlaybackAllFailed}
          onReportNotWorking={handleReportNotWorking}
          onDeleteChannel={handleDeleteSingleChannel}
        />
      )}
    </div>
  );
}
