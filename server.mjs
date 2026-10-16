// mAI Spot node server.
//
// Runs Next.js behind a tiny gate:
//   • From THIS computer (localhost) you get the whole app — your Spot, studio, uploads, everything.
//   • From other devices on your network only the public radio is reachable: the /listen page,
//     the live now-playing feed, cover art, and the audio files in the live running order.
//     Nothing can be changed remotely.
//
// Usage:  node server.mjs          (production; run `npm run build` first)
//         node server.mjs --dev    (development with hot reload)
// Env:    PORT=8088                 port to listen on
//         MAISPOT_LAN=0             only listen on localhost (no network listeners at all)

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import next from 'next';
import { SpotNode } from './p2p/node.mjs';
import { createP2PHandler } from './p2p/http.mjs';
import { childOperation } from './scripts/lib/operation-lock.mjs';

const dev = process.argv.includes('--dev');
if (dev) process.env.MAISPOT_DEV = '1';
const port = parseInt(process.env.PORT || '8088', 10);
const lanEnabled = process.env.MAISPOT_LAN !== '0';
const bindHost = lanEnabled ? '0.0.0.0' : '127.0.0.1';
const root = process.cwd();
const releaseLock = childOperation(root, 'running the Spot');
process.once('exit', releaseLock);
const dbPath = path.join(root, 'data', 'db.json');

const remoteOnly = process.env.MAISPOT_REMOTE_ONLY === '1';
const trustProxy = process.env.MAISPOT_TRUST_PROXY === '1';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function getRemoteIp(req) {
  if (trustProxy && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function isLocalHost(hostHeader) {
  if (!hostHeader) return false;
  const host = hostHeader.startsWith('[')
    ? (hostHeader.match(/^(\[[^\]]+\])/)?.[1] || '')
    : hostHeader.split(':')[0];
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

const isLocal = req => !remoteOnly && LOOPBACK.has(getRemoteIp(req)) && isLocalHost(req.headers.host || '');

// Which audio files the live station may stream to remote listeners (cached by db.json mtime).
let liveCache = { mtime: 0, files: new Set() };
function liveFiles() {
  try {
    const mtime = fs.statSync(dbPath).mtimeMs;
    if (mtime !== liveCache.mtime) {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const st = (db.stations || []).find(s => s.isLive);
      const files = new Set();
      for (const id of st?.order || []) {
        const t = (db.tracks || []).find(x => x.id === id);
        if (t) files.add(decodeURIComponent(t.filePath.split('/').pop() || ''));
      }
      liveCache = { mtime, files };
    }
  } catch {
    liveCache = { mtime: 0, files: new Set() };
  }
  return liveCache.files;
}

const PUBLIC_STATIC = new Set(['/favicon.svg', '/logo.svg', '/manifest.json', '/icon-256.png', '/icon-512.png']);

function remoteAllowed(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return false;
  }
  if (pathname === '/listen' || pathname.startsWith('/listen/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (PUBLIC_STATIC.has(pathname)) return true;
  if (pathname === '/api/radio/live') return true;
  if (pathname.startsWith('/api/media/thumbnails/')) return true;
  if (pathname.startsWith('/api/media/audio/')) {
    return liveFiles().has(path.basename(pathname));
  }
  return false;
}

const DENIED = `<!doctype html><meta charset="utf-8"><title>mAI Spot</title>
<body style="background:#030608;color:#a1efff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="color:#f9993c;margin:0 0 8px">This Spot is private</h1>
<p>Only the radio is open to visitors.</p><p><a href="/listen" style="color:#2ee8f7">Tune in to the live station →</a></p></div>`;

const server = createServer();
const app = next({ dev, hostname: 'localhost', port, httpServer: server });
const handle = app.getRequestHandler();

await app.prepare();

// Peer-to-peer node (friends, messages, feed, calls). Starts in the background; the site works
// even if the internet/DHT is unreachable.
const p2p = new SpotNode({ localPort: port });
const handleP2P = createP2PHandler(p2p);
p2p.start().catch(e => console.error('[p2p] failed to start:', e?.message || e));

server.on('request', (req, res) => {
  if (!isLocal(req) && !remoteAllowed(req)) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(DENIED);
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/p2p/')) {
    handleP2P(req, res, url.pathname, url.searchParams);
    return;
  }
  handle(req, res);
});

const shutdown = async () => {
  await p2p.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Next attaches its own upgrade handler (dev hot-reload); refuse remote upgrades except HMR.
server.prependListener('upgrade', (req, socket) => {
  if (!isLocal(req) && !(req.url || '').startsWith('/_next/')) socket.destroy();
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[mAI Spot] Port ${port} is already in use. Is mAI Spot already running?`);
    console.error('           Close the other window, or set a different port:  set PORT=8090\n');
  } else {
    console.error('[mAI Spot] server error:', err);
  }
  process.exit(1);
});

server.listen(port, bindHost, () => {
  const lan = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) lan.push(a.address);
  }
  console.log('');
  console.log(`  mAI Spot is running (${dev ? 'development' : 'production'})`);
  console.log(`  Your Spot:        http://localhost:${port}`);
  if (lanEnabled && lan.length) {
    console.log(`  Radio listeners:  ${lan.map(ip => `http://${ip}:${port}/listen`).join('   ')}`);
    console.log('                    (other devices only see the live radio; nothing else is reachable)');
  }
  console.log('');
});
