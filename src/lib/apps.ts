import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { APPS_DIR, safeJoin } from './paths';
import { getDatabase, saveDatabase, newId } from './db';
import type { Game, AppKind } from './types';

/**
 * Optional `app.json` an app/game folder can ship with:
 * { "title": "...", "kind": "game"|"app", "genre": "Puzzle", "category": "Productivity",
 *   "description": "...", "controls": "...", "thumbnail": "cover.png" }
 */
interface AppManifest {
  title?: string;
  kind?: AppKind;
  genre?: string;
  category?: string;
  description?: string;
  controls?: string;
  thumbnail?: string;
}

function readManifest(slug: string): AppManifest {
  try {
    const p = path.join(APPS_DIR, slug, 'app.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return {};
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'app'
  );
}

function uniqueSlug(base: string): string {
  let slug = base;
  let i = 2;
  while (fs.existsSync(path.join(APPS_DIR, slug))) slug = `${base}-${i++}`;
  return slug;
}

function entryFromSlug(slug: string, fields: Partial<Game> = {}): Omit<Game, 'id' | 'plays' | 'likes' | 'dislikes' | 'createdAt'> {
  const m = readManifest(slug);
  const kind: AppKind = fields.kind || m.kind || 'game';
  const thumb = fields.thumbnail || (m.thumbnail ? `/api/apps/run/${slug}/${m.thumbnail}` : '');
  return {
    kind,
    slug,
    title: fields.title || m.title || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: fields.description || m.description || '',
    thumbnail: thumb || '/api/media/thumbnails/thumb_glitch.svg',
    entryPoint: `/api/apps/run/${slug}/index.html`,
    controlsHelp: fields.controlsHelp || m.controls || (kind === 'game' ? 'Keyboard & mouse' : ''),
    genre: fields.genre || m.genre || (kind === 'game' ? 'Arcade' : ''),
    category: fields.category || m.category || (kind === 'app' ? 'Utilities' : undefined)
  };
}

/** Register folders in content/apps that have an index.html but no database entry. */
export function syncApps(): number {
  if (!fs.existsSync(APPS_DIR)) return 0;
  const db = getDatabase();
  const known = new Set(db.games.map(g => g.slug).filter(Boolean));
  let added = 0;
  for (const dir of fs.readdirSync(APPS_DIR)) {
    if (dir.startsWith('.') || known.has(dir)) continue;
    const full = path.join(APPS_DIR, dir);
    if (!fs.statSync(full).isDirectory() || !fs.existsSync(path.join(full, 'index.html'))) continue;
    db.games.unshift({
      ...entryFromSlug(dir),
      id: newId('game'),
      plays: 0,
      likes: 0,
      dislikes: 0,
      createdAt: new Date().toISOString()
    });
    added++;
  }
  // Drop entries whose folder was deleted by hand.
  const before = db.games.length;
  db.games = db.games.filter(g => !g.slug || fs.existsSync(path.join(APPS_DIR, g.slug)));
  if (added || db.games.length !== before) saveDatabase(db);
  return added;
}

/**
 * Install an uploaded .zip (any HTML5/Canvas/WASM bundle with an index.html) or a single .html file.
 * Zip paths are checked so nothing can be written outside the app's own folder.
 */
export async function installApp(tmpFile: string, originalName: string, fields: Partial<Game>): Promise<Game> {
  const ext = path.extname(originalName).toLowerCase();
  const slug = uniqueSlug(slugify(fields.title || originalName));
  const dest = path.join(APPS_DIR, slug);
  fs.mkdirSync(dest, { recursive: true });

  try {
    if (ext === '.html' || ext === '.htm') {
      fs.copyFileSync(tmpFile, path.join(dest, 'index.html'));
    } else if (ext === '.zip') {
      const zip = await JSZip.loadAsync(fs.readFileSync(tmpFile));
      const files = Object.values(zip.files).filter(f => !f.dir && !f.name.startsWith('__MACOSX/'));
      // Find the shallowest index.html and treat its folder as the app root.
      const index = files
        .filter(f => /(^|\/)index\.html?$/i.test(f.name))
        .sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
      if (!index) throw new Error('The zip has no index.html');
      const root = index.name.slice(0, index.name.length - path.posix.basename(index.name).length);
      for (const f of files) {
        if (!f.name.startsWith(root)) continue;
        const rel = f.name.slice(root.length);
        const out = safeJoin(dest, rel);
        if (!out) continue; // zip-slip attempt: skip
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, await f.async('nodebuffer'));
      }
      if (/index\.htm$/i.test(index.name) && !fs.existsSync(path.join(dest, 'index.html'))) {
        fs.renameSync(path.join(dest, 'index.htm'), path.join(dest, 'index.html'));
      }
    } else {
      throw new Error('Upload a .zip containing index.html, or a single .html file');
    }
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw e;
  }

  const db = getDatabase();
  const game: Game = {
    ...entryFromSlug(slug, fields),
    id: newId('game'),
    plays: 0,
    likes: 0,
    dislikes: 0,
    createdAt: new Date().toISOString()
  };
  db.games.unshift(game);
  saveDatabase(db);
  return game;
}
