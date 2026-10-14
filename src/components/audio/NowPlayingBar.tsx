'use client';

import React from 'react';
import { Maximize2, X } from 'lucide-react';
import { useAudio } from './AudioEngine';
import { Transport, SeekBar, VolumeControl, LiveBadge } from './Controls';
import { Visualizer } from './Visualizer';

/** Persistent mini player along the bottom; follows you across every section. */
export const NowPlayingBar: React.FC<{ onOpen: () => void; hidden?: boolean }> = ({ onOpen, hidden }) => {
  const a = useAudio();
  if (!a.current || hidden) return null;
  return (
    <div className="fixed left-0 right-0 bottom-14 md:bottom-0 z-[46] bg-[#070c0f]/95 backdrop-blur-xl border-t border-[#1a323c] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
      <div className="absolute inset-x-0 -top-px">
        <SeekBar compact className="h-1 [&>div]:h-1" />
      </div>
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-3">
        <button onClick={onOpen} className="flex items-center gap-3 min-w-0 flex-1 text-left group" title="Open the player">
          <img src={a.current.coverArt} alt="" className="w-11 h-11 rounded-lg object-cover border border-white/10" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {a.mode === 'live' && <LiveBadge />}
              <span className="text-sm font-bold text-white truncate group-hover:underline">{a.current.title}</span>
            </div>
            <span className="text-xs text-zinc-400 truncate block">
              {a.current.artist}
              {a.mode === 'live' && a.live?.station ? ` · ${a.live.station.name}` : a.label ? ` · ${a.label}` : ''}
            </span>
          </div>
        </button>
        <Visualizer analyser={a.analyser} isPlaying={a.isPlaying} mode="spectrum" className="hidden lg:block w-40 h-9" />
        <Transport size="sm" showModes={false} />
        <VolumeControl className="hidden md:flex" />
        <button onClick={onOpen} className="hidden sm:block p-2 text-zinc-400 hover:text-white" title="Open the player">
          <Maximize2 className="w-4 h-4" />
        </button>
        {a.mode === 'live' && (
          <button onClick={a.leaveLive} className="p-2 text-zinc-400 hover:text-white" title="Stop listening">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
