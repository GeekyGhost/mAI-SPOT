'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Headphones, Radio, Play, Pause, Volume2 } from 'lucide-react';
import { AudioEngineProvider, useAudio } from '@/components/audio/AudioEngine';
import { Visualizer, VISUALIZER_MODES } from '@/components/audio/Visualizer';
import type { LiveBroadcast, VisualizerMode } from '@/lib/types';
import { fmtTime } from '@/lib/client';

/**
 * Public listening page. This is the only page other devices on your network can open:
 * it shows what's on air and plays it in sync with the broadcast clock.
 */
export default function ListenPage() {
  const listenerId = useMemo(() => Math.random().toString(36).slice(2, 12), []);
  return (
    <AudioEngineProvider listenerId={listenerId}>
      <Listener listenerId={listenerId} />
    </AudioEngineProvider>
  );
}

function Listener({ listenerId }: { listenerId: string }) {
  const a = useAudio();
  const [info, setInfo] = useState<LiveBroadcast | null>(null);
  const [vis, setVis] = useState<VisualizerMode>('radial');

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch(`/api/radio/live${a.mode === 'live' ? '' : `?listener=${listenerId}`}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => alive && setInfo(d))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [listenerId, a.mode]);

  const now = a.mode === 'live' && a.live ? a.live : info;
  const onAir = !!now?.live && !!now.track;
  const tuned = a.mode === 'live';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,#1b2a33,#030608_70%)] text-white flex flex-col items-center px-4 py-8" style={{ ['--spot-accent' as string]: '#2ee8f7', ['--spot-glow' as string]: 'rgba(46,232,247,0.35)' }}>
      <div className="flex items-center gap-2 text-sm font-mono text-[#649fae] mb-6">
        <Radio className="w-4 h-4 text-[#f9993c]" />
        <span>
          m<span className="text-[#2ee8f7]">AI</span> <span className="text-[#f9993c]">SPOT</span> RADIO
        </span>
        {now?.hostName && <span className="text-zinc-500">· {now.hostName}</span>}
      </div>

      {onAir && now?.track ? (
        <div className="w-full max-w-xl flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded bg-[#ff2e6e] text-[10px] font-black tracking-widest">ON AIR</span>
            <span className="font-black text-lg">{now.station?.name}</span>
          </div>
          {now.station?.tagline && <p className="text-sm text-zinc-400 mb-4">{now.station.tagline}</p>}

          <Visualizer
            analyser={a.analyser}
            isPlaying={a.isPlaying}
            mode={vis}
            coverUrl={now.track.coverArt}
            className="w-full aspect-square max-w-md rounded-3xl bg-black/30 border border-white/10"
          />

          <h1 className="text-2xl font-black mt-5">{now.track.title}</h1>
          <p className="text-zinc-400">
            {now.track.artist}
            {now.track.album ? ` — ${now.track.album}` : ''}
          </p>
          {tuned && (
            <p className="text-xs font-mono text-zinc-500 mt-1">
              {fmtTime(a.currentTime)} / {fmtTime(a.duration || now.track.duration)}
            </p>
          )}

          <div className="flex items-center gap-4 mt-6">
            {!tuned ? (
              <button
                onClick={() => a.tuneInLive()}
                className="px-6 py-3 rounded-full bg-[#2ee8f7] text-black font-black flex items-center gap-2 shadow-[0_0_30px_rgba(46,232,247,0.4)] hover:brightness-110"
              >
                <Headphones className="w-5 h-5" /> Tune in
              </button>
            ) : (
              <button onClick={a.toggle} className="w-14 h-14 rounded-full bg-[#2ee8f7] text-black flex items-center justify-center" aria-label={a.isPlaying ? 'Pause' : 'Play'}>
                {a.isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
              </button>
            )}
            {tuned && (
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-zinc-400" />
                <input type="range" min={0} max={1} step={0.01} value={a.volume} onChange={e => a.setVolume(parseFloat(e.target.value))} className="w-28 accent-[#2ee8f7]" />
              </div>
            )}
          </div>

          <div className="flex gap-1 mt-5">
            {VISUALIZER_MODES.map(m => (
              <button key={m.id} onClick={() => setVis(m.id)} className={`px-2 py-1 rounded text-[10px] font-mono uppercase ${vis === m.id ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {!!now.upNext?.length && (
            <div className="w-full mt-8 text-left">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#649fae] mb-2">Up next</h2>
              {now.upNext.map(t => (
                <div key={t.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                  <img src={t.coverArt} alt="" className="w-10 h-10 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="text-xs text-zinc-500 truncate">{t.artist}</div>
                  </div>
                  <span className="text-xs font-mono text-zinc-500">{fmtTime(t.duration)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-zinc-600 mt-6 flex items-center gap-1">
            <Headphones className="w-3.5 h-3.5" /> {now.listeners || 0} listening now
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center mt-20">
          <Radio className="w-14 h-14 text-zinc-700 mb-4" />
          <h1 className="text-2xl font-black">Off air</h1>
          <p className="text-zinc-400 mt-1">This station isn’t broadcasting right now. This page will pick it up automatically when it goes live.</p>
        </div>
      )}
    </div>
  );
}
