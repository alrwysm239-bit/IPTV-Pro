import React, { useEffect, useRef, useState } from 'react';
import { acquireLogoSlot, releaseLogoSlot } from '../utils/streamHealth';

interface ChannelLogoProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  dataSaver?: boolean;
}

const AVATAR_GRADIENTS = [
  'from-[#00E5FF] to-[#7C4DFF]',
  'from-[#FF3B5C] to-[#FF8A5C]',
  'from-[#10B981] to-[#00E5FF]',
  'from-[#FFC857] to-[#FF6B6B]',
  'from-[#7C4DFF] to-[#EC4899]',
  'from-[#38BDF8] to-[#3B82F6]',
];

function pickColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return 'TV';
  const words = clean.split(/\s+/);
  if (words.length >= 2 && /^[A-Za-z0-9]+$/.test(words[0])) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const ChannelLogo: React.FC<ChannelLogoProps> = ({
  src,
  name,
  size = 'md',
  dataSaver = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [canLoad, setCanLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const slotHeldRef = useRef(false);

  const dims =
    size === 'sm'
      ? 'w-11 h-11 text-sm'
      : size === 'lg'
        ? 'w-14 h-14 text-base'
        : 'w-12 h-12 text-sm';

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setCanLoad(false);
    if (!src || dataSaver) return;

    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src, dataSaver]);

  useEffect(() => {
    if (!inView || !src || dataSaver || failed) return;
    let active = true;
    acquireLogoSlot().then(() => {
      if (!active) {
        releaseLogoSlot();
        return;
      }
      slotHeldRef.current = true;
      setCanLoad(true);
    });
    return () => {
      active = false;
      if (slotHeldRef.current) {
        slotHeldRef.current = false;
        releaseLogoSlot();
      }
    };
  }, [inView, src, dataSaver, failed]);

  const releaseOnce = () => {
    if (slotHeldRef.current) {
      slotHeldRef.current = false;
      releaseLogoSlot();
    }
  };

  const showImage = Boolean(src && !dataSaver && canLoad && !failed);
  const gradient = pickColor(name);
  const initials = getInitials(name);

  return (
    <div
      ref={containerRef}
      className={`${dims} relative shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br ${gradient} shadow-md ring-1 ring-white/15 select-none`}
    >
      <span className={`font-extrabold text-white tracking-tight ${loaded && !failed ? 'opacity-0' : 'opacity-100'} transition-opacity`}>
        {initials}
      </span>
      {showImage && (
        <img
          src={src}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => {
            setLoaded(true);
            releaseOnce();
          }}
          onError={() => {
            setFailed(true);
            releaseOnce();
          }}
          className={`absolute inset-0 w-full h-full object-contain bg-[#0F1629]/90 p-1 transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
};
