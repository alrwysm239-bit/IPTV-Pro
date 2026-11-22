import React, { useState } from 'react';
import {
  Activity,
  Pause,
  Play,
  X,
  Minimize2,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Download,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { HealthScanProgress } from '../types/iptv';

interface HealthScanModalProps {
  scan: HealthScanProgress;
  isAr: boolean;
  totalDeadInLibrary: number;
  totalOnlineInLibrary: number;
  onPauseToggle: () => void;
  onCancel: () => void;
  onMinimize: (min: boolean) => void;
  onCloseSummary: () => void;
  onDeleteDead: () => void;
  onKeepOnlineOnly: () => void;
  onRetryDead: () => void;
  onExportWorkingM3U: () => void;
}

function formatEta(sec: number, isAr: boolean): string {
  if (!Number.isFinite(sec) || sec <= 0) return isAr ? 'أقل من ثانية' : '<1s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return isAr ? `${s} ث` : `${s}s`;
  return isAr ? `${m} د ${s} ث` : `${m}m ${s}s`;
}

export const HealthScanModal: React.FC<HealthScanModalProps> = ({
  scan,
  isAr,
  totalDeadInLibrary,
  totalOnlineInLibrary,
  onPauseToggle,
  onCancel,
  onMinimize,
  onCloseSummary,
  onDeleteDead,
  onKeepOnlineOnly,
  onRetryDead,
  onExportWorkingM3U,
}) => {
  const [confirmAction, setConfirmAction] = useState<'dead' | 'keep-online' | null>(null);

  if (!scan.active && !scan.finished) return null;

  const pct = scan.total > 0 ? Math.min(100, Math.round((scan.checked / scan.total) * 100)) : 0;

  // الشريط العائم عند التصغير للاستمرار بالخلفية
  if (scan.active && scan.minimized) {
    return (
      <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-40 glass-card rounded-2xl p-3 border border-[#00E5FF]/50 shadow-2xl space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div
            onClick={() => onMinimize(false)}
            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
          >
            <Activity className="w-4 h-4 text-[#00E5FF] animate-pulse shrink-0" />
            <span className="text-xs font-extrabold text-white truncate tabular-nums">
              {isAr
                ? `فحص القنوات: ${scan.checked}/${scan.total} (${pct}%)`
                : `Scanning: ${scan.checked}/${scan.total} (${pct}%)`}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onPauseToggle}
              className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white cursor-pointer"
              aria-label={scan.paused ? 'Resume' : 'Pause'}
            >
              {scan.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onMinimize(false)}
              className="px-2 py-1 rounded-lg neon-gradient text-[10px] font-bold text-white cursor-pointer"
            >
              {isAr ? 'عرض' : 'Open'}
            </button>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#090C16] overflow-hidden">
          <div className="h-full neon-gradient transition-all duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-md rounded-3xl p-5 border border-white/15 space-y-5">
        {/* الترويسة */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl neon-gradient flex items-center justify-center text-white">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                {scan.finished
                  ? isAr
                    ? 'ملخص فحص القنوات'
                    : 'Health Scan Summary'
                  : isAr
                    ? 'جاري فحص القنوات'
                    : 'Checking Channels'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {scan.mode === 'quick'
                  ? isAr
                    ? 'فحص سريع (غير المفحوصة والميتة)'
                    : 'Quick Scan'
                  : scan.mode === 'retry-dead'
                    ? isAr
                      ? 'إعادة فحص القنوات الميتة'
                      : 'Retrying Dead Channels'
                    : isAr
                      ? 'فحص شامل لجميع القنوات'
                      : 'Full Scan'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {scan.active && (
              <button
                type="button"
                onClick={() => onMinimize(true)}
                className="w-8 h-8 rounded-xl bg-white/5 text-slate-300 hover:text-[#00E5FF] flex items-center justify-center cursor-pointer"
                title={isAr ? 'تصغير للخلفية' : 'Minimize'}
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
            {scan.finished && (
              <button
                type="button"
                onClick={() => {
                  setConfirmAction(null);
                  onCloseSummary();
                }}
                className="w-8 h-8 rounded-xl bg-white/5 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* شريط التقدم والعداد الحي */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold tabular-nums">
            <span className="text-white">
              {isAr
                ? `تم فحص ${scan.checked.toLocaleString()} من ${scan.total.toLocaleString()}`
                : `Checked ${scan.checked.toLocaleString()} of ${scan.total.toLocaleString()}`}
            </span>
            <span className="text-[#00E5FF]">{pct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-[#090C16] overflow-hidden border border-white/5">
            <div
              className="h-full neon-gradient transition-all duration-200 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          {scan.active && (
            <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
              <span>
                {isAr
                  ? `السرعة: ${scan.speedPerSec.toFixed(1)} قناة/ث`
                  : `Speed: ${scan.speedPerSec.toFixed(1)} ch/s`}
              </span>
              <span>
                {isAr
                  ? `المتبقي تقريباً: ${formatEta(scan.etaSec, isAr)}`
                  : `ETA: ${formatEta(scan.etaSec, isAr)}`}
              </span>
            </div>
          )}
        </div>

        {/* إحصائيات النتائج */}
        <div className="grid grid-cols-3 gap-2.5 text-center">
          <div className="bg-[#090C16]/80 border border-emerald-500/25 rounded-2xl p-3">
            <p className="text-lg font-extrabold text-emerald-400 tabular-nums">
              {scan.online.toLocaleString()}
            </p>
            <p className="text-[11px] font-bold text-slate-300">{isAr ? 'شغالة' : 'Working'}</p>
          </div>
          <div className="bg-[#090C16]/80 border border-[#FF3B5C]/25 rounded-2xl p-3">
            <p className="text-lg font-extrabold text-[#FF3B5C] tabular-nums">
              {scan.dead.toLocaleString()}
            </p>
            <p className="text-[11px] font-bold text-slate-300">{isAr ? 'ميتة' : 'Dead'}</p>
          </div>
          <div className="bg-[#090C16]/80 border border-slate-500/25 rounded-2xl p-3">
            <p className="text-lg font-extrabold text-amber-400 tabular-nums">
              {scan.uncertain.toLocaleString()}
            </p>
            <p className="text-[11px] font-bold text-slate-300">{isAr ? 'غير مؤكدة' : 'Uncertain'}</p>
          </div>
        </div>

        {/* أزرار التحكم أثناء الفحص */}
        {scan.active && (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onPauseToggle}
              className="py-2.5 rounded-2xl glass-card text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 hover:border-[#00E5FF] cursor-pointer"
            >
              {scan.paused ? (
                <>
                  <Play className="w-4 h-4 text-[#00E5FF]" />
                  <span>{isAr ? 'استئناف' : 'Resume'}</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 text-[#FFC857]" />
                  <span>{isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="py-2.5 rounded-2xl bg-[#FF3B5C]/20 border border-[#FF3B5C]/40 text-xs font-extrabold text-[#FF3B5C] inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>{isAr ? 'إلغاء الفحص' : 'Cancel'}</span>
            </button>
          </div>
        )}

        {/* نافذة تأكيد الحذف */}
        {scan.finished && confirmAction && (
          <div className="bg-[#FF3B5C]/10 border border-[#FF3B5C]/40 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-start gap-2 text-xs text-white font-bold">
              <AlertCircle className="w-4 h-4 text-[#FF3B5C] shrink-0 mt-0.5" />
              <p>
                {confirmAction === 'dead'
                  ? isAr
                    ? `هل أنت متأكد من حذف ${totalDeadInLibrary.toLocaleString()} قناة ميتة وإضافتها للقائمة السوداء؟`
                    : `Delete ${totalDeadInLibrary.toLocaleString()} dead channels and blacklist them?`
                  : isAr
                    ? `سيتم الإبقاء على ${totalOnlineInLibrary.toLocaleString()} قناة شغالة فقط وحذف البقية. هل تريد المتابعة؟`
                    : `Keep only ${totalOnlineInLibrary.toLocaleString()} working channels and delete all others?`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (confirmAction === 'dead') onDeleteDead();
                  else onKeepOnlineOnly();
                  setConfirmAction(null);
                  onCloseSummary();
                }}
                className="py-2 rounded-xl bg-[#FF3B5C] text-white text-xs font-extrabold cursor-pointer"
              >
                {isAr ? 'تأكيد الحذف' : 'Confirm Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="py-2 rounded-xl bg-white/10 text-slate-200 text-xs font-bold cursor-pointer"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* أزرار ما بعد الانتهاء */}
        {scan.finished && !confirmAction && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={totalDeadInLibrary === 0}
              onClick={() => setConfirmAction('dead')}
              className="w-full py-2.5 rounded-2xl bg-[#FF3B5C] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" />
              <span>
                {isAr
                  ? `احذف القنوات الميتة (${totalDeadInLibrary.toLocaleString()})`
                  : `Delete Dead Channels (${totalDeadInLibrary.toLocaleString()})`}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={totalOnlineInLibrary === 0}
                onClick={() => setConfirmAction('keep-online')}
                className="py-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isAr ? 'أبقِ الشغالة فقط' : 'Keep Working Only'}</span>
              </button>

              <button
                type="button"
                disabled={totalDeadInLibrary === 0}
                onClick={() => {
                  setConfirmAction(null);
                  onRetryDead();
                }}
                className="py-2.5 rounded-2xl glass-card text-slate-200 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 hover:border-[#00E5FF] cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span>{isAr ? 'إعادة فحص الميتة' : 'Retry Dead'}</span>
              </button>
            </div>

            <button
              type="button"
              disabled={totalOnlineInLibrary === 0}
              onClick={onExportWorkingM3U}
              className="w-full py-2.5 rounded-2xl neon-gradient text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>
                {isAr
                  ? `تصدير القنوات الشغالة M3U (${totalOnlineInLibrary.toLocaleString()})`
                  : `Export Working M3U (${totalOnlineInLibrary.toLocaleString()})`}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
