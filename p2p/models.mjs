// ZIP model/animation packages. Only bounded preview/document files are extracted;
// the original archive is retained byte-for-byte for download.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';

export const MAX_MODEL_ZIP = 256 * 1024 * 1024;
export const MODEL_EXTENSIONS = new Set(['stl', '3mf', 'obj', 'blend', 'fbx', 'gltf', 'glb', 'step', 'stp', 'iges', 'igs', 'usd', 'usda', 'usdc', 'usdz', 'dae', 'ply', 'off', 'scad', 'f3d', 'f3z', 'fcstd', 'sldprt', 'sldasm', '3ds', 'max', 'ma', 'mb', 'abc', 'c4d', 'bvh', 'vdb', 'ztl', 'zpr', 'lwo', 'lws', 'dxf', 'dwg', 'skp', 'uasset', 'unitypackage', 'hda', 'hip', 'hiplc', 'pc2', 'mdd']);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', m4v: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', markdown: 'text/plain; charset=utf-8', rtf: 'application/rtf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text' };
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']);
const VIDEO = new Set(['mp4', 'webm', 'm4v', 'mov']);
const DOC = new Set(['pdf', 'txt', 'md', 'markdown', 'rtf', 'docx', 'odt']);
const identifier = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const ext = name => path.posix.extname(name).slice(1).toLowerCase();
const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit).trim() : '';

function below(root, relative) {
  root = fs.realpathSync(root);
  const result = path.resolve(root, ...relative.split('/'));
  if (!result.startsWith(root + path.sep)) throw new Error('Invalid model package path');
  let current = root;
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..' || /[\\:\x00]/.test(part)) throw new Error('Invalid model package path');
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Model storage cannot use symbolic links'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result;
}
function folder(root, id) {
  if (!/^(?:\.pending-)?[a-f0-9]{24}$/.test(id)) throw new Error('No such model package');
  return below(root, `content/models/${id}`);
}
function erase(root, id) {
  const target = folder(root, id), base = below(root, 'content/models');
  if (path.dirname(target) !== base) throw new Error('Invalid model deletion target');
  fs.rmSync(target, { recursive: true, force: true });
}
const readManifest = (root, id) => {
  if (!identifier(id)) throw new Error('No such model package');
  const value = JSON.parse(fs.readFileSync(below(root, `content/models/${id}/manifest.json`), 'utf8'));
  if (value.schema !== 1 || value.id !== id) throw new Error('Invalid model package');
  return value;
};

export function modelSummary(model) {
  return { id: model.id, title: model.title, description: model.description, author: model.author, license: model.license,
    sizeBytes: model.sizeBytes, fileCount: model.files.length, modelCount: model.files.filter(f => f.kind === 'model').length,
    formats: model.formats, previewCount: model.previews.length, documentCount: model.documents.length,
    coverAsset: model.previews[0] ? { id: model.previews[0].id, kind: model.previews[0].kind } : null,
    createdAt: model.createdAt, apiBase: `/api/models/${model.id}` };
}
export function listModels(root = process.cwd()) {
  const dir = below(root, 'content/models');
  if (!fs.existsSync(dir)) return [];
  const models = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !identifier(entry.name)) continue;
    try { models.push(modelSummary(readManifest(root, entry.name))); } catch {}
  }
  return models.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function getModel(id, root = process.cwd()) {
  const model = readManifest(root, id); return { ...model, ...modelSummary(model) };
}

function safeZipName(name) {
  if (!name || name.length > 500 || /^[\/]/.test(name) || /[\\:\x00-\x1f]/.test(name)) return false;
  return name.replace(/\/$/, '').split('/').every(part => part && part !== '.' && part !== '..');
}
function entryBytes(entry, limit) {
  // JSZip uses readable-stream v2, which has no async iterator on supported Node versions.
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer'), chunks = [];
    let size = 0, failed = false;
    stream.on('error', reject);
    stream.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true; stream.destroy(); reject(new Error('A preview or instruction file exceeds its size limit')); return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
  });
}
function metadata(value, fallback = {}) {
  const result = { ...fallback };
  for (const [key, limit] of Object.entries({ title: 160, description: 4000, author: 200, license: 400, printSettings: 12000, assembly: 12000 })) {
    if (typeof value?.[key] === 'string') result[key] = text(value[key], limit);
  }
  return result;
}

export async function importModel(archive, originalName, overrides = {}, root = process.cwd()) {
  const size = fs.statSync(archive).size;
  if (!size || size > MAX_MODEL_ZIP) throw new Error('Model ZIPs must be between 1 byte and 256 MB');
  if (path.extname(originalName).toLowerCase() !== '.zip') throw new Error('Upload a ZIP containing your model or animation files');
  const bytes = fs.readFileSync(archive), zip = await JSZip.loadAsync(bytes, { createFolders: false });
  const entries = Object.values(zip.files);
  if (entries.length > 5000) throw new Error('Model ZIPs may contain at most 5,000 entries');
  let expanded = 0;
  for (const entry of entries) {
    if (!safeZipName(entry.name) || (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)) throw new Error('The ZIP contains an unsafe file path');
    if ((Number(entry.unixPermissions) & 0o170000) === 0o120000) throw new Error('The ZIP contains a symbolic link');
    const count = entry.dir ? 0 : entry._data.uncompressedSize;
    if (!Number.isSafeInteger(count) || count < 0 || (expanded += count) > 2 * 1024 ** 3) throw new Error('The ZIP expands beyond the 2 GB package limit');
  }
  const all = entries.filter(e => !e.dir && !e.name.startsWith('__MACOSX/') && !path.posix.basename(e.name).startsWith('.'));
  const files = all.map(entry => ({ path: entry.name, sizeBytes: entry._data.uncompressedSize, format: ext(entry.name), kind: MODEL_EXTENSIONS.has(ext(entry.name)) ? 'model' : 'support' }));
  if (!files.some(f => f.kind === 'model')) throw new Error('Include a model or animation file, such as STL, 3MF, OBJ, BLEND, FBX, GLB or STEP');
  let embedded = {};
  const info = all.find(e => /(^|\/)model\.json$/i.test(e.name));
  if (info && info._data.uncompressedSize <= 64 * 1024) {
    try { embedded = metadata(JSON.parse((await entryBytes(info, 64 * 1024)).toString('utf8'))); } catch {}
  }
  const fileName = path.basename(originalName.replace(/\\/g, '/')).replace(/[\x00-\x1f]/g, '').slice(0, 160);
  const details = metadata(Object.fromEntries(Object.entries(overrides || {}).filter(([, value]) => typeof value === 'string' && value.trim())), embedded);
  details.title ||= text(fileName.replace(/\.zip$/i, '').replace(/[_-]+/g, ' '), 160) || 'Model package';
  const id = crypto.randomBytes(12).toString('hex'), pending = `.pending-${id}`, dir = folder(root, pending);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const previews = [], documents = [], warnings = [];
  let extracted = 0;
  try {
    // An explicit image/render folder takes priority over texture maps and support artwork.
    const visual = all.filter(e => IMAGE.has(ext(e.name)) || VIDEO.has(ext(e.name)));
    const dedicated = visual.filter(e => /(^|\/)(images?|previews?|renders?|screenshots?|pictures?|videos?|animations?)(\/|$)/i.test(e.name));
    const candidates = (dedicated.length ? dedicated : visual.filter(e => !/(^|\/)(textures?|materials?)(\/|$)/i.test(e.name)))
      .sort((a, b) => Number(VIDEO.has(ext(a.name))) - Number(VIDEO.has(ext(b.name))) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const docs = all.filter(e => DOC.has(ext(e.name)) || /(^|\/)(readme|instructions|assembly|printing|license)$/i.test(e.name))
      .sort((a, b) => Number(!/readme|instructions|assembly|print/i.test(a.name)) - Number(!/readme|instructions|assembly|print/i.test(b.name)) || a.name.localeCompare(b.name));
    if (candidates.length > 40) warnings.push('The first 40 previews are shown; the ZIP contains the rest.');
    if (docs.length > 20) warnings.push('The first 20 instruction documents are listed; the ZIP contains the rest.');
    for (const [kind, group] of [['preview', candidates.slice(0, 40)], ['document', docs.slice(0, 20)]]) {
      for (const entry of group) {
        const extension = ext(entry.name) || 'txt';
        const limit = kind === 'preview' ? (VIDEO.has(extension) ? 64 : 20) * 1024 ** 2 : extension === 'pdf' ? 32 * 1024 ** 2 : ['txt', 'md', 'markdown'].includes(extension) ? 1024 ** 2 : 20 * 1024 ** 2;
        if (entry._data.uncompressedSize > limit || extracted + entry._data.uncompressedSize > 256 * 1024 ** 2) {
          warnings.push(`${entry.name} is included in the ZIP but too large for an inline preview.`); continue;
        }
        let data;
        try { data = await entryBytes(entry, limit); }
        catch { warnings.push(`${entry.name} could not be previewed; it is still included in the original ZIP.`); continue; }
        const assetId = crypto.createHash('sha256').update(entry.name).digest('hex').slice(0, 24);
        fs.writeFileSync(path.join(dir, 'assets', `${assetId}.${extension}`), data);
        extracted += data.length;
        const asset = { id: assetId, name: entry.name, file: `assets/${assetId}.${extension}`, mime: MIME[extension] || 'text/plain; charset=utf-8', sizeBytes: data.length,
          kind: kind === 'preview' ? VIDEO.has(extension) ? 'video' : 'image' : extension === 'pdf' ? 'pdf' : ['txt', 'md', 'markdown'].includes(extension) ? 'text' : 'document' };
        (kind === 'preview' ? previews : documents).push(asset);
      }
    }
    const model = { schema: 1, id, ...details, fileName, sizeBytes: size, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), createdAt: new Date().toISOString(),
      formats: [...new Set(files.filter(f => f.kind === 'model').map(f => f.format.toUpperCase()))], files, previews, documents, warnings };
    fs.copyFileSync(archive, path.join(dir, 'package.zip'));
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(model, null, 2));
    fs.renameSync(dir, folder(root, id));
    return model;
  } catch (error) { erase(root, pending); throw error; }
}

export function editModel(id, updates, root = process.cwd()) {
  const previous = readManifest(root, id), next = { ...previous, ...metadata(updates) };
  if (!next.title) throw new Error('Give the model package a title');
  const file = below(root, `content/models/${id}/manifest.json`), temp = below(root, `content/models/${id}/manifest.tmp`);
  fs.writeFileSync(temp, JSON.stringify(next, null, 2)); fs.renameSync(temp, file);
  return next;
}
export function deleteModel(id, root = process.cwd()) {
  if (!identifier(id)) throw new Error('No such model package');
  readManifest(root, id); erase(root, id);
}
export function modelFile(id, asset, root = process.cwd()) {
  const model = readManifest(root, id);
  if (asset === 'download') return { file: below(root, `content/models/${id}/package.zip`), mime: 'application/zip', name: model.fileName, attachment: true };
  if (!identifier(asset)) throw new Error('No such model asset');
  const entry = [...model.previews, ...model.documents].find(item => item.id === asset);
  if (!entry || !/^assets\/[a-f0-9]{24}\.[a-z0-9]+$/.test(entry.file)) throw new Error('No such model asset');
  return { file: below(root, `content/models/${id}/${entry.file}`), mime: entry.mime, name: path.posix.basename(entry.name), attachment: entry.kind === 'document' };
}

export function modelRequestAllowed(grants, parts, now = Date.now()) {
  if (parts[0] !== 'api' || parts[1] !== 'models' || !identifier(parts[2])) return false;
  const grant = grants?.[`model:${parts[2]}`] || grants?.['model:*'];
  // An expired exact grant must not mask a still-active category grant.
  const live = g => !!g && (!g.until || g.until > now);
  if (!live(grant) && !live(grants?.['model:*'])) return false;
  return parts.length === 3 || (parts.length === 4 && parts[3] === 'download') || (parts.length === 5 && parts[3] === 'asset' && identifier(parts[4]));
}
