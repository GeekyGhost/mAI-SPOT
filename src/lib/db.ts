import fs from 'fs';
import path from 'path';
import {
  DB_PATH,
  DATA_DIR,
  ROOT,
  APPS_DIR,
  AUDIO_DIR,
  VIDEO_DIR,
  THUMB_DIR,
  BOOKS_DIR,
  ensureDirs,
  formatBytes
} from './paths';
import {
  defaultProfile,
  defaultTheme,
  defaultLayout,
  defaultGames,
  ALL_SECTIONS,
  DEFAULT_COLUMNS,
  DEFAULT_LOOK
} from './defaults';
import type {
  SectionKey,
  DatabaseSchema,
  Track,
  Video,
  Channel,
  StationProfile,
  StationTheme,
  LayoutConfig,
  Game,
  Contact,
  DirectMessage,
  GroupChat,
  FriendPost,
  MediaAsset,
  Playlist,
  RadioStation,
  Collection,
  Book
} from './types';

// Re-export the shared types so existing `import { Track } from '@/lib/db'` keeps working.
export * from './types';

const SCHEMA_VERSION = 5;

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function emptyDatabase(): DatabaseSchema {
  return {
    schemaVersion: SCHEMA_VERSION,
    users: [],
    channels: [
      {
        id: 'chan_my_station',
        userId: 'user_default',
        channelName: 'My Personal Radio',
        handle: '@mystation',
        avatar: '/api/media/thumbnails/thumb_highway.svg',
        genre: 'Mixed',
        subscribers: 0,
        description: 'My personal uploads.'
      }
    ],
    tracks: [],
    videos: [],
    genres: ['Movies', 'Series', 'Music Videos', 'Documentary', 'Anime'],
    playlists: [],
    stations: [],
    collections: [],
    watchProgress: {},
    books: [],
    profile: defaultProfile,
    theme: defaultTheme,
    layout: defaultLayout,
    games: defaultGames,
    reactions: [],
    // Social data now lives in data/social.json (peer-to-peer layer).
    contacts: [],
    messages: [],
    groupChats: [],
    feedPosts: []
  };
}

const LEGACY_GAME_GENRES: Record<string, string> = {
  'Retro Arcade': 'Arcade',
  'Sports / Action': 'Sports',
  'Indie Game': 'Arcade'
};

/** Bring an older db.json up to the current schema. Returns true if anything changed. */
function migrate(db: DatabaseSchema): boolean {
  let changed = false;
  const now = new Date().toISOString();

  if (!db.profile) { db.profile = defaultProfile; changed = true; }
  if (!db.theme) { db.theme = defaultTheme; changed = true; }
  if (!db.layout) { db.layout = defaultLayout; changed = true; }
  if (!db.layout.visualizerMode) { db.layout.visualizerMode = 'spectrum'; changed = true; }
  if (!db.games) { db.games = defaultGames; changed = true; }
  if (!db.reactions) { db.reactions = []; changed = true; }
  if (!db.contacts) { db.contacts = []; changed = true; }
  if (!db.messages) { db.messages = []; changed = true; }
  if (!db.groupChats) { db.groupChats = []; changed = true; }
  if (!db.feedPosts) { db.feedPosts = []; changed = true; }
  if (!db.users) { db.users = []; changed = true; }
  if (!db.channels) { db.channels = emptyDatabase().channels; changed = true; }
  if (!db.tracks) { db.tracks = []; changed = true; }
  if (!db.videos) { db.videos = []; changed = true; }
  if (!db.genres) { db.genres = []; changed = true; }
  if (!db.playlists) { db.playlists = []; changed = true; }
  if (!db.collections) { db.collections = []; changed = true; }
  if (!db.watchProgress) { db.watchProgress = {}; changed = true; }
  if (!db.books) { db.books = []; changed = true; }

  if ((db.schemaVersion || 1) < 2) {
    // Games & apps: new kind/slug fields, entry points served from content/apps.
    for (const g of db.games) {
      if (!g.kind) g.kind = 'game';
      const legacy = g.entryPoint?.match(/^\/arcade\/([^/]+)\//);
      if (legacy) {
        g.slug = legacy[1];
        g.entryPoint = `/api/apps/run/${legacy[1]}/index.html`;
      }
      if (LEGACY_GAME_GENRES[g.genre]) g.genre = LEGACY_GAME_GENRES[g.genre];
    }
    // Move bundled games out of /public so they get the sandbox CSP.
    const legacyArcade = path.join(ROOT, 'public', 'arcade');
    if (fs.existsSync(legacyArcade)) {
      for (const dir of fs.readdirSync(legacyArcade)) {
        const dest = path.join(APPS_DIR, dir);
        if (!fs.existsSync(dest)) {
          try {
            fs.cpSync(path.join(legacyArcade, dir), dest, { recursive: true });
          } catch (e) {
            console.warn('[mAI Spot] could not copy legacy arcade game', dir, e);
          }
        }
      }
    }
    // One invite scheme everywhere: spot://
    for (const c of db.contacts) {
      if (c.stationUrl?.startsWith('station://')) c.stationUrl = c.stationUrl.replace('station://', 'spot://');
    }
    for (const m of db.messages) {
      m.content = m.content.replace(/the Winamp playlist/gi, 'my PulseAmp playlist');
    }
    // Seed radio stations from the genres already in the library.
    if (!db.stations || db.stations.length === 0) {
      db.stations = [
        {
          id: 'station_spotfm',
          name: 'mAI Spot FM',
          tagline: 'Everything on this node, shuffled around the clock.',
          source: { type: 'all' },
          shuffle: true,
          isLive: false,
          createdAt: now
        }
      ];
      const trackGenres = Array.from(new Set(db.tracks.map(t => t.genre))).filter(Boolean);
      for (const g of trackGenres) {
        db.stations.push({
          id: newId('station'),
          name: `${g} Radio`,
          tagline: `Non-stop ${g}.`,
          source: { type: 'genre', value: g },
          shuffle: true,
          isLive: false,
          createdAt: now
        });
      }
    }
    // Seed two collections so the Cinema rows aren't empty on first run.
    if (db.collections.length === 0 && db.videos.length > 0) {
      const pick = (genres: string[]) => db.videos.filter(v => genres.includes(v.genre)).map(v => v.id);
      const night = pick(['Synthwave', 'Sci-Fi']);
      const chill = pick(['Lo-Fi', 'Rock']);
      if (night.length) {
        db.collections.push({ id: newId('coll'), name: 'Late Night Transmissions', description: 'Neon highways and deep space.', videoIds: night, createdAt: now });
      }
      if (chill.length) {
        db.collections.push({ id: newId('coll'), name: 'Study & Chill', description: 'Background sessions to work to.', videoIds: chill, createdAt: now });
      }
    }
    // The old default genre filters didn't match the actual library; follow the library instead.
    const vGenres = Array.from(new Set(db.videos.map(v => v.genre))).filter(Boolean);
    if (!db.layout.activeVideoGenres?.some(g => vGenres.includes(g))) db.layout.activeVideoGenres = vGenres;
    const mGenres = Array.from(new Set(db.tracks.map(t => t.genre))).filter(Boolean);
    if (!db.layout.activeMusicGenres?.some(g => mGenres.includes(g))) db.layout.activeMusicGenres = mGenres;
    db.schemaVersion = 2;
    changed = true;
  }
  if (!db.stations) { db.stations = []; changed = true; }
  if ((db.schemaVersion || 1) < 3) {
    // The pre-P2P demo friends, messages and posts were sample data; real ones live in data/social.json.
    db.contacts = [];
    db.messages = [];
    db.groupChats = [];
    db.feedPosts = [];
    db.reactions = db.reactions.filter(r => !r.voterPubkey.startsWith('ed25519_'));
    // The #tag after a handle now comes from the node's real public key.
    if (db.profile?.handle) db.profile.handle = db.profile.handle.replace(/#\w+$/, '');
    db.schemaVersion = 3;
    changed = true;
  }
  if ((db.schemaVersion || 1) < 5) {
    // Three-column Spot: new widgets (library, friends, feed, clock, note) and where each one sits.
    const l = db.layout;
    for (const k of ALL_SECTIONS) if (!l.sectionOrder.includes(k)) l.sectionOrder.push(k);
    for (const k of ['library', 'friends', 'feed', 'clock'] as SectionKey[]) if (!l.enabledSections.includes(k)) l.enabledSections.push(k);
    l.columns = { ...DEFAULT_COLUMNS, ...(l.columns || {}) };
    l.look = { ...DEFAULT_LOOK, ...(l.look || {}) };
    l.note = l.note || defaultLayout.note;
    l.clock = l.clock || defaultLayout.clock;
  }
  if ((db.schemaVersion || 1) < 4) {
    // Spots made before the welcome setup existed are already set up.
    if (db.profile && db.profile.setupDone === undefined) db.profile.setupDone = true;
    db.schemaVersion = 4;
    changed = true;
  }
  if ((db.schemaVersion || 1) < 5) {
    db.schemaVersion = 5;
    changed = true;
  }
  return changed;
}

export function getDatabase(): DatabaseSchema {
  ensureDirs();
  if (!fs.existsSync(DB_PATH)) {
    const fresh = emptyDatabase();
    saveDatabase(fresh);
    return fresh;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as DatabaseSchema;
  if (migrate(db)) saveDatabase(db);
  return db;
}

/** Atomic write: write a temp file then rename over db.json so a crash can't truncate it. */
export function saveDatabase(data: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
  const json = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch {
    // Windows can refuse the rename if something (AV, indexer) holds the file.
    fs.writeFileSync(DB_PATH, json, 'utf8');
    try { fs.unlinkSync(tmp); } catch {}
  }
}

/** Read-modify-write helper. */
export function mutate<T>(fn: (db: DatabaseSchema) => T): T {
  const db = getDatabase();
  const result = fn(db);
  saveDatabase(db);
  return result;
}

// ───────────────────────── Tracks / videos / channels ─────────────────────────

export function getAllTracks(): Track[] {
  return getDatabase().tracks;
}

export function getAllVideos(genre?: string): Video[] {
  const db = getDatabase();
  if (!genre || genre === 'All Genres') return db.videos;
  return db.videos.filter(v => v.genre.toLowerCase() === genre.toLowerCase());
}

export function getAllChannels(): Channel[] {
  return getDatabase().channels;
}

export function addTrack(track: Omit<Track, 'id' | 'plays' | 'createdAt'>): Track {
  return mutate(db => {
    const t: Track = { ...track, id: newId('track'), plays: 0, createdAt: new Date().toISOString() };
    db.tracks.unshift(t);
    return t;
  });
}

export function updateTrack(id: string, updates: Partial<Track>): Track | null {
  return mutate(db => {
    const t = db.tracks.find(x => x.id === id);
    if (!t) return null;
    const { id: _id, filePath: _fp, createdAt: _c, ...rest } = updates;
    Object.assign(t, rest);
    return t;
  });
}

export function addVideo(video: Omit<Video, 'id' | 'views' | 'createdAt'>): Video {
  return mutate(db => {
    const v: Video = { ...video, id: newId('vid'), views: 0, createdAt: new Date().toISOString() };
    db.videos.unshift(v);
    if (v.genre && !db.genres.includes(v.genre)) db.genres.push(v.genre);
    return v;
  });
}

export function updateVideo(id: string, updates: Partial<Video>): Video | null {
  return mutate(db => {
    const v = db.videos.find(x => x.id === id);
    if (!v) return null;
    const { id: _id, filePath: _fp, createdAt: _c, ...rest } = updates;
    Object.assign(v, rest);
    if (rest.channelId) {
      const ch = db.channels.find(c => c.id === rest.channelId);
      if (ch) v.channelName = ch.channelName;
    }
    if (v.genre && !db.genres.includes(v.genre)) db.genres.push(v.genre);
    return v;
  });
}

export function createChannel(channel: Omit<Channel, 'id' | 'subscribers'>): Channel {
  return mutate(db => {
    const c: Channel = { ...channel, id: newId('chan'), subscribers: 0 };
    db.channels.push(c);
    return c;
  });
}

export function updateChannel(id: string, updates: Partial<Channel>): Channel | null {
  return mutate(db => {
    const c = db.channels.find(x => x.id === id);
    if (!c) return null;
    const { id: _id, ...rest } = updates;
    Object.assign(c, rest);
    if (rest.channelName) db.videos.forEach(v => { if (v.channelId === id) v.channelName = c.channelName; });
    return c;
  });
}

export function deleteChannel(id: string): boolean {
  if (id === 'chan_my_station') return false;
  return mutate(db => {
    const before = db.channels.length;
    db.channels = db.channels.filter(c => c.id !== id);
    db.videos.forEach(v => {
      if (v.channelId === id) {
        v.channelId = 'chan_my_station';
        v.channelName = db.channels.find(c => c.id === 'chan_my_station')?.channelName || 'My Channel';
      }
    });
    return db.channels.length !== before;
  });
}

// ───────────────────────── Playlists ─────────────────────────

export function createPlaylist(p: Partial<Playlist>): Playlist {
  return mutate(db => {
    const now = new Date().toISOString();
    const pl: Playlist = {
      id: newId('pl'),
      name: p.name?.trim() || 'New Playlist',
      description: p.description || '',
      cover: p.cover,
      trackIds: (p.trackIds || []).filter(id => db.tracks.some(t => t.id === id)),
      createdAt: now,
      updatedAt: now
    };
    db.playlists.unshift(pl);
    return pl;
  });
}

export function updatePlaylist(id: string, updates: Partial<Playlist>): Playlist | null {
  return mutate(db => {
    const pl = db.playlists.find(p => p.id === id);
    if (!pl) return null;
    if (updates.name !== undefined) pl.name = updates.name.trim() || pl.name;
    if (updates.description !== undefined) pl.description = updates.description;
    if (updates.cover !== undefined) pl.cover = updates.cover || undefined;
    if (updates.trackIds) pl.trackIds = updates.trackIds.filter(tid => db.tracks.some(t => t.id === tid));
    pl.updatedAt = new Date().toISOString();
    return pl;
  });
}

export function deletePlaylist(id: string): void {
  mutate(db => {
    db.playlists = db.playlists.filter(p => p.id !== id);
    db.stations.forEach(s => {
      if (s.source.type === 'playlist' && s.source.value === id) {
        s.source = { type: 'all' };
      }
    });
  });
}

// ───────────────────────── Radio stations ─────────────────────────

export function createStation(s: Partial<RadioStation>): RadioStation {
  return mutate(db => {
    const st: RadioStation = {
      id: newId('station'),
      name: s.name?.trim() || 'New Station',
      tagline: s.tagline || '',
      cover: s.cover,
      source: s.source || { type: 'all' },
      shuffle: s.shuffle ?? true,
      isLive: false,
      createdAt: new Date().toISOString()
    };
    db.stations.push(st);
    return st;
  });
}

export function updateStation(id: string, updates: Partial<RadioStation>): RadioStation | null {
  return mutate(db => {
    const st = db.stations.find(s => s.id === id);
    if (!st) return null;
    const { id: _id, isLive: _l, liveSince: _ls, order: _o, createdAt: _c, ...rest } = updates;
    Object.assign(st, rest);
    return st;
  });
}

export function deleteStation(id: string): void {
  mutate(db => {
    db.stations = db.stations.filter(s => s.id !== id);
  });
}

// ───────────────────────── Collections & watch progress ─────────────────────────

export function createCollection(c: Partial<Collection>): Collection {
  return mutate(db => {
    const col: Collection = {
      id: newId('coll'),
      name: c.name?.trim() || 'New Collection',
      description: c.description || '',
      cover: c.cover,
      videoIds: (c.videoIds || []).filter(id => db.videos.some(v => v.id === id)),
      createdAt: new Date().toISOString()
    };
    db.collections.push(col);
    return col;
  });
}

export function updateCollection(id: string, updates: Partial<Collection>): Collection | null {
  return mutate(db => {
    const col = db.collections.find(c => c.id === id);
    if (!col) return null;
    if (updates.name !== undefined) col.name = updates.name.trim() || col.name;
    if (updates.description !== undefined) col.description = updates.description;
    if (updates.cover !== undefined) col.cover = updates.cover || undefined;
    if (updates.videoIds) col.videoIds = updates.videoIds.filter(vid => db.videos.some(v => v.id === vid));
    return col;
  });
}

export function deleteCollection(id: string): void {
  mutate(db => {
    db.collections = db.collections.filter(c => c.id !== id);
  });
}

export function saveWatchProgress(videoId: string, position: number, duration: number): void {
  mutate(db => {
    if (!db.videos.some(v => v.id === videoId)) return;
    // Treat the last 5% as "finished" so it drops off Continue Watching.
    if (duration > 0 && position / duration > 0.95) {
      delete db.watchProgress[videoId];
    } else {
      db.watchProgress[videoId] = { position, duration, updatedAt: new Date().toISOString() };
    }
  });
}

export function recordVideoView(videoId: string): void {
  mutate(db => {
    const v = db.videos.find(x => x.id === videoId);
    if (v) v.views += 1;
  });
}

export function recordTrackPlay(trackId: string): void {
  mutate(db => {
    const t = db.tracks.find(x => x.id === trackId);
    if (t) t.plays += 1;
  });
}

// ───────────────────────── Books ─────────────────────────

export function getBooks(): Book[] {
  return getDatabase().books;
}

export function updateBook(id: string, updates: Partial<Book>): Book | null {
  return mutate(db => {
    const b = db.books.find(x => x.id === id);
    if (!b) return null;
    const { id: _id, fileName: _f, format: _fmt, createdAt: _c, sizeBytes: _s, ...rest } = updates;
    Object.assign(b, rest);
    return b;
  });
}

// ───────────────────────── Station profile, theme & layout ─────────────────────────

export function getStationProfile(): StationProfile {
  return getDatabase().profile;
}

const PROFILE_FIELDS: (keyof StationProfile)[] = [
  'stationName', 'displayName', 'handle', 'avatar', 'banner', 'bio', 'moodBlurb', 'pictureReel', 'sentimentMode',
  'soundEnabled', 'soundTheme', 'soundVolume', 'statusMode', 'isOnline', 'setupDone'
];

export function updateStationProfile(updates: Partial<StationProfile>): StationProfile {
  const clean: Partial<StationProfile> = {};
  for (const k of PROFILE_FIELDS) if (k in updates) (clean as Record<string, unknown>)[k] = updates[k];
  if (typeof clean.handle === 'string') {
    const h = clean.handle.trim().replace(/^@*/, '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 32);
    clean.handle = h ? `@${h}` : '';
  }
  for (const k of ['stationName', 'displayName'] as const) if (typeof clean[k] === 'string') clean[k] = (clean[k] as string).slice(0, 80);
  if (typeof clean.bio === 'string') clean.bio = clean.bio.slice(0, 2000);
  if (typeof clean.moodBlurb === 'string') clean.moodBlurb = clean.moodBlurb.slice(0, 280);
  if (Array.isArray(clean.pictureReel)) clean.pictureReel = clean.pictureReel.filter(x => typeof x === 'string').slice(0, 24);
  return mutate(db => {
    db.profile = { ...db.profile, ...clean };
    return db.profile;
  });
}

export function getStationTheme(): StationTheme {
  return getDatabase().theme;
}

export function updateStationTheme(updates: Partial<StationTheme>): StationTheme {
  return mutate(db => {
    db.theme = { ...db.theme, ...updates };
    return db.theme;
  });
}

export function getLayoutConfig(): LayoutConfig {
  return getDatabase().layout;
}

export function updateLayoutConfig(updates: Partial<LayoutConfig>): LayoutConfig {
  return mutate(db => {
    db.layout = { ...db.layout, ...updates };
    if (db.layout.note) db.layout.note = { text: String(db.layout.note.text || '').slice(0, 600), color: String(db.layout.note.color || '#ffcf33').slice(0, 20) };
    return db.layout;
  });
}

// ───────────────────────── Games & apps ─────────────────────────

export function getAllGames(): Game[] {
  return getDatabase().games;
}

export function addGame(game: Omit<Game, 'id' | 'plays' | 'likes' | 'dislikes' | 'createdAt'>): Game {
  return mutate(db => {
    const g: Game = { ...game, id: newId('game'), plays: 0, likes: 0, dislikes: 0, createdAt: new Date().toISOString() };
    db.games.unshift(g);
    return g;
  });
}

export function updateGame(id: string, updates: Partial<Game>): Game | null {
  return mutate(db => {
    const g = db.games.find(x => x.id === id);
    if (!g) return null;
    const { id: _id, slug: _s, entryPoint: _e, createdAt: _c, ...rest } = updates;
    Object.assign(g, rest);
    return g;
  });
}

export function recordGamePlay(gameId: string): void {
  mutate(db => {
    const g = db.games.find(x => x.id === gameId);
    if (g) g.plays += 1;
  });
}

// ───────────────────────── Reactions ─────────────────────────

export function getReactions(targetId?: string): { likes: number; dislikes: number; userVote?: 'like' | 'dislike' } {
  const db = getDatabase();
  const target = targetId || 'station';
  const matching = db.reactions.filter(r => r.targetId === target);
  const myVote = matching.find(r => r.voterPubkey === 'my_client');
  return {
    likes: matching.filter(r => r.type === 'like').length,
    dislikes: matching.filter(r => r.type === 'dislike').length,
    userVote: myVote?.type
  };
}

export function toggleReaction(targetId: string, type: 'like' | 'dislike', voterPubkey: string = 'my_client'): { likes: number; dislikes: number } {
  return mutate(db => {
    const idx = db.reactions.findIndex(r => r.targetId === targetId && r.voterPubkey === voterPubkey);
    if (idx >= 0) {
      if (db.reactions[idx].type === type) db.reactions.splice(idx, 1);
      else {
        db.reactions[idx].type = type;
        db.reactions[idx].timestamp = new Date().toISOString();
      }
    } else {
      db.reactions.push({ targetId, voterPubkey, type, timestamp: new Date().toISOString() });
    }
    const matching = db.reactions.filter(r => r.targetId === targetId);
    return {
      likes: matching.filter(r => r.type === 'like').length,
      dislikes: matching.filter(r => r.type === 'dislike').length
    };
  });
}

// ───────────────────────── OmniPager (local demo of the P2P messenger) ─────────────────────────

export function getContacts(): Contact[] {
  return getDatabase().contacts;
}

export function updateContactStatus(pubkey: string, status: Contact['status']): Contact[] {
  return mutate(db => {
    const c = db.contacts.find(x => x.pubkey === pubkey);
    if (c) {
      c.status = status;
      c.lastSeen = status === 'online' ? 'Just now' : new Date().toLocaleTimeString();
    }
    return db.contacts;
  });
}

export function getDirectMessages(conversationId: string): DirectMessage[] {
  const db = getDatabase();
  return db.messages.filter(
    m =>
      m.conversationId === conversationId ||
      (m.senderPubkey === conversationId && m.recipientPubkey === 'station_owner') ||
      (m.senderPubkey === 'station_owner' && m.recipientPubkey === conversationId)
  );
}

export function sendDirectMessage(recipientPubkey: string, content: string): DirectMessage {
  return mutate(db => {
    const recipient = db.contacts.find(c => c.pubkey === recipientPubkey);
    const msg: DirectMessage = {
      id: newId('msg'),
      conversationId: recipientPubkey,
      senderPubkey: 'station_owner',
      recipientPubkey,
      content,
      timestamp: new Date().toISOString(),
      status: recipient?.status === 'online' ? 'delivered' : 'queued'
    };
    db.messages.push(msg);
    return msg;
  });
}

export function flushOutbox(recipientPubkey: string): number {
  return mutate(db => {
    let n = 0;
    db.messages.forEach(m => {
      if (m.recipientPubkey === recipientPubkey && m.status === 'queued') {
        m.status = 'delivered';
        n++;
      }
    });
    return n;
  });
}

export function getGroupChats(): GroupChat[] {
  return getDatabase().groupChats;
}

export function sendGroupMessage(groupId: string, content: string): GroupChat | null {
  return mutate(db => {
    const group = db.groupChats.find(g => g.id === groupId);
    if (!group) return null;
    group.messages.push({
      id: newId('gmsg'),
      senderPubkey: 'station_owner',
      senderHandle: db.profile.displayName || db.profile.stationName || 'Station Host',
      content,
      timestamp: new Date().toISOString()
    });
    return group;
  });
}

// ───────────────────────── Friend feed ─────────────────────────

export function getFeedPosts(): FriendPost[] {
  return getDatabase().feedPosts;
}

export function addFeedPost(post: Omit<FriendPost, 'id' | 'likes' | 'timestamp'>): FriendPost {
  return mutate(db => {
    const p: FriendPost = { ...post, id: newId('post'), likes: 0, timestamp: new Date().toISOString() };
    db.feedPosts.unshift(p);
    return p;
  });
}

export function likeFeedPost(postId: string): { likes: number; likedByMe: boolean } {
  return mutate(db => {
    const post = db.feedPosts.find(p => p.id === postId);
    if (!post) return { likes: 0, likedByMe: false };
    if (post.likedByMe) {
      post.likes = Math.max(0, post.likes - 1);
      post.likedByMe = false;
    } else {
      post.likes += 1;
      post.likedByMe = true;
    }
    return { likes: post.likes, likedByMe: post.likedByMe };
  });
}

/** Normalise any invite form (spot://, legacy station://, @handle) to spot://handle#key */
export function normalizeSpotUrl(input: string): { url: string; handle: string } {
  let raw = input.trim();
  if (raw.startsWith('station://')) raw = 'spot://' + raw.slice('station://'.length);
  if (raw.startsWith('spot://')) {
    const body = raw.slice('spot://'.length);
    const name = body.split('#')[0];
    return { url: raw, handle: `@${name}` };
  }
  const name = raw.replace(/^@/, '').split('#')[0];
  return { url: `spot://${name}#node`, handle: `@${name}` };
}

export function saveFriendSpot(spotUrl: string, handle?: string, displayName?: string, avatar?: string): Contact {
  return mutate(db => {
    const norm = normalizeSpotUrl(spotUrl);
    const cleanHandle = handle || norm.handle;
    const existing = db.contacts.find(
      c => c.stationUrl === norm.url || c.handle.toLowerCase() === cleanHandle.toLowerCase()
    );
    if (existing) {
      existing.lastSeen = 'Just now';
      return existing;
    }
    const contact: Contact = {
      pubkey: `peer_${Date.now().toString(36)}`,
      handle: cleanHandle,
      displayName: displayName || cleanHandle,
      avatar: avatar || '/api/media/thumbnails/thumb_drift.svg',
      // Real presence needs the P2P layer; until then a saved Spot starts offline.
      status: 'offline',
      moodBlurb: '',
      stationUrl: norm.url,
      lastSeen: 'Never'
    };
    db.contacts.push(contact);
    return contact;
  });
}

export function removeContact(pubkey: string): Contact[] {
  return mutate(db => {
    db.contacts = db.contacts.filter(c => c.pubkey !== pubkey);
    return db.contacts;
  });
}

// ───────────────────────── Asset library (Studio → Assets) ─────────────────────────

export function getAssetLibrary(): MediaAsset[] {
  const assets: MediaAsset[] = [];
  const db = getDatabase();

  const scan = (dir: string, type: MediaAsset['type'], urlBase: string, title: (f: string) => string | undefined) => {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith('.')) continue;
      try {
        const stat = fs.statSync(path.join(dir, file));
        if (!stat.isFile()) continue;
        assets.push({
          filename: file,
          type,
          url: `${urlBase}/${encodeURIComponent(file)}`,
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          updatedAt: stat.mtime.toISOString(),
          associatedTitle: title(file) || file
        });
      } catch {}
    }
  };

  scan(AUDIO_DIR, 'audio', '/api/media/audio', f => db.tracks.find(t => t.filePath.endsWith('/' + f))?.title);
  scan(VIDEO_DIR, 'video', '/api/media/video', f => db.videos.find(v => v.filePath.endsWith('/' + f))?.title);
  scan(THUMB_DIR, 'thumbnail', '/api/media/thumbnails', () => undefined);
  scan(BOOKS_DIR, 'book', '/api/media/books', f => db.books.find(b => b.fileName === f)?.title);

  if (fs.existsSync(APPS_DIR)) {
    for (const dir of fs.readdirSync(APPS_DIR)) {
      try {
        const stat = fs.statSync(path.join(APPS_DIR, dir));
        if (!stat.isDirectory()) continue;
        const g = db.games.find(x => x.slug === dir);
        assets.push({
          filename: dir,
          type: 'game',
          url: `/api/apps/run/${dir}/index.html`,
          sizeBytes: 0,
          sizeFormatted: g?.kind === 'app' ? 'HTML5 App' : 'HTML5 Game',
          updatedAt: stat.mtime.toISOString(),
          associatedTitle: g?.title || dir
        });
      } catch {}
    }
  }
  return assets;
}

/** Delete a file from the library and everything in the database that points at it. */
export function deleteAsset(type: string, filename: string): boolean {
  const base = path.basename(filename);
  const dirs: Record<string, string> = {
    audio: AUDIO_DIR,
    video: VIDEO_DIR,
    thumbnail: THUMB_DIR,
    book: BOOKS_DIR,
    game: APPS_DIR
  };
  const dir = dirs[type];
  if (!dir) return false;
  const target = path.join(dir, base);
  if (!fs.existsSync(target)) return false;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (e) {
    console.error('Failed to delete asset:', e);
    return false;
  }
  mutate(db => {
    if (type === 'audio') {
      const gone = db.tracks.filter(t => t.filePath.endsWith('/' + base)).map(t => t.id);
      db.tracks = db.tracks.filter(t => !gone.includes(t.id));
      db.playlists.forEach(p => (p.trackIds = p.trackIds.filter(id => !gone.includes(id))));
    } else if (type === 'video') {
      const gone = db.videos.filter(v => v.filePath.endsWith('/' + base)).map(v => v.id);
      db.videos = db.videos.filter(v => !gone.includes(v.id));
      db.collections.forEach(c => (c.videoIds = c.videoIds.filter(id => !gone.includes(id))));
      gone.forEach(id => delete db.watchProgress[id]);
    } else if (type === 'book') {
      db.books = db.books.filter(b => b.fileName !== base);
    } else if (type === 'game') {
      db.games = db.games.filter(g => g.slug !== base);
    }
  });
  return true;
}
