// Framing + RPC + binary streams over one encrypted Hyperswarm connection.
//
// Frame:  [u32 length][u8 type][payload]
//   type 1  JSON   {t:'req',id,m,p} | {t:'res',id,ok,r|e,sid?} | {t:'evt',e,p} | {t:'flow',sid,pause} | {t:'cancel',sid}
//   type 2  DATA   [u32 sid][bytes]
//   type 3  END    [u32 sid]
//
// Streams carry files (songs, videos, covers) with backpressure in both directions,
// and can be cancelled (e.g. when you seek in a video and the browser drops the old request).

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const T_JSON = 1;
const T_DATA = 2;
const T_END = 3;
const MAX_FRAME = 8 * 1024 * 1024;
const CHUNK = 64 * 1024;

export class Peer extends EventEmitter {
  constructor(conn, key) {
    super();
    this.conn = conn;
    this.key = key; // hex public key of the other side
    this.buf = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map(); // id -> {resolve, reject, timer}
    this.sinks = new Map(); // sid -> PassThrough (incoming streams)
    this.sources = new Map(); // sid -> {readable, flowPaused, sockPaused}
    this.nextSid = 1;
    this.closed = false;
    this.handler = null; // async (method, params, peer) => result | {stream, meta}
    this.hello = null;

    conn.on('data', d => this.onData(d));
    conn.on('drain', () => this.onDrain());
    conn.on('error', () => {});
    conn.on('close', () => this.onClose());
  }

  // ── sending ──
  writeFrame(type, payload) {
    if (this.closed) return false;
    const head = Buffer.alloc(5);
    head.writeUInt32BE(payload.length + 1, 0);
    head.writeUInt8(type, 4);
    return this.conn.write(Buffer.concat([head, payload]));
  }

  send(obj) {
    return this.writeFrame(T_JSON, Buffer.from(JSON.stringify(obj)));
  }

  event(name, payload) {
    this.send({ t: 'evt', e: name, p: payload });
  }

  request(method, params, { timeout = 20000, stream = false } = {}) {
    if (this.closed) return Promise.reject(new Error('Peer is offline'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Peer did not answer in time'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, stream });
      this.send({ t: 'req', id, m: method, p: params });
    });
  }

  // ── receiving ──
  onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.buf.length >= 5) {
      const len = this.buf.readUInt32BE(0);
      if (len < 1 || len > MAX_FRAME) {
        this.destroy('bad frame');
        return;
      }
      if (this.buf.length < 4 + len) break;
      const type = this.buf.readUInt8(4);
      const payload = this.buf.subarray(5, 4 + len);
      this.buf = this.buf.subarray(4 + len);
      try {
        this.onFrame(type, payload);
      } catch (e) {
        this.emit('warn', e);
      }
    }
  }

  onFrame(type, payload) {
    if (type === T_DATA) {
      const sid = payload.readUInt32BE(0);
      const sink = this.sinks.get(sid);
      if (!sink) return;
      // Copy: the underlying buffer is reused as more data arrives.
      if (!sink.write(Buffer.from(payload.subarray(4))) && !sink._maispotPaused) {
        sink._maispotPaused = true;
        this.send({ t: 'flow', sid, pause: true });
      }
      return;
    }
    if (type === T_END) {
      const sid = payload.readUInt32BE(0);
      const sink = this.sinks.get(sid);
      if (sink) {
        this.sinks.delete(sid);
        sink.end();
      }
      return;
    }
    if (type !== T_JSON) return;
    const msg = JSON.parse(payload.toString('utf8'));
    switch (msg.t) {
      case 'req':
        this.handleRequest(msg);
        break;
      case 'res': {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (!msg.ok) return p.reject(new Error(msg.e || 'Request failed'));
        if (msg.sid) {
          // Register the sink synchronously: data frames may already be next in the buffer.
          const sink = new PassThrough({ highWaterMark: 512 * 1024 });
          const sid = msg.sid;
          this.sinks.set(sid, sink);
          sink.on('drain', () => {
            if (sink._maispotPaused) {
              sink._maispotPaused = false;
              this.send({ t: 'flow', sid, pause: false });
            }
          });
          sink.on('close', () => {
            if (this.sinks.has(sid)) {
              this.sinks.delete(sid);
              this.send({ t: 'cancel', sid });
            }
          });
          p.resolve({ meta: msg.r, stream: sink });
        } else {
          p.resolve(msg.r);
        }
        break;
      }
      case 'evt':
        this.emit('event', msg.e, msg.p);
        break;
      case 'flow': {
        const s = this.sources.get(msg.sid);
        if (!s) return;
        s.flowPaused = !!msg.pause;
        this.updateSource(s);
        break;
      }
      case 'cancel': {
        const s = this.sources.get(msg.sid);
        if (s) {
          this.sources.delete(msg.sid);
          s.readable.destroy();
        }
        break;
      }
    }
  }

  async handleRequest(msg) {
    try {
      if (!this.handler) throw new Error('Not ready');
      const result = await this.handler(msg.m, msg.p || {}, this);
      if (result && result.__stream) {
        const sid = this.nextSid++;
        this.send({ t: 'res', id: msg.id, ok: true, r: result.meta, sid });
        this.pump(sid, result.__stream);
      } else {
        this.send({ t: 'res', id: msg.id, ok: true, r: result ?? null });
      }
    } catch (e) {
      this.send({ t: 'res', id: msg.id, ok: false, e: e?.message || String(e) });
    }
  }

  pump(sid, readable) {
    const s = { readable, flowPaused: false, sockPaused: false };
    this.sources.set(sid, s);
    const sidBuf = Buffer.alloc(4);
    sidBuf.writeUInt32BE(sid, 0);
    readable.on('data', chunk => {
      for (let off = 0; off < chunk.length; off += CHUNK) {
        const part = chunk.subarray(off, off + CHUNK);
        if (!this.writeFrame(T_DATA, Buffer.concat([sidBuf, part]))) s.sockPaused = true;
      }
      this.updateSource(s);
    });
    const finish = () => {
      if (!this.sources.has(sid)) return;
      this.sources.delete(sid);
      this.writeFrame(T_END, sidBuf);
    };
    readable.on('end', finish);
    readable.on('error', finish);
  }

  updateSource(s) {
    if (s.flowPaused || s.sockPaused) s.readable.pause();
    else s.readable.resume();
  }

  onDrain() {
    for (const s of this.sources.values()) {
      s.sockPaused = false;
      this.updateSource(s);
    }
  }

  onClose() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Peer disconnected'));
    }
    this.pending.clear();
    for (const sink of this.sinks.values()) sink.destroy(new Error('Peer disconnected'));
    this.sinks.clear();
    for (const s of this.sources.values()) s.readable.destroy();
    this.sources.clear();
    this.emit('close');
  }

  destroy(reason) {
    try {
      this.conn.destroy(reason ? new Error(reason) : undefined);
    } catch {}
    this.onClose();
  }
}
