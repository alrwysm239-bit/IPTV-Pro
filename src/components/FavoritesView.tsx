import React, { useMemo, useState } from 'react';
import {
  Heart,
  Pin,
  History,
  Plus,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  FolderPlus,
} from 'lucide-react';
import { AppSettings, Channel, FavoriteGroup, HistoryItem } from '../types/iptv';
import { ChannelLogo } from './ChannelLogo';

interface FavoritesViewProps {
  channels: Channel[];
  groups: FavoriteGroup[];
  pinnedIds: string[];
  history: HistoryItem[];
  settings: AppSettings;
  onPlay: (channel: Channel) => void;
  onTogglePin: (channelId: string) => void;
  onRemoveFromGroup: (groupId: string, channelId: string) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onReorderGroup: (groupId: string, fromIdx: number, toIdx: number) => void;
  onAssignToGroup: (groupId: string, channelId: string) => void;
  onClearHistory: () => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  channels,
  groups,
  pinnedIds,
  history,
  settings,
  onPlay,
  onTogglePin,
  onRemoveFromGroup,
  onCreateGroup,
  onDeleteGroup,
  onReorderGroup,
  onAssignToGroup,
  onClearHistory,
}) => {
  const isAr = settings.language === 'ar';
  const [subTab, setSubTab] = useState<'favs' | 'pinned' | 'history'>('favs');
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0]?.id || 'grp_all');
  const [newGroupName, setNewGroupName] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const channelMap = useMemo(() => {
    const map = new Map<string, Channel>();
    for (let i = 0; i < channels.length; i++) {
      map.set(channels[i].id, channels[i]);
    }
    return map;
  }, [channels]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) || groups[0],
    [groups, activeGroupId]
  );

  const pinnedChannels = useMemo(
    () => pinnedIds.map((id) => channelMap.get(id)).filter(Boolean) as Channel[],
    [pinnedIds, channelMap]
  );

  const groupChannels = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.channelIds
      .map((id) => channelMap.get(id))
      .filter(Boolean) as Channel[];
  }, [activeGroup, channelMap]);

  const historyRows = useMemo(() => {
    return history
      .map((item) => {
        const ch = channelMap.get(item.channelId);
        return ch ? { channel: ch, watchedAt: item.watchedAt } : null;
      })
      .filter(Boolean) as { channel: Channel; watchedAt: number }[];
  }, [history, channelMap]);

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    onCreateGroup(trimmed);
    setNewGroupName('');
  };

  return (
    <div className="space-y-4 pb-28 pt-2">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-white">
          {isAr ? 'المفضلة والسجل' : 'Favorites & History'}
        </h1>
        {subTab === 'history' && historyRows.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="text-xs font-bold text-[#FF3B5C] hover:underline cursor-pointer"
          >
            {isAr ? 'مسح السجل' : 'Clear History'}
          </button>
        )}
      </header>

      {/* شريط التبويب الفرعي */}
      <div className="grid grid-cols-3 gap-2 glass-card p-1.5 rounded-2xl">
        {[
          { id: 'favs' as const, label: isAr ? 'المفضلة' : 'Favorites', Icon: Heart },
          { id: 'pinned' as const, label: isAr ? 'المثبتة' : 'Pinned', Icon: Pin },
          { id: 'history' as const, label: isAr ? 'السجل' : 'History', Icon: History },
        ].map(({ id, label, Icon }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                active
                  ? 'neon-gradient text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* قسم المجموعات والمفضلة */}
      {subTab === 'favs' && (
        <div className="space-y-4">
          {/* إنشاء مجموعة مخصصة */}
          <form onSubmit={handleAddGroup} className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={isAr ? 'اسم مجموعة مخصصة جديدة...' : 'New custom group name...'}
              className="flex-1 glass-card rounded-2xl px-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-[#00E5FF]"
            />
            <button
              type="submit"
              className="neon-gradient px-4 py-2.5 rounded-2xl text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <FolderPlus className="w-4 h-4" />
              <span>{isAr ? 'إضافة' : 'Add'}</span>
            </button>
          </form>

          {/* شرائح المجموعات */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {groups.map((grp) => {
              const active = activeGroup?.id === grp.id;
              return (
                <div key={grp.id} className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveGroupId(grp.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                      active
                        ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50'
                        : 'glass-card text-slate-300 hover:text-white'
                    }`}
                  >
                    {grp.name} ({grp.channelIds.length})
                  </button>
                  {grp.id !== 'grp_all' && (
                    <button
                      type="button"
                      onClick={() => onDeleteGroup(grp.id)}
                      aria-label={isAr ? 'حذف المجموعة' : 'Delete group'}
                      className="p-1.5 text-slate-500 hover:text-[#FF3B5C] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* القنوات المثبتة أعلى المفضلة */}
          {pinnedChannels.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-[#FFC857] flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5" />
                <span>{isAr ? 'مثبتة في الأعلى' : 'Pinned at Top'}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {pinnedChannels.map((ch) => (
                  <div
                    key={`pin_${ch.id}`}
                    onClick={() => onPlay(ch)}
                    className="glass-card rounded-2xl p-3 flex items-center justify-between gap-3 border-[#FFC857]/40 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ChannelLogo src={ch.logo} name={ch.name} size="sm" dataSaver={settings.dataSaver} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{ch.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{ch.country}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(ch.id);
                      }}
                      className="p-2 text-[#FFC857] hover:bg-white/5 rounded-xl cursor-pointer"
                    >
                      <Pin className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* قائمة المفضلة القابلة للترتيب بالسحب */}
          {groupChannels.length === 0 ? (
            <div className="glass-card rounded-3xl p-8 text-center space-y-2">
              <Heart className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-300">
                {isAr
                  ? 'لا توجد قنوات في هذه المجموعة بعد'
                  : 'No channels in this group yet'}
              </p>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'اضغط على أيقونة القلب بجانب أي قناة لإضافتها هنا'
                  : 'Tap the heart icon on any channel to add it here'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupChannels.map((ch, idx) => {
                const isPinned = pinnedIds.includes(ch.id);
                return (
                  <div
                    key={ch.id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== idx && activeGroup) {
                        onReorderGroup(activeGroup.id, dragIdx, idx);
                      }
                      setDragIdx(null);
                    }}
                    onClick={() => onPlay(ch)}
                    className="glass-card rounded-2xl p-3 flex items-center justify-between gap-2 cursor-pointer hover:border-white/20"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <GripVertical className="w-4 h-4 text-slate-500 shrink-0 cursor-grab" />
                      <ChannelLogo src={ch.logo} name={ch.name} size="sm" dataSaver={settings.dataSaver} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{ch.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {ch.group} · {ch.quality}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {groups.length > 1 && (
                        <select
                          aria-label={isAr ? 'نقل لمجموعة' : 'Add to group'}
                          value=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.value) onAssignToGroup(e.target.value, ch.id);
                          }}
                          className="bg-[#090C16]/80 border border-white/10 rounded-lg px-1.5 py-1 text-[10px] text-slate-300"
                        >
                          <option value="">{isAr ? '+ مجموعة' : '+ Group'}</option>
                          {groups
                            .filter((g) => g.id !== activeGroup?.id)
                            .map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeGroup && idx > 0) onReorderGroup(activeGroup.id, idx, idx - 1);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                        aria-label={isAr ? 'تحريك لأعلى' : 'Move up'}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeGroup && idx < groupChannels.length - 1) {
                            onReorderGroup(activeGroup.id, idx, idx + 1);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                        aria-label={isAr ? 'تحريك لأسفل' : 'Move down'}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(ch.id);
                        }}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          isPinned ? 'text-[#FFC857]' : 'text-slate-400 hover:text-white'
                        }`}
                        aria-label={isAr ? 'تثبيت' : 'Pin'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeGroup) onRemoveFromGroup(activeGroup.id, ch.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-[#FF3B5C] cursor-pointer"
                        aria-label={isAr ? 'حذف' : 'Remove'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* قسم القنوات المثبتة */}
      {subTab === 'pinned' && (
        <div className="space-y-2.5">
          {pinnedChannels.length === 0 ? (
            <div className="glass-card rounded-3xl p-8 text-center space-y-2">
              <Pin className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-300">
                {isAr ? 'لا توجد قنوات مثبتة' : 'No pinned channels'}
              </p>
            </div>
          ) : (
            pinnedChannels.map((ch) => (
              <div
                key={ch.id}
                onClick={() => onPlay(ch)}
                className="glass-card rounded-2xl p-3 flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelLogo src={ch.logo} name={ch.name} size="md" dataSaver={settings.dataSaver} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{ch.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {ch.country} · {ch.source}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(ch.id);
                  }}
                  className="p-2 text-[#FFC857] hover:bg-white/5 rounded-xl cursor-pointer"
                >
                  <Pin className="w-4 h-4 fill-current" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* قسم سجل المشاهدة */}
      {subTab === 'history' && (
        <div className="space-y-2.5">
          {historyRows.length === 0 ? (
            <div className="glass-card rounded-3xl p-8 text-center space-y-2">
              <History className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-300">
                {isAr ? 'سجل المشاهدة فارغ' : 'Watch history is empty'}
              </p>
            </div>
          ) : (
            historyRows.map(({ channel: ch, watchedAt }) => (
              <div
                key={`${ch.id}_${watchedAt}`}
                onClick={() => onPlay(ch)}
                className="glass-card rounded-2xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-white/20"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelLogo src={ch.logo} name={ch.name} size="md" dataSaver={settings.dataSaver} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{ch.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {ch.group} · {new Date(watchedAt).toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#FFC857] text-[#090C16] text-[10px] font-extrabold shrink-0">
                  {ch.quality}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
