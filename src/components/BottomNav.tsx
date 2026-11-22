import React from 'react';
import { Home, Tv, Heart, Settings } from 'lucide-react';
import { TabId } from '../types/iptv';

interface BottomNavProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
  lang: 'ar' | 'en';
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChange, lang }) => {
  const items: { id: TabId; labelAr: string; labelEn: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'home', labelAr: 'الرئيسية', labelEn: 'Home', Icon: Home },
    { id: 'channels', labelAr: 'القنوات', labelEn: 'Channels', Icon: Tv },
    { id: 'favorites', labelAr: 'المفضلة', labelEn: 'Favorites', Icon: Heart },
    { id: 'settings', labelAr: 'الإعدادات', labelEn: 'Settings', Icon: Settings },
  ];

  return (
    <div className="fixed bottom-3 inset-x-0 z-40 px-4 pointer-events-none flex justify-center">
      <nav
        aria-label={lang === 'ar' ? 'التنقل الرئيسي' : 'Main Navigation'}
        className="pointer-events-auto glass-nav w-full max-w-md md:max-w-lg rounded-3xl px-2 py-1.5 grid grid-cols-4 gap-1"
      >
        {items.map(({ id, labelAr, labelEn, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 transition-all duration-200 cursor-pointer ${
                active
                  ? 'neon-gradient text-white shadow-[0_6px_20px_rgba(0,229,255,0.3)]'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-bold whitespace-nowrap">
                {lang === 'ar' ? labelAr : labelEn}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
