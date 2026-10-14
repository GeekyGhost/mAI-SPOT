import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseFile } from 'music-metadata';
import {
  AUDIO_DIR,
  VIDEO_DIR,
  THUMB_DIR,
  BOOKS_DIR,
  AUDIO_EXT,
  VIDEO_EXT,
  BOOK_EXT,
  ensureDirs,
  prettifyFileName
} from './paths';
import { getDatabase, saveDatabase, newId } from './db';
import type { Track, Video, DatabaseSchema } from './types';
import { importBookFile } from './books';
import { syncApps } from './apps';
import { pendingFiles } from './api';

export interface AudioProbe {
  duration: number;
  kbps: number;
  khz: number;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  trackNo?: number;
  coverArt?: string;
}

/** Save embedded cover art once (deduped by content hash) and return its URL. */
function saveCover(data: Uint8Array, format: string): string | undefined {
  try {
    const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 16);
    const ext = format.includes('png') ? '.png' : format.includes('webp') ? '.webp' : '.jpg';
    const name = `cover_${hash}${ext}`;
    const full = path.join(THUMB_DIR, name);
    if (!fs.existsSync(full)) fs.writeFileSync(full, data);
    return `/api/media/thumbnails/${name}`;
  } catch {
    return undefined;
  }
}

export async function probeMedia(file: string): Promise<AudioProbe | null> {
  try {
    const meta = await parseFile(file, { duration: true });
    const c = meta.common;
    const pic = c.picture?.[0];
    return {
      duration: Math.round((meta.format.duration || 0) * 10) / 10,
      kbps: meta.format.bitrate ? Math.round(meta.format.bitrate / 1000) : 0,
      khz: meta.format.sampleRate ? Math.round(meta.format.sampleRate / 100) / 10 : 0,
      title: c.title?.trim() || undefined,
      artist: (c.artist || c.albumartist)?.trim() || undefined,
      album: c.album?.trim() || undefined,
      genre: c.genre?.[0]?.trim() || undefined,
      year: c.year || undefined,
      trackNo: c.track?.no || undefined,
      coverArt: pic ? saveCover(pic.data, pic.format) : undefined
    };
  } catch (e) {
    console.warn('[mAI Spot] could not read metadata for', path.basename(file), (e as Error).message);
    return null;
  }
}

const fileOf = (url: string) => decodeURIComponent(url.split('/').pop() || '');

/** Build a Track for a file already sitting in content/audio. Overrides win over tags. */
export async function buildTrack(fileName: string, overrides: Partial<Track> = {}): Promise<Track> {
  const probe = await probeMedia(path.join(AUDIO_DIR, fileName));
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return {
    id: newId('track'),
    title: clean(overrides.title) || probe?.title || prettifyFileName(fileName),
    artist: clean(overrides.artist) || probe?.artist || 'Unknown Artist',
    album: clean(overrides.album) || probe?.album,
    year: overrides.year || probe?.year,
    trackNo: probe?.trackNo,
    channelId: overrides.channelId || 'chan_my_station',
    genre: clean(overrides.genre) || probe?.genre || 'Unsorted',
    duration: probe?.duration || 0,
    filePath: `/api/media/audio/${encodeURIComponent(fileName)}`,
    coverArt: clean(overrides.coverArt) || probe?.coverArt || '/api/media/thumbnails/avatar_user.svg',
    kbps: probe?.kbps || 0,
    khz: probe?.khz || 0,
    plays: 0,
    createdAt: new Date().toISOString(),
    probed: !!probe
  };
}

export async function buildVideo(db: DatabaseSchema, fileName: string, overrides: Partial<Video> = {}): Promise<Video> {
  const probe = await probeMedia(path.join(VIDEO_DIR, fileName));
  const channelId = overrides.channelId || 'chan_my_station';
  const channel = db.channels.find(c => c.id === channelId);
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return {
    id: newId('vid'),
    title: clean(overrides.title) || probe?.title || prettifyFileName(fileName),
    channelId,
    channelName: channel?.channelName || 'My Channel',
    genre: clean(overrides.genre) || 'Unsorted',
    duration: probe?.duration || 0,
    filePath: `/api/media/video/${encodeURIComponent(fileName)}`,
    // Empty thumbnail = the Cinema grabs a frame in the browser and saves it.
    thumbnail: clean(overrides.thumbnail) || '',
    views: 0,
    createdAt: new Date().toISOString(),
    description: overrides.description || '',
    year: overrides.year,
    probed: !!probe
  };
}

const g = globalThis as unknown as { __maispotSync?: { running?: Promise<SyncReport>; last: number } };
g.__maispotSync ||= { last: 0 };

export interface SyncReport {
  addedTracks: number;
  addedVideos: number;
  addedBooks: number;
  addedApps: number;
  removed: number;
  probed: number;
}

/**
 * Reconcile the database with what's actually on disk:
 *  - files dropped into content/* get imported (tags, durations, covers)
 *  - entries whose file was deleted are removed
 *  - old entries with placeholder durations get their real duration
 * Cheap when nothing changed (one readdir per folder); throttled to every few seconds.
 */
export async function syncLibrary(force = false): Promise<SyncReport> {
  const state = g.__maispotSync!;
  if (state.running) return state.running;
  if (!force && Date.now() - state.last < 4000) {
    return { addedTracks: 0, addedVideos: 0, addedBooks: 0, addedApps: 0, removed: 0, probed: 0 };
  }
  state.running = runSync().finally(() => {
    state.running = undefined;
    state.last = Date.now();
  });
  return state.running;
}

async function runSync(): Promise<SyncReport> {
  ensureDirs();
  const report: SyncReport = { addedTracks: 0, addedVideos: 0, addedBooks: 0, addedApps: 0, removed: 0, probed: 0 };
  const listFiles = (dir: string, exts: string[]) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => !f.startsWith('.') && !pendingFiles.has(f) && exts.includes(path.extname(f).toLowerCase()))
      : [];

  const audioFiles = listFiles(AUDIO_DIR, AUDIO_EXT);
  const videoFiles = listFiles(VIDEO_DIR, VIDEO_EXT);
  const bookFiles = listFiles(BOOKS_DIR, BOOK_EXT);

  // Work out what to change against a snapshot, do the slow probing, then apply in one write.
  const snap = getDatabase();
  const knownAudio = new Set(snap.tracks.map(t => fileOf(t.filePath)));
  const knownVideo = new Set(snap.videos.map(v => fileOf(v.filePath)));
  const knownBooks = new Set(snap.books.map(b => b.fileName));

  const newTracks: Track[] = [];
  for (const f of audioFiles) if (!knownAudio.has(f)) newTracks.push(await buildTrack(f));
  const newVideos: Video[] = [];
  for (const f of videoFiles) if (!knownVideo.has(f)) newVideos.push(await buildVideo(snap, f));

  const trackFixes = new Map<string, Partial<Track>>();
  for (const t of snap.tracks) {
    const f = fileOf(t.filePath);
    if (!t.probed && audioFiles.includes(f)) {
      const p = await probeMedia(path.join(AUDIO_DIR, f));
      trackFixes.set(t.id, p ? { duration: p.duration || t.duration, kbps: p.kbps || t.kbps, khz: p.khz || t.khz, probed: true } : { probed: true });
    }
  }
  const videoFixes = new Map<string, Partial<Video>>();
  for (const v of snap.videos) {
    const f = fileOf(v.filePath);
    if (!v.probed && videoFiles.includes(f)) {
      const p = await probeMedia(path.join(VIDEO_DIR, f));
      videoFixes.set(v.id, p ? { duration: p.duration || v.duration, probed: true } : { probed: true });
    }
  }

  const changed =
    newTracks.length || newVideos.length || trackFixes.size || videoFixes.size ||
    snap.tracks.some(t => !audioFiles.includes(fileOf(t.filePath))) ||
    snap.videos.some(v => !videoFiles.includes(fileOf(v.filePath))) ||
    snap.books.some(b => !bookFiles.includes(b.fileName));

  if (changed) {
    const db = getDatabase(); // re-read: user may have edited during probing
    // Check the disk again rather than trusting the listing above (an upload may have landed meanwhile).
    const missing = (dir: string, f: string) => !fs.existsSync(path.join(dir, f));
    const goneTracks = db.tracks.filter(t => missing(AUDIO_DIR, fileOf(t.filePath))).map(t => t.id);
    const goneVideos = db.videos.filter(v => missing(VIDEO_DIR, fileOf(v.filePath))).map(v => v.id);
    const goneBooks = db.books.filter(b => missing(BOOKS_DIR, b.fileName)).map(b => b.id);
    report.removed = goneTracks.length + goneVideos.length + goneBooks.length;

    db.tracks = db.tracks.filter(t => !goneTracks.includes(t.id));
    db.videos = db.videos.filter(v => !goneVideos.includes(v.id));
    db.books = db.books.filter(b => !goneBooks.includes(b.id));
    db.playlists.forEach(p => (p.trackIds = p.trackIds.filter(id => !goneTracks.includes(id))));
    db.collections.forEach(c => (c.videoIds = c.videoIds.filter(id => !goneVideos.includes(id))));
    goneVideos.forEach(id => delete db.watchProgress[id]);

    for (const t of db.tracks) {
      const fix = trackFixes.get(t.id);
      if (fix) { Object.assign(t, fix); report.probed++; }
    }
    for (const v of db.videos) {
      const fix = videoFixes.get(v.id);
      if (fix) { Object.assign(v, fix); report.probed++; }
    }
    const haveAudio = new Set(db.tracks.map(t => fileOf(t.filePath)));
    for (const t of newTracks) if (!haveAudio.has(fileOf(t.filePath))) { db.tracks.unshift(t); report.addedTracks++; }
    const haveVideo = new Set(db.videos.map(v => fileOf(v.filePath)));
    for (const v of newVideos) if (!haveVideo.has(fileOf(v.filePath))) { db.videos.unshift(v); report.addedVideos++; }
    saveDatabase(db);
  }

  // Books (EPUB/comic parsing writes covers; done one at a time).
  for (const f of bookFiles) {
    if (!knownBooks.has(f)) {
      try {
        await importBookFile(f);
        report.addedBooks++;
      } catch (e) {
        console.warn('[mAI Spot] could not import book', f, (e as Error).message);
      }
    }
  }

  report.addedApps = syncApps();

  if (Object.values(report).some(n => n > 0)) {
    console.log('[mAI Spot] library sync:', JSON.stringify(report));
  }
  return report;
}
