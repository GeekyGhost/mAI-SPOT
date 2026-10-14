// Persistent state for the peer-to-peer layer. Lives in data/ next to db.json:
//   data/identity.json  — this node's ed25519 keypair (keep it private; it IS your identity)
//   data/social.json    — friends, requests, messages, groups, posts, cached friend posts
// Everything is kept in memory and written back (atomically, debounced) on change.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import DHT from 'hyperdht';

const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'db.json');
const IDENTITY_PATH = path.join(DATA_DIR, 'identity.json');
const SOCIAL_PATH = path.join(DATA_DIR, 'social.json');
export const CONTENT_DIR = path.join(ROOT, 'content');
export const PEER_CACHE = path.join(CONTENT_DIR, '.peers');

export const newId = () => crypto.randomBytes(9).toString('hex');

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, text, 'utf8');
    try { fs.unlinkSync(tmp); } catch {}
  }
}

export function loadIdentity() {
  try {
    const j = JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8'));
    if (j.publicKey && j.secretKey) {
      return { publicKey: Buffer.from(j.publicKey, 'hex'), secretKey: Buffer.from(j.secretKey, 'hex') };
    }
  } catch {}
  const kp = DHT.keyPair();
  writeAtomic(
    IDENTITY_PATH,
    JSON.stringify(
      {
        note: 'This is your mAI Spot identity. Anyone with the secretKey can pose as you. Back it up; never share it.',
        publicKey: kp.publicKey.toString('hex'),
        secretKey: kp.secretKey.toString('hex'),
        createdAt: new Date().toISOString()
      },
      null,
      2
    )
  );
  return kp;
}

const EMPTY = () => ({
  version: 1,
  friends: {},
  requests: { incoming: {}, outgoing: {} },
  blocked: [],
  messages: {},
  unread: {},
  groups: {},
  posts: [],
  feed: {},
  // Per-friend grants live on each friend (friends[key].grants). These are the settings around them.
  access: {
    defaults: ['station:*', 'playlist:*', 'channel:*', 'collection:*', 'album:*', 'reel'],
    requireInvite: true,
    shareNowPlaying: true
  },
  // One-time invite links: token -> { label, createdAt, expiresAt, usedBy?, usedAt?, grants }
  invites: {}
});

/** Older social.json files had four on/off switches for everyone; turn them into per-friend grants. */
function migrate(st) {
  if (!st.access) {
    const sh = st.sharing || { music: true, videos: true, radio: true, pictures: true };
    const defaults = [];
    if (sh.radio || sh.music) defaults.push('station:*');
    if (sh.music) defaults.push('playlist:*');
    if (sh.videos) defaults.push('channel:*', 'collection:*');
    if (sh.pictures) defaults.push('reel', 'album:*');
    // From now on only one-time invite links get a request through (existing friends are unaffected).
    st.access = { defaults, requireInvite: true, shareNowPlaying: true };
    for (const f of Object.values(st.friends || {})) {
      if (!f.grants) f.grants = Object.fromEntries(defaults.map(d => [d, {}]));
    }
  }
  st.access = { ...EMPTY().access, ...st.access };
  st.invites = st.invites || {};
  delete st.sharing;
}

let state = null;
let saveTimer = null;

export function social() {
  if (state) return state;
  try {
    const loaded = JSON.parse(fs.readFileSync(SOCIAL_PATH, 'utf8'));
    migrate(loaded);
    state = { ...EMPTY(), ...loaded };
    state.requests = { incoming: {}, outgoing: {}, ...(state.requests || {}) };
  } catch {
    state = EMPTY();
  }
  // Nobody is online until they connect.
  for (const f of Object.values(state.friends)) f.online = false;
  return state;
}

export function save(now = false) {
  if (!state) return;
  clearTimeout(saveTimer);
  const doSave = () => writeAtomic(SOCIAL_PATH, JSON.stringify(state, null, 1));
  if (now) doSave();
  else saveTimer = setTimeout(doSave, 250);
}

// ── db.json (owned by the Next.js side; we read it, and write only profile fields) ──
let dbCache = { mtime: 0, db: null };
export function readDb() {
  try {
    const mtime = fs.statSync(DB_PATH).mtimeMs;
    if (mtime !== dbCache.mtime) dbCache = { mtime, db: JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) };
    return dbCache.db;
  } catch {
    return null;
  }
}

export function updateDbProfile(updates) {
  const db = readDb();
  if (!db) return null;
  const fresh = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); // never write from a stale cache
  fresh.profile = { ...fresh.profile, ...updates };
  writeAtomic(DB_PATH, JSON.stringify(fresh, null, 2));
  dbCache = { mtime: 0, db: null };
  return fresh.profile;
}
