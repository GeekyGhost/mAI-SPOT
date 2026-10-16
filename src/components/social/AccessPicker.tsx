'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RadioTower, ListMusic, Tv, Layers, Images, Gamepad2, BookOpen, GalleryHorizontal, ChevronDown, Clock, Loader2, Boxes } from 'lucide-react';
import type { Grants, ShareKind, Shareables } from '@/lib/p2pTypes';
import { SHARE_KINDS, untilLabel } from '@/lib/p2pTypes';
import { api } from '@/lib/client';
import { Art } from '@/components/ui/kit';

export const KIND_ICON: Record<ShareKind, React.ComponentType<{ className?: string }>> = {
  station: RadioTower,
  playlist: ListMusic,
  channel: Tv,
  collection: Layers,
  album: Images,
  app: Gamepad2,
  book: BookOpen,
  model: Boxes,
  reel: GalleryHorizontal
};

export const DURATIONS: { label: string; ms: number }[] = [
  { label: 'Always', ms: 0 },
  { label: '1 hour', ms: 3600e3 },
  { label: '1 day', ms: 86400e3 },
  { label: '1 week', ms: 7 * 86400e3 },
  { label: '30 days', ms: 30 * 86400e3 }
];

const grantFor = (ms: number) => (ms ? { until: Date.now() + ms } : {});
export const EVERYTHING = ['station:*', 'playlist:*', 'channel:*', 'collection:*', 'album:*', 'app:*', 'book:*', 'model:*', 'reel'];
export const toGrants = (ids: string[]): Grants => Object.fromEntries(ids.map(id => [id, {}]));

let cache: { at: number; items: Shareables } | null = null;
export function useShareables() {
  const [items, setItems] = useState<Shareables | null>(cache?.items || null);
  useEffect(() => {
    if (cache && Date.now() - cache.at < 15000) return;
    api('/api/p2p/shareables')
      .then(d => {
        cache = { at: Date.now(), items: d.items };
        setItems(d.items);
      })
      .catch(() => setItems({ station: [], playlist: [], channel: [], collection: [], album: [], app: [], book: [], model: [], reel: [] }));
  }, []);
  return items;
}

/** How long one grant lasts: "Always", or a time from now. */
const DurationSelect: React.FC<{ until?: number; onChange: (ms: number) => void; small?: boolean }> = ({ until, onChange, small }) => (
  <label className={`inline-flex items-center gap-1 ${until ? 'text-amber-300' : 'text-zinc-500'} ${small ? 'text-[10px]' : 'text-xs'}`} onClick={e => e.stopPropagation()}>
    <Clock className="w-3 h-3" />
    <select
      value={until ? 'keep' : '0'}
      onChange={e => e.target.value !== 'keep' && onChange(Number(e.target.value))}
      className="bg-transparent outline-none cursor-pointer hover:text-white"
      aria-label="How long"
    >
      {until && <option value="keep">{untilLabel(until)}</option>}
      {DURATIONS.map(d => (
        <option key={d.label} value={d.ms} className="bg-[#0b1216]">
          {d.ms ? `for ${d.label}` : 'Always'}
        </option>
      ))}
    </select>
  </label>
);

/**
 * Pick exactly what one friend (or an invite, or your defaults) can see: whole categories, including
 * anything added later, or item by item — each optionally for a limited time.
 */
export const AccessPicker: React.FC<{ value: Grants; onChange: (g: Grants) => void; defaults?: string[]; compact?: boolean }> = ({ value, onChange, defaults, compact }) => {
  const items = useShareables();
  const [open, setOpen] = useState<ShareKind | null>(null);
  const [lasts, setLasts] = useState(0);
  const set = (id: string, on: boolean, ms = lasts) => {
    const next = { ...value };
    if (on) next[id] = grantFor(ms);
    else delete next[id];
    onChange(next);
  };
  const count = useMemo(() => {
    const out: Partial<Record<ShareKind, number>> = {};
    for (const k of SHARE_KINDS) out[k.kind] = Object.keys(value).filter(id => id.startsWith(`${k.kind}:`) && !id.endsWith(':*')).length;
    return out;
  }, [value]);

  if (!items) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400 py-6 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your library…
      </div>
    );
  }

  const presets: [string, Grants][] = [
    ['Everything', toGrants(EVERYTHING)],
    ['Nothing yet', {}],
    ...(defaults ? ([['My usual', toGrants(defaults)]] as [string, Grants][]) : [])
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {presets.map(([label, g]) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange(g)}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:border-white/30"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
          New picks last
          <select value={lasts} onChange={e => setLasts(Number(e.target.value))} className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-white outline-none">
            {DURATIONS.map(d => (
              <option key={d.label} value={d.ms}>
                {d.label.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={`rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden ${compact ? '' : 'bg-black/20'}`}>
        {SHARE_KINDS.map(({ kind, plural }) => {
          const Icon = KIND_ICON[kind];
          const list = items[kind] || [];
          if (kind === 'reel') {
            const g = value.reel;
            return (
              <div key={kind} className="flex items-center gap-3 px-3 py-2.5">
                <Icon className="w-4 h-4 text-[var(--spot-accent)] shrink-0" />
                <label className="flex-1 flex items-center gap-2 text-sm text-white cursor-pointer">
                  <input type="checkbox" checked={!!g} onChange={e => set('reel', e.target.checked)} className="accent-[var(--spot-accent)] w-4 h-4" />
                  {plural}
                  <span className="text-[11px] text-zinc-500">{list[0]?.note}</span>
                </label>
                {g && <DurationSelect small until={g.until} onChange={ms => set('reel', true, ms)} />}
              </div>
            );
          }
          const all = value[`${kind}:*`];
          const n = count[kind] || 0;
          const isOpen = open === kind;
          return (
            <div key={kind}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <button type="button" onClick={() => setOpen(isOpen ? null : kind)} className="flex-1 flex items-center gap-3 text-left min-w-0" aria-expanded={isOpen}>
                  <Icon className="w-4 h-4 text-[var(--spot-accent)] shrink-0" />
                  <span className="text-sm text-white font-semibold">{plural}</span>
                  <span className={`text-[11px] ${all || n ? 'text-emerald-300' : 'text-zinc-500'}`}>
                    {all ? 'all, including new ones' : n ? `${n} of ${list.length}` : list.length ? 'none' : 'you have none yet'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {all && <DurationSelect small until={all.until} onChange={ms => set(`${kind}:*`, true, ms)} />}
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer shrink-0" title="Everything in this category, including things you add later">
                  All
                  <input type="checkbox" checked={!!all} onChange={e => set(`${kind}:*`, e.target.checked)} className="accent-[var(--spot-accent)] w-4 h-4" />
                </label>
              </div>
              {isOpen && (
                <div className="pb-2 px-2 max-h-64 overflow-y-auto">
                  {!list.length && <p className="text-xs text-zinc-500 px-2 py-2">Nothing here yet.</p>}
                  {list.map((it, i) => {
                    const id = `${kind}:${it.id}`;
                    const g = value[id];
                    const groupHead = it.group && it.group !== list[i - 1]?.group;
                    return (
                      <React.Fragment key={id}>
                        {groupHead && <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 pt-2">{it.group}</div>}
                        <label className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/5 ${all ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={!!g || !!all}
                            disabled={!!all}
                            onChange={e => set(id, e.target.checked)}
                            className="accent-[var(--spot-accent)] w-4 h-4 shrink-0"
                          />
                          <Art src={it.cover} title={it.name} className="w-8 h-8 rounded-md shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-white truncate">{it.name}</span>
                            <span className="block text-[11px] text-zinc-500 truncate">{it.note}</span>
                          </span>
                          {g && !all && <DurationSelect small until={g.until} onChange={ms => set(id, true, ms)} />}
                        </label>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** One line, like the node's summary: "2 stations · all videos · 1 album". */
export function describeGrants(g: Grants): string {
  const now = Date.now();
  const live = (x?: { until?: number }) => !!x && (!x.until || x.until > now);
  const parts: string[] = [];
  for (const { kind, plural, label } of SHARE_KINDS) {
    if (kind === 'reel') {
      if (live(g.reel)) parts.push('picture reel');
      continue;
    }
    if (live(g[`${kind}:*`])) parts.push(`all ${plural.toLowerCase()}`);
    else {
      const n = Object.entries(g).filter(([id, v]) => id.startsWith(`${kind}:`) && live(v)).length;
      if (n) parts.push(`${n} ${n === 1 ? label.toLowerCase() : plural.toLowerCase()}`);
    }
  }
  return parts.join(' · ') || 'nothing yet';
}
