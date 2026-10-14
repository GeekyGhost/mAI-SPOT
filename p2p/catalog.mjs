// What this node shows to one friend: profile summary, the catalog their grants allow, live radio,
// and files. Everything is looked up by database id, never by a path a peer sends us.

import fs from 'node:fs';
import path from 'node:path';
import { readDb, CONTENT_DIR } from './store.mjs';
import { covers, stationTracks, listAlbums, summarize } from './access.mjs';

const THUMB_DIR = path.join(CONTENT_DIR, 'thumbnails');
const AUDIO_DIR = path.join(CONTENT_DIR, 'audio');
const VIDEO_DIR = path.join(CONTENT_DIR, 'video');
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp']);

const MIME = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp'
};
export const mimeFor = f => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

const fileOf = url => decodeURIComponent(String(url || '').split('/').pop() || '');
/** '/api/media/thumbnails/x.png' -> 'x.png' (only for our own thumbnails folder) */
export const thumbName = url => (String(url || '').startsWith('/api/media/thumbnails/') ? fileOf(url) : '');

/** Seconds of the current on-demand song, as reported by the browser (see node.setNowPlaying). */
export function nowPlayingPosition(np, now = Date.now()) {
  if (!np) return 0;
  return np.playing ? np.position + (now - np.at) / 1000 : np.position;
}

/**
 * The profile a friend sees. `grants` decides whether the picture reel and the live station show;
 * `extra.nowPlaying` is what this Spot is listening to (if the user shares that).
 */
export function profileSummary(grants, extra = {}) {
  const db = readDb() || {};
  const p = db.profile || {};
  const now = Date.now();
  const live = computeLive(db, now);
  const liveOk = live.live && live.station && covers(grants, 'station', live.station.id, now);
  const np = extra.nowPlaying;
  return {
    name: p.displayName || p.stationName || 'mAI Spot',
    handle: p.handle || '',
    bio: p.bio || '',
    mood: p.moodBlurb || '',
    status: p.statusMode || 'online',
    avatar: thumbName(p.avatar),
    banner: thumbName(p.banner),
    accent: db.theme?.primaryColor || '',
    pictures: covers(grants, 'reel', 'reel', now) ? (p.pictureReel || []).map(thumbName).filter(Boolean) : [],
    live: liveOk ? { station: live.station.name, track: `${live.track?.title} — ${live.track?.artist}`, cover: live.track?.cover || '' } : null,
    nowPlaying: np
      ? { id: np.id, title: np.title, artist: np.artist, cover: np.cover, duration: np.duration, playing: np.playing, position: nowPlayingPosition(np, now), at: now }
      : null,
    access: grants ? summarize(grants) : '',
    // Kept for older Spots that still read the coarse flags.
    sharing: grants
      ? {
          music: Object.keys(grants).some(k => k.startsWith('station:') || k.startsWith('playlist:')),
          videos: Object.keys(grants).some(k => k.startsWith('channel:') || k.startsWith('collection:')),
          radio: Object.keys(grants).some(k => k.startsWith('station:')),
          pictures: !!grants.reel
        }
      : {}
  };
}

const trackView = t => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, genre: t.genre, duration: t.duration, cover: thumbName(t.coverArt) });
const videoView = v => ({
  id: v.id, title: v.title, genre: v.genre, duration: v.duration, thumbnail: thumbName(v.thumbnail),
  channelId: v.channelId, channelName: v.channelName, description: v.description, year: v.year
});

/** What one friend may browse, according to their grants. `until` marks temporary access. */
export function catalog(grants, extra = {}) {
  const db = readDb() || {};
  const now = Date.now();
  const tracks = new Map();
  const videos = new Map();
  const untilOf = g => (g?.until ? g.until : undefined);

  const stations = [];
  for (const st of db.stations || []) {
    const g = covers(grants, 'station', st.id, now);
    if (!g) continue;
    const list = stationTracks(db, st);
    list.forEach(t => tracks.set(t.id, t));
    stations.push({ id: st.id, name: st.name, tagline: st.tagline, cover: thumbName(st.cover), live: !!st.isLive, trackIds: list.map(t => t.id), until: untilOf(g) });
  }
  const playlists = [];
  for (const pl of db.playlists || []) {
    const g = covers(grants, 'playlist', pl.id, now);
    if (!g) continue;
    const ids = pl.trackIds.filter(id => (db.tracks || []).some(t => t.id === id && t.duration > 0));
    ids.forEach(id => tracks.set(id, db.tracks.find(t => t.id === id)));
    playlists.push({ id: pl.id, name: pl.name, description: pl.description, cover: thumbName(pl.cover), trackIds: ids, until: untilOf(g) });
  }

  const channels = [];
  for (const c of db.channels || []) {
    const g = covers(grants, 'channel', c.id, now);
    if (!g) continue;
    const vids = (db.videos || []).filter(v => v.channelId === c.id);
    vids.forEach(v => videos.set(v.id, v));
    channels.push({ id: c.id, name: c.channelName, description: c.description, avatar: thumbName(c.avatar), banner: thumbName(c.banner), videoIds: vids.map(v => v.id), until: untilOf(g) });
  }
  const collections = [];
  for (const c of db.collections || []) {
    const g = covers(grants, 'collection', c.id, now);
    if (!g) continue;
    const vids = c.videoIds.map(id => (db.videos || []).find(v => v.id === id)).filter(Boolean);
    vids.forEach(v => videos.set(v.id, v));
    collections.push({ id: c.id, name: c.name, description: c.description, cover: thumbName(c.cover), videoIds: vids.map(v => v.id), until: untilOf(g) });
  }

  const albums = [];
  for (const a of listAlbums()) {
    const g = covers(grants, 'album', a.id, now);
    if (g) albums.push({ id: a.id, name: a.name, files: a.files.slice(0, 2000), until: untilOf(g) });
  }

  const apps = [];
  for (const x of db.games || []) {
    const g = covers(grants, 'app', x.id, now);
    if (!g || !x.slug) continue;
    apps.push({
      id: x.id, slug: x.slug, kind: x.kind || 'game', title: x.title, description: x.description, genre: x.genre, category: x.category,
      controlsHelp: x.controlsHelp, entryPoint: x.entryPoint, thumbnail: thumbName(x.thumbnail), until: untilOf(g)
    });
  }

  const books = [];
  for (const b of db.books || []) {
    const g = covers(grants, 'book', b.id, now);
    if (!g) continue;
    books.push({
      id: b.id, kind: b.kind, format: b.format, title: b.title, author: b.author, series: b.series, issue: b.issue,
      genre: b.genre, description: b.description, cover: thumbName(b.cover), pageCount: b.pageCount, sizeBytes: b.sizeBytes, until: untilOf(g)
    });
  }

  return {
    profile: profileSummary(grants, extra),
    stations,
    playlists,
    tracks: [...tracks.values()].map(trackView),
    channels,
    collections,
    videos: [...videos.values()].map(videoView),
    albums,
    apps,
    books
  };
}

/** Thumbnail names a friend may fetch: covers of what they can see, plus profile pictures and posts. */
export function visibleThumbs(grants, posts, extra = {}) {
  const db = readDb() || {};
  const c = catalog(grants, extra);
  const set = new Set();
  const add = n => n && set.add(n);
  add(thumbName(db.profile?.avatar));
  add(thumbName(db.profile?.banner));
  c.profile.pictures.forEach(add);
  add(c.profile.nowPlaying?.cover);
  c.stations.forEach(s => add(s.cover));
  c.playlists.forEach(p => add(p.cover));
  c.tracks.forEach(t => add(t.cover));
  c.channels.forEach(ch => (add(ch.avatar), add(ch.banner)));
  c.collections.forEach(x => add(x.cover));
  c.videos.forEach(v => add(v.thumbnail));
  c.apps.forEach(a => add(a.thumbnail));
  c.books.forEach(b => add(b.cover));
  const live = computeLive(db, Date.now());
  if (live.live) {
    add(live.track?.cover);
    add(live.station?.cover);
    (live.upNext || []).forEach(u => add(u.cover));
  }
  for (const p of posts || []) {
    add(p.image);
    add(p.media?.cover);
  }
  for (const x of extra.partyCovers || []) add(x);
  return set;
}

/** Resolve a track/video file by id. Access is checked by the caller. */
export function resolveFile(kind, id) {
  const db = readDb() || {};
  if (kind === 'track') {
    const t = (db.tracks || []).find(x => x.id === id);
    if (!t) throw new Error('Not found');
    return path.join(AUDIO_DIR, path.basename(fileOf(t.filePath)));
  }
  if (kind === 'video') {
    const v = (db.videos || []).find(x => x.id === id);
    if (!v) throw new Error('Not found');
    return path.join(VIDEO_DIR, path.basename(fileOf(v.filePath)));
  }
  throw new Error('Unknown kind');
}

export function resolveThumb(name) {
  const base = path.basename(String(name || ''));
  if (!base || !IMAGE_EXT.has(path.extname(base).toLowerCase())) throw new Error('Not an image');
  const full = path.join(THUMB_DIR, base);
  if (!fs.existsSync(full)) throw new Error('Not found');
  return full;
}

/** Same arithmetic as src/lib/radio.ts — the broadcast position comes from the wall clock. */
export function computeLive(db, now) {
  const base = { live: false, serverTime: now, hostName: db?.profile?.stationName };
  const st = (db?.stations || []).find(s => s.isLive);
  if (!st || !st.liveSince || !st.order?.length) return base;
  const tracks = st.order.map(id => (db.tracks || []).find(t => t.id === id)).filter(t => t && t.duration > 0);
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
    .filter(k => k < tracks.length)
    .map(k => tracks[(i + k) % tracks.length])
    .map(t => ({ id: t.id, title: t.title, artist: t.artist, cover: thumbName(t.coverArt), duration: t.duration }));
  return {
    live: true,
    station: { id: st.id, name: st.name, tagline: st.tagline, cover: thumbName(st.cover) },
    track: { id: cur.id, title: cur.title, artist: cur.artist, album: cur.album, cover: thumbName(cur.coverArt), duration: cur.duration, genre: cur.genre },
    offset: elapsed,
    serverTime: now,
    upNext,
    hostName: db?.profile?.stationName
  };
}

export function fileStat(full) {
  const st = fs.statSync(full);
  if (!st.isFile()) throw new Error('Not found');
  return st;
}
