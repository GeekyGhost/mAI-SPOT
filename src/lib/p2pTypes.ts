// Shapes returned by the node's /api/p2p/* endpoints (see p2p/node.mjs).

export type Presence = 'online' | 'away' | 'dnd' | 'offline';

/** resource id -> grant. Ids: station:<id> playlist:<id> channel:<id> collection:<id> album:<id> app:<id> book:<id> reel; "<kind>:*" = all. */
export type Grants = Record<string, { until?: number }>;
export type ShareKind = 'station' | 'playlist' | 'channel' | 'collection' | 'album' | 'app' | 'book' | 'reel';
export interface Shareable {
  id: string;
  name: string;
  note: string;
  cover: string;
  group?: string;
}
export type Shareables = Record<ShareKind, Shareable[]>;

export interface NowPlaying {
  id: string;
  title: string;
  artist: string;
  cover: string;
  coverUrl?: string;
  duration: number;
  playing: boolean;
  position: number;
  at: number;
}

export interface Invite {
  token: string;
  link: string;
  label: string;
  createdAt: number;
  expiresAt: number;
  status: 'open' | 'used' | 'expired' | 'revoked';
  usedBy: { key: string; name: string } | null;
  usedAt: number | null;
  access: string;
  grants: Grants | null;
  autoAccept: boolean;
}

export interface PartyMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
  system?: boolean;
  mine?: boolean;
}

export interface Party {
  id: string;
  status: 'hosting' | 'joined' | 'invited';
  isHost: boolean;
  host: string;
  hostName: string;
  videoId: string;
  title: string;
  coverUrl: string;
  duration: number;
  src: string;
  /** position (s) as of `at` (ms, this computer's clock) */
  state: { playing: boolean; position: number; at: number; by: string };
  members: { key: string; name: string; online: boolean }[];
  invited: { key: string; name: string }[];
  chat: PartyMessage[];
}

export interface Friend {
  key: string;
  name: string;
  realName: string;
  nickname: string;
  handle: string;
  mood: string;
  bio: string;
  status: Presence;
  online: boolean;
  lastSeen: string | null;
  avatar: string;
  banner: string;
  accent: string;
  pictures: string[];
  live: { station: string; track: string; cover?: string; coverUrl?: string } | null;
  nowPlaying: NowPlaying | null;
  sharing: { music?: boolean; videos?: boolean; radio?: boolean; pictures?: boolean };
  /** What they let you see (their summary). */
  theirAccess: string;
  /** What you let them see. */
  grants: Grants;
  access: string;
  /** Just became friends without choosing their access: worth a look. */
  reviewAccess: boolean;
  top: boolean;
  unread: number;
  queued: number;
  addedAt: string;
}

export interface P2PState {
  me: { key: string; invite: string; tag: string; name: string; handle: string; status: Presence; mood: string; avatar: string; banner: string };
  network: { status: 'starting' | 'connecting' | 'online' | 'offline'; firewalled: boolean | null; host: string | null; port: number | null; error: string | null; connections: number };
  friends: Friend[];
  requests: {
    incoming: {
      key: string; name: string; handle: string; note: string; at: string; mood: string; avatar: string; online: boolean;
      invite: string | null; viaInvite: boolean; grants: Grants | null;
    }[];
    outgoing: { key: string; name: string; at: string; declined: boolean; reason: '' | 'declined' | 'invite_used' | 'invite_required'; online: boolean; access: string }[];
  };
  blocked: string[];
  groups: { id: string; name: string; members: { key: string; name: string; online: boolean }[]; unread: number; last: GroupMessage | null }[];
  access: { defaults: string[]; requireInvite: boolean; shareNowPlaying: boolean };
  invites: Invite[];
  parties: Party[];
  nowPlaying: NowPlaying | null;
}

export const SHARE_KINDS: { kind: ShareKind; label: string; plural: string }[] = [
  { kind: 'station', label: 'Radio station', plural: 'Radio stations' },
  { kind: 'playlist', label: 'Playlist', plural: 'Playlists' },
  { kind: 'channel', label: 'Video channel', plural: 'Video channels' },
  { kind: 'collection', label: 'Collection', plural: 'Video collections' },
  { kind: 'album', label: 'Picture album', plural: 'Picture albums' },
  { kind: 'app', label: 'Game or app', plural: 'Games & apps' },
  { kind: 'book', label: 'Book or comic', plural: 'Books & comics' },
  { kind: 'reel', label: 'Picture reel', plural: 'Profile picture reel' }
];

export function untilLabel(until?: number): string {
  if (!until) return '';
  const s = (until - Date.now()) / 1000;
  if (s <= 0) return 'expired';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min left`;
  if (s < 86400) return `${Math.round(s / 3600)} h left`;
  return `${Math.round(s / 86400)} days left`;
}

export interface DirectMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  ts: number;
  status: 'queued' | 'delivered' | 'read';
}

export interface GroupMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
}

export interface GroupDetail {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  names: Record<string, string>;
  version: number;
  messages: GroupMessage[];
  me: string;
}

export interface FeedComment {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
  mine: boolean;
}

export interface FeedPost {
  id: string;
  author: string;
  authorName: string;
  authorAvatar: string;
  authorOnline: boolean;
  type: 'status' | 'poem' | 'image' | 'track' | 'video';
  title: string;
  text: string;
  media: { kind: 'track' | 'video'; id: string; title: string; artist?: string; cover?: string; duration: number; genre?: string } | null;
  image: string;
  imageUrl: string;
  coverUrl: string;
  mediaUrl: string;
  likeCount: number;
  likedByMe: boolean;
  comments: FeedComment[];
  createdAt: number;
  updatedAt: number;
  mine?: boolean;
}

export const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

export function timeAgo(ts: number | string | null): string {
  if (!ts) return 'never';
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}
