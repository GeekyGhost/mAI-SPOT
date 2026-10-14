'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Radio, Play, Shuffle, Plus, Search, Music2, Users, Disc3, ListMusic, Tags, Upload, Copy, Check,
  SkipForward, Square, Headphones, ChevronLeft, Pencil, ArrowUp, ArrowDown, Signal
} from 'lucide-react';
import { Pencil as PencilIcon } from 'lucide-react';
import { useP2P } from '@/components/social/P2PProvider';
import { RadioDial } from './RadioDial';
import type {
  Track, Playlist, RadioStation, LiveBroadcast, MusicPlayerStyle, VisualizerMode, StationSourceType
} from '@/lib/types';
import { api, fmtTime, fmtDuration } from '@/lib/client';
import { useAudio, NowTrack } from '@/components/audio/AudioEngine';
import { MusicDeck } from '@/components/audio/Decks';
import { LiveBadge } from '@/components/audio/Controls';
import { Modal, Field, inputCls, Btn, Chip, Menu, Art, ImagePicker, Empty } from '@/components/ui/kit';

type Tab = 'stations' | 'genres' | 'artists' | 'albums' | 'playlists' | 'songs';
type Detail = { kind: 'genre' | 'artist' | 'album' | 'playlist'; key: string; title: string } | null;

interface Props {
  tracks: Track[];
  playlists: Playlist[];
  stations: RadioStation[];
  live: LiveBroadcast | null;
  skin: MusicPlayerStyle;
  visualizer: VisualizerMode;
  onLookChange: (skin: MusicPlayerStyle, vis: VisualizerMode) => void;
  onRefresh: () => void;
  onUpload: () => void;
  /** Opens the Library Manager to edit details and artwork. */
  onManage?: () => void;
}

const sourceLabel = (st: RadioStation, playlists: Playlist[]) => {
  switch (st.source.type) {
    case 'all':
      return 'Whole library';
    case 'playlist':
      return `Playlist · ${playlists.find(p => p.id === st.source.value)?.name || 'missing'}`;
    default:
      return `${st.source.type[0].toUpperCase()}${st.source.type.slice(1)} · ${st.source.value}`;
  }
};

function stationTrackList(st: RadioStation, tracks: Track[], playlists: Playlist[]): Track[] {
  const v = st.source.value?.toLowerCase();
  switch (st.source.type) {
    case 'genre':
      return tracks.filter(t => t.genre.toLowerCase() === v);
    case 'artist':
      return tracks.filter(t => t.artist.toLowerCase() === v);
    case 'album':
      return tracks.filter(t => (t.album || '').toLowerCase() === v);
    case 'playlist': {
      const pl = playlists.find(p => p.id === st.source.value);
      return pl ? (pl.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[]) : [];
    }
    default:
      return tracks;
  }
}

export const RadioTab: React.FC<Props> = ({ tracks, playlists, stations, live: initialLive, skin, visualizer, onLookChange, onRefresh, onUpload, onManage }) => {
  const p2p = useP2P();
  const audio = useAudio();
  const [tab, setTab] = useState<Tab>('stations');
  const [detail, setDetail] = useState<Detail>(null);
  const [query, setQuery] = useState('');
  const [live, setLive] = useState<LiveBroadcast | null>(initialLive);
  const [listenUrls, setListenUrls] = useState<string[]>([]);
  const [copied, setCopied] = useState('');
  const [editStation, setEditStation] = useState<Partial<RadioStation> | null>(null);
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [editPlaylist, setEditPlaylist] = useState<Partial<Playlist> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => setLive(initialLive), [initialLive]);

  // Keep the on-air panel fresh (listener count, now playing).
  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch('/api/radio/live', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => alive && setLive(d))
        .catch(() => {});
    const id = setInterval(tick, 10000);
    api('/api/node').then(d => alive && setListenUrls(d.listenUrls || [])).catch(() => {});
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const playable = useMemo(() => tracks.filter(t => t.duration > 0 || !t.probed), [tracks]);

  useEffect(() => {
    if (!audio.current && audio.queue.length === 0 && playable.length > 0 && !live?.live) {
      audio.cueQueue(playable as NowTrack[], 0, 'My library');
    }
  }, [audio.current, audio.queue.length, playable, live?.live, audio.cueQueue]);

  const genres = useMemo(() => group(playable, t => t.genre || 'Unsorted'), [playable]);
  const artists = useMemo(() => group(playable, t => t.artist || 'Unknown Artist'), [playable]);
  const albums = useMemo(() => group(playable.filter(t => t.album), t => t.album!), [playable]);

  const q = query.trim().toLowerCase();
  const matches = (t: Track) =>
    !q || [t.title, t.artist, t.album, t.genre].some(s => s?.toLowerCase().includes(q));

  const radioAction = async (body: Record<string, unknown>) => {
    setError('');
    try {
      const r = await api('/api/radio', { method: 'POST', json: body });
      if (r.live) setLive(r.live);
      onRefresh();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  const goLive = async (st: RadioStation) => {
    const r = await radioAction({ action: 'go_live', id: st.id });
    if (r) audio.tuneInLive();
  };

  const playList = (list: Track[], label: string, shuffled = false) => {
    if (!list.length) return;
    const ordered = shuffled ? [...list].sort(() => Math.random() - 0.5) : list;
    audio.playQueue(ordered as NowTrack[], 0, label);
  };

  const addToPlaylist = async (plId: string, trackIds: string[]) => {
    await api('/api/playlists', { method: 'PATCH', json: { id: plId, addTrackIds: trackIds } });
    onRefresh();
  };

  const newPlaylistWith = async (trackIds: string[]) => {
    const name = prompt('Name for the new playlist?');
    if (!name) return;
    await api('/api/playlists', { method: 'POST', json: { name, trackIds } });
    onRefresh();
  };

  const trackMenu = (t: Track, inPlaylist?: Playlist) => [
    { label: 'Play next', onClick: () => audio.playNext(t) },
    { label: 'Add to queue', onClick: () => audio.addToQueue(t) },
    { label: '—', onClick: () => {} },
    ...playlists.map(p => ({ label: `Add to “${p.name}”`, onClick: () => addToPlaylist(p.id, [t.id]) })),
    { label: '+ New playlist with this', onClick: () => newPlaylistWith([t.id]) },
    { label: '—', onClick: () => {} },
    { label: 'Make a station from this artist', onClick: () => setEditStation({ name: `${t.artist} Radio`, source: { type: 'artist', value: t.artist }, shuffle: true }) },
    { label: 'Edit details', onClick: () => setEditTrack(t) },
    inPlaylist
      ? {
          label: 'Remove from this playlist',
          onClick: async () => {
            await api('/api/playlists', { method: 'PATCH', json: { id: inPlaylist.id, trackIds: inPlaylist.trackIds.filter(x => x !== t.id) } });
            onRefresh();
          }
        }
      : null,
    {
      label: 'Delete song (removes the file)',
      danger: true,
      onClick: async () => {
        if (!confirm(`Delete “${t.title}” from your library and disk?`)) return;
        await api(`/api/tracks?id=${t.id}`, { method: 'DELETE' });
        onRefresh();
      }
    }
  ];

  const copy = (s: string) => {
    navigator.clipboard?.writeText(s).catch(() => {});
    setCopied(s);
    setTimeout(() => setCopied(''), 2000);
  };

  const liveStation = stations.find(s => s.isLive);
  const tuned = audio.mode === 'live';

  // ─── detail view (genre / artist / album / playlist) ───
  const detailTracks: Track[] = useMemo(() => {
    if (!detail) return [];
    if (detail.kind === 'playlist') {
      const pl = playlists.find(p => p.id === detail.key);
      return pl ? (pl.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[]) : [];
    }
    const src = detail.kind === 'genre' ? genres : detail.kind === 'artist' ? artists : albums;
    const list = src.get(detail.key) || [];
    return detail.kind === 'album' ? [...list].sort((a, b) => (a.trackNo || 0) - (b.trackNo || 0)) : list;
  }, [detail, playlists, tracks, genres, artists, albums]);
  const detailPlaylist = detail?.kind === 'playlist' ? playlists.find(p => p.id === detail.key) : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Radio className="w-6 h-6 text-[var(--spot-accent)]" /> Radio
          </h1>
          <p className="text-sm text-[#649fae]">Your music by station, genre, artist and playlist. Put any station on air and it streams like a real radio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onManage && (
            <Btn onClick={onManage} title="Edit titles, tags and cover art">
              <PencilIcon className="w-4 h-4" /> Edit library
            </Btn>
          )}
          <Btn variant="primary" onClick={onUpload}>
            <Upload className="w-4 h-4" /> Add music
          </Btn>
        </div>
      </div>

      {/* On-air panel */}
      <div className={`rounded-2xl border p-4 ${live?.live ? 'border-[#ff2e6e]/50 bg-gradient-to-r from-[#ff2e6e]/15 via-[#0b1216] to-[#0b1216]' : 'border-[#1a323c] bg-[#0b1216]'}`}>
        {live?.live && live.track ? (
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative">
                <img src={live.track.coverArt} alt="" className="w-16 h-16 rounded-xl object-cover" />
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#ff2e6e] animate-ping" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <LiveBadge />
                  <span className="text-white font-black truncate">{live.station?.name}</span>
                  <span className="text-xs text-zinc-400 flex items-center gap-1">
                    <Headphones className="w-3.5 h-3.5" /> {live.listeners || 0} listening
                  </span>
                </div>
                <p className="text-sm text-zinc-200 truncate mt-0.5">
                  Now: <b>{live.track.title}</b> — {live.track.artist}
                </p>
                {live.upNext?.[0] && <p className="text-xs text-zinc-500 truncate">Next: {live.upNext[0].title} — {live.upNext[0].artist}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {tuned ? (
                <Btn onClick={audio.leaveLive}>
                  <Headphones className="w-4 h-4" /> Stop listening
                </Btn>
              ) : (
                <Btn variant="primary" onClick={() => audio.tuneInLive()}>
                  <Headphones className="w-4 h-4" /> Tune in
                </Btn>
              )}
              <Btn onClick={async () => { await radioAction({ action: 'skip' }); if (tuned) audio.tuneInLive(); }} title="Skip to the next song for everyone">
                <SkipForward className="w-4 h-4" /> Skip
              </Btn>
              <Btn variant="danger" onClick={async () => { await radioAction({ action: 'off_air' }); if (tuned) audio.leaveLive(); }}>
                <Square className="w-4 h-4" /> End broadcast
              </Btn>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <Signal className="w-5 h-5 text-zinc-500" />
            <span>
              Off air. Press <b className="text-white">Go Live</b> on any station below to start broadcasting. It keeps playing around the clock while your node is running, even with this page closed.
            </span>
          </div>
        )}
        {live?.live && listenUrls.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-400">Listeners on your network can tune in at:</span>
            {listenUrls.map(u => (
              <button key={u} onClick={() => copy(u)} className="font-mono px-2 py-1 rounded bg-black/40 border border-white/10 text-[var(--spot-accent)] hover:border-[var(--spot-accent)] inline-flex items-center gap-1">
                {copied === u ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {u}
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-xs text-[#ff6b6b]">{error}</p>}
      </div>

      {/* Player */}
      <MusicDeck
        skin={skin}
        visualizer={visualizer}
        onSkinChange={s => onLookChange(s, visualizer)}
        onVisualizerChange={v => onLookChange(skin, v)}
      />

      {/* Friends on the air */}
      <RadioDial />

      {/* Browse */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {(
              [
                ['stations', 'Stations', Radio],
                ['genres', 'Genres', Tags],
                ['artists', 'Artists', Users],
                ['albums', 'Albums', Disc3],
                ['playlists', 'Playlists', ListMusic],
                ['songs', 'Songs', Music2]
              ] as [Tab, string, React.ComponentType<{ className?: string }>][]
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  setDetail(null);
                }}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                  tab === id && !detail ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                if (e.target.value) {
                  setTab('songs');
                  setDetail(null);
                }
              }}
              placeholder="Search songs, artists, albums…"
              className={`${inputCls} pl-9 w-64`}
            />
          </div>
        </div>

        {tracks.length === 0 ? (
          <Empty icon={<Music2 className="w-10 h-10" />} title="No music yet">
            Upload songs, or drop audio files into <code className="text-white">content\audio</code>. They’re picked up automatically with their tags, cover art and real lengths.
          </Empty>
        ) : detail ? (
          <div>
            <button onClick={() => setDetail(null)} className="text-sm text-zinc-400 hover:text-white flex items-center gap-1 mb-3">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
              <Art src={detailPlaylist?.cover || detailTracks[0]?.coverArt} title={detail.title} className="w-36 h-36 rounded-2xl shadow-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs uppercase font-bold tracking-wider text-[#649fae]">{detail.kind}</span>
                <h2 className="text-3xl font-black text-white truncate">{detail.title}</h2>
                {detailPlaylist?.description && <p className="text-sm text-zinc-400">{detailPlaylist.description}</p>}
                <p className="text-xs text-zinc-500 mt-1">
                  {detailTracks.length} songs · {fmtDuration(detailTracks.reduce((s, t) => s + t.duration, 0))}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Btn variant="primary" onClick={() => playList(detailTracks, detail.title)}>
                    <Play className="w-4 h-4 fill-current" /> Play
                  </Btn>
                  <Btn onClick={() => playList(detailTracks, detail.title, true)}>
                    <Shuffle className="w-4 h-4" /> Shuffle
                  </Btn>
                  <Btn
                    onClick={() =>
                      setEditStation({
                        name: `${detail.title} Radio`,
                        source: { type: detail.kind as StationSourceType, value: detail.kind === 'playlist' ? detail.key : detail.title },
                        shuffle: true
                      })
                    }
                  >
                    <Radio className="w-4 h-4" /> Make a station
                  </Btn>
                  {detailPlaylist && (
                    <>
                      <Btn onClick={() => setEditPlaylist(detailPlaylist)}>
                        <Pencil className="w-4 h-4" /> Edit
                      </Btn>
                      <Btn
                        variant="danger"
                        onClick={async () => {
                          if (!confirm(`Delete playlist “${detailPlaylist.name}”? (Songs stay in your library.)`)) return;
                          await api(`/api/playlists?id=${detailPlaylist.id}`, { method: 'DELETE' });
                          setDetail(null);
                          onRefresh();
                        }}
                      >
                        Delete
                      </Btn>
                    </>
                  )}
                </div>
              </div>
            </div>
            <TrackTable
              tracks={detailTracks}
              currentId={audio.mode === 'ondemand' ? audio.current?.id : undefined}
              onPlay={(t, list) => audio.playTrack(t, list as NowTrack[], detail.title)}
              menu={t => trackMenu(t, detailPlaylist)}
              onMove={
                detailPlaylist
                  ? async (from, to) => {
                      const ids = [...detailPlaylist.trackIds];
                      const [x] = ids.splice(from, 1);
                      ids.splice(to, 0, x);
                      await api('/api/playlists', { method: 'PATCH', json: { id: detailPlaylist.id, trackIds: ids } });
                      onRefresh();
                    }
                  : undefined
              }
            />
          </div>
        ) : tab === 'stations' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations.map(st => {
              const list = stationTrackList(st, playable, playlists);
              const isOnAir = st.isLive && live?.live;
              return (
                <div key={st.id} className={`rounded-2xl border overflow-hidden bg-[#0b1216] ${isOnAir ? 'border-[#ff2e6e]/70 shadow-[0_0_25px_rgba(255,46,110,0.25)]' : 'border-[#1a323c]'}`}>
                  <Art src={st.cover || list[0]?.coverArt} title={st.name} className="h-32">
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b1216] to-transparent" />
                    {isOnAir && <LiveBadge className="absolute top-2 left-2" />}
                    <Menu
                      className="absolute top-1 right-1"
                      items={[
                        { label: 'Share with friends…', onClick: () => p2p.setDialog({ type: 'share', rid: `station:${st.id}`, name: st.name }) },
                        { label: 'Edit station', onClick: () => setEditStation(st) },
                        { label: 'Delete station', danger: true, onClick: () => confirm(`Delete “${st.name}”?`) && radioAction({ action: 'delete', id: st.id }) }
                      ]}
                    />
                  </Art>
                  <div className="p-4 -mt-6 relative">
                    <h3 className="text-white font-black text-lg truncate">{st.name}</h3>
                    <p className="text-xs text-zinc-400 line-clamp-2 min-h-[2rem]">{st.tagline || ' '}</p>
                    <p className="text-[11px] text-[#649fae] mt-1">
                      {sourceLabel(st, playlists)} · {list.length} songs{st.shuffle ? ' · shuffled' : ''}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Btn small onClick={() => playList(list, st.name, st.shuffle)} disabled={!list.length}>
                        <Play className="w-3.5 h-3.5 fill-current" /> Listen
                      </Btn>
                      {isOnAir ? (
                        <Btn small variant="danger" onClick={() => radioAction({ action: 'off_air' })}>
                          <Square className="w-3.5 h-3.5" /> End broadcast
                        </Btn>
                      ) : (
                        <Btn small variant="primary" onClick={() => goLive(st)} disabled={!list.length}>
                          <Radio className="w-3.5 h-3.5" /> Go Live
                        </Btn>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => setEditStation({ name: '', source: { type: 'all' }, shuffle: true })}
              className="rounded-2xl border-2 border-dashed border-white/10 hover:border-[var(--spot-accent)] min-h-[230px] flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-white transition-colors"
            >
              <Plus className="w-8 h-8" />
              <span className="font-bold">New station</span>
              <span className="text-xs">From a genre, artist, album, playlist, or everything</span>
            </button>
          </div>
        ) : tab === 'playlists' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <button
              onClick={() => setEditPlaylist({ name: '', description: '' })}
              className="aspect-square rounded-2xl border-2 border-dashed border-white/10 hover:border-[var(--spot-accent)] flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white"
            >
              <Plus className="w-8 h-8" />
              <span className="font-bold text-sm">New playlist</span>
            </button>
            {playlists.map(p => {
              const first = tracks.find(t => t.id === p.trackIds[0]);
              return (
                <Tile
                  key={p.id}
                  title={p.name}
                  subtitle={`${p.trackIds.length} songs`}
                  art={p.cover || first?.coverArt}
                  onOpen={() => setDetail({ kind: 'playlist', key: p.id, title: p.name })}
                  onPlay={() => playList(p.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[], p.name)}
                />
              );
            })}
          </div>
        ) : tab === 'songs' ? (
          <TrackTable
            tracks={playable.filter(matches)}
            currentId={audio.mode === 'ondemand' ? audio.current?.id : undefined}
            onPlay={(t, list) => audio.playTrack(t, list as NowTrack[], q ? `Search: ${query}` : 'All songs')}
            menu={t => trackMenu(t)}
            showGenre
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[...(tab === 'genres' ? genres : tab === 'artists' ? artists : albums).entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([key, list]) => (
                <Tile
                  key={key}
                  round={tab === 'artists'}
                  title={key}
                  subtitle={tab === 'albums' ? list[0]?.artist : `${list.length} songs`}
                  art={list.find(t => t.coverArt && !t.coverArt.includes('avatar_user'))?.coverArt}
                  onOpen={() => setDetail({ kind: tab === 'genres' ? 'genre' : tab === 'artists' ? 'artist' : 'album', key, title: key })}
                  onPlay={() => playList(list, key, tab !== 'albums')}
                />
              ))}
            {tab === 'albums' && albums.size === 0 && (
              <p className="col-span-full text-sm text-zinc-500">No album tags found. Edit a song’s details to group it into an album.</p>
            )}
          </div>
        )}
      </div>

      {editStation && (
        <StationEditor
          station={editStation}
          tracks={playable}
          playlists={playlists}
          onClose={() => setEditStation(null)}
          onSave={async st => {
            if (st.id) await radioAction({ action: 'update', id: st.id, station: st });
            else await radioAction({ action: 'create', station: st });
            setEditStation(null);
            setTab('stations');
            setDetail(null);
          }}
        />
      )}
      {editTrack && <TrackEditor track={editTrack} genres={[...genres.keys()]} onClose={() => setEditTrack(null)} onSaved={() => { setEditTrack(null); onRefresh(); }} />}
      {editPlaylist && (
        <PlaylistEditor
          playlist={editPlaylist}
          onClose={() => setEditPlaylist(null)}
          onSaved={pl => {
            setEditPlaylist(null);
            onRefresh();
            if (pl) setDetail({ kind: 'playlist', key: pl.id, title: pl.name });
          }}
        />
      )}
    </div>
  );
};

function group(tracks: Track[], key: (t: Track) => string): Map<string, Track[]> {
  const m = new Map<string, Track[]>();
  for (const t of tracks) {
    const k = key(t);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(t);
  }
  return m;
}

const Tile: React.FC<{ title: string; subtitle?: string; art?: string; round?: boolean; onOpen: () => void; onPlay: () => void }> = ({
  title,
  subtitle,
  art,
  round,
  onOpen,
  onPlay
}) => (
  <div className="group cursor-pointer" onClick={onOpen}>
    <Art src={art} title={title} className={`aspect-square shadow-lg ${round ? 'rounded-full' : 'rounded-2xl'}`}>
      <button
        onClick={e => {
          e.stopPropagation();
          onPlay();
        }}
        className="absolute bottom-2 right-2 w-11 h-11 rounded-full bg-[var(--spot-accent)] text-black flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-xl"
        title="Play"
      >
        <Play className="w-5 h-5 fill-current ml-0.5" />
      </button>
    </Art>
    <div className={`mt-2 ${round ? 'text-center' : ''}`}>
      <div className="text-sm font-bold text-white truncate">{title}</div>
      {subtitle && <div className="text-xs text-zinc-500 truncate">{subtitle}</div>}
    </div>
  </div>
);

const TrackTable: React.FC<{
  tracks: Track[];
  currentId?: string;
  onPlay: (t: Track, list: Track[]) => void;
  menu: (t: Track) => ({ label: string; onClick: () => void; danger?: boolean } | null)[];
  onMove?: (from: number, to: number) => void;
  showGenre?: boolean;
}> = ({ tracks, currentId, onPlay, menu, onMove, showGenre }) => {
  if (!tracks.length) return <p className="text-sm text-zinc-500 py-6">Nothing here yet.</p>;
  return (
    <div className="rounded-2xl border border-[#1a323c]">
      {tracks.map((t, i) => (
        <div
          key={`${t.id}_${i}`}
          className={`group grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_4rem_auto] items-center gap-3 px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5 first:rounded-t-2xl last:rounded-b-2xl ${
            t.id === currentId ? 'bg-white/[0.06]' : ''
          }`}
        >
          <button onClick={() => onPlay(t, tracks)} className="relative w-8 h-8 flex items-center justify-center text-xs font-mono text-zinc-500" title="Play">
            <span className={`group-hover:opacity-0 ${t.id === currentId ? 'text-[var(--spot-accent)]' : ''}`}>{i + 1}</span>
            <Play className="w-4 h-4 fill-current text-white absolute opacity-0 group-hover:opacity-100" />
          </button>
          <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => onPlay(t, tracks)} title="Play">
            <img src={t.coverArt} alt="" className="w-9 h-9 rounded object-cover shrink-0" loading="lazy" />
            <div className="min-w-0">
              <div className={`text-sm truncate ${t.id === currentId ? 'text-[var(--spot-accent)] font-bold' : 'text-white'}`}>{t.title}</div>
              <div className="text-xs text-zinc-500 truncate">{t.artist}</div>
            </div>
          </div>
          <div className="hidden md:block text-xs text-zinc-400 truncate">{t.album || '—'}</div>
          <div className="hidden md:block text-xs text-zinc-500 truncate">{showGenre ? t.genre : `${t.plays} plays`}</div>
          <div className="hidden md:block text-xs font-mono text-zinc-400 text-right">{t.duration ? fmtTime(t.duration) : '…'}</div>
          <div className="flex items-center">
            {onMove && (
              <span className="hidden group-hover:flex">
                <button disabled={i === 0} onClick={() => onMove(i, i - 1)} className="p-1 text-zinc-500 hover:text-white disabled:opacity-20" title="Move up">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button disabled={i === tracks.length - 1} onClick={() => onMove(i, i + 1)} className="p-1 text-zinc-500 hover:text-white disabled:opacity-20" title="Move down">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            <Menu items={menu(t)} />
          </div>
        </div>
      ))}
    </div>
  );
};

const StationEditor: React.FC<{
  station: Partial<RadioStation>;
  tracks: Track[];
  playlists: Playlist[];
  onClose: () => void;
  onSave: (s: Partial<RadioStation>) => void;
}> = ({ station, tracks, playlists, onClose, onSave }) => {
  const [s, setS] = useState<Partial<RadioStation>>({ shuffle: true, source: { type: 'all' }, ...station });
  const type = s.source?.type || 'all';
  const options =
    type === 'genre'
      ? [...new Set(tracks.map(t => t.genre))]
      : type === 'artist'
      ? [...new Set(tracks.map(t => t.artist))]
      : type === 'album'
      ? [...new Set(tracks.map(t => t.album).filter(Boolean) as string[])]
      : [];
  const preview = stationTrackList({ ...(s as RadioStation), source: s.source || { type: 'all' } }, tracks, playlists);
  return (
    <Modal
      open
      onClose={onClose}
      title={s.id ? 'Edit station' : 'New radio station'}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!s.name?.trim()} onClick={() => onSave(s)}>
            Save station
          </Btn>
        </>
      }
    >
      <Field label="Station name">
        <input className={inputCls} value={s.name || ''} onChange={e => setS({ ...s, name: e.target.value })} placeholder="Midnight Drive FM" autoFocus />
      </Field>
      <Field label="Tagline">
        <input className={inputCls} value={s.tagline || ''} onChange={e => setS({ ...s, tagline: e.target.value })} placeholder="Outrun until sunrise" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plays from">
          <select
            className={inputCls}
            value={type}
            onChange={e => setS({ ...s, source: { type: e.target.value as StationSourceType, value: undefined } })}
          >
            <option value="all">Whole library</option>
            <option value="genre">A genre</option>
            <option value="artist">An artist</option>
            <option value="album">An album</option>
            <option value="playlist">A playlist</option>
          </select>
        </Field>
        {type !== 'all' && (
          <Field label="Which one">
            <select className={inputCls} value={s.source?.value || ''} onChange={e => setS({ ...s, source: { type, value: e.target.value } })}>
              <option value="">Choose…</option>
              {type === 'playlist'
                ? playlists.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                : options.sort().map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
            </select>
          </Field>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={!!s.shuffle} onChange={e => setS({ ...s, shuffle: e.target.checked })} className="accent-[var(--spot-accent)]" />
        Shuffle the running order each time it goes on air
      </label>
      <ImagePicker value={s.cover} onChange={url => setS({ ...s, cover: url || undefined })} label="Station artwork (optional)" />
      <p className="text-xs text-zinc-500">
        {preview.length} songs · {fmtDuration(preview.reduce((a, t) => a + t.duration, 0))} before it loops.
        {s.isLive && ' Changes to the source take effect next time it goes live.'}
      </p>
    </Modal>
  );
};

export const TrackEditor: React.FC<{ track: Track; genres: string[]; onClose: () => void; onSaved: () => void }> = ({ track, genres, onClose, onSaved }) => {
  const [t, setT] = useState<Partial<Track>>({ ...track });
  const [wholeAlbum, setWholeAlbum] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit song details"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={async () => {
              try {
                await api('/api/tracks', {
                  method: 'PATCH',
                  json: { id: track.id, title: t.title, artist: t.artist, album: t.album, genre: t.genre, year: t.year ? Number(t.year) : undefined, coverArt: t.coverArt, applyCoverToAlbum: wholeAlbum }
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
        <input className={inputCls} value={t.title || ''} onChange={e => setT({ ...t, title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Artist">
          <input className={inputCls} value={t.artist || ''} onChange={e => setT({ ...t, artist: e.target.value })} />
        </Field>
        <Field label="Album">
          <input className={inputCls} value={t.album || ''} onChange={e => setT({ ...t, album: e.target.value })} />
        </Field>
        <Field label="Genre">
          <input className={inputCls} list="genre-list" value={t.genre || ''} onChange={e => setT({ ...t, genre: e.target.value })} />
          <datalist id="genre-list">
            {genres.map(g => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field label="Year">
          <input className={inputCls} type="number" value={t.year || ''} onChange={e => setT({ ...t, year: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
      </div>
      <ImagePicker value={t.coverArt} onChange={url => setT({ ...t, coverArt: url })} label="Cover art" />
      {t.album?.trim() && (
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={wholeAlbum} onChange={e => setWholeAlbum(e.target.checked)} className="accent-[var(--spot-accent)]" />
          Use this cover for every song on “{t.album}”
        </label>
      )}
      {err && <p className="text-xs text-[#ff6b6b]">{err}</p>}
    </Modal>
  );
};

const PlaylistEditor: React.FC<{ playlist: Partial<Playlist>; onClose: () => void; onSaved: (p?: Playlist) => void }> = ({ playlist, onClose, onSaved }) => {
  const [p, setP] = useState<Partial<Playlist>>({ ...playlist });
  return (
    <Modal
      open
      onClose={onClose}
      title={p.id ? 'Edit playlist' : 'New playlist'}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={!p.name?.trim()}
            onClick={async () => {
              const r = p.id
                ? await api('/api/playlists', { method: 'PATCH', json: { id: p.id, name: p.name, description: p.description, cover: p.cover || '' } })
                : await api('/api/playlists', { method: 'POST', json: p });
              onSaved(r.playlist);
            }}
          >
            Save
          </Btn>
        </>
      }
    >
      <Field label="Name">
        <input className={inputCls} value={p.name || ''} onChange={e => setP({ ...p, name: e.target.value })} autoFocus />
      </Field>
      <Field label="Description">
        <textarea className={inputCls} rows={2} value={p.description || ''} onChange={e => setP({ ...p, description: e.target.value })} />
      </Field>
      <ImagePicker value={p.cover} onChange={url => setP({ ...p, cover: url })} label="Cover (optional)" />
      {!p.id && <p className="text-xs text-zinc-500">Add songs from any list with the ⋮ menu → “Add to playlist”.</p>}
    </Modal>
  );
};

