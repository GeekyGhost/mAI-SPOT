import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../../src/lib/calls.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

class Track {
  constructor(kind) { this.kind = kind; this.id = `${kind}-${Math.random()}`; this.enabled = true; this.stopped = false; }
  stop() { this.stopped = true; }
}
class Stream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  addTrack(track) { this.tracks.push(track); }
}
class PC {
  connectionState = 'new';
  localDescription = null;
  remoteDescription = null;
  addedIce = [];
  addedTracks = [];
  async createOffer() { return { type: 'offer', sdp: 'test-offer' }; }
  async createAnswer() { return { type: 'answer', sdp: 'test-answer' }; }
  async setLocalDescription(sdp) {
    this.localDescription = sdp;
    // Deliberately produce ICE before the offer/answer HTTP request is sent.
    this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'local-ice' }) } });
  }
  async setRemoteDescription(sdp) {
    if (this.remoteError) throw this.remoteError;
    if (this.remoteWait) await this.remoteWait;
    this.remoteDescription = sdp;
  }
  async addIceCandidate(ice) {
    assert.ok(this.remoteDescription, 'ICE must wait for remote SDP');
    if (this.iceError) throw this.iceError;
    this.addedIce.push(ice);
  }
  addTrack(track) { this.addedTracks.push(track); }
  state(value) { this.connectionState = value; this.onconnectionstatechange?.(); }
  close() { this.closed = true; this.state('closed'); }
}

function harness(overrides = {}) {
  let now = 0, nextTimer = 0;
  const timers = new Map();
  const timer = (fn, ms, repeat = false) => { const id = ++nextTimer; timers.set(id, { fn, at: now + ms, ms, repeat }); return id; };
  const context = vm.createContext({ exports: {}, crypto: webcrypto, navigator: {}, isSecureContext: true,
    setTimeout: (fn, ms) => timer(fn, ms), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => timer(fn, ms, true), clearInterval: id => timers.delete(id) });
  vm.runInContext(source, context);
  const pcs = [], streams = [], signals = [], snapshots = [];
  let latest;
  const manager = new context.exports.CallManager({
    change: value => { latest = value; snapshots.push(value); }, ring() {},
    signal: async (to, callId, kind, data) => { signals.push({ to, callId, kind, data }); await overrides.signal?.(kind, data, { to, callId }); },
    media: overrides.defaultMedia ? undefined : overrides.media || (async video => {
      const stream = new Stream([new Track('audio'), ...(video ? [new Track('video')] : [])]); streams.push(stream); return stream;
    }),
    peerConnection: () => { const pc = new PC(); overrides.pc?.(pc); pcs.push(pc); return pc; },
    stream: tracks => new Stream(tracks)
  });
  return { manager, pcs, streams, signals, snapshots, get latest() { return latest; },
    async tick(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers.entries()].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, value] = due; now = value.at;
        if (value.repeat) value.at += value.ms; else timers.delete(id);
        value.fn(); await flush();
      }
      now = target; await flush();
    }
  };
}
const offer = (id = 'incoming', from = 'friend') => ({ from, name: 'Friend', callId: id, kind: 'offer', data: { sdp: { type: 'offer', sdp: 'remote-offer' }, video: true } });
const answer = h => ({ from: 'friend', name: 'Friend', callId: h.latest.call.callId, kind: 'answer', data: { sdp: { type: 'answer', sdp: 'remote-answer' } } });
const ice = (id = 'incoming', from = 'friend') => ({ from, name: 'Friend', callId: id, kind: 'ice', data: { candidate: 'remote-ice' } });

test('outgoing SDP precedes ICE and active calls clear the setup timeout', async () => {
  const h = harness();
  await h.manager.start('friend', 'Friend', true);
  await flush();
  assert.deepEqual(h.signals.map(s => s.kind), ['offer', 'ice']);
  await h.manager.receive(answer(h));
  h.pcs[0].state('connected');
  await h.tick(60000);
  assert.equal(h.latest.call.status, 'active');
  h.manager.toggle('audio'); h.manager.toggle('video');
  assert.equal(h.latest.call.micOn, false); assert.equal(h.latest.call.camOn, false);
  h.manager.hangUp(); await flush();
  assert.ok(h.streams[0].getTracks().every(t => t.stopped));
  assert.equal(h.pcs[0].closed, true);
  assert.equal(h.latest.localStream, null);
  assert.equal(h.signals.at(-1).kind, 'bye');
});

test('early incoming ICE survives the offer and waits for remote SDP', async () => {
  const h = harness();
  await h.manager.receive(ice());
  await h.manager.receive(offer());
  await h.manager.receive(ice());
  await h.manager.accept(false);
  await flush();
  assert.equal(h.pcs[0].addedIce.length, 2);
  assert.deepEqual(h.signals.map(s => s.kind), ['answer', 'ice']);
  assert.equal(h.streams[0].getVideoTracks().length, 0);
  h.manager.dispose();
});

test('ICE arriving during remote SDP setup is serialized', async () => {
  const gate = deferred();
  const h = harness({ pc: pc => { pc.remoteWait = gate.promise; } });
  await h.manager.receive(offer());
  const accepting = h.manager.accept(true); await flush();
  const receiving = h.manager.receive(ice()); await flush();
  assert.equal(h.pcs[0].addedIce.length, 0);
  gate.resolve(); await Promise.all([accepting, receiving]);
  assert.equal(h.pcs[0].addedIce.length, 1);
  h.manager.dispose();
});

for (const failingKind of ['offer', 'ice', 'answer']) {
  test(`${failingKind} signaling failure stops devices and closes the call`, async () => {
    const h = harness({ signal: async kind => { if (kind === failingKind) throw new Error('They’re offline.'); } });
    if (failingKind === 'answer') { await h.manager.receive(offer()); await h.manager.accept(true); }
    else await h.manager.start('friend', 'Friend', true);
    await flush();
    assert.equal(h.latest.call.status, 'ended');
    assert.match(h.latest.call.error, /offline/);
    assert.ok(h.streams[0].getTracks().every(t => t.stopped));
    assert.equal(h.pcs[0].closed, true);
    assert.equal(h.latest.remoteStream, null);
    await h.tick(45000);
    assert.equal(h.latest.call, null);
  });
}

test('late camera permission after hang-up cannot revive a call', async () => {
  const gate = deferred(), stream = new Stream([new Track('audio'), new Track('video')]);
  const h = harness({ media: () => gate.promise });
  const pending = h.manager.start('friend', 'Friend', true);
  h.manager.hangUp(); gate.resolve(stream); await pending;
  assert.ok(stream.getTracks().every(t => t.stopped));
  assert.equal(h.pcs.length, 0);
  assert.equal(h.latest.call.status, 'ended');
  assert.equal(h.signals.some(s => s.kind === 'offer'), false);
  h.manager.dispose();
});

test('late media from an old call cannot overwrite a new call', async () => {
  const gate = deferred(), oldStream = new Stream([new Track('audio')]);
  let count = 0;
  const h = harness({ media: () => ++count === 1 ? gate.promise : Promise.resolve(new Stream([new Track('audio')])) });
  const old = h.manager.start('friend', 'Old', false);
  h.manager.hangUp(); await h.manager.start('friend', 'New', false);
  const id = h.latest.call.callId;
  gate.resolve(oldStream); await old;
  assert.equal(h.latest.call.callId, id); assert.equal(h.latest.call.name, 'New');
  assert.ok(oldStream.getTracks().every(t => t.stopped));
  await h.tick(1500); assert.equal(h.latest.call.callId, id);
  h.manager.dispose();
});

test('double start and double accept acquire devices only once', async () => {
  const gate = deferred(); let acquired = 0;
  const h = harness({ media: () => { acquired++; return gate.promise; } });
  const first = h.manager.start('friend', 'Friend', false);
  await h.manager.start('friend', 'Friend', false);
  assert.equal(acquired, 1); h.manager.hangUp(); gate.resolve(new Stream()); await first;
  const incoming = harness(); await incoming.manager.receive(offer());
  await Promise.all([incoming.manager.accept(true), incoming.manager.accept(true)]);
  assert.equal(incoming.streams.length, 1); incoming.manager.dispose();
});

for (const incoming of [false, true]) {
  test(`${incoming ? 'incoming' : 'outgoing'} connecting call has a deadline`, async () => {
    const h = harness();
    if (incoming) { await h.manager.receive(offer()); await h.manager.accept(true); }
    else { await h.manager.start('friend', 'Friend', false); await h.manager.receive(answer(h)); }
    await h.tick(30000);
    assert.equal(h.latest.call.status, 'ended'); assert.match(h.latest.call.error, /connect/);
    assert.ok(h.streams[0].getTracks().every(t => t.stopped));
    assert.equal(h.pcs[0].closed, true);
  });
}

for (const failure of ['remoteError', 'iceError']) {
  test(`${failure} is caught and cleans up`, async () => {
    const h = harness({ pc: pc => { pc[failure] = new Error('Invalid remote negotiation'); } });
    await h.manager.start('friend', 'Friend', false);
    await h.manager.receive(ice(h.latest.call.callId));
    await h.manager.receive(answer(h));
    assert.equal(h.latest.call.status, 'ended'); assert.match(h.latest.call.error, /negotiation/);
    assert.equal(h.pcs[0].closed, true);
  });
}

test('a signal from a different peer cannot end the current call', async () => {
  const h = harness(); await h.manager.start('friend', 'Friend', false);
  await h.manager.receive({ from: 'other', callId: h.latest.call.callId, kind: 'bye' });
  assert.equal(h.latest.call.status, 'calling');
  h.manager.dispose();
});

test('disconnect recovers within the grace period or releases devices', async () => {
  const h = harness(); await h.manager.start('friend', 'Friend', false);
  h.pcs[0].state('connected'); h.pcs[0].state('disconnected');
  await h.tick(9000); h.pcs[0].state('connected'); await h.tick(2000);
  assert.equal(h.latest.call.status, 'active');
  h.pcs[0].state('disconnected'); await h.tick(10000);
  assert.equal(h.latest.call.status, 'ended'); assert.match(h.latest.call.error, /disconnected/);
});

test('dispose cancels timers and stops devices even during permission prompts', async () => {
  const gate = deferred(), stream = new Stream([new Track('audio')]);
  const h = harness({ media: () => gate.promise });
  const start = h.manager.start('friend', 'Friend', false);
  h.manager.dispose(); const updates = h.snapshots.length;
  gate.resolve(stream); await start; await h.tick(60000);
  assert.ok(stream.getTracks().every(t => t.stopped));
  assert.equal(h.snapshots.length, updates);
});

for (const [name, message] of [['NotAllowedError', /permission/], ['NotFoundError', /found/], ['NotReadableError', /busy/]]) {
  test(`${name} gives an actionable device error`, async () => {
    const h = harness({ media: async () => { throw Object.assign(new Error('browser error'), { name }); } });
    await h.manager.start('friend', 'Friend', true);
    assert.equal(h.latest.call.status, 'ended'); assert.match(h.latest.call.error, message);
    assert.equal(h.pcs.length, 0);
    h.manager.dispose();
  });
}

test('missing browser media access gives localhost/HTTPS guidance', async () => {
  const h = harness({ defaultMedia: true });
  await h.manager.start('friend', 'Friend', false);
  assert.match(h.latest.call.error, /localhost/);
  h.manager.dispose();
});

test('two managers negotiate a call, exchange candidates and hang up together', async () => {
  let left, right;
  left = harness({ signal: (kind, data, { callId }) => right.manager.receive({ from: 'left', name: 'Left', kind, data, callId }) });
  right = harness({ signal: (kind, data, { callId }) => left.manager.receive({ from: 'right', name: 'Right', kind, data, callId }) });
  await left.manager.start('right', 'Right', true);
  assert.equal(right.latest.call.status, 'ringing');
  await right.manager.accept(true); await flush();
  assert.equal(left.latest.call.status, 'connecting');
  assert.equal(left.pcs[0].addedIce.length, 1); assert.equal(right.pcs[0].addedIce.length, 1);
  left.pcs[0].state('connected'); right.pcs[0].state('connected');
  left.manager.hangUp(); await flush();
  assert.equal(right.latest.call.status, 'ended');
  assert.ok(right.streams[0].getTracks().every(t => t.stopped));
  left.manager.dispose(); right.manager.dispose();
});

test('an answer arriving before the offer response does not re-arm a connected call timeout', async () => {
  const gate = deferred();
  let h;
  h = harness({ signal: async kind => {
    if (kind !== 'offer') return;
    await h.manager.receive(answer(h)); h.pcs[0].state('connected'); await gate.promise;
  } });
  const starting = h.manager.start('friend', 'Friend', false); await flush();
  assert.equal(h.latest.call.status, 'active');
  gate.resolve(); await starting; await h.tick(60000);
  assert.equal(h.latest.call.status, 'active'); h.manager.dispose();
});

test('busy-call rejection failure cannot end a different active call', async () => {
  const h = harness({ signal: async kind => { if (kind === 'reject') throw new Error('Other peer offline'); } });
  await h.manager.start('friend', 'Friend', false); h.pcs[0].state('connected');
  await h.manager.receive(offer('other-call', 'other-peer'));
  assert.equal(h.latest.call.status, 'active'); assert.equal(h.latest.call.peer, 'friend');
  h.manager.dispose();
});

test('stale peer-connection events cannot modify the next call', async () => {
  const h = harness(); await h.manager.start('friend', 'First', false);
  const oldHandler = h.pcs[0].onconnectionstatechange;
  h.manager.hangUp(); await h.manager.start('friend', 'Second', false);
  h.pcs[0].connectionState = 'failed'; oldHandler();
  assert.equal(h.latest.call.name, 'Second'); assert.equal(h.latest.call.status, 'calling');
  h.manager.dispose();
});

test('unanswered outgoing and incoming calls stop waiting after 45 seconds', async () => {
  const outgoing = harness(); await outgoing.manager.start('friend', 'Friend', false);
  await outgoing.tick(45000); assert.match(outgoing.latest.call.error, /No answer/);
  const incoming = harness(); await incoming.manager.receive(offer());
  await incoming.tick(45000); assert.match(incoming.latest.call.error, /Missed call/);
});
