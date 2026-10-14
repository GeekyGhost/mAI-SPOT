'use client';

import { createPortal } from 'react-dom';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Gamepad2, AppWindow, Play, Search, Upload, X, RotateCcw, Maximize, ShieldCheck, Heart, Pause
} from 'lucide-react';
import { Pencil as PencilIcon } from 'lucide-react';
import { useP2P } from '@/components/social/P2PProvider';
import type { Game, AppKind } from '@/lib/types';
import { GAME_GENRES, APP_CATEGORIES } from '@/lib/types';
import { api } from '@/lib/client';
import { soundFX } from '@/components/sound/SoundFX';
import { Modal, Field, inputCls, Btn, Chip, Menu, Art, ImagePicker, Empty } from '@/components/ui/kit';

interface Props {
  games: Game[];
  onRefresh: () => void;
  onUpload: () => void;
  /** Opens the Library Manager to edit details and artwork. */
  onManage?: () => void;
}

export const ArcadeTab: React.FC<Props> = ({ games, onRefresh, onUpload, onManage }) => {
  const p2p = useP2P();
  const [kind, setKind] = useState<AppKind>('game');
  const [filter, setFilter] = useState<string>('');
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState<Game | null>(null);
  const [editing, setEditing] = useState<Game | null>(null);

  const items = games.filter(g => (g.kind || 'game') === kind);
  const groupKey = (g: Game) => (kind === 'game' ? g.genre || 'Arcade' : g.category || 'Utilities');
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(g => m.set(groupKey(g), (m.get(groupKey(g)) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, kind]);

  const q = query.trim().toLowerCase();
  const shown = items.filter(
    g => (!filter || groupKey(g) === filter) && (!q || [g.title, g.description, groupKey(g)].some(s => s?.toLowerCase().includes(q)))
  );

  const launch = (g: Game) => {
    setRunning(g);
    soundFX.playCoin();
    api('/api/games', { method: 'POST', json: { action: 'play', gameId: g.id } }).catch(() => {});
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-[#39ff88]" /> Arcade & Apps
          </h1>
          <p className="text-sm text-[#649fae] flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-[#39ff88]" /> HTML5, Canvas and WASM games and apps hosted on your Spot. Each runs sandboxed and can only touch its own files.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onManage && (
            <Btn onClick={onManage} title="Edit titles, tags and cover art">
              <PencilIcon className="w-4 h-4" /> Edit library
            </Btn>
          )}
          <Btn variant="primary" onClick={onUpload}>
            <Upload className="w-4 h-4" /> Install game or app
          </Btn>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-black/40 rounded-xl p-1 border border-white/10">
          {(
            [
              ['game', 'Games', Gamepad2],
              ['app', 'Apps', AppWindow]
            ] as [AppKind, string, React.ComponentType<{ className?: string }>][]
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setFilter('');
              }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold ${kind === k ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              <Icon className="w-4 h-4" /> {label}
              <span className={kind === k ? 'text-black/50' : 'text-zinc-600'}>{games.filter(g => (g.kind || 'game') === k).length}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${kind === 'game' ? 'games' : 'apps'}`} className={`${inputCls} pl-9 w-56`} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={!filter} onClick={() => setFilter('')} count={items.length}>
          {kind === 'game' ? 'All genres' : 'All categories'}
        </Chip>
        {groups.map(([g, n]) => (
          <Chip key={g} active={filter === g} onClick={() => setFilter(g)} count={n}>
            {g}
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty icon={kind === 'game' ? <Gamepad2 className="w-10 h-10" /> : <AppWindow className="w-10 h-10" />} title={kind === 'game' ? 'No games here yet' : 'No apps here yet'}>
          Install a <b>.zip</b> with an <code>index.html</code> (Phaser, Godot web export, PICO-8, Construct, plain Canvas…) or a single <b>.html</b> file. You can also drop a folder into <code className="text-white">content\apps</code>.
        </Empty>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {shown.map(g => (
            <div key={g.id} className="group rounded-2xl overflow-hidden border border-[#1a323c] bg-[#0b1216] hover:border-[#39ff88]/60 transition-colors">
              <Art src={g.thumbnail} title={g.title} className="aspect-[4/3] cursor-pointer">
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" onClick={() => launch(g)} />
                <button onClick={() => launch(g)} className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-[#39ff88] text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_25px_rgba(57,255,136,0.5)]">
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </button>
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 text-[10px] font-bold text-[#39ff88]">{groupKey(g)}</span>
                {!!g.best && <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 text-[10px] font-mono font-bold text-[#ffcf33]">★ {g.best.toLocaleString()}</span>}
              </Art>
              <div className="p-3">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => launch(g)}>
                    <h3 className="font-bold text-white truncate group-hover:text-[#39ff88] transition-colors">{g.title}</h3>
                    <p className="text-xs text-zinc-500 line-clamp-2 min-h-[2rem]">{g.description || ' '}</p>
                  </div>
                  <Menu
                    items={[
                      { label: 'Share with friends…', onClick: () => p2p.setDialog({ type: 'share', rid: `app:${g.id}`, name: g.title }) },
                      { label: 'Edit details', onClick: () => setEditing(g) },
                      { label: `Move to ${g.kind === 'app' ? 'Games' : 'Apps'}`, onClick: async () => { await api('/api/games', { method: 'POST', json: { action: 'update', id: g.id, kind: g.kind === 'app' ? 'game' : 'app' } }); onRefresh(); } },
                      {
                        label: 'Uninstall',
                        danger: true,
                        onClick: async () => {
                          if (!confirm(`Uninstall “${g.title}”? Its folder in content\\apps is deleted.`)) return;
                          await api(`/api/games?id=${g.id}`, { method: 'DELETE' });
                          onRefresh();
                        }
                      }
                    ]}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-zinc-500">
                  <span>{g.plays} plays</span>
                  <button
                    onClick={async () => {
                      await api('/api/games', { method: 'POST', json: { action: 'react', id: g.id, type: 'like' } });
                      onRefresh();
                    }}
                    className="flex items-center gap-1 hover:text-[#ff2e6e]"
                  >
                    <Heart className="w-3.5 h-3.5" /> {g.likes}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {running && <AppRunner app={running} onClose={() => setRunning(null)} onScore={onRefresh} />}
      {editing && <AppEditor app={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onRefresh(); }} />}
    </div>
  );
};

/** Full-screen sandboxed runner. Esc (or the game's own ESC message) opens the pause menu. */
export const AppRunner: React.FC<{ app: Game; onClose: () => void; onScore?: () => void; readOnly?: boolean }> = ({ app, onClose, onScore, readOnly }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(0);
  const [menu, setMenu] = useState(false);
  const [best, setBest] = useState(app.best || 0);
  const [newBest, setNewBest] = useState(false);
  const bestRef = useRef(best);
  bestRef.current = best;
  const lastEsc = useRef(0);
  const isGame = (app.kind || 'game') === 'game';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (isGame && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') {
        e.preventDefault();
        setMenu(m => !m);
      }
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const t = e.data?.type;
      if (t === 'ARCADE_ESC') {
        // Some games announce Esc themselves as well as through the kit: count it once.
        if (Date.now() - lastEsc.current > 250) setMenu(m => !m);
        lastEsc.current = Date.now();
      } else if (t === 'ARCADE_READY') {
        frameRef.current?.contentWindow?.postMessage({ type: 'ARCADE_INIT', best: bestRef.current }, '*');
      } else if (t === 'ARCADE_SCORE' && !readOnly) {
        const score = Math.max(0, Math.floor(Number(e.data.score) || 0));
        if (score > bestRef.current) {
          setBest(score);
          setNewBest(true);
          setTimeout(() => setNewBest(false), 3500);
        }
        fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'score', id: app.id, score }) })
          .then(() => onScore?.())
          .catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('message', onMsg);
    const t = setTimeout(() => frameRef.current?.focus(), 200);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('message', onMsg);
    };
  }, [isGame]);

  const refocus = () => setTimeout(() => frameRef.current?.focus(), 100);

  return createPortal(
    <div ref={wrapRef} className="fixed inset-0 z-[70] bg-[#030608] flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-[#1a323c] bg-[#080f12]">
        <div className="min-w-0">
          <div className="text-white font-bold truncate">{app.title}</div>
          {app.controlsHelp && <div className="text-[11px] text-zinc-500 truncate">{app.controlsHelp} · Esc for menu</div>}
        </div>
        {isGame && !readOnly && (
          <div className={`ml-auto mr-2 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${newBest ? 'bg-[#ffcf33] text-black scale-110' : 'bg-white/5 text-[#ffcf33]'}`}>
            {newBest ? '★ NEW BEST ' : 'BEST '}
            {best.toLocaleString()}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => { setKey(k => k + 1); refocus(); }} className="p-2 text-zinc-400 hover:text-white" title="Restart">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrapRef.current?.requestFullscreen())?.catch?.(() => {})} className="p-2 text-zinc-400 hover:text-white" title="Fullscreen">
            <Maximize className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="relative flex-1">
        <iframe
          key={key}
          ref={frameRef}
          src={app.entryPoint}
          title={app.title}
          className="absolute inset-0 w-full h-full border-0 bg-black"
          // No allow-same-origin: the app gets an opaque origin and can't reach this Spot's data.
          sandbox="allow-scripts allow-pointer-lock allow-downloads"
          allow="fullscreen; gamepad; autoplay"
        />
        {menu && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur flex items-center justify-center">
            <div className="w-72 bg-[#0b1216] border border-[#39ff88]/50 rounded-2xl p-5 text-center space-y-2 shadow-[0_0_40px_rgba(57,255,136,0.2)]">
              <Pause className="w-8 h-8 mx-auto text-[#39ff88]" />
              <div className="text-white font-black">Paused</div>
              <Btn variant="primary" className="w-full" onClick={() => { setMenu(false); refocus(); }}>Resume</Btn>
              <Btn className="w-full" onClick={() => { setMenu(false); setKey(k => k + 1); refocus(); }}>Restart</Btn>
              <Btn variant="danger" className="w-full" onClick={onClose}>Exit</Btn>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export const AppEditor: React.FC<{ app: Game; onClose: () => void; onSaved: () => void }> = ({ app, onClose, onSaved }) => {
  const [g, setG] = useState<Game>({ ...app, kind: app.kind || 'game' });
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit details"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={async () => {
              await api('/api/games', {
                method: 'POST',
                json: { action: 'update', id: g.id, title: g.title, description: g.description, kind: g.kind, genre: g.genre, category: g.category, controlsHelp: g.controlsHelp, thumbnail: g.thumbnail }
              });
              onSaved();
            }}
          >
            Save
          </Btn>
        </>
      }
    >
      <Field label="Title">
        <input className={inputCls} value={g.title} onChange={e => setG({ ...g, title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className={inputCls} value={g.kind} onChange={e => setG({ ...g, kind: e.target.value as AppKind })}>
            <option value="game">Game</option>
            <option value="app">App</option>
          </select>
        </Field>
        {g.kind === 'game' ? (
          <Field label="Genre">
            <input className={inputCls} list="game-genres" value={g.genre} onChange={e => setG({ ...g, genre: e.target.value })} />
            <datalist id="game-genres">{GAME_GENRES.map(x => <option key={x} value={x} />)}</datalist>
          </Field>
        ) : (
          <Field label="Category">
            <input className={inputCls} list="app-cats" value={g.category || ''} onChange={e => setG({ ...g, category: e.target.value })} />
            <datalist id="app-cats">{APP_CATEGORIES.map(x => <option key={x} value={x} />)}</datalist>
          </Field>
        )}
      </div>
      <Field label="Description">
        <textarea className={inputCls} rows={2} value={g.description} onChange={e => setG({ ...g, description: e.target.value })} />
      </Field>
      <Field label="Controls / how to use">
        <input className={inputCls} value={g.controlsHelp} onChange={e => setG({ ...g, controlsHelp: e.target.value })} />
      </Field>
      <ImagePicker value={g.thumbnail} onChange={url => setG({ ...g, thumbnail: url })} label="Thumbnail" aspect="aspect-[4/3]" />
    </Modal>
  );
};

