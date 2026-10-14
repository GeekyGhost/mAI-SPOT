'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { LiveBroadcast, Track } from '@/lib/types';
import { safeLocal, saveLocal } from '@/lib/client';

/**
 * One audio engine for the whole app. Every music skin (PulseAmp deck, turntable, compact),
 * the now-playing bar and the visualizers are just views onto this, so music keeps playing
 * while you move between Radio, Cinema, Library, etc.
 *
 * Two modes:
 *  - on demand: you pick what plays (queue, shuffle, repeat, seek)
 *  - live: tuned into this node's on-air station; position comes from the broadcast clock
 */

export type NowTrack = Pick<Track, 'id' | 'title' | 'artist' | 'coverArt' | 'filePath' | 'duration'> &
  Partial<Pick<Track, 'album' | 'genre' | 'kbps' | 'khz'>>;

export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
export const EQ_LABELS = ['60', '170', '310', '600', '1K', '3K', '6K', '12K', '14K', '16K'];
export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  Rock: [4, 3, 2, 0, -1, 1, 3, 4, 4, 4],
  Techno: [5, 4, 2, 0, -2, 0, 3, 5, 5, 4],
  'Lo-Fi': [2, 3, 2, 1, 0, -2, -4, -6, -8, -10],
  Vocal: [-2, -2, 0, 3, 4, 4, 3, 1, 0, -1],
  Classical: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4]
};

export type RepeatMode = 'off' | 'all' | 'one';

interface EqState {
  enabled: boolean;
  preamp: number;
  gains: number[];
  preset: string;
}

interface Engine {
  // state
  queue: NowTrack[];
  index: number;
  current: NowTrack | null;
  label: string;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  mode: 'ondemand' | 'live';
  live: LiveBroadcast | null;
  analyser: AnalyserNode | null;
  eq: EqState;
  // actions
  cueQueue: (tracks: NowTrack[], startIndex?: number, label?: string) => void;
  playQueue: (tracks: NowTrack[], startIndex?: number, label?: string) => void;
  playTrack: (track: NowTrack, context?: NowTrack[], label?: string) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playNext: (t: NowTrack) => void;
  addToQueue: (t: NowTrack) => void;
  removeFromQueue: (i: number) => void;
  jumpTo: (i: number) => void;
  /** Tune into a live broadcast. Defaults to this node's own station; pass a friend's live URL to listen to theirs. */
  tuneInLive: (url?: string) => Promise<boolean>;
  leaveLive: () => void;
  /** The broadcast feed we're tuned to (own radio, a friend's station, or listening along with a friend). */
  liveUrl: string;
  /** Re-check the broadcast right now (e.g. a friend we listen along with changed song). */
  resyncLive: () => void;
  setEqBand: (i: number, db: number) => void;
  setPreamp: (db: number) => void;
  setEqEnabled: (on: boolean) => void;
  applyPreset: (name: string) => void;
}

const Ctx = createContext<Engine | null>(null);

export function useAudio(): Engine {
  const e = useContext(Ctx);
  if (!e) throw new Error('useAudio must be used inside <AudioEngineProvider>');
  return e;
}

const DEFAULT_EQ: EqState = { enabled: true, preamp: 0, gains: [...EQ_PRESETS.Flat], preset: 'Flat' };

export function AudioEngineProvider({ children, listenerId, reportNowPlaying }: { children: React.ReactNode; listenerId?: string; reportNowPlaying?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const graph = useRef<{
    ctx: AudioContext;
    preamp: GainNode;
    filters: BiquadFilterNode[];
    analyser: AnalyserNode;
  } | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const countedPlay = useRef<string | null>(null);

  const [queue, setQueue] = useState<NowTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [label, setLabel] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('all');
  const [mode, setMode] = useState<'ondemand' | 'live'>('ondemand');
  const [live, setLive] = useState<LiveBroadcast | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [eq, setEq] = useState<EqState>(DEFAULT_EQ);

  // Restore per-browser preferences.
  useEffect(() => {
    setVolumeState(safeLocal('maispot.volume', 0.85));
    setEq(safeLocal('maispot.eq', DEFAULT_EQ));
    setShuffle(safeLocal('maispot.shuffle', false));
    setRepeat(safeLocal<RepeatMode>('maispot.repeat', 'all'));
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    saveLocal('maispot.volume', volume);
  }, [volume, muted]);

  // Push EQ state into the Web Audio graph whenever it changes.
  useEffect(() => {
    saveLocal('maispot.eq', eq);
    const g = graph.current;
    if (!g) return;
    g.preamp.gain.value = Math.pow(10, (eq.enabled ? eq.preamp : 0) / 20);
    g.filters.forEach((f, i) => (f.gain.value = eq.enabled ? eq.gains[i] : 0));
  }, [eq]);

  useEffect(() => saveLocal('maispot.shuffle', shuffle), [shuffle]);
  useEffect(() => saveLocal('maispot.repeat', repeat), [repeat]);

  /** Build the Web Audio graph on first play (browsers require a user gesture). */
  const ensureGraph = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (graph.current) {
      if (graph.current.ctx.state === 'suspended') graph.current.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      const src = ctx.createMediaElementSource(el);
      const preamp = ctx.createGain();
      const filters = EQ_BANDS.map(freq => {
        const f = ctx.createBiquadFilter();
        f.type = 'peaking';
        f.frequency.value = freq;
        f.Q.value = 1.4;
        return f;
      });
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.78;
      let node: AudioNode = src;
      node.connect(preamp);
      node = preamp;
      for (const f of filters) {
        node.connect(f);
        node = f;
      }
      node.connect(an);
      an.connect(ctx.destination);
      graph.current = { ctx, preamp, filters, analyser: an };
      setAnalyser(an);
      setEq(e => ({ ...e })); // re-apply gains to the new nodes
    } catch (e) {
      console.warn('Web Audio unavailable; playing without EQ/visualizer.', e);
    }
  }, []);

  const current: NowTrack | null =
    mode === 'live' ? (live?.track ? { ...live.track } : null) : queue[index] || null;

  const load = useCallback(
    (track: NowTrack | null, offset = 0, autoplay = true) => {
      const el = audioRef.current;
      if (!el || !track) return;
      if (autoplay || graph.current) ensureGraph();
      pendingSeek.current = offset > 0.5 ? offset : null;
      if (el.getAttribute('src') !== track.filePath) {
        el.src = track.filePath;
        el.load();
      } else {
        // Same file already loaded: just jump (restart, or re-sync to the broadcast clock).
        el.currentTime = offset;
        pendingSeek.current = null;
      }
      setCurrentTime(offset);
      setDuration(track.duration || 0);
      if (autoplay) el.play().catch(() => setIsPlaying(false));
    },
    [ensureGraph]
  );

  // ─── on-demand controls ───
  const cueQueue = useCallback(
    (tracks: NowTrack[], startIndex = 0, lbl = '') => {
      if (!tracks.length) return;
      if (mode === 'live' || queue.length > 0 || current) return;
      setMode('ondemand');
      setLive(null);
      let start = startIndex;
      if (start < 0 || start >= tracks.length) start = 0;
      if (shuffle && startIndex === 0) {
        start = Math.floor(Math.random() * tracks.length);
      }
      setQueue(tracks);
      setIndex(start);
      setLabel(lbl);
      load(tracks[start], 0, false);
    },
    [mode, queue.length, current, shuffle, load]
  );

  const playQueue = useCallback(
    (tracks: NowTrack[], startIndex = 0, lbl = '') => {
      if (!tracks.length) return;
      setMode('ondemand');
      setLive(null);
      let list = tracks;
      let start = startIndex;
      if (shuffle && startIndex === 0) {
        start = Math.floor(Math.random() * tracks.length);
      }
      setQueue(list);
      setIndex(start);
      setLabel(lbl);
      load(list[start]);
    },
    [load, shuffle]
  );

  const playTrack = useCallback(
    (track: NowTrack, context?: NowTrack[], lbl = '') => {
      const list = context && context.length ? context : [track];
      const i = Math.max(0, list.findIndex(t => t.id === track.id));
      setMode('ondemand');
      setLive(null);
      setQueue(list);
      setIndex(i);
      setLabel(lbl);
      load(list[i]);
    },
    [load]
  );

  const pickNextIndex = useCallback(
    (auto: boolean): number | null => {
      if (!queue.length) return null;
      if (shuffle && queue.length > 1) {
        let n = index;
        while (n === index) n = Math.floor(Math.random() * queue.length);
        return n;
      }
      if (index + 1 < queue.length) return index + 1;
      if (repeat === 'all' || !auto) return 0;
      return null;
    },
    [queue.length, index, shuffle, repeat]
  );

  const next = useCallback(() => {
    if (mode === 'live') return;
    const n = pickNextIndex(false);
    if (n === null) return;
    setIndex(n);
    load(queue[n]);
  }, [mode, pickNextIndex, load, queue]);

  const prev = useCallback(() => {
    if (mode === 'live') return;
    const el = audioRef.current;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      return;
    }
    if (!queue.length) return;
    const p = index === 0 ? queue.length - 1 : index - 1;
    setIndex(p);
    load(queue[p]);
  }, [mode, index, queue, load]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    ensureGraph();
    if (!el.getAttribute('src')) {
      if (current) load(current);
      return;
    }
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, [ensureGraph, current, load]);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const seek = useCallback(
    (t: number) => {
      if (mode === 'live') return; // a broadcast can't be scrubbed
      const el = audioRef.current;
      if (el) el.currentTime = t;
      setCurrentTime(t);
    },
    [mode]
  );

  // ─── live mode ───
  const liveRef = useRef(live);
  liveRef.current = live;
  const liveUrl = useRef('/api/radio/live');
  const [liveUrlState, setLiveUrlState] = useState('/api/radio/live');

  const syncLive = useCallback(
    async (forceReload: boolean) => {
      const t0 = Date.now();
      let data: LiveBroadcast;
      try {
        const base = liveUrl.current;
        data = await fetch(`${base}${listenerId && base === '/api/radio/live' ? `?listener=${listenerId}` : ''}`, { cache: 'no-store' }).then(r => r.json());
      } catch {
        return false;
      }
      if (!data.live || !data.track) {
        setLive(null);
        setMode('ondemand');
        audioRef.current?.pause();
        return false;
      }
      const latency = (Date.now() - t0) / 2000;
      const paused = !!(data as LiveBroadcast & { paused?: boolean }).paused;
      const expected = (data.offset || 0) + (paused ? 0 : latency);
      const prevTrack = liveRef.current?.track?.id;
      setLive(data);
      const el = audioRef.current;
      if (forceReload || prevTrack !== data.track.id) {
        load(data.track, expected, !paused);
      } else if (el) {
        // Listening along: mirror the friend's pause/play; otherwise keep within a few seconds of the clock.
        if (paused && !el.paused) el.pause();
        if (!paused && el.paused) el.play().catch(() => {});
        if (Math.abs(el.currentTime - expected) > (paused ? 0.5 : 4)) el.currentTime = expected;
      }
      return true;
    },
    [load, listenerId]
  );

  const tuneInLive = useCallback(async (url?: string) => {
    liveUrl.current = url || '/api/radio/live';
    setLiveUrlState(liveUrl.current);
    liveRef.current = null; // force a reload even if the same song is playing elsewhere
    setMode('live');
    setLabel('Live broadcast');
    const okLive = await syncLive(true);
    if (!okLive) setMode('ondemand');
    return okLive;
  }, [syncLive]);

  const leaveLive = useCallback(() => {
    setMode('ondemand');
    setLive(null);
    audioRef.current?.pause();
  }, []);

  // While tuned in, re-check the broadcast clock (catches skips & drift). Listen-along follows closer.
  useEffect(() => {
    if (mode !== 'live') return;
    const id = setInterval(() => syncLive(false), liveUrlState.endsWith('/along') ? 5000 : 12000);
    return () => clearInterval(id);
  }, [mode, syncLive, liveUrlState]);

  // Tell friends what this Spot is playing (only songs from this Spot's own library; the node decides who sees it).
  const npTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reportNow = useCallback(() => {
    if (!reportNowPlaying) return;
    clearTimeout(npTimer.current);
    npTimer.current = setTimeout(() => {
      const el = audioRef.current;
      const t = mode === 'ondemand' ? queue[index] : null;
      const own = t && t.filePath.startsWith('/api/media/audio/');
      const body = own ? { id: t!.id, playing: !!el && !el.paused, position: el?.currentTime || 0 } : {};
      fetch('/api/p2p/nowplaying', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    }, 400);
  }, [reportNowPlaying, mode, queue, index]);
  const currentId = mode === 'ondemand' ? queue[index]?.id : live?.track?.id;
  useEffect(() => reportNow(), [currentId, isPlaying, mode, reportNow]);
  useEffect(() => {
    if (!reportNowPlaying) return;
    const bye = () => navigator.sendBeacon?.('/api/p2p/nowplaying', '{}');
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [reportNowPlaying]);

  // ─── element events ───
  const onEnded = useCallback(() => {
    if (mode === 'live') {
      syncLive(true);
      return;
    }
    if (repeat === 'one') {
      const el = audioRef.current;
      if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
      return;
    }
    const n = pickNextIndex(true);
    if (n === null) return;
    setIndex(n);
    load(queue[n]);
  }, [mode, repeat, pickNextIndex, load, queue, syncLive]);

  // Count a play once it actually starts (on-demand only).
  useEffect(() => {
    if (!isPlaying || mode !== 'ondemand' || !current) return;
    if (countedPlay.current === current.id) return;
    countedPlay.current = current.id;
    fetch('/api/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'play', id: current.id })
    }).catch(() => {});
  }, [isPlaying, mode, current]);

  // Pause the radio when any video with sound starts (Cinema, Spot TV, etc.).
  useEffect(() => {
    const onPlay = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLVideoElement && !t.muted && t !== (audioRef.current as unknown)) {
        audioRef.current?.pause();
      }
    };
    document.addEventListener('play', onPlay, true);
    return () => document.removeEventListener('play', onPlay, true);
  }, []);

  // Media keys / OS now-playing widget.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    try {
      const art = current.coverArt ? [{ src: current.coverArt, sizes: '512x512' }] : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: mode === 'live' ? live?.station?.name || 'Live' : current.album || label,
        artwork: art
      });
      navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
      navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
      navigator.mediaSession.setActionHandler('nexttrack', mode === 'live' ? null : () => next());
      navigator.mediaSession.setActionHandler('previoustrack', mode === 'live' ? null : () => prev());
    } catch {}
  }, [current, mode, live, label, next, prev]);

  const engine: Engine = useMemo(
    () => ({
      queue,
      index,
      current,
      label,
      isPlaying,
      isBuffering,
      currentTime,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      mode,
      live,
      analyser,
      eq,
      cueQueue,
      playQueue,
      playTrack,
      toggle,
      pause,
      next,
      prev,
      seek,
      setVolume: (v: number) => {
        setVolumeState(Math.max(0, Math.min(1, v)));
        setMuted(false);
      },
      toggleMute: () => setMuted(m => !m),
      toggleShuffle: () => setShuffle(s => !s),
      cycleRepeat: () => setRepeat(r => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
      playNext: (t: NowTrack) => {
        if (mode === 'live' || !queue.length) {
          playTrack(t);
          return;
        }
        setQueue(q => [...q.slice(0, index + 1), t, ...q.slice(index + 1)]);
      },
      addToQueue: (t: NowTrack) => {
        if (mode === 'live' || !queue.length) {
          playTrack(t);
          return;
        }
        setQueue(q => [...q, t]);
      },
      removeFromQueue: (i: number) => {
        if (i === index) return;
        setQueue(q => q.filter((_, k) => k !== i));
        if (i < index) setIndex(x => x - 1);
      },
      jumpTo: (i: number) => {
        if (!queue[i]) return;
        setMode('ondemand');
        setIndex(i);
        load(queue[i]);
      },
      tuneInLive,
      leaveLive,
      liveUrl: liveUrlState,
      resyncLive: () => {
        if (mode === 'live') syncLive(false);
      },
      setEqBand: (i: number, db: number) =>
        setEq(e => ({ ...e, preset: 'Custom', gains: e.gains.map((g, k) => (k === i ? db : g)) })),
      setPreamp: (db: number) => setEq(e => ({ ...e, preamp: db })),
      setEqEnabled: (on: boolean) => setEq(e => ({ ...e, enabled: on })),
      applyPreset: (name: string) => {
        const p = EQ_PRESETS[name];
        if (p) setEq(e => ({ ...e, preset: name, gains: [...p] }));
      }
    }),
    [
      queue, index, current, label, isPlaying, isBuffering, currentTime, duration, volume, muted, shuffle,
      repeat, mode, live, analyser, eq, cueQueue, playQueue, playTrack, toggle, pause, next, prev, seek, tuneInLive,
      leaveLive, load, liveUrlState, syncLive
    ]
  );

  return (
    <Ctx.Provider value={engine}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onLoadedMetadata={e => {
          const el = e.currentTarget;
          if (isFinite(el.duration)) setDuration(el.duration);
          if (pendingSeek.current !== null) {
            el.currentTime = Math.min(pendingSeek.current, Math.max(0, (el.duration || 0) - 0.5));
            pendingSeek.current = null;
          }
        }}
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
        onSeeked={() => reportNow()}
        onEnded={onEnded}
        onError={() => {
          setIsBuffering(false);
          // Skip unplayable files instead of stalling the queue.
          if (mode === 'ondemand' && queue.length > 1) setTimeout(() => onEnded(), 800);
        }}
      />
    </Ctx.Provider>
  );
}
