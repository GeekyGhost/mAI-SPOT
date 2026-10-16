/** Browser call lifecycle, kept separate from React so async work owns a specific session. */
export interface CallState {
  callId: string;
  peer: string;
  name: string;
  direction: 'in' | 'out';
  status: 'ringing' | 'calling' | 'connecting' | 'active' | 'ended';
  video: boolean;
  error?: string;
  micOn: boolean;
  camOn: boolean;
}

export interface CallSignal {
  from: string;
  name: string;
  callId: string;
  kind: string;
  data?: { sdp?: RTCSessionDescriptionInit; video?: boolean } & RTCIceCandidateInit;
}

export interface CallSnapshot {
  call: CallState | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

interface Dependencies {
  signal: (to: string, callId: string, kind: string, data?: unknown) => Promise<unknown>;
  change: (snapshot: CallSnapshot) => void;
  ring: () => void;
  media?: (video: boolean) => Promise<MediaStream>;
  peerConnection?: () => RTCPeerConnection;
  stream?: (tracks?: MediaStreamTrack[]) => MediaStream;
}

interface Session {
  call: CallState;
  pc: RTCPeerConnection | null;
  local: MediaStream | null;
  remote: MediaStream | null;
  offer?: RTCSessionDescriptionInit;
  ice: RTCIceCandidateInit[];
  localIce: RTCIceCandidateInit[];
  descriptionSent: boolean;
  outgoing: Promise<unknown>;
  incoming: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  ring?: ReturnType<typeof setInterval>;
}

const CONNECT_ERROR = 'Couldn’t connect the call. Check both networks and try again.';

function mediaError(error: unknown): string {
  switch ((error as Error)?.name) {
    case 'NotAllowedError': case 'SecurityError': return 'Camera/microphone permission was blocked. Allow access in your browser and try again.';
    case 'NotFoundError': return 'No microphone or requested camera was found. Connect the device or try a voice call.';
    case 'NotReadableError': return 'Your microphone or camera is busy or unavailable. Close other apps using it and try again.';
    case 'OverconstrainedError': return 'Your camera does not support the requested settings. Try a voice call.';
    default: return (error as Error)?.message || 'The call failed. Please try again.';
  }
}

async function getMedia(video: boolean) {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Calls need camera/microphone access. Open your own Spot at http://localhost:8088 (or your configured port), or use HTTPS.');
  }
  return navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
}

export class CallManager {
  private session: Session | null = null;
  private snapshot: CallSnapshot = { call: null, localStream: null, remoteStream: null };
  private dismiss?: ReturnType<typeof setTimeout>;
  private earlyIce = new Map<string, { at: number; candidates: RTCIceCandidateInit[] }>();

  constructor(private deps: Dependencies) {}

  private current(s: Session) { return this.session === s; }

  private publish(s: Session) {
    if (!this.current(s)) return;
    this.snapshot = { call: { ...s.call }, localStream: s.local, remoteStream: s.remote };
    this.deps.change(this.snapshot);
  }

  private begin(call: CallState, offer?: RTCSessionDescriptionInit) {
    clearTimeout(this.dismiss);
    const earlyKey = `${call.peer}:${call.callId}`;
    const early = this.earlyIce.get(earlyKey);
    this.earlyIce.clear();
    const s: Session = { call, pc: null, local: null, remote: null, offer,
      ice: early && Date.now() - early.at < 30000 ? early.candidates : [], localIce: [],
      descriptionSent: false, outgoing: Promise.resolve(), incoming: Promise.resolve() };
    this.session = s;
    this.publish(s);
    return s;
  }

  private deadline(s: Session, error: string, ms = 30000) {
    clearTimeout(s.timer);
    s.timer = setTimeout(() => this.finish(s, error, 'bye'), ms);
  }

  // Serialize HTTP requests, including hang-up, so ICE and cancellation cannot overtake SDP.
  private send(s: Session, kind: string, data?: unknown) {
    const next = s.outgoing.then(() => {
      if (!this.current(s) && kind !== 'bye' && kind !== 'reject') return;
      return this.deps.signal(s.call.peer, s.call.callId, kind, data);
    });
    s.outgoing = next.catch(() => {});
    return next;
  }

  private finish(s: Session, error?: string, notify?: 'bye' | 'reject') {
    if (!this.current(s)) return;
    this.session = null;
    clearTimeout(s.timer);
    clearInterval(s.ring);
    if (s.pc) {
      s.pc.onicecandidate = null;
      s.pc.ontrack = null;
      s.pc.onconnectionstatechange = null;
      s.pc.close();
    }
    s.local?.getTracks().forEach(t => t.stop());
    s.remote?.getTracks().forEach(t => t.stop());
    s.ice = []; s.localIce = [];
    if (notify) void this.send(s, notify).catch(() => {});
    const ended: CallSnapshot = { call: { ...s.call, status: 'ended', error }, localStream: null, remoteStream: null };
    this.snapshot = ended;
    this.deps.change(ended);
    this.dismiss = setTimeout(() => {
      if (this.snapshot !== ended) return;
      this.snapshot = { call: null, localStream: null, remoteStream: null };
      this.deps.change(this.snapshot);
    }, error ? 10000 : 1500);
  }

  private fail(s: Session, error: unknown) { this.finish(s, mediaError(error), 'bye'); }

  private ring() {
    // A browser's sound policy must never interrupt call setup.
    try { this.deps.ring(); } catch {}
  }

  private async acquire(s: Session) {
    const stream = await (this.deps.media || getMedia)(s.call.video);
    if (!this.current(s)) {
      stream.getTracks().forEach(t => t.stop());
      return null;
    }
    s.local = stream;
    this.publish(s);
    return stream;
  }

  private makePC(s: Session) {
    if (!this.deps.peerConnection && typeof RTCPeerConnection === 'undefined') throw new Error('This browser does not support voice/video calls. Try a browser with WebRTC support.');
    const pc = this.deps.peerConnection ? this.deps.peerConnection() : new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
    });
    s.pc = pc;
    s.remote = this.deps.stream ? this.deps.stream() : new MediaStream();
    pc.onicecandidate = e => {
      if (!this.current(s) || !e.candidate) return;
      const candidate = e.candidate.toJSON();
      if (!s.descriptionSent) s.localIce.push(candidate);
      else void this.send(s, 'ice', candidate).catch(error => this.fail(s, error));
    };
    pc.ontrack = e => {
      if (!this.current(s)) return;
      if (!s.remote!.getTracks().some(t => t.id === e.track.id)) s.remote!.addTrack(e.track);
      // New identity makes React update the media element after each arriving track.
      s.remote = this.deps.stream ? this.deps.stream(s.remote!.getTracks()) : new MediaStream(s.remote!.getTracks());
      this.publish(s);
    };
    pc.onconnectionstatechange = () => {
      if (!this.current(s)) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(s.timer);
        s.call.status = 'active';
        this.publish(s);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.finish(s, CONNECT_ERROR, 'bye');
      } else if (pc.connectionState === 'disconnected' && s.call.status === 'active') {
        s.call.status = 'connecting';
        this.deadline(s, 'The call disconnected. Check both networks and try again.', 10000);
        this.publish(s);
      }
    };
    this.publish(s);
    return pc;
  }

  private async description(s: Session, kind: 'offer' | 'answer', sdp: RTCSessionDescriptionInit) {
    await this.send(s, kind, { sdp, video: s.call.video });
    if (!this.current(s)) return;
    s.descriptionSent = true;
    for (const ice of s.localIce.splice(0)) void this.send(s, 'ice', ice).catch(error => this.fail(s, error));
  }

  async start(peer: string, name: string, video: boolean) {
    if (this.session) return;
    const callId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const s = this.begin({ callId, peer, name, direction: 'out', status: 'calling', video, micOn: true, camOn: video });
    this.deadline(s, 'Call setup timed out. Check microphone/camera permission and try again.', 45000);
    try {
      const stream = await this.acquire(s);
      if (!stream) return;
      const pc = this.makePC(s);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      if (!this.current(s)) return;
      await pc.setLocalDescription(offer);
      if (!this.current(s)) return;
      // Arm before sending: an answer can arrive before the HTTP response.
      this.deadline(s, 'No answer.', 45000);
      await this.description(s, 'offer', pc.localDescription || offer);
    } catch (error) { this.fail(s, error); }
  }

  async accept(video: boolean) {
    const s = this.session;
    if (!s || s.call.status !== 'ringing' || !s.offer) return;
    clearInterval(s.ring);
    s.call = { ...s.call, status: 'connecting', video, camOn: video };
    this.deadline(s, CONNECT_ERROR);
    this.publish(s);
    try {
      const stream = await this.acquire(s);
      if (!stream) return;
      const pc = this.makePC(s);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      // Join the incoming signal queue so candidates cannot race setRemoteDescription.
      s.incoming = s.incoming.then(async () => {
        if (!this.current(s)) return;
        await pc.setRemoteDescription(s.offer!);
        if (!this.current(s)) return;
        for (const ice of s.ice.splice(0)) await pc.addIceCandidate(ice);
      });
      await s.incoming;
      if (!this.current(s)) return;
      const answer = await pc.createAnswer();
      if (!this.current(s)) return;
      await pc.setLocalDescription(answer);
      if (this.current(s)) await this.description(s, 'answer', pc.localDescription || answer);
    } catch (error) { this.fail(s, error); }
  }

  async receive(ev: CallSignal) {
    if (!ev.from || !ev.callId || ev.callId.length > 64) return;
    if (ev.kind === 'offer') {
      if (!ev.data?.sdp || ev.data.sdp.type !== 'offer') return;
      if (this.session) {
        if (this.session.call.callId !== ev.callId || this.session.call.peer !== ev.from) {
          await this.deps.signal(ev.from, ev.callId, 'reject').catch(() => {});
        }
        return;
      }
      const s = this.begin({ callId: ev.callId, peer: ev.from, name: ev.name, direction: 'in', status: 'ringing', video: !!ev.data.video, micOn: true, camOn: !!ev.data.video }, ev.data.sdp);
      this.ring();
      s.ring = setInterval(() => this.ring(), 2500);
      this.deadline(s, 'Missed call.', 45000);
      return;
    }
    const s = this.session;
    if (!s || s.call.callId !== ev.callId || s.call.peer !== ev.from) {
      if (!s && ev.kind === 'ice' && ev.data) {
        const now = Date.now();
        for (const [key, entry] of this.earlyIce) if (now - entry.at >= 30000) this.earlyIce.delete(key);
        const key = `${ev.from}:${ev.callId}`;
        if (!this.earlyIce.has(key) && this.earlyIce.size < 16) this.earlyIce.set(key, { at: now, candidates: [] });
        const entry = this.earlyIce.get(key);
        if (entry && entry.candidates.length < 128) entry.candidates.push(ev.data);
      }
      return;
    }
    if (ev.kind === 'bye' || ev.kind === 'reject') {
      this.finish(s, ev.kind === 'reject' ? 'They’re busy or declined.' : s.call.status === 'ringing' ? 'Missed call.' : undefined);
      return;
    }
    s.incoming = s.incoming.then(async () => {
      if (!this.current(s)) return;
      if (ev.kind === 'answer' && s.pc && s.call.direction === 'out' && !s.pc.remoteDescription) {
        s.call.status = 'connecting';
        this.deadline(s, CONNECT_ERROR);
        this.publish(s);
        await s.pc.setRemoteDescription(ev.data?.sdp!);
        if (!this.current(s)) return;
        for (const ice of s.ice.splice(0)) await s.pc.addIceCandidate(ice);
      } else if (ev.kind === 'ice' && ev.data) {
        if (s.pc?.remoteDescription) await s.pc.addIceCandidate(ev.data);
        else if (s.ice.length < 128) s.ice.push(ev.data);
      }
    }).catch(error => this.fail(s, error));
    await s.incoming;
  }

  hangUp() { if (this.session) this.finish(this.session, undefined, 'bye'); }
  decline() { if (this.session) this.finish(this.session, undefined, 'reject'); }
  toggle(kind: 'audio' | 'video') {
    const s = this.session;
    const track = kind === 'audio' ? s?.local?.getAudioTracks()[0] : s?.local?.getVideoTracks()[0];
    if (!s || !track) return;
    track.enabled = !track.enabled;
    if (kind === 'audio') s.call.micOn = track.enabled;
    else s.call.camOn = track.enabled;
    this.publish(s);
  }

  dispose() {
    this.hangUp();
    clearTimeout(this.dismiss);
    this.earlyIce.clear();
  }
}
