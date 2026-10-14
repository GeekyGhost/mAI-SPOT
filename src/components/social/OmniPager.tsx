'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, ChevronLeft, Phone, Video as VideoIcon, Users, Plus, Send, Eye, LogOut, Clock, Check, CheckCheck, X, Minus } from 'lucide-react';
import type { DirectMessage, GroupDetail } from '@/lib/p2pTypes';
import { timeAgo } from '@/lib/p2pTypes';
import { api } from '@/lib/client';
import { useP2P } from './P2PProvider';
import { Avatar, NetworkBadge } from './FeedTab';
import { soundFX } from '@/components/sound/SoundFX';

const STATUS: { id: 'online' | 'away' | 'dnd' | 'offline'; label: string; dot: string }[] = [
  { id: 'online', label: 'Online', dot: 'bg-emerald-400' },
  { id: 'away', label: 'Away', dot: 'bg-amber-400' },
  { id: 'dnd', label: 'Do not disturb', dot: 'bg-rose-500' },
  { id: 'offline', label: 'Appear offline', dot: 'bg-zinc-500' }
];

/** Floating messenger: direct messages (with a real offline outbox), group chats, calls. */
export const OmniPager: React.FC<{ raised?: boolean }> = ({ raised }) => {
  const p2p = useP2P();
  const { state, pager, setPager } = p2p;
  const [tab, setTab] = useState<'friends' | 'groups'>('friends');
  const unread = (state?.friends.reduce((s, f) => s + f.unread, 0) || 0) + (state?.groups.reduce((s, g) => s + g.unread, 0) || 0);
  const online = state?.friends.filter(f => f.online).length || 0;
  const bottom = raised ? 'bottom-36 md:bottom-24' : 'bottom-20 md:bottom-5';
  // Render only after mount: the server can't portal into <body>, and must match the first client render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <>
      {!pager.open && (
        <button
          onClick={() => {
            setPager({ open: true, view: pager.view });
            soundFX.playClick();
          }}
          title="OmniPager: messages and chats"
          className={`fixed ${bottom} right-4 z-[47] flex items-center gap-2 p-3 sm:px-4 sm:py-2.5 rounded-full bg-[#080f12]/95 border-2 border-emerald-500/40 hover:border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)] backdrop-blur`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${state?.network.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
          <span className="hidden sm:inline font-mono text-xs font-black text-white tracking-wider">OMNIPAGER</span>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">{online}<span className="hidden sm:inline"> ONLINE</span></span>
          {unread > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#ff2e6e] text-white">{unread}</span>}
        </button>
      )}

      {pager.open && state && (
        <div className={`fixed ${bottom} right-4 z-[47] w-[380px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-7rem)] bg-[#080f12] border-2 border-[#1a323c] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn`}>
          {pager.view?.type === 'dm' ? (
            <DMView peer={pager.view.key} onBack={() => setPager({ open: true, view: null })} />
          ) : pager.view?.type === 'group' ? (
            <GroupView id={pager.view.id} onBack={() => setPager({ open: true, view: null })} />
          ) : (
            <>
              <Header />
              <div className="flex border-b border-[#1a323c]">
                {(['friends', 'groups'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${tab === t ? 'text-white border-b-2 border-emerald-400' : 'text-zinc-500 hover:text-white'}`}>
                    {t === 'friends' ? `Friends (${online}/${state.friends.length})` : `Groups (${state.groups.length})`}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto">{tab === 'friends' ? <FriendList /> : <GroupList />}</div>
            </>
          )}
          <button onClick={() => setPager({ open: false, view: pager.view })} className="absolute top-2.5 right-2.5 p-1 text-zinc-500 hover:text-white" title="Minimise">
            <Minus className="w-4 h-4" />
          </button>
        </div>
      )}
    </>,
    document.body
  );
};

const Header: React.FC = () => {
  const { state, refresh } = useP2P();
  if (!state) return null;
  const cur = STATUS.find(s => s.id === state.me.status) || STATUS[0];
  return (
    <div className="p-3 pr-9 border-b border-[#1a323c] bg-[#0b1216]">
      <div className="flex items-center gap-3">
        <Avatar src={state.me.avatar} name={state.me.name} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{state.me.name}</div>
          <select
            value={state.me.status}
            onChange={e => api('/api/p2p/status', { method: 'POST', json: { status: e.target.value } }).then(refresh)}
            className="mt-0.5 bg-transparent text-[11px] text-zinc-300 outline-none cursor-pointer"
            title="Your status"
          >
            {STATUS.map(s => (
              <option key={s.id} value={s.id} className="bg-[#0b1216]">
                {s.label}
              </option>
            ))}
          </select>
          <span className={`inline-block w-2 h-2 rounded-full ml-1 ${cur.dot}`} />
        </div>
      </div>
      <div className="mt-2">
        <NetworkBadge />
      </div>
    </div>
  );
};

const FriendList: React.FC = () => {
  const p2p = useP2P();
  const friends = p2p.state?.friends || [];
  const reqs = p2p.state?.requests.incoming.length || 0;
  if (!friends.length)
    return (
      <div className="p-6 text-center text-sm text-zinc-500">
        No friends yet. Open the <b className="text-white">Feed</b> to copy your invite link or add a friend.
        {reqs > 0 && <p className="mt-2 text-[#ff2e6e]">You have {reqs} friend request{reqs > 1 ? 's' : ''} waiting in the Feed.</p>}
      </div>
    );
  return (
    <div className="p-2">
      {reqs > 0 && <div className="mx-1 mb-2 px-3 py-2 rounded-lg bg-[#ff2e6e]/15 text-xs text-[#ff8fb0]">{reqs} friend request{reqs > 1 ? 's' : ''} waiting in the Feed.</div>}
      {friends.map(f => (
        <button key={f.key} onClick={() => p2p.setPager({ open: true, view: { type: 'dm', key: f.key } })} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left">
          <Avatar src={f.avatar} name={f.name} online={f.online} status={f.status} size="w-9 h-9" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white truncate">{f.name}</div>
            <div className="text-[11px] text-zinc-500 truncate">
              {f.live ? <span className="text-[#ff2e6e]">● On air: {f.live.station}</span> : f.online ? f.mood || f.status : `Offline · ${timeAgo(f.lastSeen)}`}
            </div>
          </div>
          {f.queued > 0 && <Clock className="w-3.5 h-3.5 text-amber-400" />}
          {f.unread > 0 && <span className="px-1.5 rounded-full bg-[#ff2e6e] text-[10px] font-bold text-white">{f.unread}</span>}
        </button>
      ))}
    </div>
  );
};

const Ticks: React.FC<{ m: DirectMessage }> = ({ m }) =>
  m.status === 'queued' ? (
    <span title="Waiting in your outbox: delivers when they come online">
      <Clock className="w-3 h-3 inline" />
    </span>
  ) : m.status === 'read' ? (
    <span title="Read">
      <CheckCheck className="w-3.5 h-3.5 inline text-[#2ee8f7]" />
    </span>
  ) : (
    <span title="Delivered">
      <Check className="w-3.5 h-3.5 inline" />
    </span>
  );

const DMView: React.FC<{ peer: string; onBack: () => void }> = ({ peer, onBack }) => {
  const p2p = useP2P();
  const f = p2p.state?.friends.find(x => x.key === peer);
  const [msgs, setMsgs] = useState<DirectMessage[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = () => api(`/api/p2p/messages?peer=${peer}`).then(d => setMsgs(d.messages)).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer, p2p.tick]);
  // Mark read when opened and whenever a new incoming message arrives.
  const lastIncoming = [...msgs].reverse().find(m => m.from === peer)?.id;
  useEffect(() => {
    if (f?.unread || lastIncoming) api('/api/p2p/messages', { method: 'POST', json: { action: 'read', peer } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer, lastIncoming]);
  useEffect(() => endRef.current?.scrollIntoView(), [msgs.length]);

  if (!f) return <div className="p-4 text-sm text-zinc-500">Not a friend anymore.</div>;

  const send = async () => {
    if (!text.trim()) return;
    setErr('');
    try {
      await api('/api/p2p/messages', { method: 'POST', json: { to: peer, text } });
      setText('');
      soundFX.playMessageSent();
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 p-2.5 pr-9 border-b border-[#1a323c] bg-[#0b1216]">
        <button onClick={onBack} className="p-1 text-zinc-400 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Avatar src={f.avatar} name={f.name} online={f.online} status={f.status} size="w-8 h-8" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{f.name}</div>
          <div className="text-[10px] text-zinc-500">{f.online ? f.status : `offline · ${timeAgo(f.lastSeen)}`}</div>
        </div>
        <button onClick={() => p2p.setVisit(f.key)} className="p-1.5 text-zinc-400 hover:text-white" title="Visit their Spot">
          <Eye className="w-4 h-4" />
        </button>
        <button disabled={!f.online} onClick={() => p2p.startCall(f.key, false)} className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30" title="Voice call">
          <Phone className="w-4 h-4" />
        </button>
        <button disabled={!f.online} onClick={() => p2p.startCall(f.key, true)} className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30" title="Video call">
          <VideoIcon className="w-4 h-4" />
        </button>
      </div>
      {!f.online && <div className="px-3 py-1.5 text-[11px] bg-amber-500/10 text-amber-300 border-b border-amber-500/20">{f.name} is offline. Messages wait in your outbox (⏱) and deliver automatically when they’re back.</div>}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.map(m => {
          const mine = m.from !== peer;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-emerald-500/20 text-emerald-50 rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${mine ? 'justify-end text-emerald-200/60' : 'text-zinc-500'}`}>
                  {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {mine && <Ticks m={m} />}
                </div>
              </div>
            </div>
          );
        })}
        {!msgs.length && <p className="text-center text-xs text-zinc-500 mt-8">Say hi to {f.name}. Messages go straight to their Spot, encrypted.</p>}
        <div ref={endRef} />
      </div>
      {err && <p className="px-3 text-[11px] text-rose-400">{err}</p>}
      <form
        className="p-2 border-t border-[#1a323c] flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          send();
        }}
      >
        <input value={text} onChange={e => setText(e.target.value)} placeholder={`Message ${f.name}`} className="flex-1 bg-black/40 border border-[#1f3a45] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" maxLength={4000} autoFocus />
        <button className="p-2 rounded-lg bg-emerald-500 text-black disabled:opacity-40" disabled={!text.trim()} title="Send">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </>
  );
};

const GroupList: React.FC = () => {
  const p2p = useP2P();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const groups = p2p.state?.groups || [];
  const friends = p2p.state?.friends || [];
  return (
    <div className="p-2">
      {creating ? (
        <div className="p-2 space-y-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Group name" className="w-full bg-black/40 border border-[#1f3a45] rounded-lg px-3 py-2 text-sm text-white outline-none" autoFocus />
          <div className="max-h-56 overflow-y-auto space-y-1">
            {friends.map(f => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-zinc-200 p-1.5 rounded hover:bg-white/5 cursor-pointer">
                <input type="checkbox" checked={pick.includes(f.key)} onChange={e => setPick(p => (e.target.checked ? [...p, f.key] : p.filter(x => x !== f.key)))} className="accent-emerald-400" />
                {f.name}
              </label>
            ))}
            {!friends.length && <p className="text-xs text-zinc-500">Add some friends first.</p>}
          </div>
          {err && <p className="text-[11px] text-rose-400">{err}</p>}
          <div className="flex gap-2">
            <button
              disabled={!pick.length}
              onClick={async () => {
                try {
                  const r = await api('/api/p2p/groups', { method: 'POST', json: { action: 'create', name, members: pick } });
                  setCreating(false);
                  setName('');
                  setPick([]);
                  p2p.refresh();
                  p2p.setPager({ open: true, view: { type: 'group', id: r.group.id } });
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}
              className="flex-1 py-2 rounded-lg bg-emerald-500 text-black text-sm font-bold disabled:opacity-40"
            >
              Create group
            </button>
            <button onClick={() => setCreating(false)} className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2 p-2 rounded-lg text-sm text-emerald-300 hover:bg-white/5">
          <Plus className="w-4 h-4" /> New group chat
        </button>
      )}
      {groups.map(g => (
        <button key={g.id} onClick={() => p2p.setPager({ open: true, view: { type: 'group', id: g.id } })} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white truncate">{g.name}</div>
            <div className="text-[11px] text-zinc-500 truncate">{g.last ? `${g.last.name}: ${g.last.text}` : `${g.members.length} members`}</div>
          </div>
          <span className="text-[10px] text-zinc-500">{g.members.filter(m => m.online).length}/{g.members.length}</span>
          {g.unread > 0 && <span className="px-1.5 rounded-full bg-[#ff2e6e] text-[10px] font-bold text-white">{g.unread}</span>}
        </button>
      ))}
    </div>
  );
};

const GroupView: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const p2p = useP2P();
  const summary = p2p.state?.groups.find(g => g.id === id);
  const [g, setG] = useState<GroupDetail | null>(null);
  const [text, setText] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api(`/api/p2p/groups/${id}`).then(d => setG(d.group)).catch(() => setG(null));
  }, [id, p2p.tick]);
  useEffect(() => {
    if (summary?.unread) api('/api/p2p/groups', { method: 'POST', json: { action: 'read', id } }).catch(() => {});
  }, [id, summary?.unread]);
  useEffect(() => endRef.current?.scrollIntoView(), [g?.messages.length]);

  if (!summary) return <div className="p-4 text-sm text-zinc-500">You’re not in this group anymore. <button className="underline" onClick={onBack}>Back</button></div>;

  const notMembers = (p2p.state?.friends || []).filter(f => !summary.members.some(m => m.key === f.key));

  return (
    <>
      <div className="flex items-center gap-2 p-2.5 pr-9 border-b border-[#1a323c] bg-[#0b1216]">
        <button onClick={onBack} className="p-1 text-zinc-400 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={() => setShowMembers(s => !s)} className="min-w-0 flex-1 text-left">
          <div className="text-sm font-bold text-white truncate">{summary.name}</div>
          <div className="text-[10px] text-zinc-500">
            {summary.members.filter(m => m.online).length} of {summary.members.length} online · tap for members
          </div>
        </button>
      </div>
      {showMembers && (
        <div className="p-2 border-b border-[#1a323c] bg-black/30 space-y-1 max-h-48 overflow-y-auto">
          {summary.members.map(m => (
            <div key={m.key} className="flex items-center gap-2 text-xs text-zinc-300">
              <span className={`w-2 h-2 rounded-full ${m.online ? 'bg-emerald-400' : 'bg-zinc-600'}`} /> {m.name}
            </div>
          ))}
          {notMembers.length > 0 && (
            <select
              defaultValue=""
              onChange={e => e.target.value && api('/api/p2p/groups', { method: 'POST', json: { action: 'add', id, members: [e.target.value] } }).then(p2p.refresh)}
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white mt-1"
            >
              <option value="">+ Add a friend…</option>
              {notMembers.map(f => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => confirm('Leave this group?') && api('/api/p2p/groups', { method: 'POST', json: { action: 'leave', id } }).then(() => { p2p.refresh(); onBack(); })}
            className="flex items-center gap-1 text-xs text-rose-400 mt-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Leave group
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {(g?.messages || []).map(m => {
          const mine = m.from === g?.me;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-emerald-500/20 text-emerald-50 rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                {!mine && <div className="text-[10px] font-bold text-[#2ee8f7] mb-0.5">{m.name}</div>}
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                <div className="text-[10px] mt-0.5 text-zinc-500">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          );
        })}
        {g && !g.messages.length && <p className="text-center text-xs text-zinc-500 mt-8">No messages yet. Members who are offline catch up from whoever’s online when they return.</p>}
        <div ref={endRef} />
      </div>
      <form
        className="p-2 border-t border-[#1a323c] flex gap-2"
        onSubmit={async e => {
          e.preventDefault();
          if (!text.trim()) return;
          await api('/api/p2p/groups', { method: 'POST', json: { action: 'send', id, text } });
          setText('');
          soundFX.playMessageSent();
          api(`/api/p2p/groups/${id}`).then(d => setG(d.group));
        }}
      >
        <input value={text} onChange={e => setText(e.target.value)} placeholder={`Message ${summary.name}`} className="flex-1 bg-black/40 border border-[#1f3a45] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" maxLength={4000} autoFocus />
        <button className="p-2 rounded-lg bg-emerald-500 text-black disabled:opacity-40" disabled={!text.trim()} title="Send">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </>
  );
};

/** Incoming-call prompt and the in-call window. */
export const CallWindow: React.FC = () => {
  const p2p = useP2P();
  const { call } = p2p;
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = p2p.remoteStream;
  }, [p2p.remoteStream, call?.status]);
  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = p2p.localStream;
  }, [p2p.localStream, call?.status]);
  useEffect(() => {
    if (call?.status !== 'active') {
      setSeconds(0);
      return;
    }
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [call?.status]);

  if (!call || typeof document === 'undefined') return null;
  const friend = p2p.state?.friends.find(f => f.key === call.peer);
  const label =
    call.status === 'ringing' ? (call.video ? 'Incoming video call' : 'Incoming call')
    : call.status === 'calling' ? 'Calling…'
    : call.status === 'connecting' ? 'Connecting…'
    : call.status === 'active' ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    : call.error || 'Call ended';

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur flex items-center justify-center p-4 animate-fadeIn">
      <div className="relative w-full max-w-3xl aspect-video bg-[#05080a] border-2 border-emerald-500/40 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(16,185,129,0.2)]">
        <video ref={remoteRef} autoPlay playsInline className={`absolute inset-0 w-full h-full object-cover ${call.video && call.status === 'active' ? '' : 'opacity-0'}`} />
        {!(call.video && call.status === 'active') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Avatar src={friend?.avatar} name={call.name} size="w-28 h-28" />
            <div className="text-2xl font-black text-white">{call.name}</div>
            <div className={`text-sm ${call.status === 'ended' && call.error ? 'text-rose-300' : 'text-emerald-300'} ${call.status === 'ringing' || call.status === 'calling' ? 'animate-pulse' : ''}`}>{label}</div>
          </div>
        )}
        {call.video && p2p.localStream && <video ref={localRef} autoPlay playsInline muted className="absolute top-4 right-4 w-40 aspect-video object-cover rounded-xl border border-white/20" />}
        {call.video && call.status === 'active' && <div className="absolute top-4 left-4 px-2 py-1 rounded bg-black/60 text-xs text-white font-mono">{call.name} · {label}</div>}

        <div className="absolute bottom-5 inset-x-0 flex justify-center gap-3">
          {call.status === 'ringing' ? (
            <>
              <button onClick={() => p2p.acceptCall(false)} className="px-5 py-3 rounded-full bg-emerald-500 text-black font-bold flex items-center gap-2">
                <Phone className="w-5 h-5" /> Answer
              </button>
              {call.video && (
                <button onClick={() => p2p.acceptCall(true)} className="px-5 py-3 rounded-full bg-emerald-500 text-black font-bold flex items-center gap-2">
                  <VideoIcon className="w-5 h-5" /> With video
                </button>
              )}
              <button onClick={p2p.declineCall} className="px-5 py-3 rounded-full bg-rose-600 text-white font-bold flex items-center gap-2">
                <X className="w-5 h-5" /> Decline
              </button>
            </>
          ) : call.status !== 'ended' ? (
            <>
              <button onClick={p2p.toggleMic} className={`p-4 rounded-full ${call.micOn ? 'bg-white/15 text-white' : 'bg-rose-500/30 text-rose-200'}`} title={call.micOn ? 'Mute' : 'Unmute'}>
                {call.micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              {call.video && (
                <button onClick={p2p.toggleCam} className={`p-4 rounded-full ${call.camOn ? 'bg-white/15 text-white' : 'bg-rose-500/30 text-rose-200'}`} title={call.camOn ? 'Camera off' : 'Camera on'}>
                  <VideoIcon className="w-5 h-5" />
                </button>
              )}
              <button onClick={p2p.hangUp} className="px-6 py-4 rounded-full bg-rose-600 text-white font-bold flex items-center gap-2">
                <Phone className="w-5 h-5 rotate-[135deg]" /> Hang up
              </button>
            </>
          ) : null}
        </div>
      </div>
      <audio ref={el => { if (el && !call.video) el.srcObject = p2p.remoteStream; }} autoPlay />
    </div>,
    document.body
  );
};

