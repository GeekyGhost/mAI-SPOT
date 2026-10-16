import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import JSZip from 'jszip';
import { buildRelease } from '../release.mjs';
import { digest, safePath, compareVersions } from '../lib/update-files.mjs';
import { claimOperation } from '../lib/operation-lock.mjs';
import { inspectArchive, installArchive, rollback, update, latestRelease, download } from '../lib/updater.mjs';

function fixture(t, version = '0.4.1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maispot-update-test-'));
  t.after(() => {
    const target = path.resolve(root), base = path.resolve(os.tmpdir());
    assert.equal(path.dirname(target), base);
    assert.ok(path.basename(target).startsWith('maispot-update-test-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  const put = (relative, value) => {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  put('package.json', JSON.stringify({ name: 'mai-spot', version, engines: { node: '>=18.18' } }));
  put('package-lock.json', JSON.stringify({ name: 'mai-spot', version }));
  for (const file of ['server.mjs', 'Launch.bat', 'launch.sh', 'Update.bat', 'update.sh', 'scripts/update.mjs', 'scripts/run.mjs', 'src/old.ts']) put(file, `${version}: ${file}\n`);
  put('data/identity.json', 'PRIVATE IDENTITY'); put('data/db.json', 'PRIVATE SETTINGS'); put('data/social.json', 'PRIVATE MESSAGES');
  put('content/audio/personal.mp3', 'PRIVATE MUSIC');
  put('content/models/private-model/package.zip', 'PRIVATE MODEL');
  put('content/models/private-model/manifest.json', 'PRIVATE MODEL NOTES');
  put('content/apps/my-private-game/index.html', 'PRIVATE APP');
  put('content/apps/neon-snake/index.html', `bundled ${version}`);
  put('content/thumbnails/avatar_custom.svg', 'PRIVATE AVATAR');
  put('content/thumbnails/avatar_friend.svg', 'PRIVATE FRIEND ART');
  return { root, put, read: relative => fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8') };
}
async function release(t) {
  const f = fixture(t, '0.4.2');
  fs.unlinkSync(path.join(f.root, 'src', 'old.ts'));
  f.put('src/new.ts', 'new application code');
  f.put('content/apps/block-drop/index.html', 'new starter game');
  const built = await buildRelease(f.root, () => {});
  const inspected = await inspectArchive(built.bytes, digest(built.bytes), '0.4.2');
  return { ...built, inspected, fixture: f };
}
function personal(f) {
  return ['data/identity.json', 'data/db.json', 'data/social.json', 'content/audio/personal.mp3', 'content/models/private-model/package.zip', 'content/models/private-model/manifest.json', 'content/apps/my-private-game/index.html', 'content/apps/neon-snake/index.html']
    .map(name => [name, f.read(name)]);
}
const unchanged = (f, entries) => { for (const [name, text] of entries) assert.equal(f.read(name), text, name); };

test('release packaging emits manifest/checksum and excludes personal apps, data and backups', async t => {
  const f = fixture(t, '0.4.2');
  f.put('.updates/backups/private/data/identity.json', 'PRIVATE BACKUP');
  f.put('runtime/private.txt', 'PRIVATE RUNTIME');
  const built = await buildRelease(f.root, () => {});
  const zip = await JSZip.loadAsync(built.bytes), names = Object.keys(zip.files);
  assert.equal(names.some(name => /\/data\/|\/runtime\/|\/\.updates\/|my-private-game|private-model|personal\.mp3|avatar_custom|avatar_friend/.test(name)), false);
  assert.ok(zip.file('mAI-Spot-0.4.2/release-manifest.json'));
  assert.equal(fs.readFileSync(built.out + '.sha256', 'utf8'), `${digest(built.bytes)}  mAI-Spot-0.4.2.zip\n`);
  assert.equal(zip.file('mAI-Spot-0.4.2/update.sh').unixPermissions & 0o777, 0o755);
  assert.equal(/(?<!\r)\n/.test(await zip.file('mAI-Spot-0.4.2/Update.bat').async('string')), false);
});

test('installation preserves identity, settings, messages, media, custom apps and modified starter content', async t => {
  const old = fixture(t), r = await release(t), saved = personal(old);
  const result = installArchive(old.root, r.inspected);
  unchanged(old, saved);
  assert.equal(JSON.parse(old.read('package.json')).version, '0.4.2');
  assert.equal(old.read('src/new.ts'), 'new application code');
  assert.equal(fs.existsSync(path.join(old.root, 'src/old.ts')), false);
  assert.equal(old.read('content/apps/block-drop/index.html'), 'new starter game');
  assert.equal(old.read(`${result.backup}/data/identity.json`), 'PRIVATE IDENTITY');
  assert.equal(fs.existsSync(path.join(old.root, '.updates/needs-install')), true);
  assert.equal(fs.existsSync(path.join(old.root, '.updates/pending.json')), false);
});

test('failed writes automatically restore previous application files and retain personal data', async t => {
  const old = fixture(t), r = await release(t), saved = personal(old);
  assert.throws(() => installArchive(old.root, r.inspected, { beforeWrite: name => { if (name === 'server.mjs') throw new Error('simulated disk failure'); } }), /previous application was restored/);
  assert.equal(JSON.parse(old.read('package.json')).version, '0.4.1');
  assert.equal(old.read('src/old.ts'), '0.4.1: src/old.ts\n');
  assert.equal(fs.existsSync(path.join(old.root, 'src/new.ts')), false);
  unchanged(old, saved);
  assert.equal(fs.existsSync(path.join(old.root, '.updates/pending.json')), false);
});

test('manual rollback restores the app while keeping messages written after the update', async t => {
  const old = fixture(t), r = await release(t);
  installArchive(old.root, r.inspected);
  old.put('data/social.json', 'NEW MESSAGE AFTER UPDATE');
  assert.equal(rollback(old.root), '0.4.1');
  assert.equal(old.read('data/social.json'), 'NEW MESSAGE AFTER UPDATE');
  assert.equal(old.read('data/identity.json'), 'PRIVATE IDENTITY');
  assert.equal(old.read('src/old.ts'), '0.4.1: src/old.ts\n');
  assert.equal(fs.existsSync(path.join(old.root, 'src/new.ts')), false);
  assert.throws(() => rollback(old.root), /no pending or completed update/);
});

test('damaged backups stop rollback before changing application files', async t => {
  const old = fixture(t), r = await release(t), result = installArchive(old.root, r.inspected);
  old.put(`${result.backup}/files/package.json`, 'CORRUPTED');
  assert.throws(() => rollback(old.root), /backup is damaged/);
  assert.equal(JSON.parse(old.read('package.json')).version, '0.4.2');
  assert.equal(old.read('src/new.ts'), 'new application code');
});

test('interrupted updates block launching until explicit recovery', async t => {
  const old = fixture(t), r = await release(t), result = installArchive(old.root, r.inspected);
  const id = path.basename(result.backup);
  old.put('.updates/pending.json', JSON.stringify({ id }));
  assert.throws(() => claimOperation(old.root, 'running'), /interrupted update/);
  assert.throws(() => installArchive(old.root, r.inspected), /interrupted update/);
  assert.equal(rollback(old.root), '0.4.1');
  const lock = claimOperation(old.root, 'running'); lock.release();
});

test('invalid ZIP checksums and changed file contents are rejected before installation', async t => {
  const r = await release(t);
  await assert.rejects(inspectArchive(r.bytes, '0'.repeat(64), '0.4.2'), /checksum does not match/);
  const zip = await JSZip.loadAsync(r.bytes);
  zip.file('mAI-Spot-0.4.2/src/new.ts', 'tampered application');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(inspectArchive(bytes, digest(bytes), '0.4.2'), /mismatch/);
});

test('archive traversal, symlinks and unlisted personal paths are rejected', async t => {
  const r = await release(t);
  for (const [name, options] of [['../escape.txt', {}], ['data/identity.json', {}], ['src/link', { unixPermissions: 0o120777 }]]) {
    const zip = await JSZip.loadAsync(r.bytes);
    zip.file(`mAI-Spot-0.4.2/${name}`, 'untrusted', options);
    const bytes = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
    await assert.rejects(inspectArchive(bytes, digest(bytes), '0.4.2'), /unsafe|symbolic link|outside its manifest/);
  }
});

test('case-colliding files and release version mismatches are rejected', async t => {
  const r = await release(t), zip = await JSZip.loadAsync(r.bytes);
  const manifest = JSON.parse(await zip.file('mAI-Spot-0.4.2/release-manifest.json').async('string'));
  manifest.files.push({ path: 'src/NEW.ts', size: 1, sha256: digest('x') });
  zip.file('mAI-Spot-0.4.2/src/NEW.ts', 'x');
  zip.file('mAI-Spot-0.4.2/release-manifest.json', JSON.stringify(manifest));
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(inspectArchive(bytes, digest(bytes), '0.4.2'), /duplicate/);
  await assert.rejects(inspectArchive(r.bytes, digest(r.bytes), '0.5.0'), /unsafe archive path/);
});

test('operation lock prevents concurrent updater/server activity and survives an orphaned child', t => {
  const f = fixture(t), lock = claimOperation(f.root, 'running');
  assert.throws(() => claimOperation(f.root, 'updating'), /busy/);
  lock.release();
  f.put('.updates/operation.json', JSON.stringify({ pid: 99999999, child: process.pid, operation: 'server' }));
  assert.throws(() => claimOperation(f.root, 'updating'), /busy/);
});

test('stale locks recover and unsafe destination paths are refused', t => {
  const f = fixture(t);
  f.put('.updates/operation.json', JSON.stringify({ pid: 99999999, operation: 'old update' }));
  const lock = claimOperation(f.root, 'updating'); lock.release();
  for (const relative of ['../outside', 'src/../../outside', 'C:/outside', 'data\\identity.json', 'src/CON.txt', 'src/file.ts:stream']) {
    assert.throws(() => safePath(f.root, relative), /Unsafe|escapes/);
  }
  assert.equal(compareVersions('0.4.10', '0.4.9'), 1);
});

test('interrupted lock publication leaves no empty lock and can be retried', t => {
  const f = fixture(t), file = path.join(f.root, '.updates/operation.json');
  const link = fs.linkSync;
  fs.linkSync = () => { throw Object.assign(new Error('simulated interruption'), { code: 'EIO' }); };
  try { assert.throws(() => claimOperation(f.root, 'starting'), /simulated interruption/); }
  finally { fs.linkSync = link; }
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), []);
  const lock = claimOperation(f.root, 'starting'); lock.release();
});

test('interrupted child-lock replacement preserves the complete previous record', t => {
  const f = fixture(t), lock = claimOperation(f.root, 'running');
  t.after(lock.release);
  lock.child(process.pid);
  const file = path.join(f.root, '.updates/operation.json'), before = fs.readFileSync(file, 'utf8');
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('simulated interruption'), { code: 'EIO' }); };
  try { assert.throws(() => lock.child(null), /simulated interruption/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(JSON.parse(before).child, process.pid);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['operation.json']);
  assert.throws(() => claimOperation(f.root, 'updating'), /busy/);
  lock.child(null); assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).child, null);
});

test('damaged legacy locks give specific repair instructions without bypassing them', t => {
  const f = fixture(t);
  for (const damaged of ['', '{partial', 'null', '{}']) {
    f.put('.updates/operation.json', damaged);
    assert.throws(() => claimOperation(f.root, 'running'), /remove only that file/);
    assert.equal(f.read('.updates/operation.json'), damaged);
  }
});

test('launcher hands its lock to setup and server and cleans up after success or setup failure', async t => {
  const f = fixture(t);
  for (const file of ['scripts/run.mjs', 'scripts/lib/operation-lock.mjs', 'scripts/lib/update-files.mjs']) {
    f.put(file, fs.readFileSync(new URL('../../' + file, import.meta.url)));
  }
  const check = `import fs from 'node:fs'; import assert from 'node:assert/strict';
const owner = JSON.parse(fs.readFileSync('.updates/operation.json', 'utf8'));
assert.equal(owner.pid, process.ppid); assert.equal(owner.child, process.pid);
assert.equal(owner.token, process.env.MAISPOT_LAUNCH_LOCK);
const release = childOperation(process.cwd(), 'test child'); release();
assert.equal(fs.existsSync('.updates/operation.json'), true);`;
  f.put('scripts/preflight.mjs', `import { childOperation } from './lib/operation-lock.mjs'; ${check} console.log('SETUP_OK'); if(process.env.TEST_SETUP_FAIL) process.exit(7);`);
  f.put('server.mjs', `import { childOperation } from './scripts/lib/operation-lock.mjs'; ${check} console.log('SERVER_OK');`);
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const launch = (fail = false) => spawnSync(process.execPath, ['scripts/run.mjs'], {
    cwd: f.root, encoding: 'utf8', timeout: 15000, windowsHide: true,
    env: { ...process.env, PORT: String(port), TEST_SETUP_FAIL: fail ? '1' : '' }
  });
  const success = launch();
  assert.equal(success.status, 0, success.stderr + success.stdout);
  assert.match(success.stdout, /SETUP_OK/); assert.match(success.stdout, /SERVER_OK/);
  assert.equal(fs.existsSync(path.join(f.root, '.updates/operation.json')), false);
  const failed = launch(true);
  assert.equal(failed.status, 7, failed.stderr + failed.stdout);
  assert.match(failed.stdout, /SETUP_OK/); assert.doesNotMatch(failed.stdout, /SERVER_OK/);
  assert.equal(fs.existsSync(path.join(f.root, '.updates/operation.json')), false);
});

test('destination junctions cannot redirect writes outside the installation', async t => {
  const old = fixture(t), outside = fixture(t), r = await release(t);
  fs.unlinkSync(path.join(old.root, 'src/old.ts')); fs.rmdirSync(path.join(old.root, 'src'));
  try { fs.symlinkSync(path.join(outside.root, 'src'), path.join(old.root, 'src'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Directory symlinks unavailable'); throw error; }
  assert.throws(() => installArchive(old.root, r.inspected), /link/);
  assert.equal(outside.read('src/old.ts'), '0.4.1: src/old.ts\n');
});

test('offline ZIP update verifies the sidecar and checks the running port before applying', async t => {
  const old = fixture(t), r = await release(t), saved = personal(old);
  await assert.rejects(update(old.root, { file: r.out, busy: async () => true, log() {} }), /in use/);
  assert.equal(JSON.parse(old.read('package.json')).version, '0.4.1');
  await update(old.root, { file: r.out, busy: async () => false, log() {} });
  assert.equal(JSON.parse(old.read('package.json')).version, '0.4.2'); unchanged(old, saved);
  await update(old.root, { undo: true, busy: async () => false, log() {} });
  assert.equal(JSON.parse(old.read('package.json')).version, '0.4.1'); unchanged(old, saved);
});

test('check-only can run while the Spot is busy and does not create backups or locks', async t => {
  const old = fixture(t), messages = [];
  const metadata = { tag_name: 'v0.4.2', draft: false, prerelease: false, assets: [
    { name: 'mAI-Spot-0.4.2.zip', browser_download_url: 'https://github.com/GeekyGhost/mAI-SPOT/releases/download/v0.4.2/mAI-Spot-0.4.2.zip' }
  ] };
  await update(old.root, { check: true, busy: async () => { throw new Error('must not be called'); }, fetcher: async () => new Response(JSON.stringify(metadata)), log: text => messages.push(text) });
  assert.ok(messages.some(message => /update is available/.test(message)));
  assert.equal(fs.existsSync(path.join(old.root, '.updates')), false);
});

test('untrusted download URLs, oversized responses and invalid release metadata fail safely', async () => {
  await assert.rejects(download('https://example.com/release.zip', 10), /Untrusted/);
  await assert.rejects(download('https://github.com/test', 2, async () => new Response('too much data')), /too large/);
  await assert.rejects(latestRelease(async () => new Response(JSON.stringify({ tag_name: 'v0.4.2', prerelease: true }))), /stable release/);
});

test('Git checkouts are not overwritten by the ZIP updater', async t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.root, '.git'));
  await assert.rejects(update(f.root, { check: true }), /Git checkout/);
});

test('online update installs only after matching official metadata, ZIP checksum and manifest', async t => {
  const old = fixture(t), r = await release(t), saved = personal(old);
  const base = 'https://github.com/GeekyGhost/mAI-SPOT/releases/download/v0.4.2/mAI-Spot-0.4.2.zip';
  const metadata = { tag_name: 'v0.4.2', draft: false, prerelease: false, assets: [
    { name: 'mAI-Spot-0.4.2.zip', browser_download_url: base },
    { name: 'mAI-Spot-0.4.2.zip.sha256', browser_download_url: `${base}.sha256` }
  ] };
  const requested = [];
  await update(old.root, { busy: async () => false, log() {}, fetcher: async url => {
    requested.push(url);
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(metadata));
    if (url === `${base}.sha256`) return new Response(fs.readFileSync(r.out + '.sha256'));
    if (url === base) return new Response(r.bytes);
    throw new Error('Unexpected download');
  } });
  assert.equal(requested.length, 3);
  assert.equal(JSON.parse(old.read('package.json')).version, '0.4.2');
  unchanged(old, saved);
});

test('Windows updater finishes safely when the release replaces its own batch file', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const launcher = fs.readFileSync(new URL('../../Update.bat', import.meta.url), 'utf8').replace(/\r?\n/g, '\r\n');
  f.put('Update.bat', launcher);
  f.put('scripts/update.mjs', `import fs from 'node:fs'; fs.writeFileSync('Update.bat', 'This file was replaced by the update.'); console.log('SELF_UPDATE_FINISHED');`);
  const result = spawnSync('cmd.exe', ['/d', '/c', 'Update.bat', '--check'], { cwd: f.root, input: '\n', encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SELF_UPDATE_FINISHED/);
  assert.equal(f.read('Update.bat'), 'This file was replaced by the update.');
});
