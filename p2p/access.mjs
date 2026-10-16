// Per-friend access control.
//
// Every friend has their own set of grants. A grant is a resource id, optionally with an expiry:
//   station:<id>  playlist:<id>  channel:<id>  collection:<id>  album:<id>  app:<id>  book:<id>  reel
// "<kind>:*" grants everything of that kind, including things added later.
// Nothing is visible to a friend unless a grant covers it. Expired grants stop working on the spot
// and are cleaned up by the node's sweep.

import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR } from './store.mjs';
import { listModels } from './models.mjs';

export const KINDS = ['station', 'playlist', 'channel', 'collection', 'album', 'app', 'book', 'model', 'reel'];
export const PICTURES_DIR = path.join(CONTENT_DIR, 'pictures');
export const LOOSE_ALBUM = '_loose';
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);

/** Everything, as a new friend's starting point (the user narrows it down per friend). */
export const EVERYTHING = ['station:*', 'playlist:*', 'channel:*', 'collection:*', 'album:*', 'app:*', 'book:*', 'model:*', 'reel'];

export function isResourceId(id) {
  if (id === 'reel') return true;
  const m = /^([a-z]+):(.+)$/.exec(String(id || ''));
  return !!m && KINDS.includes(m[1]) && m[2].length <= 200;
}

/** Normalise a grants object coming from the browser: { id: { until?: ms } }. */
export function cleanGrants(raw) {
  const out = {};
  if (Array.isArray(raw)) raw = Object.fromEntries(raw.map(id => [id, {}]));
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, g] of Object.entries(raw)) {
    if (!isResourceId(id)) continue;
    const until = Number(g?.until);
    out[id] = Number.isFinite(until) && until > 0 ? { until } : {};
  }
  return out;
}

const live = (g, now) => !!g && (!g.until || g.until > now);

/** Does this grant set cover a resource? Returns the grant (with its expiry) or null. */
export function covers(grants, kind, id, now = Date.now()) {
  if (!grants) return null;
  if (kind === 'reel') return live(grants.reel, now) ? grants.reel : null;
  const exact = grants[`${kind}:${id}`];
  if (live(exact, now)) return exact;
  const all = grants[`${kind}:*`];
  return live(all, now) ? all : null;
}

/** Remove expired grants. Returns true if anything was removed. */
export function sweep(grants, now = Date.now()) {
  let changed = false;
  for (const [id, g] of Object.entries(grants || {})) {
    if (g?.until && g.until <= now) {
      delete grants[id];
      changed = true;
    }
  }
  return changed;
}

// ───────────────────────── resolving what a grant means ─────────────────────────

export function stationTracks(db, st) {
  const playable = (db.tracks || []).filter(t => t.duration > 0);
  const v = String(st?.source?.value || '').toLowerCase();
  switch (st?.source?.type) {
    case 'genre':
      return playable.filter(t => String(t.genre).toLowerCase() === v);
    case 'artist':
      return playable.filter(t => String(t.artist).toLowerCase() === v);
    case 'album':
      return playable.filter(t => String(t.album || '').toLowerCase() === v);
    case 'playlist': {
      const pl = (db.playlists || []).find(p => p.id === st.source.value);
      return pl ? pl.trackIds.map(id => playable.find(t => t.id === id)).filter(Boolean) : [];
    }
    default:
      return playable;
  }
}

/** Picture albums are folders under content/pictures. Loose files in the root form one more album. */
export function listAlbums() {
  const albums = [];
  let entries = [];
  try {
    entries = fs.readdirSync(PICTURES_DIR, { withFileTypes: true });
  } catch {
    return albums;
  }
  const loose = entries.filter(e => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())).map(e => e.name);
  if (loose.length) albums.push({ id: LOOSE_ALBUM, name: 'Loose pictures', files: loose.sort() });
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    let files = [];
    try {
      files = fs
        .readdirSync(path.join(PICTURES_DIR, e.name), { withFileTypes: true })
        .filter(f => f.isFile() && IMAGE_EXT.has(path.extname(f.name).toLowerCase()))
        .map(f => f.name)
        .sort();
    } catch {}
    albums.push({ id: e.name, name: e.name, files });
  }
  return albums;
}

export function albumDir(id) {
  if (id === LOOSE_ALBUM) return PICTURES_DIR;
  const base = path.basename(String(id || ''));
  if (!base || base.startsWith('.') || base !== id) return null;
  return path.join(PICTURES_DIR, base);
}

/** Can this friend stream this track? (station/playlist grants, or shared in a post, or on air on a granted station) */
export function trackAllowed(db, grants, trackId, extra = {}) {
  const now = Date.now();
  if (extra.postedIds?.has(trackId) || extra.nowPlaying === trackId || extra.recentAlong?.includes(trackId)) return true;
  for (const st of db.stations || []) {
    if (!covers(grants, 'station', st.id, now)) continue;
    if (st.isLive && (st.order || []).includes(trackId)) return true;
    if (stationTracks(db, st).some(t => t.id === trackId)) return true;
  }
  for (const pl of db.playlists || []) {
    if (covers(grants, 'playlist', pl.id, now) && pl.trackIds.includes(trackId)) return true;
  }
  return false;
}

export function videoAllowed(db, grants, videoId, extra = {}) {
  const now = Date.now();
  if (extra.postedIds?.has(videoId) || extra.partyVideos?.has(videoId)) return true;
  const v = (db.videos || []).find(x => x.id === videoId);
  if (!v) return false;
  if (covers(grants, 'channel', v.channelId, now)) return true;
  return (db.collections || []).some(c => c.videoIds.includes(videoId) && covers(grants, 'collection', c.id, now));
}

/**
 * Everything the user could share, for the access picker in the browser.
 * Grouped by kind with a short description so the picker can show "12 songs", "3 videos", etc.
 */
export function shareables(db) {
  const albums = listAlbums();
  const vidCount = id => (db.videos || []).filter(v => v.channelId === id).length;
  return {
    station: (db.stations || []).map(s => ({ id: s.id, name: s.name, note: `${stationTracks(db, s).length} songs${s.isLive ? ' · on air' : ''}`, cover: s.cover || '' })),
    playlist: (db.playlists || []).map(p => ({ id: p.id, name: p.name, note: `${p.trackIds.length} songs`, cover: p.cover || '' })),
    channel: (db.channels || []).map(c => ({ id: c.id, name: c.channelName, note: `${vidCount(c.id)} videos`, cover: c.avatar || '' })),
    collection: (db.collections || []).map(c => ({ id: c.id, name: c.name, note: `${c.videoIds.length} videos`, cover: c.cover || '' })),
    album: albums.map(a => ({ id: a.id, name: a.name, note: `${a.files.length} pictures`, cover: a.files[0] ? pictureUrl(a.id, a.files[0], true) : '' })),
    app: (db.games || []).map(g => ({ id: g.id, name: g.title, note: (g.kind || 'game') === 'app' ? `App · ${g.category || 'Uncategorized'}` : `Game · ${g.genre}`, cover: g.thumbnail || '' })),
    book: (db.books || []).map(b => ({
      id: b.id,
      name: b.series && b.issue ? `${b.series} #${b.issue}` : b.title,
      note: `${b.kind === 'comic' ? 'Comic' : 'Book'} · ${String(b.format).toUpperCase()}`,
      cover: b.cover || '',
      group: b.kind === 'comic' && b.series ? b.series : undefined
    })),
    model: listModels().map(m => ({ id: m.id, name: m.title, note: `${m.formats.join(', ')} · ${m.fileCount} files`, cover: m.coverAsset?.kind === 'image' ? `${m.apiBase}/asset/${m.coverAsset.id}` : '' })),
    reel: [{ id: 'reel', name: 'Profile picture reel', note: `${(db.profile?.pictureReel || []).length} pictures`, cover: db.profile?.pictureReel?.[0] || '' }]
  };
}

export const pictureUrl = (album, file, thumb = false) =>
  `/api/pictures/${thumb ? 'thumb' : 'file'}/${encodeURIComponent(album)}/${encodeURIComponent(file)}`;

/** A one-line summary of a grant set, e.g. "3 stations · all videos · 1 album". */
export function summarize(grants) {
  const now = Date.now();
  const label = { station: 'station', playlist: 'playlist', channel: 'channel', collection: 'collection', album: 'album', app: 'game/app', book: 'book', model: 'model package' };
  const parts = [];
  for (const k of Object.keys(label)) {
    if (live(grants?.[`${k}:*`], now)) parts.push(`all ${label[k]}s`);
    else {
      const n = Object.entries(grants || {}).filter(([id, g]) => id.startsWith(`${k}:`) && live(g, now)).length;
      if (n) parts.push(`${n} ${label[k]}${n === 1 ? '' : 's'}`);
    }
  }
  if (live(grants?.reel, now)) parts.push('picture reel');
  return parts.join(' · ') || 'nothing yet';
}
