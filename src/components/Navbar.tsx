'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Radio, Film, Upload, Sliders, Wand2, Compass, Users, Gamepad2, Library, Images, UserCircle2, Ticket, ShieldCheck, ChevronDown } from 'lucide-react';
import type { StationProfile } from '@/lib/types';
import { useP2P } from '@/components/social/P2PProvider';
import { Art } from '@/components/ui/kit';

export type AppMode = 'maispot' | 'feed' | 'radio' | 'cinema' | 'gallery' | 'arcade' | 'library' | 'studio';

export const MODES: { id: AppMode; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { id: 'maispot', label: 'Spot', icon: Compass, color: '#2ee8f7' },
  { id: 'feed', label: 'Friends', icon: Users, color: '#ff2e6e' },
  { id: 'radio', label: 'Radio', icon: Radio, color: '#39ff88' },
  { id: 'cinema', label: 'Cinema', icon: Film, color: '#f9993c' },
  { id: 'gallery', label: 'Pictures', icon: Images, color: '#ff7ad9' },
  { id: 'arcade', label: 'Arcade', icon: Gamepad2, color: '#39ff88' },
  { id: 'library', label: 'Library', icon: Library, color: '#ffcf33' },
  { id: 'studio', label: 'Studio', icon: Sliders, color: '#a78bfa' }
];

/** Friend requests + unread messages, for the Friends badge. */
export function useFriendsBadge(): number {
  const { state } = useP2P();
  if (!state) return 0;
  return state.requests.incoming.length + state.friends.reduce((n, f) => n + (f.unread || 0), 0) + state.parties.filter(p => p.status === 'invited').length;
}

interface NavbarProps {
  currentMode: AppMode;
  onSelectMode: (mode: AppMode) => void;
  onOpenUpload: () => void;
  onOpenWizard?: () => void;
  onEditProfile: () => void;
  profile?: StationProfile;
  onAir?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ currentMode, onSelectMode, onOpenUpload, onOpenWizard, onEditProfile, profile, onAir }) => {
  const p2p = useP2P();
  const badge = useFriendsBadge();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  const name = profile?.displayName || profile?.stationName || 'My Spot';

  return (
    <header className="sticky top-0 z-40 w-full bg-[#060b0e]/90 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
        <button onClick={() => onSelectMode('maispot')} className="flex items-center gap-2.5 hover:opacity-90 transition-opacity shrink-0" aria-label="mAI Spot home">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f9993c] via-[#ff2e6e] to-[#2ee8f7] flex items-center justify-center shadow-lg shadow-black/60 p-[3px]">
            <img src="/logo.svg" alt="" className="w-full h-full object-contain rounded-[9px] bg-[#060b0e]" />
          </div>
          <div className="hidden xl:flex items-center gap-2">
            <span className="font-bold text-lg text-white tracking-tight">
              m<span className="text-[#2ee8f7]">AI</span> Spot
            </span>
            {onAir && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#ff2e6e] text-white tracking-wider animate-pulse">ON AIR</span>}
          </div>
        </button>

        <nav className="hidden md:flex items-center p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06] gap-0.5" aria-label="Sections">
          {MODES.map(m => {
            const active = currentMode === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => onSelectMode(m.id)}
                aria-current={active ? 'page' : undefined}
                title={m.label}
                className={`relative flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-[13px] font-semibold transition-all whitespace-nowrap ${active ? 'bg-white/[0.08] text-white' : 'text-[#7fa9b5] hover:text-white'}`}
              >
                <span style={active ? { color: m.color } : undefined}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="hidden lg:inline">{m.label}</span>
                {m.id === 'feed' && badge > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff2e6e] text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>}
                {active && <span className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full" style={{ background: m.color }} />}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={onOpenUpload} className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#f9993c] to-[#ff2e6e] hover:brightness-110 text-black font-bold text-xs rounded-xl shadow-md">
            <Upload className="w-3.5 h-3.5 stroke-[3]" />
            <span className="hidden sm:inline">Add</span>
          </button>
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenu(m => !m)} className="flex items-center gap-1.5 p-1 pr-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10" aria-haspopup="menu" aria-expanded={menu} title="Your profile">
              <Art src={profile?.avatar} title={name.slice(0, 2).toUpperCase()} className="w-8 h-8 rounded-lg" />
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 hidden sm:block" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-full mt-2 w-64 bg-[#0d161a] border border-[#1f3a45] rounded-2xl shadow-2xl p-2 animate-fadeIn">
                <div className="flex items-center gap-3 px-2 py-2">
                  <Art src={profile?.avatar} title={name.slice(0, 2).toUpperCase()} className="w-10 h-10 rounded-xl" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{name}</div>
                    <div className="text-[11px] text-zinc-500 font-mono truncate">
                      {profile?.handle || '@you'}
                      {p2p.state ? `#${p2p.state.me.tag}` : ''}
                    </div>
                  </div>
                </div>
                <div className="my-1 border-t border-white/5" />
                {[
                  { icon: UserCircle2, label: 'Edit profile', on: onEditProfile },
                  { icon: Ticket, label: 'Invite a friend', on: () => p2p.setDialog({ type: 'invite' }) },
                  { icon: ShieldCheck, label: 'Privacy & sharing', on: () => p2p.setDialog({ type: 'privacy' }) },
                  { icon: Sliders, label: 'Customize my Spot', on: () => onSelectMode('studio') },
                  ...(onOpenWizard ? [{ icon: Wand2, label: 'Setup wizard', on: onOpenWizard }] : [])
                ].map(it => (
                  <button
                    key={it.label}
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      it.on();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-zinc-200 hover:bg-white/5 text-left"
                  >
                    <it.icon className="w-4 h-4 text-zinc-400" /> {it.label}
                  </button>
                ))}
                <div className="mt-1 pt-2 border-t border-white/5 px-2.5 text-[10px] text-zinc-600 font-mono">mAI Spot v{process.env.MAISPOT_VERSION}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
