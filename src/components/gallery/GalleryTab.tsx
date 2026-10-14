'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Images, FolderPlus, Upload, ChevronLeft, Share2, Play, Pencil, Trash2, Loader2, UserCircle2, PanelTop, GalleryHorizontal, Send, FolderInput, Check } from 'lucide-react';
import type { StationProfile } from '@/lib/types';
import { api, uploadFile } from '@/lib/client';
import { Btn, Empty, Menu, Modal, Field, inputCls } from '@/components/ui/kit';
import { useP2P } from '@/components/social/P2PProvider';
import { AlbumCard } from './AlbumCard';
import { Lightbox, type LightboxPicture } from './Lightbox';

interface Album {
  id: string;
  name: string;
  count: number;
  cover: string;
  covers: string[];
  updatedAt: number;
  sizeBytes: number;
}
interface Picture {
  name: string;
  url: string;
  thumb: string;
  hasThumb: boolean;
  size: number;
  mtime: number;
}

const LOOSE = '_loose';
const RASTER = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

/** Make a small JPEG preview in the browser (no image libraries needed on the node). */
async function makeThumb(url: string, max = 480): Promise<Blob | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
}

/** Pictures used on the profile or in posts live in content/thumbnails so friends can fetch them. */
export async function copyToThumbnails(url: string, name: string): Promise<string> {
  const blob = await fetch(url).then(r => r.blob());
  const up = await uploadFile('thumbnail', blob, name);
  return up.url as string;
}

export const GalleryTab: React.FC<{ profile: StationProfile | null; onUpdateProfile: (u: Partial<StationProfile>) => Promise<void> | void }> = ({ profile, onUpdateProfile }) => {
  const p2p = useP2P();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [pics, setPics] = useState<Picture[]>([]);
  const [view, setView] = useState<number | null>(null);
  const [uploads, setUploads] = useState<{ name: string; p: number; err?: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const [naming, setNaming] = useState<{ mode: 'create' | 'rename'; value: string } | null>(null);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbing = useRef(false);

  const loadAlbums = useCallback(() => api('/api/pictures').then(d => setAlbums(d.albums)).catch(() => setAlbums([])), []);
  const loadPics = useCallback((id: string) => api(`/api/pictures?album=${encodeURIComponent(id)}`).then(d => setPics(d.pictures)).catch(() => setPics([])), []);
  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);
  // The top bar's "Add" button.
  useEffect(() => {
    const add = () => fileRef.current?.click();
    window.addEventListener('maispot:add-pictures', add);
    return () => window.removeEventListener('maispot:add-pictures', add);
  }, []);
  useEffect(() => {
    if (open) loadPics(open);
    else setPics([]);
  }, [open, loadPics]);

  // Make previews for pictures that don't have one yet (quietly, one at a time).
  useEffect(() => {
    if (!open || thumbing.current) return;
    const todo = pics.filter(p => !p.hasThumb);
    if (!todo.length) return;
    thumbing.current = true;
    (async () => {
      for (const p of todo.slice(0, 200)) {
        const blob = await makeThumb(p.url);
        if (blob) await fetch(`/api/pictures/thumb/${encodeURIComponent(open)}/${encodeURIComponent(p.name)}`, { method: 'POST', body: blob }).catch(() => {});
        setPics(list => list.map(x => (x.name === p.name ? { ...x, hasThumb: true, thumb: `${x.thumb.split('?')[0]}?v=1` } : x)));
      }
      thumbing.current = false;
      loadAlbums();
    })();
  }, [open, pics, loadAlbums]);

  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(''), 2600);
  };

  const uploadMany = async (files: File[], album: string) => {
    const imgs = files.filter(f => RASTER.test(f.name));
    if (!imgs.length) return;
    setUploads(imgs.map(f => ({ name: f.name, p: 0 })));
    for (const [k, f] of imgs.entries()) {
      try {
        await uploadFile('picture', f, f.name, { album }, p => setUploads(u => u.map((x, j) => (j === k ? { ...x, p } : x))));
        setUploads(u => u.map((x, j) => (j === k ? { ...x, p: 1 } : x)));
      } catch (e) {
        setUploads(u => u.map((x, j) => (j === k ? { ...x, err: (e as Error).message } : x)));
      }
    }
    setTimeout(() => setUploads([]), 1500);
    loadAlbums();
    if (open === album) loadPics(album);
    else setOpen(album);
  };

  const albumName = (id: string | null) => (id === LOOSE ? 'Loose pictures' : id || '');
  const cur = albums?.find(a => a.id === open);

  const saveName = async () => {
    if (!naming) return;
    try {
      if (naming.mode === 'create') {
        const r = await api('/api/pictures', { method: 'POST', json: { action: 'create', name: naming.value } });
        setNaming(null);
        await loadAlbums();
        setOpen(r.id);
      } else if (open) {
        const r = await api('/api/pictures', { method: 'POST', json: { action: 'rename', id: open, name: naming.value } });
        setNaming(null);
        await loadAlbums();
        setOpen(r.id);
      }
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteAlbum = async (id: string) => {
    const a = albums?.find(x => x.id === id);
    if (!confirm(`Delete “${albumName(id)}” and its ${a?.count || 0} pictures from this PC? This can’t be undone.`)) return;
    await api('/api/pictures', { method: 'POST', json: { action: 'delete', id } });
    setOpen(null);
    loadAlbums();
  };

  const lightboxPics: LightboxPicture[] = pics.map(p => ({ url: p.url, thumb: p.thumb, name: p.name }));

  const usePicture = async (p: LightboxPicture, as: 'avatar' | 'banner' | 'reel' | 'post') => {
    try {
      const url = await copyToThumbnails(p.url, `${as}_${p.name}`);
      if (as === 'avatar') await onUpdateProfile({ avatar: url });
      if (as === 'banner') await onUpdateProfile({ banner: url });
      if (as === 'reel') await onUpdateProfile({ pictureReel: [...(profile?.pictureReel || []), url].slice(-24) });
      if (as === 'post') {
        const caption = prompt('Say something about it (optional)') ?? null;
        if (caption === null) return;
        await api('/api/p2p/feed', { method: 'POST', json: { action: 'post', type: 'image', text: caption, image: decodeURIComponent(url.split('/').pop() || '') } });
        p2p.refreshFeed();
      }
      flash(as === 'avatar' ? 'Profile picture updated' : as === 'banner' ? 'Banner updated' : as === 'reel' ? 'Added to your picture reel' : 'Posted to your feed');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const movePicture = async (p: LightboxPicture) => {
    const others = (albums || []).filter(a => a.id !== open && a.id !== LOOSE);
    if (!others.length) return alert('Make another album first.');
    const to = prompt(`Move to which album?\n${others.map((a, i) => `${i + 1}. ${a.name}`).join('\n')}\n\nType the number:`);
    const a = others[Number(to) - 1];
    if (!a || !open) return;
    await api('/api/pictures', { method: 'POST', json: { action: 'move', album: open, name: p.name, to: a.id } });
    loadPics(open);
    loadAlbums();
  };

  const deletePicture = async (p: LightboxPicture) => {
    if (!open || !confirm(`Delete ${p.name} from this PC?`)) return;
    await api('/api/pictures', { method: 'POST', json: { action: 'deletePicture', album: open, name: p.name } });
    loadPics(open);
    loadAlbums();
  };

  return (
    <div
      className="space-y-6"
      onDragOver={e => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={e => e.currentTarget === e.target && setDrag(false)}
      onDrop={e => {
        e.preventDefault();
        setDrag(false);
        uploadMany([...e.dataTransfer.files], open || LOOSE);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          uploadMany([...(e.target.files || [])], open || LOOSE);
          e.target.value = '';
        }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {open ? (
            <button onClick={() => setOpen(null)} className="text-sm text-[#649fae] hover:text-white flex items-center gap-1 mb-1">
              <ChevronLeft className="w-4 h-4" /> All albums
            </button>
          ) : null}
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Images className="w-6 h-6 text-[#ff7ad9]" /> {open ? albumName(open) : 'Pictures'}
          </h1>
          <p className="text-sm text-[#649fae]">
            {open
              ? `${pics.length} picture${pics.length === 1 ? '' : 's'} · click one to view, or drop more pictures anywhere on this page`
              : 'Your photo albums. Each album is a folder in content\\pictures, so you can also just drop folders in there.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <>
              {pics.length > 0 && (
                <Btn onClick={() => setView(0)}>
                  <Play className="w-4 h-4" /> Slideshow
                </Btn>
              )}
              <Btn onClick={() => p2p.setDialog({ type: 'share', rid: `album:${open}`, name: albumName(open) })}>
                <Share2 className="w-4 h-4" /> Share
              </Btn>
              <Btn variant="primary" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4" /> Add pictures
              </Btn>
              <Menu
                items={[
                  open !== LOOSE ? { label: 'Rename album…', onClick: () => setNaming({ mode: 'rename', value: albumName(open) }) } : null,
                  { label: 'Delete album…', danger: true, onClick: () => deleteAlbum(open) }
                ]}
              />
            </>
          ) : (
            <>
              <Btn onClick={() => setNaming({ mode: 'create', value: '' })}>
                <FolderPlus className="w-4 h-4" /> New album
              </Btn>
              <Btn variant="primary" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4" /> Add pictures
              </Btn>
            </>
          )}
        </div>
      </div>

      {(uploads.length > 0 || note) && (
        <div className="rounded-xl border border-white/10 bg-[#0b1216] p-3 space-y-1.5">
          {note && (
            <div className="text-sm text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4" /> {note}
            </div>
          )}
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-48 truncate text-zinc-300">{u.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full ${u.err ? 'bg-rose-500' : 'bg-[#ff7ad9]'}`} style={{ width: `${Math.round(u.p * 100)}%` }} />
              </div>
              {u.err && <span className="text-rose-400 truncate max-w-[12rem]">{u.err}</span>}
            </div>
          ))}
        </div>
      )}

      {drag && (
        <div className="fixed inset-0 z-[50] pointer-events-none flex items-center justify-center bg-[#ff7ad9]/10 border-4 border-dashed border-[#ff7ad9]/60">
          <div className="px-6 py-4 rounded-2xl bg-black/80 text-white font-bold text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" /> Drop to add to {open ? `“${albumName(open)}”` : 'Loose pictures'}
          </div>
        </div>
      )}

      {/* Albums */}
      {!open &&
        (albums === null ? (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading albums…
          </div>
        ) : albums.length === 0 ? (
          <Empty icon={<Images className="w-10 h-10" />} title="No pictures yet">
            Make an album and drop some pictures in, or put folders of photos into <span className="font-mono">content\pictures</span>.
          </Empty>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            {albums.map(a => {
              const sharedWith = (p2p.state?.friends || []).filter(f => f.grants[`album:${a.id}`] || f.grants['album:*']).length;
              return (
                <AlbumCard
                  key={a.id}
                  title={a.name}
                  count={a.count}
                  covers={a.covers}
                  onOpen={() => setOpen(a.id)}
                  sub={sharedWith ? <span className="text-[#ff7ad9]">· shared with {sharedWith}</span> : null}
                  menu={
                    <Menu
                      items={[
                        { label: 'Open', onClick: () => setOpen(a.id) },
                        { label: 'Share with friends…', onClick: () => p2p.setDialog({ type: 'share', rid: `album:${a.id}`, name: a.name }) },
                        { label: 'Delete album…', danger: true, onClick: () => deleteAlbum(a.id) }
                      ]}
                    />
                  }
                />
              );
            })}
          </div>
        ))}

      {/* One album */}
      {open &&
        (pics.length === 0 ? (
          <button onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-white/10 hover:border-[#ff7ad9]/60 py-16 text-center text-zinc-400">
            <Upload className="w-8 h-8 mx-auto mb-2" />
            This album is empty. Click to add pictures, or drag them here.
          </button>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 [&>*]:mb-3">
            {pics.map((p, i) => (
              <button key={p.name} onClick={() => setView(i)} className="block w-full break-inside-avoid rounded-xl overflow-hidden border border-white/5 hover:border-white/40 transition-colors bg-[#0b1216]">
                <img src={p.thumb} alt={p.name} loading="lazy" className="w-full h-auto block" />
              </button>
            ))}
          </div>
        ))}

      {view !== null && open && (
        <Lightbox
          pictures={lightboxPics}
          start={view}
          title={albumName(open)}
          onClose={() => setView(null)}
          actions={p => (
            <div className="hidden sm:flex items-center gap-1">
              <button onClick={() => usePicture(p, 'avatar')} className="p-2 rounded-lg hover:bg-white/10" title="Use as profile picture">
                <UserCircle2 className="w-5 h-5" />
              </button>
              <button onClick={() => usePicture(p, 'banner')} className="p-2 rounded-lg hover:bg-white/10" title="Use as profile banner">
                <PanelTop className="w-5 h-5" />
              </button>
              <button onClick={() => usePicture(p, 'reel')} className="p-2 rounded-lg hover:bg-white/10" title="Add to my picture reel">
                <GalleryHorizontal className="w-5 h-5" />
              </button>
              <button onClick={() => usePicture(p, 'post')} className="p-2 rounded-lg hover:bg-white/10" title="Post to my feed">
                <Send className="w-5 h-5" />
              </button>
              <button onClick={() => movePicture(p)} className="p-2 rounded-lg hover:bg-white/10" title="Move to another album">
                <FolderInput className="w-5 h-5" />
              </button>
              <button onClick={() => deletePicture(p)} className="p-2 rounded-lg hover:bg-white/10 hover:text-rose-400" title="Delete">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}
        />
      )}

      <Modal
        open={!!naming}
        onClose={() => setNaming(null)}
        title={naming?.mode === 'create' ? 'New album' : 'Rename album'}
        footer={
          <>
            <Btn onClick={() => setNaming(null)}>Cancel</Btn>
            <Btn variant="primary" onClick={saveName} disabled={!naming?.value.trim()}>
              {naming?.mode === 'create' ? <FolderPlus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />} {naming?.mode === 'create' ? 'Create' : 'Rename'}
            </Btn>
          </>
        }
      >
        <Field label="Album name" hint="It becomes a folder in content\pictures.">
          <input
            className={inputCls}
            autoFocus
            value={naming?.value || ''}
            onChange={e => setNaming(n => (n ? { ...n, value: e.target.value } : n))}
            onKeyDown={e => e.key === 'Enter' && saveName()}
            maxLength={80}
            placeholder="Summer 2026"
          />
        </Field>
      </Modal>
    </div>
  );
};
