'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Pencil, Ticket, Sliders, Headphones, Radio, Sparkles, Clapperboard, Image as ImageIcon, Gamepad2, BookOpen, Play, Pause, Shuffle,
  Users, Newspaper, Plus, Music2, Film, Trophy, Clock as ClockIcon, StickyNote, ChevronRight
} from 'lucide-react';
import type { StationProfile, Track, Video, Game, Book, LiveBroadcast, LayoutConfig } from '@/lib/types';
import { Art, Btn } from '@/components/ui/kit';
import { useP2P } from '@/components/social/P2PProvider';
import { useAudio, NowTrack } from '@/components/audio/AudioEngine';
import { NetworkBadge, FriendRow, Composer, PostCard } from '@/components/social/FeedTab';
import { MusicDeck } from '@/components/audio/Decks';
import { AppRunner } from '@/components/arcade/ArcadeTab';
import { Reader } from '@/components/library/Reader';
import { api } from '@/lib/client';

export type GoTo = 'feed' | 'radio' | 'cinema' | 'gallery' | 'arcade' | 'library' | 'studio';

/** A widget's frame: themed by the Spot look (panel style, corners, density). */
export const Card: React.FC<{
  title?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}> = ({ title, icon, right, children, className = '', pad = true }) => (
  <section className={`spot-card ${pad ? 'spot-pad' : ''} ${className}`}>
    {title && (
      <header className={`flex items-center justify-between gap-2 ${pad ? 'mb-3' : 'spot-pad pb-0 mb-3'}`}>
        <h3 className="spot-title flex items-center gap-2 min-w-0">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        {right}
      </header>
    )}
    {children}
  </section>
);

const More: React.FC<{ onClick: () => void; children: React.ReactNode; color?: string }> = ({ onClick, children, color }) => (
  <button onClick={onClick} className="text-[11px] font-semibold hover:underline flex items-center gap-0.5 shrink-0" style={{ color: color || 'var(--spot-accent)' }}>
    {children} <ChevronRight className="w-3 h-3" />
  </button>
);

const Blank: React.FC<{ icon: React.ReactNode; text: string; action?: string; onAction?: () => void }> = ({ icon, text, action, onAction }) => (
  <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 p-3">
    <span className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[var(--spot-accent)] shrink-0">{icon}</span>
    <p className="text-xs text-zinc-400 flex-1">{text}</p>
    {action && onAction && (
      <Btn small variant="primary" onClick={onAction}>
        <Plus className="w-3.5 h-3.5" /> {action}
      </Btn>
    )}
  </div>
);

const STATUS: Record<string, [string, string]> = {
  online: ['Online', 'bg-emerald-400'],
  away: ['Away', 'bg-amber-400'],
  dnd: ['Do not disturb', 'bg-rose-500'],
  offline: ['Appearing offline', 'bg-zinc-500']
};

// ───────────────────────── left column ─────────────────────────

export const ProfileCard: React.FC<{ profile: StationProfile; onEdit: () => void; onCustomize: () => void; onAir?: string | null; stats: { songs: number; videos: number; games: number; books: number } }> = ({
  profile, onEdit, onCustomize, onAir, stats
}) => {
  const p2p = useP2P();
  const name = profile.displayName || profile.stationName || 'My Spot';
  const [label, dot] = STATUS[profile.statusMode] || STATUS.online;
  const friends = p2p.state?.friends || [];
  return (
    <section className="spot-card overflow-hidden">
      <div
        className="relative h-28 spot-grain"
        style={{ background: profile.banner ? `center/cover no-repeat url("${profile.banner}")` : 'linear-gradient(115deg, color-mix(in srgb, var(--spot-accent) 50%, transparent), #ff2e6e44 55%, #f9993c33)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50" />
        <button onClick={onEdit} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white" title="Edit profile">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {onAir && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#ff2e6e] text-white text-[10px] font-black tracking-wider">● ON AIR</span>}
      </div>
      <div className="spot-pad pt-0 -mt-12 relative">
        <button onClick={onEdit} className="relative rounded-[22px] p-1 bg-[#05080a] group" style={{ boxShadow: '0 0 0 2px var(--spot-accent), 0 0 26px var(--spot-glow)' }} title="Change your picture">
          <Art src={profile.avatar} title={name.slice(0, 2).toUpperCase()} className="w-24 h-24 rounded-[18px]" />
          <span className="absolute inset-1 rounded-[18px] bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">Change</span>
        </button>
        <h1 className="text-2xl font-bold text-white mt-2 leading-tight break-words">{name}</h1>
        <div className="text-xs font-mono text-zinc-500">
          {profile.handle || '@you'}
          {p2p.state ? `#${p2p.state.me.tag}` : ''}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
          <span className="flex items-center gap-1.5 text-zinc-300">
            <span className={`w-2 h-2 rounded-full ${dot}`} /> {label}
          </span>
          <NetworkBadge />
        </div>
        {profile.moodBlurb ? (
          <p className="text-[15px] text-white/90 mt-3 italic leading-snug">“{profile.moodBlurb}”</p>
        ) : (
          <button onClick={onEdit} className="text-xs text-zinc-500 hover:text-white mt-3">+ Say what’s on your mind</button>
        )}
        {onAir && <p className="text-xs text-[#ff2e6e] mt-2 truncate">On air: {onAir}</p>}
        {profile.bio && <p className="text-xs text-zinc-400 mt-2 whitespace-pre-line line-clamp-6">{profile.bio}</p>}
        <div className="grid grid-cols-4 gap-1 mt-4 text-center">
          {[
            ['Friends', friends.length],
            ['Songs', stats.songs],
            ['Videos', stats.videos],
            ['Games', stats.games]
          ].map(([l, n]) => (
            <div key={l as string} className="rounded-lg bg-white/[0.04] py-1.5">
              <div className="text-sm font-bold text-white">{n}</div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">{l}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Btn small variant="primary" onClick={() => p2p.setDialog({ type: 'invite' })}>
            <Ticket className="w-3.5 h-3.5" /> Invite
          </Btn>
          <Btn small onClick={onCustomize}>
            <Sliders className="w-3.5 h-3.5" /> Customize
          </Btn>
        </div>
      </div>
    </section>
  );
};

export const ReelCard: React.FC<{ reel: string[]; onEdit: () => void; go: (m: GoTo) => void }> = ({ reel, onEdit, go }) => (
  <Card title="Picture reel" icon={<ImageIcon className="w-4 h-4 text-[#ff7ad9]" />} right={<More onClick={() => go('gallery')} color="#ff7ad9">All pictures</More>}>
    {reel.length ? (
      <div className="grid grid-cols-3 gap-1.5">
        {reel.slice(0, 9).map((u, i) => (
          <div key={i} className="aspect-square rounded-lg overflow-hidden bg-black hover:scale-[1.04] transition-transform">
            <img src={u} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    ) : (
      <Blank icon={<ImageIcon className="w-5 h-5" />} text="Pin favourite pictures here from Pictures or your profile." action="Add" onAction={onEdit} />
    )}
  </Card>
);

export const ClockCard: React.FC<{ cfg?: LayoutConfig['clock'] }> = ({ cfg }) => {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <Card><div className="h-20" /></Card>;
  const h24 = !!cfg?.h24;
  if (cfg?.style === 'analog') {
    const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
    const hand = (deg: number, len: number, w: number, col: string) => (
      <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} stroke={col} strokeWidth={w} strokeLinecap="round" />
    );
    return (
      <Card>
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0">
            <circle cx="50" cy="50" r="47" fill="rgba(0,0,0,.35)" stroke="var(--spot-accent)" strokeWidth="2" />
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={i} x1="50" y1="7" x2="50" y2={i % 3 ? 11 : 14} stroke="#fff" strokeOpacity=".6" strokeWidth="2" transform={`rotate(${i * 30} 50 50)`} />
            ))}
            {hand(h * 30, 24, 4, '#fff')}
            {hand(m * 6, 34, 3, '#fff')}
            {hand(s * 6, 38, 1.5, 'var(--spot-accent)')}
            <circle cx="50" cy="50" r="3" fill="var(--spot-accent)" />
          </svg>
          <div>
            <div className="text-lg font-bold text-white">{now.toLocaleDateString(undefined, { weekday: 'long' })}</div>
            <div className="text-xs text-zinc-400">{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>
      </Card>
    );
  }
  const hh = h24 ? now.getHours() : now.getHours() % 12 || 12;
  return (
    <Card>
      <div className="flex items-baseline gap-2 font-mono tabular-nums leading-none" style={{ color: 'var(--spot-accent)', textShadow: '0 0 18px var(--spot-glow)' }}>
        <span className="text-5xl font-bold">
          {String(hh).padStart(2, '0')}
          <span className="animate-pulse">:</span>
          {String(now.getMinutes()).padStart(2, '0')}
        </span>
        <span className="text-lg">{String(now.getSeconds()).padStart(2, '0')}</span>
        {!h24 && <span className="text-xs text-zinc-400">{now.getHours() < 12 ? 'AM' : 'PM'}</span>}
      </div>
      <div className="text-xs text-zinc-400 mt-2 flex items-center gap-1.5">
        <ClockIcon className="w-3.5 h-3.5" /> {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </Card>
  );
};

export const NoteCard: React.FC<{ note?: LayoutConfig['note']; onSave?: (text: string) => void }> = ({ note, onSave }) => {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(note?.text || '');
  useEffect(() => setText(note?.text || ''), [note?.text]);
  const color = note?.color || '#ffcf33';
  return (
    <div className="relative rotate-[-1.2deg] hover:rotate-0 transition-transform" style={{ filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.45))' }}>
      <div className="p-4 pt-6 rounded-sm text-[#2a2208]" style={{ background: `linear-gradient(170deg, ${color}, color-mix(in srgb, ${color} 80%, #000))` }}>
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-white/40 rotate-2" />
        <StickyNote className="absolute top-2 right-2 w-4 h-4 opacity-40" />
        {edit ? (
          <textarea
            autoFocus
            value={text}
            maxLength={600}
            onChange={e => setText(e.target.value)}
            onBlur={() => {
              setEdit(false);
              if (text !== note?.text) onSave?.(text);
            }}
            className="w-full min-h-[110px] bg-transparent outline-none resize-none text-[15px] leading-snug font-medium"
          />
        ) : (
          <button onClick={() => onSave && setEdit(true)} className="w-full text-left whitespace-pre-line text-[15px] leading-snug font-medium min-h-[60px]" title={onSave ? 'Click to edit' : undefined}>
            {note?.text || 'Write something…'}
          </button>
        )}
      </div>
    </div>
  );
};

// ───────────────────────── centre column ─────────────────────────

export const MusicCard: React.FC<{ layout: LayoutConfig; tracks: Track[]; live: LiveBroadcast | null; go: (m: GoTo) => void; onAdd: () => void }> = ({ layout, tracks, live, go, onAdd }) => {
  const audio = useAudio();

  useEffect(() => {
    if (!audio.current && audio.queue.length === 0 && tracks.length > 0 && !live?.live) {
      audio.cueQueue(tracks as NowTrack[], 0, 'My library');
    }
  }, [audio.current, audio.queue.length, tracks, live?.live, audio.cueQueue]);

  return (
    <Card
      title={live?.live ? `On air: ${live.station?.name}` : 'My radio'}
      icon={<Headphones className="w-4 h-4 text-[#39ff88]" />}
      right={
        <div className="flex items-center gap-2">
          {live?.live && audio.mode !== 'live' && (
            <button onClick={() => audio.tuneInLive()} className="px-2.5 py-1 rounded-lg bg-[#ff2e6e] text-white text-[11px] font-bold flex items-center gap-1">
              <Radio className="w-3 h-3" /> Tune in
            </button>
          )}
          {tracks.length > 0 && (
            <>
              <button
                onClick={() => {
                  if (audio.isPlaying) audio.pause();
                  else if (audio.current) audio.toggle();
                  else audio.playQueue(tracks as NowTrack[], 0, 'All songs');
                }}
                className="px-2.5 py-1 rounded-lg bg-[var(--spot-accent)] text-black text-[11px] font-bold flex items-center gap-1 hover:brightness-110"
              >
                {audio.isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                {audio.isPlaying ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => audio.playQueue([...tracks].sort(() => Math.random() - 0.5) as NowTrack[], 0, 'Shuffle all')} className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[11px] font-bold flex items-center gap-1 hover:bg-white/20">
                <Shuffle className="w-3 h-3" /> Shuffle
              </button>
            </>
          )}
          <More onClick={() => go('radio')} color="#39ff88">Radio</More>
        </div>
      }
    >
      {!tracks.length && !live?.live ? (
        <Blank icon={<Music2 className="w-5 h-5" />} text="Add songs (MP3, FLAC, WAV, OGG, M4A) or drop them into content\audio, then make stations and go on air." action="Add music" onAction={onAdd} />
      ) : (
        <MusicDeck skin={layout.musicPlayerStyle} visualizer={layout.visualizerMode || 'spectrum'} showTools />
      )}
    </Card>
  );
};

export const ArcadeCard: React.FC<{ games: Game[]; go: (m: GoTo) => void; onRefresh?: () => void; preview?: boolean }> = ({ games, go, onRefresh, preview }) => {
  const [running, setRunning] = useState<Game | null>(null);
  const list = useMemo(
    () =>
      games
        .filter(g => (g.kind || 'game') === 'game')
        .sort((a, b) => String(b.lastPlayed || '').localeCompare(String(a.lastPlayed || '')) || (b.plays || 0) - (a.plays || 0)),
    [games]
  );
  const play = (g: Game) => {
    if (preview) return;
    setRunning(g);
    api('/api/games', { method: 'POST', json: { action: 'play', gameId: g.id } }).catch(() => {});
  };
  return (
    <Card title={`Arcade · ${list.length} games`} icon={<Gamepad2 className="w-4 h-4 text-[#39ff88]" />} right={<More onClick={() => go('arcade')} color="#39ff88">All games</More>}>
      {!list.length ? (
        <Blank icon={<Gamepad2 className="w-5 h-5" />} text="Install HTML5 games and apps, or drop a game folder into content\apps." action="Open Arcade" onAction={() => go('arcade')} />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {list.slice(0, 8).map(g => (
            <button key={g.id} onClick={() => play(g)} className="group text-left">
              <Art src={g.thumbnail} title={g.title} className="aspect-[4/3] rounded-xl border border-white/5 group-hover:border-[#39ff88]/70 group-hover:scale-[1.03] transition-all">
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                  <span className="w-10 h-10 rounded-full bg-[#39ff88] text-black flex items-center justify-center">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </span>
                </span>
                {!!g.best && (
                  <span className="absolute bottom-1 right-1 px-1.5 rounded bg-black/70 text-[9px] font-mono font-bold text-[#ffcf33] flex items-center gap-0.5">
                    <Trophy className="w-2.5 h-2.5" />
                    {g.best.toLocaleString()}
                  </span>
                )}
              </Art>
              <div className="text-[11px] font-semibold text-white truncate mt-1">{g.title}</div>
            </button>
          ))}
        </div>
      )}
      {running && <AppRunner app={running} onClose={() => setRunning(null)} onScore={onRefresh} />}
    </Card>
  );
};

export const LibraryCard: React.FC<{ books: Book[]; go: (m: GoTo) => void; onAdd: () => void; preview?: boolean }> = ({ books, go, onAdd, preview }) => {
  const [reading, setReading] = useState<Book | null>(null);
  const going = books.filter(b => b.progress && b.progress.percent > 0 && b.progress.percent < 0.99).sort((a, b) => String(b.progress?.updatedAt).localeCompare(String(a.progress?.updatedAt)));
  const recent = [...books].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const shelf = [...going, ...recent.filter(b => !going.includes(b))].slice(0, 6);
  return (
    <Card title="Library" icon={<BookOpen className="w-4 h-4 text-[#ffcf33]" />} right={<More onClick={() => go('library')} color="#ffcf33">All books</More>}>
      {!books.length ? (
        <Blank icon={<BookOpen className="w-5 h-5" />} text="E-books, poems and comics (EPUB, PDF, TXT, MD, CBZ, CBR)." action="Add books" onAction={onAdd} />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {shelf.map(b => (
            <button key={b.id} onClick={() => !preview && setReading(b)} className="group text-left">
              <Art src={b.cover} title={b.title} className="aspect-[2/3] rounded-lg border border-white/5 group-hover:border-[#ffcf33]/70 group-hover:-translate-y-1 transition-all shadow-lg">
                {b.progress && b.progress.percent > 0 && (
                  <span className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                    <span className="block h-full bg-[#ffcf33]" style={{ width: `${Math.round(b.progress.percent * 100)}%` }} />
                  </span>
                )}
              </Art>
              <div className="text-[11px] text-white truncate mt-1">{b.series && b.issue ? `${b.series} #${b.issue}` : b.title}</div>
            </button>
          ))}
        </div>
      )}
      {reading && <Reader book={reading} onClose={() => setReading(null)} />}
    </Card>
  );
};

// ───────────────────────── right column ─────────────────────────

/** Who's around: on air, listening, online. One click to join in. */
export const FriendsNowCard: React.FC<{ go: (m: GoTo) => void }> = ({ go }) => {
  const p2p = useP2P();
  const audio = useAudio();
  const friends = (p2p.state?.friends || []).filter(f => f.online && (f.live || f.nowPlaying));
  const parties = (p2p.state?.parties || []).filter(p => p.status === 'invited');
  const total = p2p.state?.friends.length || 0;
  return (
    <Card title="Friends right now" icon={<Sparkles className="w-4 h-4 text-[var(--spot-accent)]" />} right={<More onClick={() => go('radio')} color="#ffb347">Radio Dial</More>}>
      <div className="space-y-2">
        {parties.map(p => (
          <div key={p.id} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#f9993c]/20 to-[#ff2e6e]/10 border border-[#f9993c]/40 p-2.5">
            <Clapperboard className="w-4 h-4 text-[#f9993c] shrink-0" />
            <div className="min-w-0 flex-1 text-xs text-white">
              <b>{p.hostName}</b> invited you to watch <b>{p.title}</b>
            </div>
            <Btn small variant="primary" onClick={() => p2p.joinParty(p.id)}>Join</Btn>
          </div>
        ))}
        {!total ? (
          <Blank icon={<Ticket className="w-5 h-5" />} text="Send someone a one-time invite. You choose exactly what they see." action="Invite" onAction={() => p2p.setDialog({ type: 'invite' })} />
        ) : !friends.length && !parties.length ? (
          <p className="text-xs text-zinc-500">Nobody’s on air or playing music right now.</p>
        ) : (
          friends.map(f => {
            const along = p2p.alongWith === f.key;
            const tuned = audio.mode === 'live' && audio.liveUrl === `/api/p2p/peer/${f.key}/live`;
            return (
              <div key={f.key} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] p-2">
                <button onClick={() => p2p.setVisit(f.key)} className="shrink-0">
                  <Art src={f.live?.coverUrl || f.nowPlaying?.coverUrl || f.avatar} title={f.name.slice(0, 2)} className="w-10 h-10 rounded-lg" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">{f.name}</div>
                  {f.live && <div className="text-[11px] text-[#ff2e6e] truncate">● On air · {f.live.station}</div>}
                  {f.nowPlaying && (
                    <div className="text-[11px] text-emerald-300 truncate flex items-center gap-1">
                      {f.nowPlaying.playing && <span className="eq-bars h-2 inline-flex items-end"><span /><span /><span /></span>}
                      <span className="text-[9px] font-black tracking-wider text-emerald-400/80">LISTENING</span>
                      <span className="truncate">{f.nowPlaying.title}</span>
                    </div>
                  )}
                </div>
                {f.live && (
                  <button onClick={() => (tuned ? audio.leaveLive() : audio.tuneInLive(`/api/p2p/peer/${f.key}/live`))} className={`w-8 h-8 rounded-full flex items-center justify-center ${tuned ? 'bg-[#ff2e6e] text-white' : 'bg-white/10 text-white hover:bg-white/20'}`} title={tuned ? 'Stop' : 'Tune in'}>
                    <Radio className="w-4 h-4" />
                  </button>
                )}
                {f.nowPlaying && (
                  <button onClick={() => p2p.listenAlong(along ? null : f.key)} className={`w-8 h-8 rounded-full flex items-center justify-center ${along ? 'bg-emerald-400 text-black' : 'bg-white/10 text-white hover:bg-white/20'}`} title={along ? 'Stop listening along' : 'Listen along'}>
                    <Headphones className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
};

export const FriendsCard: React.FC<{ go: (m: GoTo) => void }> = ({ go }) => {
  const p2p = useP2P();
  const friends = p2p.state?.friends || [];
  const requests = p2p.state?.requests.incoming || [];
  return (
    <Card
      title={`Friends · ${friends.filter(f => f.online).length}/${friends.length} online`}
      icon={<Users className="w-4 h-4 text-[#ff2e6e]" />}
      right={
        <button onClick={() => p2p.setDialog({ type: 'invite' })} className="text-[11px] font-semibold text-[var(--spot-accent)] hover:underline flex items-center gap-1">
          <Ticket className="w-3.5 h-3.5" /> Invite
        </button>
      }
    >
      {requests.length > 0 && (
        <button onClick={() => p2p.setDialog({ type: 'review', key: requests[0].key })} className="w-full mb-2 flex items-center gap-2 rounded-xl bg-[#ff2e6e]/15 border border-[#ff2e6e]/40 px-3 py-2 text-left text-xs text-white">
          <span className="w-5 h-5 rounded-full bg-[#ff2e6e] text-[10px] font-bold flex items-center justify-center">{requests.length}</span>
          Friend request{requests.length > 1 ? 's' : ''} waiting: review
        </button>
      )}
      {!friends.length ? (
        <p className="text-xs text-zinc-500">No friends yet. Invite someone with a one-time link.</p>
      ) : (
        <div className="-mx-1.5 space-y-0.5 max-h-[340px] overflow-y-auto">
          {friends.map(f => (
            <FriendRow key={f.key} f={f} />
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <More onClick={() => go('feed')}>Friends page</More>
      </div>
    </Card>
  );
};

export const FeedCard: React.FC<{ tracks: Track[]; videos: Video[]; go: (m: GoTo) => void }> = ({ tracks, videos, go }) => {
  const p2p = useP2P();
  const posts = p2p.feed.slice(0, 6);
  return (
    <Card title="Friend feed" icon={<Newspaper className="w-4 h-4 text-[#ff2e6e]" />} right={<More onClick={() => go('feed')}>Everything</More>}>
      <Composer tracks={tracks} videos={videos} bare />
      <div className="mt-2">
        {posts.length ? posts.map(p => <PostCard key={`${p.author}_${p.id}`} post={p} bare />) : <p className="text-xs text-zinc-500 pt-3">No posts yet. Say hi to your friends!</p>}
      </div>
    </Card>
  );
};

export const TVCard: React.FC<{ hasVideos: boolean; onAdd: () => void; children: React.ReactNode }> = ({ hasVideos, onAdd, children }) =>
  hasVideos ? (
    <>{children}</>
  ) : (
    <Card title="Spot TV" icon={<Film className="w-4 h-4 text-[#f9993c]" />}>
      <Blank icon={<Film className="w-5 h-5" />} text="Add movies, shows or clips (MP4, WebM, MKV), then watch them together in a watch party." action="Add video" onAction={onAdd} />
    </Card>
  );
