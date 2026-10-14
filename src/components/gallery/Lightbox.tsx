'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Play, Pause, Maximize } from 'lucide-react';

export interface LightboxPicture {
  url: string;
  thumb?: string;
  name: string;
}

/**
 * Full-screen picture viewer: ←/→ to browse, Space for a slideshow, Esc to close.
 * `actions` renders extra buttons for the current picture (e.g. "Use as profile picture").
 */
export const Lightbox: React.FC<{
  pictures: LightboxPicture[];
  start: number;
  onClose: () => void;
  title?: string;
  actions?: (p: LightboxPicture, i: number) => React.ReactNode;
}> = ({ pictures, start, onClose, title, actions }) => {
  const [i, setI] = useState(start);
  const [show, setShow] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const n = pictures.length;
  const go = useCallback((d: number) => setI(x => (x + d + n) % n), [n]);

  useEffect(() => {
    if (i >= n) setI(Math.max(0, n - 1));
  }, [n, i]);
  useEffect(() => setLoaded(false), [i]);
  useEffect(() => {
    strip.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setShow(s => !s);
      } else if (e.key === 'f' || e.key === 'F') {
        (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen())?.catch?.(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => go(1), 3500);
    return () => clearInterval(id);
  }, [show, go]);

  // Preload the neighbours so browsing feels instant.
  useEffect(() => {
    for (const d of [1, -1]) {
      const p = pictures[(i + d + n) % n];
      if (p) new Image().src = p.url;
    }
  }, [i, n, pictures]);

  if (!n || typeof document === 'undefined') return null;
  const p = pictures[Math.min(i, n - 1)];
  return createPortal(
    <div ref={wrap} className="fixed inset-0 z-[75] bg-black/95 flex flex-col animate-fadeIn select-none">
      <div className="flex items-center gap-3 px-4 py-2.5 text-white">
        <div className="min-w-0 flex-1">
          {title && <div className="text-[11px] text-zinc-400 truncate">{title}</div>}
          <div className="text-sm font-bold truncate">{p.name}</div>
        </div>
        <span className="text-xs font-mono text-zinc-400">
          {i + 1} / {n}
        </span>
        {actions?.(p, i)}
        <button onClick={() => setShow(s => !s)} className="p-2 rounded-lg hover:bg-white/10" title={show ? 'Stop slideshow (Space)' : 'Slideshow (Space)'}>
          {show ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen())?.catch?.(() => {})} className="p-2 rounded-lg hover:bg-white/10" title="Fullscreen">
          <Maximize className="w-5 h-5" />
        </button>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" title="Close (Esc)">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
        {p.thumb && !loaded && <img src={p.thumb} alt="" className="absolute max-w-full max-h-full object-contain blur-sm opacity-60" />}
        <img
          key={p.url}
          src={p.url}
          alt={p.name}
          onLoad={() => setLoaded(true)}
          className={`relative max-w-[96vw] max-h-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          draggable={false}
        />
        {n > 1 && (
          <>
            <button onClick={() => go(-1)} className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center" aria-label="Previous">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button onClick={() => go(1)} className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 hover:bg-white/20 text-white flex items-center justify-center" aria-label="Next">
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
      {n > 1 && (
        <div ref={strip} className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 py-3 justify-start sm:justify-center">
          {pictures.map((q, k) => (
            <button key={q.url} data-i={k} onClick={() => setI(k)} className={`shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 ${k === i ? 'border-[var(--spot-accent)]' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <img src={q.thumb || q.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};
