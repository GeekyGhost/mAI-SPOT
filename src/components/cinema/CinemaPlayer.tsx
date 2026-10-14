'use client';

import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, X, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, SkipForward, Gauge, RectangleHorizontal
} from 'lucide-react';
import type { Video } from '@/lib/types';
import { fmtTime } from '@/lib/client';

interface Props {
  queue: Video[];
  startIndex: number;
  resumeAt?: number;
  title?: string;
  onClose: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Full-screen theater player with resume, up-next autoplay and keyboard controls. */
export const CinemaPlayer: React.FC<Props> = ({ queue, startIndex, resumeAt, title, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fill, setFill] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [upNextIn, setUpNextIn] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSaved = useRef(0);
  const firstLoad = useRef(true);

  const video = queue[index];
  const nextVideo = queue[index + 1];

  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !video || !isFinite(v.duration) || v.currentTime < 5) return;
    fetch('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'progress', id: video.id, position: v.currentTime, duration: v.duration }),
      keepalive: true
    }).catch(() => {});
  }, [video]);

  // Load + count a view whenever the episode changes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !video) return;
    setUpNextIn(null);
    v.src = video.filePath;
    v.playbackRate = speed;
    v.load();
    fetch('/api/videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'view', id: video.id }) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = muted;
    }
  }, [vol, muted]);

  const close = useCallback(() => {
    saveProgress();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose();
  }, [saveProgress, onClose]);

  const goNext = useCallback(() => {
    saveProgress();
    if (index + 1 < queue.length) setIndex(i => i + 1);
  }, [index, queue.length, saveProgress]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const skip = (s: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s));
  };

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen().catch(() => {});
  };

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Keyboard: space/k play, ←/→ 10s, ↑/↓ volume, f fullscreen, m mute, n next, esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
      else if (k === 'arrowright') skip(10);
      else if (k === 'arrowleft') skip(-10);
      else if (k === 'arrowup') { e.preventDefault(); setVol(v => Math.min(1, v + 0.1)); }
      else if (k === 'arrowdown') { e.preventDefault(); setVol(v => Math.max(0, v - 0.1)); }
      else if (k === 'f') toggleFs();
      else if (k === 'm') setMuted(m => !m);
      else if (k === 'n') goNext();
      else if (k === 'escape' && !document.fullscreenElement) close();
      poke();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  });

  // Save progress if the tab closes mid-movie.
  useEffect(() => {
    const onHide = () => saveProgress();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [saveProgress]);

  // "Up next" countdown.
  useEffect(() => {
    if (upNextIn === null) return;
    if (upNextIn <= 0) {
      goNext();
      return;
    }
    const t = setTimeout(() => setUpNextIn(n => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [upNextIn, goNext]);

  const poke = () => {
    setShowUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowUi(false), 2800);
  };

  if (!video) return null;
  const pct = dur ? (time / dur) * 100 : 0;

  return createPortal(
    <div
      ref={wrapRef}
      className={`fixed inset-0 z-[70] bg-black flex items-center justify-center ${showUi || !playing ? '' : 'cursor-none'}`}
      onMouseMove={poke}
      onClick={e => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'VIDEO') toggle();
      }}
    >
      <video
        ref={videoRef}
        className={`w-full h-full ${fill ? 'object-cover' : 'object-contain'}`}
        autoPlay
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          saveProgress();
        }}
        onLoadedMetadata={e => {
          const v = e.currentTarget;
          setDur(v.duration);
          if (firstLoad.current && resumeAt && resumeAt < v.duration - 10) v.currentTime = resumeAt;
          firstLoad.current = false;
        }}
        onTimeUpdate={e => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (Date.now() - lastSaved.current > 10000) {
            lastSaved.current = Date.now();
            saveProgress();
          }
        }}
        onEnded={() => {
          saveProgress();
          if (nextVideo) setUpNextIn(8);
        }}
      />

      {/* Top bar */}
      <div className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between transition-opacity ${showUi || !playing ? 'opacity-100' : 'opacity-0'}`}>
        <div className="min-w-0">
          {title && <div className="text-xs text-zinc-400 uppercase tracking-wider">{title}</div>}
          <div className="text-white font-bold text-lg truncate">{video.title}</div>
          <div className="text-xs text-zinc-400">{video.channelName} · {video.genre}</div>
        </div>
        <button onClick={close} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" title="Close (Esc)">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Up next card */}
      {upNextIn !== null && nextVideo && (
        <div className="absolute bottom-28 right-6 w-80 bg-[#0b1216]/95 border border-white/10 rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
          {nextVideo.thumbnail && <img src={nextVideo.thumbnail} alt="" className="w-full aspect-video object-cover" />}
          <div className="p-3">
            <div className="text-xs text-zinc-400">Up next in {upNextIn}s</div>
            <div className="text-white font-bold truncate">{nextVideo.title}</div>
            <div className="flex gap-2 mt-2">
              <button onClick={goNext} className="flex-1 py-1.5 rounded bg-white text-black text-sm font-bold">Play now</button>
              <button onClick={() => setUpNextIn(null)} className="flex-1 py-1.5 rounded bg-white/10 text-white text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute bottom-0 inset-x-0 px-4 pb-4 pt-10 bg-gradient-to-t from-black/90 to-transparent transition-opacity ${showUi || !playing ? 'opacity-100' : 'opacity-0'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="relative h-4 flex items-center group mb-2">
          <div className="absolute inset-x-0 h-1 group-hover:h-1.5 transition-all rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-[#f9993c]" style={{ width: `${pct}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={dur || 1}
            step={0.1}
            value={time}
            onChange={e => {
              const v = videoRef.current;
              if (v) v.currentTime = parseFloat(e.target.value);
            }}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            aria-label="Seek"
          />
        </div>
        <div className="flex items-center gap-2 text-white">
          <button onClick={toggle} className="p-2 hover:text-[#f9993c]" title="Play/Pause (Space)">
            {playing ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
          </button>
          <button onClick={() => skip(-10)} className="p-2 hover:text-[#f9993c]" title="Back 10s (←)">
            <RotateCcw className="w-5 h-5" />
          </button>
          <button onClick={() => skip(10)} className="p-2 hover:text-[#f9993c]" title="Forward 10s (→)">
            <RotateCw className="w-5 h-5" />
          </button>
          {nextVideo && (
            <button onClick={goNext} className="p-2 hover:text-[#f9993c]" title="Next (N)">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          )}
          <button onClick={() => setMuted(m => !m)} className="p-2 hover:text-[#f9993c]" title="Mute (M)">
            {muted || vol === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} onChange={e => { setVol(parseFloat(e.target.value)); setMuted(false); }} className="w-24 accent-[#f9993c]" aria-label="Volume" />
          <span className="text-xs font-mono text-zinc-300 ml-2 tabular-nums">
            {fmtTime(time)} / {fmtTime(dur)}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => {
              const s = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
              setSpeed(s);
              if (videoRef.current) videoRef.current.playbackRate = s;
            }}
            className="px-2 py-1 rounded text-xs font-mono hover:bg-white/10 flex items-center gap-1"
            title="Playback speed"
          >
            <Gauge className="w-4 h-4" /> {speed}x
          </button>
          <button onClick={() => setFill(f => !f)} className="p-2 hover:text-[#f9993c]" title={fill ? 'Fit to screen' : 'Fill screen'}>
            <RectangleHorizontal className="w-5 h-5" />
          </button>
          <button onClick={toggleFs} className="p-2 hover:text-[#f9993c]" title="Fullscreen (F)">
            {isFs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
