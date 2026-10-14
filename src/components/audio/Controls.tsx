'use client';

import React from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, VolumeX, Loader2, Radio
} from 'lucide-react';
import { useAudio, EQ_LABELS, EQ_PRESETS } from './AudioEngine';
import { VISUALIZER_MODES } from './Visualizer';
import type { VisualizerMode } from '@/lib/types';
import { fmtTime } from '@/lib/client';

export const Transport: React.FC<{ size?: 'sm' | 'md' | 'lg'; showModes?: boolean }> = ({ size = 'md', showModes = true }) => {
  const a = useAudio();
  const live = a.mode === 'live';
  const big = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  const small = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const icon = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <div className="flex items-center gap-1.5">
      {showModes && (
        <button
          onClick={a.toggleShuffle}
          disabled={live}
          title="Shuffle"
          className={`${small} rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 ${a.shuffle ? 'text-[var(--spot-accent)]' : 'text-zinc-400 hover:text-white'}`}
        >
          <Shuffle className="w-4 h-4" />
        </button>
      )}
      <button onClick={a.prev} disabled={live} title="Previous" className={`${small} rounded-lg flex items-center justify-center text-zinc-200 hover:bg-white/10 disabled:opacity-30`}>
        <SkipBack className="w-4 h-4 fill-current" />
      </button>
      <button
        onClick={a.toggle}
        disabled={!a.current}
        title={a.isPlaying ? 'Pause' : 'Play'}
        className={`${big} rounded-full flex items-center justify-center bg-[var(--spot-accent)] text-black shadow-[0_0_18px_var(--spot-glow)] hover:brightness-110 disabled:opacity-40 transition-all`}
      >
        {a.isBuffering && a.isPlaying ? (
          <Loader2 className={`${icon} animate-spin`} />
        ) : a.isPlaying ? (
          <Pause className={`${icon} fill-current`} />
        ) : (
          <Play className={`${icon} fill-current ml-0.5`} />
        )}
      </button>
      <button onClick={a.next} disabled={live} title="Next" className={`${small} rounded-lg flex items-center justify-center text-zinc-200 hover:bg-white/10 disabled:opacity-30`}>
        <SkipForward className="w-4 h-4 fill-current" />
      </button>
      {showModes && (
        <button
          onClick={a.cycleRepeat}
          disabled={live}
          title={`Repeat: ${a.repeat}`}
          className={`${small} rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 ${a.repeat !== 'off' ? 'text-[var(--spot-accent)]' : 'text-zinc-400 hover:text-white'}`}
        >
          {a.repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
};

export const SeekBar: React.FC<{ className?: string; compact?: boolean }> = ({ className = '', compact }) => {
  const a = useAudio();
  const live = a.mode === 'live';
  const dur = a.duration || a.current?.duration || 0;
  const pct = dur ? Math.min(100, (a.currentTime / dur) * 100) : 0;
  return (
    <div className={`flex items-center gap-2 w-full ${className}`}>
      {!compact && <span className="text-[10px] font-mono text-zinc-400 w-10 text-right tabular-nums">{fmtTime(a.currentTime)}</span>}
      <div className="relative flex-1 h-4 flex items-center group">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-[var(--spot-accent)]" style={{ width: `${pct}%` }} />
        </div>
        {!live && (
          <input
            type="range"
            min={0}
            max={dur || 1}
            step={0.1}
            value={Math.min(a.currentTime, dur || 1)}
            onChange={e => a.seek(parseFloat(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            aria-label="Seek"
          />
        )}
      </div>
      {!compact && (
        <span className="text-[10px] font-mono text-zinc-400 w-10 tabular-nums">
          {live ? <span className="text-[#ff2e6e] font-bold">LIVE</span> : fmtTime(dur)}
        </span>
      )}
    </div>
  );
};

export const VolumeControl: React.FC<{ className?: string }> = ({ className = '' }) => {
  const a = useAudio();
  const v = a.muted ? 0 : a.volume;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button onClick={a.toggleMute} className="text-zinc-400 hover:text-white" title={a.muted ? 'Unmute' : 'Mute'}>
        {v === 0 ? <VolumeX className="w-4 h-4 text-[#ff3c3c]" /> : <Volume2 className="w-4 h-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={v}
        onChange={e => a.setVolume(parseFloat(e.target.value))}
        className="w-20 accent-[var(--spot-accent)]"
        aria-label="Volume"
      />
    </div>
  );
};

export const VisualizerPicker: React.FC<{ value: VisualizerMode; onChange: (m: VisualizerMode) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5 border border-white/10">
    {VISUALIZER_MODES.map(m => (
      <button
        key={m.id}
        onClick={() => onChange(m.id)}
        className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase transition-colors ${
          value === m.id ? 'bg-[var(--spot-accent)] text-black' : 'text-zinc-400 hover:text-white'
        }`}
      >
        {m.label}
      </button>
    ))}
  </div>
);

export const EqualizerPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const a = useAudio();
  const { eq } = a;
  const Slider = ({ value, onChange, label, color }: { value: number; onChange: (v: number) => void; label: string; color?: string }) => (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <span className="text-[9px] font-mono tabular-nums" style={{ color: color || 'var(--spot-accent)' }}>
        {value > 0 ? `+${value}` : value}
      </span>
      <input
        type="range"
        min={-12}
        max={12}
        step={1}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="h-24 w-4 winamp-slider"
        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        aria-label={`${label} gain`}
      />
      <span className="text-[9px] text-zinc-400 font-mono">{label}</span>
    </div>
  );
  return (
    <div className="bg-[#0b1216] border border-[#1a323c] rounded-xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-white">10-BAND EQUALIZER</span>
          <button
            onClick={() => a.setEqEnabled(!eq.enabled)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${eq.enabled ? 'bg-[var(--spot-accent)] text-black' : 'bg-zinc-700 text-zinc-300'}`}
          >
            {eq.enabled ? 'ON' : 'OFF'}
          </button>
          {!a.analyser && <span className="text-[10px] text-zinc-500">(starts with playback)</span>}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={EQ_PRESETS[eq.preset] ? eq.preset : 'Custom'}
            onChange={e => a.applyPreset(e.target.value)}
            className="bg-black/50 border border-white/10 rounded px-2 py-1 text-[11px] text-white"
          >
            {Object.keys(EQ_PRESETS).map(p => (
              <option key={p}>{p}</option>
            ))}
            {!EQ_PRESETS[eq.preset] && <option>Custom</option>}
          </select>
          {onClose && (
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs px-1">
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="flex items-end justify-between gap-1 overflow-x-auto">
        <Slider value={eq.preamp} onChange={a.setPreamp} label="PRE" color="#ffcf33" />
        <div className="w-px h-28 bg-white/10 mx-1 shrink-0" />
        {eq.gains.map((g, i) => (
          <Slider key={i} value={g} onChange={v => a.setEqBand(i, v)} label={EQ_LABELS[i]} />
        ))}
      </div>
    </div>
  );
};

export const LiveBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#ff2e6e] text-white text-[9px] font-black tracking-wider ${className}`}>
    <Radio className="w-3 h-3" /> LIVE
  </span>
);
