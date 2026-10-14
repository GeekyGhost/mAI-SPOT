'use client';

import React, { useState } from 'react';
import { Sliders, ListMusic, Disc3, X, Music2, Radio } from 'lucide-react';
import { useAudio } from './AudioEngine';
import { Visualizer } from './Visualizer';
import { Transport, SeekBar, VolumeControl, VisualizerPicker, EqualizerPanel, LiveBadge } from './Controls';
import type { MusicPlayerStyle, VisualizerMode } from '@/lib/types';
import { fmtTime } from '@/lib/client';

export const SKINS: { id: MusicPlayerStyle; label: string; desc: string }[] = [
  { id: 'pulseamp_deck', label: 'PulseAmp Deck', desc: 'LCD hardware deck' },
  { id: 'vinyl_turntable', label: 'Turntable', desc: 'Spinning vinyl & tonearm' },
  { id: 'compact_player', label: 'Compact', desc: 'Clean modern card' }
];

const Cover: React.FC<{ src?: string; className?: string }> = ({ src, className = '' }) =>
  src ? (
    <img src={src} alt="" className={`object-cover ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-gradient-to-br from-[#1a323c] to-[#080f12] ${className}`}>
      <Music2 className="w-1/3 h-1/3 text-white/30" />
    </div>
  );

const NowLine: React.FC = () => {
  const a = useAudio();
  if (!a.current) return <p className="text-sm text-zinc-500">Pick a song, playlist or station to start.</p>;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        {a.mode === 'live' && <LiveBadge />}
        <span className="text-[10px] font-mono text-zinc-400 truncate uppercase">
          {a.mode === 'live' ? a.live?.station?.name : a.label || a.current.genre}
        </span>
      </div>
      <h3 className="text-white font-bold truncate">{a.current.title}</h3>
      <p className="text-sm text-zinc-400 truncate">
        {a.current.artist}
        {a.current.album ? ` — ${a.current.album}` : ''}
      </p>
    </div>
  );
};

const QueuePanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const a = useAudio();
  return (
    <div className="bg-[#0b1216] border border-[#1a323c] rounded-xl p-3 max-h-72 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono font-bold text-white">
          {a.mode === 'live' ? 'UP NEXT ON AIR' : `QUEUE · ${a.queue.length} TRACKS`}
        </span>
        <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs">✕</button>
      </div>
      {a.mode === 'live' ? (
        (a.live?.upNext || []).map(t => (
          <div key={t.id} className="flex items-center gap-2 py-1.5 text-xs">
            <Cover src={t.coverArt} className="w-8 h-8 rounded" />
            <div className="min-w-0 flex-1">
              <div className="text-white truncate">{t.title}</div>
              <div className="text-zinc-500 truncate">{t.artist}</div>
            </div>
            <span className="text-zinc-500 font-mono">{fmtTime(t.duration)}</span>
          </div>
        ))
      ) : (
        a.queue.map((t, i) => (
          <div
            key={`${t.id}_${i}`}
            className={`group flex items-center gap-2 py-1.5 px-1 rounded text-xs cursor-pointer hover:bg-white/5 ${i === a.index ? 'bg-white/5' : ''}`}
            onClick={() => a.jumpTo(i)}
          >
            <span className={`w-5 text-right font-mono ${i === a.index ? 'text-[var(--spot-accent)]' : 'text-zinc-600'}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className={`truncate ${i === a.index ? 'text-[var(--spot-accent)] font-bold' : 'text-white'}`}>{t.title}</div>
              <div className="text-zinc-500 truncate">{t.artist}</div>
            </div>
            <span className="text-zinc-500 font-mono">{fmtTime(t.duration)}</span>
            {i !== a.index && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  a.removeFromQueue(i);
                }}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-[#ff3c3c]"
                title="Remove from queue"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};

// ───────────────────────────── PulseAmp hardware deck ─────────────────────────────
const PulseAmpDeck: React.FC<{ vis: VisualizerMode }> = ({ vis }) => {
  const a = useAudio();
  const [remaining, setRemaining] = useState(false);
  const dur = a.duration || a.current?.duration || 0;
  const t = remaining && a.mode !== 'live' ? `-${fmtTime(dur - a.currentTime)}` : fmtTime(a.currentTime);
  return (
    <div className="bg-gradient-to-b from-[#121b21] to-[#0a1014] rounded-2xl border border-[#1f3a45] winamp-bevel-out p-4 shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono font-black tracking-[0.25em] text-[#39ff88]">PULSEAMP</span>
        <span className="text-[10px] font-mono text-zinc-500">
          {a.current?.kbps ? `${a.current.kbps} KBPS` : ''} {a.current?.khz ? `· ${a.current.khz} KHZ` : ''}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3">
        <div className="flex md:flex-col gap-3">
          <div
            onClick={() => setRemaining(r => !r)}
            className="cursor-pointer select-none winamp-lcd-screen winamp-bevel-in rounded px-3 py-2 min-w-[130px]"
            title="Elapsed / remaining"
          >
            <div className="text-[8px] font-mono text-[#39ff88]/60">{a.mode === 'live' ? 'ON AIR' : remaining ? 'REMAINING' : 'ELAPSED'}</div>
            <div className="led-text text-3xl font-black tracking-widest tabular-nums">{t}</div>
          </div>
          <Cover src={a.current?.coverArt} className="w-[130px] h-[130px] rounded border border-black/60 hidden md:block" />
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="winamp-lcd-screen winamp-bevel-in rounded px-3 py-1.5 overflow-hidden whitespace-nowrap">
            <div className="led-text text-sm font-bold inline-block animate-[marquee_14s_linear_infinite]">
              {a.current ? `${a.current.artist} — ${a.current.title}${a.current.album ? ` (${a.current.album})` : ''}  ★  ` : '*** NO SIGNAL ***'}
            </div>
          </div>
          <Visualizer analyser={a.analyser} isPlaying={a.isPlaying} mode={vis} lcd color="#39ff88" coverUrl={a.current?.coverArt} className="h-[120px] rounded winamp-bevel-in" />
        </div>
      </div>
      <div className="mt-3 flex flex-col md:flex-row md:items-center gap-3">
        <Transport />
        <SeekBar className="flex-1" />
        <VolumeControl />
      </div>
    </div>
  );
};

// ───────────────────────────── Turntable ─────────────────────────────
const VinylDeck: React.FC<{ vis: VisualizerMode }> = ({ vis }) => {
  const a = useAudio();
  const dur = a.duration || a.current?.duration || 0;
  const progress = dur ? a.currentTime / dur : 0;
  // Tonearm swings from rest (-28°) onto the record (8°) and tracks inward as the song plays.
  const arm = a.current && (a.isPlaying || a.currentTime > 0) ? 8 + progress * 18 : -28;
  return (
    <div className="rounded-2xl p-5 border border-[#3b2a1c] shadow-2xl bg-[radial-gradient(circle_at_30%_20%,#3a2a1d,#1a120b_70%)]">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
        <div className="relative w-[260px] h-[260px] mx-auto">
          <div className="absolute inset-0 rounded-full bg-[#111] shadow-[0_10px_40px_rgba(0,0,0,0.7)]" />
          <div
            className="absolute inset-2 rounded-full bg-[repeating-radial-gradient(circle,#161616_0px,#161616_2px,#1f1f1f_3px,#161616_4px)] flex items-center justify-center"
            style={{ animation: 'spin 1.8s linear infinite', animationPlayState: a.isPlaying ? 'running' : 'paused' }}
          >
            <div className="w-[38%] h-[38%] rounded-full overflow-hidden border-4 border-black/70">
              <Cover src={a.current?.coverArt} className="w-full h-full" />
            </div>
            <div className="absolute w-3 h-3 rounded-full bg-zinc-300 border border-black" />
          </div>
          <div
            className="absolute top-2 right-0 w-5 h-[150px] origin-[50%_10px] transition-transform duration-700"
            style={{ transform: `rotate(${arm}deg)` }}
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-b from-zinc-300 to-zinc-500 border border-black/50" />
            <div className="mx-auto w-1.5 h-[118px] bg-gradient-to-b from-zinc-300 to-zinc-500" />
            <div className="mx-auto w-4 h-6 rounded-sm bg-zinc-700 border border-black/50" />
          </div>
        </div>
        <div className="flex flex-col gap-3 min-w-0">
          <NowLine />
          <Visualizer analyser={a.analyser} isPlaying={a.isPlaying} mode={vis} color="#f9993c" coverUrl={a.current?.coverArt} className="h-[110px] rounded-xl bg-black/30" />
          <SeekBar />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Transport />
            <VolumeControl />
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────── Compact ─────────────────────────────
const CompactDeck: React.FC<{ vis: VisualizerMode }> = ({ vis }) => {
  const a = useAudio();
  return (
    <div className="rounded-2xl p-4 bg-[#0d161a]/90 border border-[#1a323c] shadow-xl backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden">
          <Cover src={a.current?.coverArt} className="w-full h-full" />
          {a.isPlaying && <Disc3 className="absolute bottom-1 right-1 w-5 h-5 text-white/80 animate-spin" />}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <NowLine />
          <SeekBar />
        </div>
      </div>
      <Visualizer analyser={a.analyser} isPlaying={a.isPlaying} mode={vis} coverUrl={a.current?.coverArt} className="h-14 mt-3 rounded-lg" />
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <Transport size="sm" />
        <VolumeControl />
      </div>
    </div>
  );
};

/**
 * The music player with switchable looks. Used on the Radio page (with pickers) and on the
 * Spot profile page (with the skin chosen in Studio).
 */
export const MusicDeck: React.FC<{
  skin: MusicPlayerStyle;
  visualizer: VisualizerMode;
  onSkinChange?: (s: MusicPlayerStyle) => void;
  onVisualizerChange?: (v: VisualizerMode) => void;
  showTools?: boolean;
  onBrowse?: () => void;
}> = ({ skin, visualizer, onSkinChange, onVisualizerChange, showTools = true, onBrowse }) => {
  const a = useAudio();
  const [showEq, setShowEq] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  return (
    <div className="space-y-3">
      {showTools && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {onSkinChange ? (
            <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5 border border-white/10">
              {SKINS.map(s => (
                <button
                  key={s.id}
                  onClick={() => onSkinChange(s.id)}
                  title={s.desc}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    skin === s.id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {onVisualizerChange && <VisualizerPicker value={visualizer} onChange={onVisualizerChange} />}
            <button
              onClick={() => setShowEq(v => !v)}
              className={`p-2 rounded-lg border text-xs ${showEq ? 'bg-[var(--spot-accent)] text-black border-transparent' : 'border-white/10 text-zinc-300 hover:text-white'}`}
              title="Equalizer"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowQueue(v => !v)}
              className={`p-2 rounded-lg border text-xs ${showQueue ? 'bg-[var(--spot-accent)] text-black border-transparent' : 'border-white/10 text-zinc-300 hover:text-white'}`}
              title={a.mode === 'live' ? 'Up next' : 'Queue'}
            >
              <ListMusic className="w-4 h-4" />
            </button>
            {onBrowse && (
              <button onClick={onBrowse} className="p-2 rounded-lg border border-white/10 text-zinc-300 hover:text-white" title="Open Radio">
                <Radio className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
      {skin === 'vinyl_turntable' ? <VinylDeck vis={visualizer} /> : skin === 'compact_player' ? <CompactDeck vis={visualizer} /> : <PulseAmpDeck vis={visualizer} />}
      {(showEq || showQueue) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {showEq && <EqualizerPanel onClose={() => setShowEq(false)} />}
          {showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}
        </div>
      )}
    </div>
  );
};
