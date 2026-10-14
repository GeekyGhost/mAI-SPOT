'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Power, ChevronsLeft, ChevronsRight, Headphones, Radio } from 'lucide-react';
import { useP2P } from '@/components/social/P2PProvider';
import { useAudio } from '@/components/audio/AudioEngine';
import { Art } from '@/components/ui/kit';

/**
 * The Radio Dial: every friend who's on air sits on the FM band, every friend you can listen along
 * with sits on the AM band. Turn the knob to channel-surf; between stations there's real static.
 * Each friend's spot on the dial comes from their key, so they're always on the same frequency.
 */

type Band = 'FM' | 'AM';
interface DialStation {
  key: string;
  freq: number;
  name: string;
  title: string;
  sub: string;
  cover?: string;
  avatar?: string;
  url: string;
}

const BANDS: Record<Band, { min: number; max: number; step: number; unit: string; fmt: (f: number) => string; reach: number }> = {
  FM: { min: 88, max: 108, step: 0.1, unit: 'MHz', fmt: f => f.toFixed(1), reach: 0.35 },
  AM: { min: 530, max: 1700, step: 10, unit: 'kHz', fmt: f => String(Math.round(f)), reach: 25 }
};

function hashKey(k: string): number {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A stable frequency for a friend, nudged so two friends never share one. */
function place(keys: string[], band: Band): Map<string, number> {
  const b = BANDS[band];
  const slots = Math.floor((b.max - b.min) / (b.step * 2)) - 1;
  const used = new Set<number>();
  const out = new Map<string, number>();
  for (const k of [...keys].sort()) {
    let slot = hashKey(k + band) % slots;
    while (used.has(slot)) slot = (slot + 3) % slots;
    used.add(slot);
    const f = b.min + b.step + slot * b.step * 2; // FM: odd tenths, like real stations
    out.set(k, band === 'FM' ? Math.round(f * 10) / 10 : f);
  }
  return out;
}

/** Radio static from the Web Audio API: band-limited noise plus the odd crackle. */
function useStatic() {
  const ctxRef = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);
  const start = useCallback(() => {
    if (ctxRef.current) {
      ctxRef.current.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const crackle = Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 4 : 0;
      d[i] = (Math.random() * 2 - 1) * 0.5 + crackle;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start();
    ctxRef.current = { ctx, gain };
  }, []);
  const level = useCallback((v: number) => {
    const c = ctxRef.current;
    if (c) c.gain.gain.setTargetAtTime(v, c.ctx.currentTime, 0.05);
  }, []);
  const stop = useCallback(() => {
    level(0);
    setTimeout(() => ctxRef.current?.ctx.suspend().catch(() => {}), 200);
  }, [level]);
  useEffect(() => () => void ctxRef.current?.ctx.close().catch(() => {}), []);
  return { start, level, stop };
}

export const RadioDial: React.FC = () => {
  const p2p = useP2P();
  const audio = useAudio();
  const friends = p2p.state?.friends || [];
  const [band, setBand] = useState<Band>('FM');
  const [on, setOn] = useState(false);
  const [freq, setFreq] = useState<Record<Band, number>>({ FM: 98.1, AM: 1010 });
  const tunedUrl = useRef<string | null>(null);
  const knob = useRef<{ a: number; f: number } | null>(null);
  const knobEl = useRef<HTMLDivElement>(null);
  const noise = useStatic();
  const B = BANDS[band];
  const f = freq[band];

  const stations: DialStation[] = useMemo(() => {
    if (band === 'FM') {
      const live = friends.filter(x => x.online && x.live);
      const at = place(live.map(x => x.key), 'FM');
      return live.map(x => ({
        key: x.key, freq: at.get(x.key)!, name: x.name, title: x.live!.station, sub: x.live!.track, cover: x.live!.coverUrl, avatar: x.avatar,
        url: `/api/p2p/peer/${x.key}/live`
      }));
    }
    const np = friends.filter(x => x.online && x.nowPlaying);
    const at = place(np.map(x => x.key), 'AM');
    return np.map(x => ({
      key: x.key, freq: at.get(x.key)!, name: x.name, title: `${x.nowPlaying!.title}`, sub: `${x.nowPlaying!.artist} · ${x.nowPlaying!.playing ? 'playing' : 'paused'}`,
      cover: x.nowPlaying!.coverUrl, avatar: x.avatar, url: `/api/p2p/peer/${x.key}/along`
    }));
  }, [friends, band]);

  const nearest = useMemo(() => {
    let best: DialStation | null = null;
    let dist = Infinity;
    for (const s of stations) {
      const d = Math.abs(s.freq - f);
      if (d < dist) {
        dist = d;
        best = s;
      }
    }
    return { s: best, signal: best ? Math.max(0, 1 - dist / B.reach) : 0 };
  }, [stations, f, B.reach]);

  // Static gets quieter as you centre on a station.
  useEffect(() => {
    if (!on) return;
    noise.level(0.22 * Math.pow(1 - nearest.signal, 1.6) + (nearest.signal > 0 ? 0.01 : 0));
  }, [on, nearest.signal, noise]);

  // Lock on to a station once the signal is decent; let go when you tune away.
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!on) return;
    clearTimeout(lockTimer.current);
    const s = nearest.s;
    if (s && nearest.signal > 0.45) {
      if (tunedUrl.current === s.url && audio.mode === 'live') return;
      lockTimer.current = setTimeout(() => {
        tunedUrl.current = s.url;
        audio.tuneInLive(s.url);
      }, 280);
    } else if (nearest.signal < 0.15 && tunedUrl.current) {
      if (audio.mode === 'live' && audio.liveUrl === tunedUrl.current) audio.leaveLive();
      tunedUrl.current = null;
    }
    return () => clearTimeout(lockTimer.current);
  }, [on, nearest, audio]);

  const power = () => {
    if (on) {
      setOn(false);
      noise.stop();
      if (tunedUrl.current && audio.mode === 'live' && audio.liveUrl === tunedUrl.current) audio.leaveLive();
      tunedUrl.current = null;
    } else {
      noise.start();
      setOn(true);
    }
  };

  const tune = useCallback(
    (v: number) => {
      const b = BANDS[band];
      const snapped = Math.round(Math.min(b.max, Math.max(b.min, v)) / b.step) * b.step;
      setFreq(x => ({ ...x, [band]: band === 'FM' ? Math.round(snapped * 10) / 10 : snapped }));
    },
    [band]
  );
  const seek = (dir: 1 | -1) => {
    const sorted = [...stations].sort((a, b) => a.freq - b.freq);
    const next = dir > 0 ? sorted.find(s => s.freq > f + B.step / 2) || sorted[0] : [...sorted].reverse().find(s => s.freq < f - B.step / 2) || sorted[sorted.length - 1];
    if (next) {
      if (!on) power();
      tune(next.freq);
    }
  };

  const angleOf = (e: React.PointerEvent) => {
    const r = knobEl.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  const span = B.max - B.min;
  const pct = (x: number) => ((x - B.min) / span) * 100;
  const knobTurn = ((f - B.min) / span) * 720; // two full turns across the band
  const ticks = useMemo(() => {
    const out: { x: number; major: boolean; label?: string }[] = [];
    if (band === 'FM') for (let v = 88; v <= 108; v += 0.5) out.push({ x: pct(v), major: v % 2 === 0, label: v % 2 === 0 ? String(v) : undefined });
    else for (let v = 550; v <= 1700; v += 50) out.push({ x: pct(v), major: v % 200 === 0 || v === 550, label: v % 200 === 0 ? String(v / 10) : undefined });
    return out;
  }, [band]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = nearest.signal > 0.45 ? nearest.s : null;
  const amber = '#ffb347';

  return (
    <div className="rounded-3xl border border-[#3a2a12] bg-gradient-to-b from-[#1a1208] to-[#0c0905] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5" style={{ color: amber }} />
          <h2 className="text-lg font-bold text-[#ffe2b8]">Radio Dial</h2>
          <span className="text-[11px] text-[#a88a5c] hidden sm:inline">Your friends, on the air</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-[#5a4320] text-xs font-bold">
            {(['FM', 'AM'] as Band[]).map(b => (
              <button key={b} onClick={() => setBand(b)} className={`px-3 py-1 ${band === b ? 'bg-[#ffb347] text-black' : 'text-[#c9a46b] hover:text-[#ffe2b8]'}`} title={b === 'FM' ? 'Friends broadcasting a live station' : 'Friends listening to music right now: listen along'}>
                {b}
              </button>
            ))}
          </div>
          <button onClick={power} className={`w-9 h-9 rounded-full flex items-center justify-center border ${on ? 'bg-[#ff4d2e] border-[#ff8a6b] text-white shadow-[0_0_14px_#ff4d2e]' : 'bg-black/40 border-[#5a4320] text-[#a88a5c] hover:text-white'}`} title={on ? 'Turn the dial off' : 'Turn the dial on'} aria-pressed={on}>
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Display */}
      <div className={`rounded-2xl border border-black/60 bg-[#060402] px-4 py-3 flex items-center gap-4 shadow-[inset_0_2px_12px_rgba(0,0,0,0.8)] ${on ? '' : 'opacity-60'}`}>
        <div className="font-mono tabular-nums leading-none" style={{ color: on ? amber : '#5a4320', textShadow: on ? `0 0 12px ${amber}aa` : 'none' }}>
          <span className="text-4xl sm:text-5xl font-bold">{B.fmt(f)}</span>
          <span className="text-xs ml-1.5">{B.unit}</span>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {on && s ? (
            <>
              <Art src={s.cover || s.avatar} title={s.name} className="w-12 h-12 rounded-lg shrink-0 hidden sm:block" />
              <div className="min-w-0">
                <div className="text-[10px] font-black tracking-widest" style={{ color: amber }}>
                  {band === 'FM' ? `${s.name.toUpperCase()} · ON AIR` : `${s.name.toUpperCase()} IS LISTENING`}
                </div>
                <div className="text-[#ffe2b8] font-bold truncate">{s.title}</div>
                <div className="text-xs text-[#a88a5c] truncate">{s.sub}</div>
              </div>
            </>
          ) : (
            <div className="text-sm text-[#a88a5c]">
              {!on ? 'Press the power button, then turn the knob.' : stations.length ? '· · · static · · ·' : band === 'FM' ? 'Nobody’s on air right now. Friends appear here when they go live.' : 'No friends are playing music right now.'}
            </div>
          )}
        </div>
        <div className="hidden sm:flex items-end gap-0.5 h-6" title="Signal">
          {[0.15, 0.35, 0.55, 0.75, 0.92].map((t, i) => (
            <span key={i} className="w-1.5 rounded-sm" style={{ height: `${(i + 1) * 20}%`, background: on && nearest.signal >= t ? amber : '#3a2a12' }} />
          ))}
        </div>
      </div>

      {/* Scale */}
      <div
        className="relative mt-4 h-20 rounded-xl bg-gradient-to-b from-[#120d06] to-[#090603] border border-black/60 overflow-hidden cursor-pointer select-none"
        onPointerDown={e => {
          const r = e.currentTarget.getBoundingClientRect();
          if (!on) power();
          tune(B.min + ((e.clientX - r.left) / r.width) * span);
        }}
      >
        <div className="absolute inset-x-3 top-0 bottom-0">
          {ticks.map((t, i) => (
            <div key={i} className="absolute bottom-0" style={{ left: `${t.x}%` }}>
              <div className="w-px" style={{ height: t.major ? 18 : 9, background: on ? `${amber}cc` : '#4a3618' }} />
              {t.label && (
                <span className="absolute bottom-5 -translate-x-1/2 text-[10px] font-mono" style={{ color: on ? amber : '#5a4320' }}>
                  {t.label}
                </span>
              )}
            </div>
          ))}
          {stations.map(st => (
            <button
              key={st.key}
              onPointerDown={e => {
                e.stopPropagation();
                if (!on) power();
                tune(st.freq);
              }}
              className="absolute top-1.5 -translate-x-1/2 flex flex-col items-center group"
              style={{ left: `${pct(st.freq)}%` }}
              title={`${st.name} · ${B.fmt(st.freq)}`}
            >
              <span className="text-[9px] font-bold whitespace-nowrap px-1 rounded" style={{ color: '#ffe2b8', background: '#000a' }}>
                {st.name}
              </span>
              <span className="w-2 h-2 rounded-full mt-0.5" style={{ background: '#ff4d2e', boxShadow: '0 0 8px #ff4d2e' }} />
            </button>
          ))}
          <div className="absolute top-0 bottom-0 w-0.5 bg-[#ff3b1f] shadow-[0_0_10px_#ff3b1f] transition-[left] duration-75" style={{ left: `${pct(f)}%` }} />
        </div>
        {on && <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#ffb347]/10 to-transparent" />}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 mt-4">
        <button onClick={() => seek(-1)} disabled={!stations.length} className="flex items-center gap-1 text-xs font-bold text-[#c9a46b] hover:text-[#ffe2b8] disabled:opacity-30" title="Previous station">
          <ChevronsLeft className="w-5 h-5" /> SEEK
        </button>
        <div
          ref={knobEl}
          tabIndex={0}
          role="slider"
          aria-label="Tuning knob"
          aria-valuemin={B.min}
          aria-valuemax={B.max}
          aria-valuenow={f}
          className="w-24 h-24 rounded-full cursor-grab active:cursor-grabbing touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#ffb347] shadow-[0_8px_20px_rgba(0,0,0,0.7),inset_0_2px_3px_rgba(255,255,255,0.25)]"
          style={{ background: 'radial-gradient(circle at 35% 30%, #6b5a45, #2b2116 60%, #120d07)', transform: `rotate(${knobTurn}deg)` }}
          onPointerDown={e => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            if (!on) power();
            knob.current = { a: angleOf(e), f };
          }}
          onPointerMove={e => {
            const k = knob.current;
            if (!k) return;
            const a = angleOf(e);
            let d = a - k.a;
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            k.a = a;
            k.f += (d / (2 * Math.PI)) * (span / 2);
            tune(k.f);
          }}
          onPointerUp={() => (knob.current = null)}
          onWheel={e => {
            if (!on) power();
            tune(f + (e.deltaY < 0 ? B.step : -B.step));
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') tune(f + B.step);
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') tune(f - B.step);
            else if (e.key === 'PageUp') seek(1);
            else if (e.key === 'PageDown') seek(-1);
            else return;
            e.preventDefault();
            if (!on) power();
          }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className="absolute left-1/2 top-1/2 w-px h-2 bg-black/50" style={{ transform: `rotate(${i * 15}deg) translateY(-44px)` }} />
          ))}
          <span className="absolute left-1/2 top-2 w-1.5 h-4 -translate-x-1/2 rounded-full bg-[#ffb347] shadow-[0_0_6px_#ffb347]" />
        </div>
        <button onClick={() => seek(1)} disabled={!stations.length} className="flex items-center gap-1 text-xs font-bold text-[#c9a46b] hover:text-[#ffe2b8] disabled:opacity-30" title="Next station">
          SEEK <ChevronsRight className="w-5 h-5" />
        </button>
      </div>
      {on && s && audio.mode === 'live' && audio.liveUrl === s.url && (
        <p className="text-center text-[11px] text-[#a88a5c] mt-2 flex items-center justify-center gap-1">
          <Headphones className="w-3.5 h-3.5" /> {band === 'FM' ? `Tuned in to ${s.title}` : `Listening along with ${s.name}`}, in sync
        </p>
      )}
    </div>
  );
};
