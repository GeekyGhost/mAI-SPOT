import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeWebStream } from 'stream/web';
import {
  AUDIO_DIR, VIDEO_DIR, THUMB_DIR, BOOKS_DIR, INCOMING_DIR, PICTURES_DIR,
  AUDIO_EXT, VIDEO_EXT, IMAGE_EXT, BOOK_EXT,
  ensureDirs, safeFileName, uniqueName
} from '@/lib/paths';
import { getDatabase, saveDatabase } from '@/lib/db';
import { buildTrack, buildVideo } from '@/lib/media';
import { importBookFile } from '@/lib/books';
import { installApp } from '@/lib/apps';
import { importModel, MAX_MODEL_ZIP } from '@/lib/models';
import { ok, fail, pendingFiles } from '@/lib/api';
import { albumDir, pictureUrl, LOOSE_ALBUM } from '@/lib/pictures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: Record<string, { dir?: string; ext: string[] }> = {
  audio: { dir: AUDIO_DIR, ext: AUDIO_EXT },
  video: { dir: VIDEO_DIR, ext: VIDEO_EXT },
  thumbnail: { dir: THUMB_DIR, ext: IMAGE_EXT },
  book: { dir: BOOKS_DIR, ext: BOOK_EXT },
  app: { ext: ['.zip', '.html', '.htm'] },
  model: { ext: ['.zip'] },
  picture: { dir: PICTURES_DIR, ext: IMAGE_EXT.filter(e => e !== '.svg') }
};

function moveFile(from: string, to: string) {
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

/**
 * Streaming upload: the request body is the raw file (no multipart), written straight to disk,
 * so multi-GB movies don't have to fit in memory.
 *   POST /api/upload?kind=audio|video|thumbnail|book|app|picture|model&name=<original file name>[&album=<id>]
 *   header x-meta: encodeURIComponent(JSON) with optional title/artist/genre/etc.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') || '';
  const originalName = url.searchParams.get('name') || 'upload';
  const spec = KINDS[kind];
  if (!spec) return fail('Unknown upload kind');
  const ext = path.extname(originalName).toLowerCase();
  if (!spec.ext.includes(ext)) return fail(`${ext || 'That file type'} isn't supported for ${kind}. Use: ${spec.ext.join(', ')}`);
  if (!request.body) return fail('Empty upload');
  if (kind === 'model' && Number(request.headers.get('content-length') || 0) > MAX_MODEL_ZIP) return fail('Model ZIPs may be at most 256 MB', 413);

  let meta: Record<string, any> = {};
  try {
    const raw = request.headers.get('x-meta');
    if (raw) meta = JSON.parse(decodeURIComponent(raw));
  } catch {
    return fail('Bad metadata header');
  }

  ensureDirs();
  const tmp = path.join(INCOMING_DIR, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  try {
    const source = Readable.fromWeb(request.body as unknown as NodeWebStream);
    if (kind === 'model') {
      let received = 0;
      const limit = new Transform({ transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(received > MAX_MODEL_ZIP ? Object.assign(new Error('Model ZIPs may be at most 256 MB'), { code: 'MODEL_TOO_LARGE' }) : null, chunk);
      } });
      await pipeline(source, limit, fs.createWriteStream(tmp));
    } else await pipeline(source, fs.createWriteStream(tmp));
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    return fail(`Upload interrupted: ${(e as Error).message}`, (e as NodeJS.ErrnoException).code === 'MODEL_TOO_LARGE' ? 413 : 500);
  }

  if (kind === 'model') {
    try { return ok({ item: await importModel(tmp, originalName, meta), type: 'model' }); }
    catch (error) { return fail(error); }
    finally { try { fs.unlinkSync(tmp); } catch {} }
  }

  if (kind === 'app') {
    try {
      const game = await installApp(tmp, originalName, meta);
      return ok({ item: game, type: 'app' });
    } catch (e) {
      return fail(e);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }

  if (kind === 'picture') {
    const album = url.searchParams.get('album') || LOOSE_ALBUM;
    const dir = albumDir(album);
    if (!dir || !fs.existsSync(dir)) {
      try { fs.unlinkSync(tmp); } catch {}
      return fail('That album doesn’t exist.');
    }
    const name = uniqueName(dir, safeFileName(originalName));
    moveFile(tmp, path.join(dir, name));
    return ok({ url: pictureUrl(album, name), thumb: pictureUrl(album, name, 'thumb'), name, album, type: 'picture' });
  }

  const finalName = uniqueName(spec.dir!, safeFileName(originalName));
  const dest = path.join(spec.dir!, finalName);
  pendingFiles.add(finalName);
  try {
    moveFile(tmp, dest);

    if (kind === 'thumbnail') {
      return ok({ url: `/api/media/thumbnails/${encodeURIComponent(finalName)}` });
    }

    if (kind === 'audio') {
      const track = await buildTrack(finalName, meta);
      const db = getDatabase();
      db.tracks.unshift(track);
      if (meta.playlistId) {
        const pl = db.playlists.find(p => p.id === meta.playlistId);
        if (pl) pl.trackIds.push(track.id);
      }
      saveDatabase(db);
      return ok({ item: track, type: 'audio' });
    }

    if (kind === 'video') {
      const db0 = getDatabase();
      const video = await buildVideo(db0, finalName, meta);
      const db = getDatabase();
      db.videos.unshift(video);
      if (video.genre && !db.genres.includes(video.genre)) db.genres.push(video.genre);
      for (const cid of (meta.collectionIds as string[]) || []) {
        const col = db.collections.find(c => c.id === cid);
        if (col && !col.videoIds.includes(video.id)) col.videoIds.push(video.id);
      }
      saveDatabase(db);
      return ok({ item: video, type: 'video' });
    }

    // book
    const allowed = ['title', 'author', 'genre', 'kind', 'series', 'issue', 'description'];
    const bookMeta = Object.fromEntries(Object.entries(meta).filter(([k]) => allowed.includes(k)));
    const book = await importBookFile(finalName, bookMeta);
    return ok({ item: book, type: 'book' });
  } catch (e) {
    return fail(e, 500);
  } finally {
    pendingFiles.delete(finalName);
  }
}
