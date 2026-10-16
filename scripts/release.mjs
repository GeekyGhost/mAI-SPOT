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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const top = `mAI-Spot-${pkg.version}`;

const INCLUDE = [
  'src', 'p2p', 'scripts', 'public', 'content/apps',
  'server.mjs', 'package.json', 'package-lock.json', 'next.config.ts', 'tailwind.config.ts', 'tsconfig.json',
  'postcss.config.mjs', 'next-env.d.ts', 'Launch.bat', 'launch.sh', 'README.md', 'LICENSE', 'CHANGELOG.md', 'FEATURE_PROPOSALS.md'
];
// Starter artwork used by the default channel, sample games and the welcome setup.
const STARTER_THUMBS = /^(thumb_|avatar_)[a-z_]+\.svg$/;
const SKIP = new Set(['node_modules', '.next', '.next-dev', '.DS_Store', 'Thumbs.db', 'tsconfig.tsbuildinfo']);

const zip = new JSZip();
let files = 0;
let bytes = 0;

function add(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return;
  const st = fs.statSync(full);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(full)) {
      if (SKIP.has(name) || name.endsWith('.tmp')) continue;
      add(path.join(rel, name));
    }
    return;
  }
  let data = fs.readFileSync(full);
  // cmd.exe needs CRLF line endings in .bat files (goto/labels misbehave otherwise).
  if (rel.endsWith('.bat')) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'));
  const exec = rel === 'launch.sh';
  zip.file(`${top}/${rel.split(path.sep).join('/')}`, data, { date: st.mtime, unixPermissions: exec ? 0o755 : 0o644 });
  files++;
  bytes += data.length;
}

for (const rel of INCLUDE) add(rel);
for (const name of fs.readdirSync(path.join(root, 'content', 'thumbnails'))) {
  if (STARTER_THUMBS.test(name)) add(path.join('content', 'thumbnails', name));
}
// Empty folders people will want to drop things into.
for (const d of ['audio', 'video', 'pictures', 'books']) zip.folder(`${top}/content/${d}`);

// Guard rails: nothing personal may ever end up in a release.
const names = Object.keys(zip.files);
const leaks = names.filter(n => /\/data\/|identity\.json|social\.json|db\.json|\.peers\/|\/runtime\/|brand\//.test(n));
if (leaks.length) {
  console.error('[release] Refusing to package personal files:', leaks);
  process.exit(1);
}

const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${top}.zip`);
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' });
fs.writeFileSync(out, buf);
console.log(`[release] ${files} files (${(bytes / 1048576).toFixed(1)} MB) → ${path.relative(root, out)} (${(buf.length / 1048576).toFixed(1)} MB)`);
