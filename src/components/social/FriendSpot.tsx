'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, MessageSquare, Phone, Video as VideoIcon, Headphones, Play, Shuffle, Music2, Film, Image as ImageIcon, Newspaper, Loader2,
  WifiOff, Gamepad2, BookOpen, Radio, Clock, Lock, ShieldCheck, RefreshCw
} from 'lucide-react';
import type { Video, Book, Game } from '@/lib/types';
import { timeAgo, untilLabel } from '@/lib/p2pTypes';
import { api, fmtTime, fmtDuration, safeLocal } from '@/lib/client';
import { useP2P } from './P2PProvider';
import { PostCard } from './FeedTab';
import { Avatar } from './Avatar';
import { useAudio, NowTrack } from '@/components/audio/AudioEngine';
import { CinemaPlayer } from '@/components/cinema/CinemaPlayer';
import { AppRunner } from '@/components/arcade/ArcadeTab';
import { Reader, peerProgressKey } from '@/components/library/Reader';
import { Lightbox, type LightboxPicture } from '@/components/gallery/Lightbox';
import { AlbumCard, Until } from '@/components/gallery/AlbumCard';
import { Art, Btn, Empty } from '@/components/ui/kit';

type PeerTrack = NowTrack & { album?: string; genre?: string };
interface PeerCatalog {
  profile: { bio: string; mood: string; pictures: string[] };
  stations: { id: string; name: string; tagline: string; cover: string; live: boolean; trackIds: string[]; until?: number }[];
  playlists: { id: string; name: string; description?: string; cover: string; trackIds: string[]; until?: number }[];
  tracks: PeerTrack[];
  channels: { id: string; name: string; description: string; avatar: string; banner: string; videoIds: string[]; until?: number }[];
  collections: { id: string; name: string; description: string; cover: string; videoIds: string[]; until?: number }[];
  videos: (Video & { thumbnail: string })[];
  albums: { id: string; name: string; until?: number; pictures: { name: string; url: string; thumb: string }[] }[];
  apps: (Game & { runUrl: string; until?: number })[];
  books: (Book & { base: string; until?: number })[];
}

type Tab = 'posts' | 'radio' | 'videos' | 'pictures' | 'games' | 'books';

const Row: React.FC<{ title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

/** A friend's Spot, browsed live from their node. Only what they've shared with you shows up. */
export const FriendSpot: React.FC = () => {
  const p2p = useP2P();
  const audio = useAudio();
  const key = p2p.visit;
  const f = p2p.state?.friends.find(x => x.key === key);
  const [tab, setTab] = useState<Tab>('posts');
  const [cat, setCat] = useState<PeerCatalog | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [watch, setWatch] = useState<{ queue: Video[]; i: number } | null>(null);
  const [album, setAlbum] = useState<{ title: string; pics: LightboxPicture[]; i: number } | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [book, setBook] = useState<(Book & { base: string }) | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setTab('posts');
    setCat(null);
    setErr('');
  }, [key]);

  // Load (and reload when they change what we can see).
  const accessSig = f ? `${f.theirAccess}|${f.online}` : '';
  useEffect(() => {
    if (!key || !f?.online) return;
    setLoading(true);
    setErr('');
    api(`/api/p2p/peer/${key}/catalog`)
      .then(d => setCat(d))
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [key, f?.online, accessSig, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!key) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !watch && !album && !game && !book && p2p.setVisit(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, watch, album, game, book, p2p]);

  const trackById = useMemo(() => new Map((cat?.tracks || []).map(t => [t.id, t])), [cat]);
  const videoById = useMemo(() => new Map((cat?.videos || []).map(v => [v.id, v])), [cat]);
  const pick = (ids: string[]) => ids.map(id => trackById.get(id)).filter((t): t is PeerTrack => !!t);
  const pickV = (ids: string[]) => ids.map(id => videoById.get(id)).filter((v): v is Video & { thumbnail: string } => !!v);

  if (!key || typeof document === 'undefined') return null;
  if (!f) {
    return createPortal(
      <div className="fixed inset-0 z-[65] bg-black/80 flex items-center justify-center" onClick={() => p2p.setVisit(null)}>
        <p className="text-zinc-400">That Spot isn’t in your friends list.</p>
      </div>,
      document.body
    );
  }

  const posts = p2p.feed.filter(p => p.author === key);
  const reel = f.pictures.map((u, i) => ({ url: u, name: `Picture ${i + 1}` }));
  const has = {
    radio: !!(cat && (cat.stations.length || cat.playlists.length)),
    videos: !!(cat && cat.videos.length),
    pictures: !!(cat && cat.albums.length) || reel.length > 0,
    games: !!(cat && cat.apps.length),
    books: !!(cat && cat.books.length)
  };
  const tabs: [Tab, string, React.ComponentType<{ className?: string }>, boolean][] = [
    ['posts', 'Posts', Newspaper, true],
    ['radio', 'Radio', Radio, has.radio],
    ['videos', 'Videos', Film, has.videos],
    ['pictures', 'Pictures', ImageIcon, has.pictures],
    ['games', 'Games & apps', Gamepad2, has.games],
    ['books', 'Books', BookOpen, has.books]
  ];
  const label = `${f.name}’s Spot`;
  const tunedLive = audio.mode === 'live' && audio.liveUrl === `/api/p2p/peer/${key}/live`;
  const along = p2p.alongWith === key;
  const accent = f.accent || 'var(--spot-accent)';
  const nothingShared = !!cat && !has.radio && !has.videos && !has.pictures && !has.games && !has.books;

  return createPortal(
    <div className="fixed inset-0 z-[44] bg-[#030608]/[0.97] backdrop-blur overflow-y-auto animate-fadeIn">
      {/* Banner */}
      <div className="relative h-40 sm:h-56 spot-grain" style={{ background: f.banner ? `center/cover no-repeat url("${f.banner}")` : `linear-gradient(120deg, color-mix(in srgb, ${accent} 33%, transparent), #ff2e6e33 55%, #030608)` }}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#030608]" />
        <button onClick={() => p2p.setVisit(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white" title="Close (Esc)">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-40 -mt-16 relative">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <div className="rounded-2xl p-1 bg-[#030608]" style={{ boxShadow: `0 0 0 2px ${accent}` }}>
            <Avatar src={f.avatar} name={f.name} online={f.online} status={f.status} size="w-28 h-28" />
          </div>
          <div className="flex-1 min-w-0 sm:pt-16">
            <h1 className="text-3xl sm:text-4xl font-bold text-white">{f.name}</h1>
            <p className="text-sm text-zinc-500 font-mono">
              {f.handle}#{f.key.slice(0, 4)}
              {f.nickname && f.realName !== f.name ? ` · calls themselves “${f.realName}”` : ''}
            </p>
            <p className="text-sm mt-1">
              {f.online ? (
                <span className={f.status === 'away' ? 'text-amber-400' : f.status === 'dnd' ? 'text-rose-400' : 'text-emerald-400'}>
                  ● {f.status === 'dnd' ? 'Do not disturb' : f.status === 'away' ? 'Away' : 'Online'}
                </span>
              ) : (
                <span className="text-zinc-500">● Offline · last seen {timeAgo(f.lastSeen)}</span>
              )}
            </p>
            {f.mood && <p className="text-zinc-200 mt-2 italic">“{f.mood}”</p>}
            {f.bio && <p className="text-sm text-zinc-400 mt-2 max-w-2xl whitespace-pre-line">{f.bio}</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              <Btn variant="primary" onClick={() => p2p.openChat(f.key)}>
                <MessageSquare className="w-4 h-4" /> Message
              </Btn>
              <Btn disabled={!f.online} onClick={() => p2p.startCall(f.key, false)}>
                <Phone className="w-4 h-4" /> Call
              </Btn>
              <Btn disabled={!f.online} onClick={() => p2p.startCall(f.key, true)}>
                <VideoIcon className="w-4 h-4" /> Video call
              </Btn>
              <Btn onClick={() => p2p.setDialog({ type: 'access', key: f.key })} title="What they can see of your Spot">
                <ShieldCheck className="w-4 h-4" /> What they see
              </Btn>
            </div>
          </div>
        </div>

        {/* Live + now playing */}
        {(f.live || f.nowPlaying) && (
          <div className="grid sm:grid-cols-2 gap-3 mt-6">
            {f.live && (
              <div className="rounded-2xl border border-[#ff2e6e]/50 bg-gradient-to-r from-[#ff2e6e]/15 to-transparent p-4 flex items-center gap-3">
                <Art src={f.live.coverUrl} title={f.live.station} className="w-14 h-14 rounded-xl shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black tracking-widest text-[#ff2e6e]">● ON AIR</div>
                  <div className="text-white font-bold truncate">{f.live.station}</div>
                  <div className="text-xs text-zinc-300 truncate">{f.live.track}</div>
                </div>
                <Btn variant={tunedLive ? undefined : 'primary'} onClick={() => (tunedLive ? audio.leaveLive() : audio.tuneInLive(`/api/p2p/peer/${key}/live`))}>
                  <Headphones className="w-4 h-4" /> {tunedLive ? 'Stop' : 'Tune in'}
                </Btn>
              </div>
            )}
            {f.nowPlaying && (
              <div className="rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-400/10 to-transparent p-4 flex items-center gap-3">
                <Art src={f.nowPlaying.coverUrl} title={f.nowPlaying.title} className="w-14 h-14 rounded-xl shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black tracking-widest text-emerald-300 flex items-center gap-1.5">
                    {f.nowPlaying.playing ? (
                      <span className="eq-bars h-2.5 inline-flex items-end"><span /><span /><span /></span>
                    ) : null}
                    {f.nowPlaying.playing ? 'LISTENING NOW' : 'PAUSED'}
                  </div>
                  <div className="text-white font-bold truncate">{f.nowPlaying.title}</div>
                  <div className="text-xs text-zinc-300 truncate">{f.nowPlaying.artist}</div>
                </div>
                <Btn variant={along ? undefined : 'primary'} onClick={() => p2p.listenAlong(along ? null : f.key)}>
                  <Headphones className="w-4 h-4" /> {along ? 'Stop' : 'Listen along'}
                </Btn>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-7 border-b border-white/10 overflow-x-auto no-scrollbar">
          {tabs
            .filter(t => t[3])
            .map(([id, text, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px ${tab === id ? 'text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}
                style={tab === id ? { borderColor: accent } : undefined}
              >
                <Icon className="w-4 h-4" /> {text}
              </button>
            ))}
          {f.online && (
            <button onClick={() => setReload(r => r + 1)} className="ml-auto p-2 text-zinc-500 hover:text-white" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        <div className="mt-6 space-y-10">
          {tab === 'posts' && (
            <>
              {nothingShared && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> {f.name} hasn’t shared any of their library with you yet.
                </div>
              )}
              {!f.online && !cat && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400 flex items-center gap-2">
                  <WifiOff className="w-4 h-4" /> Their library streams straight from their PC, so it shows up when they’re online.
                </div>
              )}
              {posts.length ? <div className="space-y-4 max-w-2xl">{posts.map(p => <PostCard key={p.id} post={p} />)}</div> : <p className="text-sm text-zinc-500">No posts yet.</p>}
            </>
          )}

          {tab !== 'posts' && !f.online && (
            <Empty icon={<WifiOff className="w-10 h-10" />} title={`${f.name} is offline`}>
              Their library streams straight from their PC, so it’s only available while their Spot is running.
            </Empty>
          )}
          {tab !== 'posts' && f.online && !cat && (err ? <p className="text-sm text-rose-400">{err}</p> : <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading their library…</div>)}

          {f.online && cat && tab === 'radio' && (
            <>
              {cat.stations.length > 0 && (
                <Row title={<><Radio className="w-5 h-5" style={{ color: accent }} /> Stations</>}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {cat.stations.map(s => {
                      const list = pick(s.trackIds);
                      return (
                        <div key={s.id} className="group">
                          <Art src={s.cover} title={s.name} className="aspect-square rounded-2xl border border-white/10">
                            {s.live && <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#ff2e6e] text-white text-[10px] font-black">● LIVE</span>}
                            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 group-hover:bg-black/50 transition-colors">
                              <button
                                onClick={() => (s.live ? audio.tuneInLive(`/api/p2p/peer/${key}/live`) : audio.playQueue([...list].sort(() => Math.random() - 0.5), 0, `${s.name} · ${label}`))}
                                disabled={!s.live && !list.length}
                                className="opacity-0 group-hover:opacity-100 w-14 h-14 rounded-full bg-white text-black flex items-center justify-center transition-opacity"
                                title={s.live ? 'Tune in live' : 'Play this station'}
                              >
                                {s.live ? <Headphones className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                              </button>
                            </div>
                          </Art>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="font-bold text-white truncate">{s.name}</span>
                            <Until until={s.until} />
                          </div>
                          <div className="text-xs text-zinc-500 truncate">{s.tagline || `${list.length} songs`}</div>
                        </div>
                      );
                    })}
                  </div>
                </Row>
              )}
              {cat.playlists.length > 0 && (
                <Row title={<><Music2 className="w-5 h-5" style={{ color: accent }} /> Playlists</>}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {cat.playlists.map(pl => {
                      const list = pick(pl.trackIds);
                      return (
                        <button key={pl.id} onClick={() => audio.playQueue(list, 0, `${pl.name} · ${label}`)} disabled={!list.length} className="text-left group">
                          <Art src={pl.cover || list[0]?.coverArt} title={pl.name} className="aspect-square rounded-2xl border border-white/10 group-hover:border-white/40" />
                          <div className="mt-2 flex items-center gap-2">
                            <span className="font-bold text-white truncate">{pl.name}</span>
                            <Until until={pl.until} />
                          </div>
                          <div className="text-xs text-zinc-500">{list.length} songs</div>
                        </button>
                      );
                    })}
                  </div>
                </Row>
              )}
              {cat.tracks.length > 0 && (
                <Row
                  title={`All songs · ${cat.tracks.length}`}
                  right={
                    <div className="flex gap-2">
                      <Btn small variant="primary" onClick={() => audio.playQueue(cat.tracks, 0, label)}>
                        <Play className="w-3.5 h-3.5 fill-current" /> Play all
                      </Btn>
                      <Btn small onClick={() => audio.playQueue([...cat.tracks].sort(() => Math.random() - 0.5), 0, label)}>
                        <Shuffle className="w-3.5 h-3.5" /> Shuffle
                      </Btn>
                    </div>
                  }
                >
                  <div className="rounded-2xl border border-[#1a323c] overflow-hidden">
                    {cat.tracks.map((t, i) => {
                      const on = audio.current?.filePath === t.filePath;
                      return (
                        <button key={t.id} onClick={() => audio.playTrack(t, cat.tracks, label)} className={`w-full flex items-center gap-3 px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5 text-left ${on ? 'bg-white/[0.06]' : ''}`}>
                          <span className="w-6 text-right text-xs font-mono text-zinc-500">{i + 1}</span>
                          <Art src={t.coverArt} title={t.title} className="w-9 h-9 rounded" />
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm truncate ${on ? 'font-bold' : 'text-white'}`} style={on ? { color: accent } : undefined}>{t.title}</div>
                            <div className="text-xs text-zinc-500 truncate">
                              {t.artist}
                              {t.album ? ` — ${t.album}` : ''}
                            </div>
                          </div>
                          <span className="hidden sm:block text-xs text-zinc-500">{t.genre}</span>
                          <span className="text-xs font-mono text-zinc-400">{fmtTime(t.duration)}</span>
                        </button>
                      );
                    })}
                  </div>
                </Row>
              )}
            </>
          )}

          {f.online && cat && tab === 'videos' && (
            <>
              {[...cat.channels.map(c => ({ ...c, kind: 'Channel', cover: c.avatar })), ...cat.collections.map(c => ({ ...c, kind: 'Collection' }))].map(group => {
                const vids = pickV(group.videoIds);
                if (!vids.length) return null;
                return (
                  <Row
                    key={`${group.kind}_${group.id}`}
                    title={
                      <>
                        <Art src={group.cover} title={group.name} className="w-8 h-8 rounded-lg" /> {group.name}
                        <span className="text-xs font-normal text-zinc-500">{group.kind}</span>
                        <Until until={group.until} />
                      </>
                    }
                    right={
                      <Btn small onClick={() => setWatch({ queue: vids, i: 0 })}>
                        <Play className="w-3.5 h-3.5 fill-current" /> Watch all
                      </Btn>
                    }
                  >
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                      {vids.map((v, i) => (
                        <button key={v.id} onClick={() => setWatch({ queue: vids, i })} className="text-left group shrink-0 w-64">
                          <Art src={v.thumbnail} title={v.title} className="aspect-video rounded-xl border border-white/5 group-hover:border-[#f9993c]">
                            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">{fmtDuration(v.duration)}</span>
                          </Art>
                          <div className="text-sm font-bold text-white mt-2 truncate">{v.title}</div>
                          <div className="text-xs text-zinc-500 truncate">{v.genre}</div>
                        </button>
                      ))}
                    </div>
                  </Row>
                );
              })}
            </>
          )}

          {tab === 'pictures' && (f.online || reel.length > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {reel.length > 0 && (
                <AlbumCard title="Picture reel" count={reel.length} covers={reel.slice(0, 4).map(r => r.url)} onOpen={() => setAlbum({ title: `${label} · Picture reel`, pics: reel, i: 0 })} />
              )}
              {(cat?.albums || []).map(a => (
                <AlbumCard
                  key={a.id}
                  title={a.name}
                  count={a.pictures.length}
                  until={a.until}
                  covers={a.pictures.slice(0, 4).map(p => p.thumb)}
                  onOpen={() => setAlbum({ title: `${label} · ${a.name}`, pics: a.pictures.map(p => ({ url: p.url, thumb: p.thumb, name: p.name })), i: 0 })}
                />
              ))}
            </div>
          )}

          {f.online && cat && tab === 'games' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {cat.apps.map(a => (
                <button key={a.id} onClick={() => setGame({ ...a, entryPoint: a.runUrl })} className="text-left group">
                  <Art src={a.thumbnail} title={a.title} className="aspect-[4/3] rounded-2xl border border-white/10 group-hover:border-[#39ff88]">
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                      <span className="opacity-0 group-hover:opacity-100 w-14 h-14 rounded-full bg-[#39ff88] text-black flex items-center justify-center transition-opacity">
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      </span>
                    </div>
                  </Art>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-bold text-white truncate">{a.title}</span>
                    <Until until={a.until} />
                  </div>
                  <div className="text-xs text-zinc-500">{a.kind === 'app' ? `App · ${a.category || 'Uncategorized'}` : `Game · ${a.genre}`}</div>
                </button>
              ))}
            </div>
          )}

          {f.online && cat && tab === 'books' && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-5">
              {cat.books.map(b => (
                <button
                  key={b.id}
                  onClick={() => {
                    const progress = safeLocal<Book['progress'] | null>(peerProgressKey(b.base, b.id), null);
                    setBook({ ...b, progress: progress || undefined });
                  }}
                  className="text-left group"
                >
                  <Art src={b.cover} title={b.title} className="aspect-[2/3] rounded-xl border border-white/10 group-hover:border-[#ffcf33]">
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold text-white">{b.format.toUpperCase()}</span>
                  </Art>
                  <div className="text-sm font-bold text-white truncate mt-1.5">{b.series && b.issue ? `${b.series} #${b.issue}` : b.title}</div>
                  <div className="text-[11px] text-zinc-500 truncate flex items-center gap-1">
                    {b.author || (b.kind === 'comic' ? 'Comic' : 'Book')} <Until until={b.until} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {watch && <CinemaPlayer queue={watch.queue} startIndex={watch.i} title={label} onClose={() => setWatch(null)} />}
      {album && <Lightbox pictures={album.pics} start={album.i} title={album.title} onClose={() => setAlbum(null)} />}
      {game && <AppRunner app={game} onClose={() => setGame(null)} readOnly />}
      {book && <Reader book={book} base={book.base} onClose={() => setBook(null)} />}
    </div>,
    document.body
  );
};
