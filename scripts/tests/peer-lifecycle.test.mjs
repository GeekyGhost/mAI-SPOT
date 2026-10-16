import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import DHT from 'hyperdht';
import Hyperswarm from 'hyperswarm';
import createTestnet from 'hyperdht/testnet.js';
import { SpotNode } from '../../p2p/node.mjs';
import { Peer } from '../../p2p/protocol.mjs';
import { createP2PHandler } from '../../p2p/http.mjs';

// Real Noise/UDX connections, using disposable keys and loopback-only discovery.
// No SpotNode constructor, user files, real friends or public bootstrap servers.
function fixture(pair, other, net, saved) {
  const node = new EventEmitter(); Object.setPrototypeOf(node, SpotNode.prototype);
  node.key = pair.publicKey.toString('hex'); const friend = other.publicKey.toString('hex');
  node.s = saved || { friends: { [friend]: { key: friend, name: 'Fixture friend', grants: {} } }, requests: { incoming: {}, outgoing: {} }, blocked: [], groups: {}, messages: {}, unread: {}, feed: {}, posts: [], invites: {}, access: { shareNowPlaying: true, requireInvite: true, defaults: [] } };
  for (const prop of ['peers', 'dmDeliveries', 'calls', 'thumbCache', 'presenceSig', 'parties']) node[prop] = new Map();
  node.summaryFor = () => ({ name: 'Fixture friend', status: 'online' });
  node.syncTopFriends = () => {};
  node.swarm = new Hyperswarm({ dht: net.createNode({ keyPair: pair }), keyPair: pair });
  node.swarm.on('connection', conn => node.onConnection(conn));
  return node;
}
function waitFor(node, check) {
  return new Promise((resolve, reject) => {
    const clear = () => { clearTimeout(timer); node.off('ui', listener); };
    const listener = () => { if (check()) { clear(); resolve(); } };
    const timer = setTimeout(() => { clear(); reject(new Error('Timed out waiting for isolated peer lifecycle')); }, 7000);
    node.on('ui', listener); listener();
  });
}
async function removeViaApi(node, key) {
  const req = new EventEmitter(); req.method = 'POST'; req.headers = { origin: 'http://localhost:8088' };
  let status, body;
  const res = { writeHead(code) { status = code; }, end(data) { body = JSON.parse(data); } };
  const work = createP2PHandler(node)(req, res, '/api/p2p/friends', new URLSearchParams());
  req.emit('data', Buffer.from(JSON.stringify({ action: 'remove', key }))); req.emit('end');
  await work; assert.equal(status, 200); assert.equal(body.success, true);
}

test('real encrypted peers reconnect, remove and re-pair with a new invite without losing messages', { timeout: 30000 }, async t => {
  const net = await createTestnet(3), ka = DHT.keyPair(), kb = DHT.keyPair();
  let a = fixture(ka, kb, net), b = fixture(kb, ka, net);
  t.after(async () => { await Promise.all([a.swarm.destroy(), b.swarm.destroy()]); await net.destroy(); });
  await Promise.all([a.swarm.listen(), b.swarm.listen()]);
  const online = Promise.all([waitFor(a, () => !!a.connected(b.key)), waitFor(b, () => !!b.connected(a.key))]);
  a.join(b.key); b.join(a.key); await online;
  await t.test('existing friends become online and deliver a message over the real transport', async () => {
    assert.equal(a.friendView(a.s.friends[b.key]).online, true);
    assert.equal(b.friendView(b.s.friends[a.key]).online, true);
    const message = await a.sendDM(b.key, 'initial encrypted fixture');
    await a.flushOutbox(a.connected(b.key));
    assert.equal(message.status, 'delivered'); assert.equal(b.s.messages[a.key].length, 1);
  });
  await t.test('an existing friendship survives a restart and drains offline messages', async () => {
    const disconnected = waitFor(b, () => !b.connected(a.key));
    const saved = structuredClone(a.s); await a.swarm.destroy(); await disconnected;
    const queued = await b.sendDM(a.key, 'queued during restart'); assert.equal(queued.status, 'queued');
    a = fixture(ka, kb, net, saved);
    const reconnected = Promise.all([waitFor(a, () => !!a.connected(b.key)), waitFor(b, () => !!b.connected(a.key))]);
    await a.swarm.listen(); a.join(b.key); b.join(a.key); await reconnected;
    await b.flushOutbox(b.connected(a.key));
    assert.equal(queued.status, 'delivered'); assert.equal(a.s.messages[b.key].length, 2);
  });
  const previous = a.connected(b.key);
  await t.test('removing one friend actually notifies the other before the encrypted socket closes', async () => {
    const removed = waitFor(b, () => !b.isFriend(a.key));
    await removeViaApi(a, b.key); await removed;
    assert.equal(a.isFriend(b.key), false); assert.equal(b.isFriend(a.key), false);
    assert.equal(a.s.messages[b.key].length, 2); assert.equal(b.s.messages[a.key].length, 2);
  });
  await t.test('a fresh one-time invite restores messaging and obsolete events cannot undo the new pairing', async () => {
    const invite = b.createInvite({ label: 'Fixture repair', days: 1 });
    const incoming = waitFor(b, () => !!b.s.requests.incoming[a.key]);
    a.addFriend(invite.link); await incoming;
    assert.equal(b.s.invites[invite.token].usedBy, a.key);
    const accepted = waitFor(a, () => a.isFriend(b.key) && !!a.connected(b.key));
    b.acceptRequest(a.key); await accepted;
    a.onEvent(previous, 'unfriend', {}); a.onPeerClose(previous);
    assert.equal(a.isFriend(b.key), true); assert.equal(a.friendView(a.s.friends[b.key]).online, true);
    const reply = await b.sendDM(a.key, 'after fresh invite');
    await b.flushOutbox(b.connected(a.key));
    assert.equal(reply.status, 'delivered'); assert.equal(a.s.messages[b.key].length, 3);
    assert.equal(a.s.messages[b.key][0].text, 'initial encrypted fixture');
  });
});

test('graceful peer shutdown is bounded and rejects new writes immediately', async () => {
  const conn = new EventEmitter(); let ends = 0;
  conn.write = () => { throw new Error('Must not write after graceful close starts'); };
  conn.end = () => { ends++; };
  conn.destroy = () => conn.emit('close');
  const peer = new Peer(conn, 'a'.repeat(64));
  peer.closeGracefully(); peer.closeGracefully();
  assert.equal(ends, 1); assert.equal(peer.event('hello', {}), undefined);
  await assert.rejects(peer.request('dm', {}), /offline/);
  await new Promise(resolve => { peer.once('close', resolve); setTimeout(resolve, 2500); });
  assert.equal(peer.closed, true);
});
