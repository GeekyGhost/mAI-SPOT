'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Tv, Film, Power } from 'lucide-react';
import type { Video, VideoPlayerStyle } from '@/lib/types';
import { fmtTime } from '@/lib/client';
import { Art } from '@/components/ui/kit';

/**
 * The TV on your Spot. Three looks (modern, channel grid, retro tube), one behaviour:
 * it never starts by itself, play/pause is always one click away, and channel up/down
 * keeps playing only if you were already watching.
 */
export const SpotTV: React.FC<{
  videos: Video[];
  look: VideoPlayerStyle;
  genres?: string[];
  onOpenCinema?: () => void;
}> = ({ videos, look, genres = [], onOpenCinema }) => {
  const [genre, setGenre] = useState('');
  const list = useMemo(() => (genre ? videos.filter(v => v.genre === genre) : videos), [videos, genre]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(0.9);
  const [flip, setFlip] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const wantPlay = useRef(false);
  const v = list[Math.min(i, list.length - 1)];

  useEffect(() => {
    if (i >= list.length) setI(0);
  }, [list.length, i]);

  // New channel: load it, and keep playing only if we already were.
  useEffect(() => {
    const el = ref.current;
    if (!el || !v) return;
    setT(0);
    setDur(v.duration || 0);
    el.volume = vol;
    el.muted = muted;
    if (wantPlay.current) el.play().catch(() => setPlaying(false));
  }, [v?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = vol;
      ref.current.muted = muted;
    }
  }, [vol, muted]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      wantPlay.current = true;
      el.play().catch(() => setPlaying(false));
    } else {
      wantPlay.current = false;
      el.pause();
    }
  };
  const channel = (d: number) => {
    if (!list.length) return;
    setFlip(true);
    setTimeout(() => setFlip(false), 260);
    setI(x => (x + d + list.length) % list.length);
  };
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen())?.catch?.(() => {});

  if (!v) return null;

  const screen = (extra = '') => (
    <div className={`relative bg-black overflow-hidden group ${extra}`}>
      <video
        ref={ref}
        key={v.id}
        src={v.filePath}
        poster={v.thumbnail || undefined}
        preload="metadata"
        playsInline
        className="w-full h-full object-contain"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={e => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={e => isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
        onEnded={() => list.length > 1 && channel(1)}
      />
      {!playing && (
        <button onClick={toggle} className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors" aria-label="Play">
          <span className="w-16 h-16 rounded-full bg-white/90 text-black flex items-center justify-center shadow-2xl">
            <Play className="w-7 h-7 fill-current ml-1" />
          </span>
        </button>
      )}
      {flip && <div className="absolute inset-0 tv-static" />}
      {look === 'leanback_tv' && (
        <>
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.65)_100%)]" />
          <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.22)_3px)]" />
          <div className="absolute top-3 left-3 font-mono text-green-400 text-xs font-black tracking-widest drop-shadow">CH {String(i + 2).padStart(2, '0')}</div>
        </>
      )}
      {look !== 'leanback_tv' && (
        <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none opacity-100 group-hover:opacity-100 transition-opacity">
          <div className="text-sm font-bold text-white truncate">{v.title}</div>
          <div className="text-[11px] text-white/60 truncate">
            {v.channelName} · {v.genre}
          </div>
        </div>
      )}
    </div>
  );

  const bar = (dark = true) => (
    <div className={`flex items-center gap-2 px-3 py-2 ${dark ? 'bg-black/60' : ''}`}>
      <button onClick={() => channel(-1)} className="p-1.5 text-white/70 hover:text-white" title="Previous channel">
        <SkipBack className="w-4 h-4" />
      </button>
      <button onClick={toggle} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      <button onClick={() => channel(1)} className="p-1.5 text-white/70 hover:text-white" title="Next channel">
        <SkipForward className="w-4 h-4" />
      </button>
      <span className="text-[10px] font-mono text-white/60 w-10 text-right">{fmtTime(t)}</span>
      <input
        type="range"
        min={0}
        max={dur || 1}
        step={0.1}
        value={Math.min(t, dur || t)}
        onChange={e => {
          const x = parseFloat(e.target.value);
          if (ref.current) ref.current.currentTime = x;
          setT(x);
        }}
        className="flex-1 min-w-0 accent-[var(--spot-accent)]"
        aria-label="Seek"
      />
      <span className="text-[10px] font-mono text-white/60 w-10">{fmtTime(dur)}</span>
      <button onClick={() => setMuted(m => !m)} className="p-1.5 text-white/70 hover:text-white" title={muted ? 'Unmute' : 'Mute'}>
        {muted || vol === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
      <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} onChange={e => { setVol(parseFloat(e.target.value)); setMuted(false); }} className="w-16 accent-white hidden sm:block" aria-label="Volume" />
      <button onClick={full} className="p-1.5 text-white/70 hover:text-white" title="Fullscreen">
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );

  if (look === 'leanback_tv') {
    return (
      <div ref={wrap} className="rounded-[var(--panel-radius,24px)] p-4 bg-gradient-to-b from-[#2a1d14] to-[#140e0b] border-4 border-[#3b2b20] shadow-2xl">
        <div className="flex gap-4">
          <div className="flex-1 min-w-0 rounded-[28px] overflow-hidden border-[6px] border-[#0e0906] shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]">{screen('aspect-video')}</div>
          <div className="w-16 shrink-0 flex flex-col items-center justify-between py-2">
            <button onClick={() => channel(1)} className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#2b1d14] via-[#5a402d] to-[#24170f] border-4 border-[#6b4c35] shadow-xl relative active:rotate-45 transition-transform" title="Turn to the next channel">
              <span className="absolute left-1/2 top-1 -translate-x-1/2 w-1.5 h-4 rounded-full bg-[#f9993c]" />
            </button>
            <div className="space-y-1.5 w-full">{[0, 1, 2, 3].map(k => <div key={k} className="h-1 rounded-full bg-[#291c13]" />)}</div>
            <button onClick={toggle} className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${playing ? 'bg-red-600 border-red-400 text-white shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'bg-[#291b12] border-[#4a3322] text-[#c49a70]'}`} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="w-4 h-4 fill-current" /> : <Power className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-black/30 overflow-hidden">{bar(false)}</div>
        <div className="mt-2 px-1 flex items-center justify-between text-xs text-amber-100/80 font-mono">
          <span className="truncate">{v.title}</span>
          {onOpenCinema && <button onClick={onOpenCinema} className="text-[#f9993c] hover:underline shrink-0 ml-2">Cinema →</button>}
        </div>
      </div>
    );
  }

  if (look === 'channel_grid') {
    const gs = genres.length ? genres : [...new Set(videos.map(x => x.genre).filter(Boolean))];
    return (
      <div ref={wrap} className="spot-card overflow-hidden">
        {screen('aspect-video')}
        {bar()}
        <div className="p-3 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {['', ...gs].map(gn => (
              <button key={gn || 'all'} onClick={() => { setGenre(gn); setI(0); }} className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${genre === gn ? 'bg-[var(--spot-accent)] text-black' : 'bg-white/5 text-zinc-300 hover:text-white'}`}>
                {gn || 'All'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {list.slice(0, 8).map((x, k) => (
              <button key={x.id} onClick={() => setI(k)} className={`text-left rounded-lg overflow-hidden border-2 ${k === i ? 'border-[var(--spot-accent)]' : 'border-transparent hover:border-white/20'}`}>
                <Art src={x.thumbnail} title={x.title} className="aspect-video" />
                <div className="text-[10px] text-white truncate px-1 py-0.5">{x.title}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Modern
  return (
    <div ref={wrap} className="spot-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5">
        <h3 className="spot-title flex items-center gap-2">
          <Tv className="w-4 h-4 text-[#f9993c]" /> Spot TV
        </h3>
        {onOpenCinema && (
          <button onClick={onOpenCinema} className="text-[11px] text-[#f9993c] hover:underline flex items-center gap-1">
            <Film className="w-3.5 h-3.5" /> Cinema →
          </button>
        )}
      </div>
      {screen('aspect-video')}
      {bar()}
      {list.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar p-3">
          {list.map((x, k) => (
            <button key={x.id} onClick={() => setI(k)} className={`shrink-0 w-28 text-left rounded-lg overflow-hidden border-2 ${k === i ? 'border-[#f9993c]' : 'border-transparent hover:border-white/20'}`}>
              <Art src={x.thumbnail} title={x.title} className="aspect-video" />
              <div className="text-[10px] text-white truncate px-1 py-0.5">{x.title}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
