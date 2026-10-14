'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, FileImage } from 'lucide-react';
import type { Book } from '@/lib/types';
import { api, uploadFile } from '@/lib/client';
import { openPdf } from './pdf';
import { Btn } from '@/components/ui/kit';

/** Use one of a comic's pages, or a page of a PDF, as the cover. */
export const PageCoverPicker: React.FC<{ book: Book; onPick: (url: string) => void }> = ({ book, onPick }) => {
  const [pages, setPages] = useState<string[] | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isComic = book.format === 'cbz' || book.format === 'cbr';

  useEffect(() => {
    if (!isComic) return;
    api(`/api/books/${book.id}/manifest`)
      .then(d => setPages(d.pages || []))
      .catch(e => setErr((e as Error).message));
  }, [book.id, isComic]);

  const useComicPage = async (url: string, n: number) => {
    setBusy(true);
    setErr('');
    try {
      const blob = await fetch(url).then(r => r.blob());
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const up = await uploadFile('thumbnail', blob, `${book.id}_p${n}.${ext}`);
      onPick(up.url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const usePdfPage = async () => {
    setBusy(true);
    setErr('');
    try {
      const doc = await openPdf(`/api/books/${book.id}/file`);
      const n = Math.min(Math.max(1, page), doc.numPages);
      const p = await doc.getPage(n);
      const vp1 = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: 600 / vp1.width });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      await p.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
      doc.destroy();
      const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      if (!blob) throw new Error('Couldn’t render that page.');
      const up = await uploadFile('thumbnail', blob, `${book.id}_p${n}.jpg`);
      onPick(up.url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (book.format === 'pdf') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#649fae]">Use PDF page</span>
        <input type="number" min={1} max={book.pageCount || 9999} value={page} onChange={e => setPage(Number(e.target.value) || 1)} className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white" />
        <Btn small type="button" onClick={usePdfPage} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileImage className="w-3.5 h-3.5" />} Use as cover
        </Btn>
        {err && <span className="text-[11px] text-rose-400 w-full">{err}</span>}
      </div>
    );
  }

  if (!isComic) return null;
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#649fae] mb-1.5">Or use a page from the comic</div>
      {pages === null ? (
        err ? <p className="text-[11px] text-rose-400">{err}</p> : <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {pages.slice(0, 60).map((u, i) => (
            <button key={u} type="button" disabled={busy} onClick={() => useComicPage(u, i + 1)} className="shrink-0 w-14 border-2 border-transparent hover:border-[var(--spot-accent)] rounded" title={`Page ${i + 1}`}>
              <img src={u} alt="" loading="lazy" className="w-full aspect-[2/3] object-cover rounded-sm" />
              <span className="text-[9px] text-zinc-500">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
      {busy && <Loader2 className="w-4 h-4 animate-spin text-zinc-400 mt-1" />}
    </div>
  );
};
