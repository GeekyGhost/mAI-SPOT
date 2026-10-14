'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Images, FolderOpen, ChevronLeft, Loader2, ZoomIn, ZoomOut, Check } from 'lucide-react';
import { api, uploadFile } from '@/lib/client';
import { Modal, Btn } from '@/components/ui/kit';

type Source = { kind: 'pick' } | { kind: 'album'; id: string; name: string } | { kind: 'crop'; url: string };

/**
 * Choose a picture (upload, paste, drag, your albums, or images already on your Spot), then frame it.
 * The framed result is saved as a new image in content/thumbnails and its URL handed back.
 */
export const ImageCropper: React.FC<{
  open: boolean;
  onClose: () => void;
  onDone: (url: string) => void;
  aspect: number; // width / height
  outWidth: number;
  title: string;
  round?: boolean;
}> = ({ open, onClose, onDone, aspect, outWidth, title, round }) => {
  const [src, setSrc] = useState<Source>({ kind: 'pick' });
  useEffect(() => {
    if (open) setSrc({ kind: 'pick' });
  }, [open]);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={title} wide>
      {src.kind === 'crop' ? (
        <Cropper url={src.url} aspect={aspect} outWidth={outWidth} round={round} onBack={() => setSrc({ kind: 'pick' })} onDone={u => { onDone(u); onClose(); }} />
      ) : (
        <SourcePicker src={src} setSrc={setSrc} />
      )}
    </Modal>
  );
};

const SourcePicker: React.FC<{ src: Source; setSrc: (s: Source) => void }> = ({ src, setSrc }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [albums, setAlbums] = useState<{ id: string; name: string; count: number; cover: string }[] | null>(null);
  const [pics, setPics] = useState<{ name: string; url: string; thumb: string }[] | null>(null);
  const [thumbs, setThumbs] = useState<string[] | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    api('/api/pictures').then(d => setAlbums(d.albums)).catch(() => setAlbums([]));
    api('/api/assets')
      .then(d => setThumbs((d.assets || []).filter((a: { type: string; url: string }) => a.type === 'thumbnail' && !a.url.endsWith('.svg')).map((a: { url: string }) => a.url)))
      .catch(() => setThumbs([]));
  }, []);
  useEffect(() => {
    if (src.kind === 'album') {
      setPics(null);
      api(`/api/pictures?album=${encodeURIComponent(src.id)}`).then(d => setPics(d.pictures)).catch(() => setPics([]));
    }
  }, [src]);

  const fromFile = (f?: File | null) => {
    if (f && f.type.startsWith('image/')) setSrc({ kind: 'crop', url: URL.createObjectURL(f) });
  };

  if (src.kind === 'album') {
    return (
      <div className="space-y-3">
        <button onClick={() => setSrc({ kind: 'pick' })} className="text-sm text-[#649fae] hover:text-white flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-sm font-bold text-white">{src.name}</div>
        {!pics ? (
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[50vh] overflow-y-auto">
            {pics.map(p => (
              <button key={p.name} onClick={() => setSrc({ kind: 'crop', url: p.url })} className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-[var(--spot-accent)]">
                <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="space-y-5"
      tabIndex={0}
      onPaste={e => fromFile([...e.clipboardData.files].find(f => f.type.startsWith('image/')))}
      onDragOver={e => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault();
        setDrag(false);
        fromFile(e.dataTransfer.files?.[0]);
      }}
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => fromFile(e.target.files?.[0])} />
      <button
        onClick={() => fileRef.current?.click()}
        className={`w-full rounded-2xl border-2 border-dashed py-8 text-center transition-colors ${drag ? 'border-[var(--spot-accent)] bg-accent/10' : 'border-white/15 hover:border-white/40'}`}
      >
        <ImagePlus className="w-8 h-8 mx-auto text-[var(--spot-accent)]" />
        <div className="text-white font-bold mt-2">Upload a picture</div>
        <div className="text-xs text-zinc-500">or drag one here, or press Ctrl+V to paste</div>
      </button>
      {albums && albums.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-2 flex items-center gap-1.5">
            <Images className="w-3.5 h-3.5" /> From my albums
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {albums.map(a => (
              <button key={a.id} onClick={() => setSrc({ kind: 'album', id: a.id, name: a.name })} className="shrink-0 w-24 text-left">
                <div className="aspect-square rounded-xl overflow-hidden bg-black/40 border border-white/10 hover:border-white/40">{a.cover && <img src={a.cover} alt="" className="w-full h-full object-cover" />}</div>
                <div className="text-xs text-white truncate mt-1">{a.name}</div>
                <div className="text-[10px] text-zinc-500">{a.count}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {thumbs && thumbs.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-2 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" /> Already on my Spot
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-40 overflow-y-auto">
            {thumbs.map(u => (
              <button key={u} onClick={() => setSrc({ kind: 'crop', url: u })} className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-[var(--spot-accent)]">
                <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Cropper: React.FC<{ url: string; aspect: number; outWidth: number; round?: boolean; onBack: () => void; onDone: (url: string) => void }> = ({ url, aspect, outWidth, round, onBack, onDone }) => {
  const frameW = aspect >= 1.5 ? 560 : 320;
  const frameH = Math.round(frameW / aspect);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setErr('Couldn’t open that picture.');
    i.src = url;
  }, [url]);

  const base = img ? Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const scale = base * zoom;
  const clamp = (o: { x: number; y: number }, z = zoom) => {
    if (!img) return o;
    const w = img.naturalWidth * base * z;
    const h = img.naturalHeight * base * z;
    const mx = Math.max(0, (w - frameW) / 2);
    const my = Math.max(0, (h - frameH) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const setZ = (z: number) => {
    const nz = Math.min(5, Math.max(1, z));
    setZoom(nz);
    setOff(o => clamp(o, nz));
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    setErr('');
    try {
      const outH = Math.round(outWidth / aspect);
      const c = document.createElement('canvas');
      c.width = outWidth;
      c.height = outH;
      const ctx = c.getContext('2d')!;
      const left = frameW / 2 - (img.naturalWidth * scale) / 2 + off.x;
      const top = frameH / 2 - (img.naturalHeight * scale) / 2 + off.y;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, -left / scale, -top / scale, frameW / scale, frameH / scale, 0, 0, outWidth, outH);
      const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Couldn’t make the picture.');
      const up = await uploadFile('thumbnail', blob, `${aspect >= 1.5 ? 'banner' : 'avatar'}_${Date.now()}.jpg`);
      onDone(up.url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-[#649fae] hover:text-white flex items-center gap-1">
        <ChevronLeft className="w-4 h-4" /> Pick a different picture
      </button>
      <div className="flex justify-center">
        <div
          className={`relative overflow-hidden bg-black cursor-grab active:cursor-grabbing touch-none ${round ? 'rounded-full' : 'rounded-2xl'}`}
          style={{ width: frameW, height: frameH, maxWidth: '100%' }}
          onPointerDown={e => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
          }}
          onPointerMove={e => {
            const d = drag.current;
            if (d) setOff(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={e => setZ(zoom * (e.deltaY < 0 ? 1.08 : 0.93))}
        >
          {img ? (
            <img
              src={url}
              alt=""
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={{ width: img.naturalWidth * scale, height: img.naturalHeight * scale, transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          )}
          <div className={`absolute inset-0 pointer-events-none ring-2 ring-inset ring-white/60 ${round ? 'rounded-full' : 'rounded-2xl'}`} />
        </div>
      </div>
      <div className="flex items-center gap-3 max-w-sm mx-auto">
        <ZoomOut className="w-4 h-4 text-zinc-400" />
        <input type="range" min={1} max={5} step={0.01} value={zoom} onChange={e => setZ(parseFloat(e.target.value))} className="flex-1 accent-[var(--spot-accent)]" aria-label="Zoom" />
        <ZoomIn className="w-4 h-4 text-zinc-400" />
      </div>
      <p className="text-center text-xs text-zinc-500">Drag to position · scroll or use the slider to zoom</p>
      {err && <p className="text-center text-xs text-rose-400">{err}</p>}
      <div className="flex justify-end">
        <Btn variant="primary" onClick={save} disabled={!img || busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Use this
        </Btn>
      </div>
    </div>
  );
};
