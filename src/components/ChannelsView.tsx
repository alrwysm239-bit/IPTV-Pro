import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Heart,
  Activity,
  ArrowUpDown,
  Loader2,
  Tv,
  ChevronDown,
  Zap,
  ShieldCheck,
  CheckSquare,
  Square,
  Trash2,
  X,
  Play,
  RefreshCw,
} from 'lucide-react';
import { CATEGORIES } from '../constants/sources';
import { AppSettings, CategoryId, Channel, QualityTier } from '../types/iptv';
import { ChannelLogo } from './ChannelLogo';

interface ChannelsViewProps {
  channels: Channel[];
  favoriteIds: Set<string>;
  currentChannelId: string | null;
  settings: AppSettings;
  initialCategory?: CategoryId;
  isCheckingHealth: boolean;
  onPlay: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
  onStartHealthScan: (mode: 'quick' | 'full', priorityList: Channel[]) => void;
  onOpenScanProgress: () => void;
  onToggleHideOffline: () => void;
  onToggleOnlineOnly: () => void;
  onDeleteChannel: (channel: Channel) => void;
  onDeleteSelected: (channelIds: string[]) => void;
  onCheckSingleChannel: (channel: Channel) => void;
}

const ROW_HEIGHT = 86;

function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .trim();
}

export const ChannelsView: React.FC<ChannelsViewProps> = ({
  channels,
  favoriteIds,
  currentChannelId,
  settings,
  initialCategory = 'all',
  isCheckingHealth,
  onPlay,
  onToggleFavorite,
  onStartHealthScan,
  onOpenScanProgress,
  onToggleHideOffline,
  onToggleOnlineOnly,
  onDeleteChannel,
  onDeleteSelected,
  onCheckSingleChannel,
}) => {
  const isAr = settings.language === 'ar';
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<CategoryId>(initialCategory);
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityTier | 'all'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'views' | 'newest'>('default');
  const [showFilters, setShowFilters] = useState(false);
  const [showScanMenu, setShowScanMenu] = useState(false);

  // وضع التحديد المتعدد + نافذة تفاصيل/حذف قناة واحدة بالضغط المطول
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailChannel, setDetailChannel] = useState<Channel | null>(null);
  const longPressRef = useRef<number | null>(null);
  const longPressedFlagRef = useRef(false);

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(540);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  // تأجيل البحث 200ms Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(normalizeSearch(rawQuery)), 200);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  // قياس ارتفاع حاوية القائمة الافتراضية
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const updateHeight = () => setViewportHeight(el.clientHeight || 540);
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [showFilters, multiMode]);

  const filterOptions = useMemo(() => {
    const countries = new Set<string>();
    const langs = new Set<string>();
    const sources = new Set<string>();
    for (let i = 0; i < channels.length; i++) {
      countries.add(channels[i].country);
      langs.add(channels[i].language);
      sources.add(channels[i].source);
    }
    return {
      countries: Array.from(countries).sort(),
      langs: Array.from(langs).sort(),
      sources: Array.from(sources).sort(),
    };
  }, [channels]);

  const filtered = useMemo(() => {
    const q = debouncedQuery;
    const out: Channel[] = [];

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (settings.onlineOnlyFilter && ch.health !== 'online') continue;
      if (settings.hideOffline && ch.health === 'dead') continue;
      if (category !== 'all' && ch.category !== category) continue;
      if (countryFilter !== 'all' && ch.country !== countryFilter) continue;
      if (langFilter !== 'all' && ch.language !== langFilter) continue;
      if (sourceFilter !== 'all' && !ch.sources.includes(sourceFilter)) continue;
      if (qualityFilter !== 'all' && ch.quality !== qualityFilter) continue;

      if (q) {
        const hay = normalizeSearch(`${ch.name} ${ch.group} ${ch.country} ${ch.source}`);
        if (!hay.includes(q)) continue;
      }
      out.push(ch);
    }

    if (sortBy === 'name') {
      out.sort((a, b) => a.name.localeCompare(b.name, isAr ? 'ar' : 'en'));
    } else if (sortBy === 'views') {
      out.sort((a, b) => b.watchCount - a.watchCount);
    } else if (sortBy === 'newest') {
      out.sort((a, b) => b.addedAt - a.addedAt);
    }

    return out;
  }, [
    channels,
    settings.onlineOnlyFilter,
    settings.hideOffline,
    category,
    countryFilter,
    langFilter,
    sourceFilter,
    qualityFilter,
    debouncedQuery,
    sortBy,
    isAr,
  ]);

  // حساب العناصر المرئية فقط (Virtual List)
  const totalHeight = filtered.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 8;
  const endIndex = Math.min(filtered.length, startIndex + visibleCount);
  const visibleSlice = filtered.slice(startIndex, endIndex);

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowPointerDown = (ch: Channel) => {
    longPressedFlagRef.current = false;
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      longPressedFlagRef.current = true;
      setDetailChannel(ch);
    }, 550);
  };

  const cancelLongPress = () => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-92px)] space-y-3 pt-2">
      {/* الترويسة */}
      <header className="flex items-center justify-between gap-2 shrink-0 relative">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold text-white">
            {isAr ? 'القنوات' : 'Channels'}
          </h1>
          <span className="text-xs font-bold text-[#00E5FF] tabular-nums">
            ({filtered.length.toLocaleString()})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* تحديد متعدد للحذف */}
          <button
            type="button"
            onClick={() => {
              setMultiMode((v) => !v);
              setSelectedIds(new Set());
            }}
            className={`px-2.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer ${
              multiMode
                ? 'bg-[#FF3B5C]/20 text-[#FF3B5C] border border-[#FF3B5C]/50'
                : 'glass-card text-slate-300 hover:text-white'
            }`}
            title={isAr ? 'تحديد متعدد للحذف' : 'Multi-select'}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{isAr ? 'تحديد' : 'Select'}</span>
          </button>

          {/* فلتر الشغالة فقط */}
          <button
            type="button"
            onClick={onToggleOnlineOnly}
            className={`px-2.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer ${
              settings.onlineOnlyFilter
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'glass-card text-slate-300 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isAr ? 'الشغالة فقط' : 'Working Only'}</span>
          </button>

          {/* زر فحص القنوات بخيارين (سريع / كامل) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (isCheckingHealth) onOpenScanProgress();
                else setShowScanMenu((v) => !v);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                isCheckingHealth
                  ? 'neon-gradient text-white shadow-lg'
                  : 'glass-card text-slate-200 hover:text-[#00E5FF]'
              }`}
            >
              {isCheckingHealth ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isAr ? 'جاري الفحص...' : 'Scanning...'}</span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5 text-[#00E5FF]" />
                  <span>{isAr ? 'فحص القنوات' : 'Check Channels'}</span>
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>

            {showScanMenu && !isCheckingHealth && (
              <div className="absolute left-0 top-12 z-40 w-56 glass-card rounded-2xl p-2 border border-white/15 shadow-2xl space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowScanMenu(false);
                    onStartHealthScan('quick', visibleSlice);
                  }}
                  className="w-full text-start px-3 py-2.5 rounded-xl hover:bg-white/10 text-xs font-bold text-white flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-[#00E5FF] shrink-0" />
                  <div>
                    <p>{isAr ? 'فحص سريع' : 'Quick Scan'}</p>
                    <p className="text-[10px] text-slate-400 font-normal">
                      {isAr ? 'غير المفحوصة والميتة فقط' : 'Untested & dead only'}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowScanMenu(false);
                    onStartHealthScan('full', visibleSlice);
                  }}
                  className="w-full text-start px-3 py-2.5 rounded-xl hover:bg-white/10 text-xs font-bold text-white flex items-center gap-2 cursor-pointer"
                >
                  <Activity className="w-4 h-4 text-[#7C4DFF] shrink-0" />
                  <div>
                    <p>{isAr ? 'فحص كامل' : 'Full Scan'}</p>
                    <p className="text-[10px] text-slate-400 font-normal">
                      {isAr ? 'إعادة فحص جميع القنوات' : 'Re-check every channel'}
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-label={isAr ? 'فلاتر متقدمة' : 'Advanced Filters'}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              showFilters
                ? 'neon-gradient text-white'
                : 'glass-card text-slate-300 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* شريط إجراءات التحديد المتعدد */}
      {multiMode && (
        <div className="glass-card rounded-2xl px-3.5 py-2.5 border border-[#00E5FF]/40 flex items-center justify-between gap-2 shrink-0 text-xs">
          <span className="font-extrabold text-white tabular-nums">
            {isAr
              ? `المحدد: ${selectedIds.size.toLocaleString()}`
              : `Selected: ${selectedIds.size.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (selectedIds.size === filtered.length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(filtered.map((c) => c.id)));
                }
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 text-slate-200 font-bold cursor-pointer"
            >
              {selectedIds.size === filtered.length
                ? isAr
                  ? 'إلغاء الكل'
                  : 'Clear'
                : isAr
                  ? 'تحديد الكل'
                  : 'Select All'}
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => {
                onDeleteSelected(Array.from(selectedIds));
                setSelectedIds(new Set());
                setMultiMode(false);
              }}
              className="px-3 py-1.5 rounded-xl bg-[#FF3B5C] text-white font-extrabold inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'حذف المحددة' : 'Delete Selected'}</span>
            </button>
          </div>
        </div>
      )}

      {/* شريط البحث الفوري */}
      <div className="relative shrink-0">
        <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3.5 pointer-events-none" />
        <input
          type="search"
          value={rawQuery}
          onChange={(e) => {
            setRawQuery(e.target.value);
            if (listRef.current) listRef.current.scrollTop = 0;
          }}
          placeholder={isAr ? 'ابحث عن قناة بالعربية أو الإنجليزية...' : 'Search channels...'}
          className="w-full glass-card rounded-2xl py-3 pr-10 pl-4 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#00E5FF]"
        />
      </div>

      {/* شرائح التصنيفات */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 py-0.5">
        {CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setCategory(cat.id);
                if (listRef.current) listRef.current.scrollTop = 0;
              }}
              className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                active
                  ? 'neon-gradient text-white shadow-[0_4px_14px_rgba(0,229,255,0.28)]'
                  : 'glass-card text-slate-300 hover:text-white'
              }`}
            >
              {isAr ? cat.ar : cat.en}
            </button>
          );
        })}
      </div>

      {/* الفلاتر المتقدمة */}
      {showFilters && (
        <div className="glass-card rounded-2xl p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 shrink-0 text-xs">
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="bg-[#090C16]/80 border border-white/10 rounded-xl px-2.5 py-2 text-white focus:outline-none focus:border-[#00E5FF]"
          >
            <option value="all">{isAr ? 'كل الدول' : 'All Countries'}</option>
            {filterOptions.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={langFilter}
            onChange={(e) => setLangFilter(e.target.value)}
            className="bg-[#090C16]/80 border border-white/10 rounded-xl px-2.5 py-2 text-white focus:outline-none focus:border-[#00E5FF]"
          >
            <option value="all">{isAr ? 'كل اللغات' : 'All Languages'}</option>
            {filterOptions.langs.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-[#090C16]/80 border border-white/10 rounded-xl px-2.5 py-2 text-white focus:outline-none focus:border-[#00E5FF]"
          >
            <option value="all">{isAr ? 'كل المصادر' : 'All Sources'}</option>
            {filterOptions.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value as QualityTier | 'all')}
            className="bg-[#090C16]/80 border border-white/10 rounded-xl px-2.5 py-2 text-white focus:outline-none focus:border-[#00E5FF]"
          >
            <option value="all">{isAr ? 'كل الجودات' : 'All Qualities'}</option>
            <option value="4K">4K UHD</option>
            <option value="FHD">FHD 1080p</option>
            <option value="HD">HD 720p</option>
            <option value="SD">SD</option>
          </select>

          <button
            type="button"
            onClick={() =>
              setSortBy((s) =>
                s === 'default'
                  ? 'name'
                  : s === 'name'
                    ? 'views'
                    : s === 'views'
                      ? 'newest'
                      : 'default'
              )
            }
            className="bg-[#090C16]/80 border border-white/10 rounded-xl px-2.5 py-2 text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer hover:border-[#00E5FF]"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[#00E5FF]" />
            <span>
              {sortBy === 'default'
                ? isAr
                  ? 'ترتيب: عربي أولاً'
                  : 'Sort: Arabic First'
                : sortBy === 'name'
                  ? isAr
                    ? 'الترتيب: الاسم'
                    : 'Sort: Name'
                  : sortBy === 'views'
                    ? isAr
                      ? 'الأكثر مشاهدة'
                      : 'Most Watched'
                    : isAr
                      ? 'الأحدث'
                      : 'Newest'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleHideOffline}
            className={`rounded-xl px-2.5 py-2 border font-bold cursor-pointer transition-colors ${
              settings.hideOffline
                ? 'bg-[#00E5FF]/20 border-[#00E5FF] text-[#00E5FF]'
                : 'bg-[#090C16]/80 border-white/10 text-slate-300'
            }`}
          >
            {isAr ? 'إخفاء الميتة' : 'Hide Dead'}
          </button>
        </div>
      )}

      {/* القائمة الافتراضية Virtual List */}
      <div
        ref={listRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 overflow-y-auto no-scrollbar pb-24"
      >
        {filtered.length === 0 ? (
          <div className="glass-card rounded-3xl p-8 text-center space-y-2 mt-4">
            <Tv className="w-10 h-10 text-slate-500 mx-auto" />
            <p className="text-sm font-bold text-slate-300">
              {isAr ? 'لا توجد قنوات مطابقة لبحثك' : 'No matching channels found'}
            </p>
          </div>
        ) : (
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            {visibleSlice.map((ch, idx) => {
              const actualIndex = startIndex + idx;
              const isActive = currentChannelId === ch.id;
              const isFav = favoriteIds.has(ch.id);
              const isSelected = selectedIds.has(ch.id);

              return (
                <div
                  key={ch.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${ROW_HEIGHT - 10}px`,
                    transform: `translateY(${actualIndex * ROW_HEIGHT}px)`,
                  }}
                >
                  <div
                    onPointerDown={() => handleRowPointerDown(ch)}
                    onPointerUp={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onPointerMove={cancelLongPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setDetailChannel(ch);
                    }}
                    onClick={() => {
                      if (longPressedFlagRef.current) return;
                      if (multiMode) toggleSelectId(ch.id);
                      else onPlay(ch);
                    }}
                    className={`h-full glass-card rounded-2xl px-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors select-none ${
                      isSelected
                        ? 'border-[#FF3B5C] bg-[#FF3B5C]/10'
                        : isActive
                          ? 'border-[#00E5FF] shadow-[0_0_22px_rgba(0,229,255,0.22)]'
                          : 'hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {multiMode && (
                        <span className="text-[#00E5FF] shrink-0">
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-[#FF3B5C]" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </span>
                      )}
                      <ChannelLogo
                        src={ch.logo}
                        name={ch.name}
                        size="md"
                        dataSaver={settings.dataSaver}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            title={
                              ch.health === 'online'
                                ? isAr
                                  ? `شغالة (${ch.latencyMs || 0}ms)`
                                  : `Online (${ch.latencyMs || 0}ms)`
                                : ch.health === 'dead'
                                  ? isAr
                                    ? 'ميتة'
                                    : 'Dead'
                                  : ch.health === 'uncertain'
                                    ? isAr
                                      ? 'غير مؤكدة'
                                      : 'Uncertain'
                                    : isAr
                                      ? 'لم تُفحص'
                                      : 'Untested'
                            }
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              ch.health === 'online'
                                ? 'bg-emerald-400 shadow-[0_0_8px_#34D399]'
                                : ch.health === 'dead'
                                  ? 'bg-[#FF3B5C]'
                                  : ch.health === 'uncertain'
                                    ? 'bg-amber-400'
                                    : ch.health === 'checking'
                                      ? 'bg-[#00E5FF] animate-pulse'
                                      : 'bg-slate-500'
                            }`}
                          />
                          <h3 className="text-sm font-extrabold text-white truncate">
                            {ch.name}
                          </h3>
                          {ch.fallbacks.length > 0 && (
                            <span className="text-[10px] text-[#00E5FF] font-bold shrink-0">
                              +{ch.fallbacks.length}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {ch.group} · {ch.country} · {ch.source}
                          {ch.health === 'online' && ch.latencyMs ? ` · ${ch.latencyMs}ms` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-md bg-[#FFC857] text-[#090C16] text-[10px] font-extrabold">
                        {ch.quality}
                      </span>

                      {ch.health === 'checking' ? (
                        <Loader2 className="w-4 h-4 text-[#00E5FF] animate-spin" />
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-md text-white text-[10px] font-extrabold ${
                            ch.health === 'dead' ? 'bg-slate-600' : 'bg-[#FF3B5C]'
                          }`}
                        >
                          {ch.health === 'dead' ? (isAr ? 'ميتة' : 'DEAD') : 'LIVE'}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(ch.id);
                        }}
                        aria-label={isAr ? 'إضافة للمفضلة' : 'Toggle favorite'}
                        className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            isFav ? 'fill-[#FF3B5C] text-[#FF3B5C]' : 'text-slate-400'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* نافذة تفاصيل القناة والخيارات بالضغط المطول */}
      {detailChannel && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetailChannel(null)}
        >
          <div
            className="glass-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 border border-white/15 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <ChannelLogo
                  src={detailChannel.logo}
                  name={detailChannel.name}
                  size="md"
                  dataSaver={settings.dataSaver}
                />
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-white truncate">
                    {detailChannel.name}
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    {detailChannel.group} · {detailChannel.country} · {detailChannel.source}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailChannel(null)}
                className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs bg-[#090C16]/70 border border-white/10 rounded-2xl p-3">
              <div>
                <p className="text-slate-400 text-[10px]">{isAr ? 'الحالة' : 'Status'}</p>
                <p className="font-extrabold text-white mt-0.5">
                  {detailChannel.health === 'online'
                    ? isAr
                      ? 'شغالة'
                      : 'Online'
                    : detailChannel.health === 'dead'
                      ? isAr
                        ? 'ميتة'
                        : 'Dead'
                      : detailChannel.health === 'uncertain'
                        ? isAr
                          ? 'غير مؤكدة'
                          : 'Uncertain'
                        : isAr
                          ? 'لم تُفحص'
                          : 'Untested'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px]">{isAr ? 'البدائل' : 'Servers'}</p>
                <p className="font-extrabold text-[#00E5FF] mt-0.5">
                  {1 + (detailChannel.fallbacks?.length || 0)}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px]">{isAr ? 'مرات الفشل' : 'Failures'}</p>
                <p className="font-extrabold text-[#FFC857] mt-0.5">
                  {detailChannel.failCount || 0}/3
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const ch = detailChannel;
                  setDetailChannel(null);
                  onPlay(ch);
                }}
                className="neon-gradient py-2.5 rounded-2xl text-white font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isAr ? 'تشغيل القناة' : 'Play Channel'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const ch = detailChannel;
                  setDetailChannel(null);
                  onCheckSingleChannel(ch);
                }}
                className="glass-card py-2.5 rounded-2xl text-[#00E5FF] font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isAr ? 'فحص الآن' : 'Check Now'}</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleFavorite(detailChannel.id)}
                className="glass-card py-2.5 rounded-2xl text-slate-200 font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Heart
                  className={`w-4 h-4 ${
                    favoriteIds.has(detailChannel.id) ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''
                  }`}
                />
                <span>{isAr ? 'المفضلة' : 'Favorite'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const ch = detailChannel;
                  setDetailChannel(null);
                  onDeleteChannel(ch);
                }}
                className="py-2.5 rounded-2xl bg-[#FF3B5C] text-white font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isAr ? 'حذف القناة' : 'Delete Channel'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
