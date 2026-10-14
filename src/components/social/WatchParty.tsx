'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, RotateCcw, RotateCw, Maximize, Minimize2, Volume2, VolumeX, Send, Users, Clapperboard, X, Crown, UserPlus, Loader2 } from 'lucide-react';
import type { Party } from '@/lib/p2pTypes';
import { api, fmtTime } from '@/lib/client';
import { Btn, Modal, Art, inputCls } from '@/components/ui/kit';
import { useP2P } from './P2PProvider';
import { Avatar } from './Avatar';

const post = (json: Record<string, unknown>) => api('/api/p2p/party', { method: 'POST', json });

/** Where the party's video should be right now, on this computer's clock. */
const targetOf = (p: Party) => Math.min(p.duration || Infinity, p.state.position + (p.state.playing ? (Date.now() - p.state.at) / 1000 : 0));

// ───────────────────────── start one ─────────────────────────

export const StartPartyDialog: React.FC<{ video: { id: string; title: string; thumbnail?: string }; onClose: () => void }> = ({ video, onClose }) => {
  const p2p = useP2P();
  const friends = (p2p.state?.friends || []).filter(f => f.online);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const start = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await post({ action: 'create', videoId: video.id, invite: Object.keys(picked).filter(k => picked[k]) });
      p2p.refresh();
      p2p.setPartyOpen(r.party.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Clapperboard className="w-5 h-5 text-[#f9993c]" /> Start a watch party</span>}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={start} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start party
          </Btn>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Art src={video.thumbnail} title={video.title} className="w-28 aspect-video rounded-lg shrink-0" />
        <div>
          <div className="font-bold text-white">{video.title}</div>
          <p className="text-xs text-zinc-400 mt-1">Everyone watches in sync, streamed straight from your PC. Anyone can play, pause or skip; it happens for everyone.</p>
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-2">Invite friends who are online</div>
        {!friends.length ? (
          <p className="text-sm text-zinc-500">None of your friends are online right now. You can start anyway and invite them from the party when they show up.</p>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {friends.map(f => (
              <label key={f.key} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                <input type="checkbox" checked={!!picked[f.key]} onChange={e => setPicked(p => ({ ...p, [f.key]: e.target.checked }))} className="accent-[var(--spot-accent)] w-4 h-4" />
                <Avatar src={f.avatar} name={f.name} online status={f.status} size="w-8 h-8" />
                <span className="text-sm text-white">{f.name}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-[11px] text-zinc-500 mt-2">Guests can stream this video only while the party is running.</p>
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </Modal>
  );
};

// ───────────────────────── sidebar panel ─────────────────────────

export const PartiesPanel: React.FC = () => {
  const p2p = useP2P();
  const parties = p2p.state?.parties || [];
  if (!parties.length) return null;
  return (
    <div className="bg-gradient-to-br from-[#f9993c]/15 to-[#ff2e6e]/10 border border-[#f9993c]/40 rounded-2xl p-4">
      <h3 className="text-xs font-black uppercase tracking-wider text-[#f9993c] mb-3 flex items-center gap-1.5">
        <Clapperboard className="w-3.5 h-3.5" /> Watch parties
      </h3>
      <div className="space-y-2">
        {parties.map(p => (
          <div key={p.id} className="flex items-center gap-3">
            <Art src={p.coverUrl} title={p.title} className="w-16 aspect-video rounded-md shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{p.title}</div>
              <div className="text-[11px] text-zinc-400 truncate">
                {p.status === 'hosting' ? `You’re hosting · ${p.members.length - 1} watching` : p.status === 'joined' ? `With ${p.hostName}` : `${p.hostName} invited you`}
              </div>
            </div>
            {p.status === 'invited' ? (
              <div className="flex gap-1">
                <Btn small variant="primary" onClick={() => p2p.joinParty(p.id)}>Join</Btn>
                <button onClick={() => post({ action: 'decline', id: p.id }).then(p2p.refresh)} className="p-1 text-zinc-500 hover:text-white" title="Not now">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Btn small variant="primary" onClick={() => p2p.setPartyOpen(p.id)}>Open</Btn>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────────────────────── the room ─────────────────────────

/** Mounted once at the app root: the open party, or a small pill to get back to it. */
export const PartyLayer: React.FC = () => {
  const p2p = useP2P();
  const all = p2p.state?.parties || [];
  const parties = all.filter(p => p.status !== 'invited');
  const open = parties.find(p => p.id === p2p.partyOpen);
  // Close the room only once the party has really gone away: not while a new party or a join is still landing.
  const exists = all.some(p => p.id === p2p.partyOpen);
  const seen = useRef<string | null>(null);
  if (exists) seen.current = p2p.partyOpen;
  useEffect(() => {
    if (p2p.partyOpen && !exists && seen.current === p2p.partyOpen) {
      seen.current = null;
      p2p.setPartyOpen(null);
    }
  }, [p2p, exists]);
  if (typeof document === 'undefined') return null;
  if (open) return <PartyRoom party={open} />;
  if (!parties.length) return null;
  const p = parties[0];
  return createPortal(
    <button
      onClick={() => p2p.setPartyOpen(p.id)}
      className="fixed left-4 bottom-24 md:bottom-6 z-[47] flex items-center gap-2 pl-2 pr-4 py-2 rounded-full bg-gradient-to-r from-[#f9993c] to-[#ff2e6e] text-black font-bold text-sm shadow-2xl animate-fadeIn"
    >
      <span className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center">
        <Clapperboard className="w-4 h-4" />
      </span>
      Watch party · <span className="max-w-[10rem] truncate">{p.title}</span>
    </button>,
    document.body
  );
};

const PartyRoom: React.FC<{ party: Party }> = ({ party }) => {
  const p2p = useP2P();
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const partyRef = useRef(party);
  partyRef.current = party;
  const [now, setNow] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(1);
  const [text, setText] = useState('');
  const [scrub, setScrub] = useState<number | null>(null);
  const [inviting, setInviting] = useState(false);
  const [err, setErr] = useState('');

  // Follow the host's clock.
  useEffect(() => {
    const id = setInterval(() => {
      const v = video.current;
      const p = partyRef.current;
      if (!v) return;
      const target = targetOf(p);
      setNow(v.currentTime);
      if (v.readyState < 1) return;
      if (Math.abs(v.currentTime - target) > 0.75) v.currentTime = target;
      if (p.state.playing && v.paused && !(p.duration && target >= p.duration - 0.2)) {
        v.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
      } else if (!p.state.playing && !v.paused) v.pause();
    }, 350);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [party.chat.length]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const control = (c: 'play' | 'pause' | 'seek' | 'ended', position?: number) =>
    post({ action: 'control', id: party.id, control: c, position: position ?? video.current?.currentTime ?? 0 })
      .then(p2p.refresh)
      .catch(e => setErr((e as Error).message));
  const send = () => {
    if (!text.trim()) return;
    post({ action: 'chat', id: party.id, text }).then(p2p.refresh);
    setText('');
  };
  const leave = () => {
    if (party.isHost && !confirm('End the watch party for everyone?')) return;
    post({ action: party.isHost ? 'end' : 'leave', id: party.id }).then(p2p.refresh);
    p2p.setPartyOpen(null);
  };

  const pos = scrub ?? now;
  const notInvited = useMemo(
    () => (p2p.state?.friends || []).filter(f => f.online && !party.members.some(m => m.key === f.key) && !party.invited.some(i => i.key === f.key)),
    [p2p.state, party]
  );

  return createPortal(
    <div className="fixed inset-0 z-[72] bg-[#020405] flex flex-col lg:flex-row animate-fadeIn">
      <div ref={wrap} className="relative flex-1 flex flex-col min-h-0 bg-black">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-b from-black/90 to-transparent absolute top-0 inset-x-0 z-10">
          <div className="min-w-0">
            <div className="text-[10px] font-black tracking-[0.25em] text-[#f9993c]">WATCH PARTY</div>
            <div className="text-white font-bold truncate">{party.title}</div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => p2p.setPartyOpen(null)} className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10" title="Minimise (the party keeps going)">
              <Minimize2 className="w-5 h-5" />
            </button>
            <button onClick={leave} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white/10 text-white hover:bg-rose-500/80">
              {party.isHost ? 'End party' : 'Leave'}
            </button>
          </div>
        </div>
        <video
          ref={video}
          src={party.src}
          className="flex-1 w-full min-h-0 object-contain bg-black"
          playsInline
          muted={muted}
          onVolumeChange={e => setVol(e.currentTarget.volume)}
          onEnded={() => party.isHost && control('ended', party.duration)}
          onError={() => setErr('This video can’t be played here. It may be offline, or your browser can’t play its format.')}
          onClick={() => control(party.state.playing ? 'pause' : 'play')}
        />
        {blocked && (
          <button onClick={() => video.current?.play().then(() => setBlocked(false)).catch(() => {})} className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
            <span className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#f9993c] text-black font-bold">
              <Play className="w-5 h-5 fill-current" /> Click to join the playback
            </span>
          </button>
        )}
        <div className="px-4 pb-3 pt-2 bg-gradient-to-t from-black/95 to-black/40">
          <input
            type="range"
            min={0}
            max={party.duration || 1}
            step={0.1}
            value={Math.min(pos, party.duration || pos)}
            onChange={e => setScrub(parseFloat(e.target.value))}
            onPointerUp={() => {
              if (scrub !== null) control('seek', scrub);
              setScrub(null);
            }}
            onKeyUp={() => {
              if (scrub !== null) control('seek', scrub);
              setScrub(null);
            }}
            className="w-full accent-[#f9993c]"
            aria-label="Seek for everyone"
          />
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => control('seek', Math.max(0, now - 10))} className="p-2 text-zinc-300 hover:text-white" title="Back 10s">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={() => control(party.state.playing ? 'pause' : 'play')} className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center" title={party.state.playing ? 'Pause for everyone' : 'Play for everyone'}>
              {party.state.playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            <button onClick={() => control('seek', Math.min(party.duration || now + 10, now + 10))} className="p-2 text-zinc-300 hover:text-white" title="Forward 10s">
              <RotateCw className="w-5 h-5" />
            </button>
            <span className="text-xs font-mono text-zinc-300 ml-1">
              {fmtTime(pos)} / {fmtTime(party.duration)}
            </span>
            <span className="text-[11px] text-zinc-500 ml-3 truncate hidden sm:inline">{party.state.by ? `${party.state.playing ? 'Played' : 'Paused'} by ${party.state.by}` : ''}</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setMuted(m => !m)} className="p-2 text-zinc-300 hover:text-white" title="Mute (just you)">
                {muted || vol === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} onChange={e => { if (video.current) video.current.volume = parseFloat(e.target.value); setMuted(false); }} className="w-20 accent-white hidden sm:block" aria-label="Volume (just you)" />
              <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen())?.catch?.(() => {})} className="p-2 text-zinc-300 hover:text-white" title="Fullscreen">
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>
          {err && <p className="text-xs text-rose-400 mt-1">{err}</p>}
        </div>
      </div>

      <aside className="w-full lg:w-[340px] h-[42vh] lg:h-auto flex flex-col bg-[#0b1216] border-t lg:border-t-0 lg:border-l border-[#1a323c]">
        <div className="p-4 border-b border-[#1a323c]">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#649fae] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> In the room · {party.members.length}
            </h3>
            {party.isHost && (
              <button onClick={() => setInviting(v => !v)} className="text-[11px] text-[var(--spot-accent)] hover:underline flex items-center gap-1">
                <UserPlus className="w-3.5 h-3.5" /> Invite
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {party.members.map(m => (
              <span key={m.key} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white/5 text-xs text-white">
                <span className={`w-2 h-2 rounded-full ${m.online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                {m.key === party.host && <Crown className="w-3 h-3 text-[#ffcf33]" />}
                {m.name}
              </span>
            ))}
            {party.invited.map(m => (
              <span key={m.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-white/15 text-xs text-zinc-500">
                {m.name} · invited
              </span>
            ))}
          </div>
          {inviting && (
            <div className="mt-3 space-y-1">
              {!notInvited.length && <p className="text-[11px] text-zinc-500">Everyone online is already here or invited.</p>}
              {notInvited.map(f => (
                <button
                  key={f.key}
                  onClick={() => post({ action: 'invite', id: party.id, invite: [f.key] }).then(p2p.refresh)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 text-left"
                >
                  <Avatar src={f.avatar} name={f.name} online status={f.status} size="w-7 h-7" />
                  <span className="text-sm text-white flex-1">{f.name}</span>
                  <span className="text-[11px] text-[var(--spot-accent)]">Invite</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {party.chat.map(m =>
            m.system ? (
              <div key={m.id} className="text-[11px] text-zinc-500 text-center italic">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={`text-sm ${m.mine ? 'text-right' : ''}`}>
                <span className={`inline-block max-w-[85%] px-3 py-1.5 rounded-2xl ${m.mine ? 'bg-[var(--spot-accent)] text-black' : 'bg-white/10 text-white'}`}>
                  {!m.mine && <span className="block text-[10px] font-bold text-[#f9993c]">{m.name}</span>}
                  {m.text}
                </span>
              </div>
            )
          )}
          <div ref={chatEnd} />
        </div>
        <form
          className="p-3 border-t border-[#1a323c] flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            send();
          }}
        >
          <input className={inputCls} value={text} onChange={e => setText(e.target.value)} placeholder="Say something…" maxLength={1000} />
          <Btn variant="primary" type="submit" disabled={!text.trim()}>
            <Send className="w-4 h-4" />
          </Btn>
        </form>
      </aside>
    </div>,
    document.body
  );
};
