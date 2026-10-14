'use client';

import React, { useEffect, useState } from 'react';
import { Copy, Check, Link2, ShieldCheck, Trash2, UserPlus, Clock, Ticket, Sparkles, Loader2, Share2 } from 'lucide-react';
import type { Grants, Invite } from '@/lib/p2pTypes';
import { timeAgo, untilLabel } from '@/lib/p2pTypes';
import { api } from '@/lib/client';
import { Modal, Btn, inputCls, Field } from '@/components/ui/kit';
import { AccessPicker, describeGrants, toGrants, DURATIONS, KIND_ICON } from './AccessPicker';
import { useP2P } from './P2PProvider';
import { Avatar } from './Avatar';

export type SocialDialog =
  | { type: 'invite' }
  | { type: 'add'; invite?: string }
  | { type: 'review'; key: string }
  | { type: 'access'; key: string; welcome?: boolean }
  | { type: 'privacy' }
  | { type: 'share'; rid: string; name: string }
  | null;

export const SocialDialogs: React.FC = () => {
  const { dialog, setDialog } = useP2P();
  const close = () => setDialog(null);
  if (!dialog) return null;
  switch (dialog.type) {
    case 'invite':
      return <InviteDialog onClose={close} />;
    case 'add':
      return <AddFriendDialog onClose={close} initial={dialog.invite} />;
    case 'review':
      return <ReviewRequestDialog onClose={close} k={dialog.key} />;
    case 'access':
      return <FriendAccessDialog onClose={close} k={dialog.key} welcome={dialog.welcome} />;
    case 'privacy':
      return <PrivacyDialog onClose={close} />;
    case 'share':
      return <ShareDialog onClose={close} rid={dialog.rid} name={dialog.name} />;
  }
};

const CopyBox: React.FC<{ text: string; big?: boolean }> = ({ text, big }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className={`w-full flex items-center gap-2 bg-black/50 border ${copied ? 'border-emerald-400/60' : 'border-white/10 hover:border-[var(--spot-accent)]'} rounded-xl px-3 ${big ? 'py-3' : 'py-2'} text-left transition-colors`}
    >
      {copied ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <Copy className="w-4 h-4 text-[var(--spot-accent)] shrink-0" />}
      <span className={`font-mono ${big ? 'text-xs' : 'text-[11px]'} text-zinc-200 break-all`}>{text}</span>
      <span className="ml-auto text-[11px] font-bold text-zinc-400 shrink-0">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
};

// ───────────────────────── invites ─────────────────────────

const InviteDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, refresh } = useP2P();
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(7);
  const [choose, setChoose] = useState(false);
  const [grants, setGrants] = useState<Grants>(() => toGrants(state?.access.defaults || []));
  const [autoAccept, setAutoAccept] = useState(false);
  const [made, setMade] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api('/api/p2p/invites', { method: 'POST', json: { action: 'create', label, days, grants: choose ? grants : null, autoAccept: choose && autoAccept } });
      setMade(r.invite);
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const invites = state?.invites || [];
  const shareText = made ? `Come hang out on my mAI Spot! Paste this into “Add a friend”: ${made.link}` : '';

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Ticket className="w-5 h-5 text-[var(--spot-accent)]" /> Invite a friend</span>} wide>
      {made ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4">
            <div className="text-sm font-bold text-white">Your one-time invite{made.label ? ` for ${made.label}` : ''} is ready</div>
            <p className="text-xs text-zinc-400 mt-1">
              It works once: the first Spot that uses it gets in, and then it’s spent, so it can’t be passed around. It expires {untilLabel(made.expiresAt).replace(' left', '')} from now if unused.
            </p>
            <div className="mt-3 space-y-2">
              <CopyBox text={made.link} big />
              <CopyBox text={shareText} />
            </div>
            <p className="text-[11px] text-zinc-500 mt-2">
              {made.grants ? `When they connect they’ll see: ${made.access}.${made.autoAccept ? ' They’ll be accepted automatically.' : ' You’ll still confirm the request.'}` : 'You’ll choose what they can see when their request arrives.'}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setMade(null)}>Make another</Btn>
            <Btn variant="primary" onClick={onClose}>Done</Btn>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <Field label="Who’s it for? (just for you)">
              <input className={inputCls} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Sam from work" maxLength={80} autoFocus />
            </Field>
            <Field label="Link expires in">
              <select className={inputCls} value={days} onChange={e => setDays(Number(e.target.value))}>
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
              </select>
            </Field>
          </div>
          <div className="rounded-xl border border-white/10 p-3 space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setChoose(false)} className={`flex-1 rounded-lg px-3 py-2 text-left border ${!choose ? 'border-[var(--spot-accent)] bg-accent/10' : 'border-white/10'}`}>
                <div className="text-sm font-bold text-white">Decide when they ask</div>
                <div className="text-[11px] text-zinc-400">You’ll pick what they see when the request comes in.</div>
              </button>
              <button type="button" onClick={() => setChoose(true)} className={`flex-1 rounded-lg px-3 py-2 text-left border ${choose ? 'border-[var(--spot-accent)] bg-accent/10' : 'border-white/10'}`}>
                <div className="text-sm font-bold text-white">Choose now</div>
                <div className="text-[11px] text-zinc-400">Pre-pick their access for this invite.</div>
              </button>
            </div>
            {choose && (
              <>
                <AccessPicker value={grants} onChange={setGrants} defaults={state?.access.defaults} />
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={autoAccept} onChange={e => setAutoAccept(e.target.checked)} className="accent-[var(--spot-accent)] w-4 h-4" />
                  Accept them automatically when they use this link
                </label>
              </>
            )}
          </div>
          {err && <p className="text-xs text-rose-400">{err}</p>}
          <div className="flex justify-end">
            <Btn variant="primary" onClick={create} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Create invite link
            </Btn>
          </div>

          {invites.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-2">Your invites</div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {invites.map(inv => (
                  <div key={inv.token} className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{inv.label || 'Invite'} <span className="text-[11px] text-zinc-500">· {timeAgo(inv.createdAt)}</span></div>
                      <div className="text-[11px] text-zinc-500 truncate">
                        {inv.status === 'used' ? `Used by ${inv.usedBy?.name} ${timeAgo(inv.usedAt)}` : inv.status === 'open' ? `Unused · ${untilLabel(inv.expiresAt)}` : inv.status === 'revoked' ? 'Cancelled' : 'Expired unused'}
                        {' · '}
                        {inv.access}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        inv.status === 'open' ? 'bg-emerald-400/15 text-emerald-300' : inv.status === 'used' ? 'bg-sky-400/15 text-sky-300' : 'bg-white/5 text-zinc-500'
                      }`}
                    >
                      {inv.status}
                    </span>
                    {inv.status === 'open' && (
                      <>
                        <button onClick={() => navigator.clipboard?.writeText(inv.link)} className="p-1.5 text-zinc-400 hover:text-white" title="Copy link">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => api('/api/p2p/invites', { method: 'POST', json: { action: 'revoke', token: inv.token } }).then(refresh)} className="p-1.5 text-zinc-400 hover:text-rose-400" title="Cancel this invite">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

// ───────────────────────── add a friend ─────────────────────────

const AddFriendDialog: React.FC<{ onClose: () => void; initial?: string }> = ({ onClose, initial }) => {
  const { state, refresh } = useP2P();
  const [invite, setInvite] = useState(initial || '');
  const [note, setNote] = useState('');
  const [choose, setChoose] = useState(false);
  const [grants, setGrants] = useState<Grants>(() => toGrants(state?.access.defaults || []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const looksOld = /[0-9a-f]{64}\s*$/i.test(invite.trim()) && !/[0-9a-f]{64}[/#?]/i.test(invite);

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api('/api/p2p/friends', { method: 'POST', json: { action: 'add', invite, note, grants: choose ? grants : undefined } });
      setMsg({ ok: true, text: r.status === 'friends' ? 'You’re now friends!' : 'Request sent. It goes through as soon as they’re online.' });
      refresh();
      setTimeout(onClose, 1400);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-[var(--spot-accent)]" /> Add a friend</span>}
      wide={choose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={send} disabled={!invite.trim() || busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Send request
          </Btn>
        </>
      }
    >
      <Field label="Their invite link" hint="Paste the whole message if you like; the link is picked out of it.">
        <textarea className={`${inputCls} font-mono text-xs`} rows={2} value={invite} onChange={e => setInvite(e.target.value)} placeholder="spot://…" autoFocus />
      </Field>
      {looksOld && <p className="text-[11px] text-amber-300">That looks like a Spot address without an invite code. Most Spots only accept one-time invite links: ask them to make one for you.</p>}
      <Field label="Say hi (optional)">
        <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="It’s me, from the record shop!" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
        <input type="checkbox" checked={choose} onChange={e => setChoose(e.target.checked)} className="accent-[var(--spot-accent)] w-4 h-4" />
        Choose now what they can see of my Spot
        <span className="text-[11px] text-zinc-500">(otherwise: {describeGrants(toGrants(state?.access.defaults || []))})</span>
      </label>
      {choose && <AccessPicker value={grants} onChange={setGrants} defaults={state?.access.defaults} />}
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</p>}
    </Modal>
  );
};

// ───────────────────────── review a request ─────────────────────────

const ReviewRequestDialog: React.FC<{ onClose: () => void; k: string }> = ({ onClose, k }) => {
  const { state, refresh } = useP2P();
  const req = state?.requests.incoming.find(r => r.key === k);
  const [grants, setGrants] = useState<Grants>(() => req?.grants || toGrants(state?.access.defaults || []));
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await api('/api/p2p/friends', { method: 'POST', json: { action, key: k, ...extra } });
      refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Friend request"
      footer={
        <>
          <Btn variant="danger" disabled={busy} onClick={() => confirm('Block this Spot? They won’t be able to contact you again.') && act('block')}>
            Block
          </Btn>
          <Btn disabled={busy} onClick={() => act('decline')}>Decline</Btn>
          <Btn variant="primary" disabled={busy} onClick={() => act('accept', { grants })}>
            <Check className="w-4 h-4" /> Accept
          </Btn>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar src={req.avatar} name={req.name} online={req.online} size="w-14 h-14" />
        <div className="min-w-0">
          <div className="text-lg font-bold text-white truncate">{req.name}</div>
          <div className="text-xs text-zinc-500 font-mono">
            {req.handle}#{req.key.slice(0, 4)} · asked {timeAgo(req.at)}
          </div>
          {req.mood && <div className="text-xs text-zinc-400 italic truncate">“{req.mood}”</div>}
        </div>
      </div>
      <div className={`rounded-xl px-3 py-2 text-xs ${req.viaInvite ? 'bg-emerald-400/10 text-emerald-200 border border-emerald-400/20' : 'bg-amber-400/10 text-amber-200 border border-amber-400/20'}`}>
        {req.viaInvite ? (
          <span className="flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5" /> Used your invite{req.invite ? ` “${req.invite}”` : ''}. That link is now spent.</span>
        ) : (
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> No invite: they found you by your Spot address.</span>
        )}
      </div>
      {req.note && <p className="text-sm text-zinc-200 italic">“{req.note}”</p>}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-2">What can {req.name} see?</div>
        <AccessPicker value={grants} onChange={setGrants} defaults={state?.access.defaults} />
        <p className="text-[11px] text-zinc-500 mt-2">You can change this any time from their name in your friends list.</p>
      </div>
    </Modal>
  );
};

// ───────────────────────── a friend’s access ─────────────────────────

const FriendAccessDialog: React.FC<{ onClose: () => void; k: string; welcome?: boolean }> = ({ onClose, k, welcome }) => {
  const { state, refresh } = useP2P();
  const f = state?.friends.find(x => x.key === k);
  const [grants, setGrants] = useState<Grants>(() => f?.grants || {});
  const [busy, setBusy] = useState(false);
  if (!f) return null;
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/p2p/friends', { method: 'POST', json: { action: 'grants', key: k, grants } });
      refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={<span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[var(--spot-accent)]" /> What {f.name} can see</span>}
      footer={
        <>
          <Btn onClick={onClose}>{welcome ? 'Keep as is' : 'Cancel'}</Btn>
          <Btn variant="primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
          </Btn>
        </>
      }
    >
      {welcome && (
        <p className="text-sm text-zinc-300 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-[var(--spot-accent)] mt-0.5 shrink-0" />
          You and {f.name} are now friends. They currently see your usual selection; fine-tune it here.
        </p>
      )}
      <div className="flex items-center gap-3">
        <Avatar src={f.avatar} name={f.name} online={f.online} size="w-10 h-10" />
        <div className="text-xs text-zinc-400">
          Changes reach {f.name} instantly{f.online ? '' : ' (when they’re next online)'}. Anything you untick stops working for them right away.
        </div>
      </div>
      <AccessPicker value={grants} onChange={setGrants} defaults={state?.access.defaults} />
    </Modal>
  );
};

// ───────────────────────── privacy ─────────────────────────

const PrivacyDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, refresh } = useP2P();
  const [defaults, setDefaults] = useState<Grants>(() => toGrants(state?.access.defaults || []));
  const [requireInvite, setRequireInvite] = useState(!!state?.access.requireInvite);
  const [shareNow, setShareNow] = useState(!!state?.access.shareNowPlaying);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/p2p/access', { method: 'POST', json: { defaults: Object.keys(defaults), requireInvite, shareNowPlaying: shareNow } });
      refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const Toggle: React.FC<{ on: boolean; set: (v: boolean) => void; title: string; body: string }> = ({ on, set, title, body }) => (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} className="accent-[var(--spot-accent)] w-4 h-4 mt-1" />
      <span>
        <span className="block text-sm font-bold text-white">{title}</span>
        <span className="block text-xs text-zinc-400">{body}</span>
      </span>
    </label>
  );
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={<span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[var(--spot-accent)]" /> Privacy & sharing</span>}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy}>Save</Btn>
        </>
      }
    >
      <Toggle on={requireInvite} set={setRequireInvite} title="Only accept people with an invite link" body="Requests without a valid one-time invite are turned away automatically. Recommended." />
      <Toggle on={shareNow} set={setShareNow} title="Show friends what I’m listening to" body="Friends see the song you’re playing and can listen along in sync. Only songs from your own library are shown." />
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">My usual selection for new friends</div>
        <p className="text-xs text-zinc-400 mb-2">Pre-filled whenever you accept someone. You can always adjust per friend.</p>
        <AccessPicker value={defaults} onChange={g => setDefaults(Object.fromEntries(Object.keys(g).map(id => [id, {}])))} />
      </div>
      <p className="text-[11px] text-zinc-500">Nothing on your Spot is ever visible to anyone who isn’t your friend. Files stream straight from this PC and nothing is uploaded anywhere.</p>
    </Modal>
  );
};

// ───────────────────────── share one thing ─────────────────────────

/** Share one album / station / channel / game / book with chosen friends. */
const ShareDialog: React.FC<{ onClose: () => void; rid: string; name: string }> = ({ onClose, rid, name }) => {
  const { state, refresh } = useP2P();
  const friends = state?.friends || [];
  const kind = rid.split(':')[0] as keyof typeof KIND_ICON;
  const Icon = KIND_ICON[kind] || Share2;
  const has = (g: Grants) => !!g[rid] || !!g[`${kind}:*`];
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(friends.map(f => [f.key, has(f.grants)])));
  const [ms, setMs] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPicked(p => ({ ...Object.fromEntries(friends.map(f => [f.key, has(f.grants)])), ...p })), [friends.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try {
      for (const f of friends) {
        const want = !!picked[f.key];
        if (want === !!f.grants[rid] || (f.grants[`${kind}:*`] && want)) continue;
        const g = { ...f.grants };
        if (want) g[rid] = ms ? { until: Date.now() + ms } : {};
        else delete g[rid];
        await api('/api/p2p/friends', { method: 'POST', json: { action: 'grants', key: f.key, grants: g } });
      }
      refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Icon className="w-5 h-5 text-[var(--spot-accent)]" /> Share “{name}”</span>}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy || !friends.length}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
          </Btn>
        </>
      }
    >
      {!friends.length ? (
        <p className="text-sm text-zinc-400">You don’t have any friends on your Spot yet. Create an invite link from the Friends page.</p>
      ) : (
        <>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {friends.map(f => {
              const viaAll = !!f.grants[`${kind}:*`];
              const g = f.grants[rid];
              return (
                <label key={f.key} className={`flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer ${viaAll ? 'opacity-60' : ''}`}>
                  <input type="checkbox" disabled={viaAll} checked={!!picked[f.key]} onChange={e => setPicked(p => ({ ...p, [f.key]: e.target.checked }))} className="accent-[var(--spot-accent)] w-4 h-4" />
                  <Avatar src={f.avatar} name={f.name} online={f.online} status={f.status} size="w-8 h-8" />
                  <span className="text-sm text-white flex-1 truncate">{f.name}</span>
                  <span className="text-[11px] text-zinc-500">{viaAll ? 'sees all of these' : g?.until ? untilLabel(g.until) : ''}</span>
                </label>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <Clock className="w-3.5 h-3.5" /> Newly shared for
            <select value={ms} onChange={e => setMs(Number(e.target.value))} className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-white outline-none">
              {DURATIONS.map(d => (
                <option key={d.label} value={d.ms}>
                  {d.ms ? d.label : 'always'}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </Modal>
  );
};
