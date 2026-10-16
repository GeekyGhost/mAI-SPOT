// Builds a clean, shareable zip of mAI Spot:   node scripts/release.mjs   (or: npm run release)
//
// The zip holds the app and the starter content only. Never your data: no data\ folder (profile,
// friends, messages, your identity key), no music/videos/pictures/books, no node_modules, no build output.
// Whoever unzips it double-clicks Launch.bat (Windows) or runs ./launch.sh (macOS/Linux) and gets
// a brand-new Spot of their own.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

import { APP_DIRS, APP_FILES, digest, safePath } from './lib/update-files.mjs';

const STARTER_APPS = ['_kit', 'asteroids', 'block-drop', 'brick-breaker', 'comet-dash', 'focus-timer',
  'memory-match', 'mine-sweeper', 'neon-2048', 'neon-runner', 'neon-sketchpad', 'neon-snake', 'pong', 'star-invaders'];
const STARTER_THUMBS = ['neon', 'turbo', 'midnight', 'lofi', 'cafe', 'study', 'space', 'signal', 'drift', 'pulse', 'glitch', 'rock', 'highway'].map(name => `thumb_${name}.svg`);

export async function buildRelease(root, log = console.log) {
  root = fs.realpathSync(root);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const top = 'mAI-Spot-' + pkg.version;
  const zip = new JSZip(), manifest = { schema: 1, version: pkg.version, files: [] };
  const skip = new Set(['node_modules', '.next', '.next-dev', '.DS_Store', 'Thumbs.db', 'tsconfig.tsbuildinfo']);
  function add(rel) {
    const file = safePath(root, rel);
    if (!fs.existsSync(file)) return;
    const st = fs.statSync(file);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) if (!skip.has(name) && !name.endsWith('.tmp')) add(rel + '/' + name);
      return;
    }
    let data = fs.readFileSync(file);
    if (rel.endsWith('.bat')) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'));
    zip.file(top + '/' + rel, data, { date: st.mtime, unixPermissions: rel.endsWith('.sh') ? 0o755 : 0o644 });
    manifest.files.push({ path: rel, size: data.length, sha256: digest(data) });
  }
  for (const rel of [...APP_DIRS, ...APP_FILES]) add(rel);
  for (const app of STARTER_APPS) add('content/apps/' + app);
  const thumbs = path.join(root, 'content', 'thumbnails');
  if (fs.existsSync(thumbs)) {
    for (const name of STARTER_THUMBS) if (fs.existsSync(path.join(thumbs, name))) add('content/thumbnails/' + name);
  }
  zip.file(top + '/release-manifest.json', JSON.stringify(manifest, null, 2));
  for (const dir of ['audio', 'video', 'pictures', 'books', 'models']) zip.folder(top + '/content/' + dir);
  const leaks = Object.keys(zip.files).filter(name => /\/(?:data|runtime|node_modules|\.updates|\.git|brand)\/|identity\.json|social\.json|db\.json|\.peers\//.test(name));
  if (leaks.length) throw new Error('Refusing to package personal files: ' + leaks.join(', '));
  const name = top + '.zip';
  const out = safePath(root, 'release/' + name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' });
  fs.writeFileSync(out, bytes);
  fs.writeFileSync(out + '.sha256', digest(bytes) + '  ' + name + '\n');
  log('[release] ' + manifest.files.length + ' files -> release/' + name + ' (' + (bytes.length / 1048576).toFixed(1) + ' MB), manifest and SHA-256 included');
  return { out, bytes, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildRelease(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
