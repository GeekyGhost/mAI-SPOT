import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import { Duplex } from 'node:stream';
import JSZip from 'jszip';
import { importModel, listModels, getModel, editModel, deleteModel, modelFile, modelRequestAllowed, MAX_MODEL_ZIP } from '../../p2p/models.mjs';
import { cleanGrants, covers } from '../../p2p/access.mjs';
import { Peer } from '../../p2p/protocol.mjs';
import { SpotNode } from '../../p2p/node.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maispot-model-test-'));
  t.after(() => {
    const target = path.resolve(root);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('maispot-model-test-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  return root;
}
async function archive(root, files, options = {}) {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  const bytes = await zip.generateAsync({ type: 'nodebuffer', ...options });
  const file = path.join(root, 'upload.zip'); fs.writeFileSync(file, bytes);
  return { file, bytes };
}

test('minimal ZIP imports without previews or instructions and downloads byte-for-byte', async t => {
  const root = fixture(t), a = await archive(root, { 'parts/thing.STL': 'solid thing\nendsolid', 'thing.3mf': '3mf data', 'textures/material.bin': 'support' });
  const m = await importModel(a.file, 'My_Print.zip', {}, root);
  assert.equal(m.title, 'My Print'); assert.deepEqual(m.formats, ['STL', '3MF']);
  assert.deepEqual(m.previews, []); assert.deepEqual(m.documents, []);
  const summaries = listModels(root); assert.equal(summaries.length, 1);
  assert.equal(summaries[0].fileCount, 3); assert.equal(summaries[0].modelCount, 2);
  assert.equal(summaries[0].apiBase, `/api/models/${m.id}`);
  const download = modelFile(m.id, 'download', root);
  assert.equal(download.mime, 'application/zip'); assert.equal(download.attachment, true);
  assert.deepEqual(fs.readFileSync(download.file), a.bytes);
  assert.equal(m.sha256, crypto.createHash('sha256').update(a.bytes).digest('hex'));
});

test('wrapped ZIP detects a naturally sorted image reel, GIF, video, README and PDF without texture maps', async t => {
  const root = fixture(t), a = await archive(root, {
    'robot/models/Robot.3mf': 'model', 'robot/animation/Walk.fbx': 'animation',
    'robot/images/10.png': 'ten', 'robot/images/2.png': 'two', 'robot/images/animation.gif': 'GIF89a',
    'robot/previews/assembly.webm': 'video', 'robot/textures/albedo.png': 'texture',
    'robot/README': 'Print at 0.2 mm.\nAssemble with M3 bolts.', 'robot/assembly.pdf': '%PDF-1.4',
    'robot/model.json': JSON.stringify({ title: 'Robot', author: 'Maker', license: 'CC BY 4.0', printSettings: 'PLA, 20% infill', assembly: 'Attach arms' })
  });
  const m = await importModel(a.file, 'robot.zip', {}, root);
  assert.equal(m.title, 'Robot'); assert.equal(m.author, 'Maker'); assert.equal(m.printSettings, 'PLA, 20% infill');
  assert.deepEqual(m.previews.map(p => p.name), ['robot/images/2.png', 'robot/images/10.png', 'robot/images/animation.gif', 'robot/previews/assembly.webm']);
  assert.equal(m.previews[2].mime, 'image/gif'); assert.equal(m.previews[3].kind, 'video');
  const readme = m.documents.find(d => d.kind === 'text'); assert.ok(readme);
  assert.match(fs.readFileSync(modelFile(m.id, readme.id, root).file, 'utf8'), /M3 bolts/);
  assert.equal(m.documents.find(d => d.kind === 'pdf').mime, 'application/pdf');
  assert.ok(m.files.some(f => f.path.endsWith('albedo.png')));
});

test('model formats and optional notes can be edited without changing original archive', async t => {
  const root = fixture(t), a = await archive(root, { 'source.blend': 'blend', 'source.step': 'step', 'scene.glb': 'glb', 'README.md': '<script>alert(1)</script>', 'model.json': '{broken' });
  const m = await importModel(a.file, 'source.zip', { title: 'Scene', author: 'A', printSettings: 'Resin' }, root);
  assert.deepEqual(m.formats, ['BLEND', 'STEP', 'GLB']); assert.equal(m.title, 'Scene');
  const edited = editModel(m.id, { title: 'New scene', author: '', assembly: 'Use pins', fileName: 'changed.zip', id: '../bad', previews: [] }, root);
  assert.equal(edited.title, 'New scene'); assert.equal(edited.author, ''); assert.equal(edited.fileName, 'source.zip'); assert.equal(edited.id, m.id);
  assert.equal(getModel(m.id, root).assembly, 'Use pins');
  assert.deepEqual(fs.readFileSync(modelFile(m.id, 'download', root).file), a.bytes);
  assert.throws(() => editModel(m.id, { title: ' ' }, root), /title/);
  deleteModel(m.id, root); assert.deepEqual(listModels(root), []);
  assert.throws(() => modelFile(m.id, 'download', root));
});

test('README overrides omit blank UI metadata and leave optional package notes intact', async t => {
  const root = fixture(t), a = await archive(root, { 'part.stl': 'model', 'model.json': JSON.stringify({ title: 'Embedded', author: 'Embedded creator', description: 'Embedded notes' }) });
  const m = await importModel(a.file, 'part.zip', { title: '', author: '', description: '' }, root);
  assert.equal(m.title, 'Embedded'); assert.equal(m.author, 'Embedded creator'); assert.equal(m.description, 'Embedded notes');
});

test('optional oversized previews stay in ZIP; bounded extraction lists a warning', async t => {
  const root = fixture(t), a = await archive(root, { 'part.obj': 'o part', 'images/huge.png': Buffer.alloc(21 * 1024 ** 2), 'README.txt': 'instructions' }, { compression: 'DEFLATE' });
  const m = await importModel(a.file, 'large-preview.zip', {}, root);
  assert.equal(m.previews.length, 0); assert.equal(m.documents.length, 1); assert.match(m.warnings[0], /too large/);
  assert.deepEqual(fs.readFileSync(modelFile(m.id, 'download', root).file), a.bytes);
});

test('archive traversal, symbolic links, malformed ZIPs and packages without models are refused', async t => {
  const root = fixture(t);
  for (const name of ['../outside.stl', 'folder/../../outside.stl', '/absolute.stl', 'folder\\bad.stl', 'C:/absolute.stl']) {
    const a = await archive(root, { [name]: 'model' });
    await assert.rejects(importModel(a.file, 'unsafe.zip', {}, root), /unsafe file path/);
  }
  const symlink = new JSZip(); symlink.file('part.stl', 'model'); symlink.file('link', '../outside', { unixPermissions: 0o120777 });
  const file = path.join(root, 'symlink.zip'); fs.writeFileSync(file, await symlink.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }));
  await assert.rejects(importModel(file, 'link.zip', {}, root), /symbolic link/);
  const noModel = await archive(root, { 'README.txt': 'instructions only' });
  await assert.rejects(importModel(noModel.file, 'empty.zip', {}, root), /Include a model/);
  fs.writeFileSync(file, 'not a ZIP'); await assert.rejects(importModel(file, 'broken.zip', {}, root));
  await assert.rejects(importModel(noModel.file, 'part.stl', {}, root), /Upload a ZIP/);
  assert.deepEqual(listModels(root), []);
});

test('package size, entry count and expanded size limits are enforced before extraction', async t => {
  const root = fixture(t), large = path.join(root, 'large.zip');
  const fd = fs.openSync(large, 'w'); fs.ftruncateSync(fd, MAX_MODEL_ZIP + 1); fs.closeSync(fd);
  await assert.rejects(importModel(large, 'large.zip', {}, root), /256 MB/);
  const files = Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [`part-${i}.stl`, 'x']));
  const tooMany = await archive(root, files); await assert.rejects(importModel(tooMany.file, 'many.zip', {}, root), /5,000 entries/);
  const a = await archive(root, { 'part.stl': 'x' }), corrupted = Buffer.from(a.bytes);
  const central = corrupted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  corrupted.writeUInt32LE(0x80000001, central + 24); fs.writeFileSync(a.file, corrupted);
  await assert.rejects(importModel(a.file, 'bomb.zip', {}, root), /2 GB/);
});

test('model storage rejects junctions and asset paths cannot escape a package', async t => {
  const root = fixture(t), outside = fixture(t), a = await archive(root, { 'part.stl': 'model', 'images/part.png': 'image' });
  const m = await importModel(a.file, 'part.zip', {}, root);
  for (const id of ['..', '../secret', '/absolute', 'C:drive', m.id + '/..']) assert.throws(() => getModel(id, root));
  for (const asset of ['../package.zip', 'manifest.json', 'a'.repeat(24)]) assert.throws(() => modelFile(m.id, asset, root));
  const file = path.join(root, 'content/models', m.id, 'assets');
  fs.renameSync(file, file + '-saved');
  try { fs.symlinkSync(outside, file, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Directory symlinks unavailable'); throw error; }
  assert.throws(() => modelFile(m.id, m.previews[0].id, root), /symbolic links/);
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'outside stays intact');
  deleteModel(m.id, root);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'outside stays intact');
  fs.rmdirSync(path.join(root, 'content/models'));
  fs.symlinkSync(outside, path.join(root, 'content/models'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(importModel(a.file, 'part.zip', {}, root), /symbolic links/);
});

test('model grants independently allow only detail, original download and selected assets, including expiry', () => {
  const id = 'a'.repeat(24), other = 'b'.repeat(24), now = 1000;
  const detail = ['api', 'models', id];
  const exact = cleanGrants({ [`model:${id}`]: { until: 2000 } });
  for (const parts of [detail, [...detail, 'download'], [...detail, 'asset', other]]) assert.equal(modelRequestAllowed(exact, parts, now), true);
  for (const parts of [detail.slice(0, 2), ['api', 'models', other], [...detail, 'manifest.json'], [...detail, 'assets', other], [...detail, 'asset', '..'], [...detail, 'download', 'extra'], ['api', 'upload']]) assert.equal(modelRequestAllowed(exact, parts, now), false);
  assert.equal(modelRequestAllowed(exact, detail, 2000), false);
  assert.equal(modelRequestAllowed({ 'book:*': {}, 'app:*': {} }, detail, now), false);
  assert.equal(modelRequestAllowed({ 'model:*': {} }, detail, now), true);
  const fallback = { ...exact, 'model:*': {} };
  assert.equal(modelRequestAllowed(fallback, detail, 3000), true); assert.ok(covers(fallback, 'model', id, 3000));
});

test('peer proxy streams ZIPs and byte ranges with download filenames, rejects revoked access', async t => {
  const root = fixture(t), a = await archive(root, { 'part.stl': crypto.randomBytes(200000) });
  const m = await importModel(a.file, 'Robot Print.zip', {}, root);
  const key = 'b'.repeat(64); let grants = { [`model:${m.id}`]: {} }, requests = [];
  // Exercise the real proxy and framed binary streams without identities, sockets or user friends.
  const host = { localPort: 8099, grantsOf: () => grants };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    const range = options.headers.Range;
    return new Response(range ? a.bytes.subarray(10, 30) : a.bytes, { status: range ? 206 : 200, headers: {
      'content-type': 'application/zip', 'content-length': String(range ? 20 : a.bytes.length), 'accept-ranges': 'bytes',
      'content-disposition': "attachment; filename*=UTF-8''Robot%20Print.zip", ...(range ? { 'content-range': `bytes 10-29/${a.bytes.length}` } : {})
    } });
  };
  let left, right;
  left = new Duplex({ read() {}, write(c, _, done) { right.push(Buffer.from(c)); done(); } });
  right = new Duplex({ read() {}, write(c, _, done) { left.push(Buffer.from(c)); done(); } });
  const client = new Peer(left, key), server = new Peer(right, 'a'.repeat(64));
  server.handler = (_method, params) => SpotNode.prototype.proxyGet.call(host, key, params);
  t.after(() => { globalThis.fetch = originalFetch; client.destroy(); server.destroy(); });
  const remote = await client.request('get', { path: `api/models/${m.id}/download` }, { stream: true });
  const chunks = []; for await (const chunk of remote.stream) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), a.bytes); assert.match(remote.meta.headers['content-disposition'], /Robot%20Print.zip/);
  const range = await client.request('get', { path: `api/models/${m.id}/download`, range: 'bytes=10-29' }, { stream: true });
  const slice = []; for await (const chunk of range.stream) slice.push(chunk);
  assert.deepEqual(Buffer.concat(slice), a.bytes.subarray(10, 30)); assert.equal(range.meta.status, 206);
  grants = {};
  await assert.rejects(client.request('get', { path: `api/models/${m.id}/download` }), /Not shared/);
  assert.equal(requests.length, 2);
});
