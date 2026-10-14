// Pure helpers for the three-column Spot page: which widget lives where, and how to move it.
import type { LayoutConfig, SectionKey, SpotColumn, SpotLook } from '@/lib/types';
import { ALL_SECTIONS, DEFAULT_COLUMNS, DEFAULT_LOOK } from '@/lib/defaults';

export const SECTION_INFO: Record<SectionKey, { label: string; hint: string; emoji: string }> = {
  profile: { label: 'Profile', hint: 'Your picture, name, mood and stats', emoji: '🪪' },
  pictures: { label: 'Picture reel', hint: 'Your favourite pictures', emoji: '🖼️' },
  clock: { label: 'Clock', hint: 'Digital or analog, 12 or 24 hour', emoji: '🕰️' },
  note: { label: 'Sticky note', hint: 'A note for whoever drops by', emoji: '📝' },
  video: { label: 'Spot TV', hint: 'Your videos, with channel flipping', emoji: '📺' },
  music: { label: 'Music player', hint: 'Your radio and stations', emoji: '🎧' },
  arcade: { label: 'Arcade', hint: 'Your games and high scores', emoji: '🕹️' },
  library: { label: 'Library', hint: 'Books and comics, pick up where you left off', emoji: '📚' },
  thoughts: { label: 'Friends right now', hint: 'Who’s on air or listening', emoji: '✨' },
  friends: { label: 'Friends list', hint: 'Everyone, online first', emoji: '👥' },
  feed: { label: 'Friend feed', hint: 'Posts from you and your friends', emoji: '📰' }
};

export const COLUMN_LABEL: Record<SpotColumn, string> = { left: 'Left', center: 'Middle', right: 'Right' };

export const lookOf = (l: LayoutConfig): SpotLook => ({ ...DEFAULT_LOOK, ...(l.look || {}) });

export const columnOf = (l: LayoutConfig, s: SectionKey): SpotColumn => l.columns?.[s] ?? DEFAULT_COLUMNS[s];

/** Full order: every known section exactly once, saved order first. */
export const orderOf = (l: LayoutConfig): SectionKey[] => {
  const seen = new Set<SectionKey>();
  const out: SectionKey[] = [];
  for (const s of [...(l.sectionOrder || []), ...ALL_SECTIONS]) {
    if (ALL_SECTIONS.includes(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
};

export const columnsView = (l: LayoutConfig): Record<SpotColumn, SectionKey[]> => {
  const out: Record<SpotColumn, SectionKey[]> = { left: [], center: [], right: [] };
  for (const s of orderOf(l)) if (l.enabledSections.includes(s)) out[columnOf(l, s)].push(s);
  return out;
};

export const hiddenOf = (l: LayoutConfig): SectionKey[] => orderOf(l).filter(s => !l.enabledSections.includes(s));

/** Swap a widget with its visible neighbour above (-1) or below (+1) in the same column. */
export function moveWithin(l: LayoutConfig, s: SectionKey, dir: -1 | 1): LayoutConfig {
  const col = columnsView(l)[columnOf(l, s)];
  const i = col.indexOf(s);
  const other = col[i + dir];
  if (i < 0 || !other) return l;
  const order = orderOf(l);
  const a = order.indexOf(s), b = order.indexOf(other);
  [order[a], order[b]] = [order[b], order[a]];
  return { ...l, sectionOrder: order };
}

/** Put a widget at the bottom of another column. */
export function moveTo(l: LayoutConfig, s: SectionKey, to: SpotColumn): LayoutConfig {
  const columns = { ...DEFAULT_COLUMNS, ...(l.columns || {}), [s]: to };
  const order = orderOf(l).filter(x => x !== s);
  const next = { ...l, columns };
  const last = [...order].reverse().find(x => l.enabledSections.includes(x) && columnOf(next, x) === to);
  order.splice(last ? order.indexOf(last) + 1 : order.length, 0, s);
  return { ...next, sectionOrder: order };
}

export function setShown(l: LayoutConfig, s: SectionKey, shown: boolean): LayoutConfig {
  const set = new Set(l.enabledSections);
  if (shown) set.add(s);
  else set.delete(s);
  return { ...l, sectionOrder: orderOf(l), enabledSections: orderOf(l).filter(x => set.has(x)) };
}

export const neighbourColumns = (c: SpotColumn): { left?: SpotColumn; right?: SpotColumn } =>
  c === 'left' ? { right: 'center' } : c === 'center' ? { left: 'left', right: 'right' } : { left: 'center' };

/** Ready-made arrangements for one-click makeovers. */
export const PRESETS: { id: string; name: string; blurb: string; apply: (l: LayoutConfig) => LayoutConfig }[] = [
  {
    id: 'classic',
    name: 'Classic three',
    blurb: 'You on the left, media in the middle, friends on the right',
    apply: l => ({ ...l, columns: { ...DEFAULT_COLUMNS }, sectionOrder: [...ALL_SECTIONS], look: { ...lookOf(l), widths: 'balanced' } })
  },
  {
    id: 'theater',
    name: 'Theater',
    blurb: 'A wide middle for TV and music, slim sides',
    apply: l => ({
      ...l,
      columns: { ...DEFAULT_COLUMNS, thoughts: 'left', clock: 'right', note: 'right' },
      sectionOrder: ['profile', 'thoughts', 'pictures', 'video', 'music', 'arcade', 'library', 'clock', 'friends', 'note', 'feed'],
      look: { ...lookOf(l), widths: 'wide-center' }
    })
  },
  {
    id: 'social',
    name: 'Social butterfly',
    blurb: 'Feed front and centre, media on the side',
    apply: l => ({
      ...l,
      columns: { ...DEFAULT_COLUMNS, feed: 'center', music: 'right', arcade: 'right', video: 'left', library: 'left' },
      sectionOrder: ['profile', 'video', 'note', 'clock', 'library', 'pictures', 'feed', 'thoughts', 'music', 'friends', 'arcade'],
      enabledSections: [...new Set([...l.enabledSections, 'feed', 'friends', 'thoughts'] as SectionKey[])],
      look: { ...lookOf(l), widths: 'wide-sides' }
    })
  },
  {
    id: 'gamer',
    name: 'Arcade cabinet',
    blurb: 'Games up top, retro panels and scanlines',
    apply: l => ({
      ...l,
      columns: { ...DEFAULT_COLUMNS },
      sectionOrder: ['profile', 'clock', 'pictures', 'note', 'arcade', 'video', 'music', 'library', 'thoughts', 'friends', 'feed'],
      look: { ...lookOf(l), panel: 'retro', radius: 'sharp', background: 'scanlines' }
    })
  }
];

export const ACCENTS = ['#2ee8f7', '#39ff88', '#ff2e6e', '#ffcf33', '#b26bff', '#f9993c', '#ff7ad9', '#7aa2ff'];

export const glowFor = (hex: string, a = 0.35) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(46,232,247,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
