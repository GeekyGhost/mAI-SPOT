import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const APP_DIRS = ['src', 'p2p', 'scripts', 'public'];
export const APP_FILES = ['server.mjs', 'package.json', 'package-lock.json', 'next.config.ts', 'tailwind.config.ts',
  'tsconfig.json', 'postcss.config.mjs', 'next-env.d.ts', 'Launch.bat', 'launch.sh', 'Update.bat', 'update.sh',
  'README.md', 'LICENSE', 'CHANGELOG.md', 'FEATURE_PROPOSALS.md'];
export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function validRelative(name) {
  if (typeof name !== 'string' || !name || name.length > 240 || /[\\:"<>|?*\x00-\x1f]/.test(name)) return false;
  return name.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
export const isAppFile = name => validRelative(name) && (APP_FILES.includes(name) || APP_DIRS.some(dir => name.startsWith(`${dir}/`)));
export const isSeedFile = name => validRelative(name) && (name.startsWith('content/apps/') || /^content\/thumbnails\/(thumb_|avatar_)[a-z_]+\.svg$/.test(name));

/** Resolve only beneath the installation and refuse junctions/symlinks in the destination. */
export function safePath(root, relative) {
  if (!validRelative(relative)) throw new Error(`Unsafe update path: ${relative}`);
  root = path.resolve(root);
  const target = path.resolve(root, ...relative.split('/'));
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Update path escapes the installation');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Updates cannot write through a link: ${relative}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

export function versionParts(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid stable release version');
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid stable release version');
  return parts;
}
export function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

export function appFiles(root) {
  const result = [];
  const visit = relative => {
    const file = safePath(root, relative);
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).isDirectory()) {
      for (const name of fs.readdirSync(file)) visit(`${relative}/${name}`);
    } else if (isAppFile(relative)) result.push(relative);
  };
  for (const relative of [...APP_DIRS, ...APP_FILES]) visit(relative);
  return result;
}
