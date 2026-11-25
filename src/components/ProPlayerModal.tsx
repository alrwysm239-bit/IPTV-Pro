import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import * as dashjs from 'dashjs';
import {
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
  PictureInPicture2,
  Lock,
  Unlock,
  Heart,
  Share2,
  CircleDot,
  Clock,
  Sliders,
  Subtitles,
  Volume2,
  Sun,
  RefreshCw,
  AlertTriangle,
  Monitor,
  Headphones,
  Loader2,
  X,
  Flag,
  Trash2,
  Copy,
} from 'lucide-react';
import { AppSettings, Channel } from '../types/iptv';
import { ChannelLogo } from './ChannelLogo';

interface ProPlayerModalProps {
  channel: Channel;
  allChannels: Channel[];
  isFavorite: boolean;
  settings: AppSettings;
  minimized: boolean;
  onMinimize: (min: boolean) => void;
  onClose: () => void;
  onSwitchChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
  onUpdateVolume: (vol: number) => void;
  onPlaybackSuccess: (channelId: string) => void;
  onPlaybackAllFailed: (channel: Channel, reason: string) => void;
  onReportNotWorking: (channel: Channel) => Promise<void>;
  onDeleteChannel: (channel: Channel) => void;
}

type AspectMode = 'fit' | 'fill' | '16:9' | '4:3' | 'zoom';

const ASPECT_LABELS: Record<AspectMode, string> = {
  fit: 'Fit',
  fill: 'Fill',
  '16:9': '16:9',
  '4:3': '4:3',
  zoom: 'Zoom',
};

export const ProPlayerModal: React.FC<ProPlayerModalProps> = ({
  channel,
  allChannels,
  isFavorite,
  settings,
  minimized,
  onMinimize,
  onClose,
  onSwitchChannel,
  onToggleFavorite,
  onUpdateVolume,
  onPlaybackSuccess,
  onPlaybackAllFailed,
  onReportNotWorking,
  onDeleteChannel,
}) => {
  const isAr = settings.language === 'ar';
  const BackIcon = isAr ? ChevronRight : ChevronLeft;

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const noFrameTimerRef = useRef<number | null>(null);
  const attemptCycleRef = useRef<number>(0);
  const playbackReportedOkRef = useRef<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number; side: 'left' | 'right'; startVal: number } | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' }>({ time: 0, side: 'left' });

  const [urlIndex, setUrlIndex] = useState(0);
  const [retrySeed, setRetrySeed] = useState(0);
  const [isReporting, setIsReporting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [aspect, setAspect] = useState<AspectMode>('fit');
  const [speed, setSpeed] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [volume, setVolume] = useState(settings.volume ?? 0.9);
  const [hudOverlay, setHudOverlay] = useState<{ type: 'vol' | 'bright' | 'seek'; text: string } | null>(null);

  const [levels, setLevels] = useState<{ index: number; label: string; height: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [activeResBadge, setActiveResBadge] = useState<string>(channel.quality);

  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string }[]>([]);
  const [currentAudio, setCurrentAudio] = useState(0);
  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; name: string }[]>([]);
  const [currentSub, setCurrentSub] = useState(-1);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'none' | 'quality' | 'audio' | 'cc' | 'sleep' | 'speed'>('none');
  const [toast, setToast] = useState('');

  const rawCandidateUrls = useMemo(
    () => [channel.url, ...(channel.fallbacks || [])].filter(Boolean),
    [channel]
  );

  const candidateUrls = useMemo(() => {
    const isHttpsPage =
      typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isApkWebView =
      typeof window !== 'undefined' &&
      window.location.hostname === 'appassets.androidplatform.net';

    const list: string[] = [];
    for (const raw of rawCandidateUrls) {
      const isHttp = raw.toLowerCase().startsWith('http://');
      const isTs = /\.ts(\?|$)/i.test(raw);
      if (isHttp && isHttpsPage) {
        const proxied = `/api/stream?url=${encodeURIComponent(raw)}`;
        if (isApkWebView) {
          // داخل APK: لملفات .ts نجرب المباشر أولاً ثم الوسيط، ولـ .m3u8 الوسيط أولاً لتجاوز CORS
          if (isTs) {
            list.push(raw, proxied);
          } else {
            list.push(proxied, raw);
          }
        } else {
          // في المتصفح HTTPS: لا يمكن تشغيل http:// مباشرة بسبب Mixed Content لذا نمررها عبر /api/stream
          list.push(proxied);
        }
      } else {
        list.push(raw);
      }
    }
    return Array.from(new Set(list));
  }, [rawCandidateUrls]);

  const similarChannels = useMemo(() => {
    return allChannels
      .filter((c) => c.id !== channel.id && (c.category === channel.category || c.country === channel.country))
      .slice(0, 9);
  }, [allChannels, channel]);

  const showToastMsg = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }, []);

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    setShowControls(true);
    if (!isLocked) {
      hideTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
        setActiveMenu('none');
      }, 3000);
    }
  }, [isLocked]);

  // إيقاف وتدمير المشغلات السابقة لمنع تسرب الذاكرة
  const destroyEngine = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // تجاهل
      }
      hlsRef.current = null;
    }
    if (dashRef.current) {
      try {
        dashRef.current.reset();
      } catch {
        // تجاهل
      }
      dashRef.current = null;
    }
  }, []);

  // إعادة التعيين عند تغيير القناة
  useEffect(() => {
    setUrlIndex(0);
    setRetrySeed(0);
    attemptCycleRef.current = 0;
    playbackReportedOkRef.current = false;
    setErrorMsg(null);
    setIsBuffering(true);
    setLevels([]);
    setCurrentLevel(-1);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setActiveResBadge(channel.quality);
    resetHideTimer();
  }, [channel.id, channel.quality, resetHideTimer]);

  // تجربة الرابط البديل تلقائياً ثم إعادة المحاولة مرة واحدة، وإلا تسجيل فشل وتخطي
  const handleStreamFailure = useCallback(
    (reason: string) => {
      if (noFrameTimerRef.current) {
        window.clearTimeout(noFrameTimerRef.current);
        noFrameTimerRef.current = null;
      }
      if (urlIndex + 1 < candidateUrls.length) {
        showToastMsg(
          isAr
            ? `جاري تجربة الرابط البديل (${urlIndex + 2}/${candidateUrls.length})...`
            : `Switching to backup stream (${urlIndex + 2}/${candidateUrls.length})...`
        );
        setUrlIndex((i) => i + 1);
      } else if (attemptCycleRef.current === 0) {
        attemptCycleRef.current = 1;
        showToastMsg(isAr ? 'إعادة محاولة تشغيل القناة...' : 'Retrying channel...');
        setUrlIndex(0);
        setRetrySeed((s) => s + 1);
      } else {
        setIsBuffering(false);
        setErrorMsg(reason);
        onPlaybackAllFailed(channel, reason);
      }
    },
    [urlIndex, candidateUrls.length, isAr, showToastMsg, onPlaybackAllFailed, channel]
  );

  // تهيئة محرك التشغيل (hls.js / dash.js / Native) مع مهلة 10 ثوانٍ دون صورة
  useEffect(() => {
    const video = videoRef.current;
    const streamUrl = candidateUrls[urlIndex];
    if (!video || !streamUrl) return;

    destroyEngine();
    if (noFrameTimerRef.current) window.clearTimeout(noFrameTimerRef.current);
    setErrorMsg(null);
    setIsBuffering(true);

    noFrameTimerRef.current = window.setTimeout(() => {
      handleStreamFailure(
        isAr ? 'انتهت مهلة 10 ثوانٍ دون صورة' : '10s timeout without video frame'
      );
    }, 10000);

    const unwrapped = (() => {
      if (streamUrl.startsWith('/api/stream?url=')) {
        try {
          return decodeURIComponent(streamUrl.slice('/api/stream?url='.length));
        } catch {
          return streamUrl;
        }
      }
      return streamUrl;
    })();
    const lower = unwrapped.toLowerCase();
    const isDash = lower.includes('.mpd');
    const isMp4OrDirect = /\.(mp4|mkv|webm|mov|ts)(\?|$)/i.test(lower);

    const bufferSec =
      settings.bufferLevel === 'low' ? 12 : settings.bufferLevel === 'high' ? 45 : 24;
    const maxBufBytes =
      settings.bufferLevel === 'low'
        ? 20 * 1000 * 1000
        : settings.bufferLevel === 'high'
          ? 80 * 1000 * 1000
          : 45 * 1000 * 1000;

    if (isDash) {
      try {
        const player = dashjs.MediaPlayer().create();
        player.initialize(video, streamUrl, true);
        player.on(dashjs.MediaPlayer.events.ERROR, () => {
          handleStreamFailure(isAr ? 'تعذر تشغيل بث DASH' : 'DASH stream playback failed');
        });
        dashRef.current = player;
      } catch {
        handleStreamFailure(isAr ? 'فشل تهيئة مشغل DASH' : 'Failed to initialize DASH');
      }
    } else if (!isMp4OrDirect && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: settings.bufferLevel === 'low',
        maxBufferLength: bufferSec,
        maxMaxBufferLength: bufferSec * 2,
        maxBufferSize: maxBufBytes,
        startLevel: -1,
        abrEwmaDefaultEstimate: settings.dataSaver ? 400000 : 1200000,
        capLevelToPlayerSize: settings.dataSaver,
        manifestLoadingTimeOut: 12000,
        fragLoadingTimeOut: 15000,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        if (!data.levels || data.levels.length === 0) {
          handleStreamFailure(isAr ? 'مانيفست البث فارغ' : 'Empty HLS manifest');
          return;
        }
        const parsedLevels = data.levels.map((lvl, idx) => ({
          index: idx,
          height: lvl.height || 0,
          label: lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 0) / 1000)}k`,
        }));
        setLevels(parsedLevels);

        if (settings.defaultQuality !== 'auto' && parsedLevels.length > 0) {
          const targetH = parseInt(settings.defaultQuality, 10);
          const match = parsedLevels.find((l) => l.height === targetH);
          if (match) {
            hls.currentLevel = match.index;
            setCurrentLevel(match.index);
          }
        }

        video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        const lvl = hls.levels[data.level];
        if (lvl?.height) {
          setActiveResBadge(
            lvl.height >= 2160
              ? '4K'
              : lvl.height >= 1080
                ? '1080p'
                : lvl.height >= 720
                  ? '720p'
                  : `${lvl.height}p`
          );
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_evt, data) => {
        setAudioTracks(
          data.audioTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Audio ${i + 1}` }))
        );
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_evt, data) => {
        setSubtitleTracks(
          data.subtitleTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Sub ${i + 1}` }))
        );
      });

      let networkRetries = 0;
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 2) {
          networkRetries++;
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        handleStreamFailure(
          isAr
            ? 'تعذر الاتصال بالبث المباشر أو أن الرابط محظور بسبب CORS.'
            : 'Stream connection failed or blocked by CORS.'
        );
      });

      hlsRef.current = hls;
    } else {
      video.src = streamUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (noFrameTimerRef.current) {
        window.clearTimeout(noFrameTimerRef.current);
        noFrameTimerRef.current = null;
      }
      destroyEngine();
    };
  }, [
    candidateUrls,
    urlIndex,
    retrySeed,
    settings.bufferLevel,
    settings.dataSaver,
    settings.defaultQuality,
    destroyEngine,
    handleStreamFailure,
    isAr,
  ]);

  // ربط أحداث عنصر الفيديو + Media Session API
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.playbackRate = speed;

    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      if (noFrameTimerRef.current) {
        window.clearTimeout(noFrameTimerRef.current);
        noFrameTimerRef.current = null;
      }
      setIsBuffering(false);
      setErrorMsg(null);
      if (!playbackReportedOkRef.current) {
        playbackReportedOkRef.current = true;
        onPlaybackSuccess(channel.id);
      }
    };
    const onLoadedData = () => {
      if (noFrameTimerRef.current) {
        window.clearTimeout(noFrameTimerRef.current);
        noFrameTimerRef.current = null;
      }
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const onError = () => {
      if (!hlsRef.current && !dashRef.current) {
        handleStreamFailure(isAr ? 'تعذر تشغيل هذا البث' : 'Unable to play stream');
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', onError);
    };
  }, [volume, speed, handleStreamFailure, isAr, channel.id, onPlaybackSuccess]);

  const switchRelativeChannel = useCallback(
    (delta: number) => {
      const idx = allChannels.findIndex((c) => c.id === channel.id);
      if (idx === -1 || allChannels.length === 0) return;
      const nextIdx = (idx + delta + allChannels.length) % allChannels.length;
      onSwitchChannel(allChannels[nextIdx]);
    },
    [allChannels, channel.id, onSwitchChannel]
  );

  // دعم Media Session API للتحكم من شاشة القفل والإشعارات
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: channel.name,
        artist: `${channel.group} • ${channel.source}`,
        album: 'IPTV Pro Live',
        artwork: channel.logo ? [{ src: channel.logo, sizes: '256x256', type: 'image/png' }] : [],
      });
      navigator.mediaSession.setActionHandler('play', () => videoRef.current?.play().catch(() => {}));
      navigator.mediaSession.setActionHandler('pause', () => videoRef.current?.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => switchRelativeChannel(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => switchRelativeChannel(1));
    } catch {
      // تجاهل إذا لم يدعمه المتصفح
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      } catch {
        // تجاهل
      }
    };
  }, [channel, switchRelativeChannel]);

  // مؤقت النوم
  useEffect(() => {
    if (sleepRemainingSec === null) return;
    if (sleepRemainingSec <= 0) {
      videoRef.current?.pause();
      setSleepRemainingSec(null);
      setSleepMinutes(null);
      showToastMsg(isAr ? 'انتهى مؤقت النوم وتم إيقاف التشغيل' : 'Sleep timer ended');
      return;
    }
    const id = window.setInterval(() => {
      setSleepRemainingSec((s) => (s !== null ? s - 1 : null));
    }, 1000);
    return () => window.clearInterval(id);
  }, [sleepRemainingSec, isAr, showToastMsg]);

  // مستمع ملء الشاشة
  useEffect(() => {
    const onFsChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (!fs) {
        try {
          (screen.orientation as unknown as { unlock?: () => void })?.unlock?.();
        } catch {
          // تجاهل
        }
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    resetHideTimer();
  };

  const seekBy = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const target = Math.max(0, v.currentTime + sec);
      v.currentTime = target;
      setHudOverlay({ type: 'seek', text: `${sec > 0 ? '+' : ''}${sec}s` });
      setTimeout(() => setHudOverlay(null), 900);
    } catch {
      // البث المباشر بدون DVR
    }
    resetHideTimer();
  };

  const toggleFullscreen = async () => {
    const el = playerBoxRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        try {
          await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape');
        } catch {
          // تجاهل في المتصفحات التي لا تسمح بقفل الاتجاه
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // تجاهل
    }
  };

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v || !settings.pipEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
      }
    } catch {
      showToastMsg(isAr ? 'ميزة PiP غير متاحة لهذا البث' : 'PiP unavailable');
    }
  };

  const toggleRecord = () => {
    const v = videoRef.current as (HTMLVideoElement & { captureStream?: () => MediaStream }) | null;
    if (!v) return;
    if (isRecording && recorderRef.current) {
      recorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = v.captureStream?.();
      if (!stream) throw new Error('captureStream unsupported');
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${channel.name.replace(/\s+/g, '_')}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        showToastMsg(isAr ? 'تم حفظ مقطع التسجيل' : 'Recording saved');
      };
      rec.start();
      recorderRef.current = rec;
      setIsRecording(true);
      showToastMsg(isAr ? 'بدأ التسجيل...' : 'Recording started...');
    } catch {
      showToastMsg(isAr ? 'التسجيل غير متاح لبثوث CORS المحمية' : 'Recording blocked by CORS stream');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: channel.name, text: `${channel.name} — IPTV Pro`, url: channel.url });
      } else {
        await navigator.clipboard.writeText(channel.url);
        showToastMsg(isAr ? 'تم نسخ رابط القناة' : 'Channel URL copied');
      }
    } catch {
      // تجاهل
    }
  };

  const handleCopyCurrentStream = async () => {
    const rawCurrent = candidateUrls[urlIndex] || channel.url;
    const activeUrl = rawCurrent.startsWith('/api/stream?url=')
      ? (() => {
          try {
            return decodeURIComponent(rawCurrent.slice('/api/stream?url='.length));
          } catch {
            return channel.url;
          }
        })()
      : rawCurrent;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(activeUrl);
        showToastMsg(isAr ? 'تم نسخ رابط البث المباشر' : 'Stream URL copied');
        return;
      }
    } catch {
      // fallback below
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = activeUrl;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      showToastMsg(
        ok
          ? isAr
            ? 'تم نسخ رابط البث المباشر'
            : 'Stream URL copied'
          : isAr
            ? 'تعذر نسخ الرابط'
            : 'Copy failed'
      );
    } catch {
      showToastMsg(isAr ? 'تعذر نسخ الرابط' : 'Copy failed');
    }
  };

  // إيماءات اللمس: سحب عمودي للسطوع/الصوت ونقر مزدوج للتقديم/الترجيع
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isLocked || e.touches.length !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const side = touch.clientX - rect.left < rect.width / 2 ? 'left' : 'right';

    const now = Date.now();
    if (now - lastTapRef.current.time < 280 && lastTapRef.current.side === side) {
      seekBy(side === 'left' ? -10 : 10);
      lastTapRef.current.time = 0;
      return;
    }
    lastTapRef.current = { time: now, side };

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      side,
      startVal: side === 'left' ? brightness : volume,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isLocked || !touchStartRef.current || e.touches.length !== 1) return;
    const dy = touchStartRef.current.y - e.touches[0].clientY;
    if (Math.abs(dy) < 12) return;
    const delta = dy / 220;

    if (touchStartRef.current.side === 'left') {
      const nextB = Math.min(1.5, Math.max(0.3, touchStartRef.current.startVal + delta));
      setBrightness(nextB);
      setHudOverlay({ type: 'bright', text: `${Math.round((nextB / 1.5) * 100)}%` });
    } else {
      const nextV = Math.min(1, Math.max(0, touchStartRef.current.startVal + delta));
      setVolume(nextV);
      onUpdateVolume(nextV);
      if (videoRef.current) videoRef.current.volume = nextV;
      setHudOverlay({ type: 'vol', text: `${Math.round(nextV * 100)}%` });
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
    setTimeout(() => setHudOverlay(null), 700);
  };

  const videoObjectClass =
    aspect === 'fill'
      ? 'object-fill'
      : aspect === 'zoom'
        ? 'object-cover scale-115'
        : aspect === '16:9'
          ? 'aspect-video object-cover'
          : aspect === '4:3'
            ? 'aspect-[4/3] object-cover'
            : 'object-contain';

  return (
    <div
      className={
        minimized
          ? 'fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50 glass-card rounded-2xl p-2.5 border border-[#00E5FF]/50 shadow-2xl flex items-center justify-between gap-2'
          : 'fixed inset-0 z-50 bg-[#090C16] overflow-y-auto'
      }
    >
      {/* شريط التشغيل المصغر بالخلفية */}
      {minimized && (
        <>
          <div
            onClick={() => onMinimize(false)}
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
          >
            <ChannelLogo src={channel.logo} name={channel.name} size="sm" dataSaver={settings.dataSaver} />
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-white truncate">{channel.name}</p>
              <p className="text-[10px] text-[#00E5FF]">
                {isPlaying ? (isAr ? 'يعمل في الخلفية' : 'Playing in background') : isAr ? 'متوقف مؤقتاً' : 'Paused'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={togglePlay}
              className="w-8 h-8 rounded-xl neon-gradient text-white flex items-center justify-center cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 text-slate-300 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* حاوية المشغل الكاملة */}
      <div className={minimized ? 'hidden' : 'max-w-5xl mx-auto min-h-screen flex flex-col pb-10'}>
        {/* ترويسة المشغل */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label={isAr ? 'رجوع' : 'Back'}
              className="w-10 h-10 rounded-2xl glass-card flex items-center justify-center text-white hover:border-[#00E5FF] cursor-pointer shrink-0"
            >
              <BackIcon className="w-5 h-5" />
            </button>
            <span className="px-2.5 py-0.5 rounded-lg bg-[#FFC857] text-[#090C16] text-xs font-extrabold shrink-0">
              {activeResBadge}
            </span>
            <h2 className="text-sm md:text-base font-extrabold text-white truncate">
              {channel.name}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {settings.showCopyButton && (
              <button
                type="button"
                onClick={handleCopyCurrentStream}
                className="px-3 py-1.5 rounded-xl glass-card text-xs font-bold text-slate-200 hover:text-[#00E5FF] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{isAr ? 'نسخ الرابط' : 'Copy URL'}</span>
              </button>
            )}
            {settings.backgroundAudio && (
              <button
                type="button"
                onClick={() => onMinimize(true)}
                className="px-3 py-1.5 rounded-xl glass-card text-xs font-bold text-[#00E5FF] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>{isAr ? 'خلفية' : 'Audio'}</span>
              </button>
            )}
          </div>
        </div>

        {/* نافذة الفيديو */}
        <div
          ref={playerBoxRef}
          onClick={resetHideTimer}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative w-full aspect-video bg-black overflow-hidden md:rounded-3xl border-y md:border border-white/10 select-none"
        >
          <video
            ref={videoRef}
            playsInline
            style={{ filter: `brightness(${brightness})` }}
            className={`w-full h-full transition-transform ${videoObjectClass}`}
          />

          {/* مؤشر التحميل Buffering */}
          {isBuffering && !errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 pointer-events-none gap-2">
              <Loader2 className="w-10 h-10 text-[#00E5FF] animate-spin" />
              <span className="text-xs font-bold text-slate-200">
                {isAr ? 'جاري تحميل البث...' : 'Buffering stream...'}
              </span>
            </div>
          )}

          {/* مؤشر السطوع / الصوت / التقديم */}
          {hudOverlay && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2.5 rounded-2xl bg-black/75 backdrop-blur-md text-white flex items-center gap-2 text-sm font-extrabold pointer-events-none">
              {hudOverlay.type === 'bright' && <Sun className="w-4 h-4 text-[#FFC857]" />}
              {hudOverlay.type === 'vol' && <Volume2 className="w-4 h-4 text-[#00E5FF]" />}
              <span>{hudOverlay.text}</span>
            </div>
          )}

          {/* رسالة خطأ واضحة وزر إعادة المحاولة */}
          {errorMsg && (
            <div className="absolute inset-0 bg-[#090C16]/90 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
              <AlertTriangle className="w-10 h-10 text-[#FF3B5C]" />
              <p className="text-sm font-bold text-white max-w-sm">{errorMsg}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUrlIndex(0);
                    setErrorMsg(null);
                  }}
                  className="neon-gradient px-4 py-2 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyCurrentStream();
                  }}
                  className="glass-card px-4 py-2 rounded-xl text-xs font-bold text-[#00E5FF] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isAr ? 'نسخ الرابط' : 'Copy URL'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    switchRelativeChannel(1);
                  }}
                  className="glass-card px-4 py-2 rounded-xl text-xs font-bold text-slate-200 cursor-pointer"
                >
                  {isAr ? 'القناة التالية' : 'Next Channel'}
                </button>
              </div>
            </div>
          )}

          {/* زر فتح القفل عندما تكون الشاشة مقفلة */}
          {isLocked && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLocked(false);
                resetHideTimer();
              }}
              className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/70 border border-[#00E5FF] text-[#00E5FF] flex items-center justify-center cursor-pointer"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}

          {/* عناصر التحكم المختفية تلقائياً بعد 3 ثوانٍ */}
          {!isLocked && showControls && !errorMsg && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/60 flex flex-col justify-between p-3 md:p-4 z-10"
            >
              {/* الشريط العلوي داخل الفيديو */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLocked(true)}
                    className="w-9 h-9 rounded-xl bg-black/50 text-white flex items-center justify-center hover:text-[#00E5FF] cursor-pointer"
                    aria-label={isAr ? 'قفل اللمس' : 'Lock screen'}
                  >
                    <Unlock className="w-4 h-4" />
                  </button>
                  {sleepRemainingSec !== null && (
                    <span className="px-2.5 py-1 rounded-lg bg-black/60 text-[#FFC857] text-[11px] font-bold tabular-nums">
                      {Math.floor(sleepRemainingSec / 60)}:{String(sleepRemainingSec % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>

                {toast && (
                  <span className="px-3 py-1 rounded-xl bg-black/75 text-[#00E5FF] text-xs font-bold">
                    {toast}
                  </span>
                )}
              </div>

              {/* أزرار المنتصف */}
              <div className="flex items-center justify-center gap-4 md:gap-7">
                <button
                  type="button"
                  onClick={() => switchRelativeChannel(-1)}
                  className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:text-[#00E5FF] cursor-pointer"
                  aria-label={isAr ? 'القناة السابقة' : 'Previous'}
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => seekBy(-10)}
                  className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:text-[#00E5FF] cursor-pointer"
                  aria-label="-10s"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-white/15 border-2 border-white text-white flex items-center justify-center backdrop-blur-md hover:scale-105 transition-transform cursor-pointer"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
                </button>
                <button
                  type="button"
                  onClick={() => seekBy(10)}
                  className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:text-[#00E5FF] cursor-pointer"
                  aria-label="+10s"
                >
                  <RotateCw className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => switchRelativeChannel(1)}
                  className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:text-[#00E5FF] cursor-pointer"
                  aria-label={isAr ? 'القناة التالية' : 'Next'}
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* الشريط السفلي: التقدم + LIVE + الأدوات */}
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FF3B5C] text-white text-[10px] font-extrabold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration > 0 ? duration : 100}
                    value={duration > 0 ? currentTime : 100}
                    onChange={(e) => {
                      if (videoRef.current && duration > 0) {
                        videoRef.current.currentTime = Number(e.target.value);
                      }
                    }}
                    className="w-full accent-[#00E5FF] h-1.5 rounded-full cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-white">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className="p-2 rounded-xl bg-black/45 hover:text-[#00E5FF] cursor-pointer"
                      aria-label="Fullscreen"
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                    {settings.pipEnabled && (
                      <button
                        type="button"
                        onClick={togglePiP}
                        className="p-2 rounded-xl bg-black/45 hover:text-[#00E5FF] cursor-pointer"
                        aria-label="PiP"
                      >
                        <PictureInPicture2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setAspect((a) =>
                          a === 'fit'
                            ? 'fill'
                            : a === 'fill'
                              ? '16:9'
                              : a === '16:9'
                                ? '4:3'
                                : a === '4:3'
                                  ? 'zoom'
                                  : 'fit'
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-black/45 text-[11px] font-bold hover:text-[#00E5FF] cursor-pointer inline-flex items-center gap-1"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{ASPECT_LABELS[aspect]}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMenu((m) => (m === 'quality' ? 'none' : 'quality'))}
                      className="px-2.5 py-1.5 rounded-xl bg-black/45 text-[11px] font-bold hover:text-[#00E5FF] cursor-pointer inline-flex items-center gap-1"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>{currentLevel === -1 ? (isAr ? 'تلقائي' : 'Auto') : activeResBadge}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMenu((m) => (m === 'cc' ? 'none' : 'cc'))}
                      className="p-2 rounded-xl bg-black/45 hover:text-[#00E5FF] cursor-pointer"
                      aria-label="CC"
                    >
                      <Subtitles className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMenu((m) => (m === 'speed' ? 'none' : 'speed'))}
                      className="px-2 py-1.5 rounded-xl bg-black/45 text-[11px] font-bold hover:text-[#00E5FF] cursor-pointer"
                    >
                      {speed}x
                    </button>
                  </div>

                  {/* تحكم الصوت على الديسكتوب */}
                  <div className="hidden sm:flex items-center gap-1.5 bg-black/45 px-2.5 py-1 rounded-xl">
                    <Volume2 className="w-3.5 h-3.5 text-[#00E5FF]" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setVolume(v);
                        onUpdateVolume(v);
                        if (videoRef.current) videoRef.current.volume = v;
                      }}
                      className="w-16 accent-[#00E5FF] h-1 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* قوائم الجودة / الصوت / الترجمة / السرعة / المؤقت */}
              {activeMenu !== 'none' && (
                <div className="absolute bottom-20 left-4 right-4 sm:left-auto sm:w-64 glass-card rounded-2xl p-3 space-y-2 z-30 max-h-56 overflow-y-auto">
                  {activeMenu === 'quality' && (
                    <>
                      <p className="text-xs font-extrabold text-[#00E5FF]">
                        {isAr ? 'اختر الجودة' : 'Select Quality'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (hlsRef.current) hlsRef.current.currentLevel = -1;
                          setCurrentLevel(-1);
                          setActiveMenu('none');
                        }}
                        className={`w-full text-start px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                          currentLevel === -1 ? 'neon-gradient text-white' : 'text-slate-200 hover:bg-white/5'
                        }`}
                      >
                        {isAr ? 'تلقائي (Auto)' : 'Auto'}
                      </button>
                      {levels.map((lvl) => (
                        <button
                          key={lvl.index}
                          type="button"
                          onClick={() => {
                            if (hlsRef.current) hlsRef.current.currentLevel = lvl.index;
                            setCurrentLevel(lvl.index);
                            setActiveMenu('none');
                          }}
                          className={`w-full text-start px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                            currentLevel === lvl.index ? 'neon-gradient text-white' : 'text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </>
                  )}

                  {activeMenu === 'cc' && (
                    <>
                      <p className="text-xs font-extrabold text-[#00E5FF]">
                        {isAr ? 'الترجمة والمسار الصوتي' : 'Subtitles & Audio'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
                          setCurrentSub(-1);
                          setActiveMenu('none');
                        }}
                        className="w-full text-start px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 hover:bg-white/5 cursor-pointer"
                      >
                        {isAr ? 'بدون ترجمة (Off)' : 'Subtitles Off'}
                      </button>
                      {subtitleTracks.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            if (hlsRef.current) hlsRef.current.subtitleTrack = sub.id;
                            setCurrentSub(sub.id);
                            setActiveMenu('none');
                          }}
                          className={`w-full text-start px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                            currentSub === sub.id ? 'neon-gradient text-white' : 'text-slate-200'
                          }`}
                        >
                          {sub.name}
                        </button>
                      ))}
                      {audioTracks.map((aud) => (
                        <button
                          key={aud.id}
                          type="button"
                          onClick={() => {
                            if (hlsRef.current) hlsRef.current.audioTrack = aud.id;
                            setCurrentAudio(aud.id);
                            setActiveMenu('none');
                          }}
                          className={`w-full text-start px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                            currentAudio === aud.id ? 'bg-[#7C4DFF] text-white' : 'text-slate-300'
                          }`}
                        >
                          🔊 {aud.name}
                        </button>
                      ))}
                    </>
                  )}

                  {activeMenu === 'speed' && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {[0.5, 1, 1.25, 1.5, 2].map((sp) => (
                        <button
                          key={sp}
                          type="button"
                          onClick={() => {
                            setSpeed(sp);
                            if (videoRef.current) videoRef.current.playbackRate = sp;
                            setActiveMenu('none');
                          }}
                          className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                            speed === sp ? 'neon-gradient text-white' : 'bg-white/5 text-slate-200'
                          }`}
                        >
                          {sp}x
                        </button>
                      ))}
                    </div>
                  )}

                  {activeMenu === 'sleep' && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-extrabold text-[#00E5FF]">
                        {isAr ? 'مؤقت النوم' : 'Sleep Timer'}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[15, 30, 60, 90].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setSleepMinutes(m);
                              setSleepRemainingSec(m * 60);
                              setActiveMenu('none');
                              showToastMsg(isAr ? `تم ضبط المؤقت: ${m} دقيقة` : `Timer: ${m}m`);
                            }}
                            className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                              sleepMinutes === m ? 'neon-gradient text-white' : 'bg-white/5 text-slate-200'
                            }`}
                          >
                            {m} {isAr ? 'دقيقة' : 'min'}
                          </button>
                        ))}
                      </div>
                      {sleepRemainingSec !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            setSleepMinutes(null);
                            setSleepRemainingSec(null);
                            setActiveMenu('none');
                          }}
                          className="w-full py-1.5 rounded-xl bg-[#FF3B5C]/20 text-[#FF3B5C] text-xs font-bold cursor-pointer"
                        >
                          {isAr ? 'إلغاء المؤقت' : 'Cancel Timer'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* تفاصيل القناة وأزرار الإجراءات */}
        <div className="px-4 pt-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-extrabold text-white">{channel.name}</h1>
                <p className="text-xs text-slate-400 mt-1">
                  {channel.group} · {channel.country} · {isAr ? 'المصدر:' : 'Source:'}{' '}
                  <span className="text-[#00E5FF] font-bold">{channel.source}</span>
                </p>
              </div>
              {channel.fallbacks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setUrlIndex((i) => (i + 1) % candidateUrls.length)}
                  className="px-3 py-1.5 rounded-xl glass-card text-[11px] font-bold text-[#00E5FF] cursor-pointer shrink-0"
                >
                  {isAr ? `سيرفر ${urlIndex + 1}/${candidateUrls.length}` : `Server ${urlIndex + 1}/${candidateUrls.length}`}
                </button>
              )}
            </div>

            <div className="h-1.5 w-full rounded-full bg-[#1C243A] overflow-hidden">
              <div className="h-full w-2/3 neon-gradient rounded-full" />
            </div>
          </div>

          {/* أزرار الإجراءات السريعة: مفضلة، مشاركة، ملء الشاشة، تسجيل، مؤقت */}
          <div className="grid grid-cols-5 gap-2 text-center">
            <ActionBtn
              active={isFavorite}
              activeColor="text-[#FF3B5C]"
              icon={<Heart className={`w-5 h-5 ${isFavorite ? 'fill-[#FF3B5C]' : ''}`} />}
              label={isAr ? 'مفضلة' : 'Favorite'}
              onClick={() => onToggleFavorite(channel.id)}
            />
            <ActionBtn
              icon={<Share2 className="w-5 h-5" />}
              label={isAr ? 'مشاركة' : 'Share'}
              onClick={handleShare}
            />
            <ActionBtn
              icon={<Maximize className="w-5 h-5" />}
              label={isAr ? 'تكبير' : 'Full'}
              onClick={toggleFullscreen}
            />
            <ActionBtn
              active={isRecording}
              activeColor="text-[#FF3B5C]"
              icon={<CircleDot className={`w-5 h-5 ${isRecording ? 'animate-pulse' : ''}`} />}
              label={isAr ? 'تسجيل' : 'Record'}
              onClick={toggleRecord}
            />
            <ActionBtn
              active={sleepRemainingSec !== null}
              activeColor="text-[#FFC857]"
              icon={<Clock className="w-5 h-5" />}
              label={isAr ? 'مؤقت' : 'Timer'}
              onClick={() => {
                setShowControls(true);
                setActiveMenu((m) => (m === 'sleep' ? 'none' : 'sleep'));
              }}
            />
          </div>

          {/* أزرار الإبلاغ والحذف اليدوي السريع */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isReporting}
              onClick={async () => {
                setIsReporting(true);
                try {
                  await onReportNotWorking(channel);
                } finally {
                  setIsReporting(false);
                }
              }}
              className="py-2.5 px-3 rounded-2xl glass-card border border-[#FFC857]/35 text-[#FFC857] text-xs font-extrabold inline-flex items-center justify-center gap-2 hover:border-[#FFC857] cursor-pointer disabled:opacity-50"
            >
              {isReporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Flag className="w-4 h-4" />
              )}
              <span>
                {isReporting
                  ? isAr
                    ? 'جاري الفحص...'
                    : 'Checking...'
                  : isAr
                    ? 'بلّغ أنها لا تعمل'
                    : 'Report Not Working'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDeleteChannel(channel)}
              className="py-2.5 px-3 rounded-2xl bg-[#FF3B5C]/15 border border-[#FF3B5C]/40 text-[#FF3B5C] text-xs font-extrabold inline-flex items-center justify-center gap-2 hover:bg-[#FF3B5C]/25 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isAr ? 'حذف القناة' : 'Delete Channel'}</span>
            </button>
          </div>

          {/* قنوات مشابهة */}
          {similarChannels.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-extrabold text-white">
                {isAr ? 'قنوات مشابهة' : 'Similar Channels'}
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {similarChannels.map((sim) => (
                  <div
                    key={sim.id}
                    onClick={() => onSwitchChannel(sim)}
                    className="glass-card rounded-2xl p-3 flex flex-col items-center text-center gap-2 cursor-pointer hover:border-[#00E5FF]/50 transition-colors"
                  >
                    <ChannelLogo
                      src={sim.logo}
                      name={sim.name}
                      size="sm"
                      dataSaver={settings.dataSaver}
                    />
                    <p className="text-xs font-bold text-white truncate w-full">{sim.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ActionBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeColor?: string;
}> = ({ icon, label, onClick, active, activeColor }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-center gap-1.5 cursor-pointer group"
  >
    <div
      className={`w-12 h-12 rounded-2xl glass-card flex items-center justify-center transition-colors group-hover:border-[#00E5FF]/50 ${
        active && activeColor ? activeColor : 'text-slate-200'
      }`}
    >
      {icon}
    </div>
    <span className="text-[11px] font-bold text-slate-300">{label}</span>
  </button>
);
