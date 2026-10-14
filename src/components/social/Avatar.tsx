'use client';

import React from 'react';
import { Art } from '@/components/ui/kit';

/** Square avatar with an optional presence dot. */
export const Avatar: React.FC<{ src?: string; name: string; online?: boolean; status?: string; size?: string; round?: boolean }> = ({ src, name, online, status, size = 'w-10 h-10', round }) => {
  const dot = !online ? 'bg-zinc-600' : status === 'away' ? 'bg-amber-400' : status === 'dnd' ? 'bg-rose-500' : 'bg-emerald-400';
  return (
    <div className={`relative shrink-0 ${size}`}>
      <Art src={src} title={(name || '?').slice(0, 2).toUpperCase()} className={`w-full h-full ${round ? 'rounded-full' : 'rounded-xl'} border border-white/10`} />
      {online !== undefined && <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0b1216] ${dot}`} />}
    </div>
  );
};
