'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { P2PState, FeedPost } from '@/lib/p2pTypes';
import { api } from '@/lib/client';
import { CallManager, type CallSnapshot, type CallState } from '@/lib/calls';
export type { CallState } from '@/lib/calls';
import { soundFX } from '@/components/sound/SoundFX';
import { useAudio } from '@/components/audio/AudioEngine';
import { SocialDialogs, type SocialDialog } from './SocialDialogs';

/**
 * Live connection to this node's peer-to-peer layer: state (friends, requests, groups), the feed,
 * a server-sent event stream for real-time updates, toasts, and the WebRTC call manager.
 */

export type PagerView = { type: 'dm'; key: string } | { type: 'group'; id: string } | null;

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

  // The manager owns synchronous session identity; React only displays its snapshots.
  const [{ call, localStream, remoteStream }, setCallSnapshot] = useState<CallSnapshot>({ call: null, localStream: null, remoteStream: null });
  const [calls] = useState(() => new CallManager({
    change: setCallSnapshot,
    ring: () => soundFX.playCallRing(),
    signal: async (to, callId, kind, data) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        return await api('/api/p2p/call', { method: 'POST', json: { to, callId, kind, data }, signal: controller.signal });
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw new Error('The call service did not respond. Check that your Spot is running and try again.');
        throw error;
      } finally { clearTimeout(timer); }
    }
  }));
  useEffect(() => () => calls.dispose(), [calls]);
  const startCall = useCallback((key: string, video: boolean) => {
    const friend = state?.friends.find(f => f.key === key);
    void calls.start(key, friend?.nickname || friend?.name || 'Friend', video);
  }, [calls, state]);
  const acceptCall = useCallback((video: boolean) => { void calls.accept(video); }, [calls]);
  const declineCall = useCallback(() => calls.decline(), [calls]);
  const hangUp = useCallback(() => calls.hangUp(), [calls]);
  const toggleMic = useCallback(() => calls.toggle('audio'), [calls]);
  const toggleCam = useCallback(() => calls.toggle('video'), [calls]);

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
    es.onopen = () => { refresh(); refreshFeed(); setTick(t => t + 1); };
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
          void calls.receive(ev);
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
  }, [refresh, refreshFeed, toast, calls, joinParty]);

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
