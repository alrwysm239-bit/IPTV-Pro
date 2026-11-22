import React, { useState } from 'react';
import {
  Star,
  PlayCircle,
  Sparkles,
  Music,
  PictureInPicture2,
  ShieldAlert,
  Languages,
  Palette,
  Trash2,
  Database,
  Plus,
  Upload,
  RefreshCw,
  Send,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Wifi,
  Info,
  Activity,
  RotateCcw,
  History,
} from 'lucide-react';
import { CORS_PROXY_PRESETS, TELEGRAM_URL } from '../constants/sources';
import { AppSettings, DeletedLogItem, M3USource, SourceFetchStats } from '../types/iptv';

interface SettingsViewProps {
  settings: AppSettings;
  sources: M3USource[];
  stats: SourceFetchStats;
  totalChannels: number;
  blacklistCount: number;
  deletedLog: DeletedLogItem[];
  isFetching: boolean;
  isCheckingHealth: boolean;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onToggleSource: (id: string) => void;
  onDeleteSource: (id: string) => void;
  onAddSourceUrl: (name: string, url: string) => void;
  onUploadSourceFile: (file: File) => void;
  onRefreshSources: () => void;
  onClearCache: () => void;
  onStartHealthScan: (mode: 'quick' | 'full') => void;
  onClearBlacklistAndRestore: () => void;
  onClearDeletedLog: () => void;
  onExportWorkingM3U: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  sources,
  stats,
  totalChannels,
  blacklistCount,
  deletedLog,
  isFetching,
  isCheckingHealth,
  onUpdateSettings,
  onToggleSource,
  onDeleteSource,
  onAddSourceUrl,
  onUploadSourceFile,
  onRefreshSources,
  onClearCache,
  onStartHealthScan,
  onClearBlacklistAndRestore,
  onClearDeletedLog,
  onExportWorkingM3U,
}) => {
  const isAr = settings.language === 'ar';
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showDeletedLogModal, setShowDeletedLogModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  const [srcName, setSrcName] = useState('');
  const [srcUrl, setSrcUrl] = useState('');
  const [pinInput, setPinInput] = useState(settings.pinCode || '0000');
  const [toastMsg, setToastMsg] = useState('');

  const Chevron = isAr ? ChevronLeft : ChevronRight;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!srcUrl.trim()) return;
    onAddSourceUrl(srcName.trim() || (isAr ? 'مصدر مخصص' : 'Custom Source'), srcUrl.trim());
    setSrcName('');
    setSrcUrl('');
    showToast(isAr ? 'تمت إضافة المصدر وجاري الجلب' : 'Source added & syncing');
  };

  return (
    <div className="space-y-3.5 pb-28 pt-2">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-white">
          {isAr ? 'الإعدادات' : 'Settings'}
        </h1>
        {toastMsg && (
          <span className="text-xs font-bold text-[#00E5FF] animate-pulse">
            {toastMsg}
          </span>
        )}
      </header>

      {/* بطاقة الهوية والنسخة */}
      <div className="neon-gradient rounded-3xl p-5 flex items-center justify-between shadow-[0_14px_34px_rgba(0,229,255,0.22)]">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-white tracking-tight">IPTV PRO</h2>
          <p className="text-xs font-bold text-white/90 tabular-nums">
            {isAr
              ? `الإصدار 1.0 • مفعّل • ${totalChannels.toLocaleString()} قناة`
              : `v1.0 • Active • ${totalChannels.toLocaleString()} channels`}
          </p>
        </div>
        <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[#7C4DFF] shadow-lg">
          <Star className="w-5 h-5 fill-current" />
        </div>
      </div>

      {/* قائمة الإعدادات المطابقة لستايل التصميم */}
      <div className="space-y-2.5">
        {/* إعدادات المشغل */}
        <SettingRow
          icon={<PlayCircle className="w-5 h-5 text-white" />}
          iconBg="bg-[#0EA5E9]"
          title={isAr ? 'المشغل' : 'Player'}
          subtitle={
            isAr
              ? `الذاكرة المؤقتة: ${settings.bufferLevel === 'low' ? 'منخفضة' : settings.bufferLevel === 'high' ? 'عالية' : 'متوسطة'} • الجودة: ${settings.defaultQuality}`
              : `Buffer: ${settings.bufferLevel} • Quality: ${settings.defaultQuality}`
          }
          onClick={() => setShowPlayerModal(true)}
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* إدارة المصادر */}
        <SettingRow
          icon={<Database className="w-5 h-5 text-white" />}
          iconBg="bg-[#7C4DFF]"
          title={isAr ? 'إدارة المصادر' : 'Manage Sources'}
          subtitle={
            isAr
              ? `${sources.filter((s) => s.enabled).length} من ${sources.length} مصدر مفعل`
              : `${sources.filter((s) => s.enabled).length} of ${sources.length} sources enabled`
          }
          onClick={() => setShowSourcesModal(true)}
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* فحص القنوات وحذف غير الشغالة */}
        <SettingRow
          icon={<Activity className="w-5 h-5 text-white" />}
          iconBg="bg-emerald-500"
          title={isAr ? 'فحص القنوات' : 'Check Channels'}
          subtitle={
            isAr
              ? `مجمع: ${settings.healthPoolSize} • دوري: ${settings.autoScanIntervalHours ? `كل ${settings.autoScanIntervalHours}س` : 'معطّل'} • ${settings.autoDeleteDead ? 'حذف تلقائي' : 'اسألني'}`
              : `Pool: ${settings.healthPoolSize} • Auto: ${settings.autoScanIntervalHours ? `${settings.autoScanIntervalHours}h` : 'Off'} • ${settings.autoDeleteDead ? 'Auto-Delete' : 'Ask'}`
          }
          onClick={() => setShowHealthModal(true)}
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* الجودة التلقائية */}
        <SettingToggleRow
          icon={<Sparkles className="w-5 h-5 text-white" />}
          iconBg="bg-[#06B6D4]"
          title={isAr ? 'الجودة التلقائية' : 'Auto Quality'}
          subtitle={isAr ? 'اختيار أفضل جودة حسب سرعة النت' : 'Adapt quality to bandwidth'}
          checked={settings.defaultQuality === 'auto'}
          onChange={(checked) =>
            onUpdateSettings({ defaultQuality: checked ? 'auto' : '720' })
          }
        />

        {/* تشغيل بالخلفية */}
        <SettingToggleRow
          icon={<Music className="w-5 h-5 text-white" />}
          iconBg="bg-[#3B82F6]"
          title={isAr ? 'تشغيل بالخلفية' : 'Background Audio'}
          subtitle={isAr ? 'استمرار الصوت عند الخروج' : 'Keep audio playing in background'}
          checked={settings.backgroundAudio}
          onChange={(checked) => onUpdateSettings({ backgroundAudio: checked })}
        />

        {/* صورة داخل صورة */}
        <SettingToggleRow
          icon={<PictureInPicture2 className="w-5 h-5 text-white" />}
          iconBg="bg-[#6366F1]"
          title={isAr ? 'صورة داخل صورة' : 'Picture in Picture'}
          subtitle="PiP"
          checked={settings.pipEnabled}
          onChange={(checked) => onUpdateSettings({ pipEnabled: checked })}
        />

        {/* توفير البيانات */}
        <SettingToggleRow
          icon={<Wifi className="w-5 h-5 text-white" />}
          iconBg="bg-[#10B981]"
          title={isAr ? 'توفير البيانات' : 'Data Saver'}
          subtitle={isAr ? 'تقليل استهلاك الباقة والشعارات' : 'Cap stream bitrate & image loads'}
          checked={settings.dataSaver}
          onChange={(checked) => onUpdateSettings({ dataSaver: checked })}
        />

        {/* القفل العائلي */}
        <SettingRow
          icon={<ShieldAlert className="w-5 h-5 text-white" />}
          iconBg="bg-[#F43F5E]"
          title={isAr ? 'القفل العائلي' : 'Parental Lock'}
          subtitle={
            settings.pinEnabled
              ? isAr
                ? 'مفعل برمز PIN'
                : 'Enabled with PIN'
              : isAr
                ? 'رمز PIN للقنوات'
                : 'PIN code protection'
          }
          onClick={() => setShowPinModal(true)}
          right={
            <span className={`text-xs font-bold ${settings.pinEnabled ? 'text-[#00E5FF]' : 'text-slate-400'}`}>
              {settings.pinEnabled ? (isAr ? 'مفعل' : 'On') : isAr ? 'معطل' : 'Off'}
            </span>
          }
        />

        {/* لغة التطبيق */}
        <SettingRow
          icon={<Languages className="w-5 h-5 text-white" />}
          iconBg="bg-[#2563EB]"
          title={isAr ? 'لغة التطبيق' : 'App Language'}
          subtitle={isAr ? 'العربية' : 'English'}
          onClick={() =>
            onUpdateSettings({ language: settings.language === 'ar' ? 'en' : 'ar' })
          }
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* المظهر */}
        <SettingRow
          icon={<Palette className="w-5 h-5 text-white" />}
          iconBg="bg-[#8B5CF6]"
          title={isAr ? 'المظهر' : 'Theme'}
          subtitle={
            settings.themeAccent === 'cyan-violet'
              ? isAr
                ? 'داكن • ألوان نيون'
                : 'Dark • Neon Cyan/Violet'
              : settings.themeAccent === 'emerald-teal'
                ? isAr
                  ? 'داكن • زمردي'
                  : 'Dark • Emerald'
                : isAr
                  ? 'داكن • ذهبي'
                  : 'Dark • Gold Noir'
          }
          onClick={() =>
            onUpdateSettings({
              themeAccent:
                settings.themeAccent === 'cyan-violet'
                  ? 'emerald-teal'
                  : settings.themeAccent === 'emerald-teal'
                    ? 'gold-amber'
                    : 'cyan-violet',
            })
          }
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* استعادة المحذوفات وتفريغ القائمة السوداء */}
        <SettingRow
          icon={<RotateCcw className="w-5 h-5 text-white" />}
          iconBg="bg-[#F59E0B]"
          title={isAr ? 'استعادة المحذوفات' : 'Restore Deleted Channels'}
          subtitle={
            isAr
              ? `${blacklistCount.toLocaleString()} رابط في القائمة السوداء`
              : `${blacklistCount.toLocaleString()} blacklisted dead URLs`
          }
          onClick={() => {
            onClearBlacklistAndRestore();
            showToast(isAr ? 'تمت استعادة المحذوفات وجاري المزامنة' : 'Blacklist cleared & restoring');
          }}
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* سجل آخر 100 قناة محذوفة */}
        <SettingRow
          icon={<History className="w-5 h-5 text-white" />}
          iconBg="bg-[#EC4899]"
          title={isAr ? 'سجل القنوات المحذوفة' : 'Deleted Channels Log'}
          subtitle={
            isAr
              ? `آخر ${deletedLog.length} قناة محذوفة مع السبب والوقت`
              : `Last ${deletedLog.length} deleted channels`
          }
          onClick={() => setShowDeletedLogModal(true)}
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* تصدير القنوات الشغالة كملف M3U نظيف */}
        <SettingRow
          icon={<Download className="w-5 h-5 text-white" />}
          iconBg="bg-[#14B8A6]"
          title={isAr ? 'تصدير القنوات الشغالة M3U' : 'Export Working M3U'}
          subtitle={isAr ? 'حفظ قائمة نظيفة للقنوات الصالحة للمشاركة' : 'Export clean working playlist'}
          onClick={onExportWorkingM3U}
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* مسح الذاكرة المؤقتة */}
        <SettingRow
          icon={<Trash2 className="w-5 h-5 text-white" />}
          iconBg="bg-[#475569]"
          title={isAr ? 'مسح الذاكرة المؤقتة' : 'Clear Cache'}
          subtitle={
            stats.lastUpdated
              ? `${isAr ? 'آخر تحديث:' : 'Updated:'} ${new Date(stats.lastUpdated).toLocaleTimeString()}`
              : isAr
                ? 'تنظيف بيانات IndexedDB'
                : 'Clear IndexedDB channel cache'
          }
          onClick={() => {
            onClearCache();
            showToast(isAr ? 'تم مسح الذاكرة المؤقتة' : 'Cache cleared');
          }}
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />

        {/* تصدير ملف HTML واحد للتحويل إلى APK */}
        <a
          href="/iptv-pro.html"
          download="IPTV-Pro.html"
          className="glass-card rounded-2xl p-3.5 flex items-center justify-between gap-3 hover:border-[#00E5FF]/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00E5FF]/20 text-[#00E5FF] flex items-center justify-center shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-white">
                {isAr ? 'تنزيل ملف HTML واحد (APK)' : 'Download Single HTML (APK)'}
              </p>
              <p className="text-[11px] text-slate-400">
                {isAr
                  ? 'ملف مستقل كامل جاهز للتحويل إلى تطبيق أندرويد'
                  : 'Standalone HTML+CSS+JS ready for APK'}
              </p>
            </div>
          </div>
          <Chevron className="w-4 h-4 text-[#00E5FF]" />
        </a>

        {/* قناتنا على تيليجرام */}
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-card rounded-2xl p-3.5 flex items-center justify-between gap-3 border-[#229ED9]/40 hover:border-[#229ED9] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#229ED9] text-white flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-white">
                {isAr ? 'قناتنا على تيليجرام' : 'Our Telegram Channel'}
              </p>
              <p className="text-[11px] text-slate-400" dir="ltr">
                t.me/qweqwe2019bot2bot
              </p>
            </div>
          </div>
          <Chevron className="w-4 h-4 text-[#229ED9]" />
        </a>

        {/* معلومات التطبيق */}
        <SettingRow
          icon={<Info className="w-5 h-5 text-white" />}
          iconBg="bg-[#334155]"
          title={isAr ? 'معلومات التطبيق' : 'App Info'}
          subtitle="IPTV Pro v1.0 • Web Worker + IndexedDB + HLS/DASH"
          onClick={() => setShowAboutModal(true)}
          right={<Chevron className="w-4 h-4 text-slate-400" />}
        />
      </div>

      {/* نافذة إدارة المصادر */}
      {showSourcesModal && (
        <ModalWrapper
          title={isAr ? 'إدارة المصادر (11 مصدراً + مخصص)' : 'Manage M3U Sources'}
          onClose={() => setShowSourcesModal(false)}
        >
          <div className="space-y-4">
            {/* إعداد وسيط CORS */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                {isAr ? 'وسيط CORS الاحتياطي (للمتصفح)' : 'CORS Proxy Fallback'}
              </label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {CORS_PROXY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => onUpdateSettings({ corsProxy: p.value })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                      settings.corsProxy === p.value
                        ? 'bg-[#00E5FF] text-[#090C16]'
                        : 'bg-white/5 text-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="url"
                dir="ltr"
                value={settings.corsProxy}
                onChange={(e) => onUpdateSettings({ corsProxy: e.target.value })}
                placeholder="https://corsproxy.io/?"
                className="w-full bg-[#090C16] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            {/* إضافة مصدر رابط M3U أو ملف من الجهاز */}
            <form onSubmit={handleAddSource} className="space-y-2 border-t border-white/10 pt-3">
              <p className="text-xs font-bold text-[#00E5FF]">
                {isAr ? 'إضافة مصدر M3U خاص' : 'Add Custom M3U Source'}
              </p>
              <input
                type="text"
                value={srcName}
                onChange={(e) => setSrcName(e.target.value)}
                placeholder={isAr ? 'اسم المصدر (اختياري)' : 'Source name'}
                className="w-full bg-[#090C16] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
              />
              <div className="flex gap-2">
                <input
                  type="url"
                  dir="ltr"
                  value={srcUrl}
                  onChange={(e) => setSrcUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u"
                  className="flex-1 bg-[#090C16] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="neon-gradient px-3.5 py-2 rounded-xl text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAr ? 'إضافة' : 'Add'}</span>
                </button>
              </div>
              <label className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-dashed border-white/20 text-xs font-bold text-slate-300 hover:border-[#00E5FF] hover:text-[#00E5FF] cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{isAr ? 'أو استيراد ملف M3U من الجهاز' : 'Or import M3U file from device'}</span>
                <input
                  type="file"
                  accept=".m3u,.m3u8,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadSourceFile(file);
                  }}
                />
              </label>
            </form>

            {/* زر تحديث يدوي */}
            <button
              type="button"
              onClick={onRefreshSources}
              disabled={isFetching}
              className="w-full neon-gradient py-2.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تحديث جميع المصادر الآن' : 'Refresh All Sources Now'}</span>
            </button>

            {/* قائمة المصادر وإحصائيات القنوات */}
            <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
              {sources.map((src) => (
                <div
                  key={src.id}
                  className="bg-[#090C16]/80 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          src.status === 'success'
                            ? 'bg-emerald-400'
                            : src.status === 'loading'
                              ? 'bg-[#00E5FF] animate-pulse'
                              : src.status === 'error'
                                ? 'bg-[#FF3B5C]'
                                : 'bg-slate-500'
                        }`}
                      />
                      <p className="text-xs font-bold text-white truncate">{src.name}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                      {src.channelCount.toLocaleString()} {isAr ? 'قناة' : 'ch'} •{' '}
                      {src.status === 'error' ? (isAr ? 'تم التجاوز' : 'Skipped') : src.status}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {src.custom && (
                      <button
                        type="button"
                        onClick={() => onDeleteSource(src.id)}
                        className="p-1.5 text-slate-400 hover:text-[#FF3B5C] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <ToggleSwitch
                      checked={src.enabled}
                      onChange={() => onToggleSource(src.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* نافذة فحص القنوات وإعدادات المجمع */}
      {showHealthModal && (
        <ModalWrapper
          title={isAr ? 'فحص القنوات وحذف غير الشغالة' : 'Channel Health Checker'}
          onClose={() => setShowHealthModal(false)}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isCheckingHealth}
                onClick={() => {
                  setShowHealthModal(false);
                  onStartHealthScan('quick');
                }}
                className="neon-gradient py-3 rounded-2xl text-white font-extrabold cursor-pointer disabled:opacity-50"
              >
                {isAr ? '⚡ فحص سريع' : '⚡ Quick Scan'}
              </button>
              <button
                type="button"
                disabled={isCheckingHealth}
                onClick={() => {
                  setShowHealthModal(false);
                  onStartHealthScan('full');
                }}
                className="bg-[#090C16] border border-[#00E5FF]/50 py-3 rounded-2xl text-[#00E5FF] font-extrabold cursor-pointer disabled:opacity-50"
              >
                {isAr ? '🔍 فحص كامل' : '🔍 Full Scan'}
              </button>
            </div>

            <div className="space-y-2 bg-[#090C16]/70 border border-white/10 rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">
                  {isAr ? 'حجم مجمع الفحص المتوازي (Pool)' : 'Concurrent Check Pool'}
                </span>
                <span className="text-[#00E5FF] font-extrabold tabular-nums">
                  {settings.healthPoolSize} {isAr ? 'قناة' : 'ch'}
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={40}
                step={1}
                value={settings.healthPoolSize}
                onChange={(e) =>
                  onUpdateSettings({ healthPoolSize: Number(e.target.value) })
                }
                className="w-full accent-[#00E5FF] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>5</span>
                <span>15 ({isAr ? 'افتراضي' : 'Default'})</span>
                <span>40</span>
              </div>
            </div>

            <div className="space-y-2 bg-[#090C16]/70 border border-white/10 rounded-2xl p-3">
              <p className="font-bold text-white">
                {isAr ? 'الفحص الدوري التلقائي في الخلفية' : 'Periodic Background Auto-Scan'}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {([6, 12, 24, 0] as const).map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => onUpdateSettings({ autoScanIntervalHours: hrs })}
                    className={`py-2 rounded-xl font-bold cursor-pointer ${
                      settings.autoScanIntervalHours === hrs
                        ? 'neon-gradient text-white'
                        : 'bg-[#090C16] text-slate-300 border border-white/10'
                    }`}
                  >
                    {hrs === 0
                      ? isAr
                        ? 'معطّل'
                        : 'Off'
                      : isAr
                        ? `${hrs} س`
                        : `${hrs}h`}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">
                {isAr
                  ? 'يعمل أيضاً بعد تحديث المصادر (على الواي فاي فقط إذا كان توفير البيانات مفعّلاً)'
                  : 'Also runs after source updates (Wi-Fi only when Data Saver is on)'}
              </p>
            </div>

            <div className="space-y-2 bg-[#090C16]/70 border border-white/10 rounded-2xl p-3">
              <p className="font-bold text-white">
                {isAr ? 'الحذف التلقائي للقنوات الميتة' : 'Auto-Delete Dead Channels'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ autoDeleteDead: true })}
                  className={`py-2 rounded-xl font-bold cursor-pointer ${
                    settings.autoDeleteDead
                      ? 'neon-gradient text-white'
                      : 'bg-[#090C16] text-slate-300 border border-white/10'
                  }`}
                >
                  {isAr ? 'حذف تلقائي' : 'Auto Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ autoDeleteDead: false })}
                  className={`py-2 rounded-xl font-bold cursor-pointer ${
                    !settings.autoDeleteDead
                      ? 'neon-gradient text-white'
                      : 'bg-[#090C16] text-slate-300 border border-white/10'
                  }`}
                >
                  {isAr ? 'اسألني قبل الحذف' : 'Ask Before Delete'}
                </button>
              </div>
            </div>

            {settings.lastHealthCheckAt && (
              <p className="text-[11px] text-slate-400 text-center">
                {isAr ? 'آخر فحص:' : 'Last checked:'}{' '}
                {new Date(settings.lastHealthCheckAt).toLocaleString()}
              </p>
            )}
          </div>
        </ModalWrapper>
      )}

      {/* نافذة سجل آخر 100 قناة محذوفة */}
      {showDeletedLogModal && (
        <ModalWrapper
          title={isAr ? `سجل المحذوفات (آخر ${deletedLog.length})` : `Deleted Log (${deletedLog.length})`}
          onClose={() => setShowDeletedLogModal(false)}
        >
          <div className="space-y-3 text-xs">
            {deletedLog.length === 0 ? (
              <p className="text-center text-slate-400 py-8">
                {isAr ? 'لا توجد قنوات محذوفة مسجلة بعد' : 'No deleted channels logged yet'}
              </p>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">
                    {isAr ? 'الاحتفاظ بآخر 100 قناة محذوفة' : 'Last 100 deleted channels'}
                  </span>
                  <button
                    type="button"
                    onClick={onClearDeletedLog}
                    className="text-[#FF3B5C] font-bold cursor-pointer hover:underline"
                  >
                    {isAr ? 'مسح السجل' : 'Clear Log'}
                  </button>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto no-scrollbar">
                  {deletedLog.map((item) => (
                    <div
                      key={`${item.id}_${item.deletedAt}`}
                      className="bg-[#090C16]/80 border border-white/10 rounded-xl p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-white truncate">{item.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(item.deletedAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#FF3B5C] font-bold">{item.reason}</p>
                      <p className="text-[10px] text-slate-500 truncate" dir="ltr">
                        {item.url}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </ModalWrapper>
      )}

      {/* نافذة إعدادات المشغل */}
      {showPlayerModal && (
        <ModalWrapper
          title={isAr ? 'إعدادات المشغل الاحترافي' : 'Player Settings'}
          onClose={() => setShowPlayerModal(false)}
        >
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">
                {isAr ? 'الجودة الافتراضية' : 'Default Quality'}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['auto', '1080', '720', '480'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onUpdateSettings({ defaultQuality: q })}
                    className={`py-2 rounded-xl font-bold cursor-pointer ${
                      settings.defaultQuality === q
                        ? 'neon-gradient text-white'
                        : 'bg-[#090C16] text-slate-300 border border-white/10'
                    }`}
                  >
                    {q === 'auto' ? (isAr ? 'تلقائي' : 'Auto') : `${q}p`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">
                {isAr ? 'حجم الذاكرة المؤقتة (Buffer)' : 'Buffer Size'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'low', label: isAr ? 'منخفض (سريع)' : 'Low Latency' },
                    { id: 'medium', label: isAr ? 'متوسط' : 'Balanced' },
                    { id: 'high', label: isAr ? 'عالي (ثبات)' : 'High Stability' },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onUpdateSettings({ bufferLevel: b.id })}
                    className={`py-2 px-2 rounded-xl font-bold cursor-pointer ${
                      settings.bufferLevel === b.id
                        ? 'neon-gradient text-white'
                        : 'bg-[#090C16] text-slate-300 border border-white/10'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* نافذة القفل العائلي */}
      {showPinModal && (
        <ModalWrapper
          title={isAr ? 'القفل العائلي برمز PIN' : 'Parental PIN Lock'}
          onClose={() => setShowPinModal(false)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">
                {isAr ? 'تفعيل قفل القنوات عند الفتح' : 'Enable PIN lock on launch'}
              </span>
              <ToggleSwitch
                checked={settings.pinEnabled}
                onChange={(v) => onUpdateSettings({ pinEnabled: v })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                {isAr ? 'رمز PIN (4 أرقام)' : '4-digit PIN'}
              </label>
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full bg-[#090C16] border border-white/10 rounded-xl px-4 py-3 text-center text-lg tracking-[0.6em] text-white font-bold"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (pinInput.length === 4) {
                  onUpdateSettings({ pinCode: pinInput });
                  setShowPinModal(false);
                  showToast(isAr ? 'تم حفظ رمز PIN' : 'PIN saved');
                }
              }}
              className="w-full neon-gradient py-2.5 rounded-xl text-xs font-extrabold text-white cursor-pointer"
            >
              {isAr ? 'حفظ الرمز' : 'Save PIN'}
            </button>
          </div>
        </ModalWrapper>
      )}

      {/* نافذة معلومات التطبيق */}
      {showAboutModal && (
        <ModalWrapper
          title={isAr ? 'حول IPTV Pro' : 'About IPTV Pro'}
          onClose={() => setShowAboutModal(false)}
        >
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <p className="font-bold text-white">IPTV Pro v1.0</p>
            <p>
              {isAr
                ? 'مشغل بث مباشر احترافي يدعم HLS وDASH وMP4 وTS مع تحليل M3U داخل Web Worker وتخزين مؤقت ذكي في IndexedDB.'
                : 'Professional live TV player supporting HLS, DASH, MP4, and TS with Web Worker M3U parsing and IndexedDB caching.'}
            </p>
            <p className="text-[#00E5FF]">
              {isAr
                ? 'يمكنك تنزيل نسخة ملف HTML الواحد مباشرة من الإعدادات لتحويلها إلى APK عبر Capacitor أو WebView.'
                : 'Download the standalone single-file HTML from Settings to package directly as an Android APK.'}
            </p>
          </div>
        </ModalWrapper>
      )}
    </div>
  );
};

const SettingRow: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  right: React.ReactNode;
}> = ({ icon, iconBg, title, subtitle, onClick, right }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-3 text-start hover:border-white/20 transition-colors cursor-pointer"
  >
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-md`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-white truncate">{title}</p>
        <p className="text-[11px] text-slate-400 truncate mt-0.5">{subtitle}</p>
      </div>
    </div>
    <div className="shrink-0">{right}</div>
  </button>
);

const SettingToggleRow: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ icon, iconBg, title, subtitle, checked, onChange }) => (
  <div className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-md`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-white truncate">{title}</p>
        <p className="text-[11px] text-slate-400 truncate mt-0.5">{subtitle}</p>
      </div>
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} />
  </div>
);

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
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
        checked ? '-translate-x-5.5 rtl:translate-x-0 ltr:translate-x-5.5' : 'translate-x-0 rtl:-translate-x-5.5'
      }`}
    />
  </button>
);

const ModalWrapper: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    onClick={onClose}
  >
    <div
      className="glass-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 border border-white/15 max-h-[88vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-extrabold text-white">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
