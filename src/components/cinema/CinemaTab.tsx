'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Play, Info, Plus, ChevronLeft, ChevronRight, Search, Tv, Film, Layers, Tags, Upload, Pencil, Trash2, Check, RotateCcw
} from 'lucide-react';
import { Pencil as PencilIcon, Clapperboard, Share2 } from 'lucide-react';
import { StartPartyDialog } from '@/components/social/WatchParty';
import { useP2P } from '@/components/social/P2PProvider';
import type { Video, Channel, Collection, WatchProgress } from '@/lib/types';
import { api, fmtDuration, gradientFor } from '@/lib/client';
import { CinemaPlayer } from './CinemaPlayer';
import { VideoFramePicker } from './VideoFramePicker';
import { Modal, Field, inputCls, Btn, Chip, Menu, Art, ImagePicker, Empty } from '@/components/ui/kit';

type View =
  | { kind: 'home' }
  | { kind: 'channels' }
  | { kind: 'genres'; genre?: string }
  | { kind: 'collections' }
  | { kind: 'channel'; id: string }
  | { kind: 'collection'; id: string };

interface Props {
  videos: Video[];
  channels: Channel[];
  genres: string[];
  collections: Collection[];
  watchProgress: Record<string, WatchProgress>;
  onRefresh: () => void;
  onUpload: () => void;
  /** Opens the Library Manager to edit details and artwork. */
  onManage?: () => void;
}

export const CinemaTab: React.FC<Props> = ({ videos, channels, genres, collections, watchProgress, onRefresh, onUpload, onManage }) => {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Video | null>(null);
  const [player, setPlayer] = useState<{ queue: Video[]; index: number; resume?: number; title?: string } | null>(null);
  const [editVideo, setEditVideo] = useState<Video | null>(null);
  const [editChannel, setEditChannel] = useState<Partial<Channel> | null>(null);
  const [editCollection, setEditCollection] = useState<Partial<Collection> | null>(null);
  const [party, setParty] = useState<Video | null>(null);
  const p2p = useP2P();

  const byId = useMemo(() => new Map(videos.map(v => [v.id, v])), [videos]);
  const usedGenres = useMemo(() => {
    const s = new Set(videos.map(v => v.genre).filter(Boolean));
    return [...s].sort();
  }, [videos]);

  const continueWatching = useMemo(
    () =>
      Object.entries(watchProgress)
        .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
        .map(([id]) => byId.get(id))
        .filter(Boolean) as Video[],
    [watchProgress, byId]
  );
  const recent = useMemo(() => [...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [videos]);
  const featured = useMemo(() => continueWatching[0] || recent.find(v => v.thumbnail) || recent[0], [continueWatching, recent]);

  const play = (v: Video, queue?: Video[], title?: string, fromStart = false) => {
    const list = queue && queue.length ? queue : [v];
    const i = Math.max(0, list.findIndex(x => x.id === v.id));
    const prog = watchProgress[v.id];
    setDetail(null);
    setPlayer({ queue: list, index: i, resume: fromStart ? undefined : prog?.position, title });
  };

  const q = query.trim().toLowerCase();
  const searchResults = q
    ? videos.filter(v => [v.title, v.description, v.genre, v.channelName].some(s => s?.toLowerCase().includes(q)))
    : [];

  const card = (v: Video, queue?: Video[], qTitle?: string, extraMenu?: { label: string; onClick: () => void; danger?: boolean }[]) => (
    <VideoCard
      key={v.id}
      video={v}
      progress={watchProgress[v.id]}
      onOpen={() => setDetail(v)}
      onPlay={() => play(v, queue, qTitle)}
      menu={[
        { label: 'Details', onClick: () => setDetail(v) },
        { label: 'Start a watch party…', onClick: () => setParty(v) },
        { label: 'Edit', onClick: () => setEditVideo(v) },
        ...(extraMenu || [])
      ]}
    />
  );

  const toggleInCollection = async (collId: string, videoId: string) => {
    await api('/api/collections', { method: 'PATCH', json: { id: collId, toggleVideoId: videoId } });
    onRefresh();
  };

  const navBtn = (k: View['kind'], label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <button
      onClick={() => {
        setView({ kind: k } as View);
        setQuery('');
      }}
      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
        view.kind === k || (k === 'channels' && view.kind === 'channel') || (k === 'collections' && view.kind === 'collection')
          ? 'bg-white text-black'
          : 'text-zinc-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  const channel = view.kind === 'channel' ? channels.find(c => c.id === view.id) : undefined;
  const collection = view.kind === 'collection' ? collections.find(c => c.id === view.id) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Film className="w-6 h-6 text-[#f9993c]" /> ChromaVision
          </h1>
          <div className="flex items-center gap-1 overflow-x-auto">
            {navBtn('home', 'Home', Tv)}
            {navBtn('channels', 'Channels', Tv)}
            {navBtn('genres', 'Genres', Tags)}
            {navBtn('collections', 'Collections', Layers)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Titles, genres, channels" className={`${inputCls} pl-9 w-56`} />
          </div>
          {onManage && (
            <Btn onClick={onManage} title="Edit titles, tags and cover art">
              <PencilIcon className="w-4 h-4" /> Edit library
            </Btn>
          )}
          <Btn variant="primary" onClick={onUpload}>
            <Upload className="w-4 h-4" /> Add video
          </Btn>
        </div>
      </div>

      {videos.length === 0 ? (
        <Empty icon={<Film className="w-10 h-10" />} title="No videos yet">
          Upload movies, shows or clips, or drop files into <code className="text-white">content\video</code> (MP4/WebM play everywhere; MKV/MOV depend on the browser). Posters are grabbed automatically.
        </Empty>
      ) : q ? (
        <Grid title={`Results for “${query}”`}>{searchResults.map(v => card(v, searchResults, 'Search'))}</Grid>
      ) : view.kind === 'home' ? (
        <>
          {featured && (
            <div className="relative rounded-3xl overflow-hidden min-h-[340px] md:min-h-[420px] flex items-end border border-white/10">
              <div className="absolute inset-0" style={{ background: gradientFor(featured.title) }}>
                {featured.thumbnail && <img src={featured.thumbnail} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#030608] via-transparent to-transparent" />
              <div className="relative p-6 md:p-10 max-w-2xl">
                <span className="text-xs font-black tracking-[0.3em] text-[#f9993c]">
                  {watchProgress[featured.id] ? 'CONTINUE WATCHING' : 'NEW ON YOUR SPOT'}
                </span>
                <h2 className="text-3xl md:text-5xl font-black text-white mt-2 leading-tight">{featured.title}</h2>
                <p className="text-sm text-zinc-300 mt-2">
                  {featured.channelName} · {featured.genre} · {fmtDuration(featured.duration)}
                  {featured.year ? ` · ${featured.year}` : ''}
                </p>
                {featured.description && <p className="text-sm text-zinc-300 mt-3 line-clamp-3">{featured.description}</p>}
                <div className="flex gap-2 mt-5">
                  <button onClick={() => play(featured, recent, 'Featured')} className="px-6 py-2.5 rounded-lg bg-white text-black font-black flex items-center gap-2 hover:bg-zinc-200">
                    <Play className="w-5 h-5 fill-current" /> {watchProgress[featured.id] ? 'Resume' : 'Play'}
                  </button>
                  <button onClick={() => setDetail(featured)} className="px-5 py-2.5 rounded-lg bg-white/20 text-white font-bold flex items-center gap-2 hover:bg-white/30 backdrop-blur">
                    <Info className="w-5 h-5" /> More info
                  </button>
                </div>
              </div>
            </div>
          )}

          {continueWatching.length > 0 && <Row title="Continue watching">{continueWatching.map(v => card(v, continueWatching, 'Continue watching'))}</Row>}
          <Row title="Recently added">{recent.slice(0, 20).map(v => card(v, recent, 'Recently added'))}</Row>
          {collections.map(c => {
            const list = c.videoIds.map(id => byId.get(id)).filter(Boolean) as Video[];
            if (!list.length) return null;
            return (
              <Row key={c.id} title={c.name} onMore={() => setView({ kind: 'collection', id: c.id })}>
                {list.map(v => card(v, list, c.name))}
              </Row>
            );
          })}
          {usedGenres.map(g => {
            const list = videos.filter(v => v.genre === g);
            return (
              <Row key={g} title={g} onMore={() => setView({ kind: 'genres', genre: g })}>
                {list.map(v => card(v, list, g))}
              </Row>
            );
          })}
          <div>
            <h3 className="text-lg font-black text-white mb-3">Channels</h3>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {channels.map(c => (
                <button key={c.id} onClick={() => setView({ kind: 'channel', id: c.id })} className="shrink-0 w-28 text-center group">
                  <Art src={c.avatar} title={c.channelName} className="w-24 h-24 mx-auto rounded-full border-2 border-white/10 group-hover:border-[#f9993c] transition-colors" />
                  <div className="text-xs font-bold text-white mt-2 truncate">{c.channelName}</div>
                  <div className="text-[11px] text-zinc-500">{videos.filter(v => v.channelId === c.id).length} videos</div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : view.kind === 'genres' ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip active={!view.genre} onClick={() => setView({ kind: 'genres' })} count={videos.length}>
              All
            </Chip>
            {usedGenres.map(g => (
              <Chip key={g} active={view.genre === g} onClick={() => setView({ kind: 'genres', genre: g })} count={videos.filter(v => v.genre === g).length}>
                {g}
              </Chip>
            ))}
          </div>
          {(() => {
            const list = view.genre ? videos.filter(v => v.genre === view.genre) : recent;
            return <Grid>{list.map(v => card(v, list, view.genre || 'All'))}</Grid>;
          })()}
        </>
      ) : view.kind === 'channels' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map(c => {
            const list = videos.filter(v => v.channelId === c.id);
            return (
              <button key={c.id} onClick={() => setView({ kind: 'channel', id: c.id })} className="text-left rounded-2xl overflow-hidden border border-[#1a323c] bg-[#0b1216] hover:border-[#f9993c] transition-colors">
                <Art src={c.banner || list.find(v => v.thumbnail)?.thumbnail} title={c.channelName} className="h-28" />
                <div className="p-4 flex items-center gap-3 -mt-10 relative">
                  <Art src={c.avatar} title={c.channelName} className="w-16 h-16 rounded-full border-4 border-[#0b1216] shrink-0" />
                  <div className="min-w-0 pt-8">
                    <div className="font-black text-white truncate">{c.channelName}</div>
                    <div className="text-xs text-zinc-500">{c.handle} · {list.length} videos</div>
                  </div>
                </div>
                {c.description && <p className="px-4 pb-4 text-xs text-zinc-400 line-clamp-2">{c.description}</p>}
              </button>
            );
          })}
          <button onClick={() => setEditChannel({ channelName: '' })} className="rounded-2xl border-2 border-dashed border-white/10 hover:border-[#f9993c] min-h-[180px] flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-white">
            <Plus className="w-8 h-8" /> <span className="font-bold">New channel</span>
          </button>
        </div>
      ) : view.kind === 'channel' && channel ? (
        (() => {
          const list = videos.filter(v => v.channelId === channel.id);
          return (
            <div className="space-y-4">
              <button onClick={() => setView({ kind: 'channels' })} className="text-sm text-zinc-400 hover:text-white flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> All channels
              </button>
              <div className="rounded-3xl overflow-hidden border border-white/10">
                <Art src={channel.banner || list.find(v => v.thumbnail)?.thumbnail} title={channel.channelName} className="h-40 md:h-56">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#030608] to-transparent" />
                </Art>
                <div className="px-6 pb-6 -mt-12 relative flex flex-col md:flex-row md:items-end gap-4">
                  <Art src={channel.avatar} title={channel.channelName} className="w-24 h-24 rounded-full border-4 border-[#030608] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-3xl font-black text-white">{channel.channelName}</h2>
                    <p className="text-sm text-zinc-400">
                      {channel.handle} · {list.length} videos · {fmtDuration(list.reduce((s, v) => s + v.duration, 0))}
                    </p>
                    {channel.description && <p className="text-sm text-zinc-300 mt-1">{channel.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="primary" disabled={!list.length} onClick={() => play(list[0], list, channel.channelName, true)}>
                      <Tv className="w-4 h-4" /> Watch channel
                    </Btn>
                    <Btn onClick={() => p2p.setDialog({ type: 'share', rid: `channel:${channel.id}`, name: channel.channelName })} title="Share this channel with friends">
                      <Share2 className="w-4 h-4" /> Share
                    </Btn>
                    <Btn onClick={() => setEditChannel(channel)}>
                      <Pencil className="w-4 h-4" />
                    </Btn>
                  </div>
                </div>
              </div>
              <Grid>{list.map(v => card(v, list, channel.channelName))}</Grid>
            </div>
          );
        })()
      ) : view.kind === 'collections' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {collections.map(c => {
            const list = c.videoIds.map(id => byId.get(id)).filter(Boolean) as Video[];
            return (
              <button key={c.id} onClick={() => setView({ kind: 'collection', id: c.id })} className="text-left group">
                <div className="aspect-video rounded-2xl overflow-hidden border border-white/10 group-hover:border-[#f9993c] relative" style={{ background: gradientFor(c.name) }}>
                  {c.cover ? (
                    <img src={c.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5">
                      {list.slice(0, 4).map(v => (
                        <Art key={v.id} src={v.thumbnail} title={v.title} className="w-full h-full" />
                      ))}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-2 left-3 right-3">
                    <div className="text-white font-black truncate">{c.name}</div>
                    <div className="text-xs text-zinc-300">{list.length} titles</div>
                  </div>
                </div>
              </button>
            );
          })}
          <button onClick={() => setEditCollection({ name: '' })} className="aspect-video rounded-2xl border-2 border-dashed border-white/10 hover:border-[#f9993c] flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white">
            <Plus className="w-8 h-8" /> <span className="font-bold text-sm">New collection</span>
          </button>
        </div>
      ) : view.kind === 'collection' && collection ? (
        (() => {
          const list = collection.videoIds.map(id => byId.get(id)).filter(Boolean) as Video[];
          return (
            <div className="space-y-4">
              <button onClick={() => setView({ kind: 'collections' })} className="text-sm text-zinc-400 hover:text-white flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> All collections
              </button>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider text-[#649fae]">Collection</span>
                  <h2 className="text-3xl font-black text-white">{collection.name}</h2>
                  {collection.description && <p className="text-sm text-zinc-400">{collection.description}</p>}
                  <p className="text-xs text-zinc-500 mt-1">
                    {list.length} titles · {fmtDuration(list.reduce((s, v) => s + v.duration, 0))}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Btn variant="primary" disabled={!list.length} onClick={() => play(list[0], list, collection.name, true)}>
                    <Play className="w-4 h-4 fill-current" /> Play all
                  </Btn>
                  <Btn onClick={() => p2p.setDialog({ type: 'share', rid: `collection:${collection.id}`, name: collection.name })} title="Share this collection with friends">
                    <Share2 className="w-4 h-4" /> Share
                  </Btn>
                  <Btn onClick={() => setEditCollection(collection)}>
                    <Pencil className="w-4 h-4" /> Edit
                  </Btn>
                  <Btn
                    variant="danger"
                    onClick={async () => {
                      if (!confirm(`Delete collection “${collection.name}”? (Videos stay in your library.)`)) return;
                      await api(`/api/collections?id=${collection.id}`, { method: 'DELETE' });
                      setView({ kind: 'collections' });
                      onRefresh();
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Btn>
                </div>
              </div>
              {list.length ? (
                <Grid>
                  {list.map(v => card(v, list, collection.name, [{ label: 'Remove from collection', onClick: () => toggleInCollection(collection.id, v.id) }]))}
                </Grid>
              ) : (
                <p className="text-sm text-zinc-500">Empty. Open any video’s details and tick this collection to add it.</p>
              )}
            </div>
          );
        })()
      ) : null}

      {/* Detail sheet */}
      {party && <StartPartyDialog video={party} onClose={() => setParty(null)} />}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={detail.title} wide>
          <div className="relative -mx-5 -mt-5 mb-2 aspect-video" style={{ background: gradientFor(detail.title) }}>
            {detail.thumbnail && <img src={detail.thumbnail} alt="" className="w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b1216] via-transparent to-transparent" />
            <div className="absolute bottom-4 left-5 flex gap-2">
              <button onClick={() => play(detail, [detail, ...videos.filter(v => v.genre === detail.genre && v.id !== detail.id)], detail.genre)} className="px-5 py-2 rounded-lg bg-white text-black font-black flex items-center gap-2">
                <Play className="w-5 h-5 fill-current" /> {watchProgress[detail.id] ? 'Resume' : 'Play'}
              </button>
              {watchProgress[detail.id] && (
                <button onClick={() => play(detail, undefined, undefined, true)} className="px-4 py-2 rounded-lg bg-white/20 text-white font-bold flex items-center gap-2 backdrop-blur">
                  <RotateCcw className="w-4 h-4" /> Start over
                </button>
              )}
              <button onClick={() => { setParty(detail); setDetail(null); }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#f9993c] to-[#ff2e6e] text-black font-bold flex items-center gap-2" title="Watch together with friends, in sync">
                <Clapperboard className="w-4 h-4" /> Watch party
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-5">
            <div>
              <p className="text-sm text-zinc-400">
                {fmtDuration(detail.duration)} · {detail.genre}
                {detail.year ? ` · ${detail.year}` : ''} · {detail.views} views
              </p>
              <p className="text-sm text-zinc-200 mt-2 whitespace-pre-line">{detail.description || 'No description yet.'}</p>
              <button onClick={() => { setView({ kind: 'channel', id: detail.channelId }); setDetail(null); }} className="text-sm text-[#f9993c] hover:underline mt-3">
                More from {detail.channelName} →
              </button>
            </div>
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-2">In collections</h4>
              <div className="space-y-1">
                {collections.map(c => {
                  const inIt = c.videoIds.includes(detail.id);
                  return (
                    <button key={c.id} onClick={() => toggleInCollection(c.id, detail.id)} className="w-full flex items-center gap-2 text-sm text-left px-2 py-1.5 rounded hover:bg-white/5">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${inIt ? 'bg-[#f9993c] border-[#f9993c]' : 'border-white/30'}`}>
                        {inIt && <Check className="w-3 h-3 text-black" />}
                      </span>
                      <span className="text-zinc-200 truncate">{c.name}</span>
                    </button>
                  );
                })}
                <button onClick={() => setEditCollection({ name: '', videoIds: [detail.id] })} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 px-2 py-1">
                  <Plus className="w-3.5 h-3.5" /> New collection
                </button>
              </div>
              <div className="flex gap-2 mt-4">
                <Btn small onClick={() => { setEditVideo(detail); setDetail(null); }}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Btn>
                <Btn
                  small
                  variant="danger"
                  onClick={async () => {
                    if (!confirm(`Delete “${detail.title}” from your library and disk?`)) return;
                    await api(`/api/videos?id=${detail.id}`, { method: 'DELETE' });
                    setDetail(null);
                    onRefresh();
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Btn>
              </div>
            </div>
          </div>
          {(() => {
            const more = videos.filter(v => v.genre === detail.genre && v.id !== detail.id).slice(0, 6);
            if (!more.length) return null;
            return (
              <div>
                <h4 className="text-sm font-black text-white mb-2">More like this</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {more.map(v => (
                    <button key={v.id} onClick={() => setDetail(v)} className="text-left">
                      <Art src={v.thumbnail} title={v.title} className="aspect-video rounded-lg" />
                      <div className="text-xs text-white mt-1 truncate">{v.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {player && <CinemaPlayer queue={player.queue} startIndex={player.index} resumeAt={player.resume} title={player.title} onClose={() => { setPlayer(null); onRefresh(); }} />}

      {editVideo && (
        <VideoEditor
          video={editVideo}
          channels={channels}
          genres={[...new Set([...genres, ...usedGenres])]}
          onClose={() => setEditVideo(null)}
          onSaved={() => {
            setEditVideo(null);
            onRefresh();
          }}
        />
      )}
      {editChannel && (
        <ChannelEditor
          channel={editChannel}
          onClose={() => setEditChannel(null)}
          onSaved={id => {
            setEditChannel(null);
            onRefresh();
            if (id) setView({ kind: 'channel', id });
          }}
          onDeleted={() => {
            setEditChannel(null);
            setView({ kind: 'channels' });
            onRefresh();
          }}
        />
      )}
      {editCollection && (
        <CollectionEditor
          collection={editCollection}
          onClose={() => setEditCollection(null)}
          onSaved={() => {
            setEditCollection(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};

const Row: React.FC<{ title: string; children: React.ReactNode; onMore?: () => void }> = ({ title, children, onMore }) => {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <div className="group/row">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-black text-white">{title}</h3>
        {onMore && (
          <button onClick={onMore} className="text-xs text-zinc-400 hover:text-white">
            See all →
          </button>
        )}
      </div>
      <div className="relative">
        <button onClick={() => scroll(-1)} className="hidden md:flex absolute left-0 top-0 bottom-6 z-10 w-10 items-center justify-center bg-gradient-to-r from-[#030608] to-transparent opacity-0 group-hover/row:opacity-100" aria-label="Scroll left">
          <ChevronLeft className="w-7 h-7 text-white" />
        </button>
        <div ref={ref} className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x [&>*]:w-[260px] [&>*]:shrink-0 [&>*]:snap-start">
          {children}
        </div>
        <button onClick={() => scroll(1)} className="hidden md:flex absolute right-0 top-0 bottom-6 z-10 w-10 items-center justify-center bg-gradient-to-l from-[#030608] to-transparent opacity-0 group-hover/row:opacity-100" aria-label="Scroll right">
          <ChevronRight className="w-7 h-7 text-white" />
        </button>
      </div>
    </div>
  );
};

const Grid: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    {title && <h3 className="text-lg font-black text-white mb-3">{title}</h3>}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{children}</div>
  </div>
);

const VideoCard: React.FC<{
  video: Video;
  progress?: WatchProgress;
  onOpen: () => void;
  onPlay: () => void;
  menu: { label: string; onClick: () => void; danger?: boolean }[];
}> = ({ video, progress, onOpen, onPlay, menu }) => (
  <div className="group cursor-pointer" onClick={onOpen}>
    <Art src={video.thumbnail} title={video.title} className="aspect-video rounded-xl border border-white/5 group-hover:border-[#f9993c]/70 transition-all group-hover:scale-[1.02]">
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
      <button
        onClick={e => {
          e.stopPropagation();
          onPlay();
        }}
        className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        title="Play"
      >
        <Play className="w-5 h-5 fill-current ml-0.5" />
      </button>
      {video.duration > 0 && <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">{fmtDuration(video.duration)}</span>}
      {progress && progress.duration > 0 && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
          <div className="h-full bg-[#ff2e6e]" style={{ width: `${(progress.position / progress.duration) * 100}%` }} />
        </div>
      )}
    </Art>
    <div className="flex items-start gap-1 mt-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white truncate">{video.title}</div>
        <div className="text-xs text-zinc-500 truncate">
          {video.channelName} · {video.genre}
        </div>
      </div>
      <Menu items={menu} />
    </div>
  </div>
);

export const VideoEditor: React.FC<{ video: Video; channels: Channel[]; genres: string[]; onClose: () => void; onSaved: () => void }> = ({ video, channels, genres, onClose, onSaved }) => {
  const [v, setV] = useState<Partial<Video>>({ ...video, posterMode: video.posterMode || (video.thumbnail?.includes('/poster_') ? 'frame' : 'custom') });
  const [err, setErr] = useState('');
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Edit video"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={async () => {
              try {
                await api('/api/videos', {
                  method: 'PATCH',
                  json: { id: video.id, title: v.title, description: v.description, genre: v.genre, channelId: v.channelId, year: v.year ? Number(v.year) : undefined, thumbnail: v.thumbnail, posterMode: v.posterMode, posterTime: v.posterTime }
                });
                onSaved();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Save
          </Btn>
        </>
      }
    >
      <Field label="Title">
        <input className={inputCls} value={v.title || ''} onChange={e => setV({ ...v, title: e.target.value })} />
      </Field>
      <Field label="Description">
        <textarea className={inputCls} rows={3} value={v.description || ''} onChange={e => setV({ ...v, description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Genre">
          <input className={inputCls} list="video-genres" value={v.genre || ''} onChange={e => setV({ ...v, genre: e.target.value })} />
          <datalist id="video-genres">
            {genres.map(g => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field label="Year">
          <input className={inputCls} type="number" value={v.year || ''} onChange={e => setV({ ...v, year: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
      </div>
      <Field label="Channel">
        <select className={inputCls} value={v.channelId} onChange={e => setV({ ...v, channelId: e.target.value })}>
          {channels.map(c => (
            <option key={c.id} value={c.id}>
              {c.channelName}
            </option>
          ))}
        </select>
      </Field>
      <div>
        <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">Poster shown in previews</span>
        <div className="flex gap-1 bg-black/40 rounded-lg p-1 border border-white/10 w-fit mb-2">
          {(
            [
              ['frame', 'Frame from the video'],
              ['custom', 'Custom image']
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setV({ ...v, posterMode: m })}
              className={`px-3 py-1.5 rounded-md text-xs font-bold ${v.posterMode === m ? 'bg-[#f9993c] text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {v.posterMode === 'frame' ? (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3 items-start">
            <VideoFramePicker src={video.filePath} initialTime={v.posterTime || 0} onPick={(url, time) => setV({ ...v, thumbnail: url, posterTime: time, posterMode: 'frame' })} />
            <div>
              <div className="text-[11px] text-zinc-500 mb-1">Current poster</div>
              <div className="aspect-video rounded-lg overflow-hidden bg-black/40 border border-white/10">{v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />}</div>
            </div>
          </div>
        ) : (
          <ImagePicker value={v.thumbnail} onChange={url => setV({ ...v, thumbnail: url, posterMode: 'custom' })} label="Cover image" aspect="aspect-video" />
        )}
      </div>
      {err && <p className="text-xs text-[#ff6b6b]">{err}</p>}
    </Modal>
  );
};

const ChannelEditor: React.FC<{ channel: Partial<Channel>; onClose: () => void; onSaved: (id?: string) => void; onDeleted: () => void }> = ({ channel, onClose, onSaved, onDeleted }) => {
  const [c, setC] = useState<Partial<Channel>>({ ...channel });
  const [err, setErr] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={c.id ? 'Edit channel' : 'New channel'}
      footer={
        <>
          {c.id && c.id !== 'chan_my_station' && (
            <Btn
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (!confirm('Delete this channel? Its videos move to your personal channel.')) return;
                await api(`/api/channels?id=${c.id}`, { method: 'DELETE' });
                onDeleted();
              }}
            >
              Delete
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={!c.channelName?.trim()}
            onClick={async () => {
              try {
                const r = c.id ? await api('/api/channels', { method: 'PATCH', json: c }) : await api('/api/channels', { method: 'POST', json: c });
                onSaved(r.channel?.id);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Save
          </Btn>
        </>
      }
    >
      <Field label="Channel name">
        <input className={inputCls} value={c.channelName || ''} onChange={e => setC({ ...c, channelName: e.target.value })} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Handle">
          <input className={inputCls} value={c.handle || ''} onChange={e => setC({ ...c, handle: e.target.value })} placeholder="@mychannel" />
        </Field>
        <Field label="Genre">
          <input className={inputCls} value={c.genre || ''} onChange={e => setC({ ...c, genre: e.target.value })} />
        </Field>
      </div>
      <Field label="About">
        <textarea className={inputCls} rows={2} value={c.description || ''} onChange={e => setC({ ...c, description: e.target.value })} />
      </Field>
      <ImagePicker value={c.avatar} onChange={url => setC({ ...c, avatar: url })} label="Avatar" />
      <ImagePicker value={c.banner} onChange={url => setC({ ...c, banner: url })} label="Banner" aspect="aspect-video" />
      {err && <p className="text-xs text-[#ff6b6b]">{err}</p>}
    </Modal>
  );
};

const CollectionEditor: React.FC<{ collection: Partial<Collection>; onClose: () => void; onSaved: () => void }> = ({ collection, onClose, onSaved }) => {
  const [c, setC] = useState<Partial<Collection>>({ ...collection });
  return (
    <Modal
      open
      onClose={onClose}
      title={c.id ? 'Edit collection' : 'New collection'}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={!c.name?.trim()}
            onClick={async () => {
              if (c.id) await api('/api/collections', { method: 'PATCH', json: { id: c.id, name: c.name, description: c.description, cover: c.cover || '' } });
              else await api('/api/collections', { method: 'POST', json: c });
              onSaved();
            }}
          >
            Save
          </Btn>
        </>
      }
    >
      <Field label="Name">
        <input className={inputCls} value={c.name || ''} onChange={e => setC({ ...c, name: e.target.value })} placeholder="Friday Movie Night" autoFocus />
      </Field>
      <Field label="Description">
        <textarea className={inputCls} rows={2} value={c.description || ''} onChange={e => setC({ ...c, description: e.target.value })} />
      </Field>
      <ImagePicker value={c.cover} onChange={url => setC({ ...c, cover: url })} label="Cover (optional — otherwise a mosaic of its posters)" aspect="aspect-video" />
    </Modal>
  );
};
