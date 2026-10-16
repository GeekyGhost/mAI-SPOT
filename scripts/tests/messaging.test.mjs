import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Duplex } from 'node:stream';
import test from 'node:test';
import { Peer } from '../../p2p/protocol.mjs';
import { SpotNode } from '../../p2p/node.mjs';
import { createP2PHandler } from '../../p2p/http.mjs';

// Do not construct a real SpotNode: these tests never load identities, save user data,
// open sockets, discover peers, or send anything to the user's friends.
function node(key, friendKey) {
  const n = new EventEmitter(); Object.setPrototypeOf(n, SpotNode.prototype);
  n.key = key;
  n.s = { friends: { [friendKey]: { key: friendKey, name: 'Test friend' } }, messages: {}, unread: {} };
  n.peers = new Map(); n.dmDeliveries = new Map();
  return n;
}

function pair() {
  const a = node('a'.repeat(64), 'b'.repeat(64)), b = node('b'.repeat(64), 'a'.repeat(64));
  let left, right;
  left = new Duplex({ read() {}, write(c, _, done) { right.push(Buffer.from(c)); done(); } });
  right = new Duplex({ read() {}, write(c, _, done) { left.push(Buffer.from(c)); done(); } });
  const ap = new Peer(left, b.key), bp = new Peer(right, a.key);
  ap.hello = bp.hello = {}; a.peers.set(b.key, ap); b.peers.set(a.key, bp);
  ap.handler = (m, p) => a.handleRequest(ap, m, p);
  bp.handler = (m, p) => b.handleRequest(bp, m, p);
  ap.on('event', (e, p) => a.onEvent(ap, e, p));
  bp.on('event', (e, p) => b.onEvent(bp, e, p));
  return { a, b, ap, bp, close() { ap.destroy(); bp.destroy(); } };
}

async function request(node, path, body, headers = {}) {
  const req = new EventEmitter();
  req.method = body ? 'POST' : 'GET';
  req.headers = { 'content-type': 'application/json', origin: 'http://localhost:8088', ...headers };
  let status, result;
  const res = { writeHead(value) { status = value; }, end(data) { result = JSON.parse(data); } };
  const url = new URL(path, 'http://localhost');
  const work = createP2PHandler(node)(req, res, url.pathname, url.searchParams);
  if (body) { req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); }
  await work;
  return { status, body: result };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('message API and framed protocol deliver both ways with read receipts', async t => {
  const p = pair(); t.after(() => p.close());
  const sent = await request(p.a, '/api/p2p/messages', { to: p.b.key, text: 'hello', id: 'message-0001' });
  assert.equal(sent.status, 200);
  await flush();
  assert.equal(p.b.s.messages[p.a.key][0].text, 'hello');
  assert.equal(p.a.s.messages[p.b.key][0].status, 'delivered');
  await request(p.b, '/api/p2p/messages', { to: p.a.key, text: 'reply' });
  await flush();
  const list = await request(p.a, `/api/p2p/messages?peer=${p.b.key}`);
  assert.equal(list.body.messages.length, 2);
  p.b.markRead(p.a.key); await flush();
  assert.equal(p.a.s.messages[p.b.key][0].status, 'read');
});

test('repeated browser sends and protocol retries create one message', async t => {
  const p = pair(); t.after(() => p.close());
  const payload = { to: p.b.key, text: 'only once', id: 'message-0002' };
  const results = await Promise.all([request(p.a, '/api/p2p/messages', payload), request(p.a, '/api/p2p/messages', payload)]);
  await flush();
  assert.ok(results.every(r => r.status === 200));
  assert.equal(p.a.s.messages[p.b.key].length, 1);
  assert.equal(p.b.s.messages[p.a.key].length, 1);
  await p.a.deliver(p.ap, p.a.s.messages[p.b.key][0]);
  assert.equal(p.b.s.messages[p.a.key].length, 1);
  const conflict = await request(p.a, '/api/p2p/messages', { ...payload, text: 'different content' });
  assert.equal(conflict.status, 400);
  assert.match(conflict.body.error, /already used/);
});

test('a slow peer does not hold the send API open and concurrent flushes coalesce', async t => {
  const p = pair(); t.after(() => p.close());
  let finish, attempts = 0;
  p.ap.request = async () => { attempts++; await new Promise(resolve => { finish = resolve; }); };
  const sent = await request(p.a, '/api/p2p/messages', { to: p.b.key, text: 'queued immediately' });
  assert.equal(sent.status, 200); assert.equal(sent.body.message.status, 'queued');
  const one = p.a.flushOutbox(p.ap), two = p.a.flushOutbox(p.ap);
  await flush(); assert.equal(attempts, 1);
  finish(); await Promise.all([one, two]);
  assert.equal(p.a.s.messages[p.b.key][0].status, 'delivered');
  assert.equal(p.a.dmDeliveries.size, 0);
});

test('transient failures retry on an existing connection', async t => {
  const p = pair(); t.after(() => p.close());
  const realRequest = p.ap.request.bind(p.ap);
  p.ap.request = async () => { throw new Error('temporary failure'); };
  await p.a.sendDM(p.b.key, 'retry me'); await flush();
  assert.equal(p.a.s.messages[p.b.key][0].status, 'queued');
  assert.equal(p.a.dmDeliveries.size, 0);
  p.ap.request = realRequest;
  await p.a.flushOutbox(p.ap);
  assert.equal(p.a.s.messages[p.b.key][0].status, 'delivered');
  assert.equal(p.b.s.messages[p.a.key].length, 1);
});

test('offline messages deliver after reconnect and calls report offline', async t => {
  const p = pair(); t.after(() => p.close()); p.ap.hello = null;
  const sent = await request(p.a, '/api/p2p/messages', { to: p.b.key, text: 'offline' });
  assert.equal(sent.body.message.status, 'queued');
  const call = await request(p.a, '/api/p2p/call', { to: p.b.key, callId: 'offline', kind: 'offer' });
  assert.equal(call.status, 400); assert.match(call.body.error, /offline/);
  p.ap.hello = {}; await p.a.flushOutbox(p.ap);
  assert.equal(p.a.s.messages[p.b.key][0].status, 'delivered');
});

test('a read receipt arriving before the delivery response stays read', async t => {
  const p = pair(); t.after(() => p.close());
  const handler = p.bp.handler;
  p.bp.handler = async (method, params) => {
    const result = await handler(method, params);
    if (method === 'dm') p.b.markRead(p.a.key);
    return result;
  };
  await p.a.sendDM(p.b.key, 'immediately read'); await flush();
  assert.equal(p.a.s.messages[p.b.key][0].status, 'read');
});

test('call signaling relays valid messages and rejects malformed signals', async t => {
  const p = pair(); t.after(() => p.close());
  const relayed = []; p.b.on('ui', ev => { if (ev.type === 'call') relayed.push(ev); });
  for (const kind of ['offer', 'ice', 'answer', 'bye', 'reject']) {
    assert.equal((await request(p.a, '/api/p2p/call', { to: p.b.key, callId: 'test-call', kind, data: {} })).status, 200);
  }
  await flush();
  assert.deepEqual(relayed.map(ev => ev.kind), ['offer', 'ice', 'answer', 'bye', 'reject']);
  for (const payload of [{ callId: '', kind: 'offer' }, { callId: 'x', kind: 'unknown' }]) {
    assert.equal((await request(p.a, '/api/p2p/call', { to: p.b.key, ...payload })).status, 400);
  }
});

test('messaging rejects non-friends, empty text, invalid IDs and cross-site requests', async t => {
  const p = pair(); t.after(() => p.close());
  for (const body of [{ to: 'c'.repeat(64), text: 'hello' }, { to: p.b.key, text: '   ' }, { to: p.b.key, text: 'hello', id: 'bad' }]) {
    assert.equal((await request(p.a, '/api/p2p/messages', body)).status, 400);
  }
  const blocked = await request(p.a, '/api/p2p/messages', { to: p.b.key, text: 'hello' }, { 'sec-fetch-site': 'cross-site' });
  assert.equal(blocked.status, 403);
  assert.equal(Object.keys(p.a.s.messages).length, 0);
});
