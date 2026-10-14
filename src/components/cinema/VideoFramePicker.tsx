'use client';

import React, { useRef, useState } from 'react';
import { Loader2, Camera, SkipBack, ChevronLeft, ChevronRight } from 'lucide-react';
import { uploadFile, fmtTime } from '@/lib/client';
import { Btn } from '@/components/ui/kit';

/**
 * Scrub through a video and use any frame (or the first one) as its poster.
 * Calls onPick with the saved thumbnail URL and the time it was taken at.
 */
export const VideoFramePicker: React.FC<{ src: string; initialTime?: number; onPick: (url: string, time: number) => void }> = ({ src, initialTime = 0, onPick }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(0);
  const [t, setT] = useState(initialTime);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const seek = (time: number) => {
    const v = ref.current;
    if (!v) return;
    const clamped = Math.min(Math.max(0, time), Math.max(0, (v.duration || 0) - 0.05));
    v.currentTime = clamped === 0 ? 0.001 : clamped;
    setT(clamped);
  };

  const grab = async () => {
    const v = ref.current;
    if (!v || !v.videoWidth) {
      setErr('This video can’t be read by your browser (its codec isn’t supported), so a frame can’t be taken. Upload an image instead.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const w = Math.min(1280, v.videoWidth);
      const h = Math.round(w * (v.videoHeight / v.videoWidth));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(v, 0, 0, w, h);
      const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      if (!blob) throw new Error('Couldn’t capture the frame.');
      const up = await uploadFile('thumbnail', blob, `poster_frame_${Math.round(t * 1000)}.jpg`);
      onPick(up.url, t);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae]">Use a frame from the video</div>
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        className="w-full aspect-video bg-black rounded-lg"
        onLoadedMetadata={e => {
          setDur(e.currentTarget.duration || 0);
          seek(initialTime);
        }}
        onError={() => setErr('This video can’t be played in your browser, so frames can’t be picked. Upload an image instead.')}
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => seek(t - 1 / 24)} className="p-1 text-zinc-400 hover:text-white" title="Back one frame">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input type="range" min={0} max={dur || 1} step={0.04} value={t} onChange={e => seek(parseFloat(e.target.value))} className="flex-1 accent-[#f9993c]" aria-label="Pick a frame" />
        <button type="button" onClick={() => seek(t + 1 / 24)} className="p-1 text-zinc-400 hover:text-white" title="Forward one frame">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-mono text-zinc-400 w-16 text-right">{fmtTime(t)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn small type="button" onClick={() => seek(0)}>
          <SkipBack className="w-3.5 h-3.5" /> First frame
        </Btn>
        <Btn small type="button" variant="primary" onClick={grab} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} Use this frame
        </Btn>
      </div>
      {err && <p className="text-[11px] text-rose-400">{err}</p>}
    </div>
  );
};
