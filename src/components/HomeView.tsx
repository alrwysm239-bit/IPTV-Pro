import React, { useMemo, useState } from 'react';
import {
  Play,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Heart,
  Sparkles,
  Globe,
} from 'lucide-react';
import { CATEGORIES } from '../constants/sources';
import { AppSettings, CategoryId, Channel, SourceFetchStats } from '../types/iptv';
import { ChannelLogo } from './ChannelLogo';

interface HomeViewProps {
  channels: Channel[];
  historyIds: string[];
  favoriteIds: Set<string>;
  currentChannelId: string | null;
  settings: AppSettings;
  stats: SourceFetchStats;
  isFetching: boolean;
  onPlay: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
  onRefresh: () => void;
  onGoToChannels: (category?: CategoryId) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  channels,
  historyIds,
  favoriteIds,
  currentChannelId,
  settings,
  stats,
  isFetching,
  onPlay,
  onToggleFavorite,
  onRefresh,
  onGoToChannels,
}) => {
  const isAr = settings.language === 'ar';
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');

  const channelMap = useMemo(() => {
    const map = new Map<string, Channel>();
    for (let i = 0; i < channels.length; i++) {
      map.set(channels[i].id, channels[i]);
    }
    return map;
  }, [channels]);

  const filteredByCat = useMemo(() => {
    const base = settings.hideOffline
      ? channels.filter((c) => c.health !== 'dead')
      : channels;
    if (selectedCategory === 'all') return base;
    return base.filter((c) => c.category === selectedCategory);
  }, [channels, selectedCategory, settings.hideOffline]);

  const featuredChannel = useMemo(() => {
    if (filteredByCat.length === 0) return null;
    const preferred = filteredByCat.find(
      (c) =>
        c.isArabic &&
        (c.category === 'sports' || c.quality === 'FHD' || c.quality === '4K')
    );
    return preferred || filteredByCat[0];
  }, [filteredByCat]);

  const continueWatching = useMemo(() => {
    const items: Channel[] = [];
    for (const id of historyIds) {
      const ch = channelMap.get(id);
      if (ch) items.push(ch);
      if (items.length >= 12) break;
    }
    return items;
  }, [historyIds, channelMap]);

  const mostWatched = useMemo(() => {
    return [...filteredByCat]
      .sort((a, b) => {
        if (b.watchCount !== a.watchCount) return b.watchCount - a.watchCount;
        if (a.isArabic !== b.isArabic) return a.isArabic ? -1 : 1;
        return 0;
      })
      .slice(0, 12);
  }, [filteredByCat]);

  const recentlyAdded = useMemo(() => {
    return filteredByCat.slice(0, 12);
  }, [filteredByCat]);

  const topCountries = useMemo(() => {
    const counts = new Map<string, number>();
    for (let i = 0; i < channels.length; i++) {
      const c = channels[i].country;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
  }, [channels]);

  const countryChannels = useMemo(() => {
    const list =
      selectedCountry === 'all'
        ? filteredByCat
        : filteredByCat.filter((c) => c.country === selectedCountry);
    return list.slice(0, 18);
  }, [filteredByCat, selectedCountry]);

  const Chevron = isAr ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-6 pb-28">
      {/* الشريط العلوي */}
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onGoToChannels()}
            aria-label={isAr ? 'بحث' : 'Search'}
            className="w-10 h-10 rounded-2xl glass-card flex items-center justify-center text-slate-300 hover:text-[#00E5FF] transition-colors cursor-pointer"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            aria-label={isAr ? 'تحديث المصادر' : 'Refresh Sources'}
            className="w-10 h-10 rounded-2xl glass-card flex items-center justify-center text-slate-300 hover:text-[#00E5FF] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-[#00E5FF]' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF3B5C] shadow-[0_0_10px_#FF3B5C]" />
          <h1 className="text-xl font-extrabold tracking-tight text-white">
            IPTV <span className="neon-gradient-text">PRO</span>
          </h1>
        </div>
      </header>

      {/* شريط إشعار الكاش أو التحميل التدريجي */}
      {(isFetching || stats.notice) && (
        <div className="glass-card rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-200 truncate">
            <Sparkles className="w-4 h-4 text-[#00E5FF] shrink-0" />
            <span className="truncate">
              {isFetching
                ? isAr
                  ? `جاري دمج المصادر (${stats.completedSources}/${stats.totalSources}) • ${channels.length.toLocaleString()} قناة`
                  : `Syncing sources (${stats.completedSources}/${stats.totalSources}) • ${channels.length.toLocaleString()} channels`
                : stats.notice}
            </span>
          </div>
          <span className="text-[#00E5FF] font-bold tabular-nums shrink-0">
            {channels.length.toLocaleString()}
          </span>
        </div>
      )}

      {/* شرائح التصنيفات */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                active
                  ? 'neon-gradient text-white shadow-[0_4px_16px_rgba(0,229,255,0.3)]'
                  : 'glass-card text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              {isAr ? cat.ar : cat.en}
            </button>
          );
        })}
      </div>

      {/* بانر القناة المميزة */}
      {featuredChannel ? (
        <section
          onClick={() => onPlay(featuredChannel)}
          className="relative overflow-hidden rounded-3xl p-5 md:p-7 cursor-pointer group border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
          style={{
            background:
              'linear-gradient(135deg, rgba(0,229,255,0.22) 0%, rgba(124,77,255,0.42) 55%, rgba(28,36,58,0.95) 100%)',
          }}
        >
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-[#00E5FF]/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full bg-[#7C4DFF]/25 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2.5 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF3B5C] text-white text-[11px] font-extrabold shadow-lg shadow-[#FF3B5C]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FFC857] text-[#090C16] text-[11px] font-extrabold">
                  {featuredChannel.quality}
                </span>
                <span className="text-xs text-slate-200/90 font-medium">
                  {featuredChannel.country}
                </span>
              </div>

              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight text-balance">
                {featuredChannel.name}
              </h2>
              <p className="text-xs md:text-sm text-slate-200/80">
                {featuredChannel.group} · {featuredChannel.source}
              </p>
            </div>

            <div className="flex items-center gap-3 self-start md:self-center">
              <ChannelLogo
                src={featuredChannel.logo}
                name={featuredChannel.name}
                size="lg"
                dataSaver={settings.dataSaver}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(featuredChannel);
                }}
                className="neon-gradient text-white px-5 py-3 rounded-2xl font-extrabold text-sm inline-flex items-center gap-2 shadow-[0_8px_24px_rgba(0,229,255,0.35)] group-hover:scale-[1.03] transition-transform cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isAr ? 'شاهد الآن' : 'Watch Now'}</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-3xl h-44 skeleton-shimmer border border-white/5" />
      )}

      {/* هياكل التحميل عند البدء */}
      {channels.length === 0 && isFetching && (
        <section className="space-y-3">
          <div className="h-5 w-36 rounded-lg skeleton-shimmer" />
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl p-3 h-32 skeleton-shimmer border border-white/5"
              />
            ))}
          </div>
        </section>
      )}

      {/* استمر في المشاهدة */}
      {continueWatching.length > 0 && (
        <ChannelGridSection
          title={isAr ? 'استمر في المشاهدة' : 'Continue Watching'}
          channels={continueWatching}
          favoriteIds={favoriteIds}
          currentChannelId={currentChannelId}
          dataSaver={settings.dataSaver}
          isAr={isAr}
          Chevron={Chevron}
          onSeeAll={() => onGoToChannels(selectedCategory)}
          onPlay={onPlay}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      {/* الأكثر مشاهدة */}
      {mostWatched.length > 0 && (
        <ChannelGridSection
          title={isAr ? 'الأكثر مشاهدة' : 'Most Watched'}
          channels={mostWatched}
          favoriteIds={favoriteIds}
          currentChannelId={currentChannelId}
          dataSaver={settings.dataSaver}
          isAr={isAr}
          Chevron={Chevron}
          onSeeAll={() => onGoToChannels(selectedCategory)}
          onPlay={onPlay}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      {/* المضافة حديثاً */}
      {recentlyAdded.length > 0 && (
        <ChannelGridSection
          title={isAr ? 'المضافة حديثاً' : 'Recently Added'}
          channels={recentlyAdded}
          favoriteIds={favoriteIds}
          currentChannelId={currentChannelId}
          dataSaver={settings.dataSaver}
          isAr={isAr}
          Chevron={Chevron}
          onSeeAll={() => onGoToChannels(selectedCategory)}
          onPlay={onPlay}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      {/* حسب الدولة */}
      {channels.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#00E5FF]" />
              <h3 className="text-base md:text-lg font-extrabold text-white">
                {isAr ? 'حسب الدولة' : 'By Country'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onGoToChannels(selectedCategory)}
              className="text-xs font-bold text-[#00E5FF] inline-flex items-center gap-0.5 hover:underline cursor-pointer"
            >
              <span>{isAr ? 'الكل' : 'All'}</span>
              <Chevron className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setSelectedCountry('all')}
              className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                selectedCountry === 'all'
                  ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50'
                  : 'glass-card text-slate-300 hover:text-white'
              }`}
            >
              {isAr ? 'جميع الدول' : 'All Countries'}
            </button>
            {topCountries.map((country) => (
              <button
                key={country}
                type="button"
                onClick={() => setSelectedCountry(country)}
                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  selectedCountry === country
                    ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50'
                    : 'glass-card text-slate-300 hover:text-white'
                }`}
              >
                {country}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {countryChannels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                isFav={favoriteIds.has(ch.id)}
                isActive={currentChannelId === ch.id}
                dataSaver={settings.dataSaver}
                isAr={isAr}
                onPlay={onPlay}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

interface SectionProps {
  title: string;
  channels: Channel[];
  favoriteIds: Set<string>;
  currentChannelId: string | null;
  dataSaver: boolean;
  isAr: boolean;
  Chevron: React.FC<{ className?: string }>;
  onSeeAll: () => void;
  onPlay: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
}

const ChannelGridSection: React.FC<SectionProps> = ({
  title,
  channels,
  favoriteIds,
  currentChannelId,
  dataSaver,
  isAr,
  Chevron,
  onSeeAll,
  onPlay,
  onToggleFavorite,
}) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-base md:text-lg font-extrabold text-white">{title}</h3>
      <button
        type="button"
        onClick={onSeeAll}
        className="text-xs font-bold text-[#00E5FF] inline-flex items-center gap-0.5 hover:underline cursor-pointer"
      >
        <span>{isAr ? 'الكل' : 'All'}</span>
        <Chevron className="w-4 h-4" />
      </button>
    </div>

    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {channels.map((ch) => (
        <ChannelCard
          key={ch.id}
          channel={ch}
          isFav={favoriteIds.has(ch.id)}
          isActive={currentChannelId === ch.id}
          dataSaver={dataSaver}
          isAr={isAr}
          onPlay={onPlay}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  </section>
);

interface CardProps {
  channel: Channel;
  isFav: boolean;
  isActive: boolean;
  dataSaver: boolean;
  isAr: boolean;
  onPlay: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
}

const ChannelCard: React.FC<CardProps> = ({
  channel,
  isFav,
  isActive,
  dataSaver,
  isAr,
  onPlay,
  onToggleFavorite,
}) => (
  <div
    onClick={() => onPlay(channel)}
    className={`relative glass-card rounded-2xl p-3 flex flex-col items-center text-center gap-2 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
      isActive
        ? 'border-[#00E5FF] shadow-[0_0_18px_rgba(0,229,255,0.28)]'
        : 'hover:border-white/20'
    }`}
  >
    <span
      title={
        channel.health === 'online'
          ? `${channel.latencyMs || 0}ms`
          : channel.health === 'dead'
            ? 'Dead'
            : 'Untested'
      }
      className={`absolute top-2.5 left-2.5 w-2.5 h-2.5 rounded-full ${
        channel.health === 'online'
          ? 'bg-emerald-400 shadow-[0_0_8px_#34D399]'
          : channel.health === 'dead'
            ? 'bg-[#FF3B5C]'
            : channel.health === 'uncertain'
              ? 'bg-amber-400'
              : 'bg-slate-500'
      }`}
    />
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggleFavorite(channel.id);
      }}
      aria-label={isAr ? 'مفضلة' : 'Favorite'}
      className="absolute top-2 right-2 text-slate-400 hover:text-[#FF3B5C] transition-colors cursor-pointer"
    >
      <Heart
        className={`w-3.5 h-3.5 ${isFav ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''}`}
      />
    </button>

    <div className="mt-1">
      <ChannelLogo
        src={channel.logo}
        name={channel.name}
        size="md"
        dataSaver={dataSaver}
      />
    </div>

    <div className="w-full min-w-0">
      <p className="text-xs font-bold text-white truncate">{channel.name}</p>
      <p className="text-[10px] text-slate-400 truncate mt-0.5">
        {isAr ? 'يعرض الآن' : 'Live Now'} · {channel.quality}
      </p>
    </div>
  </div>
);
