import type { DatabaseSchema, RadioStation, Track, LiveBroadcast } from './types';
import { getDatabase, saveDatabase } from './db';

/** The tracks a station draws from, in library order. */
export function stationTracks(db: DatabaseSchema, st: RadioStation): Track[] {
  const playable = db.tracks.filter(t => t.duration > 0);
  const v = st.source.value?.toLowerCase();
  switch (st.source.type) {
    case 'genre':
      return playable.filter(t => t.genre.toLowerCase() === v);
    case 'artist':
      return playable.filter(t => t.artist.toLowerCase() === v);
    case 'album':
      return playable.filter(t => (t.album || '').toLowerCase() === v);
    case 'playlist': {
      const pl = db.playlists.find(p => p.id === st.source.value);
      if (!pl) return [];
      return pl.trackIds.map(id => playable.find(t => t.id === id)).filter((t): t is Track => !!t);
    }
    default:
      return playable;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Put a station on air. Only one station broadcasts at a time. The running order is frozen
 * now; from then on "what's playing" is pure arithmetic on the wall clock, so every listener
 * hears the same thing and the broadcast picks up where it should after a restart.
 */
export function goLive(stationId: string): RadioStation | null {
  const db = getDatabase();
  const st = db.stations.find(s => s.id === stationId);
  if (!st) return null;
  const tracks = stationTracks(db, st);
  if (tracks.length === 0) throw new Error('This station has no playable tracks yet.');
  db.stations.forEach(s => {
    s.isLive = false;
  });
  st.isLive = true;
  st.liveSince = new Date().toISOString();
  st.order = (st.shuffle ? shuffle(tracks) : tracks).map(t => t.id);
  saveDatabase(db);
  return st;
}

export function goOffAir(): void {
  const db = getDatabase();
  db.stations.forEach(s => {
    s.isLive = false;
    s.liveSince = undefined;
  });
  saveDatabase(db);
}

/** Skip ahead by shifting the start time so the next track begins now. */
export function skipLive(): void {
  const db = getDatabase();
  const st = db.stations.find(s => s.isLive);
  if (!st || !st.liveSince) return;
  const live = computeLive(db, Date.now());
  if (!live.live || live.offset === undefined || !live.track) return;
  const remaining = live.track.duration - live.offset;
  st.liveSince = new Date(new Date(st.liveSince).getTime() - remaining * 1000).toISOString();
  saveDatabase(db);
}

export function computeLive(db: DatabaseSchema, now: number): LiveBroadcast {
  const st = db.stations.find(s => s.isLive);
  const base: LiveBroadcast = { live: false, serverTime: now, hostName: db.profile.stationName };
  if (!st || !st.liveSince || !st.order?.length) return base;

  const tracks = st.order
    .map(id => db.tracks.find(t => t.id === id))
    .filter((t): t is Track => !!t && t.duration > 0);
  const total = tracks.reduce((s, t) => s + t.duration, 0);
  if (!tracks.length || total <= 0) return base;

  let elapsed = ((now - new Date(st.liveSince).getTime()) / 1000) % total;
  if (elapsed < 0) elapsed += total;
  let i = 0;
  while (elapsed >= tracks[i].duration) {
    elapsed -= tracks[i].duration;
    i = (i + 1) % tracks.length;
  }
  const cur = tracks[i];
  const upNext = [1, 2, 3]
    .map(k => tracks[(i + k) % tracks.length])
    .filter((t, idx, arr) => tracks.length > idx + 1 && arr.indexOf(t) === idx)
    .map(t => ({ id: t.id, title: t.title, artist: t.artist, coverArt: t.coverArt, duration: t.duration }));

  return {
    live: true,
    station: { id: st.id, name: st.name, tagline: st.tagline, cover: st.cover },
    track: {
      id: cur.id,
      title: cur.title,
      artist: cur.artist,
      album: cur.album,
      coverArt: cur.coverArt,
      filePath: cur.filePath,
      duration: cur.duration,
      genre: cur.genre
    },
    offset: elapsed,
    serverTime: now,
    upNext,
    listeners: countListeners(),
    hostName: db.profile.stationName
  };
}

/** Track ids that remote listeners are allowed to stream (the live running order). */
export function liveTrackFiles(db: DatabaseSchema): Set<string> {
  const st = db.stations.find(s => s.isLive);
  const out = new Set<string>();
  if (!st?.order) return out;
  for (const id of st.order) {
    const t = db.tracks.find(x => x.id === id);
    if (t) out.add(decodeURIComponent(t.filePath.split('/').pop() || ''));
  }
  return out;
}

// Listener heartbeat (in memory; resets when the node restarts).
const g = globalThis as unknown as { __maispotListeners?: Map<string, number> };
g.__maispotListeners ||= new Map();

export function heartbeat(listenerId: string) {
  if (listenerId && listenerId.length < 64) g.__maispotListeners!.set(listenerId, Date.now());
}

export function countListeners(): number {
  const cutoff = Date.now() - 45_000;
  let n = 0;
  for (const [id, t] of g.__maispotListeners!) {
    if (t < cutoff) g.__maispotListeners!.delete(id);
    else n++;
  }
  return n;
}
