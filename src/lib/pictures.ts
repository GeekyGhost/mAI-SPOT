import fs from 'fs';
import path from 'path';
import { PICTURES_DIR, PICTURE_THUMBS_DIR, IMAGE_EXT, safeFileName } from './paths';

// Picture albums are plain folders under content/pictures. Drop a folder of photos in there and it's an
// album. Pictures sitting directly in content/pictures form the "Loose pictures" album.
// Small previews are made by the browser (see Gallery) and kept in content/pictures/.thumbs.

export const LOOSE_ALBUM = '_loose';
const RASTER = new Set(IMAGE_EXT.filter(e => e !== '.svg'));

export interface Picture {
  name: string;
  url: string;
  thumb: string;
  hasThumb: boolean;
  size: number;
  mtime: number;
}

export interface Album {
  id: string;
  name: string;
  count: number;
  cover: string;
  covers: string[];
  updatedAt: number;
  sizeBytes: number;
}

export const pictureUrl = (album: string, file: string, kind: 'file' | 'thumb' = 'file') =>
  `/api/pictures/${kind}/${encodeURIComponent(album)}/${encodeURIComponent(file)}`;

export function albumDir(id: string): string | null {
  if (id === LOOSE_ALBUM) return PICTURES_DIR;
  const base = path.basename(String(id || ''));
  if (!base || base !== id || base.startsWith('.')) return null;
  return path.join(PICTURES_DIR, base);
}

export const thumbPath = (album: string, file: string) => path.join(PICTURE_THUMBS_DIR, album, `${path.basename(file)}.jpg`);

function imagesIn(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && RASTER.has(path.extname(e.name).toLowerCase()));
  } catch {
    return [];
  }
}

export function listPictures(album: string): Picture[] {
  const dir = albumDir(album);
  if (!dir) return [];
  return imagesIn(dir)
    .map(e => {
      const st = fs.statSync(path.join(dir, e.name));
      return {
        name: e.name,
        url: pictureUrl(album, e.name),
        thumb: pictureUrl(album, e.name, 'thumb'),
        hasThumb: fs.existsSync(thumbPath(album, e.name)),
        size: st.size,
        mtime: st.mtimeMs
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function listAlbums(): Album[] {
  fs.mkdirSync(PICTURES_DIR, { recursive: true });
  const out: Album[] = [];
  const make = (id: string, name: string): Album => {
    const pics = listPictures(id);
    return {
      id,
      name,
      count: pics.length,
      cover: pics[0]?.thumb || '',
      covers: pics.slice(0, 4).map(p => p.thumb),
      updatedAt: pics.reduce((m, p) => Math.max(m, p.mtime), 0),
      sizeBytes: pics.reduce((s, p) => s + p.size, 0)
    };
  };
  const loose = make(LOOSE_ALBUM, 'Loose pictures');
  if (loose.count) out.push(loose);
  for (const e of fs.readdirSync(PICTURES_DIR, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.')) out.push(make(e.name, e.name));
  }
  return out.sort((a, b) => (a.id === LOOSE_ALBUM ? 1 : b.id === LOOSE_ALBUM ? -1 : b.updatedAt - a.updatedAt || a.name.localeCompare(b.name)));
}

/** "My Trip!" -> "My Trip" (folder-safe, keeps spaces). */
export function albumFolderName(name: string): string {
  const clean = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80);
  if (!clean || clean === LOOSE_ALBUM) throw new Error('Give the album a name.');
  return clean;
}

export function createAlbum(name: string): string {
  const folder = albumFolderName(name);
  const dir = path.join(PICTURES_DIR, folder);
  if (fs.existsSync(dir)) throw new Error('An album with that name already exists.');
  fs.mkdirSync(dir, { recursive: true });
  return folder;
}

export function renameAlbum(id: string, name: string): string {
  const from = albumDir(id);
  if (!from || id === LOOSE_ALBUM || !fs.existsSync(from)) throw new Error('No such album');
  const folder = albumFolderName(name);
  if (folder === id) return id;
  const to = path.join(PICTURES_DIR, folder);
  if (fs.existsSync(to)) throw new Error('An album with that name already exists.');
  fs.renameSync(from, to);
  const tf = path.join(PICTURE_THUMBS_DIR, id);
  if (fs.existsSync(tf)) fs.renameSync(tf, path.join(PICTURE_THUMBS_DIR, folder));
  return folder;
}

export function deleteAlbum(id: string) {
  const dir = albumDir(id);
  if (!dir || !fs.existsSync(dir)) throw new Error('No such album');
  if (id === LOOSE_ALBUM) {
    for (const e of imagesIn(dir)) fs.unlinkSync(path.join(dir, e.name));
  } else {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.rmSync(path.join(PICTURE_THUMBS_DIR, id), { recursive: true, force: true });
}

export function deletePicture(album: string, name: string) {
  const dir = albumDir(album);
  if (!dir) throw new Error('No such album');
  const file = path.join(dir, path.basename(name));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  fs.rmSync(thumbPath(album, name), { force: true });
}

export function movePicture(album: string, name: string, to: string): string {
  const from = albumDir(album);
  const dest = albumDir(to);
  if (!from || !dest || !fs.existsSync(dest)) throw new Error('No such album');
  const base = path.basename(name);
  let target = safeFileName(base);
  let i = 1;
  while (fs.existsSync(path.join(dest, target))) target = `${path.parse(base).name}_${i++}${path.extname(base)}`;
  fs.renameSync(path.join(from, base), path.join(dest, target));
  fs.rmSync(thumbPath(album, base), { force: true });
  return target;
}
