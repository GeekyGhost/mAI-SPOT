'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MoreVertical, ImagePlus, Loader2 } from 'lucide-react';
import { uploadFile, gradientFor } from '@/lib/client';

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ open, onClose, title, children, footer, wide }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fadeIn" onMouseDown={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[92vh] flex flex-col bg-[#0b1216] border border-[#1f3a45] rounded-2xl shadow-2xl`}
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a323c]">
          <h3 className="font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-[#1a323c] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-zinc-500 mt-1">{hint}</span>}
  </label>
);

export const inputCls =
  'w-full bg-black/40 border border-[#1f3a45] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-[var(--spot-accent)]';

export const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; small?: boolean }
> = ({ variant = 'ghost', small, className = '', ...rest }) => {
  const base = small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';
  const v =
    variant === 'primary'
      ? 'bg-[var(--spot-accent)] text-black font-bold hover:brightness-110'
      : variant === 'danger'
      ? 'bg-[#ff3c3c]/15 text-[#ff6b6b] border border-[#ff3c3c]/40 hover:bg-[#ff3c3c]/25'
      : 'bg-white/5 text-zinc-200 border border-white/10 hover:bg-white/10';
  return <button {...rest} className={`${base} ${v} rounded-lg inline-flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 ${className}`} />;
};

export const Chip: React.FC<{ active?: boolean; onClick?: () => void; children: React.ReactNode; count?: number }> = ({
  active,
  onClick,
  children,
  count
}) => (
  <button
    onClick={onClick}
    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
      active
        ? 'bg-[var(--spot-accent)] text-black border-transparent'
        : 'bg-white/5 text-zinc-300 border-white/10 hover:text-white hover:border-white/30'
    }`}
  >
    {children}
    {count !== undefined && <span className={`ml-1.5 ${active ? 'text-black/60' : 'text-zinc-500'}`}>{count}</span>}
  </button>
);

/** "⋮" menu. Items with `danger` are styled red. */
export const Menu: React.FC<{
  items: ({ label: string; onClick: () => void; danger?: boolean } | null)[];
  className?: string;
}> = ({ items, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const right = Math.max(8, window.innerWidth - rect.right);

    // If less than 280px below and more space above, open upwards
    if (spaceBelow < 280 && spaceAbove > spaceBelow) {
      setPos({
        bottom: window.innerHeight - rect.top + 4,
        right
      });
    } else {
      setPos({
        top: rect.bottom + 4,
        right
      });
    }
  }, []);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) {
      updatePos();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const filtered = items.filter(Boolean);
  if (!filtered.length) return null;

  return (
    <div className={`relative inline-block ${className}`} onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={toggle}
        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
        aria-label="More"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top !== undefined ? `${pos.top}px` : undefined,
            bottom: pos.bottom !== undefined ? `${pos.bottom}px` : undefined,
            right: `${pos.right}px`,
            maxHeight: '288px'
          }}
          className="z-[9999] min-w-[200px] max-w-[calc(100vw-1rem)] overflow-y-auto bg-[#0f1a1f] border border-[#1f3a45] rounded-xl shadow-2xl py-1 animate-fadeIn"
          onClick={e => e.stopPropagation()}
        >
          {filtered.map((it, i) =>
            it!.label === '—' ? (
              <div key={i} className="my-1 border-t border-white/10" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  it!.onClick();
                }}
                className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                  it!.danger ? 'text-[#ff6b6b] hover:text-[#ff4c4c]' : 'text-zinc-200'
                }`}
              >
                {it!.label}
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

/** Artwork with a generated fallback so nothing renders as a broken image. */
export const Art: React.FC<{ src?: string; title: string; className?: string; children?: React.ReactNode }> = ({
  src,
  title,
  className = '',
  children
}) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <div className={`relative overflow-hidden ${className}`} style={!src || broken ? { background: gradientFor(title) } : undefined}>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-3 text-center">
          <span className="text-white/85 font-black text-sm leading-tight line-clamp-4 drop-shadow">{title}</span>
        </div>
      )}
      {children}
    </div>
  );
};

/**
 * Cover / artwork picker used by every editor.
 * Sources: upload (button, drag-and-drop, or paste), images already on this Spot, and an optional
 * `extra` slot for type-specific sources (a video frame, a comic page…). Hands back a thumbnail URL.
 */
export const ImagePicker: React.FC<{
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: string;
  extra?: React.ReactNode;
}> = ({ value, onChange, label = 'Artwork', aspect = 'aspect-square', extra }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [gallery, setGallery] = useState<string[] | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (f: File | Blob, name: string) => {
    if (f.type && !f.type.startsWith('image/')) {
      setErr('That isn’t an image.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await uploadFile('thumbnail', f, name);
      onChange(r.url);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openGallery = async () => {
    setShowGallery(v => !v);
    if (gallery) return;
    try {
      const res = await fetch('/api/assets').then(r => r.json());
      const imgs = (res.assets || [])
        .filter((a: { type: string }) => a.type === 'thumbnail')
        .sort((a: { updatedAt: string }, b: { updatedAt: string }) => b.updatedAt.localeCompare(a.updatedAt))
        .map((a: { url: string }) => a.url);
      setGallery(imgs);
    } catch {
      setGallery([]);
    }
  };

  return (
    <div>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">{label}</span>
      <div
        tabIndex={0}
        onDragOver={e => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f, f.name);
        }}
        onPaste={e => {
          const f = [...e.clipboardData.files].find(x => x.type.startsWith('image/'));
          if (f) {
            e.preventDefault();
            upload(f, f.name || 'pasted.png');
          }
        }}
        className={`rounded-xl border border-dashed p-3 outline-none transition-colors ${drag ? 'border-[var(--spot-accent)] bg-accent/10' : 'border-white/10 focus:border-white/30'}`}
      >
        <div className="flex items-start gap-3">
          <div className={`w-24 ${aspect} rounded-lg overflow-hidden bg-black/40 border border-white/10 shrink-0 relative`}>
            {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600">none</span>}
            {busy && (
              <span className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 min-w-0">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) upload(f, f.name);
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              <Btn small onClick={() => inputRef.current?.click()} disabled={busy} type="button">
                <ImagePlus className="w-3.5 h-3.5" /> Upload
              </Btn>
              <Btn small onClick={openGallery} type="button">
                From my Spot
              </Btn>
              {value && (
                <Btn small onClick={() => onChange('')} type="button">
                  Clear
                </Btn>
              )}
            </div>
            <span className="text-[11px] text-zinc-500">…or drag an image here, or click this box and paste (Ctrl+V).</span>
          </div>
        </div>
        {showGallery && (
          <div className="mt-3 grid grid-cols-5 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">
            {gallery === null ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            ) : gallery.length === 0 ? (
              <span className="col-span-full text-xs text-zinc-500">No images yet.</span>
            ) : (
              gallery.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    onChange(u);
                    setShowGallery(false);
                  }}
                  className={`aspect-square rounded overflow-hidden border-2 ${u === value ? 'border-[var(--spot-accent)]' : 'border-transparent hover:border-white/40'}`}
                >
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))
            )}
          </div>
        )}
        {extra && <div className="mt-3 pt-3 border-t border-white/10">{extra}</div>}
      </div>
      {err && <span className="text-xs text-[#ff6b6b]">{err}</span>}
    </div>
  );
};

export const Empty: React.FC<{ icon: React.ReactNode; title: string; children?: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 px-6 border border-dashed border-white/10 rounded-2xl">
    <div className="text-[var(--spot-accent)] mb-3">{icon}</div>
    <h3 className="text-white font-bold mb-1">{title}</h3>
    <div className="text-sm text-zinc-400 max-w-md">{children}</div>
  </div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between gap-3 mb-3">
    <h3 className="text-lg font-black text-white tracking-tight">{children}</h3>
    {right}
  </div>
);
