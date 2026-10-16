// The peer-to-peer node: one Hyperswarm instance keyed by this Spot's identity.
//
// Discovery: the public HyperDHT (bootstrap nodes run by Holepunch) is used only to find a friend's
// current address by their public key. Data never goes through it: connections are direct,
// UDP hole-punched, and end-to-end encrypted (Noise), authenticated by both sides' keys.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import Hyperswarm from 'hyperswarm';
import DHT from 'hyperdht';
import { Peer } from './protocol.mjs';
import { loadIdentity, social, save, newId, readDb, updateDbProfile, PEER_CACHE } from './store.mjs';
import { profileSummary, catalog, visibleThumbs, resolveFile, resolveThumb, computeLive, mimeFor, fileStat, thumbName, nowPlayingPosition } from './catalog.mjs';
import { cleanGrants, covers, sweep, trackAllowed, videoAllowed, summarize, EVERYTHING } from './access.mjs';
import { communication, contactUpdate, callKind, contactError } from './communication.mjs';
import { modelRequestAllowed } from './models.mjs';

const MAX_TEXT = 4000;
const MAX_POST = 10000;
const MAX_GROUP_MSGS = 2000;
const MAX_DM_HISTORY = 5000;
const INVITE_DAYS = 7;
const MAX_PARTY_CHAT = 300;
const hexKey = k => (Buffer.isBuffer(k) ? k.toString('hex') : String(k || '').toLowerCase());
export const isKey = k => /^[0-9a-f]{64}$/.test(String(k || ''));
const clip = (s, n) => String(s ?? '').slice(0, n);

export class SpotNode extends EventEmitter {
  constructor({ localPort } = {}) {
    super();
    this.setMaxListeners(100);
    this.localPort = localPort || Number(process.env.PORT) || 8088;
    this.identity = loadIdentity();
    this.key = hexKey(this.identity.publicKey);
    this.s = social();
    this.peers = new Map(); // key -> Peer (ready after hello)
    this.network = { status: 'starting', firewalled: null, host: null, port: null, error: null };
    this.presenceSig = new Map(); // key -> last profile signature sent to that friend
    this.nowPlaying = null; // what this Spot's browser is playing right now (in memory only)
    this.recentAlong = []; // track ids recently "now playing", so listeners finishing a song aren't cut off
    this.parties = new Map(); // watch parties: id -> party (hosted here, or joined as a guest)
    this.thumbCache = new Map(); // key -> { at, set } visible thumbnail names for that friend
    this.dmDeliveries = new Map(); // coalesce delivery attempts for the same queued message
    this.calls = new Map(); // signaling sessions, for enforcing incoming contact choices
  }

  // ───────────────────────── lifecycle ─────────────────────────
  async start() {
    const bootstrap = process.env.MAISPOT_BOOTSTRAP
      ? process.env.MAISPOT_BOOTSTRAP.split(',').map(s => {
          const [host, port] = s.trim().split(':');
          return { host, port: Number(port) };
        })
      : undefined;
    const dht = new DHT({
      keyPair: this.identity,
      ...(bootstrap ? { bootstrap } : {}),
      ...(process.env.MAISPOT_DHT_HOST ? { host: process.env.MAISPOT_DHT_HOST } : {})
    });
    this.swarm = new Hyperswarm({
      keyPair: this.identity,
      dht,
      // Reject blocked keys before the handshake completes.
      firewall: remote => this.s.blocked.includes(hexKey(remote))
    });
    this.swarm.on('connection', conn => this.onConnection(conn));

    // Keep db.json's profile in step with our identity.
    const db = readDb();
    if (db?.profile && db.profile.stationKey !== this.key) updateDbProfile({ stationKey: this.key });
    this.syncTopFriends();

    this.network.status = 'connecting';
    this.ui('network');
    try {
      await this.swarm.listen();
      await dht.ready();
      this.network = { status: 'online', firewalled: dht.firewalled, host: dht.host, port: dht.port, error: null };
    } catch (e) {
      this.network = { ...this.network, status: 'offline', error: e?.message || String(e) };
    }
    this.ui('network');
    for (const k of this.wantedPeers()) this.swarm.joinPeer(Buffer.from(k, 'hex'));

    // Watch our own profile/live station and tell friends when it changes; expire temporary access.
    this.presenceTimer = setInterval(() => {
      this.sweepAccess();
      this.checkPresence();
      this.partyHeartbeat();
    }, 3000);
    this.outboxTimer = setInterval(() => {
      for (const peer of this.peers.values()) {
        if (peer.hello && !peer.closed && this.isFriend(peer.key)) void this.flushOutbox(peer);
      }
    }, 15000);
  }

  async stop() {
    clearInterval(this.presenceTimer);
    clearInterval(this.outboxTimer);
    save(true);
    try {
      await this.swarm?.destroy();
    } catch {}
  }

  /** Everyone we keep a connection open to: friends, people we've asked, and group co-members. */
  wantedPeers() {
    // A request that was turned down isn't worth keeping a connection open for.
    const pending = Object.values(this.s.requests.outgoing).filter(r => !r.declined).map(r => r.key);
    const set = new Set([...Object.keys(this.s.friends), ...pending]);
    for (const g of Object.values(this.s.groups)) for (const m of g.members) set.add(m);
    set.delete(this.key);
    for (const b of this.s.blocked) set.delete(b);
    return set;
  }

  join(key) {
    if (key !== this.key && this.swarm) this.swarm.joinPeer(Buffer.from(key, 'hex'));
  }

  leaveIfUnwanted(key, graceful = false) {
    if (this.wantedPeers().has(key)) return;
    try {
      this.swarm?.leavePeer(Buffer.from(key, 'hex'));
    } catch {}
    const p = this.peers.get(key);
    if (p) {
      if (graceful) p.closeGracefully();
      else p.destroy();
    }
  }

  /** Push an update to the browser (Server-Sent Events). */
  ui(type, data = {}) {
    this.emit('ui', { type, ...data });
  }

  // ───────────────────────── connections ─────────────────────────
  onConnection(conn) {
    const key = hexKey(conn.remotePublicKey);
    if (this.s.blocked.includes(key)) return conn.destroy();
    const old = this.peers.get(key);
    const peer = new Peer(conn, key);
    peer.handler = (m, p) => this.handleRequest(peer, m, p);
    peer.on('event', (e, p) => {
      try {
        this.onEvent(peer, e, p);
      } catch (err) {
        console.warn('[p2p] event error', e, err?.message);
      }
    });
    peer.on('close', () => this.onPeerClose(peer));
    peer.on('warn', err => {
      console.warn(`[p2p:${key.slice(0, 8)}] protocol warning:`, err?.message || err);
    });
    this.peers.set(key, peer);
    if (old && !old.closed) old.destroy();
    const summary = this.summaryFor(key);
    this.presenceSig.set(key, this.presenceSignature(summary));
    peer.event('hello', { v: 2, profile: summary });
    // Strangers get two minutes to send a friend request, then we hang up.
    peer.strangerTimer = setTimeout(() => {
      if (!this.isFriend(key) && !this.isCoMember(key) && !this.s.requests.incoming[key] && !this.s.requests.outgoing[key]) {
        peer.destroy();
      }
    }, 120000);
  }

  onPeerClose(peer) {
    clearTimeout(peer.strangerTimer);
    if (this.peers.get(peer.key) !== peer) return; // replaced by a newer connection
    this.peers.delete(peer.key);
    for (const [id, session] of this.calls || []) if (session.peer === peer.key) this.calls.delete(id);
    this.presenceSig.delete(peer.key);
    this.partyPeerGone(peer.key);
    const f = this.s.friends[peer.key];
    if (f) {
      f.online = false;
      f.lastSeen = new Date().toISOString();
      save();
      this.ui('state');
    }
  }

  isFriend(key) {
    return !!this.s.friends[key];
  }

  isCoMember(key) {
    return Object.values(this.s.groups).some(g => g.members.includes(key) && g.members.includes(this.key));
  }

  connected(key) {
    const p = this.peers.get(key);
    return p && !p.closed && !p.closing && p.hello ? p : null;
  }

  myName() {
    return readDb()?.profile?.displayName || readDb()?.profile?.stationName || 'mAI Spot';
  }

  applyProfile(f, prof) {
    if (!prof) return;
    f.name = clip(prof.name, 80) || f.name || 'Friend';
    f.handle = clip(prof.handle, 80);
    f.mood = clip(prof.mood, 280);
    f.bio = clip(prof.bio, 1000);
    f.status = ['online', 'away', 'dnd', 'offline'].includes(prof.status) ? prof.status : 'online';
    f.avatar = clip(prof.avatar, 200);
    f.pictures = Array.isArray(prof.pictures) ? prof.pictures.slice(0, 12).map(x => clip(x, 200)) : [];
    f.banner = clip(prof.banner, 200);
    f.accent = /^#[0-9a-f]{3,8}$/i.test(String(prof.accent || '')) ? prof.accent : '';
    f.live = prof.live && typeof prof.live === 'object' ? { station: clip(prof.live.station, 120), track: clip(prof.live.track, 200), cover: clip(prof.live.cover, 200) } : null;
    f.theirAccess = clip(prof.access, 300);
    f.theirCommunication = communication(prof.communication);
    f.sharing = prof.sharing && typeof prof.sharing === 'object' ? prof.sharing : {};
    if ('nowPlaying' in prof) this.applyNowPlaying(f, prof.nowPlaying);
  }

  applyNowPlaying(f, np) {
    f.nowPlaying =
      np && typeof np === 'object' && typeof np.id === 'string'
        ? {
            id: clip(np.id, 60), title: clip(np.title, 200), artist: clip(np.artist, 200), cover: clip(np.cover, 200),
            duration: Number(np.duration) || 0, playing: !!np.playing, position: Number(np.position) || 0,
            at: Date.now() // re-stamped on our own clock
          }
        : null;
  }

  // ───────────────────────── events from peers ─────────────────────────
  onEvent(peer, e, p) {
    if (this.peers.get(peer.key) !== peer || peer.closed || peer.closing) return;
    const key = peer.key;
    const friend = this.s.friends[key];
    switch (e) {
      case 'hello': {
        peer.hello = p?.profile || {};
        if (friend) {
          this.applyProfile(friend, peer.hello);
          friend.online = true;
          friend.lastSeen = new Date().toISOString();
          save();
          this.ui('state');
          this.afterFriendConnected(peer);
        } else if (this.s.requests.outgoing[key]) {
          const out = this.s.requests.outgoing[key];
          out.name = clip(peer.hello.name, 80);
          out.avatar = clip(peer.hello.avatar, 200);
          // Don't keep pestering someone who said no.
          if (!out.declined) peer.event('friend_request', { note: out.note || '', token: out.token || '' });
          save();
          this.ui('state');
        } else if (this.s.requests.incoming[key]) {
          this.applyProfile(this.s.requests.incoming[key], peer.hello);
          save();
          this.ui('state');
        }
        if (this.isCoMember(key)) this.syncGroupsWith(peer);
        break;
      }
      case 'friend_request': {
        if (friend) {
          peer.event('friend_accept', {});
          break;
        }
        if (this.s.requests.outgoing[key]) {
          // We both asked: that's a yes.
          this.makeFriend(key, peer);
          peer.event('friend_accept', {});
          break;
        }
        const token = clip(p?.token, 64);
        const inv = token ? this.s.invites[token] : null;
        const now = Date.now();
        const validInvite = inv && !inv.revoked && (inv.usedBy === key || (!inv.usedBy && inv.expiresAt > now));
        if (!validInvite && (this.s.access.requireInvite || token)) {
          // No invite (or a used/expired/revoked one): say no, and hang up.
          peer.event('friend_decline', { reason: token ? 'invite_used' : 'invite_required' });
          setTimeout(() => this.leaveIfUnwanted(key), 500);
          this.ui('invite_refused', { name: clip(peer.hello?.name, 80), reason: token ? 'used' : 'none' });
          break;
        }
        if (Object.keys(this.s.requests.incoming).length >= 100) {
          peer.destroy();
          break;
        }
        const req = (this.s.requests.incoming[key] = this.s.requests.incoming[key] || { key, at: new Date().toISOString() });
        this.applyProfile(req, peer.hello);
        req.note = clip(p?.note, 300);
        if (validInvite) {
          // One-time: this link now belongs to this Spot and nobody else can use it.
          inv.usedBy = key;
          inv.usedAt = inv.usedAt || now;
          inv.usedName = req.name || '';
          req.invite = { token, label: inv.label || '' };
          req.grants = inv.grants || null;
          if (inv.autoAccept) {
            save();
            this.acceptRequest(key, inv.grants);
            break;
          }
        }
        save();
        this.ui('request', { key, name: req.name, invite: req.invite?.label || '' });
        break;
      }
      case 'friend_accept':
        if (this.s.requests.outgoing[key] || friend) this.makeFriend(key, peer);
        break;
      case 'friend_decline':
        if (this.s.requests.outgoing[key]) {
          const out = this.s.requests.outgoing[key];
          out.declined = true;
          out.reason = ['invite_used', 'invite_required'].includes(p?.reason) ? p.reason : 'declined';
          save();
          this.ui('state');
          setTimeout(() => this.leaveIfUnwanted(key), 500);
        }
        break;
      case 'access_changed':
        if (friend) {
          this.applyProfile(friend, p?.profile);
          save();
          this.ui('access', { key, name: friend.nickname || friend.name });
        }
        break;
      case 'now_playing':
        if (friend) {
          this.applyNowPlaying(friend, p?.np);
          this.ui('now_playing', { key });
        }
        break;
      case 'party_invite':
      case 'party_state':
      case 'party_chat':
      case 'party_end':
      case 'party_control':
      case 'party_leave':
        this.onPartyEvent(peer, e, p);
        break;
      case 'unfriend':
        if (friend) {
          this.dropFriend(key, false);
          this.ui('state');
        }
        break;
      case 'presence':
        if (friend) {
          this.applyProfile(friend, p?.profile);
          peer.hello = p?.profile || peer.hello;
          save();
          this.ui('state');
        }
        break;
      case 'dm_read':
        if (friend) {
          const upTo = Number(p?.upTo) || 0;
          const ids = Array.isArray(p?.ids) ? new Set(p.ids.slice(-MAX_DM_HISTORY)) : null;
          for (const m of this.s.messages[key] || []) {
            // A read receipt can arrive before the delivery RPC response.
            if (m.from === this.key && m.status !== 'failed' && (ids ? ids.has(m.id) : m.status !== 'queued' && m.ts <= upTo)) m.status = 'read';
          }
          save();
          this.ui('dm_status', { peer: key });
        }
        break;
      case 'post':
        if (friend && p?.post) {
          this.storeFriendPost(key, p.post);
          save();
          this.ui('feed');
        }
        break;
      case 'post_delete':
        if (friend && this.s.feed[key]) {
          this.s.feed[key] = this.s.feed[key].filter(x => x.id !== p?.id);
          save();
          this.ui('feed');
        }
        break;
      case 'group_sync':
        this.onGroupSync(peer, p);
        break;
      case 'group_msgs':
        this.onGroupMsgs(peer, p);
        break;
      case 'group_leave': {
        const g = this.s.groups[p?.id];
        if (g && g.members.includes(key)) {
          g.members = g.members.filter(m => m !== key);
          g.version = (g.version || 1) + 1;
          save();
          this.ui('group', { id: g.id });
          this.leaveIfUnwanted(key);
        }
        break;
      }
      case 'call':
        if (friend && p && typeof p === 'object') {
          this.receiveCall(peer, p);
        }
        break;
    }
  }

  async afterFriendConnected(peer) {
    await this.flushOutbox(peer);
    await this.syncFeed(peer);
    this.syncGroupsWith(peer);
    this.cacheThumb(peer.key, this.s.friends[peer.key]?.avatar).catch(() => {});
  }

  makeFriend(key, peer, grants) {
    const out = this.s.requests.outgoing[key];
    const inc = this.s.requests.incoming[key];
    const isNew = !this.s.friends[key];
    const f = (this.s.friends[key] = this.s.friends[key] || {
      key,
      addedAt: new Date().toISOString(),
      name: out?.name || inc?.name || 'Friend'
    });
    // What they can see: chosen when accepting, or when sending the request, or the defaults.
    const chosen = grants || out?.grants || inc?.grants;
    if (chosen) f.grants = cleanGrants(chosen);
    else if (!f.grants) f.grants = this.defaultGrants();
    if (isNew) f.reviewAccess = !chosen;
    delete this.s.requests.outgoing[key];
    delete this.s.requests.incoming[key];
    if (peer?.hello) {
      this.applyProfile(f, peer.hello);
      f.online = true;
      f.lastSeen = new Date().toISOString();
    }
    save();
    this.join(key);
    this.syncTopFriends();
    this.ui('state');
    this.ui('friend_added', { key, name: f.name, review: !!f.reviewAccess });
    const live = this.connected(key);
    if (live) {
      this.sendPresence(key, true);
      this.afterFriendConnected(live);
    }
  }

  defaultGrants() {
    return Object.fromEntries((this.s.access.defaults || []).map(id => [id, {}]));
  }

  dropFriend(key, notify) {
    const p = this.connected(key);
    if (notify && p) p.event('unfriend', {});
    delete this.s.friends[key];
    delete this.s.feed[key];
    save();
    this.syncTopFriends();
    this.leaveIfUnwanted(key, notify);
  }

  // ───────────────────────── requests from peers ─────────────────────────
  async handleRequest(peer, m, p) {
    const key = peer.key;
    const friend = this.isFriend(key);
    const needFriend = () => {
      if (!friend) throw new Error('Not friends');
    };
    switch (m) {
      case 'dm': {
        needFriend();
        if (!communication(this.s.friends[key].communication).messages) throw contactError('messages');
        const list = (this.s.messages[key] = this.s.messages[key] || []);
        const id = clip(p.id, 40);
        if (!list.some(x => x.id === id)) {
          const msg = { id, from: key, to: this.key, text: clip(p.text, MAX_TEXT), ts: Number(p.ts) || Date.now(), status: 'delivered' };
          list.push(msg);
          if (list.length > MAX_DM_HISTORY) list.splice(0, list.length - MAX_DM_HISTORY);
          this.s.unread[key] = (this.s.unread[key] || 0) + 1;
          save();
          this.ui('dm', { peer: key, message: msg, name: this.s.friends[key].nickname || this.s.friends[key].name });
        }
        return { ok: true };
      }
      case 'feed_since': {
        needFriend();
        const since = Number(p.since) || 0;
        return {
          posts: this.s.posts.filter(x => x.updatedAt > since).slice(0, 300),
          ids: this.s.posts.map(x => x.id)
        };
      }
      case 'react': {
        needFriend();
        const post = this.s.posts.find(x => x.id === p.postId);
        if (!post) throw new Error('Post not found');
        post.likes = post.likes.filter(k => k !== key);
        if (p.like) post.likes.push(key);
        this.touchPost(post);
        return { post };
      }
      case 'comment': {
        needFriend();
        const post = this.s.posts.find(x => x.id === p.postId);
        if (!post) throw new Error('Post not found');
        const text = clip(p.text, 1000).trim();
        if (!text) throw new Error('Empty comment');
        post.comments.push({ id: newId(), from: key, name: this.s.friends[key].name, text, ts: Date.now() });
        if (post.comments.length > 500) post.comments.splice(0, post.comments.length - 500);
        this.touchPost(post);
        return { post };
      }
      case 'catalog':
        needFriend();
        return catalog(this.grantsOf(key), this.extraFor(key));
      case 'live': {
        needFriend();
        const live = computeLive(readDb(), Date.now());
        if (!live.live || !covers(this.grantsOf(key), 'station', live.station.id)) return { live: false, serverTime: Date.now() };
        live.listeners = undefined;
        return live;
      }
      case 'file': {
        const kind = p.kind;
        const id = String(p.id || '');
        if (!friend && !(kind === 'video' && this.partyAllows(key, id))) throw new Error('Not friends');
        const db = readDb() || {};
        const extra = this.accessExtra(key);
        const ok = kind === 'track' ? trackAllowed(db, this.grantsOf(key), id, extra) : kind === 'video' ? videoAllowed(db, this.grantsOf(key), id, extra) : false;
        if (!ok) throw new Error('Not shared with you');
        return this.fileStream(resolveFile(kind, id), p);
      }
      case 'thumb': {
        // Friends: covers of what they can see. Others: only our avatar.
        const name = path.basename(String(p.name || ''));
        const db = readDb() || {};
        const own = [thumbName(db.profile?.avatar), thumbName(db.profile?.banner)];
        if (!own.includes(name)) {
          if (!friend && !this.isCoMember(key) && !this.partyMember(key)) throw new Error('Not allowed');
          if (friend && !this.thumbsFor(key).has(name)) throw new Error('Not shared with you');
        }
        return this.fileStream(resolveThumb(name), {});
      }
      case 'get':
        // Books, games/apps and picture albums, served by this node's own web server after an access check.
        needFriend();
        return this.proxyGet(key, p);
      case 'party_join':
        return this.partyJoin(peer, p);
      default:
        throw new Error('Unknown request');
    }
  }

  fileStream(full, p) {
    const st = fileStat(full);
    const size = st.size;
    let start = Number.isFinite(p.start) ? Math.max(0, p.start) : 0;
    let end = Number.isFinite(p.end) ? Math.min(size - 1, p.end) : size - 1;
    if (size === 0) {
      start = 0;
      end = -1;
    } else if (start > end || start >= size) throw new Error('Range not satisfiable');
    return {
      __stream: size === 0 ? fs.createReadStream(full) : fs.createReadStream(full, { start, end, highWaterMark: 64 * 1024 }),
      meta: { size, start, end, mime: mimeFor(full), mtime: st.mtimeMs }
    };
  }

  // ───────────────────────── presence & access ─────────────────────────
  grantsOf(key) {
    return this.s.friends[key]?.grants || null;
  }

  extraFor(key) {
    return { nowPlaying: this.isFriend(key) && this.s.access.shareNowPlaying ? this.currentNowPlaying() : null };
  }

  /** What's playing, unless it's stale (the browser closed without saying so and the song is long over). */
  currentNowPlaying() {
    const np = this.nowPlaying;
    if (!np) return null;
    if (np.playing && np.duration && nowPlayingPosition(np) > np.duration + 15) return null;
    if (!np.playing && Date.now() - np.at > 6 * 3600e3) return null;
    return np;
  }

  /** Extra reasons a file may be streamed to this friend (shared in a post, now playing, a watch party). */
  accessExtra(key) {
    const postedIds = new Set(this.s.posts.map(p => p.media?.id).filter(Boolean));
    const partyVideos = new Set([...this.parties.values()].filter(x => x.host === this.key && (x.members.has(key) || x.invited.has(key))).map(x => x.videoId));
    return {
      postedIds,
      partyVideos,
      nowPlaying: this.s.access.shareNowPlaying && this.currentNowPlaying() ? this.nowPlaying.id : null,
      recentAlong: this.s.access.shareNowPlaying ? this.recentAlong : []
    };
  }

  summaryFor(key) {
    return { ...profileSummary(this.isFriend(key) ? this.grantsOf(key) : null, this.extraFor(key)), communication: communication(this.s.friends[key]?.communication) };
  }

  thumbsFor(key) {
    const c = this.thumbCache.get(key);
    if (c && Date.now() - c.at < 8000) return c.set;
    const partyCovers = [...this.parties.values()].filter(x => x.host === this.key && (x.members.has(key) || x.invited.has(key))).map(x => x.cover);
    const set = visibleThumbs(this.grantsOf(key), this.s.posts, { ...this.extraFor(key), partyCovers });
    this.thumbCache.set(key, { at: Date.now(), set });
    return set;
  }

  /** Signature of a profile, without the constantly-moving now-playing position. */
  presenceSignature(prof) {
    const { nowPlaying, ...rest } = prof;
    return JSON.stringify(rest);
  }

  sendPresence(key, force = false) {
    const peer = this.connected(key);
    if (!peer || !this.isFriend(key)) return;
    const prof = this.summaryFor(key);
    const sig = this.presenceSignature(prof);
    if (!force && sig === this.presenceSig.get(key)) return;
    this.presenceSig.set(key, sig);
    peer.event('presence', { profile: prof });
  }

  checkPresence() {
    for (const [k, peer] of this.peers) if (peer.hello && this.isFriend(k)) this.sendPresence(k);
    const me = JSON.stringify(readDb()?.profile || {});
    if (me !== this.lastMe) {
      if (this.lastMe !== undefined) this.ui('me');
      this.lastMe = me;
    }
  }

  /** Temporary access runs out by itself. */
  sweepAccess() {
    const now = Date.now();
    let any = false;
    for (const f of Object.values(this.s.friends)) {
      if (sweep(f.grants, now)) {
        any = true;
        this.thumbCache.delete(f.key);
        const peer = this.connected(f.key);
        if (peer) {
          const prof = this.summaryFor(f.key);
          this.presenceSig.set(f.key, this.presenceSignature(prof));
          peer.event('access_changed', { profile: prof });
        }
        this.ui('access_expired', { key: f.key, name: f.nickname || f.name });
      }
    }
    if (any) {
      save();
      this.ui('state');
    }
  }

  setGrants(key, grants, contact) {
    const f = this.s.friends[key];
    if (!f) throw new Error('Not a friend');
    if (contact !== undefined) {
      f.communication = contactUpdate(f.communication, contact);
      this.revokeCalls(key);
    }
    f.grants = cleanGrants(grants);
    delete f.reviewAccess;
    this.thumbCache.delete(key);
    save();
    const peer = this.connected(key);
    if (peer) {
      const prof = this.summaryFor(key);
      this.presenceSig.set(key, this.presenceSignature(prof));
      peer.event('access_changed', { profile: prof });
    }
    this.ui('state');
    return f.grants;
  }

  setAccessSettings(next) {
    const a = this.s.access;
    if (Array.isArray(next.defaults)) a.defaults = Object.keys(cleanGrants(next.defaults));
    if ('requireInvite' in next) a.requireInvite = !!next.requireInvite;
    if ('shareNowPlaying' in next) {
      a.shareNowPlaying = !!next.shareNowPlaying;
      this.broadcastNowPlaying();
    }
    save();
    this.ui('state');
    return a;
  }

  // ───────────────────────── now playing / listen along ─────────────────────────
  setNowPlaying(np) {
    if (!np || typeof np !== 'object' || !np.id) {
      this.nowPlaying = null;
    } else {
      const db = readDb() || {};
      const t = (db.tracks || []).find(x => x.id === np.id);
      // Only songs from this Spot's own library can be listened along to.
      this.nowPlaying = t
        ? {
            id: t.id, title: t.title, artist: t.artist, cover: thumbName(t.coverArt), duration: t.duration,
            playing: !!np.playing, position: Math.max(0, Number(np.position) || 0), at: Date.now()
          }
        : null;
      if (t && !this.recentAlong.includes(t.id)) this.recentAlong = [t.id, ...this.recentAlong].slice(0, 2);
    }
    this.broadcastNowPlaying();
  }

  broadcastNowPlaying() {
    for (const [k, peer] of this.peers) {
      if (!peer.hello || !this.isFriend(k)) continue;
      const np = this.extraFor(k).nowPlaying;
      peer.event('now_playing', { np: np ? { ...np, position: nowPlayingPosition(np) } : null });
    }
    this.thumbCache.clear();
  }

  /** A friend's now-playing as a broadcast the audio engine can follow (same shape as live radio). */
  alongView(key) {
    const f = this.s.friends[key];
    const np = f?.nowPlaying;
    const peerOnline = !!this.connected(key);
    if (!f || !np || !peerOnline) return { live: false, serverTime: Date.now() };
    const t = n => (n ? `/api/p2p/peer/${key}/thumb/${encodeURIComponent(n)}` : '');
    return {
      live: true,
      along: true,
      paused: !np.playing,
      station: { id: `along_${key}`, name: `Listening along with ${f.nickname || f.name}`, tagline: '', cover: t(np.cover) },
      track: {
        id: np.id, title: np.title, artist: np.artist, coverArt: t(np.cover), duration: np.duration,
        filePath: `/api/p2p/peer/${key}/file/track/${encodeURIComponent(np.id)}`
      },
      offset: Math.min(nowPlayingPosition(np), Math.max(0, np.duration - 0.5)),
      serverTime: Date.now(),
      upNext: [],
      hostName: f.nickname || f.name
    };
  }

  // ───────────────────────── books / apps / pictures via the local web server ─────────────────────────
  async proxyGet(key, p) {
    const raw = String(p.path || '');
    if (!raw.startsWith('api/') || raw.length > 600 || /[\\?#]/.test(raw)) throw new Error('Not allowed');
    let parts;
    try {
      parts = raw.split('/').map(x => decodeURIComponent(x));
    } catch {
      throw new Error('Not allowed');
    }
    if (parts.some(x => x === '..' || x === '.' || x === '' || x.includes('/') || x.includes('\\'))) throw new Error('Not allowed');
    const grants = this.grantsOf(key);
    let allowed = false;
    if (parts[1] === 'models') {
      allowed = modelRequestAllowed(grants, parts);
    } else if (parts[1] === 'books' && parts[2]) {
      const sub = parts[3];
      allowed = covers(grants, 'book', parts[2]) && (['manifest', 'file'].includes(sub) || (sub === 'page' && /^\d+$/.test(parts[4] || '')) || (sub === 'epub' && parts.length > 4));
    } else if (parts[1] === 'apps' && parts[2] === 'run' && parts[3]) {
      const db = readDb() || {};
      const app = (db.games || []).find(g => g.slug === parts[3]);
      allowed = !!app && !!covers(grants, 'app', app.id) && parts.length > 4;
    } else if (parts[1] === 'pictures' && (parts[2] === 'file' || parts[2] === 'thumb') && parts.length === 5) {
      allowed = !!covers(grants, 'album', parts[3]);
    }
    if (!allowed) throw new Error('Not shared with you');
    const headers = {};
    if (typeof p.range === 'string' && /^bytes=\d*-\d*$/.test(p.range)) headers.Range = p.range;
    const res = await fetch(`http://127.0.0.1:${this.localPort}/${parts.map(encodeURIComponent).join('/')}`, { headers });
    const keep = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-security-policy', 'last-modified', 'content-disposition'];
    const out = {};
    for (const h of keep) {
      const v = res.headers.get(h);
      if (v) out[h] = v;
    }
    if (!res.body) return { status: res.status, headers: out, body: '' };
    return { __stream: Readable.fromWeb(res.body), meta: { status: res.status, headers: out } };
  }

  syncTopFriends() {
    const friends = Object.values(this.s.friends).sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0) || String(a.addedAt).localeCompare(String(b.addedAt)));
    const names = friends.slice(0, 8).map(f => f.nickname || f.name);
    const db = readDb();
    if (db?.profile && JSON.stringify(db.profile.topFriends || []) !== JSON.stringify(names)) updateDbProfile({ topFriends: names });
  }

  // ───────────────────────── friends API ─────────────────────────
  addFriend(invite, note = '', grants) {
    const { key, token } = parseInviteLink(invite);
    if (!key) throw new Error('That isn’t a valid spot:// invite.');
    if (key === this.key) throw new Error('That’s your own invite.');
    if (this.s.friends[key]) throw new Error('You’re already friends.');
    this.s.blocked = this.s.blocked.filter(b => b !== key);
    if (this.s.requests.incoming[key]) {
      this.acceptRequest(key);
      return { key, status: 'friends' };
    }
    this.s.requests.outgoing[key] = {
      key, note: clip(note, 300), token: token || '', at: new Date().toISOString(), name: '',
      grants: grants ? cleanGrants(grants) : null
    };
    save();
    const live = this.peers.get(key);
    if (live?.hello) live.event('friend_request', { note: clip(note, 300), token: token || '' });
    this.join(key);
    this.ui('state');
    return { key, status: 'requested' };
  }

  acceptRequest(key, grants) {
    if (!this.s.requests.incoming[key]) throw new Error('No such request');
    const peer = this.peers.get(key);
    this.makeFriend(key, peer && !peer.closed ? peer : null, grants);
    if (peer && !peer.closed) peer.event('friend_accept', {});
  }

  declineRequest(key) {
    delete this.s.requests.incoming[key];
    save();
    const peer = this.peers.get(key);
    if (peer && !peer.closed) {
      peer.event('friend_decline', {});
      setTimeout(() => this.leaveIfUnwanted(key), 500);
    }
    this.ui('state');
  }

  cancelRequest(key) {
    delete this.s.requests.outgoing[key];
    save();
    this.leaveIfUnwanted(key);
    this.ui('state');
  }

  removeFriend(key) {
    this.dropFriend(key, true);
    this.ui('state');
  }

  block(key) {
    if (this.isFriend(key)) this.dropFriend(key, true);
    delete this.s.requests.incoming[key];
    delete this.s.requests.outgoing[key];
    if (!this.s.blocked.includes(key)) this.s.blocked.push(key);
    save();
    try {
      this.swarm?.leavePeer(Buffer.from(key, 'hex'));
    } catch {}
    this.peers.get(key)?.destroy();
    this.ui('state');
  }

  unblock(key) {
    this.s.blocked = this.s.blocked.filter(b => b !== key);
    save();
    this.ui('state');
  }

  updateFriend(key, { nickname, top }) {
    const f = this.s.friends[key];
    if (!f) throw new Error('Not a friend');
    if (nickname !== undefined) f.nickname = clip(nickname, 80).trim() || undefined;
    if (top !== undefined) f.top = !!top;
    save();
    this.syncTopFriends();
    this.ui('state');
  }

  // ───────────────────────── invites ─────────────────────────
  createInvite({ label, grants, days, autoAccept } = {}) {
    // Old invites don't need to pile up forever.
    const now = Date.now();
    for (const [t, inv] of Object.entries(this.s.invites)) if (inv.expiresAt < now - 30 * 86400000) delete this.s.invites[t];
    const token = crypto.randomBytes(12).toString('base64url');
    const d = Math.min(365, Math.max(1 / 24, Number(days) || INVITE_DAYS));
    this.s.invites[token] = {
      token, label: clip(label, 80).trim(), createdAt: now, expiresAt: now + d * 86400000,
      grants: grants ? cleanGrants(grants) : null, autoAccept: !!autoAccept
    };
    save();
    this.ui('state');
    return this.inviteView(this.s.invites[token]);
  }

  revokeInvite(token) {
    const inv = this.s.invites[token];
    if (!inv) return;
    if (inv.usedBy) inv.revoked = true;
    else delete this.s.invites[token];
    save();
    this.ui('state');
  }

  inviteView(inv) {
    const now = Date.now();
    return {
      token: inv.token,
      link: `spot://${this.key}/${inv.token}`,
      label: inv.label,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      status: inv.revoked ? 'revoked' : inv.usedBy ? 'used' : inv.expiresAt <= now ? 'expired' : 'open',
      usedBy: inv.usedBy ? { key: inv.usedBy, name: this.s.friends[inv.usedBy]?.name || inv.usedName || 'Someone' } : null,
      usedAt: inv.usedAt || null,
      access: inv.grants ? summarize(inv.grants) : 'you choose when they ask',
      grants: inv.grants,
      autoAccept: !!inv.autoAccept
    };
  }

  // ───────────────────────── direct messages ─────────────────────────
  async sendDM(to, text, id) {
    if (!this.isFriend(to)) throw new Error('You can only message friends.');
    if (!communication(this.s.friends[to].theirCommunication).messages) throw contactError('messages');
    const t = clip(text, MAX_TEXT).trim();
    if (!t) throw new Error('Empty message');
    if (id !== undefined && (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,40}$/.test(id))) throw new Error('Invalid message ID');
    const list = (this.s.messages[to] = this.s.messages[to] || []);
    const existing = id && list.find(m => m.id === id && m.from === this.key);
    if (existing) {
      if (existing.text !== t) throw new Error('This message ID was already used.');
      return existing;
    }
    const msg = { id: id || newId(), from: this.key, to, text: t, ts: Date.now(), status: 'queued' };
    list.push(msg);
    save();
    this.ui('dm_status', { peer: to });
    const peer = this.connected(to);
    // A slow/offline peer must not hold the browser's send request open.
    if (peer) void this.deliver(peer, msg);
    return msg;
  }

  deliver(peer, msg) {
    const key = `${peer.key}:${msg.id}`;
    if (this.dmDeliveries.has(key)) return this.dmDeliveries.get(key);
    const attempt = Promise.resolve().then(async () => {
      try {
        await peer.request('dm', { id: msg.id, text: msg.text, ts: msg.ts });
        if (msg.status === 'queued') msg.status = 'delivered';
        save();
        this.ui('dm_status', { peer: peer.key });
      } catch (error) {
        if (error.code === 'COMMUNICATION_DENIED') {
          msg.status = 'failed';
          msg.error = error.message;
          save();
          this.ui('dm_status', { peer: peer.key });
        }
        /* stays queued; retried periodically and on reconnect */
      }
    }).finally(() => this.dmDeliveries.delete(key));
    this.dmDeliveries.set(key, attempt);
    return attempt;
  }

  async flushOutbox(peer) {
    for (const m of (this.s.messages[peer.key] || []).filter(x => x.from === this.key && x.status === 'queued')) {
      await this.deliver(peer, m);
    }
  }

  markRead(key) {
    this.s.unread[key] = 0;
    const list = this.s.messages[key] || [];
    const lastIncoming = [...list].reverse().find(m => m.from === key);
    save();
    if (lastIncoming) this.connected(key)?.event('dm_read', { upTo: lastIncoming.ts, ids: list.filter(m => m.from === key).slice(-MAX_DM_HISTORY).map(m => m.id) });
    this.ui('state');
  }

  // ───────────────────────── groups ─────────────────────────
  groupMeta(g) {
    return { id: g.id, name: g.name, createdBy: g.createdBy, members: g.members, names: g.names, version: g.version || 1 };
  }

  createGroup(name, memberKeys) {
    const members = [...new Set([this.key, ...memberKeys.filter(k => this.isFriend(k))])];
    if (members.length < 2) throw new Error('Pick at least one friend.');
    const names = { [this.key]: this.myName() };
    for (const k of members) if (k !== this.key) names[k] = this.s.friends[k].name;
    const g = { id: newId(), name: clip(name, 80).trim() || 'Group chat', createdBy: this.key, members, names, version: 1, messages: [], unread: 0 };
    this.s.groups[g.id] = g;
    save();
    for (const k of members) {
      this.join(k);
      const p = this.connected(k);
      if (p) p.event('group_sync', { id: g.id, meta: this.groupMeta(g), have: [] });
    }
    this.ui('group', { id: g.id });
    return g;
  }

  addGroupMembers(id, keys) {
    const g = this.s.groups[id];
    if (!g) throw new Error('No such group');
    for (const k of keys) {
      if (this.isFriend(k) && !g.members.includes(k)) {
        g.members.push(k);
        g.names[k] = this.s.friends[k].name;
      }
    }
    g.version = (g.version || 1) + 1;
    save();
    for (const k of g.members) {
      this.join(k);
      const p = this.connected(k);
      if (p) p.event('group_sync', { id: g.id, meta: this.groupMeta(g), have: g.messages.slice(-300).map(m => m.id) });
    }
    this.ui('group', { id });
  }

  leaveGroup(id) {
    const g = this.s.groups[id];
    if (!g) return;
    for (const k of g.members) this.connected(k)?.event('group_leave', { id });
    delete this.s.groups[id];
    save();
    for (const k of g.members) this.leaveIfUnwanted(k);
    this.ui('group', { id });
  }

  sendGroup(id, text) {
    const g = this.s.groups[id];
    if (!g) throw new Error('No such group');
    const t = clip(text, MAX_TEXT).trim();
    if (!t) throw new Error('Empty message');
    const msg = { id: newId(), from: this.key, name: this.myName(), text: t, ts: Date.now() };
    g.messages.push(msg);
    if (g.messages.length > MAX_GROUP_MSGS) g.messages.splice(0, g.messages.length - MAX_GROUP_MSGS);
    save();
    for (const k of g.members) this.connected(k)?.event('group_msgs', { id, msgs: [msg] });
    this.ui('group', { id });
    return msg;
  }

  syncGroupsWith(peer) {
    for (const g of Object.values(this.s.groups)) {
      if (g.members.includes(peer.key)) {
        peer.event('group_sync', { id: g.id, meta: this.groupMeta(g), have: g.messages.slice(-300).map(m => m.id) });
      }
    }
  }

  onGroupSync(peer, p) {
    const meta = p?.meta;
    if (!meta || !Array.isArray(meta.members) || !meta.members.includes(peer.key)) return;
    let g = this.s.groups[p.id];
    if (!g) {
      if (!meta.members.includes(this.key)) return;
      // Join a group a friend (or a fellow member) put us in.
      g = this.s.groups[p.id] = { id: clip(p.id, 40), messages: [], unread: 0 };
      Object.assign(g, {
        name: clip(meta.name, 80),
        createdBy: meta.createdBy,
        members: meta.members.filter(isKey).slice(0, 64),
        names: meta.names || {},
        version: meta.version || 1
      });
      for (const k of g.members) this.join(k);
      this.ui('group', { id: g.id, joined: true });
    } else if ((meta.version || 1) > (g.version || 1)) {
      if (!meta.members.includes(this.key)) {
        // We were removed.
        delete this.s.groups[p.id];
        save();
        this.ui('group', { id: p.id });
        return;
      }
      g.name = clip(meta.name, 80);
      g.members = meta.members.filter(isKey).slice(0, 64);
      g.names = { ...g.names, ...(meta.names || {}) };
      g.version = meta.version;
      for (const k of g.members) this.join(k);
    } else if ((meta.version || 1) < (g.version || 1)) {
      peer.event('group_sync', { id: g.id, meta: this.groupMeta(g), have: g.messages.slice(-300).map(m => m.id) });
    }
    save();
    // Send what they don't have.
    const have = new Set(Array.isArray(p.have) ? p.have : []);
    const missing = g.messages.slice(-300).filter(m => !have.has(m.id));
    if (missing.length) peer.event('group_msgs', { id: g.id, msgs: missing });
    this.ui('group', { id: g.id });
  }

  onGroupMsgs(peer, p) {
    const g = this.s.groups[p?.id];
    if (!g || !g.members.includes(peer.key) || !Array.isArray(p.msgs)) return;
    const known = new Set(g.messages.map(m => m.id));
    let added = 0;
    for (const raw of p.msgs.slice(0, 500)) {
      if (!raw || known.has(raw.id) || !g.members.includes(raw.from) && raw.from !== this.key) continue;
      g.messages.push({ id: clip(raw.id, 40), from: raw.from, name: clip(raw.name, 80), text: clip(raw.text, MAX_TEXT), ts: Number(raw.ts) || Date.now() });
      known.add(raw.id);
      if (raw.from !== this.key) added++;
    }
    if (!added) return;
    g.messages.sort((a, b) => a.ts - b.ts);
    if (g.messages.length > MAX_GROUP_MSGS) g.messages.splice(0, g.messages.length - MAX_GROUP_MSGS);
    g.unread = (g.unread || 0) + added;
    save();
    this.ui('group', { id: g.id, message: true, name: g.name });
  }

  markGroupRead(id) {
    const g = this.s.groups[id];
    if (g) {
      g.unread = 0;
      save();
      this.ui('state');
    }
  }

  // ───────────────────────── feed ─────────────────────────
  createPost({ type, text, title, media, image }) {
    const allowed = ['status', 'poem', 'image', 'track', 'video'];
    if (!allowed.includes(type)) throw new Error('Unknown post type');
    const db = readDb() || {};
    let m = null;
    if (type === 'track' || type === 'video') {
      const src = type === 'track' ? db.tracks || [] : db.videos || [];
      const item = src.find(x => x.id === media?.id);
      if (!item) throw new Error('Pick something from your library to share.');
      const thumbOf = u => (String(u || '').startsWith('/api/media/thumbnails/') ? decodeURIComponent(u.split('/').pop()) : '');
      m = type === 'track'
        ? { kind: 'track', id: item.id, title: item.title, artist: item.artist, cover: thumbOf(item.coverArt), duration: item.duration }
        : { kind: 'video', id: item.id, title: item.title, cover: thumbOf(item.thumbnail), duration: item.duration, genre: item.genre };
    }
    const now = Date.now();
    const post = {
      id: newId(),
      author: this.key,
      type,
      title: clip(title, 200),
      text: clip(text, MAX_POST),
      media: m,
      image: type === 'image' ? clip(image, 200) : '',
      likes: [],
      comments: [],
      createdAt: now,
      updatedAt: now
    };
    if (!post.text.trim() && !m && !post.image) throw new Error('Write something first.');
    this.s.posts.unshift(post);
    save();
    this.broadcastPost(post);
    this.ui('feed');
    return post;
  }

  touchPost(post) {
    post.updatedAt = Math.max(Date.now(), post.updatedAt + 1);
    save();
    this.broadcastPost(post);
    this.ui('feed');
  }

  broadcastPost(post) {
    for (const [k, peer] of this.peers) if (peer.hello && this.isFriend(k)) peer.event('post', { post });
  }

  deletePost(id) {
    this.s.posts = this.s.posts.filter(p => p.id !== id);
    save();
    for (const [k, peer] of this.peers) if (peer.hello && this.isFriend(k)) peer.event('post_delete', { id });
    this.ui('feed');
  }

  deleteComment(postId, commentId) {
    const post = this.s.posts.find(p => p.id === postId);
    if (!post) throw new Error('Not your post');
    post.comments = post.comments.filter(c => c.id !== commentId);
    this.touchPost(post);
  }

  likeMine(postId, like) {
    const post = this.s.posts.find(p => p.id === postId);
    if (!post) throw new Error('Post not found');
    post.likes = post.likes.filter(k => k !== this.key);
    if (like) post.likes.push(this.key);
    this.touchPost(post);
  }

  commentMine(postId, text) {
    const post = this.s.posts.find(p => p.id === postId);
    if (!post) throw new Error('Post not found');
    const t = clip(text, 1000).trim();
    if (!t) throw new Error('Empty comment');
    post.comments.push({ id: newId(), from: this.key, name: this.myName(), text: t, ts: Date.now() });
    this.touchPost(post);
  }

  storeFriendPost(key, raw) {
    if (!raw || raw.author !== key || typeof raw.id !== 'string') return;
    const post = {
      id: clip(raw.id, 40),
      author: key,
      type: clip(raw.type, 16),
      title: clip(raw.title, 200),
      text: clip(raw.text, MAX_POST),
      media: raw.media && typeof raw.media === 'object' ? raw.media : null,
      image: clip(raw.image, 200),
      likes: Array.isArray(raw.likes) ? raw.likes.filter(isKey) : [],
      comments: Array.isArray(raw.comments) ? raw.comments.slice(-500) : [],
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Date.now()
    };
    const list = (this.s.feed[key] = this.s.feed[key] || []);
    const i = list.findIndex(x => x.id === post.id);
    if (i >= 0) list[i] = post;
    else list.push(post);
    list.sort((a, b) => b.createdAt - a.createdAt);
    if (list.length > 500) list.length = 500;
    if (post.image) this.cacheThumb(key, post.image).catch(() => {});
    if (post.media?.cover) this.cacheThumb(key, post.media.cover).catch(() => {});
  }

  async syncFeed(peer) {
    const list = this.s.feed[peer.key] || [];
    const since = list.reduce((m, p) => Math.max(m, p.updatedAt || 0), 0);
    try {
      const r = await peer.request('feed_since', { since });
      for (const post of r.posts || []) this.storeFriendPost(peer.key, post);
      if (Array.isArray(r.ids)) {
        const keep = new Set(r.ids);
        this.s.feed[peer.key] = (this.s.feed[peer.key] || []).filter(p => keep.has(p.id));
      }
      save();
      this.ui('feed');
    } catch {}
  }

  async reactFriend(author, postId, like) {
    const peer = this.connected(author);
    if (!peer) throw new Error('They’re offline right now — try again when they’re online.');
    const r = await peer.request('react', { postId, like: !!like });
    this.storeFriendPost(author, r.post);
    save();
    this.ui('feed');
  }

  async commentFriend(author, postId, text) {
    const peer = this.connected(author);
    if (!peer) throw new Error('They’re offline right now — try again when they’re online.');
    const r = await peer.request('comment', { postId, text });
    this.storeFriendPost(author, r.post);
    save();
    this.ui('feed');
  }

  // ───────────────────────── calls (WebRTC signalling relay) ─────────────────────────
  receiveCall(peer, payload) {
    if (typeof payload.callId !== 'string' || !payload.callId || payload.callId.length > 64 || !['offer', 'answer', 'ice', 'bye', 'reject'].includes(payload.kind)) return;
    const key = `${peer.key}:${payload.callId}`;
    this.calls ||= new Map();
    if (payload.kind === 'offer') {
      const kind = callKind(payload.data);
      if (!communication(this.s.friends[peer.key]?.communication)[kind]) {
        peer.event('call', { callId: payload.callId, kind: 'reject', data: { reason: contactError(kind).message } });
        return;
      }
      if (!this.calls.has(key) && this.calls.size >= 128) return;
      this.calls.set(key, { peer: peer.key, callId: payload.callId, kind, direction: 'in' });
    }
    if (payload.kind === 'bye' || payload.kind === 'reject') this.calls.delete(key);
    const f = this.s.friends[peer.key];
    this.ui('call', { from: peer.key, name: f.nickname || f.name, callId: payload.callId, kind: payload.kind, data: payload.data });
  }

  revokeCalls(key) {
    for (const [id, session] of this.calls || []) {
      if (session.peer !== key || session.direction !== 'in' || communication(this.s.friends[key]?.communication)[session.kind]) continue;
      this.connected(key)?.event('call', { callId: session.callId, kind: 'bye' });
      this.ui('call', { from: key, name: this.s.friends[key].name, callId: session.callId, kind: 'bye', data: { reason: 'You disabled this incoming call type.' } });
      this.calls.delete(id);
    }
  }

  callSignal(to, payload) {
    if (!this.isFriend(to)) throw new Error('Not a friend');
    if (typeof payload.callId !== 'string' || !payload.callId || payload.callId.length > 64 || !['offer', 'answer', 'ice', 'bye', 'reject'].includes(payload.kind)) throw new Error('Invalid call signal');
    const peer = this.connected(to);
    if (!peer) throw new Error('They’re offline.');
    this.calls ||= new Map();
    if (payload.kind === 'offer') {
      const kind = callKind(payload.data);
      if (!communication(this.s.friends[to].theirCommunication)[kind]) throw contactError(kind);
      if (this.calls.size >= 128) throw new Error('Too many pending calls. Try again later.');
      this.calls.set(`${to}:${payload.callId}`, { peer: to, callId: payload.callId, kind, direction: 'out' });
    }
    if (payload.kind === 'bye' || payload.kind === 'reject') this.calls.delete(`${to}:${payload.callId}`);
    peer.event('call', { callId: clip(payload.callId, 64), kind: clip(payload.kind, 16), data: payload.data ?? null });
  }

  // ───────────────────────── watch parties ─────────────────────────
  // The host's node is the clock: it holds {playing, position, at}, applies everyone's play/pause/seek,
  // and sends the state to every member (and their browsers follow it). Members stream the video from
  // the host for as long as the party runs, even if it isn't otherwise shared with them.

  partyPos(party, now = Date.now()) {
    const st = party.state;
    const pos = st.playing ? st.position + (now - st.at) / 1000 : st.position;
    return Math.max(0, party.duration ? Math.min(pos, party.duration) : pos);
  }

  partyWire(party) {
    return {
      id: party.id, host: party.host, hostName: party.hostName, videoId: party.videoId, title: party.title, cover: party.cover,
      duration: party.duration, state: { playing: party.state.playing, position: this.partyPos(party), by: party.state.by || '' },
      members: [...party.members].map(k => ({ key: k, name: party.names[k] || 'Friend' })),
      chat: party.chat.slice(-100)
    };
  }

  partyView(party) {
    const isHost = party.host === this.key;
    const t = n => (!n ? '' : isHost ? `/api/media/thumbnails/${encodeURIComponent(n)}` : `/api/p2p/peer/${party.host}/thumb/${encodeURIComponent(n)}`);
    const names = k =>
      k === this.key ? 'You' : this.s.friends[k]?.nickname || this.s.friends[k]?.name || (k === party.host ? party.hostName : party.names[k]) || 'Friend';
    const members = isHost ? [this.key, ...party.members] : [party.host, ...party.memberKeys.filter(k => k !== party.host)];
    return {
      id: party.id,
      status: isHost ? 'hosting' : party.joined ? 'joined' : 'invited',
      isHost,
      host: party.host,
      hostName: isHost ? 'You' : this.s.friends[party.host]?.nickname || party.hostName,
      videoId: party.videoId,
      title: party.title,
      coverUrl: t(party.cover),
      duration: party.duration,
      src: isHost ? party.filePath : `/api/p2p/peer/${party.host}/file/video/${encodeURIComponent(party.videoId)}`,
      state: { playing: party.state.playing, position: this.partyPos(party), at: Date.now(), by: party.state.by || '' },
      members: [...new Set(members)].map(k => ({ key: k, name: names(k), online: k === this.key || !!this.connected(k) })),
      invited: isHost ? [...party.invited].filter(k => !party.members.has(k)).map(k => ({ key: k, name: names(k) })) : [],
      chat: party.chat.slice(-100).map(m => ({ ...m, name: m.from === this.key ? 'You' : m.name, mine: m.from === this.key }))
    };
  }

  partyBroadcast(party) {
    if (party.host !== this.key) return;
    const wire = this.partyWire(party);
    for (const k of party.members) this.connected(k)?.event('party_state', wire);
    this.ui('party', { id: party.id });
  }

  partySystem(party, text) {
    party.chat.push({ id: newId(), from: '', name: '', text, ts: Date.now(), system: true });
    if (party.chat.length > MAX_PARTY_CHAT) party.chat.splice(0, party.chat.length - MAX_PARTY_CHAT);
  }

  createParty(videoId, inviteKeys = []) {
    const db = readDb() || {};
    const v = (db.videos || []).find(x => x.id === videoId);
    if (!v) throw new Error('Pick a video from your library.');
    for (const x of [...this.parties.values()]) if (x.host === this.key) this.endParty(x.id);
    const party = {
      id: newId(), host: this.key, hostName: this.myName(), videoId: v.id, title: v.title, cover: thumbName(v.thumbnail),
      duration: Number(v.duration) || 0, filePath: v.filePath, members: new Set(), invited: new Set(), names: {},
      state: { playing: false, position: 0, at: Date.now() }, chat: []
    };
    this.parties.set(party.id, party);
    this.partySystem(party, `Watch party started: ${v.title}`);
    this.inviteToParty(party.id, inviteKeys);
    this.ui('party', { id: party.id });
    return this.partyView(party);
  }

  inviteToParty(id, keys = []) {
    const party = this.parties.get(id);
    if (!party || party.host !== this.key) throw new Error('Not your party');
    for (const k of keys) {
      if (!this.isFriend(k)) continue;
      party.invited.add(k);
      party.names[k] = this.s.friends[k].nickname || this.s.friends[k].name;
      this.thumbCache.delete(k);
      this.connected(k)?.event('party_invite', { id, title: party.title, cover: party.cover, duration: party.duration, videoId: party.videoId, hostName: this.myName() });
    }
    this.ui('party', { id });
  }

  partyJoin(peer, p) {
    const party = this.parties.get(String(p?.id || ''));
    if (!party || party.host !== this.key) throw new Error('That watch party has ended.');
    if (!party.invited.has(peer.key)) throw new Error('You weren’t invited to this party.');
    if (!party.members.has(peer.key)) {
      party.members.add(peer.key);
      party.names[peer.key] = this.s.friends[peer.key]?.name || party.names[peer.key] || 'Friend';
      this.partySystem(party, `${this.s.friends[peer.key]?.nickname || party.names[peer.key]} joined`);
      setTimeout(() => this.partyBroadcast(party), 50);
    }
    return this.partyWire(party);
  }

  async joinParty(id) {
    const party = this.parties.get(id);
    if (!party || party.host === this.key) throw new Error('No such invitation');
    const peer = this.connected(party.host);
    if (!peer) throw new Error('The host is offline.');
    const wire = await peer.request('party_join', { id });
    this.applyPartyWire(party, wire);
    party.joined = true;
    this.ui('party', { id });
    return this.partyView(party);
  }

  applyPartyWire(party, w) {
    if (!w || typeof w !== 'object') return;
    party.title = clip(w.title, 200);
    party.cover = clip(w.cover, 200);
    party.duration = Number(w.duration) || 0;
    party.videoId = clip(w.videoId, 60);
    party.hostName = clip(w.hostName, 80);
    // Re-stamp on our own clock: "position as of the moment this arrived".
    party.state = { playing: !!w.state?.playing, position: Number(w.state?.position) || 0, at: Date.now(), by: clip(w.state?.by, 80) };
    party.memberKeys = Array.isArray(w.members) ? w.members.map(m => m?.key).filter(isKey) : [];
    party.names = Object.fromEntries((w.members || []).filter(m => isKey(m?.key)).map(m => [m.key, clip(m.name, 80)]));
    party.chat = Array.isArray(w.chat)
      ? w.chat.slice(-100).map(m => ({ id: clip(m.id, 40), from: isKey(m.from) ? m.from : '', name: clip(m.name, 80), text: clip(m.text, 1000), ts: Number(m.ts) || 0, system: !!m.system }))
      : [];
  }

  /** play / pause / seek / ended — from this browser, or (on the host) relayed from a member. */
  partyControl(id, action, position, fromKey = this.key) {
    const party = this.parties.get(id);
    if (!party) throw new Error('No such party');
    if (party.host !== this.key) {
      const peer = this.connected(party.host);
      if (!peer) throw new Error('The host is offline.');
      peer.event('party_control', { id, action, position });
      return;
    }
    if (fromKey !== this.key && !party.members.has(fromKey)) return;
    const now = Date.now();
    const cur = this.partyPos(party, now);
    const pos = Number.isFinite(Number(position)) && position !== null ? Math.max(0, Number(position)) : cur;
    const by = fromKey === this.key ? this.myName() : party.names[fromKey] || 'Friend';
    if (action === 'play') party.state = { playing: true, position: pos, at: now, by };
    else if (action === 'pause') party.state = { playing: false, position: pos, at: now, by };
    else if (action === 'seek') party.state = { playing: party.state.playing, position: pos, at: now, by };
    else if (action === 'ended') party.state = { playing: false, position: party.duration || pos, at: now, by };
    else return;
    this.partyBroadcast(party);
  }

  partyChat(id, text, fromKey = this.key) {
    const party = this.parties.get(id);
    if (!party) throw new Error('No such party');
    const t = clip(text, 1000).trim();
    if (!t) return;
    if (party.host !== this.key) {
      const peer = this.connected(party.host);
      if (!peer) throw new Error('The host is offline.');
      peer.event('party_chat', { id, text: t });
      return;
    }
    if (fromKey !== this.key && !party.members.has(fromKey)) return;
    party.chat.push({ id: newId(), from: fromKey, name: fromKey === this.key ? this.myName() : party.names[fromKey] || 'Friend', text: t, ts: Date.now() });
    if (party.chat.length > MAX_PARTY_CHAT) party.chat.splice(0, party.chat.length - MAX_PARTY_CHAT);
    this.partyBroadcast(party);
  }

  leaveParty(id) {
    const party = this.parties.get(id);
    if (!party) return;
    if (party.host === this.key) return this.endParty(id);
    this.connected(party.host)?.event('party_leave', { id });
    this.parties.delete(id);
    this.ui('party', { id });
  }

  endParty(id) {
    const party = this.parties.get(id);
    if (!party || party.host !== this.key) return;
    for (const k of new Set([...party.members, ...party.invited])) this.connected(k)?.event('party_end', { id });
    this.parties.delete(id);
    for (const k of party.invited) this.thumbCache.delete(k);
    this.ui('party', { id, ended: true });
  }

  partyAllows(key, videoId) {
    return [...this.parties.values()].some(x => x.host === this.key && x.videoId === videoId && (x.members.has(key) || x.invited.has(key)));
  }

  partyMember(key) {
    return [...this.parties.values()].some(x => x.host === this.key && (x.members.has(key) || x.invited.has(key)));
  }

  partyPeerGone(key) {
    for (const party of [...this.parties.values()]) {
      if (party.host === this.key && party.members.has(key)) {
        party.members.delete(key);
        this.partySystem(party, `${party.names[key] || 'A friend'} dropped out`);
        this.partyBroadcast(party);
      } else if (party.host === key) {
        this.parties.delete(party.id);
        this.ui('party_end', { id: party.id, title: party.title, reason: 'offline' });
      }
    }
  }

  partyHeartbeat() {
    for (const party of this.parties.values()) if (party.host === this.key && party.members.size && party.state.playing) this.partyBroadcast(party);
  }

  onPartyEvent(peer, e, p) {
    const key = peer.key;
    const id = String(p?.id || '');
    const party = this.parties.get(id);
    switch (e) {
      case 'party_invite':
        if (!this.isFriend(key) || this.parties.size > 20) return;
        if (!party) {
          this.parties.set(id, {
            id, host: key, hostName: clip(p.hostName, 80), videoId: clip(p.videoId, 60), title: clip(p.title, 200), cover: clip(p.cover, 200),
            duration: Number(p.duration) || 0, memberKeys: [], names: {}, state: { playing: false, position: 0, at: Date.now() }, chat: [], joined: false
          });
        }
        this.ui('party_invite', { id, host: key, name: this.s.friends[key].nickname || this.s.friends[key].name, title: clip(p.title, 200) });
        break;
      case 'party_state':
        if (party && party.host === key) {
          this.applyPartyWire(party, p);
          if (party.joined) this.ui('party', { id });
        }
        break;
      case 'party_end':
        if (party && party.host === key) {
          this.parties.delete(id);
          this.ui('party_end', { id, title: party.title, reason: 'ended' });
        }
        break;
      case 'party_control':
        if (party && party.host === this.key) this.partyControl(id, clip(p.action, 10), p.position, key);
        break;
      case 'party_chat':
        if (party && party.host === this.key) this.partyChat(id, p.text, key);
        break;
      case 'party_leave':
        if (party && party.host === this.key && party.members.has(key)) {
          party.members.delete(key);
          party.invited.delete(key);
          this.partySystem(party, `${party.names[key] || 'A friend'} left`);
          this.partyBroadcast(party);
        }
        break;
    }
  }

  // ───────────────────────── peer files (thumb cache) ─────────────────────────
  cachePath(key, name) {
    const base = path.basename(String(name || ''));
    if (!isKey(key) || !base) return null;
    return path.join(PEER_CACHE, key, base);
  }

  async cacheThumb(key, name) {
    const dest = this.cachePath(key, name);
    if (!dest || !name || fs.existsSync(dest)) return dest;
    const peer = this.connected(key);
    if (!peer) return null;
    const { meta, stream } = await peer.request('thumb', { name }, { stream: true });
    if (meta.size > 15 * 1024 * 1024) {
      stream.destroy();
      return null;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    fs.writeFileSync(dest, Buffer.concat(chunks));
    return dest;
  }

  // ───────────────────────── views for the browser ─────────────────────────
  friendView(f) {
    const peer = this.connected(f.key);
    const t = n => (n ? `/api/p2p/peer/${f.key}/thumb/${encodeURIComponent(n)}` : '');
    const np = peer && f.nowPlaying ? { ...f.nowPlaying, coverUrl: t(f.nowPlaying.cover), position: nowPlayingPosition(f.nowPlaying) } : null;
    return {
      key: f.key,
      name: f.nickname || f.name,
      realName: f.name,
      nickname: f.nickname || '',
      handle: f.handle || '',
      mood: f.mood || '',
      bio: f.bio || '',
      status: peer ? f.status || 'online' : 'offline',
      online: !!peer,
      lastSeen: f.lastSeen || null,
      avatar: t(f.avatar),
      banner: t(f.banner),
      accent: f.accent || '',
      pictures: (f.pictures || []).map(t),
      live: peer && f.live ? { ...f.live, coverUrl: t(f.live.cover) } : null,
      nowPlaying: np,
      sharing: f.sharing || {},
      theirAccess: f.theirAccess || '',
      communication: communication(f.communication),
      theirCommunication: communication(f.theirCommunication),
      grants: f.grants || {},
      access: summarize(f.grants || {}),
      reviewAccess: !!f.reviewAccess,
      top: !!f.top,
      unread: this.s.unread[f.key] || 0,
      queued: (this.s.messages[f.key] || []).filter(m => m.status === 'queued').length,
      addedAt: f.addedAt
    };
  }

  state() {
    const db = readDb();
    const p = db?.profile || {};
    return {
      me: {
        key: this.key,
        invite: `spot://${this.key}`,
        banner: p.banner || '',
        tag: this.key.slice(0, 4),
        name: p.displayName || p.stationName || 'mAI Spot',
        handle: p.handle || '',
        status: p.statusMode || 'online',
        mood: p.moodBlurb || '',
        avatar: p.avatar || ''
      },
      network: { ...this.network, connections: [...this.peers.values()].filter(x => x.hello && !x.closed && !x.closing).length },
      friends: Object.values(this.s.friends).map(f => this.friendView(f)).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
      requests: {
        incoming: Object.values(this.s.requests.incoming).map(r => ({
          key: r.key, name: r.name || 'Unknown Spot', handle: r.handle || '', note: r.note || '', at: r.at, mood: r.mood || '',
          avatar: r.avatar && this.peers.get(r.key) ? `/api/p2p/peer/${r.key}/thumb/${encodeURIComponent(r.avatar)}` : '',
          online: !!this.connected(r.key),
          invite: r.invite?.label ?? null,
          viaInvite: !!r.invite,
          grants: r.grants || null
        })),
        outgoing: Object.values(this.s.requests.outgoing).map(r => ({
          key: r.key, name: r.name || '', at: r.at, declined: !!r.declined, reason: r.reason || '', online: !!this.connected(r.key),
          access: r.grants ? summarize(r.grants) : ''
        }))
      },
      blocked: this.s.blocked,
      groups: Object.values(this.s.groups).map(g => ({
        id: g.id, name: g.name, members: g.members.map(k => ({ key: k, name: k === this.key ? 'You' : this.s.friends[k]?.nickname || g.names?.[k] || k.slice(0, 8), online: k === this.key || !!this.connected(k) })),
        unread: g.unread || 0,
        last: g.messages[g.messages.length - 1] || null
      })),
      access: this.s.access,
      invites: Object.values(this.s.invites).sort((a, b) => b.createdAt - a.createdAt).map(i => this.inviteView(i)),
      parties: [...this.parties.values()].map(p => this.partyView(p)),
      nowPlaying: this.nowPlaying
    };
  }

  feedView() {
    const mine = this.s.posts.map(p => ({ ...p, mine: true }));
    const theirs = Object.entries(this.s.feed)
      .filter(([k]) => this.isFriend(k))
      .flatMap(([, list]) => list);
    const nameOf = k => (k === this.key ? this.myName() : this.s.friends[k]?.nickname || this.s.friends[k]?.name || 'Someone');
    const thumb = (author, name) =>
      !name ? '' : author === this.key ? `/api/media/thumbnails/${encodeURIComponent(name)}` : `/api/p2p/peer/${author}/thumb/${encodeURIComponent(name)}`;
    const db = readDb();
    return [...mine, ...theirs]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 400)
      .map(p => ({
        ...p,
        authorName: nameOf(p.author),
        authorAvatar: p.author === this.key ? db?.profile?.avatar || '' : this.friendView(this.s.friends[p.author] || { key: p.author }).avatar,
        authorOnline: p.author === this.key || !!this.connected(p.author),
        imageUrl: thumb(p.author, p.image),
        coverUrl: thumb(p.author, p.media?.cover),
        mediaUrl: p.media
          ? p.author === this.key
            ? (p.media.kind === 'track' ? db?.tracks : db?.videos)?.find(x => x.id === p.media.id)?.filePath || ''
            : `/api/p2p/peer/${p.author}/file/${p.media.kind}/${encodeURIComponent(p.media.id)}`
          : '',
        likedByMe: p.likes.includes(this.key),
        likeCount: p.likes.length,
        comments: p.comments.map(c => ({ ...c, name: c.from === this.key ? 'You' : this.s.friends[c.from]?.nickname || c.name, mine: c.from === this.key }))
      }));
  }
}

/** Accepts spot://<64 hex>/<token>, a bare key, or a pasted message containing a link. */
export function parseInviteLink(invite) {
  const str = String(invite || '').trim();
  const m = str.match(/([0-9a-fA-F]{64})(?:[\/#?](?:i=)?([A-Za-z0-9_-]{8,64}))?/);
  if (!m) return { key: null, token: null };
  return { key: m[1].toLowerCase(), token: m[2] || null };
}
export const parseInvite = s => parseInviteLink(s).key;
