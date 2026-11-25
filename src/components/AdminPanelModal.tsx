import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Lock,
  Palette,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Server,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { DEFAULT_SETTINGS, DEFAULT_XTREAM_SOURCES } from '../constants/sources';
import {
  AppSettings,
  SourceFetchStats,
  TelegramLink,
  XtreamCategory,
  XtreamSource,
  XtreamUserInfo,
} from '../types/iptv';

type AdminTab = 'overview' | 'appearance' | 'servers' | 'categories' | 'links' | 'security';

function normalizePinInput(raw: string): string {
  return raw
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
}

interface AdminPanelModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  xtreamSources: XtreamSource[];
  xtreamCategories: XtreamCategory[];
  userInfo: XtreamUserInfo | null;
  totalChannels: number;
  favoritesCount: number;
  stats: SourceFetchStats;
  isFetching: boolean;
  onSaveSettings: (patch: Partial<AppSettings>) => void;
  onSaveXtreamSources: (sources: XtreamSource[], activeId: string, forceReload: boolean) => void;
  onRefreshData: () => Promise<void>;
  onTestFirstChannel: () => void;
  onResetDefaults: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  open,
  onClose,
  settings,
  xtreamSources,
  xtreamCategories,
  userInfo,
  totalChannels,
  favoritesCount,
  stats,
  isFetching,
  onSaveSettings,
  onSaveXtreamSources,
  onRefreshData,
  onTestFirstChannel,
  onResetDefaults,
}) => {
  const isAr = settings.language === 'ar';
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [confirmReset, setConfirmReset] = useState(false);

  // Draft states inside panel
  const [draftAppName, setDraftAppName] = useState(settings.appName);
  const [draftTagline, setDraftTagline] = useState(settings.tagline);
  const [draftNotice, setDraftNotice] = useState(settings.notice);
  const [draftAccent, setDraftAccent] = useState(settings.themeAccent);
  const [draftShowCopy, setDraftShowCopy] = useState(settings.showCopyButton);
  const [draftBgAudio, setDraftBgAudio] = useState(settings.backgroundAudio);
  const [draftPip, setDraftPip] = useState(settings.pipEnabled);

  const [draftSources, setDraftSources] = useState<XtreamSource[]>(xtreamSources);
  const [draftActiveSourceId, setDraftActiveSourceId] = useState(settings.activeXtreamSourceId);
  const [draftHiddenCats, setDraftHiddenCats] = useState<string[]>(settings.hiddenCategoryIds);

  const [draftLinks, setDraftLinks] = useState<TelegramLink[]>(settings.telegramLinks);
  const [draftDevName, setDraftDevName] = useState(settings.devName);
  const [draftDevUrl, setDraftDevUrl] = useState(settings.devUrl);
  const [draftCopyright, setDraftCopyright] = useState(settings.copyrightText);

  const [draftAdminPin, setDraftAdminPin] = useState(settings.adminPin);
  const [draftCorsProxy, setDraftCorsProxy] = useState(settings.corsProxy);

  useEffect(() => {
    if (open) {
      setUnlocked(false);
      setPinInput('');
      setPinError('');
      setConfirmReset(false);
      setDraftAppName(settings.appName);
      setDraftTagline(settings.tagline);
      setDraftNotice(settings.notice);
      setDraftAccent(settings.themeAccent);
      setDraftShowCopy(settings.showCopyButton);
      setDraftBgAudio(settings.backgroundAudio);
      setDraftPip(settings.pipEnabled);
      setDraftSources(xtreamSources.map((s) => ({ ...s })));
      setDraftActiveSourceId(settings.activeXtreamSourceId);
      setDraftHiddenCats([...settings.hiddenCategoryIds]);
      setDraftLinks(settings.telegramLinks.map((l) => ({ ...l })));
      setDraftDevName(settings.devName);
      setDraftDevUrl(settings.devUrl);
      setDraftCopyright(settings.copyrightText);
      setDraftAdminPin(settings.adminPin);
      setDraftCorsProxy(settings.corsProxy);
    }
  }, [open, settings, xtreamSources]);

  if (!open) return null;

  const handleUnlock = (e?: React.FormEvent) => {
    e?.preventDefault();
    const entered = normalizePinInput(pinInput);
    const expected = normalizePinInput(settings.adminPin || DEFAULT_SETTINGS.adminPin);
    if (entered === expected) {
      setUnlocked(true);
      setPinError('');
    } else {
      setPinError(isAr ? 'كلمة مرور لوحة التحكم غير صحيحة' : 'Incorrect control panel password');
    }
  };

  const handleSaveAll = () => {
    const validSources = draftSources.filter(
      (s) => s.server.trim() && s.username.trim() && s.password.trim()
    );
    const nextSources = validSources.length > 0 ? validSources : DEFAULT_XTREAM_SOURCES;
    const nextActiveId = nextSources.some((s) => s.id === draftActiveSourceId)
      ? draftActiveSourceId
      : nextSources[0].id;

    const sourcesChanged =
      JSON.stringify(nextSources) !== JSON.stringify(xtreamSources) ||
      nextActiveId !== settings.activeXtreamSourceId ||
      draftCorsProxy.trim() !== settings.corsProxy;

    onSaveSettings({
      appName: draftAppName.trim() || DEFAULT_SETTINGS.appName,
      tagline: draftTagline.trim() || DEFAULT_SETTINGS.tagline,
      notice: draftNotice.trim(),
      themeAccent: draftAccent,
      showCopyButton: draftShowCopy,
      backgroundAudio: draftBgAudio,
      pipEnabled: draftPip,
      hiddenCategoryIds: draftHiddenCats,
      telegramLinks: draftLinks.filter((l) => l.url.trim()),
      devName: draftDevName.trim() || DEFAULT_SETTINGS.devName,
      devUrl: draftDevUrl.trim() || DEFAULT_SETTINGS.devUrl,
      copyrightText: draftCopyright.trim(),
      adminPin: normalizePinInput(draftAdminPin) || DEFAULT_SETTINGS.adminPin,
      corsProxy: draftCorsProxy.trim(),
      activeXtreamSourceId: nextActiveId,
    });

    onSaveXtreamSources(nextSources, nextActiveId, sourcesChanged);
    onClose();
  };

  const toggleCategoryVisibility = (catId: string) => {
    setDraftHiddenCats((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const expFormatted =
    userInfo?.exp_date && Number(userInfo.exp_date) > 0
      ? new Date(Number(userInfo.exp_date) * 1000).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')
      : '—';

  const tabs: { id: AdminTab; labelAr: string; labelEn: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'overview', labelAr: 'نظرة عامة', labelEn: 'Overview', Icon: Activity },
    { id: 'appearance', labelAr: 'المظهر', labelEn: 'Look', Icon: Palette },
    { id: 'servers', labelAr: 'السيرفر', labelEn: 'Server', Icon: Server },
    { id: 'categories', labelAr: 'الأقسام', labelEn: 'Categories', Icon: Layers },
    { id: 'links', labelAr: 'الروابط والحقوق', labelEn: 'Links', Icon: Send },
    { id: 'security', labelAr: 'الأمان', labelEn: 'Security', Icon: Shield },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border border-white/15 max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl neon-gradient flex items-center justify-center text-white shadow-lg">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                {isAr ? 'لوحة التحكم' : 'Control Panel'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {unlocked
                  ? isAr
                    ? 'إدارة السيرفر والأقسام والمظهر والحقوق'
                    : 'Manage server, categories, UI & credits'
                  : isAr
                    ? 'أدخل كلمة المرور للوصول للإعدادات المتقدمة'
                    : 'Enter password to unlock'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!unlocked ? (
          /* شاشة قفل لوحة التحكم */
          <form onSubmit={handleUnlock} className="p-6 space-y-5">
            <div className="w-16 h-16 rounded-2xl neon-gradient mx-auto flex items-center justify-center shadow-xl">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-white">
                {isAr ? 'الدخول للوحة التحكم' : 'Control Panel Access'}
              </h3>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'أدخل كلمة مرور لوحة التحكم للمتابعة'
                  : 'Enter the control panel password to continue'}
              </p>
            </div>

            <div className="relative max-w-sm mx-auto">
              <input
                type={showPin ? 'text' : 'password'}
                dir="ltr"
                autoFocus
                autoComplete="off"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                placeholder="••••••••••"
                className="w-full h-12 bg-[#090C16] border border-white/15 rounded-2xl px-4 pe-12 text-center text-base font-bold text-white tracking-wider focus:outline-none focus:border-[#00E5FF]"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                aria-label={showPin ? 'Hide' : 'Show'}
                className="absolute inset-y-0 end-2 flex items-center justify-center w-9 text-slate-400 hover:text-white cursor-pointer"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {pinError && (
              <p className="text-xs font-bold text-[#FF3B5C] text-center">{pinError}</p>
            )}

            <div className="max-w-sm mx-auto">
              <button
                type="submit"
                className="w-full h-12 rounded-2xl neon-gradient text-white font-extrabold text-sm shadow-lg cursor-pointer"
              >
                {isAr ? 'دخول' : 'Unlock'}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* شريط التبويبات */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/10 overflow-x-auto no-scrollbar shrink-0">
              {tabs.map(({ id, labelAr, labelEn, Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`shrink-0 whitespace-nowrap min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      active
                        ? 'neon-gradient text-white shadow-md'
                        : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{isAr ? labelAr : labelEn}</span>
                  </button>
                );
              })}
            </div>

            {/* محتوى التبويب */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <StatBox
                      label={isAr ? 'القنوات المحملة' : 'Channels'}
                      value={totalChannels.toLocaleString()}
                    />
                    <StatBox
                      label={isAr ? 'الأقسام' : 'Categories'}
                      value={xtreamCategories.length.toLocaleString()}
                    />
                    <StatBox
                      label={isAr ? 'المفضلة' : 'Favorites'}
                      value={favoritesCount.toLocaleString()}
                    />
                    <StatBox
                      label={isAr ? 'حالة الاتصال' : 'Connection'}
                      value={
                        isFetching
                          ? isAr
                            ? 'جاري المزامنة'
                            : 'Syncing'
                          : stats.error && totalChannels === 0
                            ? isAr
                              ? 'غير متصل'
                              : 'Offline'
                            : isAr
                              ? 'متصل'
                              : 'Online'
                      }
                    />
                    <StatBox
                      label={isAr ? 'حالة الاشتراك' : 'Subscription'}
                      value={userInfo?.status || 'Active'}
                    />
                    <StatBox
                      label={isAr ? 'ينتهي في' : 'Expires'}
                      value={expFormatted}
                    />
                  </div>

                  {userInfo && (
                    <div className="bg-[#090C16]/80 border border-white/10 rounded-2xl p-3 flex items-center justify-between">
                      <span className="text-slate-400">
                        {isAr ? 'الاتصالات النشطة / المسموحة' : 'Active / Max Connections'}
                      </span>
                      <span className="font-extrabold text-[#00E5FF] tabular-nums" dir="ltr">
                        {userInfo.active_cons ?? 0} / {userInfo.max_connections ?? '—'}
                      </span>
                    </div>
                  )}

                  {stats.error && (
                    <div className="bg-[#FF3B5C]/10 border border-[#FF3B5C]/40 rounded-2xl p-3 text-[#FF8CA0] font-bold">
                      {stats.error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={isFetching}
                      onClick={() => onRefreshData()}
                      className="min-h-[44px] neon-gradient rounded-2xl px-4 py-2.5 text-white font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                      <span>{isAr ? 'فحص الاتصال وتحديث البيانات' : 'Sync & Check Connection'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onTestFirstChannel();
                      }}
                      className="min-h-[44px] bg-[#090C16] border border-white/15 hover:border-[#00E5FF] rounded-2xl px-4 py-2.5 text-white font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-4 h-4 text-[#00E5FF]" />
                      <span>{isAr ? 'تجربة تشغيل أول قناة' : 'Test First Channel'}</span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="space-y-3.5">
                  <FieldInput
                    label={isAr ? 'اسم التطبيق' : 'App Name'}
                    value={draftAppName}
                    onChange={setDraftAppName}
                  />
                  <FieldInput
                    label={isAr ? 'الوصف الترحيبي' : 'Tagline'}
                    value={draftTagline}
                    onChange={setDraftTagline}
                  />
                  <FieldInput
                    label={isAr ? 'شريط تنبيه أعلى الصفحة (اختياري)' : 'Top Notice Banner (Optional)'}
                    value={draftNotice}
                    onChange={setDraftNotice}
                    placeholder={isAr ? 'اتركه فارغاً لإخفاء الشريط' : 'Leave blank to hide'}
                  />

                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-300">
                      {isAr ? 'نسق الألوان' : 'Accent Theme'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'cyan-violet', label: isAr ? 'سماوي بنفسجي' : 'Cyan/Violet' },
                          { id: 'emerald-teal', label: isAr ? 'زمردي' : 'Emerald' },
                          { id: 'gold-amber', label: isAr ? 'ذهبي ملكي' : 'Gold Noir' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDraftAccent(opt.id)}
                          className={`min-h-[42px] rounded-xl font-bold px-2 cursor-pointer ${
                            draftAccent === opt.id
                              ? 'neon-gradient text-white'
                              : 'bg-[#090C16] border border-white/10 text-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <ToggleRow
                    label={isAr ? 'إظهار زر نسخ رابط البث' : 'Show Copy Stream URL Button'}
                    checked={draftShowCopy}
                    onChange={setDraftShowCopy}
                  />
                  <ToggleRow
                    label={isAr ? 'تشغيل الصوت بالخلفية' : 'Background Audio Mode'}
                    checked={draftBgAudio}
                    onChange={setDraftBgAudio}
                  />
                  <ToggleRow
                    label={isAr ? 'صورة داخل صورة (PiP)' : 'Picture in Picture (PiP)'}
                    checked={draftPip}
                    onChange={setDraftPip}
                  />
                </div>
              )}

              {activeTab === 'servers' && (
                <div className="space-y-4">
                  <FieldInput
                    label={isAr ? 'وسيط CORS للمتصفح (اتركه فارغاً داخل APK)' : 'Browser CORS Proxy'}
                    value={draftCorsProxy}
                    onChange={setDraftCorsProxy}
                    dir="ltr"
                    placeholder="https://corsproxy.io/?"
                  />

                  <div className="space-y-3">
                    {draftSources.map((src, idx) => {
                      const isActive = src.id === draftActiveSourceId;
                      return (
                        <div
                          key={src.id}
                          className={`rounded-2xl p-3.5 border space-y-2.5 bg-[#090C16]/85 ${
                            isActive ? 'border-[#00E5FF]/60' : 'border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setDraftActiveSourceId(src.id)}
                              className={`px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                                isActive
                                  ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50'
                                  : 'bg-white/5 text-slate-300'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isActive ? (isAr ? 'السيرفر النشط' : 'Active') : isAr ? 'تفعيل' : 'Activate'}</span>
                            </button>

                            {draftSources.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftSources((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="p-2 rounded-xl text-slate-400 hover:text-[#FF3B5C] cursor-pointer"
                                aria-label="Delete server"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <FieldInput
                            label={isAr ? 'اسم السيرفر' : 'Server Name'}
                            value={src.name}
                            onChange={(v) =>
                              setDraftSources((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, name: v } : item))
                              )
                            }
                          />
                          <FieldInput
                            label={isAr ? 'رابط السيرفر (Xtream Host)' : 'Server URL'}
                            value={src.server}
                            dir="ltr"
                            onChange={(v) =>
                              setDraftSources((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, server: v } : item))
                              )
                            }
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <FieldInput
                              label={isAr ? 'اسم المستخدم' : 'Username'}
                              value={src.username}
                              dir="ltr"
                              onChange={(v) =>
                                setDraftSources((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, username: v } : item
                                  )
                                )
                              }
                            />
                            <FieldInput
                              label={isAr ? 'كلمة المرور' : 'Password'}
                              value={src.password}
                              dir="ltr"
                              onChange={(v) =>
                                setDraftSources((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, password: v } : item
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setDraftSources((prev) => [
                        ...prev,
                        {
                          id: `xtream_${Date.now()}`,
                          name: `سيرفر ${prev.length + 1}`,
                          server: '',
                          username: '',
                          password: '',
                          enabled: true,
                          channelCount: 0,
                          status: 'idle',
                        },
                      ])
                    }
                    className="w-full min-h-[44px] rounded-2xl border border-dashed border-white/20 hover:border-[#00E5FF] text-slate-200 hover:text-[#00E5FF] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isAr ? 'إضافة سيرفر Xtream جديد' : 'Add Xtream Server'}</span>
                  </button>
                </div>
              )}

              {activeTab === 'categories' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-slate-300 font-bold">
                      {isAr
                        ? `التحكم في ظهور الأقسام (${xtreamCategories.length} قسم)`
                        : `Manage Categories (${xtreamCategories.length})`}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftHiddenCats([])}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#00E5FF] font-bold cursor-pointer"
                      >
                        {isAr ? 'إظهار الكل' : 'Show All'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftHiddenCats(xtreamCategories.map((c) => c.category_id))
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-bold cursor-pointer"
                      >
                        {isAr ? 'إخفاء الكل' : 'Hide All'}
                      </button>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-1.5 pe-1">
                    {xtreamCategories.map((cat) => {
                      const visible = !draftHiddenCats.includes(cat.category_id);
                      return (
                        <label
                          key={cat.category_id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-[#090C16]/80 border border-white/10 cursor-pointer hover:border-white/20"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={() => toggleCategoryVisibility(cat.category_id)}
                              className="w-4 h-4 accent-[#00E5FF] cursor-pointer"
                            />
                            <span className="font-bold text-white truncate">
                              {cat.category_name}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                            #{cat.category_id}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'links' && (
                <div className="space-y-4">
                  <div className="space-y-2.5">
                    <p className="font-bold text-white">
                      {isAr ? 'قنوات تيليجرام للاشتراك' : 'Telegram Subscription Channels'}
                    </p>
                    {draftLinks.map((lnk, idx) => (
                      <div
                        key={lnk.id}
                        className="bg-[#090C16]/80 border border-white/10 rounded-2xl p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={lnk.name}
                            onChange={(e) =>
                              setDraftLinks((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, name: e.target.value } : item
                                )
                              )
                            }
                            placeholder={isAr ? 'اسم القناة' : 'Channel name'}
                            className="flex-1 bg-[#11182B] border border-white/10 rounded-xl px-3 py-2 text-white font-bold"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setDraftLinks((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-2 rounded-xl text-slate-400 hover:text-[#FF3B5C] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="url"
                          dir="ltr"
                          value={lnk.url}
                          onChange={(e) =>
                            setDraftLinks((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, url: e.target.value } : item
                              )
                            )
                          }
                          placeholder="https://t.me/..."
                          className="w-full bg-[#11182B] border border-white/10 rounded-xl px-3 py-2 text-slate-200"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setDraftLinks((prev) => [
                          ...prev,
                          { id: `tg_${Date.now()}`, name: '', url: '' },
                        ])
                      }
                      className="w-full min-h-[42px] rounded-xl border border-dashed border-white/20 hover:border-[#00E5FF] text-slate-300 font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isAr ? 'إضافة قناة تيليجرام' : 'Add Telegram Channel'}</span>
                    </button>
                  </div>

                  <div className="border-t border-white/10 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FieldInput
                      label={isAr ? 'اسم المطور' : 'Developer Name'}
                      value={draftDevName}
                      onChange={setDraftDevName}
                      dir="ltr"
                    />
                    <FieldInput
                      label={isAr ? 'رابط حقوق المطور' : 'Developer URL'}
                      value={draftDevUrl}
                      onChange={setDraftDevUrl}
                      dir="ltr"
                    />
                  </div>
                  <FieldInput
                    label={isAr ? 'نص الحقوق (اختياري)' : 'Custom Copyright Text'}
                    value={draftCopyright}
                    onChange={setDraftCopyright}
                    placeholder={isAr ? 'اتركه فارغاً للنص الافتراضي' : 'Leave blank for default'}
                  />
                </div>
              )}

              {activeTab === 'security' && (
                <div className="space-y-4">
                  <FieldInput
                    label={isAr ? 'كلمة مرور لوحة التحكم' : 'Control Panel Password'}
                    value={draftAdminPin}
                    onChange={setDraftAdminPin}
                    dir="ltr"
                  />
                  <p className="text-[11px] text-slate-400">
                    {isAr
                      ? 'كلمة المرور الافتراضية هي 124+098123 ويمكنك تغييرها في أي وقت.'
                      : 'Default password is 124+098123 and can be changed anytime.'}
                  </p>

                  <div className="border-t border-white/10 pt-4 space-y-2">
                    {!confirmReset ? (
                      <button
                        type="button"
                        onClick={() => setConfirmReset(true)}
                        className="w-full min-h-[44px] rounded-2xl bg-[#FF3B5C]/15 border border-[#FF3B5C]/40 text-[#FF6B84] font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>{isAr ? 'استعادة الإعدادات الافتراضية' : 'Reset to Defaults'}</span>
                      </button>
                    ) : (
                      <div className="bg-[#FF3B5C]/10 border border-[#FF3B5C]/40 rounded-2xl p-3 space-y-2.5">
                        <p className="text-white font-bold text-center">
                          {isAr
                            ? 'هل أنت متأكد من استعادة جميع إعدادات لوحة التحكم والسيرفر؟'
                            : 'Confirm resetting all control panel and server settings?'}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onResetDefaults();
                              setConfirmReset(false);
                              onClose();
                            }}
                            className="min-h-[40px] rounded-xl bg-[#FF3B5C] text-white font-extrabold cursor-pointer"
                          >
                            {isAr ? 'نعم، استعادة' : 'Reset'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmReset(false)}
                            className="min-h-[40px] rounded-xl bg-white/10 text-white font-bold cursor-pointer"
                          >
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Save CTA */}
            <div className="px-5 py-3.5 border-t border-white/10 flex items-center justify-end gap-2.5 shrink-0 bg-[#090C16]/60">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                className="min-h-[44px] px-6 rounded-2xl neon-gradient text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isAr ? 'حفظ وتطبيق' : 'Save & Apply'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StatBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-[#090C16]/85 border border-white/10 rounded-2xl p-3">
    <p className="text-lg font-extrabold text-white tabular-nums truncate">{value}</p>
    <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
  </div>
);

const FieldInput: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  dir?: 'ltr' | 'rtl';
  placeholder?: string;
}> = ({ label, value, onChange, dir, placeholder }) => (
  <div className="space-y-1.5">
    <label className="block font-bold text-slate-300">{label}</label>
    <input
      type="text"
      dir={dir}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-11 bg-[#090C16] border border-white/15 rounded-xl px-3.5 text-white font-medium focus:outline-none focus:border-[#00E5FF]"
    />
  </div>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-white/10">
    <span className="font-bold text-slate-200">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
        checked ? 'bg-[#00E5FF]' : 'bg-slate-700'
      }`}
    >
      <span
        className={`block w-5.5 h-5.5 rounded-full bg-white shadow transition-transform ${
          checked
            ? '-translate-x-5.5 rtl:translate-x-0 ltr:translate-x-5.5'
            : 'translate-x-0 rtl:-translate-x-5.5'
        }`}
      />
    </button>
  </div>
);
