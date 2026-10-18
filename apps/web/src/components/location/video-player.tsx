'use client';

import clsx from 'clsx';
import type Hls from 'hls.js';
import { Loader2, Maximize, Minimize, Pause, Play, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { dict } from '@/lib/i18n';
import type { Lang, PublicVideo } from '@/lib/types';

interface Level {
  index: number;
  height: number;
  width: number;
}

const time = (s: number) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
const qLabel = (h: number, w: number) => {
  const s = Math.min(h, w);
  return s >= 2160 ? '4K' : `${s}p`;
};

/**
 * Showreel player: adaptive HLS with manual quality (4K / 1080p / 720p), seek preview from the
 * sprite, keyboard shortcuts when focused. Switching the grade keeps the playback position,
 * so producers compare looks of the same shot.
 */
export function VideoPlayer({ lang, video, autoPlay = false, className }: { lang: Lang; video: PublicVideo; autoPlay?: boolean; className?: string }) {
  const t = dict(lang).player;
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const resumeAt = useRef(0);
  const resumePlaying = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [pos, setPos] = useState(0);
  const [duration, setDuration] = useState(video.durationSec ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [autoLevel, setAutoLevel] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // (Re)attach the stream when the source changes; the position carries over between grades
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let destroyed = false;
    const wasPlaying = resumePlaying.current || autoPlay;
    setError(false);
    setLevels([]);
    (async () => {
      const { default: HlsLib } = await import('hls.js');
      if (destroyed) return;
      const resume = () => {
        if (resumeAt.current > 0) el.currentTime = resumeAt.current;
        if (wasPlaying) void el.play().catch(() => undefined);
      };
      if (HlsLib.isSupported()) {
        const hls = new HlsLib({ startLevel: -1, capLevelToPlayerSize: true, maxBufferLength: 30 });
        hlsRef.current = hls;
        hls.on(HlsLib.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(data.levels.map((l, index) => ({ index, height: l.height, width: l.width })));
          resume();
        });
        hls.on(HlsLib.Events.LEVEL_SWITCHED, (_e, data) => setAutoLevel(data.level));
        hls.on(HlsLib.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setError(true);
        });
        hls.loadSource(video.hls);
        hls.attachMedia(el);
      } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS play HLS natively
        el.src = video.hls;
        el.addEventListener('loadedmetadata', resume, { once: true });
      } else setError(true);
    })();
    return () => {
      destroyed = true;
      // Read the position before destroy() detaches and resets the element
      resumeAt.current = el.currentTime || 0;
      resumePlaying.current = !el.paused;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [video.hls, autoPlay]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen();
    else (videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
  }, []);

  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const v = videoRef.current;
    if (!v) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - 5);
    else if (e.key === 'ArrowRight') v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
    else if (e.key === 'f') toggleFullscreen();
    else if (e.key === 'm') v.muted = !v.muted;
  };

  const showControls = () => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => !videoRef.current?.paused && setControls(false), 2500);
  };

  const setQuality = (idx: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = idx;
    setLevel(idx);
    setMenu(false);
  };

  const sprite = video.sprite;
  const spriteStyle = (sec: number) => {
    if (!sprite) return undefined;
    const i = Math.min(sprite.count - 1, Math.floor(sec / sprite.interval));
    return {
      width: sprite.tileW,
      height: sprite.tileH,
      backgroundImage: `url(${sprite.url})`,
      backgroundPosition: `-${(i % sprite.cols) * sprite.tileW}px -${Math.floor(i / sprite.cols) * sprite.tileH}px`,
    };
  };
  const sorted = [...levels].sort((a, b) => b.height - a.height);
  const current = level >= 0 ? levels[level] : autoLevel !== null ? levels[autoLevel] : undefined;
  const pct = duration ? (pos / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseMove={showControls}
      onMouseLeave={() => !videoRef.current?.paused && setControls(false)}
      className={clsx('group relative flex items-center justify-center overflow-hidden bg-black outline-none', fullscreen ? 'h-full w-full' : 'aspect-video w-full', className)}
    >
      <video
        ref={videoRef}
        className="size-full object-contain"
        poster={video.poster.src}
        playsInline
        preload="metadata"
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          if (!started) track('reel');
          setPlaying(true);
          setStarted(true);
        }}
        onPause={() => {
          setPlaying(false);
          setControls(true);
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
      />

      {waiting && !error && <Loader2 className="pointer-events-none absolute size-10 animate-spin text-white" />}
      {!playing && !waiting && !error && (
        <button
          type="button"
          onClick={toggle}
          aria-label={t.play}
          className="absolute flex size-20 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_40px_var(--accent-glow)] transition-transform hover:scale-105"
        >
          <Play className="ml-1 size-8 fill-white" />
        </button>
      )}
      {error && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">{t.error}</p>}

      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pt-12 pb-3 text-white transition-opacity',
          started && (controls || !playing) ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div
          className="relative h-5 cursor-pointer"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
            setHover({ x, t: (x / r.width) * duration });
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const v = videoRef.current;
            if (v && duration) v.currentTime = ((e.clientX - r.left) / r.width) * duration;
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent-bright" style={{ width: `${pct}%` }} />
          </div>
          {hover && (
            <div className="pointer-events-none absolute bottom-6 flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: hover.x }}>
              {sprite && <div className="overflow-hidden rounded-md border border-white/30 shadow-lg" style={spriteStyle(hover.t)} />}
              <span className="rounded bg-black/80 px-1.5 py-0.5 font-mono text-xs">{time(hover.t)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggle} aria-label={playing ? t.pause : t.play} className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10">
            {playing ? <Pause className="size-5 fill-white" /> : <Play className="size-5 fill-white" />}
          </button>
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (v) v.muted = !v.muted;
            }}
            aria-label={muted ? t.unmute : t.mute}
            className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10"
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <span className="ml-2 font-mono text-xs text-white/85 tabular-nums">
            {time(pos)} / {time(duration)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {current && (
              <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                {qLabel(current.height, current.width)}
                {level < 0 ? ` · ${t.auto}` : ''}
              </span>
            )}
            {levels.length > 1 && (
              <div className="relative">
                <button type="button" onClick={() => setMenu((m) => !m)} aria-label={t.quality} aria-expanded={menu} className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10">
                  <Settings2 className="size-5" />
                </button>
                {menu && (
                  <div className="absolute right-0 bottom-11 w-44 rounded-xl border border-white/15 bg-black/90 p-1.5 text-sm backdrop-blur">
                    <p className="px-2 py-1 text-xs text-white/60">{t.quality}</p>
                    {[{ index: -1, height: 0, width: 0 }, ...sorted].map((l) => (
                      <button
                        key={l.index}
                        type="button"
                        onClick={() => setQuality(l.index)}
                        className={clsx('w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10', level === l.index && 'text-accent-bright')}
                      >
                        {l.index < 0 ? t.auto : qLabel(l.height, l.width)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? t.exitFullscreen : t.fullscreen}
              className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10"
            >
              {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
