'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RadioTower } from 'lucide-react';

import { Navbar, AppMode, MODES } from '@/components/Navbar';
import { MobileNav } from '@/components/mobile/MobileNav';
import { ProfileEditor } from '@/components/profile/ProfileEditor';
import { GalleryTab } from '@/components/gallery/GalleryTab';
import { PartyLayer } from '@/components/social/WatchParty';
import { ThemeCustomizerModal } from '@/components/studio/ThemeCustomizerModal';
import { WelcomeWizardModal } from '@/components/onboarding/WelcomeWizardModal';
import { UploadModal, UploadTab } from '@/components/studio/UploadModal';
import { CustomizationStudioTab } from '@/components/studio/CustomizationStudioTab';
import { P2PProvider, useP2P } from '@/components/social/P2PProvider';
import { FeedTab } from '@/components/social/FeedTab';
import { FriendSpot } from '@/components/social/FriendSpot';
import { OmniPager, CallWindow } from '@/components/social/OmniPager';

import { SpotLayout } from '@/components/spot/SpotLayout';
import { glowFor } from '@/components/spot/layoutModel';

import { AudioEngineProvider, useAudio } from '@/components/audio/AudioEngine';
import { NowPlayingBar } from '@/components/audio/NowPlayingBar';
import { RadioTab } from '@/components/radio/RadioTab';
import { CinemaTab } from '@/components/cinema/CinemaTab';
import { useAutoPosters } from '@/components/cinema/useAutoPosters';
import { ArcadeTab } from '@/components/arcade/ArcadeTab';
import { LibraryTab } from '@/components/library/LibraryTab';
import { ModelShelf } from '@/components/models/ModelsTab';
import type { ModelSummary } from '@/lib/modelTypes';
import { LibraryManager, type ManagerTab } from '@/components/studio/LibraryManager';

import type {
  Track, Video, Channel, StationProfile, StationTheme, LayoutConfig, Game,
  Playlist, RadioStation, Collection, WatchProgress, Book, LiveBroadcast, MusicPlayerStyle, VisualizerMode
} from '@/lib/types';
import { api } from '@/lib/client';
import { defaultLayout } from '@/lib/defaults';

const DEFAULT_LAYOUT: LayoutConfig = defaultLayout;

interface Catalog {
  tracks: Track[];
  videos: Video[];
  channels: Channel[];
  videoGenres: string[];
  playlists: Playlist[];
  stations: RadioStation[];
  collections: Collection[];
  watchProgress: Record<string, WatchProgress>;
  games: Game[];
  books: Book[];
  models: ModelSummary[];
  live: LiveBroadcast | null;
}

const EMPTY: Catalog = {
  tracks: [], videos: [], channels: [], videoGenres: [], playlists: [], stations: [], collections: [],
  watchProgress: {}, games: [], books: [], models: [], live: null
};

export default function Home() {
  return (
    <AudioEngineProvider reportNowPlaying>
      <SpotApp />
    </AudioEngineProvider>
  );
}

/** The mini player; opening the full player also closes a friend's Spot if one is open. */
function PlayerBar({ onOpen, hidden }: { onOpen: () => void; hidden: boolean }) {
  const p2p = useP2P();
  return (
    <NowPlayingBar
      hidden={hidden}
      onOpen={() => {
        p2p.setVisit(null);
        onOpen();
      }}
    />
  );
}

function modeFromHash(): AppMode {
  if (typeof window === 'undefined') return 'maispot';
  const h = window.location.hash.replace('#', '') as AppMode;
  return MODES.some(m => m.id === h) ? h : 'maispot';
}

function SpotApp() {
  const audio = useAudio();
  const [mode, setModeState] = useState<AppMode>('maispot');
  const [cat, setCat] = useState<Catalog>(EMPTY);
  const [profile, setProfile] = useState<StationProfile | null>(null);
  const [theme, setTheme] = useState<StationTheme | null>(null);
  const [layout, setLayout] = useState<LayoutConfig | null>(null);
  const [upload, setUpload] = useState<{ open: boolean; tab: UploadTab }>({ open: false, tab: 'audio' });
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [manager, setManager] = useState<ManagerTab | null>(null);
  const [editProfile, setEditProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Sections are addressable (#radio, #cinema…) so reloads and bookmarks land in the right place.
  useEffect(() => {
    setModeState(modeFromHash());
    const onHash = () => setModeState(modeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    if (typeof window !== 'undefined') history.replaceState(null, '', m === 'maispot' ? ' ' : `#${m}`);
    window.scrollTo({ top: 0 });
  }, []);

  const refreshCatalog = useCallback(async (force = false) => {
    try {
      const d = await api(`/api/catalog${force ? '?sync=force' : ''}`);
      setCat({
        tracks: d.tracks, videos: d.videos, channels: d.channels, videoGenres: d.videoGenres, playlists: d.playlists,
        stations: d.stations, collections: d.collections, watchProgress: d.watchProgress, games: d.games,
        books: d.books, models: d.models || [], live: d.live
      });
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  const refresh = useCallback(() => refreshCatalog(false), [refreshCatalog]);

  const refreshStation = useCallback(async () => {
    try {
      const st = await api('/api/station');
      setProfile(st.profile);
      setTheme(st.theme);
      setLayout(st.layout);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    Promise.all([refreshCatalog(true), refreshStation()]).finally(() => setLoading(false));
  }, [refreshCatalog, refreshStation]);

  // Brand-new Spot: start with the welcome setup.
  useEffect(() => {
    if (profile && profile.setupDone === false) setIsWizardOpen(true);
  }, [profile?.setupDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // New files dropped into content\ show up without a reload.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  useAutoPosters(cat.videos, refresh);

  const activeLayout = layout || DEFAULT_LAYOUT;

  const saveLayout = async (newLayout: LayoutConfig) => {
    setLayout(newLayout);
    const d = await api('/api/station', { method: 'PUT', json: { layout: newLayout } });
    setLayout(d.layout);
  };
  const saveTheme = async (newTheme: StationTheme) => {
    setTheme(newTheme);
    const d = await api('/api/station', { method: 'PUT', json: { theme: newTheme } });
    setTheme(d.theme);
  };
  const updateProfile = async (updates: Partial<StationProfile>) => {
    const d = await api('/api/station', { method: 'PUT', json: { profile: updates } });
    setProfile(d.profile);
  };
  const openUpload = (tab: UploadTab) => setUpload({ open: true, tab });
  const uploadTabForMode: Record<AppMode, UploadTab> = {
    maispot: 'audio', feed: 'audio', radio: 'audio', cinema: 'video', gallery: 'audio', arcade: 'app', library: 'book', models: 'model', studio: 'audio'
  };
  const onAdd = () => {
    // In Pictures, "Add" means add pictures to the album you're looking at.
    if (mode === 'gallery') window.dispatchEvent(new Event('maispot:add-pictures'));
    else openUpload(uploadTabForMode[mode]);
  };

  // ── Theme → CSS variables + background ──
  const rootStyle = useMemo(() => {
    const accent = theme?.primaryColor || '#2ee8f7';
    const hex = /^#([0-9a-f]{6})$/i.exec(accent)?.[1] || /^#([0-9a-f]{3})$/i.exec(accent)?.[1].replace(/./g, c => c + c) || '2ee8f7';
    const s: React.CSSProperties & Record<string, string> = {
      '--spot-accent': accent,
      '--spot-accent-rgb': [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' '),
      '--spot-glow': theme?.accentGlow || 'rgba(46,232,247,0.35)',
      '--spot-surface': theme?.surfaceColor || 'rgba(13,22,26,0.9)'
    };
    const bg = theme?.backgroundImage || '#030608';
    if (/^(\/|https?:|data:)/.test(bg)) {
      s.backgroundColor = '#030608';
      s.backgroundImage = `url("${bg}")`;
      s.backgroundAttachment = 'fixed';
      const t = theme?.backgroundTiling;
      s.backgroundSize = t === 'cover' ? 'cover' : 'auto';
      s.backgroundRepeat = t === 'tile-x' ? 'repeat-x' : t === 'tile-y' ? 'repeat-y' : t === 'cover' ? 'no-repeat' : 'repeat';
    } else {
      s.background = bg;
      s.backgroundAttachment = 'fixed';
    }
    return s;
  }, [theme]);
  // Custom CSS from Studio applies only inside the Spot page canvas (nested under .spot-canvas).
  const customCss = (theme?.customCss || '').replace(/<\//g, '<\\/');

  const musicGenres = useMemo(() => [...new Set(cat.tracks.map(t => t.genre))].sort(), [cat.tracks]);
  const usedVideoGenres = useMemo(() => [...new Set(cat.videos.map(v => v.genre))].filter(Boolean), [cat.videos]);
  const spotVideoGenres = activeLayout.activeVideoGenres?.length ? activeLayout.activeVideoGenres : usedVideoGenres;

  const onLookChange = (skin: MusicPlayerStyle, vis: VisualizerMode) =>
    saveLayout({ ...activeLayout, musicPlayerStyle: skin, visualizerMode: vis }).catch(() => {});

  return (
    <P2PProvider onProfileChanged={refreshStation}>
    <div className="min-h-screen flex flex-col transition-colors duration-300 font-sans text-slate-100" style={rootStyle}>
      <Navbar
        currentMode={mode}
        onSelectMode={setMode}
        onOpenUpload={onAdd}
        onOpenWizard={() => setIsWizardOpen(true)}
        onEditProfile={() => setEditProfile(true)}
        profile={profile || undefined}
        onAir={!!cat.live?.live}
      />

      <main className={`flex-1 ${mode === 'maispot' ? 'max-w-[1680px]' : 'max-w-7xl'} w-full mx-auto px-3 sm:px-4 py-5 ${audio.current ? 'pb-40 md:pb-28' : 'pb-24 md:pb-10'}`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400 gap-3">
            <RadioTower className="w-10 h-10 text-[#2ee8f7] animate-bounce" />
            <p className="font-mono text-xs text-[#2ee8f7]">Starting your mAI Spot…</p>
          </div>
        ) : loadError && !profile ? (
          <div className="max-w-lg mx-auto mt-20 p-6 rounded-2xl border border-[#ff3c3c]/40 bg-[#ff3c3c]/10 text-sm">
            <p className="font-bold text-white mb-1">Couldn’t reach your node</p>
            <p className="text-zinc-300">{loadError}</p>
          </div>
        ) : (
          <>
            {mode === 'maispot' && profile && theme && (
              <SpotLayout
                layout={activeLayout}
                theme={theme}
                profile={profile}
                customCss={customCss}
                data={{ tracks: cat.tracks, videos: cat.videos, games: cat.games, books: cat.books, live: cat.live, videoGenres: spotVideoGenres }}
                on={{
                  editProfile: () => setEditProfile(true),
                  customize: () => setMode('studio'),
                  go: m => setMode(m),
                  upload: openUpload,
                  saveLayout: l => saveLayout(l).catch(() => {}),
                  saveAccent: c => saveTheme({ ...theme, primaryColor: c, accentGlow: glowFor(c) }).catch(() => {}),
                  refresh
                }}
              />
            )}

            {mode === 'feed' && profile && (
              <div className="animate-fadeIn">
                <FeedTab tracks={cat.tracks} videos={cat.videos} />
              </div>
            )}

            {mode === 'radio' && (
              <div className="animate-fadeIn">
                <RadioTab
                  tracks={cat.tracks}
                  playlists={cat.playlists}
                  stations={cat.stations}
                  live={cat.live}
                  skin={activeLayout.musicPlayerStyle}
                  visualizer={activeLayout.visualizerMode || 'spectrum'}
                  onLookChange={onLookChange}
                  onRefresh={refresh}
                  onUpload={() => openUpload('audio')}
                  onManage={() => setManager('music')}
                />
              </div>
            )}

            {mode === 'cinema' && (
              <div className="animate-fadeIn">
                <CinemaTab
                  videos={cat.videos}
                  channels={cat.channels}
                  genres={cat.videoGenres}
                  collections={cat.collections}
                  watchProgress={cat.watchProgress}
                  onRefresh={refresh}
                  onUpload={() => openUpload('video')}
                  onManage={() => setManager('videos')}
                />
              </div>
            )}

            {mode === 'gallery' && (
              <div className="animate-fadeIn">
                <GalleryTab profile={profile} onUpdateProfile={updateProfile} />
              </div>
            )}

            {mode === 'arcade' && (
              <div className="animate-fadeIn">
                <ArcadeTab games={cat.games} onRefresh={refresh} onUpload={() => openUpload('app')} onManage={() => setManager('games')} />
              </div>
            )}

            {mode === 'library' && (
              <div className="animate-fadeIn">
                <LibraryTab books={cat.books} onRefresh={refresh} onUpload={() => openUpload('book')} onManage={() => setManager('books')} />
              </div>
            )}

            {mode === 'models' && <ModelShelf models={cat.models} owner onUpload={() => openUpload('model')} onRefresh={refresh} />}

            {mode === 'studio' && profile && theme && (
              <div className="animate-fadeIn">
                <CustomizationStudioTab
                  initialLayout={activeLayout}
                  profile={profile}
                  theme={theme}
                  tracks={cat.tracks}
                  videos={cat.videos}
                  games={cat.games}
                  books={cat.books}
                  live={cat.live}
                  genres={usedVideoGenres}
                  onSaveLayout={saveLayout}
                  onSaveTheme={saveTheme}
                  onUpdateProfile={updateProfile}
                  onOpenUpload={() => openUpload('audio')}
                  onManageLibrary={() => setManager('music')}
                />
              </div>
            )}
          </>
        )}
      </main>

      <PlayerBar onOpen={() => setMode('radio')} hidden={mode === 'radio'} />

      <OmniPager raised={!!audio.current && mode !== 'radio'} />
      <FriendSpot />
      <CallWindow />
      <PartyLayer />
      {profile && (
        <ProfileEditor
          open={editProfile}
          onClose={() => setEditProfile(false)}
          profile={profile}
          accent={theme?.primaryColor}
          onSave={async u => {
            await updateProfile(u);
          }}
        />
      )}

      {profile && theme && (
        <ThemeCustomizerModal isOpen={isCustomizerOpen} onClose={() => setIsCustomizerOpen(false)} currentTheme={theme} profile={profile} onSaveTheme={saveTheme} />
      )}

      {profile && theme && (
        <WelcomeWizardModal
          isOpen={isWizardOpen}
          onClose={() => {
            setIsWizardOpen(false);
            if (profile.setupDone === false) updateProfile({ setupDone: true });
          }}
          currentProfile={profile}
          currentTheme={theme}
          onComplete={(p, t) => {
            updateProfile({ ...p, setupDone: true });
            saveTheme({ ...theme, ...t });
          }}
        />
      )}

      <UploadModal
        isOpen={upload.open}
        initialTab={upload.tab}
        onClose={() => setUpload(u => ({ ...u, open: false }))}
        channels={cat.channels}
        playlists={cat.playlists}
        collections={cat.collections}
        videoGenres={[...new Set([...cat.videoGenres, ...usedVideoGenres])]}
        musicGenres={musicGenres}
        onUploadSuccess={() => refreshCatalog(true)}
      />

      <LibraryManager
        open={manager}
        onClose={() => setManager(null)}
        tracks={cat.tracks}
        videos={cat.videos}
        channels={cat.channels}
        videoGenres={cat.videoGenres}
        books={cat.books}
        games={cat.games}
        onRefresh={refresh}
      />

      <MobileNav currentMode={mode} onSelectMode={setMode} />
    </div>
    </P2PProvider>
  );
}
