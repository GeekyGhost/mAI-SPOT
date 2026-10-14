'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { P2PState, FeedPost } from '@/lib/p2pTypes';
import { api } from '@/lib/client';
import { soundFX } from '@/components/sound/SoundFX';
import { useAudio } from '@/components/audio/AudioEngine';
import { SocialDialogs, type SocialDialog } from './SocialDialogs';

/**
 * Live connection to this node's peer-to-peer layer: state (friends, requests, groups), the feed,
 * a server-sent event stream for real-time updates, toasts, and the WebRTC call manager.
 */

export type PagerView = { type: 'dm'; key: string } | { type: 'group'; id: string } | null;

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

interface Toast {
  id: number;
  title: string;
  body?: string;
  onClick?: () => void;
  actions?: { label: string; onClick: () => void; primary?: boolean }[];
  sticky?: boolean;
}

interface P2PCtx {
  state: P2PState | null;
  feed: FeedPost[];
  refresh: () => void;
  refreshFeed: () => void;
  /** bumps whenever any event arrives, so open chats can re-fetch */
  tick: number;
  lastEvent: { type: string; [k: string]: unknown } | null;
  pager: { open: boolean; view: PagerView };
  setPager: (p: { open: boolean; view: PagerView }) => void;
  openChat: (key: string) => void;
  visit: string | null;
  setVisit: (key: string | null) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dialog: SocialDialog;
  setDialog: (d: SocialDialog) => void;
  /** Which watch party is open full-screen (null = none, or minimised). */
  partyOpen: string | null;
  setPartyOpen: (id: string | null) => void;
  joinParty: (id: string) => Promise<void>;
  /** Listen along with a friend (null = stop). */
  listenAlong: (key: string | null) => void;
  alongWith: string | null;
  call: CallState | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (key: string, video: boolean) => void;
  acceptCall: (video: boolean) => void;
  declineCall: () => void;
  hangUp: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
}

const Ctx = createContext<P2PCtx | null>(null);
export const useP2P = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useP2P outside provider');
  return c;
};

// Public STUN server: only used by the two browsers to learn their own public address for a call.
// No audio or video goes through it.
const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export function P2PProvider({ children, onProfileChanged }: { children: React.ReactNode; onProfileChanged?: () => void }) {
  const [state, setState] = useState<P2PState | null>(null);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [tick, setTick] = useState(0);
  const [lastEvent, setLastEvent] = useState<P2PCtx['lastEvent']>(null);
  const [pager, setPager] = useState<{ open: boolean; view: PagerView }>({ open: false, view: null });
  const [visit, setVisit] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<SocialDialog>(null);
  const [partyOpen, setPartyOpen] = useState<string | null>(null);
  const audio = useAudio();
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const alongMatch = audio.mode === 'live' ? /\/api\/p2p\/peer\/([0-9a-f]{64})\/along$/.exec(audio.liveUrl) : null;
  const alongWith = alongMatch ? alongMatch[1] : null;
  const alongRef = useRef(alongWith);
  alongRef.current = alongWith;
  const pagerRef = useRef(pager);
  pagerRef.current = pager;
  const profileCb = useRef(onProfileChanged);
  profileCb.current = onProfileChanged;

  const refresh = useCallback(() => {
    api<P2PState & { success: boolean }>('/api/p2p/state').then(setState).catch(() => {});
  }, []);
  const refreshFeed = useCallback(() => {
    api('/api/p2p/feed').then(d => setFeed(d.posts)).catch(() => {});
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts(list => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), t.sticky ? 30000 : t.actions ? 12000 : 6000);
  }, []);

  const joinParty = useCallback(async (id: string) => {
    try {
      await api('/api/p2p/party', { method: 'POST', json: { action: 'join', id } });
      setPartyOpen(id);
      api<P2PState & { success: boolean }>('/api/p2p/state').then(setState).catch(() => {});
    } catch (e) {
      toast({ title: 'Couldn’t join', body: (e as Error).message });
    }
  }, [toast]);

  const listenAlong = useCallback((key: string | null) => {
    const a = audioRef.current;
    if (!key) {
      a.leaveLive();
      return;
    }
    a.tuneInLive(`/api/p2p/peer/${key}/along`).then(okLive => {
      if (!okLive) toast({ title: 'Nothing to listen to', body: 'They’re not playing anything right now.' });
    });
  }, [toast]);

  const openChat = useCallback((key: string) => setPager({ open: true, view: { type: 'dm', key } }), []);

  // ───────── calls ─────────
  const [call, setCall] = useState<CallState | null>(null);
  const callRef = useRef<CallState | null>(null);
  callRef.current = call;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const ringTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const signal = useCallback((to: string, callId: string, kind: string, data?: unknown) => {
    return api('/api/p2p/call', { method: 'POST', json: { to, callId, kind, data } }).catch(e => {
      setCall(c => (c && c.callId === callId ? { ...c, status: 'ended', error: (e as Error).message } : c));
    });
  }, []);

  const cleanup = useCallback((error?: string) => {
    clearInterval(ringTimer.current);
    clearTimeout(timeoutTimer.current);
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach(t => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    pendingOffer.current = null;
    pendingIce.current = [];
    setCall(c => (c ? { ...c, status: 'ended', error } : c));
    setTimeout(() => setCall(c => (c?.status === 'ended' ? null : c)), error ? 5000 : 1500);
  }, []);

  const makePC = useCallback(
    (peer: string, callId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.onicecandidate = e => {
        if (e.candidate) signal(peer, callId, 'ice', e.candidate.toJSON());
      };
      const remote = new MediaStream();
      setRemoteStream(remote);
      pc.ontrack = e => {
        e.streams[0]?.getTracks().forEach(t => remote.addTrack(t));
        if (!e.streams[0]) remote.addTrack(e.track);
        setRemoteStream(new MediaStream(remote.getTracks()));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          clearTimeout(timeoutTimer.current);
          setCall(c => (c ? { ...c, status: 'active' } : c));
        } else if (pc.connectionState === 'failed') {
          signal(peer, callId, 'bye');
          cleanup('Couldn’t connect the call. One of your networks blocks direct calls.');
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [signal, cleanup]
  );

  const getMedia = async (video: boolean) => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: 1280, height: 720 } : false });
    localRef.current = s;
    setLocalStream(s);
    return s;
  };

  const startCall = useCallback(
    async (key: string, video: boolean) => {
      if (callRef.current && callRef.current.status !== 'ended') return;
      const friend = state?.friends.find(f => f.key === key);
      const callId = Math.random().toString(36).slice(2, 12);
      setCall({ callId, peer: key, name: friend?.name || 'Friend', direction: 'out', status: 'calling', video, micOn: true, camOn: video });
      try {
        const stream = await getMedia(video);
        const pc = makePC(key, callId);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await signal(key, callId, 'offer', { sdp: offer, video });
        timeoutTimer.current = setTimeout(() => {
          if (callRef.current?.status === 'calling') {
            signal(key, callId, 'bye');
            cleanup('No answer.');
          }
        }, 45000);
      } catch (e) {
        cleanup((e as Error).name === 'NotAllowedError' ? 'Camera/microphone permission was blocked.' : (e as Error).message);
      }
    },
    [state, makePC, signal, cleanup]
  );

  const acceptCall = useCallback(
    async (video: boolean) => {
      const c = callRef.current;
      if (!c || !pendingOffer.current) return;
      clearInterval(ringTimer.current);
      setCall({ ...c, status: 'connecting', video, camOn: video });
      try {
        const stream = await getMedia(video);
        const pc = makePC(c.peer, c.callId);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        await pc.setRemoteDescription(pendingOffer.current);
        for (const ice of pendingIce.current) await pc.addIceCandidate(ice).catch(() => {});
        pendingIce.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await signal(c.peer, c.callId, 'answer', { sdp: answer });
      } catch (e) {
        signal(c.peer, c.callId, 'bye');
        cleanup((e as Error).name === 'NotAllowedError' ? 'Camera/microphone permission was blocked.' : (e as Error).message);
      }
    },
    [makePC, signal, cleanup]
  );

  const declineCall = useCallback(() => {
    const c = callRef.current;
    if (c) signal(c.peer, c.callId, 'reject');
    cleanup();
  }, [signal, cleanup]);

  const hangUp = useCallback(() => {
    const c = callRef.current;
    if (c) signal(c.peer, c.callId, 'bye');
    cleanup();
  }, [signal, cleanup]);

  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setCall(c => (c ? { ...c, micOn: t.enabled } : c));
    }
  }, []);
  const toggleCam = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setCall(c => (c ? { ...c, camOn: t.enabled } : c));
    }
  }, []);

  const onCallSignal = useCallback(
    async (ev: { from: string; name: string; callId: string; kind: string; data: any }) => {
      const c = callRef.current;
      if (ev.kind === 'offer') {
        if (c && c.status !== 'ended') {
          signal(ev.from, ev.callId, 'reject'); // busy
          return;
        }
        pendingOffer.current = ev.data?.sdp;
        pendingIce.current = [];
        setCall({ callId: ev.callId, peer: ev.from, name: ev.name, direction: 'in', status: 'ringing', video: !!ev.data?.video, micOn: true, camOn: !!ev.data?.video });
        soundFX.playCallRing();
        ringTimer.current = setInterval(() => soundFX.playCallRing(), 2500);
        timeoutTimer.current = setTimeout(() => {
          if (callRef.current?.status === 'ringing') cleanup('Missed call.');
        }, 45000);
        return;
      }
      if (!c || c.callId !== ev.callId) return;
      if (ev.kind === 'answer' && pcRef.current) {
        setCall({ ...c, status: 'connecting' });
        await pcRef.current.setRemoteDescription(ev.data?.sdp);
        for (const ice of pendingIce.current) await pcRef.current.addIceCandidate(ice).catch(() => {});
        pendingIce.current = [];
      } else if (ev.kind === 'ice') {
        if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(ev.data).catch(() => {});
        else pendingIce.current.push(ev.data);
      } else if (ev.kind === 'reject') {
        cleanup(c.direction === 'out' ? 'They’re busy or declined.' : undefined);
      } else if (ev.kind === 'bye') {
        cleanup(c.status === 'ringing' ? 'Missed call.' : undefined);
      }
    },
    [signal, cleanup]
  );

  // ───────── event stream ─────────
  useEffect(() => {
    refresh();
    refreshFeed();
    let feedTimer: ReturnType<typeof setTimeout> | undefined;
    let stateTimer: ReturnType<typeof setTimeout> | undefined;
    const soonState = () => {
      clearTimeout(stateTimer);
      stateTimer = setTimeout(refresh, 150);
    };
    const es = new EventSource('/api/p2p/events');
    es.onmessage = m => {
      let ev: any;
      try {
        ev = JSON.parse(m.data);
      } catch {
        return;
      }
      setTick(t => t + 1);
      setLastEvent(ev);
      switch (ev.type) {
        case 'call':
          onCallSignal(ev);
          break;
        case 'feed':
          clearTimeout(feedTimer);
          feedTimer = setTimeout(refreshFeed, 200);
          break;
        case 'dm': {
          soonState();
          const viewing = pagerRef.current.open && pagerRef.current.view?.type === 'dm' && pagerRef.current.view.key === ev.peer;
          if (!viewing) {
            soundFX.playUhOh();
            toast({ title: ev.name || 'New message', body: ev.message?.text, onClick: () => setPager({ open: true, view: { type: 'dm', key: ev.peer } }) });
          }
          break;
        }
        case 'group':
          soonState();
          if (ev.message) {
            const viewing = pagerRef.current.open && pagerRef.current.view?.type === 'group' && pagerRef.current.view.id === ev.id;
            if (!viewing) {
              soundFX.playMessageSent();
              toast({ title: ev.name || 'Group chat', body: 'New message', onClick: () => setPager({ open: true, view: { type: 'group', id: ev.id } }) });
            }
          }
          if (ev.joined) toast({ title: 'Added to a group chat', onClick: () => setPager({ open: true, view: { type: 'group', id: ev.id } }) });
          break;
        case 'request':
          soonState();
          soundFX.playUhOh();
          toast({
            title: 'Friend request',
            body: `${ev.name || 'Someone'} wants to connect${ev.invite ? ` (used your invite “${ev.invite}”)` : ''}.`,
            actions: [{ label: 'Review', primary: true, onClick: () => setDialog({ type: 'review', key: ev.key }) }]
          });
          break;
        case 'friend_added':
          soonState();
          soundFX.playPeerOnline();
          toast({
            title: 'New friend',
            body: `You and ${ev.name} are now connected.`,
            actions: ev.review ? [{ label: 'Choose what they see', primary: true, onClick: () => setDialog({ type: 'access', key: ev.key, welcome: true }) }] : undefined
          });
          break;
        case 'access':
          soonState();
          toast({ title: `${ev.name} updated what you can see`, body: 'Open their Spot to look.', onClick: () => setVisit(ev.key) });
          break;
        case 'access_expired':
          soonState();
          break;
        case 'invite_refused':
          toast({ title: 'Request turned away', body: `${ev.name || 'Someone'} tried to connect ${ev.reason === 'used' ? 'with an invite that was already used or expired' : 'without an invite'}.` });
          break;
        case 'now_playing':
          soonState();
          if (alongRef.current === ev.key) audioRef.current.resyncLive();
          break;
        case 'party_invite':
          soonState();
          soundFX.playUhOh();
          toast({
            title: `${ev.name} invited you to a watch party`,
            body: ev.title,
            sticky: true,
            actions: [{ label: 'Join', primary: true, onClick: () => joinParty(ev.id) }, { label: 'Not now', onClick: () => api('/api/p2p/party', { method: 'POST', json: { action: 'decline', id: ev.id } }).then(refresh) }]
          });
          break;
        case 'party':
          soonState();
          break;
        case 'party_end':
          soonState();
          toast({ title: 'Watch party ended', body: ev.reason === 'offline' ? `The host went offline: ${ev.title}` : ev.title });
          break;
        case 'me':
          soonState();
          profileCb.current?.();
          break;
        default:
          soonState();
      }
    };
    return () => {
      es.close();
      clearTimeout(feedTimer);
      clearTimeout(stateTimer);
    };
  }, [refresh, refreshFeed, toast, onCallSignal, joinParty]);

  // Chime when a friend comes online (not for everyone already online at page load).
  const prevOnline = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!state) return;
    const now = new Set(state.friends.filter(f => f.online).map(f => f.key));
    if (prevOnline.current && [...now].some(k => !prevOnline.current!.has(k))) soundFX.playPeerOnline();
    prevOnline.current = now;
  }, [state]);

  const value = useMemo(
    () => ({
      state, feed, refresh, refreshFeed, tick, lastEvent, pager, setPager, openChat, visit, setVisit, toast, dialog, setDialog,
      partyOpen, setPartyOpen, joinParty, listenAlong, alongWith,
      call, localStream, remoteStream, startCall, acceptCall, declineCall, hangUp, toggleMic, toggleCam
    }),
    [state, feed, refresh, refreshFeed, tick, lastEvent, pager, openChat, visit, toast, dialog, partyOpen, joinParty, listenAlong, alongWith, call, localStream, remoteStream, startCall, acceptCall, declineCall, hangUp, toggleMic, toggleCam]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <SocialDialogs />
      <div className="fixed top-20 right-4 z-[80] space-y-2 w-80 max-w-[calc(100vw-2rem)]" aria-live="polite">
        {toasts.map(t => {
          const dismiss = () => setToasts(list => list.filter(x => x.id !== t.id));
          return (
            <div key={t.id} className="w-full bg-[#0b1216]/95 border border-accent/40 rounded-xl px-4 py-3 shadow-2xl backdrop-blur animate-fadeIn">
              <button
                onClick={() => {
                  t.onClick?.();
                  dismiss();
                }}
                className="w-full text-left"
              >
                <div className="text-sm font-bold text-white">{t.title}</div>
                {t.body && <div className="text-xs text-zinc-400 line-clamp-2 mt-0.5">{t.body}</div>}
              </button>
              {t.actions && (
                <div className="flex gap-2 mt-2">
                  {t.actions.map(a => (
                    <button
                      key={a.label}
                      onClick={() => {
                        a.onClick();
                        dismiss();
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${a.primary ? 'bg-[var(--spot-accent)] text-black' : 'bg-white/10 text-zinc-200 hover:bg-white/20'}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
