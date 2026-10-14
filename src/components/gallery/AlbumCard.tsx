'use client';

import React from 'react';
import { Clock, Image as ImageIcon } from 'lucide-react';
import { untilLabel } from '@/lib/p2pTypes';

/** "5 h left" badge for things shared for a limited time. */
export const Until: React.FC<{ until?: number }> = ({ until }) =>
  until ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 text-[10px] font-bold" title="Shared with you for a limited time">
      <Clock className="w-3 h-3" /> {untilLabel(until)}
    </span>
  ) : null;

export const AlbumCard: React.FC<{ title: string; count: number; covers: string[]; until?: number; onOpen: () => void; sub?: React.ReactNode; menu?: React.ReactNode }> = ({ title, count, covers, until, onOpen, sub, menu }) => (
  <div className="group text-left">
    <button onClick={onOpen} className="block w-full">
      <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 group-hover:border-white/40 bg-[#0b1216] grid grid-cols-2 grid-rows-2 gap-0.5 transition-colors">
        {covers.length === 0 && (
          <div className="col-span-2 row-span-2 flex items-center justify-center text-zinc-600">
            <ImageIcon className="w-10 h-10" />
          </div>
        )}
        {covers.length > 0 && covers.length < 4 && <img src={covers[0]} alt="" loading="lazy" className="col-span-2 row-span-2 w-full h-full object-cover" />}
        {covers.length >= 4 && covers.slice(0, 4).map(c => <img key={c} src={c} alt="" loading="lazy" className="w-full h-full object-cover" />)}
      </div>
    </button>
    <div className="mt-2 flex items-center gap-2">
      <button onClick={onOpen} className="font-bold text-white truncate text-left flex-1 min-w-0">
        {title}
      </button>
      {menu}
    </div>
    <div className="text-xs text-zinc-500 flex items-center gap-2">
      {count} picture{count === 1 ? '' : 's'} <Until until={until} /> {sub}
    </div>
  </div>
);
