'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronLeft, ChevronRight, Download, FileText, Loader2, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import type { ModelSummary, ModelPackage } from '@/lib/modelTypes';
import { api } from '@/lib/client';
import { Btn, Field, inputCls, Modal } from '@/components/ui/kit';
import { useP2P } from '@/components/social/P2PProvider';

const bytes = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1024))} KB`;
const assetUrl = (base: string, id: string) => `${base}/asset/${encodeURIComponent(id)}`;
const downloadCls = 'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold bg-[var(--spot-accent)] text-black hover:brightness-110';
type Details = Pick<ModelPackage, 'title' | 'description' | 'author' | 'license' | 'printSettings' | 'assembly'>;

/** Shared by the owner's Models section and a friend's permission-filtered library. */
export function ModelShelf({ models, owner = false, onUpload, onRefresh }: {
  models: ModelSummary[]; owner?: boolean; onUpload?: () => void; onRefresh?: () => void;
}) {
  const p2p = useP2P();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ModelSummary | null>(null);
  const visible = useMemo(() => models.filter(m => `${m.title} ${m.author || ''} ${m.description || ''} ${m.formats.join(' ')}`.toLowerCase().includes(search.toLowerCase())), [models, search]);
  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-2xl font-bold text-white flex items-center gap-2"><Boxes className="w-6 h-6 text-[var(--spot-accent)]" /> Models & builds</h2>
        <p className="mt-1 text-sm text-zinc-400">3D models, print projects and animation files, with previews and instructions.</p></div>
      {owner && <Btn variant="primary" onClick={onUpload}><Plus className="w-4 h-4" /> Add model ZIP</Btn>}
    </div>
    {!!models.length && <input aria-label="Search model packages" className={`${inputCls} max-w-md`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search titles, creators or formats…" />}
    {!visible.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-zinc-400">
      <Boxes className="mx-auto w-10 h-10 mb-3 text-zinc-600" />
      {models.length ? 'No matching packages.' : owner ? 'Add a ZIP with STL, 3MF, Blender, CAD or animation files. Images, GIFs, videos and instructions are optional.' : 'No model packages are shared with you.'}
    </div>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {visible.map(m => <article key={m.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <button className="w-full text-left group" onClick={() => setSelected(m)} aria-label={`Open ${m.title}`}>
          <div className="aspect-[4/3] bg-black/40 flex items-center justify-center overflow-hidden">
            {m.coverAsset?.kind === 'image' ? <img src={assetUrl(m.apiBase, m.coverAsset.id)} alt={m.title} loading="lazy" className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform" /> :
              m.coverAsset?.kind === 'video' ? <video src={assetUrl(m.apiBase, m.coverAsset.id)} muted playsInline preload="metadata" className="w-full h-full object-contain" /> : <Boxes className="w-16 h-16 text-zinc-600" />}
          </div>
          <div className="p-4 pb-2"><h3 className="font-bold text-white truncate">{m.title}</h3>
            {m.author && <p className="text-xs text-zinc-400 truncate">by {m.author}</p>}
            <p className="mt-2 text-xs text-[var(--spot-accent)]">{m.formats.join(' · ')}</p>
            {m.description && <p className="mt-2 text-xs text-zinc-400 line-clamp-2 whitespace-pre-line">{m.description}</p>}
            <p className="mt-2 text-xs text-zinc-500">{m.fileCount} files · {bytes(m.sizeBytes)} · {m.previewCount} previews</p>
          </div>
        </button>
        <div className="p-4 pt-2 flex flex-wrap gap-2">
          <a href={`${m.apiBase}/download`} download className={downloadCls}><Download className="w-4 h-4" /> ZIP</a>
          <Btn small onClick={() => setSelected(m)}>View details</Btn>
          {owner && <Btn small title="Choose who can download this package" onClick={() => p2p.setDialog({ type: 'share', rid: `model:${m.id}`, name: m.title })}><Share2 className="w-4 h-4" /> Share</Btn>}
        </div>
      </article>)}
    </div>
    {selected && <ModelDetail key={selected.id} summary={selected} owner={owner} onClose={() => setSelected(null)} onRefresh={onRefresh} />}
  </section>;
}

function ModelDetail({ summary, owner, onClose, onRefresh }: {
  summary: ModelSummary; owner: boolean; onClose: () => void; onRefresh?: () => void;
}) {
  const [model, setModel] = useState<ModelPackage | null>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [reel, setReel] = useState(false);
  const [docId, setDocId] = useState('');
  const [docText, setDocText] = useState<string | null>(null);
  const [docError, setDocError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Details>({ title: '' });
  const [busy, setBusy] = useState(false);
  const base = summary.apiBase;
  useEffect(() => {
    const abort = new AbortController();
    api<{ model: ModelPackage }>(base, { signal: abort.signal }).then(({ model: m }) => {
      setModel(m); setDocId(m.documents.find(d => d.kind === 'text')?.id || '');
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [base]);
  useEffect(() => {
    if (!model || !reel || model.previews.length < 2) return;
    const images = model.previews.map((p, i) => p.kind === 'image' ? i : -1).filter(i => i >= 0);
    if (images.length < 2) return;
    const timer = setInterval(() => setIndex(i => images[(images.indexOf(i) + 1) % images.length]), 4000);
    return () => clearInterval(timer);
  }, [model, reel]);
  useEffect(() => {
    setDocText(null); setDocError('');
    if (!docId) return;
    const abort = new AbortController();
    fetch(assetUrl(base, docId), { signal: abort.signal }).then(async r => {
      if (!r.ok) throw new Error('Instructions are unavailable. The owner may be offline or access may have expired.');
      return r.text();
    }).then(setDocText).catch(e => { if (!abort.signal.aborted) setDocError(e.message); });
    return () => abort.abort();
  }, [base, docId]);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const d = await api<{ model: ModelPackage }>(base, { method: 'PUT', json: draft });
      setModel(d.model); setEditing(false); onRefresh?.();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`Delete “${model?.title || summary.title}” and its ZIP from your Spot?`)) return;
    setBusy(true); setError('');
    try { await api(base, { method: 'DELETE' }); onRefresh?.(); onClose(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const preview = model?.previews[index];
  return <Modal open onClose={() => { if (!busy) onClose(); }} title={model?.title || summary.title} wide footer={<>
    <Btn disabled={busy} onClick={onClose}>Close</Btn>
    <a href={`${base}/download`} download className={downloadCls}><Download className="w-4 h-4" /> Download ZIP · {bytes(summary.sizeBytes)}</a>
  </>}>
    {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
    {!model && !error && <p className="text-zinc-400 flex gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading package…</p>}
    {model && <>
      {owner && <div className="flex gap-2"><Btn small disabled={busy} onClick={() => {
        setDraft({ title: model.title, description: model.description || '', author: model.author || '', license: model.license || '', printSettings: model.printSettings || '', assembly: model.assembly || '' }); setEditing(!editing);
      }}><Pencil className="w-3 h-3" /> {editing ? 'Cancel editing' : 'Edit details'}</Btn><Btn small variant="danger" disabled={busy} onClick={remove}><Trash2 className="w-3 h-3" /> Delete</Btn></div>}
      {editing ? <div className="space-y-3">
        {(['title', 'author', 'license'] as const).map(k => <Field key={k} label={k}><input className={inputCls} maxLength={k === 'title' ? 160 : k === 'author' ? 200 : 400} value={draft[k] || ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} /></Field>)}
        {([['description', 'Description'], ['printSettings', 'Printing instructions'], ['assembly', 'Assembly instructions']] as const).map(([k, label]) => <Field key={k} label={label}><textarea className={inputCls} rows={4} maxLength={k === 'description' ? 4000 : 12000} value={draft[k] || ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} /></Field>)}
        <Btn variant="primary" disabled={busy || !draft.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Save details'}</Btn>
      </div> : <>
        {(model.author || model.license) && <p className="text-sm text-zinc-400">{[model.author && `by ${model.author}`, model.license].filter(Boolean).join(' · ')}</p>}
        {model.description && <p className="text-sm text-zinc-300 whitespace-pre-wrap">{model.description}</p>}
        {preview && <div className="space-y-2">
          <div className="aspect-video rounded-xl bg-black flex items-center justify-center overflow-hidden">
            {preview.kind === 'video' ? <video key={preview.id} src={assetUrl(base, preview.id)} controls playsInline preload="metadata" className="w-full h-full object-contain"><p>Download the ZIP to view this video.</p></video> : <img src={assetUrl(base, preview.id)} alt={preview.name} className="w-full h-full object-contain" />}
          </div>
          <div className="flex items-center gap-2">
            <Btn small aria-label="Previous preview" disabled={model.previews.length < 2} onClick={() => { setReel(false); setIndex((index + model.previews.length - 1) % model.previews.length); }}><ChevronLeft className="w-4 h-4" /></Btn>
            <p className="text-xs text-zinc-400 flex-1 truncate" title={preview.name}>{index + 1} / {model.previews.length} · {preview.name}</p>
            {model.previews.filter(p => p.kind === 'image').length > 1 && <Btn small onClick={() => setReel(!reel)}>{reel ? 'Pause reel' : 'Play reel'}</Btn>}
            <Btn small aria-label="Next preview" disabled={model.previews.length < 2} onClick={() => { setReel(false); setIndex((index + 1) % model.previews.length); }}><ChevronRight className="w-4 h-4" /></Btn>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">{model.previews.map((p, i) => <button key={p.id} onClick={() => { setReel(false); setIndex(i); }} aria-label={`Preview ${i + 1}: ${p.name}`} aria-pressed={index === i} className={`shrink-0 w-16 h-14 rounded border overflow-hidden ${index === i ? 'border-[var(--spot-accent)]' : 'border-white/10'}`}>
            {p.kind === 'image' ? <img src={assetUrl(base, p.id)} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span className="text-xs text-zinc-300">Video {i + 1}</span>}
          </button>)}</div>
          {preview.kind === 'video' && <p className="text-xs text-zinc-500">Playback depends on your browser and the video’s codec. The original is included in the ZIP.</p>}
        </div>}
        {model.printSettings && <section><h4 className="font-bold text-white mb-2">Printing</h4><p className="text-sm text-zinc-300 whitespace-pre-wrap">{model.printSettings}</p></section>}
        {model.assembly && <section><h4 className="font-bold text-white mb-2">Assembly</h4><p className="text-sm text-zinc-300 whitespace-pre-wrap">{model.assembly}</p></section>}
        {!!model.documents.length && <section className="space-y-3">
          <h4 className="font-bold text-white flex items-center gap-2"><FileText className="w-4 h-4" /> Instructions & documents</h4>
          {model.documents.some(d => d.kind === 'text') && <select aria-label="Read instructions" className={inputCls} value={docId} onChange={e => setDocId(e.target.value)}>{model.documents.filter(d => d.kind === 'text').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
          {docError && <p role="alert" className="text-sm text-rose-400">{docError}</p>}
          {docId && !docError && <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words bg-black/30 p-4 rounded-lg text-xs text-zinc-300 font-mono">{docText === null ? 'Loading instructions…' : docText}</pre>}
          <div className="flex flex-col gap-2">{model.documents.map(d => <a key={d.id} className="text-sm text-[var(--spot-accent)] hover:underline break-all" href={assetUrl(base, d.id)} download={d.name.split('/').pop()}><Download className="w-3 h-3 inline mr-2" />{d.name} · {bytes(d.sizeBytes)}</a>)}</div>
        </section>}
        {!!model.warnings.length && <div className="text-xs text-amber-300 space-y-1">{model.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>}
        <details className="rounded-lg border border-white/10 p-3 text-sm text-zinc-400"><summary className="cursor-pointer font-bold text-white">Files in this ZIP ({model.files.length}) · {model.formats.join(', ')}</summary>
          <ul className="mt-3 max-h-64 overflow-y-auto text-xs space-y-1">{model.files.map(f => <li key={f.path} className="flex gap-3 justify-between"><span className="break-all">{f.path}</span><span className="shrink-0 text-zinc-500">{bytes(f.sizeBytes)}</span></li>)}</ul>
        </details>
        <p className="text-xs text-zinc-500">Downloads include the original ZIP, including all model files, textures and supporting files.</p>
      </>}
    </>}
  </Modal>;
}
