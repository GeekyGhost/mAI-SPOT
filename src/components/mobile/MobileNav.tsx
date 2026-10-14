'use client';

import React, { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { MODES, AppMode, useFriendsBadge } from '@/components/Navbar';

const MAIN: AppMode[] = ['maispot', 'feed', 'radio', 'cinema'];

/** Phone navigation: four main sections and a "More" sheet for the rest. */
export const MobileNav: React.FC<{ currentMode: AppMode; onSelectMode: (m: AppMode) => void }> = ({ currentMode, onSelectMode }) => {
  const [more, setMore] = useState(false);
  const badge = useFriendsBadge();
  const rest = MODES.filter(m => !MAIN.includes(m.id));
  const inRest = rest.some(m => m.id === currentMode);
  return (
    <>
      {more && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMore(false)}>
          <div className="absolute bottom-16 right-2 left-2 grid grid-cols-4 gap-2 p-3 rounded-2xl bg-[#0d161a]/95 backdrop-blur border border-[#1f3a45] shadow-2xl animate-fadeIn" onClick={e => e.stopPropagation()}>
            {rest.map(m => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onSelectMode(m.id);
                    setMore(false);
                  }}
                  className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-white/5"
                  style={{ color: currentMode === m.id ? m.color : '#a9c7cf' }}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-[11px] font-semibold">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#060b0e]/95 backdrop-blur-lg border-t border-white/[0.06] px-2 flex items-center justify-around" aria-label="Sections">
        {MODES.filter(m => MAIN.includes(m.id)).map(m => {
          const Icon = m.icon;
          const active = currentMode === m.id;
          return (
            <button key={m.id} onClick={() => onSelectMode(m.id)} className="relative flex flex-col items-center gap-0.5 px-2" style={{ color: active ? m.color : '#649fae' }} aria-current={active ? 'page' : undefined}>
              <Icon className="w-5 h-5" />
              <span className={`text-[10px] ${active ? 'font-bold' : ''}`}>{m.label}</span>
              {m.id === 'feed' && badge > 0 && <span className="absolute -top-1 right-0 min-w-[16px] h-4 px-1 rounded-full bg-[#ff2e6e] text-white text-[9px] font-bold flex items-center justify-center">{badge}</span>}
            </button>
          );
        })}
        <button onClick={() => setMore(m => !m)} className="flex flex-col items-center gap-0.5 px-2" style={{ color: more || inRest ? '#ffffff' : '#649fae' }} aria-expanded={more}>
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px]">{inRest ? MODES.find(m => m.id === currentMode)?.label : 'More'}</span>
        </button>
      </nav>
    </>
  );
};
