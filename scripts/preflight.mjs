// Runs before the server starts (Launch.bat calls it). Everything stays inside this folder.
//  1. checks Node.js
//  2. installs/updates packages if package.json lists something node_modules doesn't have
//  3. makes sure the content folders exist
//  4. (production) rebuilds the app if any source file is newer than the last build
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { childOperation } from './lib/operation-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const releaseLock = childOperation(root, 'dependency setup or build');
process.once('exit', releaseLock);
const dev = process.argv.includes('--dev');
const isWin = process.platform === 'win32';
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, cwd: root }).status === 0;

// 1. Node version
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 18 || (maj === 18 && min < 18)) {
  console.error(`[ERROR] mAI Spot needs Node.js 18.18 or newer (found ${process.versions.node}).`);
  process.exit(1);
}

// 2. Packages
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = wanted.filter(d => !fs.existsSync(path.join('node_modules', d, 'package.json')));
const needsInstall = path.join(root, '.updates', 'needs-install');
if (missing.length || fs.existsSync(needsInstall)) {
  console.log(missing.length ? `[setup] Installing packages (${missing.join(', ')})...` : '[setup] Updating dependencies for this release...');
  const npm = isWin ? 'npm.cmd' : 'npm';
  if (!run(npm, ['install', '--no-audit', '--no-fund'])) {
    // Windows sometimes refuses the write to package-lock.json (file held open by another
    // program, or odd permissions). The packages themselves don't need the lockfile, so retry without it.
    console.log('[setup] Retrying without updating package-lock.json...');
    if (!run(npm, ['install', '--no-audit', '--no-fund', '--no-package-lock'])) {
      console.error('[ERROR] npm install failed. Close any editor that has this folder open and run Launch.bat again.');
      process.exit(1);
    }
  }
  if (fs.existsSync(needsInstall)) fs.unlinkSync(needsInstall);
  // npm's download cache only speeds up reinstalls; don't leave hundreds of MB lying in runtime\.
  try {
    fs.rmSync(path.join(root, 'runtime', 'npm-cache'), { recursive: true, force: true });
  } catch {}
} else {
  console.log('[setup] Packages OK.');
}

// 3. Content folders (a brand-new Spot starts empty; the welcome setup runs in the browser)
for (const d of ['data', 'content/audio', 'content/video', 'content/thumbnails', 'content/books', 'content/apps', 'content/pictures', 'content/models']) {
  fs.mkdirSync(d, { recursive: true });
}
if (!fs.existsSync('data/db.json')) console.log('[setup] First run: your Spot will walk you through setup in the browser.');

// 4. Build (production only)
if (!dev) {
  const buildId = path.join('.next', 'BUILD_ID');
  const builtAt = fs.existsSync(buildId) ? fs.statSync(buildId).mtimeMs : 0;
  const newest = (p) => {
    if (!fs.existsSync(p)) return 0;
    const st = fs.statSync(p);
    if (!st.isDirectory()) return st.mtimeMs;
    return Math.max(0, ...fs.readdirSync(p).map(f => newest(path.join(p, f))));
  };
  const sourceTime = Math.max(
    newest('src'), newest('public'), newest('package.json'), newest('next.config.ts'),
    newest('tailwind.config.ts'), newest('postcss.config.mjs'), newest('tsconfig.json')
  );
  if (sourceTime > builtAt) {
    console.log('[setup] Building mAI Spot (first run or code changed — takes a minute)...');
    if (!run(isWin ? 'npx.cmd' : 'npx', ['next', 'build'])) {
      console.error('[ERROR] Build failed. Try "Launch.bat dev" to see the error in the browser.');
      process.exit(1);
    }
  } else {
    console.log('[setup] Build is up to date.');
  }
}
