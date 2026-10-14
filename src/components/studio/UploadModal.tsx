'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Music, Film, Gamepad2, BookOpen, UploadCloud, Check, AlertTriangle, Loader2, X } from 'lucide-react';
import type { Channel, Playlist, Collection } from '@/lib/types';
import { GAME_GENRES, APP_CATEGORIES, BOOK_GENRES } from '@/lib/types';
import { uploadFile, UploadKind } from '@/lib/client';
import { Modal, Field, inputCls, Btn, ImagePicker } from '@/components/ui/kit';

export type UploadTab = 'audio' | 'video' | 'app' | 'book';

const ACCEPT: Record<UploadTab, string> = {
  audio: '.mp3,.wav,.flac,.ogg,.oga,.opus,.m4a,.aac,.webm',
  video: '.mp4,.webm,.m4v,.mov,.mkv,.ogv',
  app: '.zip,.html,.htm',
  book: '.epub,.pdf,.cbz,.cbr,.txt,.md'
};

const tabFor = (name: string): UploadTab | null => {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return (Object.keys(ACCEPT) as UploadTab[]).find(k => ACCEPT[k].split(',').includes(ext)) || null;
};

interface Item {
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: UploadTab;
  channels: Channel[];
  playlists?: Playlist[];
  collections?: Collection[];
  videoGenres?: string[];
  musicGenres?: string[];
  onUploadSuccess: () => void;
}

export const UploadModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialTab = 'audio',
  channels,
  playlists = [],
  collections = [],
  videoGenres = [],
  musicGenres = [],
  onUploadSuccess
}) => {
  const [tab, setTab] = useState<UploadTab>(initialTab);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [meta, setMeta] = useState<Record<string, any>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setItems([]);
      setMeta({});
    }
  }, [isOpen, initialTab]);

  const set = (k: string, v: unknown) => setMeta(m => ({ ...m, [k]: v }));

  const addFiles = (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    // Dropping files of another type switches to the matching tab.
    const t = tabFor(list[0].name);
    if (t && t !== tab && items.length === 0) setTab(t);
    const target = t && items.length === 0 ? t : tab;
    const ok = list.filter(f => tabFor(f.name) === target);
    const rejected = list.length - ok.length;
    setItems(prev => [...prev, ...ok.map(file => ({ file, progress: 0, status: 'queued' as const }))]);
    if (rejected) alert(`${rejected} file(s) skipped — they don't belong in ${target === 'app' ? 'Games & Apps' : target === 'book' ? 'Books & Comics' : target}.`);
  };

  const start = async () => {
    setBusy(true);
    let any = false;
    const kind: UploadKind = tab;
    // Shared fields; empty ones are left to the file's own tags.
    const base: Record<string, unknown> = { ...meta };
    if (tab === 'video' && items.length > 1) delete base.title;
    if ((tab === 'audio' || tab === 'book') && items.length > 1) delete base.title;
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'done') continue;
      setItems(prev => prev.map((it, k) => (k === i ? { ...it, status: 'uploading', progress: 0 } : it)));
      try {
        await uploadFile(kind, items[i].file, items[i].file.name, base, p =>
          setItems(prev => prev.map((it, k) => (k === i ? { ...it, progress: p } : it)))
        );
        any = true;
        setItems(prev => prev.map((it, k) => (k === i ? { ...it, status: 'done', progress: 1 } : it)));
      } catch (e) {
        setItems(prev => prev.map((it, k) => (k === i ? { ...it, status: 'error', error: (e as Error).message } : it)));
      }
    }
    setBusy(false);
    if (any) onUploadSuccess();
  };

  const allDone = items.length > 0 && items.every(i => i.status === 'done');
  const single = items.length <= 1;

  const tabs: [UploadTab, string, React.ComponentType<{ className?: string }>][] = [
    ['audio', 'Music', Music],
    ['video', 'Video', Film],
    ['app', 'Game / App', Gamepad2],
    ['book', 'Book / Comic', BookOpen]
  ];

  return (
    <Modal
      open={isOpen}
      onClose={() => !busy && onClose()}
      title="Add to your Spot"
      wide
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>
            {allDone ? 'Close' : 'Cancel'}
          </Btn>
          {!allDone && (
            <Btn variant="primary" onClick={start} disabled={busy || !items.length}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Upload {items.length > 1 ? `${items.length} files` : ''}
            </Btn>
          )}
        </>
      }
    >
      <div className="flex gap-1 bg-black/40 rounded-xl p-1 border border-white/10">
        {tabs.map(([k, label, Icon]) => (
          <button
            key={k}
            disabled={busy || items.length > 0}
            onClick={() => {
              setTab(k);
              setMeta({});
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs sm:text-sm font-bold disabled:cursor-not-allowed ${tab === k ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div
        onDragOver={e => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${drag ? 'border-[var(--spot-accent)] bg-accent/10' : 'border-white/15 hover:border-white/30'}`}
      >
        <UploadCloud className="w-8 h-8 mx-auto text-[var(--spot-accent)] mb-2" />
        <p className="text-sm text-white font-bold">Drop files here or click to choose</p>
        <p className="text-xs text-zinc-500 mt-1">
          {tab === 'audio' && 'MP3, WAV, FLAC, OGG, Opus, M4A. Titles, artists, albums, cover art and lengths come from the files.'}
          {tab === 'video' && 'MP4 and WebM play everywhere. MKV/MOV depend on the codecs. No size limit; big files stream straight to disk.'}
          {tab === 'app' && 'A .zip with an index.html inside (Phaser, Godot web, PICO-8, Construct, plain Canvas/WASM), or a single .html file.'}
          {tab === 'book' && 'EPUB, PDF, TXT and Markdown (great for poems), CBZ and CBR comics.'}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple={tab !== 'app'}
          accept={ACCEPT[tab]}
          className="hidden"
          onChange={e => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-3 bg-black/30 rounded-lg px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white truncate">{it.file.name}</div>
                <div className="h-1 mt-1 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full ${it.status === 'error' ? 'bg-[#ff3c3c]' : 'bg-[var(--spot-accent)]'}`} style={{ width: `${Math.round(it.progress * 100)}%` }} />
                </div>
                {it.error && <div className="text-[11px] text-[#ff6b6b] mt-0.5">{it.error}</div>}
              </div>
              <span className="text-[11px] font-mono text-zinc-500 w-16 text-right">{(it.file.size / 1024 / 1024).toFixed(1)} MB</span>
              {it.status === 'done' ? (
                <Check className="w-4 h-4 text-[#39ff88]" />
              ) : it.status === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-[#ff3c3c]" />
              ) : it.status === 'uploading' ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--spot-accent)]" />
              ) : (
                <button onClick={() => setItems(prev => prev.filter((_, k) => k !== i))} className="text-zinc-500 hover:text-white" disabled={busy}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Details (all optional). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tab === 'audio' && (
          <>
            {single && (
              <Field label="Title" hint="Blank = use the file's tag">
                <input className={inputCls} value={meta.title || ''} onChange={e => set('title', e.target.value)} />
              </Field>
            )}
            <Field label="Artist" hint="Blank = use the file's tag">
              <input className={inputCls} value={meta.artist || ''} onChange={e => set('artist', e.target.value)} />
            </Field>
            <Field label="Album">
              <input className={inputCls} value={meta.album || ''} onChange={e => set('album', e.target.value)} />
            </Field>
            <Field label="Genre">
              <input className={inputCls} list="up-music-genres" value={meta.genre || ''} onChange={e => set('genre', e.target.value)} />
              <datalist id="up-music-genres">{musicGenres.map(g => <option key={g} value={g} />)}</datalist>
            </Field>
            {playlists.length > 0 && (
              <Field label="Also add to playlist">
                <select className={inputCls} value={meta.playlistId || ''} onChange={e => set('playlistId', e.target.value)}>
                  <option value="">—</option>
                  {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            )}
          </>
        )}
        {tab === 'video' && (
          <>
            {single && (
              <Field label="Title" hint="Blank = from the file name">
                <input className={inputCls} value={meta.title || ''} onChange={e => set('title', e.target.value)} />
              </Field>
            )}
            <Field label="Genre">
              <input className={inputCls} list="up-video-genres" value={meta.genre || ''} onChange={e => set('genre', e.target.value)} placeholder="Movies, Series, Anime…" />
              <datalist id="up-video-genres">{videoGenres.map(g => <option key={g} value={g} />)}</datalist>
            </Field>
            <Field label="Channel">
              <select className={inputCls} value={meta.channelId || 'chan_my_station'} onChange={e => set('channelId', e.target.value)}>
                {channels.map(c => <option key={c.id} value={c.id}>{c.channelName}</option>)}
              </select>
            </Field>
            <Field label="Year">
              <input className={inputCls} type="number" value={meta.year || ''} onChange={e => set('year', e.target.value ? Number(e.target.value) : undefined)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea className={inputCls} rows={2} value={meta.description || ''} onChange={e => set('description', e.target.value)} />
              </Field>
            </div>
            {collections.length > 0 && (
              <div className="sm:col-span-2">
                <Field label="Add to collections">
                  <div className="flex flex-wrap gap-2">
                    {collections.map(c => {
                      const on = (meta.collectionIds || []).includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => set('collectionIds', on ? meta.collectionIds.filter((x: string) => x !== c.id) : [...(meta.collectionIds || []), c.id])}
                          className={`px-3 py-1 rounded-full text-xs border ${on ? 'bg-[var(--spot-accent)] text-black border-transparent' : 'border-white/15 text-zinc-300'}`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}
            <p className="sm:col-span-2 text-xs text-zinc-500">A poster is grabbed from the video automatically. You can change it later.</p>
          </>
        )}
        {tab === 'app' && (
          <>
            <Field label="Title">
              <input className={inputCls} value={meta.title || ''} onChange={e => set('title', e.target.value)} placeholder="From app.json or the file name" />
            </Field>
            <Field label="Type">
              <select className={inputCls} value={meta.kind || 'game'} onChange={e => set('kind', e.target.value)}>
                <option value="game">Game</option>
                <option value="app">App</option>
              </select>
            </Field>
            {(meta.kind || 'game') === 'game' ? (
              <Field label="Genre">
                <input className={inputCls} list="up-game-genres" value={meta.genre || ''} onChange={e => set('genre', e.target.value)} />
                <datalist id="up-game-genres">{GAME_GENRES.map(g => <option key={g} value={g} />)}</datalist>
              </Field>
            ) : (
              <Field label="Category">
                <input className={inputCls} list="up-app-cats" value={meta.category || ''} onChange={e => set('category', e.target.value)} />
                <datalist id="up-app-cats">{APP_CATEGORIES.map(g => <option key={g} value={g} />)}</datalist>
              </Field>
            )}
            <Field label="Controls / how to use">
              <input className={inputCls} value={meta.controlsHelp || ''} onChange={e => set('controlsHelp', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea className={inputCls} rows={2} value={meta.description || ''} onChange={e => set('description', e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <ImagePicker value={meta.thumbnail} onChange={url => set('thumbnail', url)} label="Thumbnail (optional)" aspect="aspect-[4/3]" />
            </div>
          </>
        )}
        {tab === 'book' && (
          <>
            {single && (
              <Field label="Title" hint="Blank = read from the file">
                <input className={inputCls} value={meta.title || ''} onChange={e => set('title', e.target.value)} />
              </Field>
            )}
            <Field label="Author">
              <input className={inputCls} value={meta.author || ''} onChange={e => set('author', e.target.value)} />
            </Field>
            <Field label="Shelf">
              <select className={inputCls} value={meta.kind || ''} onChange={e => set('kind', e.target.value || undefined)}>
                <option value="">Automatic (CBZ/CBR → Comics)</option>
                <option value="ebook">Books</option>
                <option value="comic">Comics</option>
              </select>
            </Field>
            <Field label="Genre">
              <input className={inputCls} list="up-book-genres" value={meta.genre || ''} onChange={e => set('genre', e.target.value)} />
              <datalist id="up-book-genres">{BOOK_GENRES.map(g => <option key={g} value={g} />)}</datalist>
            </Field>
            <Field label="Series">
              <input className={inputCls} value={meta.series || ''} onChange={e => set('series', e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
};
