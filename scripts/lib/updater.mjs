import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appFiles, compareVersions, digest, isAppFile, isSeedFile, safePath, validRelative, versionParts } from './update-files.mjs';
import { claimOperation, portBusy } from './operation-lock.mjs';
export { portBusy } from './operation-lock.mjs';

const REPO = 'GeekyGhost/mAI-SPOT';
const LIMIT = 128 * 1024 * 1024;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function put(root, relative, bytes) {
  const file = safePath(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = safePath(root, `${relative}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(temp, bytes);
  fs.renameSync(temp, file);
  if (relative.endsWith('.sh') && process.platform !== 'win32') fs.chmodSync(file, 0o755);
}
const json = (root, relative, value) => put(root, relative, JSON.stringify(value, null, 2));
const idPattern = /^[a-f0-9]{24}$/;
const transactionPath = id => {
  if (!idPattern.test(id)) throw new Error('Invalid update transaction');
  return `.updates/transactions/${id}.json`;
};

export async function inspectArchive(bytes, checksum, version) {
  versionParts(version);
  if (!/^[a-f0-9]{64}$/.test(checksum) || digest(bytes) !== checksum) throw new Error('Release checksum does not match. No application files were changed.');
  if (bytes.length > 64 * 1024 * 1024) throw new Error('Release ZIP is too large');
  let JSZip;
  try { JSZip = (await import('jszip')).default; } catch {
    throw new Error('Run the launcher once to install the updater dependencies, close the Spot, then retry.');
  }
  // Verify sizes before decompressing; the manifest hashes verify each extracted file.
  const zip = await JSZip.loadAsync(bytes, { createFolders: false });
  const prefix = `mAI-Spot-${version}/`;
  for (const entry of Object.values(zip.files)) {
    if (!entry.name.startsWith(prefix) || (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)) throw new Error('Release contains an unsafe archive path');
    const relative = entry.name.slice(prefix.length).replace(/\/$/, '');
    if (relative && !validRelative(relative)) throw new Error('Release contains an unsafe archive path');
    if ((Number(entry.unixPermissions) & 0o170000) === 0o120000) throw new Error('Release contains a symbolic link');
  }
  const manifestEntry = zip.file(`${prefix}release-manifest.json`);
  if (!manifestEntry || manifestEntry._data.uncompressedSize > 1024 * 1024) throw new Error('This release does not include a supported update manifest. Use the manual update instructions.');
  const manifest = JSON.parse(await manifestEntry.async('string'));
  if (manifest.schema !== 1 || manifest.version !== version || !Array.isArray(manifest.files) || manifest.files.length > 10000) throw new Error('Invalid release manifest');
  const files = new Map(), seen = new Set();
  let size = 0;
  for (const item of manifest.files) {
    if ((!isAppFile(item.path) && !isSeedFile(item.path)) || seen.has(item.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Release manifest contains an unsafe or duplicate file');
    seen.add(item.path.toLowerCase());
    if (!Number.isSafeInteger(item.size) || item.size < 0 || (size += item.size) > LIMIT) throw new Error('Release expands beyond the update size limit');
    const entry = zip.file(prefix + item.path);
    if (!entry || entry._data.uncompressedSize !== item.size) throw new Error(`Release file size mismatch: ${item.path}`);
    const data = await entry.async('nodebuffer');
    if (digest(data) !== item.sha256) throw new Error(`Release file checksum mismatch: ${item.path}`);
    files.set(item.path, data);
  }
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir && entry.name !== prefix + 'release-manifest.json' && !files.has(entry.name.slice(prefix.length))) throw new Error('ZIP contains files outside its manifest');
  }
  for (const required of ['package.json', 'package-lock.json', 'server.mjs', 'Launch.bat', 'launch.sh', 'Update.bat', 'update.sh', 'scripts/update.mjs', 'scripts/run.mjs']) {
    if (!files.has(required)) throw new Error(`Release is missing ${required}`);
  }
  const pkg = JSON.parse(files.get('package.json').toString('utf8'));
  if (pkg.name !== 'mai-spot' || pkg.version !== version || JSON.parse(files.get('package-lock.json')).version !== version) throw new Error('Release package version does not match');
  const minimum = /^>=(\d+\.\d+(?:\.\d+)?)$/.exec(pkg.engines?.node || '');
  if (!minimum) throw new Error('Unsupported Node.js version requirement in release');
  const requiredNode = minimum[1].split('.').length === 2 ? `${minimum[1]}.0` : minimum[1];
  if (compareVersions(process.versions.node, requiredNode) < 0) throw new Error(`This release needs Node.js ${requiredNode} or later. Update the runtime before updating the Spot.`);
  return { version, files };
}

export function rollback(root) {
  const pending = safePath(root, '.updates/pending.json');
  const pointer = fs.existsSync(pending) ? readJson(pending) : readJson(safePath(root, '.updates/last-success.json'));
  const record = readJson(safePath(root, transactionPath(pointer.id)));
  if (record.id !== pointer.id || record.status === 'rolled-back' || !Array.isArray(record.changes)) throw new Error('There is no pending or completed update to roll back');
  // Validate every backup before restoring even the first file.
  const restore = record.changes.map(item => {
    if (!isAppFile(item.path) || typeof item.before !== 'boolean') throw new Error('Invalid rollback record');
    safePath(root, item.path);
    const bytes = item.before ? fs.readFileSync(safePath(root, `.updates/backups/${record.id}/files/${item.path}`)) : null;
    if (bytes && digest(bytes) !== item.beforeHash) throw new Error('Rollback backup is damaged');
    return { ...item, bytes };
  });
  json(root, '.updates/pending.json', { id: record.id });
  for (const item of restore) {
    if (item.before) put(root, item.path, item.bytes);
    else {
      const file = safePath(root, item.path);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  json(root, transactionPath(record.id), { ...record, status: 'rolled-back' });
  put(root, '.updates/needs-install', 'Dependency check required after rollback\n');
  fs.unlinkSync(pending);
  return record.from;
}

export function installArchive(root, release, { beforeWrite } = {}) {
  if (fs.existsSync(safePath(root, '.updates/pending.json'))) throw new Error('An interrupted update needs recovery. Run Update.bat --rollback or ./update.sh --rollback first.');
  const installed = readJson(safePath(root, 'package.json')).version;
  if (compareVersions(release.version, installed) <= 0) throw new Error('Only a newer release can be installed');
  const id = crypto.randomBytes(12).toString('hex');
  const old = new Set(appFiles(root)), next = new Map([...release.files].filter(([name]) => isAppFile(name)));
  const changes = [...new Set([...old, ...next.keys()])].sort().map(name => {
    const file = safePath(root, name), before = old.has(name);
    const bytes = before ? fs.readFileSync(file) : null;
    if (bytes) put(root, `.updates/backups/${id}/files/${name}`, bytes);
    if (next.has(name)) put(root, `.updates/staging/${id}/files/${name}`, next.get(name));
    return { path: name, before, beforeHash: bytes ? digest(bytes) : null };
  });
  // Also retain a small data snapshot before the next launch can run data migrations.
  const data = safePath(root, 'data');
  if (fs.existsSync(data)) fs.cpSync(data, safePath(root, `.updates/backups/${id}/data`), { recursive: true, dereference: false });
  const record = { id, from: installed, to: release.version, status: 'applying', changes };
  json(root, transactionPath(id), record);
  json(root, '.updates/pending.json', { id });
  try {
    for (const item of changes) {
      beforeWrite?.(item.path);
      if (next.has(item.path)) put(root, item.path, next.get(item.path));
      else fs.unlinkSync(safePath(root, item.path));
    }
    // Add new starter content, but never replace an existing album, app or artwork.
    for (const [name, bytes] of release.files) {
      if (!isSeedFile(name)) continue;
      const file = safePath(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { fs.writeFileSync(file, bytes, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    put(root, '.updates/needs-install', 'Dependency check required after update\n');
    json(root, transactionPath(id), { ...record, status: 'complete' });
    json(root, '.updates/last-success.json', { id });
    fs.unlinkSync(safePath(root, '.updates/pending.json'));
    return { version: release.version, backup: `.updates/backups/${id}` };
  } catch (error) {
    try { rollback(root); } catch (recovery) {
      throw new Error(`Update failed: ${error.message}. Recovery also failed: ${recovery.message}. Keep .updates and run the rollback command after resolving file permissions.`);
    }
    throw new Error(`Update failed and the previous application was restored: ${error.message}`);
  }
}

const allowedHosts = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
export async function download(url, max, fetcher = fetch) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  try {
    for (let redirects = 0; redirects < 6; redirects++) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname) || (target.port && target.port !== '443') || target.username || target.password) throw new Error('Untrusted release download URL');
      const response = await fetcher(url, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'mAI-Spot-updater', Accept: 'application/vnd.github+json' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        url = new URL(response.headers.get('location'), url).href;
        await response.body?.cancel();
        continue;
      }
      if (!response.ok) throw new Error(`GitHub returned ${response.status}. Check your internet connection or try again later.`);
      if (Number(response.headers.get('content-length') || 0) > max) throw new Error('Release download is too large');
      let length = 0; const chunks = [];
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > max) { controller.abort(); throw new Error('Release download is too large'); }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    throw new Error('Too many release download redirects');
  } finally { clearTimeout(timer); }
}

export async function latestRelease(fetcher) {
  const data = JSON.parse((await download(`https://api.github.com/repos/${REPO}/releases/latest`, 1024 * 1024, fetcher)).toString('utf8'));
  const version = String(data.tag_name || '').replace(/^v/, ''); versionParts(version);
  if (data.draft || data.prerelease || data.tag_name !== `v${version}`) throw new Error('No supported stable release found');
  const name = `mAI-Spot-${version}.zip`;
  const asset = data.assets?.find(item => item.name === name);
  const checksum = data.assets?.find(item => item.name === `${name}.sha256`);
  const expected = `https://github.com/${REPO}/releases/download/v${version}/${name}`;
  if (!asset || asset.browser_download_url !== expected) throw new Error('The latest release has no supported ZIP download');
  return { version, url: expected, checksum: checksum?.browser_download_url === `${expected}.sha256` ? `${expected}.sha256` : null, name };
}

export async function update(root, { check = false, undo = false, file, fetcher, busy = portBusy, log = console.log } = {}) {
  root = fs.realpathSync(root);
  if (fs.existsSync(path.join(root, '.git'))) throw new Error('This is a Git checkout. Update it with Git; the ZIP updater is for release installations.');
  let lock;
  if (!check) {
    lock = claimOperation(root, undo ? 'rolling back' : 'updating', { allowPending: true });
  }
  try {
    if (!check) {
      const port = Number(process.env.PORT || 8088);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
      if (await busy(port)) throw new Error(`Port ${port} is in use. Close the Spot before updating. If you use another port, set PORT before running the updater.`);
    }
    if (undo) { const version = rollback(root); log(`Restored application ${version}. Your current data and content were kept. Run the launcher.`); return; }
    if (fs.existsSync(safePath(root, '.updates/pending.json'))) throw new Error('An interrupted update needs recovery. Run the updater with --rollback.');
    const installed = readJson(safePath(root, 'package.json')).version;
    let remote, bytes, checksum;
    if (file) {
      bytes = fs.readFileSync(path.resolve(file));
      const match = /mAI-Spot-(\d+\.\d+\.\d+)\.zip$/.exec(path.basename(file));
      if (!match) throw new Error('Use the original mAI-Spot-<version>.zip filename');
      remote = { version: match[1], name: path.basename(file) };
      checksum = fs.readFileSync(`${path.resolve(file)}.sha256`, 'utf8');
    } else remote = await latestRelease(fetcher);
    log(`Installed: ${installed}   Latest: ${remote.version}`);
    if (compareVersions(remote.version, installed) <= 0) { log('Your Spot is up to date.'); return; }
    if (check) { log('An update is available. Close the Spot and run Update.bat or ./update.sh to install it.'); return; }
    if (!file) {
      if (!remote.checksum) throw new Error('This release has no checksum. Use the manual update instructions.');
      checksum = (await download(remote.checksum, 4096, fetcher)).toString('utf8');
      log(`Downloading ${remote.name}…`);
      bytes = await download(remote.url, 64 * 1024 * 1024, fetcher);
    }
    const match = /^([a-f0-9]{64})\s+\*?([^\r\n]+)\r?\n?$/i.exec(checksum);
    if (!match || match[2] !== remote.name) throw new Error('Invalid release checksum file');
    const release = await inspectArchive(bytes, match[1].toLowerCase(), remote.version);
    const result = installArchive(root, release);
    log(`Updated to ${result.version}. App backup and pre-update data snapshot: ${result.backup}`);
    log('Your identity, settings, friends, messages, media and existing apps were kept. Run the launcher to finish setup.');
  } finally { lock?.release(); }
}
