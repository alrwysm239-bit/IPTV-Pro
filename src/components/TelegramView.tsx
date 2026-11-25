import React from 'react';
import { ExternalLink, Send, ShieldCheck, UserCheck } from 'lucide-react';
import { AppSettings } from '../types/iptv';

interface TelegramViewProps {
  settings: AppSettings;
}

export const TelegramView: React.FC<TelegramViewProps> = ({ settings }) => {
  const isAr = settings.language === 'ar';

  return (
    <div className="space-y-5 pb-28 pt-2">
      <header className="space-y-1">
        <h1 className="text-xl font-extrabold text-white">
          {isAr ? 'قنواتنا على تيليجرام' : 'Our Telegram Channels'}
        </h1>
        <p className="text-xs text-slate-400">
          {isAr
            ? 'اشترك في قنواتنا الرسمية لمتابعة التحديثات والبوتات والتطبيقات الحصرية'
            : 'Subscribe to our official Telegram channels for live updates and releases'}
        </p>
      </header>

      {/* بطاقات الاشتراك في قنوات تيليجرام */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {settings.telegramLinks.map((lnk) => (
          <a
            key={lnk.id}
            href={lnk.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card rounded-2xl p-4 flex flex-col justify-between gap-4 border border-[#229ED9]/30 hover:border-[#229ED9] transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#229ED9]/20 border border-[#229ED9]/40 text-[#38BDF8] flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="text-sm font-extrabold text-white truncate">{lnk.name}</h2>
                {lnk.description && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">{lnk.description}</p>
                )}
                <p className="text-[11px] text-[#38BDF8] truncate" dir="ltr">
                  {lnk.url.replace(/^https?:\/\//, '')}
                </p>
              </div>
            </div>

            <div className="min-h-[42px] rounded-xl bg-[#229ED9] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md">
              <span>{isAr ? 'اشتراك في القناة' : 'Subscribe Now'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </a>
        ))}
      </div>

      {/* بطاقة حقوق المطور */}
      <section className="glass-card rounded-3xl p-5 border border-[#00E5FF]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl neon-gradient text-white flex items-center justify-center shrink-0 shadow-lg">
            <UserCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-white">
                {isAr ? 'حقوق المطور والتواصل' : 'Developer Credits'}
              </h3>
              <ShieldCheck className="w-4 h-4 text-[#00E5FF]" />
            </div>
            <p className="text-xs text-slate-300">
              {settings.copyrightText.trim() ||
                (isAr
                  ? `© ${new Date().getFullYear()} جميع الحقوق محفوظة للمطور`
                  : `© ${new Date().getFullYear()} All rights reserved`)}
            </p>
            <p className="text-xs font-bold text-[#00E5FF]" dir="ltr">
              @{settings.devName.replace(/^@/, '')} · {settings.devUrl}
            </p>
          </div>
        </div>

        <a
          href={settings.devUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] px-5 py-2.5 rounded-2xl neon-gradient text-white font-extrabold text-xs inline-flex items-center justify-center gap-2 shadow-lg shrink-0"
        >
          <Send className="w-4 h-4" />
          <span>{isAr ? 'تواصل عبر تيليجرام' : 'Open Telegram'}</span>
        </a>
      </section>
    </div>
  );
};
