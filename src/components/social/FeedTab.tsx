'use client';

import React, { useMemo, useState } from 'react';
import {
  Users, UserPlus, Wifi, WifiOff, Loader2, MessageSquare, Heart, MessageCircle, Trash2, Music2, Film,
  Image as ImageIcon, Feather, Type, Send, Play, RefreshCw, X, ShieldCheck, Ticket, Headphones, Radio, Popcorn
} from 'lucide-react';
import type { Track, Video } from '@/lib/types';
import type { FeedPost, Friend } from '@/lib/p2pTypes';
import { timeAgo } from '@/lib/p2pTypes';
import { api, uploadFile, fmtTime } from '@/lib/client';
import { useP2P } from './P2PProvider';
import { useAudio } from '@/components/audio/AudioEngine';
import { CinemaPlayer } from '@/components/cinema/CinemaPlayer';
import { Btn, inputCls, Art, Menu, Empty } from '@/components/ui/kit';
import { PartiesPanel } from './WatchParty';

export { Avatar } from './Avatar';
import { Avatar } from './Avatar';

export const NetworkBadge: React.FC = () => {
  const { state } = useP2P();
  const n = state?.network;
  if (!n) return null;
  if (n.status === 'online')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400" title={n.firewalled ? 'Behind a router: connections use hole punching' : 'Directly reachable'}>
        <Wifi className="w-3.5 h-3.5" /> On the network · {n.connections} connected
      </span>
    );
  if (n.status === 'offline')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-rose-400" title={n.error || ''}>
        <WifiOff className="w-3.5 h-3.5" /> Can’t reach the peer network
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Joining the peer network…
    </span>
  );
};

export const FeedTab: React.FC<{ tracks: Track[]; videos: Video[] }> = ({ tracks, videos }) => {
  const p2p = useP2P();
  const { state, feed } = p2p;
  const [filter, setFilter] = useState<'all' | 'friends' | 'mine'>('all');
  const posts = feed.filter(p => (filter === 'mine' ? p.mine : filter === 'friends' ? !p.mine : true));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="space-y-4 min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6 text-[#ff2e6e]" /> Friend Feed
            </h1>
            <p className="text-sm text-[#649fae]">Posts from you and your friends, sent directly between your Spots, encrypted end to end. No servers in between.</p>
          </div>
          <div className="flex items-center gap-1 bg-black/40 rounded-xl p-1 border border-white/10">
            {(['all', 'friends', 'mine'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${filter === f ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
                {f === 'mine' ? 'My posts' : f}
              </button>
            ))}
            <button onClick={() => api('/api/p2p/feed', { method: 'POST', json: { action: 'refresh' } }).then(p2p.refreshFeed)} className="p-1.5 text-zinc-400 hover:text-white" title="Refresh from online friends">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <Composer tracks={tracks} videos={videos} />

        {posts.length === 0 ? (
          <Empty icon={<Users className="w-10 h-10" />} title={state?.friends.length ? 'Nothing here yet' : 'Your feed starts with a friend'}>
            {state?.friends.length
              ? 'Post something, or wait for your friends to.'
              : 'Copy your invite link (on the right) and send it to a friend, or paste theirs into “Add a friend”.'}
          </Empty>
        ) : (
          posts.map(p => <PostCard key={`${p.author}_${p.id}`} post={p} />)
        )}
      </div>

      <aside className="space-y-4">
        <MySpotCard />
        <Requests />
        <PartiesPanel />
        <FriendsList />
      </aside>
    </div>
  );
};

// ───────────────────────── sidebar ─────────────────────────

export const Panel: React.FC<{ title: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <div className="bg-[#0b1216]/90 border border-[#1a323c] rounded-2xl p-4">
    <div className="flex items-center justify-between mb-3 gap-2">
      <h3 className="text-xs font-black uppercase tracking-wider text-[#649fae]">{title}</h3>
      {right}
    </div>
    {children}
  </div>
);

const MySpotCard: React.FC = () => {
  const { state, setDialog } = useP2P();
  if (!state) return null;
  const openInvites = state.invites.filter(i => i.status === 'open').length;
  return (
    <div className="relative overflow-hidden bg-[#0b1216]/90 border border-[#1a323c] rounded-2xl">
      <div
        className="h-16"
        style={{ background: state.me.banner ? `center/cover no-repeat url("${state.me.banner}")` : 'linear-gradient(110deg, color-mix(in srgb, var(--spot-accent) 35%, transparent), #ff2e6e33 55%, transparent)' }}
      />
      <div className="px-4 pb-4 -mt-7">
        <div className="flex items-end gap-3">
          <Avatar src={state.me.avatar} name={state.me.name} size="w-14 h-14" />
          <div className="min-w-0 pb-0.5">
            <div className="font-bold text-white truncate">{state.me.name}</div>
            <div className="text-[11px] text-zinc-500 font-mono">
              {state.me.handle || '@spot'}#{state.me.tag}
            </div>
          </div>
        </div>
        <div className="mt-2">
          <NetworkBadge />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Btn variant="primary" onClick={() => setDialog({ type: 'invite' })}>
            <Ticket className="w-4 h-4" /> Invite
          </Btn>
          <Btn onClick={() => setDialog({ type: 'add' })}>
            <UserPlus className="w-4 h-4" /> Add friend
          </Btn>
        </div>
        <button onClick={() => setDialog({ type: 'privacy' })} className="mt-3 w-full flex items-center justify-between text-[11px] text-zinc-400 hover:text-white">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Privacy & sharing
          </span>
          <span>{state.access.requireInvite ? 'Invite-only' : 'Open requests'}{openInvites ? ` · ${openInvites} open invite${openInvites === 1 ? '' : 's'}` : ''}</span>
        </button>
        {state.network.status === 'offline' && (
          <p className="text-[11px] text-rose-300 mt-2">Can’t reach the peer network. Check your internet connection. Friends reconnect automatically once you’re back.</p>
        )}
      </div>
    </div>
  );
};

const OUT_REASON: Record<string, string> = {
  invite_used: 'That invite was already used or has expired. Ask for a new one.',
  invite_required: 'They only accept one-time invite links. Ask them for one.',
  declined: 'They declined.'
};

const Requests: React.FC = () => {
  const { state, refresh, setDialog } = useP2P();
  if (!state || (!state.requests.incoming.length && !state.requests.outgoing.length)) return null;
  const act = (action: string, key: string) => api('/api/p2p/friends', { method: 'POST', json: { action, key } }).then(refresh);
  return (
    <Panel title="Friend requests">
      <div className="space-y-3">
        {state.requests.incoming.map(r => (
          <div key={r.key} className="bg-[#ff2e6e]/10 border border-[#ff2e6e]/30 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Avatar src={r.avatar} name={r.name} online={r.online} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{r.name}</div>
                <div className="text-[11px] text-zinc-400 truncate">{r.viaInvite ? `Invite${r.invite ? ` “${r.invite}”` : ''}` : 'No invite'} · {timeAgo(r.at)}</div>
              </div>
            </div>
            {r.note && <p className="text-xs text-zinc-300 mt-2 italic">“{r.note}”</p>}
            <div className="flex gap-2 mt-2">
              <Btn small variant="primary" onClick={() => setDialog({ type: 'review', key: r.key })}>Review & accept</Btn>
              <Btn small onClick={() => act('decline', r.key)}>Decline</Btn>
            </div>
          </div>
        ))}
        {state.requests.outgoing.map(r => (
          <div key={r.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400 truncate">
                {r.declined ? 'Not accepted: ' : r.online ? 'Waiting for: ' : 'Waiting (they’re offline): '}
                <span className="text-white">{r.name || `${r.key.slice(0, 8)}…`}</span>
              </span>
              <button onClick={() => act('cancel', r.key)} className="text-zinc-500 hover:text-white shrink-0" title={r.declined ? 'Dismiss' : 'Cancel request'}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {r.declined && <p className="text-[11px] text-amber-300/90 mt-0.5">{OUT_REASON[r.reason] || OUT_REASON.declined}</p>}
          </div>
        ))}
      </div>
    </Panel>
  );
};

export const FriendsList: React.FC = () => {
  const p2p = useP2P();
  const friends = p2p.state?.friends || [];
  return (
    <Panel title={`Friends · ${friends.filter(f => f.online).length}/${friends.length} online`}>
      {!friends.length ? (
        <div className="text-xs text-zinc-500 space-y-2">
          <p>No friends yet. Make a one-time invite link and send it to someone; it only works once, so it can’t be passed around.</p>
          <Btn small variant="primary" onClick={() => p2p.setDialog({ type: 'invite' })}>
            <Ticket className="w-3.5 h-3.5" /> Create an invite
          </Btn>
        </div>
      ) : (
        <div className="space-y-0.5">
          {friends.map(f => (
            <FriendRow key={f.key} f={f} />
          ))}
        </div>
      )}
    </Panel>
  );
};

export const FriendRow: React.FC<{ f: Friend }> = ({ f }) => {
  const p2p = useP2P();
  const audio = useAudio();
  const act = (action: string, extra: Record<string, unknown> = {}) => api('/api/p2p/friends', { method: 'POST', json: { action, key: f.key, ...extra } }).then(p2p.refresh);
  const along = p2p.alongWith === f.key;
  const tunedLive = audio.mode === 'live' && audio.liveUrl === `/api/p2p/peer/${f.key}/live`;
  return (
    <div className="group flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5">
      <button onClick={() => p2p.setVisit(f.key)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
        <Avatar src={f.avatar} name={f.name} online={f.online} status={f.status} size="w-9 h-9" />
        <div className="min-w-0">
          <div className="text-sm text-white truncate flex items-center gap-1">
            {f.top && <span className="text-[#ffcf33]">★</span>}
            {f.name}
            {f.unread > 0 && <span className="ml-1 px-1.5 rounded-full bg-[#ff2e6e] text-[10px] font-bold">{f.unread}</span>}
          </div>
          <div className="text-[11px] text-zinc-500 truncate">
            {f.live ? (
              <span className="text-[#ff2e6e] font-bold">● ON AIR · {f.live.station}</span>
            ) : f.nowPlaying ? (
              <span className={f.nowPlaying.playing ? 'text-emerald-300' : 'text-zinc-400'}>
                {f.nowPlaying.playing ? '♪' : '❚❚'} {f.nowPlaying.title} — {f.nowPlaying.artist}
              </span>
            ) : f.online ? (
              f.mood || f.status
            ) : (
              `last seen ${timeAgo(f.lastSeen)}`
            )}
          </div>
        </div>
      </button>
      {f.live ? (
        <button onClick={() => (tunedLive ? audio.leaveLive() : audio.tuneInLive(`/api/p2p/peer/${f.key}/live`))} className={`p-1.5 ${tunedLive ? 'text-[#ff2e6e]' : 'text-zinc-500 hover:text-white'}`} title={tunedLive ? 'Stop listening' : 'Tune in to their station'}>
          <Radio className="w-4 h-4" />
        </button>
      ) : f.nowPlaying ? (
        <button onClick={() => p2p.listenAlong(along ? null : f.key)} className={`p-1.5 ${along ? 'text-emerald-300' : 'text-zinc-500 hover:text-white'}`} title={along ? 'Stop listening along' : 'Listen along'}>
          <Headphones className="w-4 h-4" />
        </button>
      ) : null}
      <button onClick={() => p2p.openChat(f.key)} className="p-1.5 text-zinc-500 hover:text-white" title="Message">
        <MessageSquare className="w-4 h-4" />
      </button>
      <Menu
        items={[
          { label: 'Visit their Spot', onClick: () => p2p.setVisit(f.key) },
          { label: 'Message', onClick: () => p2p.openChat(f.key) },
          f.nowPlaying ? { label: along ? 'Stop listening along' : 'Listen along', onClick: () => p2p.listenAlong(along ? null : f.key) } : null,
          { label: `What they can see… (${f.access})`, onClick: () => p2p.setDialog({ type: 'access', key: f.key }) },
          { label: f.top ? 'Remove from Top Friends' : 'Add to Top Friends ★', onClick: () => act('update', { top: !f.top }) },
          {
            label: 'Set nickname…',
            onClick: () => {
              const n = prompt('Nickname (leave empty to use their own name)', f.nickname);
              if (n !== null) act('update', { nickname: n });
            }
          },
          { label: '—', onClick: () => {} },
          { label: 'Remove friend', danger: true, onClick: () => confirm(`Remove ${f.name} as a friend?`) && act('remove') },
          { label: 'Block', danger: true, onClick: () => confirm(`Block ${f.name}? This also removes them as a friend.`) && act('block') }
        ]}
      />
    </div>
  );
};

// ───────────────────────── composer ─────────────────────────

type Kind = 'status' | 'poem' | 'image' | 'track' | 'video';

export const Composer: React.FC<{ tracks: Track[]; videos: Video[]; bare?: boolean }> = ({ tracks, videos, bare }) => {
  const p2p = useP2P();
  const [kind, setKind] = useState<Kind>('status');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [image, setImage] = useState<{ name: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const kinds: [Kind, string, React.ComponentType<{ className?: string }>][] = [
    ['status', 'Thought', Type],
    ['poem', 'Poem', Feather],
    ['image', 'Picture', ImageIcon],
    ['track', 'Song', Music2],
    ['video', 'Video', Film]
  ];

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/api/p2p/feed', {
        method: 'POST',
        json: { action: 'post', type: kind, text, title, media: mediaId ? { id: mediaId } : undefined, image: image?.name }
      });
      setText('');
      setTitle('');
      setMediaId('');
      setImage(null);
      p2p.refreshFeed();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={bare ? 'space-y-3' : 'bg-[#0b1216]/90 border border-[#1a323c] rounded-2xl p-4 space-y-3'}>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {kinds.map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setMediaId('');
            }}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${kind === k ? 'bg-[var(--spot-accent)] text-black' : 'text-zinc-400 hover:text-white bg-white/5'}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>
      {kind === 'poem' && <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />}
      <textarea
        className={`${inputCls} ${kind === 'poem' ? 'font-serif' : ''}`}
        rows={kind === 'poem' ? 6 : 3}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={kind === 'poem' ? 'Line breaks are kept exactly as you write them…' : kind === 'status' ? 'What’s on your mind?' : 'Say something about it (optional)'}
      />
      {kind === 'image' && (
        <div className="flex items-center gap-3">
          {image && <img src={image.url} alt="" className="w-20 h-20 object-cover rounded-lg" />}
          <label className="cursor-pointer text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10">
            {image ? 'Change picture' : 'Choose a picture'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async e => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const r = await uploadFile('thumbnail', f, f.name);
                  setImage({ name: decodeURIComponent(r.url.split('/').pop()), url: r.url });
                } catch (x) {
                  setErr((x as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
      )}
      {(kind === 'track' || kind === 'video') && (
        <select className={inputCls} value={mediaId} onChange={e => setMediaId(e.target.value)}>
          <option value="">{kind === 'track' ? 'Pick a song from your library…' : 'Pick a video from your library…'}</option>
          {(kind === 'track' ? tracks : videos).map(x => (
            <option key={x.id} value={x.id}>
              {'artist' in x ? `${x.title} — ${(x as Track).artist}` : x.title}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-500">{p2p.state ? `Goes to your ${p2p.state.friends.length} friend${p2p.state.friends.length === 1 ? '' : 's'}` : ''}</span>
        <Btn variant="primary" onClick={submit} disabled={busy || ((kind === 'track' || kind === 'video') ? !mediaId : kind === 'image' ? !image : !text.trim())}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Post
        </Btn>
      </div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </div>
  );
};

// ───────────────────────── posts ─────────────────────────

export const PostCard: React.FC<{ post: FeedPost; bare?: boolean }> = ({ post, bare }) => {
  const p2p = useP2P();
  const audio = useAudio();
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [watch, setWatch] = useState(false);
  const friend = p2p.state?.friends.find(f => f.key === post.author);

  const act = async (body: Record<string, unknown>) => {
    setErr('');
    try {
      await api('/api/p2p/feed', { method: 'POST', json: { author: post.author, id: post.id, ...body } });
      p2p.refreshFeed();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const video: Video | null = useMemo(
    () =>
      post.media?.kind === 'video'
        ? {
            id: `peer_${post.author}_${post.media.id}`, title: post.media.title, channelId: '', channelName: post.authorName, genre: post.media.genre || '',
            duration: post.media.duration, filePath: post.mediaUrl, thumbnail: post.coverUrl, views: 0, createdAt: '', description: post.text
          }
        : null,
    [post]
  );

  const comments = showAll ? post.comments : post.comments.slice(-3);

  return (
    <article className={bare ? 'py-4 border-t border-white/[0.06] first:border-t-0' : 'bg-[#0b1216]/90 border border-[#1a323c] rounded-2xl p-4'}>
      <header className="flex items-center gap-3">
        <button onClick={() => !post.mine && p2p.setVisit(post.author)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <Avatar src={post.authorAvatar} name={post.authorName} online={post.mine ? undefined : post.authorOnline} status={friend?.status} />
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{post.mine ? 'You' : post.authorName}</div>
            <div className="text-[11px] text-zinc-500">
              {timeAgo(post.createdAt)} · {post.type === 'status' ? 'thought' : post.type === 'track' ? 'shared a song' : post.type === 'video' ? 'shared a video' : post.type}
            </div>
          </div>
        </button>
        {post.mine && <Menu items={[{ label: 'Delete post', danger: true, onClick: () => confirm('Delete this post for everyone?') && act({ action: 'delete' }) }]} />}
      </header>

      <div className="mt-3 space-y-3">
        {post.type === 'poem' ? (
          <div className="text-center py-2">
            {post.title && <h3 className="font-serif text-xl text-white mb-2">{post.title}</h3>}
            <p className="font-serif text-zinc-200 whitespace-pre-line leading-relaxed">{post.text}</p>
          </div>
        ) : (
          post.text && <p className="text-sm text-zinc-200 whitespace-pre-line">{post.text}</p>
        )}

        {post.type === 'image' && post.imageUrl && <img src={post.imageUrl} alt="" className="w-full max-h-[520px] object-contain rounded-xl bg-black/40" loading="lazy" />}

        {post.media?.kind === 'track' && (
          <div className="flex items-center gap-3 bg-black/30 rounded-xl p-3">
            <Art src={post.coverUrl} title={post.media.title} className="w-14 h-14 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{post.media.title}</div>
              <div className="text-xs text-zinc-400 truncate">
                {post.media.artist} · {fmtTime(post.media.duration)}
              </div>
            </div>
            <button
              disabled={!post.authorOnline}
              onClick={() =>
                audio.playTrack({ id: `peer_${post.media!.id}`, title: post.media!.title, artist: post.media!.artist || '', coverArt: post.coverUrl, filePath: post.mediaUrl, duration: post.media!.duration }, undefined, `${post.authorName}’s Spot`)
              }
              className="w-11 h-11 rounded-full bg-[var(--spot-accent)] text-black flex items-center justify-center disabled:opacity-30"
              title={post.authorOnline ? 'Play' : 'Their Spot is offline right now'}
            >
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>
          </div>
        )}

        {video && (
          <button disabled={!post.authorOnline} onClick={() => setWatch(true)} className="relative block w-full text-left disabled:cursor-not-allowed" title={post.authorOnline ? 'Watch' : 'Their Spot is offline right now'}>
            <Art src={post.coverUrl} title={video.title} className="aspect-video rounded-xl">
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <span className="w-14 h-14 rounded-full bg-white/90 text-black flex items-center justify-center">
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </span>
              </div>
              <span className="absolute bottom-2 left-3 text-white font-bold drop-shadow">{video.title}</span>
            </Art>
          </button>
        )}
        {post.media && !post.authorOnline && <p className="text-[11px] text-zinc-500">Their Spot is offline. It’ll play when they’re back.</p>}
      </div>

      <footer className="mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-4 text-xs">
          <button onClick={() => act({ action: 'like', like: !post.likedByMe })} className={`flex items-center gap-1 ${post.likedByMe ? 'text-[#ff2e6e]' : 'text-zinc-400 hover:text-white'}`}>
            <Heart className={`w-4 h-4 ${post.likedByMe ? 'fill-current' : ''}`} /> {post.likeCount || ''}
          </button>
          <span className="flex items-center gap-1 text-zinc-400">
            <MessageCircle className="w-4 h-4" /> {post.comments.length || ''}
          </span>
        </div>
        {post.comments.length > 3 && !showAll && (
          <button onClick={() => setShowAll(true)} className="text-[11px] text-zinc-500 hover:text-white mt-2">
            Show all {post.comments.length} comments
          </button>
        )}
        <div className="space-y-1.5 mt-2">
          {comments.map(c => (
            <div key={c.id} className="group text-xs flex items-start gap-1">
              <span className="font-bold text-white shrink-0">{c.name}</span>
              <span className="text-zinc-300 flex-1">{c.text}</span>
              {post.mine && (
                <button onClick={() => act({ action: 'delete_comment', commentId: c.id })} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400" title="Delete comment">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 mt-2"
          onSubmit={e => {
            e.preventDefault();
            if (!comment.trim()) return;
            act({ action: 'comment', text: comment }).then(() => setComment(''));
          }}
        >
          <input className={`${inputCls} py-1.5 text-xs`} value={comment} onChange={e => setComment(e.target.value)} placeholder={post.mine || post.authorOnline ? 'Write a comment…' : 'They’re offline: comments need them online'} disabled={!post.mine && !post.authorOnline} />
        </form>
        {err && <p className="text-[11px] text-rose-400 mt-1">{err}</p>}
      </footer>
      {watch && video && <CinemaPlayer queue={[video]} startIndex={0} title={`${post.authorName}’s Spot`} onClose={() => setWatch(false)} />}
    </article>
  );
};

