'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, EyeOff, Plus, LayoutGrid, Palette, Check, X, Sparkles } from 'lucide-react';
import type { LayoutConfig, SectionKey, SpotColumn, SpotLook, StationProfile, StationTheme, Track, Video, Game, Book, LiveBroadcast } from '@/lib/types';
import { SpotTV } from './SpotTV';
import {
  GoTo, ProfileCard, ReelCard, ClockCard, NoteCard, MusicCard, ArcadeCard, LibraryCard, FriendsNowCard, FriendsCard, FeedCard, TVCard
} from './Widgets';
import { SECTION_INFO, COLUMN_LABEL, ACCENTS, PRESETS, lookOf, columnsView, hiddenOf, moveWithin, moveTo, setShown, neighbourColumns } from './layoutModel';
import type { UploadTab } from '@/components/studio/UploadModal';

export interface SpotData {
  tracks: Track[];
  videos: Video[];
  games: Game[];
  books: Book[];
  live: LiveBroadcast | null;
  videoGenres: string[];
}

export interface SpotActions {
  editProfile: () => void;
  customize: () => void;
  go: (m: GoTo) => void;
  upload: (t: UploadTab) => void;
  saveLayout?: (l: LayoutConfig) => void;
  saveAccent?: (hex: string) => void;
  refresh?: () => void;
}

const WIDTHS: Record<SpotLook['widths'], string> = {
  balanced: 'minmax(260px,300px) minmax(0,1fr) minmax(290px,340px)',
  'wide-center': 'minmax(230px,260px) minmax(0,1fr) minmax(260px,300px)',
  'wide-sides': 'minmax(300px,340px) minmax(0,1fr) minmax(320px,380px)'
};

/** Animated backdrop behind the Spot page. */
export const SpotBackground: React.FC<{ kind: SpotLook['background']; preview?: boolean }> = ({ kind, preview }) => {
  if (kind === 'none') return null;
  return (
    <div className={`spot-bg spot-bg-${kind} ${preview ? 'in-preview' : ''}`} aria-hidden>
      {kind === 'bubbles' &&
        Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 37) % 100}%`,
              width: 20 + ((i * 29) % 70),
              height: 20 + ((i * 29) % 70),
              animationDuration: `${14 + ((i * 7) % 16)}s`,
              animationDelay: `${-((i * 5) % 20)}s`
            }}
          />
        ))}
    </div>
  );
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/**
 * The home page: three columns of widgets (you · your media · your friends) that the owner can
 * rearrange in place, restyle with one click, or switch to a preset. Collapses to two columns on
 * tablets and a single stack on phones.
 */
export const SpotLayout: React.FC<{
  layout: LayoutConfig;
  theme: StationTheme;
  profile: StationProfile;
  data: SpotData;
  on: SpotActions;
  customCss?: string;
  /** Rendered inside Studio: no fixed background, no toolbar, media cards don't launch. */
  preview?: boolean;
  /** Force arrange mode on (Studio designer). */
  arrange?: boolean;
  /** Lay out as if this many pixels wide (Studio preview). */
  width?: number;
}> = ({ layout, theme, profile, data, on, customCss, preview, arrange: forceArrange, width }) => {
  const root = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1400);
  const [arrangeOn, setArrange] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const arrange = !!(forceArrange || arrangeOn) && !!on.saveLayout;
  const look = lookOf(layout);
  const cols = useMemo(() => columnsView(layout), [layout]);
  const hidden = useMemo(() => hiddenOf(layout), [layout]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const save = (l: LayoutConfig) => on.saveLayout?.(l);
  const name = (profile.displayName || profile.stationName || '').split(' ')[0];

  const widget = (s: SectionKey): React.ReactNode => {
    switch (s) {
      case 'profile':
        return (
          <ProfileCard
            profile={profile}
            onEdit={on.editProfile}
            onCustomize={on.customize}
            onAir={data.live?.live ? data.live.station?.name : null}
            stats={{ songs: data.tracks.length, videos: data.videos.length, games: data.games.filter(g => (g.kind || 'game') === 'game').length, books: data.books.length }}
          />
        );
      case 'pictures':
        return <ReelCard reel={profile.pictureReel || []} onEdit={on.editProfile} go={on.go} />;
      case 'clock':
        return <ClockCard cfg={layout.clock} />;
      case 'note':
        return <NoteCard note={layout.note} onSave={on.saveLayout ? text => save({ ...layout, note: { color: layout.note?.color || '#ffcf33', text } }) : undefined} />;
      case 'video':
        return (
          <TVCard hasVideos={data.videos.length > 0} onAdd={() => on.upload('video')}>
            <SpotTV videos={data.videos} look={layout.videoPlayerStyle} genres={data.videoGenres} onOpenCinema={() => on.go('cinema')} />
          </TVCard>
        );
      case 'music':
        return <MusicCard layout={layout} tracks={data.tracks} live={data.live} go={on.go} onAdd={() => on.upload('audio')} />;
      case 'arcade':
        return <ArcadeCard games={data.games} go={on.go} onRefresh={on.refresh} preview={preview} />;
      case 'library':
        return <LibraryCard books={data.books} go={on.go} onAdd={() => on.upload('book')} preview={preview} />;
      case 'thoughts':
        return <FriendsNowCard go={on.go} />;
      case 'friends':
        return <FriendsCard go={on.go} />;
      case 'feed':
        return <FeedCard tracks={data.tracks} videos={data.videos} go={on.go} />;
    }
  };

  const slot = (s: SectionKey, col: SpotColumn, i: number, n: number) => {
    if (!arrange) return <div key={s} data-widget={s}>{widget(s)}</div>;
    const nb = neighbourColumns(col);
    const ctl = 'w-7 h-7 rounded-lg flex items-center justify-center bg-black/70 text-white hover:bg-[var(--spot-accent)] hover:text-black disabled:opacity-25 disabled:hover:bg-black/70 disabled:hover:text-white';
    return (
      <div key={s} data-widget={s} className="relative rounded-[calc(var(--panel-radius)+6px)] outline-2 outline-dashed outline-[color-mix(in_srgb,var(--spot-accent)_55%,transparent)] outline-offset-4">
        <div className="absolute -top-3 left-3 right-3 z-20 flex items-center gap-1 px-1.5 py-1 rounded-xl bg-[#05080a]/95 border border-white/10 shadow-xl">
          <span className="text-[11px] font-bold text-white truncate flex-1 px-1">
            {SECTION_INFO[s].emoji} {SECTION_INFO[s].label}
          </span>
          <button className={ctl} disabled={!nb.left} onClick={() => nb.left && save(moveTo(layout, s, nb.left))} title={nb.left ? `Move to ${COLUMN_LABEL[nb.left]} column` : undefined} aria-label="Move left">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button className={ctl} disabled={i === 0} onClick={() => save(moveWithin(layout, s, -1))} title="Move up" aria-label="Move up">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button className={ctl} disabled={i === n - 1} onClick={() => save(moveWithin(layout, s, 1))} title="Move down" aria-label="Move down">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button className={ctl} disabled={!nb.right} onClick={() => nb.right && save(moveTo(layout, s, nb.right))} title={nb.right ? `Move to ${COLUMN_LABEL[nb.right]} column` : undefined} aria-label="Move right">
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button className={`${ctl} hover:!bg-[#ff2e6e] hover:!text-white`} onClick={() => save(setShown(layout, s, false))} title="Hide this widget" aria-label="Hide">
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="pointer-events-none select-none opacity-90 pt-3">{widget(s)}</div>
      </div>
    );
  };

  const column = (c: SpotColumn) => (
    <div key={c} className="flex flex-col min-w-0" style={{ gap: arrange ? 'calc(var(--spot-gap) + 18px)' : 'var(--spot-gap)', paddingTop: arrange ? 14 : 0 }} data-column={c}>
      {cols[c].map((s, i) => slot(s, c, i, cols[c].length))}
      {arrange && !cols[c].length && (
        <div className="rounded-[var(--panel-radius)] border-2 border-dashed border-white/15 p-6 text-center text-xs text-zinc-500">Empty column: move widgets here with the arrows</div>
      )}
    </div>
  );

  // Three columns on desktop, sidebar + main on tablets, one stack on phones.
  const ww = width ?? w;
  const three = ww >= 1180, two = !three && ww >= 760;
  let body: React.ReactNode;
  if (three) {
    body = (
      <div className="grid items-start" style={{ gridTemplateColumns: WIDTHS[look.widths], gap: 'var(--spot-gap)' }}>
        {column('left')}
        {column('center')}
        {column('right')}
      </div>
    );
  } else if (two) {
    body = (
      <div className="grid items-start" style={{ gridTemplateColumns: 'minmax(270px,320px) minmax(0,1fr)', gap: 'var(--spot-gap)' }}>
        <div className="flex flex-col min-w-0" style={{ gap: 'var(--spot-gap)' }}>
          {column('left')}
          {column('right')}
        </div>
        {column('center')}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col" style={{ gap: 'var(--spot-gap)' }}>
        {column('left')}
        {column('center')}
        {column('right')}
      </div>
    );
  }

  return (
    <div
      ref={root}
      data-spot-layout={three ? 'three' : two ? 'two' : 'one'}
      className={`spot-canvas spot-look panel-${look.panel} radius-${look.radius} density-${look.density} spot-font-${theme.fontFamily} ${preview ? 'relative overflow-hidden' : ''}`}
    >
      {customCss && <style>{`.spot-canvas{${customCss}}`}</style>}
      <SpotBackground kind={look.background} preview={preview} />
      <div className="relative z-[1]">
        {!preview && on.saveLayout && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-bold">{greeting()}{name ? `, ${name}` : ''}</p>
              <h2 className="text-white font-bold text-lg leading-tight truncate">{profile.stationName || 'My Spot'}</h2>
            </div>
            <div className="flex items-center gap-2 relative">
              <button
                onClick={() => {
                  setArrange(a => !a);
                  setLookOpen(false);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-colors ${arrangeOn ? 'bg-[var(--spot-accent)] text-black border-transparent' : 'bg-black/40 text-white border-white/10 hover:border-white/30'}`}
                data-testid="arrange-toggle"
              >
                {arrangeOn ? <Check className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />} {arrangeOn ? 'Done arranging' : 'Arrange'}
              </button>
              <button
                onClick={() => setLookOpen(o => !o)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-colors ${lookOpen ? 'bg-white text-black border-transparent' : 'bg-black/40 text-white border-white/10 hover:border-white/30'}`}
                data-testid="look-toggle"
              >
                <Palette className="w-3.5 h-3.5" /> Look
              </button>
              {lookOpen && (
                <div className="absolute right-0 top-full mt-2 z-40 w-[min(92vw,380px)] rounded-2xl bg-[#070c0f]/95 backdrop-blur-xl border border-white/10 shadow-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-white text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[var(--spot-accent)]" /> Quick look
                    </span>
                    <button onClick={() => setLookOpen(false)} className="text-zinc-400 hover:text-white" aria-label="Close">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <LookPanel layout={layout} theme={theme} onLayout={save} onAccent={on.saveAccent} compact />
                  <button onClick={on.customize} className="mt-3 w-full text-xs text-zinc-400 hover:text-white">More in Studio →</button>
                </div>
              )}
            </div>
          </div>
        )}
        {arrange && !preview && (
          <div className="mb-5 rounded-2xl border border-[var(--spot-accent)]/40 bg-black/50 backdrop-blur p-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-white font-bold mr-1">Arrange mode</span>
            <span className="text-zinc-400 mr-auto">Use the arrows to move widgets between columns. Changes save instantly.</span>
            {hidden.map(s => (
              <button key={s} onClick={() => save(setShown(layout, s, true))} className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
                <Plus className="w-3 h-3" /> {SECTION_INFO[s].emoji} {SECTION_INFO[s].label}
              </button>
            ))}
          </div>
        )}
        {body}
      </div>
    </div>
  );
};

const Opt: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode; title?: string }> = ({ on, onClick, children, title }) => (
  <button
    onClick={onClick}
    title={title}
    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${on ? 'bg-[var(--spot-accent)] text-black border-transparent' : 'bg-white/[0.04] text-zinc-300 border-white/10 hover:text-white hover:border-white/30'}`}
  >
    {children}
  </button>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-zinc-500">{label}</div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

/** The look controls, used by the home page's Quick look popover and by Studio. */
export const LookPanel: React.FC<{
  layout: LayoutConfig;
  theme?: StationTheme;
  onLayout: (l: LayoutConfig) => void;
  onAccent?: (hex: string) => void;
  compact?: boolean;
}> = ({ layout, theme, onLayout, onAccent, compact }) => {
  const look = lookOf(layout);
  const set = (p: Partial<SpotLook>) => onLayout({ ...layout, look: { ...look, ...p } });
  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {onAccent && (
        <Row label="Accent colour">
          {ACCENTS.map(c => (
            <button
              key={c}
              onClick={() => onAccent(c)}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{ background: c, borderColor: theme?.primaryColor?.toLowerCase() === c ? '#fff' : 'transparent', boxShadow: `0 0 12px ${c}66` }}
              title={c}
              aria-label={`Accent ${c}`}
            />
          ))}
        </Row>
      )}
      <Row label="Panels">
        {(['glass', 'solid', 'outline', 'neon', 'retro'] as const).map(p => (
          <Opt key={p} on={look.panel === p} onClick={() => set({ panel: p })}>
            {p[0].toUpperCase() + p.slice(1)}
          </Opt>
        ))}
      </Row>
      <Row label="Background">
        {(['none', 'stars', 'grid', 'aurora', 'scanlines', 'bubbles'] as const).map(b => (
          <Opt key={b} on={look.background === b} onClick={() => set({ background: b })}>
            {{ none: 'Plain', stars: '✦ Stars', grid: '▦ Synthwave', aurora: '◐ Aurora', scanlines: '≡ CRT', bubbles: '○ Bubbles' }[b]}
          </Opt>
        ))}
      </Row>
      <Row label="Corners">
        {(['sharp', 'soft', 'round'] as const).map(r => (
          <Opt key={r} on={look.radius === r} onClick={() => set({ radius: r })}>
            {{ sharp: '▢ Sharp', soft: '▢ Soft', round: '◯ Round' }[r]}
          </Opt>
        ))}
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Spacing">
          {(['cozy', 'compact'] as const).map(d => (
            <Opt key={d} on={look.density === d} onClick={() => set({ density: d })}>
              {d === 'cozy' ? 'Cozy' : 'Compact'}
            </Opt>
          ))}
        </Row>
        <Row label="Clock">
          <Opt on={layout.clock?.style !== 'analog'} onClick={() => onLayout({ ...layout, clock: { h24: !!layout.clock?.h24, style: 'digital' } })}>Digital</Opt>
          <Opt on={layout.clock?.style === 'analog'} onClick={() => onLayout({ ...layout, clock: { h24: !!layout.clock?.h24, style: 'analog' } })}>Analog</Opt>
          <Opt on={!!layout.clock?.h24} onClick={() => onLayout({ ...layout, clock: { style: layout.clock?.style || 'digital', h24: !layout.clock?.h24 } })}>24h</Opt>
        </Row>
      </div>
      <Row label="Column widths">
        {(['balanced', 'wide-center', 'wide-sides'] as const).map(x => (
          <Opt key={x} on={look.widths === x} onClick={() => set({ widths: x })}>
            {{ balanced: 'Balanced', 'wide-center': 'Wide middle', 'wide-sides': 'Wide sides' }[x]}
          </Opt>
        ))}
      </Row>
      <Row label="Sticky note colour">
        {['#ffcf33', '#ff7ad9', '#39ff88', '#7ae7ff', '#ffb38a', '#e8e8e8'].map(c => (
          <button
            key={c}
            onClick={() => onLayout({ ...layout, note: { text: layout.note?.text || '', color: c } })}
            className="w-6 h-6 rounded-sm border-2 rotate-[-4deg] hover:rotate-0 transition-transform"
            style={{ background: c, borderColor: (layout.note?.color || '#ffcf33') === c ? '#fff' : 'transparent' }}
            aria-label={`Note colour ${c}`}
          />
        ))}
      </Row>
      <Row label="One-click makeovers">
        {PRESETS.map(p => (
          <Opt key={p.id} on={false} onClick={() => onLayout(p.apply(layout))} title={p.blurb}>
            {p.name}
          </Opt>
        ))}
      </Row>
    </div>
  );
};

/** Studio's widget board: three mini columns you can shuffle widgets between. */
export const LayoutDesigner: React.FC<{ layout: LayoutConfig; onChange: (l: LayoutConfig) => void }> = ({ layout, onChange }) => {
  const cols = columnsView(layout);
  const hidden = hiddenOf(layout);
  const b = 'w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-black hover:bg-[var(--spot-accent)] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-zinc-400';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(['left', 'center', 'right'] as SpotColumn[]).map(c => {
          const nb = neighbourColumns(c);
          return (
            <div key={c} className="rounded-xl border border-white/10 bg-black/30 p-2 min-h-[120px]" data-designer-column={c}>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-zinc-500 mb-2 px-1">{COLUMN_LABEL[c]}</div>
              <div className="space-y-1.5">
                {cols[c].map((s, i) => (
                  <div key={s} className="rounded-lg bg-white/[0.05] border border-white/5 px-2 py-1.5" data-designer-widget={s}>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-white truncate">
                      <span>{SECTION_INFO[s].emoji}</span>
                      <span className="truncate">{SECTION_INFO[s].label}</span>
                    </div>
                    <div className="flex items-center gap-0.5 mt-1">
                      <button className={b} disabled={!nb.left} onClick={() => nb.left && onChange(moveTo(layout, s, nb.left))} aria-label="Move left"><ArrowLeft className="w-3 h-3" /></button>
                      <button className={b} disabled={i === 0} onClick={() => onChange(moveWithin(layout, s, -1))} aria-label="Move up"><ArrowUp className="w-3 h-3" /></button>
                      <button className={b} disabled={i === cols[c].length - 1} onClick={() => onChange(moveWithin(layout, s, 1))} aria-label="Move down"><ArrowDown className="w-3 h-3" /></button>
                      <button className={b} disabled={!nb.right} onClick={() => nb.right && onChange(moveTo(layout, s, nb.right))} aria-label="Move right"><ArrowRight className="w-3 h-3" /></button>
                      <button className={`${b} ml-auto hover:!bg-[#ff2e6e] hover:!text-white`} onClick={() => onChange(setShown(layout, s, false))} aria-label="Hide"><EyeOff className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                {!cols[c].length && <div className="text-[10px] text-zinc-600 px-1">Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-zinc-500 mr-1">Hidden</span>
          {hidden.map(s => (
            <button key={s} onClick={() => onChange(setShown(layout, s, true))} title={SECTION_INFO[s].hint} className="px-2 py-1 rounded-full bg-white/[0.06] hover:bg-white/15 text-[11px] text-zinc-300 hover:text-white flex items-center gap-1">
              <Plus className="w-3 h-3" /> {SECTION_INFO[s].emoji} {SECTION_INFO[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** A scaled-down, live copy of the Spot page for Studio (desktop 1440px or phone 390px wide). */
export const SpotPreview: React.FC<{
  device: 'desktop' | 'mobile';
  layout: LayoutConfig;
  theme: StationTheme;
  profile: StationProfile;
  data: SpotData;
  on: SpotActions;
  arrange?: boolean;
}> = ({ device, ...rest }) => {
  const box = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const inner = device === 'desktop' ? 1440 : 390;
  const zoom = Math.min(1, cw / inner);
  return (
    <div ref={box} className="w-full">
      <div
        className="relative mx-auto overflow-hidden"
        style={{ width: inner, zoom, background: rest.theme.backgroundImage && !/^(\/|https?:|data:)/.test(rest.theme.backgroundImage) ? rest.theme.backgroundImage : '#030608' }}
      >
        <div className="p-4">
          <SpotLayout {...rest} preview width={inner - 32} />
        </div>
      </div>
    </div>
  );
};
