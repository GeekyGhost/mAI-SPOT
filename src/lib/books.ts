import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { BOOKS_DIR, THUMB_DIR, CACHE_DIR, IMAGE_EXT, ROOT, prettifyFileName, safeJoin } from './paths';
import { getDatabase, saveDatabase, newId } from './db';
import type { Book, BookFormat } from './types';

const IMG_RE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

/** Natural sort so "page2" comes before "page10". */
export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeXml(m[2] ?? m[3] ?? '') : undefined;
}

// ─────────────────────────── Comics ───────────────────────────

/** "Saga 012 (2013).cbz" -> { series: "Saga", issue: "12" } */
function parseComicName(file: string): { title: string; series?: string; issue?: string } {
  const pretty = prettifyFileName(file).replace(/\(\d{4}\)/, '').trim();
  const m = pretty.match(/^(.*?)[\s#-]+(?:issue\s*)?#?(\d{1,4})(?:\s|$)/i);
  if (m && m[1].trim()) {
    return { title: pretty, series: m[1].trim(), issue: String(Number(m[2])) };
  }
  return { title: pretty };
}

let unrarWasm: ArrayBuffer | null = null;
async function openRar(file: string) {
  const { createExtractorFromData } = await import('node-unrar-js');
  if (!unrarWasm) {
    const buf = fs.readFileSync(path.join(ROOT, 'node_modules', 'node-unrar-js', 'dist', 'js', 'unrar.wasm'));
    unrarWasm = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  const data = fs.readFileSync(file);
  return createExtractorFromData({
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    wasmBinary: unrarWasm
  });
}

/** Image entries inside a CBZ/CBR, in reading order. */
async function listComicPages(book: Book): Promise<string[]> {
  const full = path.join(BOOKS_DIR, book.fileName);
  if (book.format === 'cbz') {
    const zip = await JSZip.loadAsync(fs.readFileSync(full));
    return Object.values(zip.files)
      .filter(f => !f.dir && IMG_RE.test(f.name) && !f.name.startsWith('__MACOSX'))
      .map(f => f.name)
      .sort(naturalCompare);
  }
  const ex = await openRar(full);
  const list = ex.getFileList();
  return [...list.fileHeaders]
    .filter(h => !h.flags.directory && IMG_RE.test(h.name))
    .map(h => h.name)
    .sort(naturalCompare);
}

async function readComicEntries(book: Book, names: string[]): Promise<Map<string, Uint8Array>> {
  const full = path.join(BOOKS_DIR, book.fileName);
  const out = new Map<string, Uint8Array>();
  if (book.format === 'cbz') {
    const zip = await JSZip.loadAsync(fs.readFileSync(full));
    for (const n of names) {
      const f = zip.file(n);
      if (f) out.set(n, await f.async('uint8array'));
    }
  } else {
    const ex = await openRar(full);
    const res = ex.extract({ files: names });
    for (const f of res.files) if (f.extraction) out.set(f.fileHeader.name, f.extraction);
  }
  return out;
}

/**
 * Extract a comic's pages once into content/.cache/<bookId>/ so page turns are instant.
 * Returns the cached page file names in reading order.
 */
const extracting = new Map<string, Promise<string[]>>();
export async function ensureComicPages(book: Book): Promise<string[]> {
  const dir = path.join(CACHE_DIR, book.id);
  const indexFile = path.join(dir, 'pages.json');
  const src = path.join(BOOKS_DIR, book.fileName);
  if (fs.existsSync(indexFile) && fs.statSync(indexFile).mtimeMs >= fs.statSync(src).mtimeMs) {
    return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  }
  if (extracting.has(book.id)) return extracting.get(book.id)!;
  const job = (async () => {
    clearBookCache(book.id);
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(BOOKS_DIR, book.fileName);
    const names = await listComicPages(book);
    const pages: string[] = [];
    if (book.format === 'cbz') {
      const zip = await JSZip.loadAsync(fs.readFileSync(full));
      for (let i = 0; i < names.length; i++) {
        const n = names[i];
        const f = zip.file(n);
        if (!f) continue;
        const bytes = await f.async('uint8array');
        const out = `${String(i + 1).padStart(4, '0')}${path.extname(n).toLowerCase()}`;
        fs.writeFileSync(path.join(dir, out), bytes);
        pages.push(out);
      }
    } else {
      const ex = await openRar(full);
      for (let i = 0; i < names.length; i += 40) {
        const batch = names.slice(i, i + 40);
        const res = ex.extract({ files: batch });
        const data = new Map<string, Uint8Array>();
        for (const f of res.files) if (f.extraction) data.set(f.fileHeader.name, f.extraction);
        batch.forEach((n, j) => {
          const bytes = data.get(n);
          if (!bytes) return;
          const out = `${String(i + j + 1).padStart(4, '0')}${path.extname(n).toLowerCase()}`;
          fs.writeFileSync(path.join(dir, out), bytes);
          pages.push(out);
        });
      }
    }
    fs.writeFileSync(indexFile, JSON.stringify(pages));
    return pages;
  })().finally(() => extracting.delete(book.id));
  extracting.set(book.id, job);
  return job;
}

export function clearBookCache(bookId: string) {
  const dir = safeJoin(CACHE_DIR, bookId);
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ─────────────────────────── EPUB ───────────────────────────

export interface EpubStructure {
  title?: string;
  author?: string;
  description?: string;
  coverHref?: string;
  /** Path of the OPF's folder inside the zip, e.g. "OEBPS/" */
  base: string;
  spine: { href: string; title?: string }[];
}

const epubCache = new Map<string, { mtime: number; zip: JSZip; structure: EpubStructure }>();

async function loadEpub(fileName: string) {
  const full = path.join(BOOKS_DIR, fileName);
  const mtime = fs.statSync(full).mtimeMs;
  const hit = epubCache.get(fileName);
  if (hit && hit.mtime === mtime) return hit;

  const zip = await JSZip.loadAsync(fs.readFileSync(full));
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container ? attr(container.match(/<rootfile\b[^>]*>/i)?.[0] || '', 'full-path') : undefined;
  if (!opfPath) throw new Error('Not a valid EPUB (no rootfile)');
  const opf = (await zip.file(opfPath)?.async('string')) || '';
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const meta = (tag: string) => {
    const m = opf.match(new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i'));
    return m ? decodeXml(m[1].replace(/<[^>]+>/g, '')) : undefined;
  };

  const manifest = new Map<string, { href: string; type?: string; props?: string }>();
  for (const tag of opf.match(/<item\b[^>]*>/gi) || []) {
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (id && href) manifest.set(id, { href, type: attr(tag, 'media-type'), props: attr(tag, 'properties') });
  }

  let coverHref = [...manifest.values()].find(i => i.props?.split(/\s+/).includes('cover-image'))?.href;
  if (!coverHref) {
    const coverMeta = (opf.match(/<meta\b[^>]*name\s*=\s*["']cover["'][^>]*>/i) || [])[0];
    const coverId = coverMeta ? attr(coverMeta, 'content') : undefined;
    if (coverId && manifest.get(coverId)) coverHref = manifest.get(coverId)!.href;
  }
  if (!coverHref) {
    coverHref = [...manifest.values()].find(i => i.type?.startsWith('image/') && /cover/i.test(i.href))?.href;
  }

  const spineIds = (opf.match(/<itemref\b[^>]*>/gi) || [])
    .filter(t => attr(t, 'linear') !== 'no')
    .map(t => attr(t, 'idref'))
    .filter(Boolean) as string[];
  const spine = spineIds
    .map(id => manifest.get(id))
    .filter((i): i is { href: string; type?: string } => !!i)
    .map(i => ({ href: decodeURIComponent(i.href) }));

  // Chapter titles from the EPUB3 nav or EPUB2 NCX, best-effort.
  const titles = new Map<string, string>();
  const navItem = [...manifest.values()].find(i => i.props?.split(/\s+/).includes('nav'));
  const ncxItem = [...manifest.values()].find(i => i.type === 'application/x-dtbncx+xml');
  try {
    if (navItem) {
      const nav = (await zip.file(base + navItem.href)?.async('string')) || '';
      const navDir = navItem.href.includes('/') ? navItem.href.slice(0, navItem.href.lastIndexOf('/') + 1) : '';
      for (const m of nav.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = path.posix.normalize(navDir + decodeURIComponent(m[1].split('#')[0]));
        const label = decodeXml(m[2].replace(/<[^>]+>/g, ''));
        if (label && !titles.has(href)) titles.set(href, label);
      }
    } else if (ncxItem) {
      const ncx = (await zip.file(base + ncxItem.href)?.async('string')) || '';
      const ncxDir = ncxItem.href.includes('/') ? ncxItem.href.slice(0, ncxItem.href.lastIndexOf('/') + 1) : '';
      for (const m of ncx.matchAll(/<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src\s*=\s*["']([^"']+)["']/gi)) {
        const href = path.posix.normalize(ncxDir + decodeURIComponent(m[2].split('#')[0]));
        const label = decodeXml(m[1]);
        if (label && !titles.has(href)) titles.set(href, label);
      }
    }
  } catch {}
  spine.forEach(s => {
    const t = titles.get(path.posix.normalize(s.href));
    if (t) (s as { title?: string }).title = t;
  });

  const structure: EpubStructure = {
    title: meta('title'),
    author: meta('creator'),
    description: meta('description')?.replace(/<[^>]+>/g, '').slice(0, 600),
    coverHref,
    base,
    spine
  };
  const entry = { mtime, zip, structure };
  epubCache.set(fileName, entry);
  // Keep memory bounded: only the 3 most recent books stay parsed.
  if (epubCache.size > 3) epubCache.delete(epubCache.keys().next().value!);
  return entry;
}

export async function getEpubStructure(book: Book): Promise<EpubStructure> {
  return (await loadEpub(book.fileName)).structure;
}

/** Read a file from inside an EPUB, relative to the zip root. */
export async function readEpubEntry(book: Book, innerPath: string): Promise<Uint8Array | null> {
  const { zip } = await loadEpub(book.fileName);
  const norm = path.posix.normalize(innerPath).replace(/^\/+/, '');
  if (norm.startsWith('..')) return null;
  const f = zip.file(norm) || zip.file(decodeURIComponent(norm));
  return f ? f.async('uint8array') : null;
}

// ─────────────────────────── Import ───────────────────────────

function saveThumb(bytes: Uint8Array, ext: string, id: string): string {
  const name = `${id}${ext.toLowerCase()}`; // id already starts with book_
  fs.writeFileSync(path.join(THUMB_DIR, name), bytes);
  return `/api/media/thumbnails/${name}`;
}

/** Add a file already in content/books to the library. Never throws on a bad file. */
export async function importBookFile(fileName: string, overrides: Partial<Book> = {}): Promise<Book> {
  const full = path.join(BOOKS_DIR, fileName);
  const format = path.extname(fileName).slice(1).toLowerCase() as BookFormat;
  const id = newId('book');
  const isComic = format === 'cbz' || format === 'cbr';
  const book: Book = {
    id,
    kind: isComic ? 'comic' : 'ebook',
    format,
    title: prettifyFileName(fileName),
    author: '',
    genre: isComic ? 'Graphic Novel' : 'Unsorted',
    fileName,
    sizeBytes: fs.statSync(full).size,
    createdAt: new Date().toISOString()
  };

  try {
    if (isComic) {
      const parsed = parseComicName(fileName);
      book.title = parsed.title;
      book.series = parsed.series;
      book.issue = parsed.issue;
      const pages = await listComicPages(book);
      book.pageCount = pages.length;
      if (pages[0]) {
        const data = await readComicEntries(book, [pages[0]]);
        const bytes = data.get(pages[0]);
        if (bytes) book.cover = saveThumb(bytes, path.extname(pages[0]), id);
      }
    } else if (format === 'epub') {
      const { structure } = await loadEpub(fileName);
      book.title = structure.title || book.title;
      book.author = structure.author || '';
      book.description = structure.description;
      book.pageCount = structure.spine.length;
      if (structure.coverHref) {
        const bytes = await readEpubEntry(book, structure.base + structure.coverHref);
        if (bytes) book.cover = saveThumb(bytes, path.extname(structure.coverHref) || '.jpg', id);
      }
    }
  } catch (e) {
    console.warn('[mAI Spot] partial import for', fileName, (e as Error).message);
  }

  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined && v !== '') (book as unknown as Record<string, unknown>)[k] = v;
  }

  const db = getDatabase();
  if (!db.books.some(b => b.fileName === fileName)) {
    db.books.unshift(book);
    saveDatabase(db);
  }
  return book;
}

export function isImageFile(f: string) {
  return IMAGE_EXT.includes(path.extname(f).toLowerCase());
}
