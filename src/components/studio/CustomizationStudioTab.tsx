'use client';

import React, { useState, useEffect } from 'react';
import type { LayoutConfig, StationProfile, StationTheme, Track, Video, Game, Book, LiveBroadcast, MediaAsset } from '@/lib/types';
import {
  Sliders,
  Eye,
  Check,
  RotateCcw,
  Music2,
  Tv,
  Gamepad2,
  Image as ImageIcon,
  MessageSquare,
  Sparkles,
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  FolderOpen,
  Smartphone,
  Monitor,
  Disc3,
  Flame,
  Plus,
  Play,
  Volume2,
  Palette,
  CheckCircle2
} from 'lucide-react';
import { Pencil as PencilIcon } from 'lucide-react';
import { soundFX } from '@/components/sound/SoundFX';

// Player Components for Live Visitor Viewport
import { VisualizerPicker } from '@/components/audio/Controls';
import { LayoutDesigner, LookPanel, SpotPreview } from '@/components/spot/SpotLayout';
import { glowFor } from '@/components/spot/layoutModel';
import { defaultLayout } from '@/lib/defaults';



interface CustomizationStudioTabProps {
  initialLayout: LayoutConfig;
  profile: StationProfile;
  theme: StationTheme;
  tracks: Track[];
  videos: Video[];
  games: Game[];
  books?: Book[];
  live?: LiveBroadcast | null;
  genres: string[];
  onSaveLayout: (layout: LayoutConfig) => Promise<void>;
  onSaveTheme?: (theme: StationTheme) => Promise<void>;
  onUpdateProfile?: (updates: Partial<StationProfile>) => void;
  onOpenUpload: () => void;
  onManageLibrary?: () => void;
}

export const CustomizationStudioTab: React.FC<CustomizationStudioTabProps> = ({
  initialLayout,
  profile,
  theme,
  tracks,
  videos,
  games,
  books = [],
  live = null,
  genres,
  onSaveLayout,
  onSaveTheme,
  onUpdateProfile,
  onOpenUpload,
  onManageLibrary
}) => {
  const [draftLayout, setDraftLayout] = useState<LayoutConfig>(initialLayout);
  const [draftTheme, setDraftTheme] = useState<StationTheme>(theme);
  const [activeTab, setActiveTab] = useState<'layout' | 'categories' | 'assets' | 'theme'>('layout');
  const [arrangePreview, setArrangePreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [isSaved, setIsSaved] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetFilter, setAssetFilter] = useState<'all' | 'audio' | 'video' | 'thumbnail' | 'game'>('all');
  const [newMusicGenre, setNewMusicGenre] = useState('');
  const [newVideoGenre, setNewVideoGenre] = useState('');

  // Fetch asset library
  const loadAssets = async () => {
    try {
      const res = await fetch('/api/assets');
      const data = await res.json();
      if (data.success) {
        setAssets(data.assets);
      }
    } catch (e) {
      console.error('Failed to load assets:', e);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleSaveAll = async () => {
    try {
      await onSaveLayout(draftLayout);
      if (onSaveTheme) {
        await onSaveTheme(draftTheme);
      }
      setIsSaved(true);
      soundFX.playCoin();
      setTimeout(() => setIsSaved(false), 3000);
    } catch (e) {
      console.error('Save failed:', e);
    }
  };

  const handleResetDefaults = () => {
    setDraftLayout({ ...defaultLayout, activeMusicGenres: draftLayout.activeMusicGenres, activeVideoGenres: draftLayout.activeVideoGenres });
    soundFX.playClick();
  };

  // Delete an asset
  const handleDeleteAsset = async (type: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
    try {
      const res = await fetch(`/api/assets?type=${type}&filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setAssets(data.assets);
        soundFX.playCoin();
      }
    } catch (e) {
      console.error('Delete asset failed:', e);
    }
  };

  // Filtered asset list
  const filteredAssets =
    assetFilter === 'all' ? assets : assets.filter(a => a.type === assetFilter);

  return (
    <div className="flex flex-col gap-4 font-sans animate-fadeIn">
      {/* Studio Header Bar */}
      <div className="bg-[#080f12]/95 border border-[#1b323c] rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-[#2ee8f7] to-[#12949f] text-black shadow-md">
            <Sliders className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-2xl text-white">
                Studio
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#14262f] text-[#2ee8f7] border border-[#2ee8f7]/40 flex items-center gap-1">
                <Eye className="w-3 h-3" />
                LIVE PREVIEW
              </span>
            </div>
            <p className="text-sm text-[#629ba8]">
              Lay out your Spot, pick player styles and colours, and manage your files. The preview shows what you’ll see.
            </p>
          </div>
        </div>

        {/* Action Controls & Device Preview Mode Switcher */}
        <div className="flex items-center gap-2">
          {/* Device toggle */}
          <div className="flex items-center bg-[#0d161a] p-1 rounded-xl border border-[#1b323c]">
            <button
              onClick={() => setPreviewDevice('desktop')}
              className={`p-1.5 rounded-lg transition-all ${
                previewDevice === 'desktop'
                  ? 'bg-[#182930] text-[#2ee8f7] shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Desktop View (Full Width)"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPreviewDevice('mobile')}
              className={`p-1.5 rounded-lg transition-all ${
                previewDevice === 'mobile'
                  ? 'bg-[#182930] text-[#2ee8f7] shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Mobile Device View (Simulated phone width)"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-xl bg-[#0d161a] hover:bg-[#16252b] border border-[#1b323c] text-xs font-mono text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all"
            title="Reset all settings to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </button>

          <button
            onClick={handleSaveAll}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#2ee8f7] via-[#39ff88] to-[#12b362] hover:brightness-110 text-black font-bold font-mono text-xs shadow-lg shadow-[#2ee8f7]/20 flex items-center gap-1.5 transition-all"
          >
            {isSaved ? <CheckCircle2 className="w-4 h-4 fill-black" /> : <Check className="w-4 h-4 stroke-[3]" />}
            <span>{isSaved ? 'SAVED TO SPOT!' : 'SAVE LAYOUT'}</span>
          </button>
        </div>
      </div>

      {/* Main Split-Screen Workspace: Studio Controls (Left) vs Live Visitor Viewport (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Side: Studio Control Panes (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Studio Navigation Tabs */}
          <div className="grid grid-cols-4 bg-[#0a1215] border border-[#1a313b] p-1 rounded-xl shadow">
            <button
              onClick={() => setActiveTab('layout')}
              className={`py-2 text-xs font-mono font-bold rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                activeTab === 'layout'
                  ? 'bg-[#14262f] text-[#2ee8f7] border border-[#2ee8f7]/40 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Layout</span>
            </button>

            <button
              onClick={() => setActiveTab('categories')}
              className={`py-2 text-xs font-mono font-bold rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                activeTab === 'categories'
                  ? 'bg-[#14262f] text-[#f9993c] border border-[#f9993c]/40 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Genres</span>
            </button>

            <button
              onClick={() => setActiveTab('assets')}
              className={`py-2 text-xs font-mono font-bold rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                activeTab === 'assets'
                  ? 'bg-[#14262f] text-[#39ff88] border border-[#39ff88]/40 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Assets</span>
            </button>

            <button
              onClick={() => setActiveTab('theme')}
              className={`py-2 text-xs font-mono font-bold rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 ${
                activeTab === 'theme'
                  ? 'bg-[#14262f] text-[#ff2e6e] border border-[#ff2e6e]/40 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Theme</span>
            </button>
          </div>

          {/* TAB 1: LAYOUT & PLAYERS */}
          {activeTab === 'layout' && (
            <div className="bg-[#080f12]/90 border border-[#1b323c] rounded-2xl p-4 shadow-xl flex flex-col gap-4">
              {/* Music Player Style Picker */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Music2 className="w-4 h-4 text-[#39ff88]" />
                  <h4 className="font-mono text-xs font-bold text-white uppercase">
                    Music player style
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Style 1: PulseAmp Retro Deck */}
                  <div
                    onClick={() => {
                      setDraftLayout({ ...draftLayout, musicPlayerStyle: 'pulseamp_deck' });
                      soundFX.playClick();
                    }}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      draftLayout.musicPlayerStyle === 'pulseamp_deck'
                        ? 'bg-[#112328] border-[#39ff88] shadow-[0_0_12px_rgba(57,255,136,0.25)]'
                        : 'bg-[#0d161a] border-[#182d36] hover:border-zinc-500'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold text-[#39ff88] mb-1">
                      PulseAmp Deck
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      LCD timer, scrolling title, 10-band EQ & visualizer.
                    </p>
                  </div>

                  {/* Style 2: Compact Hi-Fi Deck */}
                  <div
                    onClick={() => {
                      setDraftLayout({ ...draftLayout, musicPlayerStyle: 'compact_player' });
                      soundFX.playClick();
                    }}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      draftLayout.musicPlayerStyle === 'compact_player'
                        ? 'bg-[#112328] border-[#2ee8f7] shadow-[0_0_12px_rgba(46,232,247,0.25)]'
                        : 'bg-[#0d161a] border-[#182d36] hover:border-zinc-500'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold text-[#2ee8f7] mb-1">
                      Compact Hi-Fi
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Clean modern card with cover art.
                    </p>
                  </div>

                  {/* Style 3: Vinyl Turntable */}
                  <div
                    onClick={() => {
                      setDraftLayout({ ...draftLayout, musicPlayerStyle: 'vinyl_turntable' });
                      soundFX.playClick();
                    }}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      draftLayout.musicPlayerStyle === 'vinyl_turntable'
                        ? 'bg-[#112328] border-[#f9993c] shadow-[0_0_12px_rgba(249,153,60,0.25)]'
                        : 'bg-[#0d161a] border-[#182d36] hover:border-zinc-500'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold text-[#f9993c] mb-1">
                      Vinyl Turntable
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Spinning record with a tonearm that tracks the song.
                    </p>
                  </div>
                </div>
              </div>

              {/* Visualizer */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-[#2ee8f7]" />
                  <h4 className="font-mono text-xs font-bold text-white uppercase">Visualizer</h4>
                </div>
                <VisualizerPicker
                  value={draftLayout.visualizerMode || 'spectrum'}
                  onChange={v => setDraftLayout({ ...draftLayout, visualizerMode: v })}
                />
              </div>

              {/* Video Player Style Picker */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Tv className="w-4 h-4 text-[#f9993c]" />
                  <h4 className="font-mono text-xs font-bold text-white uppercase">
                    TV style
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Video Style 1: ChromaVision Cinema */}
                  <div
                    onClick={() => {
                      setDraftLayout({ ...draftLayout, videoPlayerStyle: 'chromavision_theater' });
                      soundFX.playClick();
                    }}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      draftLayout.videoPlayerStyle === 'chromavision_theater'
                        ? 'bg-[#112328] border-[#f9993c] shadow-[0_0_12px_rgba(249,153,60,0.25)]'
                        : 'bg-[#0d161a] border-[#182d36] hover:border-zinc-500'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold text-[#f9993c] mb-1">
                      Modern TV
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Clean screen, channel strip and a big pause button.
                    </p>
                  </div>

                  {/* Video Style 2: Multi-Channel Grid */}
                  <div
                    onClick={() => {
                      setDraftLayout({ ...draftLayout, videoPlayerStyle: 'channel_grid' });
                      soundFX.playClick();
                    }}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      draftLayout.videoPlayerStyle === 'channel_grid'
                        ? 'bg-[#112328] border-[#2ee8f7] shadow-[0_0_12px_rgba(46,232,247,0.25)]'
                        : 'bg-[#0d161a] border-[#182d36] hover:border-zinc-500'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold text-[#2ee8f7] mb-1">
                      Channel Grid
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Genre chips and a wall of channel tiles.
                    </p>
                  </div>

                  {/* Video Style 3: 24/7 Dial TV */}
                  <div
                    onClick={() => {
                      setDraftLayout({ ...draftLayout, videoPlayerStyle: 'leanback_tv' });
                      soundFX.playClick();
                    }}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      draftLayout.videoPlayerStyle === 'leanback_tv'
                        ? 'bg-[#112328] border-[#ffcf33] shadow-[0_0_12px_rgba(255,207,51,0.25)]'
                        : 'bg-[#0d161a] border-[#182d36] hover:border-zinc-500'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold text-[#ffcf33] mb-1">
                      Vintage Dial TV
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Wood cabinet, rotary channel knob and static.
                    </p>
                  </div>
                </div>
              </div>

              {/* Spot page arrangement */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#2ee8f7]" />
                    <h4 className="font-mono text-xs font-bold text-white uppercase">Arrange your Spot</h4>
                  </div>
                  <label className="text-[10px] font-mono text-zinc-400 flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={arrangePreview} onChange={e => setArrangePreview(e.target.checked)} className="accent-[#2ee8f7]" />
                    Arrange in preview
                  </label>
                </div>
                <LayoutDesigner layout={draftLayout} onChange={setDraftLayout} />
              </div>

              {/* Spot look */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Palette className="w-4 h-4 text-[#ff7ad9]" />
                  <h4 className="font-mono text-xs font-bold text-white uppercase">Look &amp; feel</h4>
                </div>
                <LookPanel
                  layout={draftLayout}
                  theme={draftTheme}
                  onLayout={setDraftLayout}
                  onAccent={c => setDraftTheme({ ...draftTheme, primaryColor: c, accentGlow: glowFor(c) })}
                />
              </div>
            </div>
          )}

          {/* TAB 2: CATEGORIES & GENRES */}
          {activeTab === 'categories' && (
            <div className="bg-[#080f12]/90 border border-[#1b323c] rounded-2xl p-4 shadow-xl flex flex-col gap-4">
              {/* Music Genres Customizer */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Music2 className="w-4 h-4 text-[#39ff88]" />
                    <h4 className="font-mono text-xs font-bold text-white uppercase">
                      Active Audio Genres
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {draftLayout.activeMusicGenres.length} active
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {draftLayout.activeMusicGenres.map(g => (
                    <span
                      key={g}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-[#112328] border border-[#1e3c45] text-[#39ff88]"
                    >
                      <span>{g}</span>
                      <button
                        onClick={() => {
                          setDraftLayout({
                            ...draftLayout,
                            activeMusicGenres: draftLayout.activeMusicGenres.filter(x => x !== g)
                          });
                          soundFX.playClick();
                        }}
                        className="text-zinc-500 hover:text-red-400"
                        title="Remove genre"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add new genre */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMusicGenre}
                    onChange={e => setNewMusicGenre(e.target.value)}
                    placeholder="Add audio genre (e.g. Darkwave)"
                    className="flex-1 bg-[#0b1417] border border-[#1b323c] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-[#39ff88]"
                  />
                  <button
                    onClick={() => {
                      if (!newMusicGenre.trim()) return;
                      if (!draftLayout.activeMusicGenres.includes(newMusicGenre.trim())) {
                        setDraftLayout({
                          ...draftLayout,
                          activeMusicGenres: [...draftLayout.activeMusicGenres, newMusicGenre.trim()]
                        });
                        setNewMusicGenre('');
                        soundFX.playCoin();
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#12242a] hover:bg-[#1a363e] text-[#39ff88] border border-[#1e3c45] text-xs font-mono font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Video Categories Customizer */}
              <div className="pt-3 border-t border-[#162931]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Tv className="w-4 h-4 text-[#f9993c]" />
                    <h4 className="font-mono text-xs font-bold text-white uppercase">
                      Active Video Categories
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {draftLayout.activeVideoGenres.length} active
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {draftLayout.activeVideoGenres.map(g => (
                    <span
                      key={g}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-[#21160d] border border-[#3e2716] text-[#f9993c]"
                    >
                      <span>{g}</span>
                      <button
                        onClick={() => {
                          setDraftLayout({
                            ...draftLayout,
                            activeVideoGenres: draftLayout.activeVideoGenres.filter(x => x !== g)
                          });
                          soundFX.playClick();
                        }}
                        className="text-zinc-500 hover:text-red-400"
                        title="Remove category"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add new video genre */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newVideoGenre}
                    onChange={e => setNewVideoGenre(e.target.value)}
                    placeholder="Add video category (e.g. Cyberpunk 4K)"
                    className="flex-1 bg-[#0b1417] border border-[#1b323c] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-[#f9993c]"
                  />
                  <button
                    onClick={() => {
                      if (!newVideoGenre.trim()) return;
                      if (!draftLayout.activeVideoGenres.includes(newVideoGenre.trim())) {
                        setDraftLayout({
                          ...draftLayout,
                          activeVideoGenres: [...draftLayout.activeVideoGenres, newVideoGenre.trim()]
                        });
                        setNewVideoGenre('');
                        soundFX.playCoin();
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#21160d] hover:bg-[#342214] text-[#f9993c] border border-[#3e2716] text-xs font-mono font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ASSET LIBRARY MANAGER */}
          {activeTab === 'assets' && (
            <div className="bg-[#080f12]/90 border border-[#1b323c] rounded-2xl p-4 shadow-xl flex flex-col gap-3">
              {/* Top Filter Buttons & Quick Upload */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#162931]">
                <div className="flex gap-1 overflow-x-auto">
                  {(['all', 'audio', 'video', 'thumbnail', 'game'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setAssetFilter(t)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono capitalize transition-all border ${
                        assetFilter === t
                          ? 'bg-[#14262f] text-[#39ff88] border-[#39ff88]/40 font-bold'
                          : 'bg-[#0d161a] text-zinc-400 border-[#1a313b]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {onManageLibrary && (
                  <button
                    onClick={onManageLibrary}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] font-mono flex items-center gap-1 shrink-0"
                    title="Edit titles, tags and cover art"
                  >
                    <PencilIcon className="w-3 h-3" />
                    <span>Edit details & art</span>
                  </button>
                )}
                <button
                  onClick={onOpenUpload}
                  className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#f9993c] to-[#ff2e6e] text-black font-bold text-[11px] font-mono flex items-center gap-1 shrink-0"
                >
                  <Upload className="w-3 h-3 stroke-[3]" />
                  <span>Upload</span>
                </button>
              </div>

              {/* Asset Files List */}
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
                {filteredAssets.length === 0 ? (
                  <div className="text-center py-6 text-zinc-500 font-mono text-xs">
                    No media assets found in this filter.
                  </div>
                ) : (
                  filteredAssets.map(asset => (
                    <div
                      key={asset.url}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#0b1417] border border-[#182d36] hover:border-[#22404b] transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Type Icon Thumbnail */}
                        <div className="w-9 h-9 rounded-lg bg-[#112328] border border-[#1c3a44] flex items-center justify-center shrink-0">
                          {asset.type === 'audio' && <Music2 className="w-4 h-4 text-[#39ff88]" />}
                          {asset.type === 'video' && <Tv className="w-4 h-4 text-[#f9993c]" />}
                          {asset.type === 'thumbnail' && <ImageIcon className="w-4 h-4 text-[#2ee8f7]" />}
                          {asset.type === 'game' && <Gamepad2 className="w-4 h-4 text-[#ff2e6e]" />}
                        </div>

                        <div className="min-w-0">
                          <h5 className="font-mono text-xs text-white font-bold truncate">
                            {asset.associatedTitle || asset.filename}
                          </h5>
                          <p className="font-mono text-[10px] text-zinc-400 truncate">
                            {asset.filename} • {asset.sizeFormatted}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-[#112328] hover:bg-[#1a3842] text-[#2ee8f7] border border-[#1c3a44]"
                          title="Open Asset Preview"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleDeleteAsset(asset.type, asset.filename)}
                          className="p-1.5 rounded-lg bg-[#241313] hover:bg-[#381c1c] text-red-400 border border-[#3e1e1e]"
                          title="Delete from Node"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: THEME & VISUAL STYLING */}
          {activeTab === 'theme' && (
            <div className="bg-[#080f12]/90 border border-[#1b323c] rounded-2xl p-4 shadow-xl flex flex-col gap-4">
              {/* Presets */}
              <div>
                <h4 className="font-mono text-xs font-bold text-white uppercase mb-2">
                  Preset Color & Atmosphere Themes
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: 'PulseAmp Emerald', primary: '#39ff88', bg: 'radial-gradient(circle at 50% 20%, #1a323c 0%, #030608 75%)' },
                    { name: 'Cyber Neon Cyan', primary: '#2ee8f7', bg: 'radial-gradient(circle at 50% 20%, #152b36 0%, #030608 80%)' },
                    { name: 'Vaporwave Sunset', primary: '#f9993c', bg: 'radial-gradient(circle at 50% 20%, #3a1c11 0%, #080604 80%)' },
                    { name: 'Hot Magenta 2099', primary: '#ff2e6e', bg: 'radial-gradient(circle at 50% 20%, #3a1024 0%, #0c0408 80%)' }
                  ].map(p => (
                    <button
                      key={p.name}
                      onClick={() => {
                        setDraftTheme({
                          ...draftTheme,
                          primaryColor: p.primary,
                          backgroundImage: p.bg
                        });
                        soundFX.playCoin();
                      }}
                      className="p-2 rounded-xl bg-[#0d161a] border border-[#1a313b] hover:border-[#2ee8f7] text-left transition-all"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.primary }} />
                        <span className="font-mono text-xs font-bold text-white">{p.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Color picker */}
              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1.5">
                  Custom Primary Accent Glow:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={draftTheme.primaryColor}
                    onChange={e => setDraftTheme({ ...draftTheme, primaryColor: e.target.value })}
                    className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0"
                  />
                  <input
                    type="text"
                    value={draftTheme.primaryColor}
                    onChange={e => setDraftTheme({ ...draftTheme, primaryColor: e.target.value })}
                    className="flex-1 bg-[#0b1417] border border-[#1b323c] rounded-xl px-3 py-1.5 text-xs text-white font-mono uppercase"
                  />
                </div>
              </div>

              {/* Typography style */}
              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1.5">
                  Station Typography:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['cyber', 'pixel', 'clean', 'retro-serif'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setDraftTheme({ ...draftTheme, fontFamily: f })}
                      className={`p-2 rounded-xl border text-xs font-mono capitalize transition-all ${
                        draftTheme.fontFamily === f
                          ? 'bg-[#14262f] border-[#2ee8f7] text-[#2ee8f7] font-bold'
                          : 'bg-[#0d161a] border-[#1a313b] text-zinc-400'
                      }`}
                    >
                      {f} Font
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: LIVE VISITOR VIEWPORT (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-2">
          {/* Viewport Frame Header */}
          <div className="bg-[#0b1317] border border-[#1a323c] px-4 py-2 rounded-t-2xl flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              <span className="ml-2 text-zinc-300 font-bold">
                spot://{profile.handle.replace('@', '').split('#')[0]}.p2p/visitor-view
              </span>
            </div>
            <span className="text-[10px] text-[#2ee8f7] font-bold">
              {previewDevice === 'desktop' ? 'DESKTOP 1080P' : 'MOBILE 414px'}
            </span>
          </div>

          {/* Live preview: the real Spot page, scaled down */}
          <div className="border-x border-b border-[#1a323c] rounded-b-2xl overflow-hidden max-h-[820px] overflow-y-auto scrollbar-thin shadow-2xl" data-testid="studio-preview">
            <SpotPreview
              device={previewDevice}
              layout={draftLayout}
              theme={draftTheme}
              profile={profile}
              data={{ tracks, videos, games, books, live, videoGenres: draftLayout.activeVideoGenres?.length ? draftLayout.activeVideoGenres : genres }}
              on={{ editProfile: () => {}, customize: () => {}, go: () => {}, upload: () => onOpenUpload(), saveLayout: setDraftLayout }}
              arrange={arrangePreview}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
