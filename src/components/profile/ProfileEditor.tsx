'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, PanelTop, Plus, ChevronLeft, ChevronRight, Trash2, Loader2, Check, UserCircle2, Eye } from 'lucide-react';
import type { StationProfile } from '@/lib/types';
import { Btn, Field, inputCls, Art } from '@/components/ui/kit';
import { ImageCropper } from './ImageCropper';
import { useP2P } from '@/components/social/P2PProvider';

const STATUS: { id: StationProfile['statusMode']; label: string; dot: string }[] = [
  { id: 'online', label: 'Online', dot: 'bg-emerald-400' },
  { id: 'away', label: 'Away', dot: 'bg-amber-400' },
  { id: 'dnd', label: 'Do not disturb', dot: 'bg-rose-500' },
  { id: 'offline', label: 'Appear offline', dot: 'bg-zinc-500' }
];

/** Everything about how you look to friends, in one place, with a live preview. */
export const ProfileEditor: React.FC<{
  open: boolean;
  onClose: () => void;
  profile: StationProfile;
  tag?: string;
  accent?: string;
  onSave: (u: Partial<StationProfile>) => Promise<void>;
}> = ({ open, onClose, profile, tag: tagProp, accent, onSave }) => {
  const p2p = useP2P();
  const tag = tagProp || p2p.state?.me.tag;
  const [p, setP] = useState<StationProfile>(profile);
  const [crop, setCrop] = useState<null | 'avatar' | 'banner' | 'reel'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) setP(profile);
  }, [open, profile]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !crop && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, crop, onClose]);

  if (!open || typeof document === 'undefined') return null;
  const set = <K extends keyof StationProfile>(k: K, v: StationProfile[K]) => setP(x => ({ ...x, [k]: v }));
  const name = p.displayName || p.stationName || 'My Spot';
  const reel = p.pictureReel || [];
  const moveReel = (i: number, d: number) => {
    const r = [...reel];
    const j = i + d;
    if (j < 0 || j >= r.length) return;
    [r[i], r[j]] = [r[j], r[i]];
    set('pictureReel', r);
  };
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await onSave({
        displayName: p.displayName, stationName: p.stationName, handle: p.handle, bio: p.bio, moodBlurb: p.moodBlurb,
        avatar: p.avatar, banner: p.banner, pictureReel: reel, statusMode: p.statusMode, isOnline: p.statusMode !== 'offline'
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const acc = accent || 'var(--spot-accent)';

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-fadeIn" onMouseDown={onClose}>
      <div className="w-full max-w-5xl bg-[#0b1216] border border-[#1f3a45] sm:rounded-3xl shadow-2xl overflow-hidden" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit profile">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a323c]">
          <h3 className="font-bold text-white flex items-center gap-2">
            <UserCircle2 className="w-5 h-5" style={{ color: acc }} /> Edit profile
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_380px]">
          {/* Form */}
          <div className="p-5 space-y-5 max-h-[78vh] overflow-y-auto">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Your name" hint="What friends see first.">
                <input className={inputCls} value={p.displayName || ''} onChange={e => set('displayName', e.target.value)} placeholder="e.g. Willie" maxLength={80} />
              </Field>
              <Field label="Handle" hint={`Shown as ${p.handle || '@you'}#${tag || 'xxxx'}`}>
                <div className="flex items-center bg-black/40 border border-[#1f3a45] rounded-lg focus-within:border-[var(--spot-accent)]">
                  <span className="pl-3 text-zinc-500">@</span>
                  <input className="flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none" value={(p.handle || '').replace(/^@/, '')} onChange={e => set('handle', `@${e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '')}`)} placeholder="yourname" maxLength={32} />
                </div>
              </Field>
              <Field label="Spot name" hint="The name of your station / page.">
                <input className={inputCls} value={p.stationName || ''} onChange={e => set('stationName', e.target.value)} placeholder="Midnight Radio" maxLength={80} />
              </Field>
              <Field label="Status">
                <div className="grid grid-cols-2 gap-1.5">
                  {STATUS.map(s => (
                    <button key={s.id} type="button" onClick={() => set('statusMode', s.id)} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border ${p.statusMode === s.id ? 'border-[var(--spot-accent)] bg-accent/10 text-white' : 'border-white/10 text-zinc-400 hover:text-white'}`}>
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label={`What’s on your mind (${(p.moodBlurb || '').length}/280)`}>
              <input className={inputCls} value={p.moodBlurb || ''} onChange={e => set('moodBlurb', e.target.value.slice(0, 280))} placeholder="Spinning old records tonight 🎶" />
            </Field>
            <Field label="About you">
              <textarea className={inputCls} rows={4} value={p.bio || ''} onChange={e => set('bio', e.target.value.slice(0, 2000))} placeholder="A few lines about you and what you share here." />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">Profile picture</span>
                <div className="flex items-center gap-3">
                  <Art src={p.avatar} title={name.slice(0, 2).toUpperCase()} className="w-20 h-20 rounded-2xl border border-white/10" />
                  <div className="flex flex-col gap-1.5">
                    <Btn small onClick={() => setCrop('avatar')}>
                      <Camera className="w-3.5 h-3.5" /> Change
                    </Btn>
                    {p.avatar && (
                      <Btn small onClick={() => set('avatar', '')}>
                        Remove
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">Banner</span>
                <div className="flex items-center gap-3">
                  <div className="w-36 aspect-[3/1] rounded-xl border border-white/10 bg-gradient-to-r from-accent/40 to-[#ff2e6e]/30 bg-cover bg-center" style={p.banner ? { backgroundImage: `url("${p.banner}")` } : undefined} />
                  <div className="flex flex-col gap-1.5">
                    <Btn small onClick={() => setCrop('banner')}>
                      <PanelTop className="w-3.5 h-3.5" /> Change
                    </Btn>
                    {p.banner && (
                      <Btn small onClick={() => set('banner', '')}>
                        Remove
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1">Picture reel · {reel.length}/24</span>
              <p className="text-[11px] text-zinc-500 mb-2">A strip of favourite pictures on your profile. Friends you share it with see it on your Spot.</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {reel.map((u, i) => (
                  <div key={`${u}_${i}`} className="relative shrink-0 w-24 group">
                    <img src={u} alt="" className="w-24 h-24 object-cover rounded-xl border border-white/10" />
                    <div className="absolute inset-0 rounded-xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button onClick={() => moveReel(i, -1)} className="p-1 text-white" title="Move left">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button onClick={() => set('pictureReel', reel.filter((_, k) => k !== i))} className="p-1 text-rose-300" title="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => moveReel(i, 1)} className="p-1 text-white" title="Move right">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {reel.length < 24 && (
                  <button onClick={() => setCrop('reel')} className="shrink-0 w-24 h-24 rounded-xl border-2 border-dashed border-white/15 hover:border-white/40 text-zinc-400 flex flex-col items-center justify-center text-xs gap-1">
                    <Plus className="w-5 h-5" /> Add
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="border-t lg:border-t-0 lg:border-l border-[#1a323c] bg-black/30 p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-3 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> How friends see you
            </div>
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#030608]">
              <div className="relative h-28 spot-grain" style={{ background: p.banner ? `center/cover no-repeat url("${p.banner}")` : `linear-gradient(120deg, color-mix(in srgb, ${acc} 40%, transparent), #ff2e6e44 55%, #030608)` }}>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#030608]" />
              </div>
              <div className="px-4 pb-4 -mt-10 relative">
                <div className="inline-block rounded-2xl p-1 bg-[#030608]" style={{ boxShadow: `0 0 0 2px ${acc}` }}>
                  <Art src={p.avatar} title={name.slice(0, 2).toUpperCase()} className="w-16 h-16 rounded-xl" />
                </div>
                <div className="text-xl font-bold text-white mt-2 truncate">{name}</div>
                <div className="text-xs text-zinc-500 font-mono">
                  {p.handle || '@you'}#{tag || 'xxxx'}
                </div>
                <div className="text-xs mt-1 flex items-center gap-1.5 text-zinc-300">
                  <span className={`w-2 h-2 rounded-full ${STATUS.find(s => s.id === p.statusMode)?.dot}`} /> {STATUS.find(s => s.id === p.statusMode)?.label}
                </div>
                {p.moodBlurb && <p className="text-sm text-zinc-200 italic mt-2">“{p.moodBlurb}”</p>}
                {p.bio && <p className="text-xs text-zinc-400 mt-2 whitespace-pre-line line-clamp-4">{p.bio}</p>}
                {reel.length > 0 && (
                  <div className="grid grid-cols-4 gap-1 mt-3">
                    {reel.slice(0, 4).map((u, i) => (
                      <img key={i} src={u} alt="" className="aspect-square object-cover rounded-md" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#1a323c] flex items-center justify-end gap-2">
          {err && <span className="text-xs text-rose-400 mr-auto">{err}</span>}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save profile
          </Btn>
        </div>
      </div>

      {/* Inside a stopper: React events from the cropper's portal would otherwise bubble up and close this editor. */}
      <div onMouseDown={e => e.stopPropagation()}>
      <ImageCropper
        open={crop !== null}
        onClose={() => setCrop(null)}
        aspect={crop === 'banner' ? 3 : 1}
        outWidth={crop === 'banner' ? 1500 : crop === 'reel' ? 900 : 512}
        round={crop === 'avatar'}
        title={crop === 'banner' ? 'Banner' : crop === 'reel' ? 'Add to picture reel' : 'Profile picture'}
        onDone={url => {
          if (crop === 'avatar') set('avatar', url);
          else if (crop === 'banner') set('banner', url);
          else if (crop === 'reel') set('pictureReel', [...reel, url].slice(0, 24));
        }}
      />
      </div>
    </div>,
    document.body
  );
};
