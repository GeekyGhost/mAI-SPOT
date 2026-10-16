import path from 'path';
import fs from 'fs';

// Everything lives inside the project folder (self-contained by design).
export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'db.json');
export const CONTENT_DIR = path.join(ROOT, 'content');
export const AUDIO_DIR = path.join(CONTENT_DIR, 'audio');
export const VIDEO_DIR = path.join(CONTENT_DIR, 'video');
export const THUMB_DIR = path.join(CONTENT_DIR, 'thumbnails');
export const BOOKS_DIR = path.join(CONTENT_DIR, 'books');
export const APPS_DIR = path.join(CONTENT_DIR, 'apps');
export const PICTURES_DIR = path.join(CONTENT_DIR, 'pictures');
export const MODELS_DIR = path.join(CONTENT_DIR, 'models');
export const PICTURE_THUMBS_DIR = path.join(PICTURES_DIR, '.thumbs');
export const CACHE_DIR = path.join(CONTENT_DIR, '.cache');
export const INCOMING_DIR = path.join(CONTENT_DIR, '.incoming');

export const AUDIO_EXT = ['.mp3', '.wav', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.webm'];
export const VIDEO_EXT = ['.mp4', '.webm', '.m4v', '.mov', '.mkv', '.ogv'];
export const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp'];
export const BOOK_EXT = ['.epub', '.pdf', '.cbz', '.cbr', '.txt', '.md'];

export function ensureDirs() {
  for (const d of [DATA_DIR, CONTENT_DIR, AUDIO_DIR, VIDEO_DIR, THUMB_DIR, BOOKS_DIR, APPS_DIR, PICTURES_DIR, MODELS_DIR, CACHE_DIR, INCOMING_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

/** Resolve `rel` inside `base`, refusing anything that escapes it. */
export function safeJoin(base: string, rel: string): string | null {
  const target = path.resolve(base, rel);
  const baseResolved = path.resolve(base);
  if (target !== baseResolved && !target.startsWith(baseResolved + path.sep)) return null;
  return target;
}

/** Make a filesystem-friendly name, keeping the extension. */
export function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._ ()\-\[\]]/g, '_').replace(/\s+/g, '_');
  return base.replace(/^\.+/, '') || 'file';
}

/** Pick a name that doesn't collide with an existing file in `dir`. */
export function uniqueName(dir: string, name: string): string {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = name;
  let i = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem}_${i++}${ext}`;
  }
  return candidate;
}

/** "my_track-name_01.mp3" -> "My Track Name 01" */
export function prettifyFileName(file: string): string {
  const stem = path.basename(file, path.extname(file)).replace(/^\d{12,}_/, '');
  return stem
    .replace(/[_]+/g, ' ')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, m => m.toUpperCase());
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xhtml': 'application/xhtml+xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mid': 'audio/midi',
  '.xml': 'application/xml',
  '.ncx': 'application/xml',
  '.opf': 'application/xml',
  '.ico': 'image/x-icon'
};

export function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}
