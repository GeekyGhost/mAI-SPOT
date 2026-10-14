'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Music2, Film, BookOpen, Gamepad2, ImageOff, Pencil } from 'lucide-react';
import type { Track, Video, Channel, Book, Game } from '@/lib/types';
import { fmtTime } from '@/lib/client';
import { Art, Chip } from '@/components/ui/kit';
import { TrackEditor } from '@/components/radio/RadioTab';
import { VideoEditor } from '@/components/cinema/CinemaTab';
import { BookEditor } from '@/components/library/LibraryTab';
import { AppEditor } from '@/components/arcade/ArcadeTab';

export type ManagerTab = 'music' | 'videos' | 'books' | 'games';

const DEFAULT_ART = ['/api/media/thumbnails/avatar_user.svg', '/api/media/thumbnails/thumb_glitch.svg'];
const missing = (u?: string) => !u || DEFAULT_ART.includes(u);

interface Item {
  id: string;
  title: string;
  subtitle: string;
  art?: string;
  aspect: string;
  missingArt: boolean;
  search: string;
}

/** One place to edit titles, tags and artwork for everything on the Spot. */
export const LibraryManager: React.FC<{
  open: ManagerTab | null;
  onClose: () => void;
  tracks: Track[];
  videos: Video[];
  channels: Channel[];
  videoGenres: string[];
  books: Book[];
  games: Game[];
  onRefresh: () => void;
}> = ({ open, onClose, tracks, videos, channels, videoGenres, books, games, onRefresh }) => {
  const [tab, setTab] = useState<ManagerTab>('music');
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<{ tab: ManagerTab; id: string } | null>(null);

  useEffect(() => {
    if (open) setTab(open);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !editing && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, editing, onClose]);

  const lists = useMemo<Record<ManagerTab, Item[]>>(
    () => ({
      music: tracks.map(t => ({
        id: t.id,
        title: t.title,
        subtitle: `${t.artist}${t.album ? ` — ${t.album}` : ''} · ${t.genre} · ${fmtTime(t.duration)}`,
        art: t.coverArt,
        aspect: 'aspect-square',
        missingArt: missing(t.coverArt),
        search: `${t.title} ${t.artist} ${t.album || ''} ${t.genre}`.toLowerCase()
      })),
      videos: videos.map(v => ({
        id: v.id,
        title: v.title,
        subtitle: `${v.channelName} · ${v.genre} · ${v.posterMode === 'custom' ? 'custom poster' : v.thumbnail ? 'frame poster' : 'no poster'}`,
        art: v.thumbnail,
        aspect: 'aspect-video',
        missingArt: missing(v.thumbnail),
        search: `${v.title} ${v.channelName} ${v.genre} ${v.description}`.toLowerCase()
      })),
      books: books.map(b => ({
        id: b.id,
        title: b.series && b.issue ? `${b.series} #${b.issue}` : b.title,
        subtitle: `${b.kind === 'comic' ? 'Comic' : 'Book'} · ${b.format.toUpperCase()}${b.author ? ` · ${b.author}` : ''}`,
        art: b.cover,
        aspect: 'aspect-[2/3]',
        missingArt: missing(b.cover),
        search: `${b.title} ${b.author} ${b.series || ''} ${b.genre}`.toLowerCase()
      })),
      games: games.map(g => ({
        id: g.id,
        title: g.title,
        subtitle: `${(g.kind || 'game') === 'app' ? `App · ${g.category || 'Uncategorized'}` : `Game · ${g.genre}`}`,
        art: g.thumbnail,
        aspect: 'aspect-[4/3]',
        missingArt: missing(g.thumbnail),
        search: `${g.title} ${g.genre} ${g.category || ''} ${g.description}`.toLowerCase()
      }))
    }),
    [tracks, videos, books, games]
  );

  if (!open || typeof document === 'undefined') return null;

  const query = q.trim().toLowerCase();
  const items = lists[tab].filter(i => (!onlyMissing || i.missingArt) && (!query || i.search.includes(query)));
  const tabs: [ManagerTab, string, React.ComponentType<{ className?: string }>][] = [
    ['music', 'Music', Music2],
    ['videos', 'Videos', Film],
    ['books', 'Books & Comics', BookOpen],
    ['games', 'Games & Apps', Gamepad2]
  ];
  const close = () => {
    setEditing(null);
    onRefresh();
  };
  const cols = tab === 'videos' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : tab === 'books' ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

  return createPortal(
    <div className="fixed inset-0 z-[55] bg-[#030608]/95 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Pencil className="w-6 h-6 text-[var(--spot-accent)]" /> Library Manager
            </h1>
            <p className="text-sm text-[#649fae]">Edit titles, tags and artwork for everything on your Spot. Click anything to edit it.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" title="Close (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <div className="flex gap-1 bg-black/40 rounded-xl p-1 border border-white/10 overflow-x-auto">
            {tabs.map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)} className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${tab === id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
                <Icon className="w-4 h-4" /> {label}
                <span className={tab === id ? 'text-black/50' : 'text-zinc-600'}>{lists[id].length}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Chip active={onlyMissing} onClick={() => setOnlyMissing(v => !v)} count={lists[tab].filter(i => i.missingArt).length}>
              <span className="inline-flex items-center gap-1">
                <ImageOff className="w-3.5 h-3.5" /> Missing artwork
              </span>
            </Chip>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="w-56 bg-black/40 border border-[#1f3a45] rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-[var(--spot-accent)]" />
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-500 mt-10 text-center">{onlyMissing ? 'Everything here has artwork. 🎉' : 'Nothing here yet.'}</p>
        ) : (
          <div className={`grid ${cols} gap-4 mt-5`}>
            {items.map(i => (
              <button key={i.id} onClick={() => setEditing({ tab, id: i.id })} className="group text-left">
                <Art src={i.missingArt ? undefined : i.art} title={i.title} className={`${i.aspect} rounded-xl border border-white/10 group-hover:border-[var(--spot-accent)] transition-colors`}>
                  {i.missingArt && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold text-amber-300">NO ART</span>}
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                    <span className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg bg-white text-black text-xs font-bold flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Edit
                    </span>
                  </span>
                </Art>
                <div className="text-sm font-bold text-white truncate mt-1.5">{i.title}</div>
                <div className="text-[11px] text-zinc-500 truncate">{i.subtitle}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {editing?.tab === 'music' && (() => {
        const t = tracks.find(x => x.id === editing.id);
        return t ? <TrackEditor track={t} genres={[...new Set(tracks.map(x => x.genre))]} onClose={() => setEditing(null)} onSaved={close} /> : null;
      })()}
      {editing?.tab === 'videos' && (() => {
        const v = videos.find(x => x.id === editing.id);
        return v ? <VideoEditor video={v} channels={channels} genres={[...new Set([...videoGenres, ...videos.map(x => x.genre)])]} onClose={() => setEditing(null)} onSaved={close} /> : null;
      })()}
      {editing?.tab === 'books' && (() => {
        const b = books.find(x => x.id === editing.id);
        return b ? <BookEditor book={b} onClose={() => setEditing(null)} onSaved={close} /> : null;
      })()}
      {editing?.tab === 'games' && (() => {
        const g = games.find(x => x.id === editing.id);
        return g ? <AppEditor app={g} onClose={() => setEditing(null)} onSaved={close} /> : null;
      })()}
    </div>,
    document.body
  );
};
