// Local HTTP API for the browser: /api/p2p/*  (only ever reachable from this computer —
// server.mjs refuses /api/p2p from any other address).

import fs from 'node:fs';
import { isKey } from './node.mjs';
import { mimeFor } from './catalog.mjs';
import { updateDbProfile, readDb } from './store.mjs';
import { shareables } from './access.mjs';

/** Same sandbox policy as /api/apps/run, but rooted at the proxied path of a friend's game. */
function appCsp(own) {
  return [
    `default-src ${own}`,
    `script-src ${own} 'unsafe-inline' 'unsafe-eval' blob:`,
    `style-src ${own} 'unsafe-inline'`,
    `img-src ${own} data: blob:`,
    `media-src ${own} data: blob:`,
    `font-src ${own} data:`,
    `connect-src ${own} data: blob:`,
    `worker-src ${own} blob:`,
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'"
  ].join('; ');
}

const json = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};
const ok = (res, obj = {}) => json(res, 200, { success: true, ...obj });
const fail = (res, e, status = 400) => json(res, status, { success: false, error: e?.message || String(e) });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (ct && !ct.includes('application/json')) {
      reject(new Error('Content-Type must be application/json'));
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Bad JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseRange(header) {
  const m = String(header || '').match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;
  return { start: m[1] === '' ? undefined : Number(m[1]), end: m[2] === '' ? undefined : Number(m[2]), suffix: m[1] === '' && m[2] !== '' };
}

function serveLocalFile(req, res, file) {
  const st = fs.statSync(file);
  res.writeHead(200, { 'Content-Type': mimeFor(file), 'Content-Length': st.size, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', ...(file.endsWith('.svg') ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}) });
  fs.createReadStream(file).pipe(res);
}

export function createP2PHandler(node) {
  return async function handle(req, res, pathname, searchParams) {
    const parts = pathname.replace(/^\/api\/p2p\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const method = req.method;
    try {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const secFetchSite = req.headers['sec-fetch-site'];
        if (secFetchSite === 'cross-site') {
          return fail(res, 'Cross-site requests not allowed', 403);
        }
        const origin = req.headers['origin'];
        if (origin) {
          try {
            const o = new URL(origin);
            const h = o.hostname.toLowerCase();
            if (h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]' && h !== '::1') {
              return fail(res, 'Cross-origin requests not allowed', 403);
            }
          } catch {
            return fail(res, 'Invalid origin', 403);
          }
        }
      }

      // ── server-sent events ──
      if (parts[0] === 'events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 3000\n\n');
        const send = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`);
        node.on('ui', send);
        const beat = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => {
          clearInterval(beat);
          node.off('ui', send);
        });
        return;
      }

      if (parts[0] === 'state' && method === 'GET') return ok(res, node.state());

      if (parts[0] === 'friends' && method === 'POST') {
        const b = await readBody(req);
        switch (b.action) {
          case 'add':
            return ok(res, node.addFriend(b.invite, b.note, b.grants));
          case 'accept':
            node.acceptRequest(b.key, b.grants);
            return ok(res);
          case 'grants':
            return ok(res, { grants: node.setGrants(b.key, b.grants) });
          case 'decline':
            node.declineRequest(b.key);
            return ok(res);
          case 'cancel':
            node.cancelRequest(b.key);
            return ok(res);
          case 'remove':
            node.removeFriend(b.key);
            return ok(res);
          case 'block':
            node.block(b.key);
            return ok(res);
          case 'unblock':
            node.unblock(b.key);
            return ok(res);
          case 'update':
            node.updateFriend(b.key, { nickname: b.nickname, top: b.top });
            return ok(res);
          default:
            return fail(res, 'Unknown action');
        }
      }

      if (parts[0] === 'messages') {
        if (method === 'GET') {
          const peer = searchParams.get('peer');
          return ok(res, { messages: node.s.messages[peer] || [] });
        }
        const b = await readBody(req);
        if (b.action === 'read') {
          node.markRead(b.peer);
          return ok(res);
        }
        return ok(res, { message: await node.sendDM(b.to, b.text, b.id) });
      }

      if (parts[0] === 'groups') {
        if (method === 'GET' && parts[1]) {
          const g = node.s.groups[parts[1]];
          if (!g) return fail(res, 'No such group', 404);
          return ok(res, { group: { ...node.groupMeta(g), messages: g.messages, me: node.key } });
        }
        const b = await readBody(req);
        switch (b.action) {
          case 'create':
            return ok(res, { group: node.createGroup(b.name, b.members || []) });
          case 'send':
            return ok(res, { message: node.sendGroup(b.id, b.text) });
          case 'add':
            node.addGroupMembers(b.id, b.members || []);
            return ok(res);
          case 'leave':
            node.leaveGroup(b.id);
            return ok(res);
          case 'read':
            node.markGroupRead(b.id);
            return ok(res);
          default:
            return fail(res, 'Unknown action');
        }
      }

      if (parts[0] === 'feed') {
        if (method === 'GET') return ok(res, { posts: node.feedView(), me: node.key });
        const b = await readBody(req);
        const mine = b.author === node.key || !b.author;
        switch (b.action) {
          case 'post':
            return ok(res, { post: node.createPost(b) });
          case 'delete':
            node.deletePost(b.id);
            return ok(res);
          case 'like':
            if (mine) node.likeMine(b.id, b.like);
            else await node.reactFriend(b.author, b.id, b.like);
            return ok(res);
          case 'comment':
            if (mine) node.commentMine(b.id, b.text);
            else await node.commentFriend(b.author, b.id, b.text);
            return ok(res);
          case 'delete_comment':
            node.deleteComment(b.id, b.commentId);
            return ok(res);
          case 'refresh':
            await Promise.all([...node.peers.values()].filter(p => p.hello && node.isFriend(p.key)).map(p => node.syncFeed(p)));
            return ok(res);
          default:
            return fail(res, 'Unknown action');
        }
      }

      if (parts[0] === 'status' && method === 'POST') {
        const b = await readBody(req);
        const updates = {};
        if (['online', 'away', 'dnd', 'offline'].includes(b.status)) {
          updates.statusMode = b.status;
          updates.isOnline = b.status !== 'offline';
        }
        if (typeof b.mood === 'string') updates.moodBlurb = b.mood.slice(0, 280);
        const profile = updateDbProfile(updates);
        node.checkPresence();
        return ok(res, { profile });
      }

      if (parts[0] === 'access' && method === 'POST') {
        return ok(res, { access: node.setAccessSettings(await readBody(req)) });
      }

      if (parts[0] === 'shareables' && method === 'GET') {
        return ok(res, { items: shareables(readDb() || {}) });
      }

      if (parts[0] === 'invites' && method === 'POST') {
        const b = await readBody(req);
        if (b.action === 'create') return ok(res, { invite: node.createInvite(b) });
        if (b.action === 'revoke') {
          node.revokeInvite(String(b.token || ''));
          return ok(res);
        }
        return fail(res, 'Unknown action');
      }

      if (parts[0] === 'nowplaying' && method === 'POST') {
        node.setNowPlaying(await readBody(req));
        return ok(res);
      }

      if (parts[0] === 'party') {
        if (method === 'GET') return ok(res, { parties: [...node.parties.values()].map(p => node.partyView(p)) });
        const b = await readBody(req);
        const id = String(b.id || '');
        switch (b.action) {
          case 'create':
            return ok(res, { party: node.createParty(b.videoId, b.invite || []) });
          case 'invite':
            node.inviteToParty(id, b.invite || []);
            return ok(res);
          case 'join':
            return ok(res, { party: await node.joinParty(id) });
          case 'decline':
          case 'leave':
            node.leaveParty(id);
            return ok(res);
          case 'end':
            node.endParty(id);
            return ok(res);
          case 'control':
            node.partyControl(id, String(b.control || ''), b.position);
            return ok(res);
          case 'chat':
            node.partyChat(id, b.text);
            return ok(res);
          default:
            return fail(res, 'Unknown action');
        }
      }

      if (parts[0] === 'call' && method === 'POST') {
        const b = await readBody(req);
        node.callSignal(b.to, b);
        return ok(res);
      }

      // ── a friend's node, proxied ──
      if (parts[0] === 'peer' && isKey(parts[1])) {
        const key = parts[1];
        const what = parts[2];

        if (what === 'thumb' && parts[3]) {
          const cached = node.cachePath(key, parts[3]);
          if (cached && fs.existsSync(cached)) return serveLocalFile(req, res, cached);
          const file = await node.cacheThumb(key, parts[3]).catch(() => null);
          if (file && fs.existsSync(file)) return serveLocalFile(req, res, file);
          res.writeHead(404);
          return res.end();
        }

        if (what === 'along') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          return res.end(JSON.stringify(node.alongView(key)));
        }

        // Watch-party hosts may not be friends-of-friends, but they are always friends.
        if (!node.isFriend(key)) return fail(res, 'Not a friend', 403);
        const peer = node.connected(key);
        if (!peer) return fail(res, 'This friend is offline right now.', 503);
        const base = `/api/p2p/peer/${key}`;

        if (what === 'catalog') {
          const r = await peer.request('catalog', {});
          const t = n => (n ? `${base}/thumb/${encodeURIComponent(n)}` : '');
          const x = p => `${base}/x/${p}`;
          return ok(res, {
            profile: r.profile,
            stations: (r.stations || []).map(s => ({ ...s, cover: t(s.cover) })),
            playlists: (r.playlists || []).map(p => ({ ...p, cover: t(p.cover) })),
            tracks: (r.tracks || []).map(v => ({ ...v, coverArt: t(v.cover), filePath: `${base}/file/track/${encodeURIComponent(v.id)}` })),
            channels: (r.channels || []).map(c => ({ ...c, avatar: t(c.avatar), banner: t(c.banner) })),
            collections: (r.collections || []).map(c => ({ ...c, cover: t(c.cover) })),
            videos: (r.videos || []).map(v => ({ ...v, thumbnail: t(v.thumbnail), filePath: `${base}/file/video/${encodeURIComponent(v.id)}` })),
            albums: (r.albums || []).map(a => ({
              ...a,
              pictures: (a.files || []).map(f => ({
                name: f,
                url: x(`api/pictures/file/${encodeURIComponent(a.id)}/${encodeURIComponent(f)}`),
                thumb: x(`api/pictures/thumb/${encodeURIComponent(a.id)}/${encodeURIComponent(f)}`)
              }))
            })),
            apps: (r.apps || []).map(a => ({ ...a, thumbnail: t(a.thumbnail), runUrl: String(a.entryPoint || '').startsWith('/api/apps/run/') ? x(a.entryPoint.slice(1)) : x(`api/apps/run/${encodeURIComponent(a.slug)}/index.html`) })),
            books: (r.books || []).map(b => ({ ...b, cover: t(b.cover), base: `${base}/x` }))
          });
        }

        if (what === 'x' && parts.length > 3) {
          // Books, games/apps and pictures, fetched through the friend's node (it checks access).
          const rel = pathname.split('/').slice(6).join('/'); // after /api/p2p/peer/<key>/x/ — keeps the original encoding
          const range = req.headers.range;
          const r = await peer.request('get', { path: rel, range: typeof range === 'string' ? range : undefined }, { stream: true, timeout: 30000 });
          const meta = r.meta || r;
          const headers = { ...(meta.headers || {}), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' };
          if (rel.startsWith('api/apps/run/')) {
            const slug = rel.split('/')[3];
            headers['content-security-policy'] = appCsp(`http://${req.headers.host || 'localhost'}${base}/x/api/apps/run/${slug}/`);
            headers['Access-Control-Allow-Origin'] = '*';
          }
          res.writeHead(meta.status || 200, headers);
          if (!r.stream) return res.end();
          r.stream.pipe(res);
          res.on('close', () => r.stream.destroy());
          r.stream.on('error', () => res.destroy());
          return;
        }

        if (what === 'live') {
          const t0 = Date.now();
          const r = await peer.request('live', {});
          const t = n => (n ? `/api/p2p/peer/${key}/thumb/${encodeURIComponent(n)}` : '');
          if (r.live && r.track) {
            r.offset = (r.offset || 0) + (Date.now() - t0) / 2000; // half the round trip
            r.track = { ...r.track, coverArt: t(r.track.cover), filePath: `/api/p2p/peer/${key}/file/track/${encodeURIComponent(r.track.id)}` };
            r.upNext = (r.upNext || []).map(x => ({ ...x, coverArt: t(x.cover) }));
            if (r.station) r.station.cover = t(r.station.cover);
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          return res.end(JSON.stringify(r));
        }

        if (what === 'file' && (parts[3] === 'track' || parts[3] === 'video') && parts[4]) {
          const range = parseRange(req.headers.range);
          const params = { kind: parts[3], id: parts[4] };
          if (range && !range.suffix) {
            if (range.start !== undefined) params.start = range.start;
            if (range.end !== undefined) params.end = range.end;
          }
          let { meta, stream } = await peer.request('file', params, { stream: true, timeout: 30000 });
          if (range?.suffix) {
            // Rare (browsers probing the end of a file): re-request the tail.
            stream.destroy();
            const n = Number(req.headers.range.split('-')[1]);
            ({ meta, stream } = await peer.request('file', { ...params, start: Math.max(0, meta.size - n) }, { stream: true, timeout: 30000 }));
          }
          const headers = {
            'Content-Type': meta.mime,
            'Accept-Ranges': 'bytes',
            'Content-Length': Math.max(0, meta.end - meta.start + 1),
            'Cache-Control': 'no-store'
          };
          if (range) {
            headers['Content-Range'] = `bytes ${meta.start}-${meta.end}/${meta.size}`;
            res.writeHead(206, headers);
          } else res.writeHead(200, headers);
          stream.pipe(res);
          res.on('close', () => stream.destroy());
          stream.on('error', () => res.destroy());
          return;
        }
      }

      return fail(res, 'Not found', 404);
    } catch (e) {
      if (!res.headersSent) return fail(res, e, 400);
      res.destroy();
    }
  };
}
