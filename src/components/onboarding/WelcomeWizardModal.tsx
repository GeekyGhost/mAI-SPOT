'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, X, Camera, ShieldCheck, Ticket, FolderOpen, Sparkles, Lock, Users } from 'lucide-react';
import type { StationProfile, StationTheme } from '@/lib/types';
import { soundFX } from '@/components/sound/SoundFX';
import { Art, Btn, inputCls } from '@/components/ui/kit';
import { ImageCropper } from '@/components/profile/ImageCropper';
import { useP2P } from '@/components/social/P2PProvider';

interface WelcomeWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: StationProfile;
  currentTheme: StationTheme;
  onComplete: (profile: Partial<StationProfile>, theme: Partial<StationTheme>) => void;
}

// What each starter look sets (colour, glow, background, font, borders).
const LOOKS: { name: string; desc: string; theme: Partial<StationTheme> }[] = [
  {
    name: 'Midnight Neon',
    desc: 'Cyan glow on deep blue-black',
    theme: { primaryColor: '#2ee8f7', accentGlow: 'rgba(46, 232, 247, 0.35)', backgroundImage: 'radial-gradient(circle at 50% 10%, #0f2a33 0%, #030608 70%)', fontFamily: 'clean', borderStyle: 'modern' }
  },
  {
    name: 'PulseAmp Green',
    desc: 'Classic LCD green and industrial chrome',
    theme: { primaryColor: '#39ff88', accentGlow: 'rgba(57, 255, 136, 0.35)', backgroundImage: 'radial-gradient(circle at 50% 20%, #13241c 0%, #030608 75%)', fontFamily: 'cyber', borderStyle: 'neon-glow' }
  },
  {
    name: 'Synthwave',
    desc: 'Hot magenta and a midnight grid',
    theme: { primaryColor: '#ff3d9a', accentGlow: 'rgba(255, 61, 154, 0.35)', backgroundImage: 'radial-gradient(circle at 50% 10%, #2a0b2e 0%, #07030c 75%)', fontFamily: 'clean', borderStyle: 'neon-glow' }
  },
  {
    name: 'Vaporwave 95',
    desc: 'Beveled windows and a teal sunset',
    theme: { primaryColor: '#ffaa00', accentGlow: 'rgba(255, 170, 0, 0.3)', backgroundImage: 'linear-gradient(180deg, #0f3d46 0%, #2b1440 100%)', fontFamily: 'pixel', borderStyle: 'retro-bevel' }
  }
];

const STARTERS = ['/api/media/thumbnails/thumb_neon.svg', '/api/media/thumbnails/thumb_lofi.svg', '/api/media/thumbnails/thumb_space.svg', '/api/media/thumbnails/thumb_pulse.svg', '/api/media/thumbnails/thumb_highway.svg'];

/** First run: who you are, how your Spot looks, and how sharing works. */
export const WelcomeWizardModal: React.FC<WelcomeWizardModalProps> = ({ isOpen, onClose, currentProfile, currentTheme, onComplete }) => {
  const p2p = useP2P();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [spotName, setSpotName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [look, setLook] = useState(0);
  const [crop, setCrop] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setName(currentProfile.displayName || '');
    setHandle((currentProfile.handle || '').replace(/^@/, ''));
    setSpotName(currentProfile.stationName && currentProfile.stationName !== 'My Spot' ? currentProfile.stationName : '');
    setAvatar(currentProfile.avatar || '');
    const i = LOOKS.findIndex(l => l.theme.primaryColor === currentTheme.primaryColor);
    setLook(i >= 0 ? i : 0);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || typeof document === 'undefined') return null;

  const finish = (thenInvite: boolean) => {
    soundFX.playCoin();
    onComplete(
      {
        displayName: name.trim(),
        stationName: spotName.trim() || (name.trim() ? `${name.trim()}’s Spot` : 'My Spot'),
        handle: handle ? `@${handle}` : '',
        avatar,
        isOnline: true
      },
      LOOKS[look].theme
    );
    onClose();
    if (thenInvite) setTimeout(() => p2p.setDialog({ type: 'invite' }), 300);
  };

  const steps = ['You', 'Your look', 'Sharing'];
  const accent = LOOKS[look].theme.primaryColor!;

  return createPortal(
    <div className="fixed inset-0 z-[58] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#0b1216] border border-[#1f3a45] rounded-3xl shadow-2xl overflow-hidden">
        <div className="relative h-28 spot-grain" style={{ background: `linear-gradient(115deg, ${accent}55, #ff2e6e33 55%, #0b1216)` }}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-zinc-300 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-4 left-6">
            <div className="text-[11px] font-black tracking-[0.25em] text-white/70">WELCOME TO</div>
            <div className="text-3xl font-bold text-white">
              m<span style={{ color: accent }}>AI</span> Spot
            </div>
          </div>
          <div className="absolute bottom-4 right-6 flex gap-2">
            {steps.map((s, i) => (
              <span key={s} className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${step === i + 1 ? 'bg-white text-black' : step > i + 1 ? 'bg-white/20 text-white' : 'bg-black/30 text-white/60'}`}>
                {step > i + 1 ? <Check className="w-3 h-3 inline -mt-0.5" /> : i + 1} {s}
              </span>
            ))}
          </div>
        </div>

        <div className="p-6 min-h-[340px]">
          {step === 1 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <h3 className="text-xl font-bold text-white">Who are you?</h3>
                <p className="text-sm text-zinc-400">This is how friends will see you. Everything lives on this computer; there’s no account to make.</p>
              </div>
              <div className="flex gap-5 items-start">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <button onClick={() => setCrop(true)} className="relative group" title="Choose a picture">
                    <Art src={avatar} title={(name || '?').slice(0, 2).toUpperCase()} className="w-24 h-24 rounded-3xl border-2" />
                    <span className="absolute inset-0 rounded-3xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                      <Camera className="w-6 h-6" />
                    </span>
                  </button>
                  <div className="flex gap-1">
                    {STARTERS.map(a => (
                      <button key={a} onClick={() => setAvatar(a)} className={`w-6 h-6 rounded-md overflow-hidden border ${avatar === a ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                        <img src={a} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setCrop(true)} className="text-[11px] text-zinc-400 hover:text-white">Use my own picture</button>
                </div>
                <div className="flex-1 space-y-3">
                  <label className="block">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">Your name</span>
                    <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Willie" maxLength={80} autoFocus />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">Handle</span>
                    <div className="flex items-center bg-black/40 border border-[#1f3a45] rounded-lg focus-within:border-[var(--spot-accent)]">
                      <span className="pl-3 text-zinc-500">@</span>
                      <input className="flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none" value={handle} onChange={e => setHandle(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''))} placeholder="yourname" maxLength={32} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">Name your Spot (optional)</span>
                    <input className={inputCls} value={spotName} onChange={e => setSpotName(e.target.value)} placeholder={name ? `${name}’s Spot` : 'Midnight Radio'} maxLength={80} />
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <h3 className="text-xl font-bold text-white">Pick a look</h3>
                <p className="text-sm text-zinc-400">You can change every colour, font and layout later in Studio.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {LOOKS.map((l, i) => (
                  <button
                    key={l.name}
                    onClick={() => setLook(i)}
                    className={`relative rounded-2xl p-4 text-left border-2 transition-all ${look === i ? 'border-white' : 'border-transparent hover:border-white/30'}`}
                    style={{ background: l.theme.backgroundImage }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full" style={{ background: l.theme.primaryColor, boxShadow: `0 0 12px ${l.theme.primaryColor}` }} />
                      <span className="font-bold text-white">{l.name}</span>
                      {look === i && <Check className="w-4 h-4 text-white ml-auto" />}
                    </div>
                    <p className="text-xs text-white/70 mt-1">{l.desc}</p>
                    <div className="mt-3 h-1.5 rounded-full" style={{ background: l.theme.primaryColor }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <h3 className="text-xl font-bold text-white">How sharing works</h3>
                <p className="text-sm text-zinc-400">Your Spot is yours. It runs on this PC and talks straight to your friends’ Spots.</p>
              </div>
              <div className="grid gap-3">
                {[
                  [Lock, 'Private by default', 'Nobody sees anything until you make them a friend.'],
                  [Ticket, 'One-time invite links', 'Each link works once, for one person, so it can’t be passed around.'],
                  [ShieldCheck, 'You choose, per friend', 'Share a single radio station, one album, a game, a book… or everything. Even just for a day.'],
                  [Users, 'Do things together', 'Tune in to friends’ stations on the Radio Dial, listen along, and host watch parties.'],
                  [FolderOpen, 'Your files stay yours', 'Music, videos, pictures and books live in this folder. Drop files in and they appear.']
                ].map(([Icon, title, body]) => {
                  const I = Icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
                  return (
                    <div key={title as string} className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                        <I className="w-4 h-4" style={{ color: accent }} />
                      </span>
                      <div>
                        <div className="text-sm font-bold text-white">{title as string}</div>
                        <div className="text-xs text-zinc-400">{body as string}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#1a323c] flex items-center justify-between">
          {step > 1 ? <Btn onClick={() => setStep(step - 1)}>Back</Btn> : <button onClick={onClose} className="text-xs text-zinc-500 hover:text-white">Skip for now</button>}
          {step < 3 ? (
            <Btn variant="primary" onClick={() => setStep(step + 1)}>
              Continue <ArrowRight className="w-4 h-4" />
            </Btn>
          ) : (
            <div className="flex gap-2">
              <Btn onClick={() => finish(false)}>
                <Sparkles className="w-4 h-4" /> Start exploring
              </Btn>
              <Btn variant="primary" onClick={() => finish(true)}>
                <Ticket className="w-4 h-4" /> Invite my first friend
              </Btn>
            </div>
          )}
        </div>
      </div>
      <div onMouseDown={e => e.stopPropagation()}>
        <ImageCropper open={crop} onClose={() => setCrop(false)} aspect={1} outWidth={512} round title="Your picture" onDone={u => setAvatar(u)} />
      </div>
    </div>,
    document.body
  );
};
