'use client';

import React, { useState } from 'react';
import { StationTheme, StationProfile } from '@/lib/db';
import { soundFX } from '@/components/sound/SoundFX';
import {
  Sliders,
  X,
  Sparkles,
  Palette,
  Type,
  Layout,
  Code,
  Check,
  RotateCcw,
  Eye,
  RadioTower,
  Play,
  Heart
} from 'lucide-react';

interface ThemeCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: StationTheme;
  profile: StationProfile;
  onSaveTheme: (theme: StationTheme) => void;
}

export const ThemeCustomizerModal: React.FC<ThemeCustomizerModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  profile,
  onSaveTheme
}) => {
  const [draftTheme, setDraftTheme] = useState<StationTheme>(currentTheme);
  const [activeTab, setActiveTab] = useState<'palette' | 'typography' | 'background' | 'css'>('palette');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  // Preset themes
  const presets: { name: string; theme: Partial<StationTheme> }[] = [
    {
      name: 'PulseAmp Obsidian',
      theme: {
        primaryColor: '#39ff88',
        surfaceColor: 'rgba(13, 22, 26, 0.90)',
        accentGlow: 'rgba(57, 255, 136, 0.35)',
        fontFamily: 'cyber',
        borderStyle: 'neon-glow',
        backgroundImage: 'radial-gradient(circle at 50% 20%, #1a323c 0%, #030608 75%)'
      }
    },
    {
      name: 'Cyberpunk Neon',
      theme: {
        primaryColor: '#ff00aa',
        surfaceColor: 'rgba(20, 15, 30, 0.90)',
        accentGlow: 'rgba(255, 0, 170, 0.40)',
        fontFamily: 'cyber',
        borderStyle: 'neon-glow',
        backgroundImage: 'radial-gradient(circle at 50% 20%, #3a1038 0%, #0e0716 80%)'
      }
    },
    {
      name: 'Vaporwave 95',
      theme: {
        primaryColor: '#ffaa00',
        surfaceColor: 'rgba(15, 28, 36, 0.92)',
        accentGlow: 'rgba(255, 170, 0, 0.30)',
        fontFamily: 'pixel',
        borderStyle: 'retro-bevel',
        backgroundImage: 'radial-gradient(circle at 50% 20%, #0d3b45 0%, #06151c 80%)'
      }
    },
    {
      name: 'Deep Space Terminal',
      theme: {
        primaryColor: '#38bdf8',
        surfaceColor: 'rgba(11, 16, 26, 0.90)',
        accentGlow: 'rgba(56, 189, 248, 0.35)',
        fontFamily: 'clean',
        borderStyle: 'modern',
        backgroundImage: 'radial-gradient(circle at 50% 20%, #11253e 0%, #070b12 80%)'
      }
    }
  ];

  const handleApplyPreset = (presetTheme: Partial<StationTheme>) => {
    setDraftTheme(prev => ({ ...prev, ...presetTheme }));
    soundFX.playCoin();
  };

  const handleSave = () => {
    onSaveTheme(draftTheme);
    setIsSaved(true);
    soundFX.playCoin();
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setDraftTheme(currentTheme);
    soundFX.playMessageSent();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl h-[88vh] bg-[#0d1017] border-2 border-[#283446] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#121721] border-b border-[#232c3c]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-mono text-white tracking-wider flex items-center gap-2">
                mAI SPOT STUDIO: THEME & LIVE CUSTOMIZER
              </h2>
              <p className="text-[11px] text-zinc-400">
                Personalize your public mAI Spot. Changes preview live in the right panel.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Studio Body: Split View (Controls Left, Live Preview Right) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* LEFT PANE: CONTROLS */}
          <div className="w-full md:w-[45%] border-b md:border-b-0 md:border-r border-[#222a3a] flex flex-col bg-[#0f131a] overflow-y-auto">
            {/* Presets Row */}
            <div className="p-4 border-b border-[#1f2635]">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2.5">
                <Sparkles className="w-3.5 h-3.5" />
                Quick Theme Presets
              </span>
              <div className="grid grid-cols-2 gap-2">
                {presets.map(p => (
                  <button
                    key={p.name}
                    onClick={() => handleApplyPreset(p.theme)}
                    className="px-3 py-2 rounded-xl text-xs font-mono font-semibold bg-[#161c26] hover:bg-[#1e2634] border border-[#2b3547] text-zinc-300 text-left transition-all hover:border-emerald-500/40"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Customizer Tabs */}
            <div className="flex border-b border-[#1f2635] bg-[#121620] text-xs font-mono">
              <button
                onClick={() => setActiveTab('palette')}
                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  activeTab === 'palette'
                    ? 'border-emerald-400 text-emerald-400 font-bold bg-[#171d28]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Colors</span>
              </button>
              <button
                onClick={() => setActiveTab('typography')}
                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  activeTab === 'typography'
                    ? 'border-emerald-400 text-emerald-400 font-bold bg-[#171d28]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Fonts</span>
              </button>
              <button
                onClick={() => setActiveTab('background')}
                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  activeTab === 'background'
                    ? 'border-emerald-400 text-emerald-400 font-bold bg-[#171d28]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layout className="w-3.5 h-3.5" />
                <span>Atmosphere</span>
              </button>
              <button
                onClick={() => setActiveTab('css')}
                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  activeTab === 'css'
                    ? 'border-emerald-400 text-emerald-400 font-bold bg-[#171d28]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Custom CSS</span>
              </button>
            </div>

            {/* Tab Panels */}
            <div className="p-4 flex-1 space-y-4 text-xs font-mono">
              {/* TAB 1: COLORS */}
              {activeTab === 'palette' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-zinc-400 block mb-1.5 font-bold">
                      Primary Neon Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draftTheme.primaryColor}
                        onChange={e => setDraftTheme({ ...draftTheme, primaryColor: e.target.value })}
                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                      />
                      <input
                        type="text"
                        value={draftTheme.primaryColor}
                        onChange={e => setDraftTheme({ ...draftTheme, primaryColor: e.target.value })}
                        className="flex-1 bg-[#141923] border border-[#293447] rounded-lg px-3 py-2 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1.5 font-bold">
                      Border Style Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['neon-glow', 'retro-bevel', 'modern'] as const).map(b => (
                        <button
                          key={b}
                          onClick={() => setDraftTheme({ ...draftTheme, borderStyle: b })}
                          className={`py-2 px-1 text-center rounded-lg border uppercase text-[10px] ${
                            draftTheme.borderStyle === b
                              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-400 font-bold'
                              : 'border-[#263143] text-zinc-400'
                          }`}
                        >
                          {b.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TYPOGRAPHY */}
              {activeTab === 'typography' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-zinc-400 block mb-1.5 font-bold">
                      Station Font Family
                    </label>
                    <div className="space-y-2">
                      {(['cyber', 'pixel', 'retro-serif', 'clean'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setDraftTheme({ ...draftTheme, fontFamily: f })}
                          className={`w-full py-2.5 px-3 text-left rounded-xl border flex items-center justify-between ${
                            draftTheme.fontFamily === f
                              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-400 font-bold'
                              : 'border-[#263143] text-zinc-300 bg-[#141923]'
                          }`}
                        >
                          <span className="capitalize">{f} Style</span>
                          <span className="text-[10px] text-zinc-500 uppercase">{f}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: ATMOSPHERE & BACKGROUND */}
              {activeTab === 'background' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-zinc-400 block mb-1.5 font-bold">
                      Background Gradient Formula
                    </label>
                    <textarea
                      value={draftTheme.backgroundImage || ''}
                      onChange={e => setDraftTheme({ ...draftTheme, backgroundImage: e.target.value })}
                      rows={3}
                      className="w-full bg-[#141923] border border-[#293447] rounded-lg p-2.5 text-white font-mono text-[11px]"
                      placeholder="e.g. radial-gradient(circle, #1a2332 0%, #0b0d11 100%)"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1.5 font-bold">
                      Background Tiling
                    </label>
                    <select
                      value={draftTheme.backgroundTiling}
                      onChange={e => setDraftTheme({ ...draftTheme, backgroundTiling: e.target.value as any })}
                      className="w-full bg-[#141923] border border-[#293447] rounded-lg px-3 py-2 text-white"
                    >
                      <option value="cover">Full Cover Scale</option>
                      <option value="repeat">Repeat Tiling (90s Wallpaper)</option>
                      <option value="tile-x">Horizontal Banner Tile</option>
                    </select>
                  </div>
                </div>
              )}

              {/* TAB 4: SCOPED CUSTOM CSS */}
              {activeTab === 'css' && (
                <div className="space-y-3">
                  <div className="text-[11px] text-zinc-400">
                    Scoped CSS will apply only to your station's canvas. Inputs and private OmniPager chats remain safe.
                  </div>
                  <textarea
                    value={draftTheme.customCss || ''}
                    onChange={e => setDraftTheme({ ...draftTheme, customCss: e.target.value })}
                    rows={8}
                    className="w-full bg-[#141923] border border-[#293447] rounded-lg p-2.5 text-emerald-400 font-mono text-[11px]"
                    placeholder="/* Custom CSS */&#10;.station-card { border-radius: 12px; }"
                  />
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-[#1f2635] flex items-center justify-between gap-3 bg-[#11151e]">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg transition-all"
              >
                {isSaved ? <Check className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{isSaved ? 'Saved!' : 'Save & Publish Theme'}</span>
              </button>
            </div>
          </div>

          {/* RIGHT PANE: LIVE SPLIT-SCREEN PREVIEW */}
          <div className="w-full md:w-[55%] flex flex-col bg-[#080a0f] p-4 sm:p-6 overflow-y-auto">
            <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Guest Viewport
              </span>
              <span>Invited Friend Perspective</span>
            </div>

            {/* Station Container Mock with Dynamic Styling applied in Real Time */}
            <div
              className="flex-1 rounded-2xl p-5 border transition-all duration-200 overflow-hidden shadow-2xl relative"
              style={{
                background: draftTheme.backgroundImage || '#11151e',
                borderColor: draftTheme.primaryColor,
                boxShadow: draftTheme.borderStyle === 'neon-glow'
                  ? `0 0 25px ${draftTheme.primaryColor}33`
                  : undefined
              }}
            >
              {/* Header preview */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div
                  className="w-14 h-14 rounded-xl overflow-hidden border-2 bg-black flex-shrink-0"
                  style={{ borderColor: draftTheme.primaryColor }}
                >
                  <img
                    src={profile.avatar}
                    alt="Preview Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className="font-bold text-white text-base tracking-wide"
                      style={{
                        fontFamily: draftTheme.fontFamily === 'pixel' ? 'Courier New, monospace' : 'inherit'
                      }}
                    >
                      {profile.stationName}
                    </h3>
                    <span
                      className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold"
                      style={{
                        color: draftTheme.primaryColor,
                        backgroundColor: `${draftTheme.primaryColor}22`,
                        border: `1px solid ${draftTheme.primaryColor}55`
                      }}
                    >
                      {profile.handle}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 italic mt-0.5">
                    &ldquo;{profile.moodBlurb}&rdquo;
                  </p>
                </div>
              </div>

              {/* Mini Winamp Player Card */}
              <div
                className="mt-4 p-3 rounded-xl border bg-black/60 backdrop-blur-md"
                style={{
                  borderColor: `${draftTheme.primaryColor}44`,
                  borderRadius: draftTheme.borderStyle === 'retro-bevel' ? '2px' : '12px'
                }}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-1.5">
                    <RadioTower className="w-3.5 h-3.5" style={{ color: draftTheme.primaryColor }} />
                    <span className="font-mono text-zinc-300 font-bold text-[11px]">
                      LIVE AUDIO STREAM
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-mono font-bold"
                    style={{ color: draftTheme.primaryColor }}
                  >
                    192 KBPS STEREO
                  </span>
                </div>
                {/* Fake Visualizer bars */}
                <div className="h-6 w-full flex items-end gap-1 bg-black/80 p-1 rounded">
                  {[60, 90, 40, 80, 100, 30, 75, 95, 50, 85, 45, 70].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 transition-all duration-300 rounded-t-sm"
                      style={{
                        height: `${h}%`,
                        backgroundColor: draftTheme.primaryColor
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Mini Arcade Card */}
              <div
                className="mt-3 p-3 rounded-xl border bg-black/40 backdrop-blur-md"
                style={{
                  borderColor: `${draftTheme.primaryColor}33`,
                  borderRadius: draftTheme.borderStyle === 'retro-bevel' ? '2px' : '12px'
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">
                      Cyber Asteroids 2099
                    </span>
                    <span className="text-[9px] font-mono text-zinc-400">
                      Arcade Game
                    </span>
                  </div>
                  <button
                    className="px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all"
                    style={{
                      backgroundColor: draftTheme.primaryColor,
                      color: '#000'
                    }}
                  >
                    Play
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
