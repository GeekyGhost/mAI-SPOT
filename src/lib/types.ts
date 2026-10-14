// Shared data types for mAI Spot. Safe to import from client components
// (no Node APIs here). The server-side store lives in ./db.ts.

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
}

export interface Channel {
  id: string;
  userId: string;
  channelName: string;
  handle: string;
  avatar: string;
  genre: string;
  subscribers: number;
  description: string;
  banner?: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  trackNo?: number;
  channelId: string;
  genre: string;
  /** Seconds, read from the file itself. */
  duration: number;
  filePath: string;
  coverArt: string;
  kbps: number;
  khz: number;
  plays: number;
  createdAt: string;
  /** True once duration/bitrate were read from the file. */
  probed?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  cover?: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type StationSourceType = 'all' | 'genre' | 'artist' | 'album' | 'playlist';

export interface RadioStation {
  id: string;
  name: string;
  tagline: string;
  cover?: string;
  source: { type: StationSourceType; value?: string };
  shuffle: boolean;
  isLive: boolean;
  /** ISO time the current broadcast started; position is derived from wall-clock. */
  liveSince?: string;
  /** Track order frozen when the station went on air. */
  order?: string[];
  createdAt: string;
}

export interface Video {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  genre: string;
  duration: number;
  filePath: string;
  thumbnail: string;
  views: number;
  createdAt: string;
  description: string;
  year?: number;
  probed?: boolean;
  /** How the poster was made: a frame of the video, or an image you chose. */
  posterMode?: 'frame' | 'custom';
  /** Seconds into the video for posterMode 'frame'. */
  posterTime?: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  cover?: string;
  videoIds: string[];
  createdAt: string;
}

export interface WatchProgress {
  position: number;
  duration: number;
  updatedAt: string;
}

export interface StationTheme {
  primaryColor: string;
  surfaceColor: string;
  accentGlow: string;
  backgroundImage?: string;
  backgroundTiling: 'repeat' | 'cover' | 'tile-x' | 'tile-y';
  fontFamily: 'pixel' | 'cyber' | 'retro-serif' | 'clean';
  borderStyle: 'retro-bevel' | 'neon-glow' | 'modern';
  customCss?: string;
}

export interface StationProfile {
  id: string;
  stationName: string;
  displayName?: string;
  handle: string;
  stationKey: string;
  avatar: string;
  /** Wide header image on your Spot and on the profile friends see. */
  banner?: string;
  bio: string;
  moodBlurb: string;
  pictureReel: string[];
  topFriends: string[];
  sentimentMode: 'show_all' | 'hide_dislikes' | 'hide_all';
  soundEnabled: boolean;
  soundTheme: 'icq_classic' | 'synthwave' | 'win95' | 'minimal';
  soundVolume: number;
  isOnline: boolean;
  statusMode: 'online' | 'away' | 'dnd' | 'offline';
  /** False on a brand-new install until the welcome setup has been finished. */
  setupDone?: boolean;
}

export type AppKind = 'game' | 'app';

/** A game or app hosted on this Spot. (Name kept as `Game` for compatibility.) */
export interface Game {
  id: string;
  kind: AppKind;
  title: string;
  description: string;
  thumbnail: string;
  /** Folder name under content/apps/ */
  slug?: string;
  entryPoint: string;
  controlsHelp: string;
  /** Game genre (Arcade, Puzzle…) — used when kind === 'game' */
  genre: string;
  /** App category (Productivity, Creative…) — used when kind === 'app' */
  category?: string;
  plays: number;
  likes: number;
  dislikes: number;
  createdAt: string;
  /** Your best score (games report it through the arcade kit). */
  best?: number;
  lastPlayed?: string;
}

export type BookFormat = 'epub' | 'pdf' | 'cbz' | 'cbr' | 'txt' | 'md';
export type BookKind = 'ebook' | 'comic';

export interface Book {
  id: string;
  kind: BookKind;
  format: BookFormat;
  title: string;
  author: string;
  series?: string;
  issue?: string;
  genre: string;
  description?: string;
  fileName: string;
  cover?: string;
  pageCount?: number;
  sizeBytes: number;
  progress?: { location: string; percent: number; updatedAt: string };
  createdAt: string;
}

export interface Reaction {
  targetId: string;
  voterPubkey: string;
  type: 'like' | 'dislike';
  timestamp: string;
}

export interface Contact {
  pubkey: string;
  handle: string;
  displayName: string;
  avatar: string;
  status: 'online' | 'away' | 'dnd' | 'offline';
  moodBlurb: string;
  stationUrl?: string;
  lastSeen: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  timestamp: string;
  status: 'queued' | 'sending' | 'delivered' | 'read';
}

export interface GroupChat {
  id: string;
  name: string;
  avatar: string;
  members: string[];
  messages: {
    id: string;
    senderPubkey: string;
    senderHandle: string;
    content: string;
    timestamp: string;
  }[];
}

export type MusicPlayerStyle = 'pulseamp_deck' | 'compact_player' | 'vinyl_turntable';
export type VideoPlayerStyle = 'chromavision_theater' | 'channel_grid' | 'leanback_tv';
export type VisualizerMode = 'spectrum' | 'scope' | 'radial' | 'horizon';
/** Widgets on your Spot page. 'thoughts' is "Friends right now"; 'pictures' is the picture reel. */
export type SectionKey = 'profile' | 'thoughts' | 'music' | 'video' | 'arcade' | 'pictures' | 'library' | 'friends' | 'feed' | 'clock' | 'note';
export type SpotColumn = 'left' | 'center' | 'right';

export interface SpotLook {
  panel: 'glass' | 'solid' | 'outline' | 'neon' | 'retro';
  radius: 'sharp' | 'soft' | 'round';
  density: 'cozy' | 'compact';
  background: 'none' | 'stars' | 'grid' | 'aurora' | 'scanlines' | 'bubbles';
  widths: 'balanced' | 'wide-center' | 'wide-sides';
}

export interface LayoutConfig {
  musicPlayerStyle: MusicPlayerStyle;
  videoPlayerStyle: VideoPlayerStyle;
  visualizerMode?: VisualizerMode;
  enabledSections: SectionKey[];
  sectionOrder: SectionKey[];
  activeMusicGenres: string[];
  activeVideoGenres: string[];
  feedDisplayMode: 'grid' | 'stream';
  /** Which column each widget sits in (desktop). */
  columns?: Partial<Record<SectionKey, SpotColumn>>;
  look?: Partial<SpotLook>;
  note?: { text: string; color: string };
  clock?: { style: 'digital' | 'analog'; h24: boolean };
}

export interface FriendPost {
  id: string;
  authorPubkey: string;
  authorHandle: string;
  authorName: string;
  authorAvatar: string;
  spotUrl: string;
  type: 'audio' | 'video' | 'status' | 'game';
  title: string;
  content: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  genre?: string;
  likes: number;
  likedByMe?: boolean;
  timestamp: string;
}

export interface MediaAsset {
  filename: string;
  type: 'audio' | 'video' | 'thumbnail' | 'game' | 'book';
  url: string;
  sizeBytes: number;
  sizeFormatted: string;
  updatedAt: string;
  associatedTitle?: string;
}

export interface DatabaseSchema {
  schemaVersion?: number;
  users: User[];
  channels: Channel[];
  tracks: Track[];
  videos: Video[];
  /** Video genres */
  genres: string[];
  playlists: Playlist[];
  stations: RadioStation[];
  collections: Collection[];
  watchProgress: Record<string, WatchProgress>;
  books: Book[];
  profile: StationProfile;
  theme: StationTheme;
  layout: LayoutConfig;
  games: Game[];
  reactions: Reaction[];
  contacts: Contact[];
  messages: DirectMessage[];
  groupChats: GroupChat[];
  feedPosts: FriendPost[];
}

/** What GET /api/radio/live returns. */
export interface LiveBroadcast {
  live: boolean;
  station?: { id: string; name: string; tagline: string; cover?: string };
  track?: Pick<Track, 'id' | 'title' | 'artist' | 'album' | 'coverArt' | 'filePath' | 'duration' | 'genre'>;
  /** Seconds into the current track at serverTime. */
  offset?: number;
  serverTime: number;
  upNext?: Pick<Track, 'id' | 'title' | 'artist' | 'coverArt' | 'duration'>[];
  listeners?: number;
  hostName?: string;
}

export const GAME_GENRES = ['Arcade', 'Action', 'Puzzle', 'Platformer', 'Shooter', 'Racing', 'Sports', 'Strategy', 'RPG', 'Adventure', 'Casual'];
export const APP_CATEGORIES = ['Productivity', 'Creativity', 'Music & Audio', 'Utilities', 'Education', 'Social', 'Developer Tools', 'Lifestyle'];
export const BOOK_GENRES = ['Fiction', 'Sci-Fi', 'Fantasy', 'Mystery', 'Non-Fiction', 'Poetry', 'Superhero', 'Manga', 'Graphic Novel', 'Horror', 'Unsorted'];
