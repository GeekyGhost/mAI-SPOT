'use client';

import { createPortal } from 'react-dom';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, List, Type, Minus, Plus, Loader2, BookOpen, Columns2, RectangleVertical,
  ScrollText, ArrowLeftRight, Maximize, Grid3x3, ZoomIn, ZoomOut
} from 'lucide-react';
import type { Book } from '@/lib/types';
import { api, safeLocal, saveLocal } from '@/lib/client';
import { openPdf } from './pdf';

// ───────────────────────── shared bits ─────────────────────────

type ReadTheme = 'dark' | 'sepia' | 'light';
interface TextPrefs {
  size: number;
  theme: ReadTheme;
  serif: boolean;
  width: 'narrow' | 'wide';
}
const THEMES: Record<ReadTheme, { bg: string; fg: string; link: string }> = {
  dark: { bg: '#0b0f12', fg: '#d9e6ea', link: '#2ee8f7' },
  sepia: { bg: '#f4ecd8', fg: '#433422', link: '#9b4d16' },
  light: { bg: '#ffffff', fg: '#1d1d1f', link: '#0b62c4' }
};
const DEFAULT_PREFS: TextPrefs = { size: 112, theme: 'dark', serif: true, width: 'narrow' };

/** Where the book comes from: '' = this Spot, or a friend's proxied base like /api/p2p/peer/<key>/x. */
const SourceCtx = createContext<{ base: string }>({ base: '' });
const useSrc = () => useContext(SourceCtx);
const withBase = (base: string, url: string) => (base && url.startsWith('/api/') ? base + url : url);
export const peerProgressKey = (base: string, id: string) => `maispot.peerbook.${base}.${id}`;

function useSaveProgress(book: Book) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { base } = useSrc();
  return useCallback(
    (location: string, percent: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // A friend's book: remember your place in this browser, never write to their Spot.
        if (base) saveLocal(peerProgressKey(base, book.id), { location, percent, updatedAt: new Date().toISOString() });
        else api('/api/books', { method: 'PATCH', json: { id: book.id, progress: { location, percent } } }).catch(() => {});
      }, 1200);
    },
    [book.id, base]
  );
}

const Shell: React.FC<{
  book: Book;
  onClose: () => void;
  subtitle?: string;
  percent?: number;
  tools?: React.ReactNode;
  children: React.ReactNode;
  dark?: boolean;
}> = ({ book, onClose, subtitle, percent, tools, children, dark = true }) =>
  createPortal(
  <div className={`fixed inset-0 z-[70] flex flex-col ${dark ? 'bg-[#05080a]' : 'bg-[#e9e4d8]'}`}>
    <div className="flex items-center gap-3 px-3 py-2 bg-[#080f12] border-b border-[#1a323c] text-white">
      <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" title="Close (Esc)">
        <X className="w-5 h-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-bold truncate text-sm">{book.title}</div>
        <div className="text-[11px] text-zinc-500 truncate">{subtitle || book.author}</div>
      </div>
      <div className="flex items-center gap-1">{tools}</div>
    </div>
    <div className="relative flex-1 min-h-0">{children}</div>
    {percent !== undefined && (
      <div className="h-1 bg-white/10">
        <div className="h-full bg-[var(--spot-accent)] transition-all" style={{ width: `${Math.round(percent * 100)}%` }} />
      </div>
    )}
  </div>,
  document.body
);

const ToolBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }> = ({ active, className = '', ...p }) => (
  <button {...p} className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 ${active ? 'bg-[var(--spot-accent)] text-black' : 'text-zinc-300 hover:bg-white/10'} ${className}`} />
);

const TextSettings: React.FC<{ prefs: TextPrefs; onChange: (p: TextPrefs) => void }> = ({ prefs, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <ToolBtn onClick={() => setOpen(o => !o)} active={open} title="Text settings">
        <Type className="w-4 h-4" />
      </ToolBtn>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 z-10 bg-[#0f1a1f] border border-[#1f3a45] rounded-xl p-3 space-y-3 shadow-2xl text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Size</span>
            <div className="flex items-center gap-2">
              <ToolBtn onClick={() => onChange({ ...prefs, size: Math.max(70, prefs.size - 8) })}><Minus className="w-3.5 h-3.5" /></ToolBtn>
              <span className="w-10 text-center font-mono">{prefs.size}%</span>
              <ToolBtn onClick={() => onChange({ ...prefs, size: Math.min(220, prefs.size + 8) })}><Plus className="w-3.5 h-3.5" /></ToolBtn>
            </div>
          </div>
          <div className="flex gap-1">
            {(Object.keys(THEMES) as ReadTheme[]).map(t => (
              <button key={t} onClick={() => onChange({ ...prefs, theme: t })} className={`flex-1 py-2 rounded-lg border capitalize ${prefs.theme === t ? 'border-[var(--spot-accent)]' : 'border-white/10'}`} style={{ background: THEMES[t].bg, color: THEMES[t].fg }}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <ToolBtn className="flex-1 justify-center" active={prefs.serif} onClick={() => onChange({ ...prefs, serif: true })}>Serif</ToolBtn>
            <ToolBtn className="flex-1 justify-center" active={!prefs.serif} onClick={() => onChange({ ...prefs, serif: false })}>Sans</ToolBtn>
          </div>
          <div className="flex gap-1">
            <ToolBtn className="flex-1 justify-center" active={prefs.width === 'narrow'} onClick={() => onChange({ ...prefs, width: 'narrow' })}>Narrow</ToolBtn>
            <ToolBtn className="flex-1 justify-center" active={prefs.width === 'wide'} onClick={() => onChange({ ...prefs, width: 'wide' })}>Wide</ToolBtn>
          </div>
        </div>
      )}
    </div>
  );
};

function readerCss(p: TextPrefs) {
  const t = THEMES[p.theme];
  return `
    html { background: ${t.bg} !important; }
    body { background: ${t.bg} !important; color: ${t.fg} !important;
      font-family: ${p.serif ? "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif" : "system-ui, 'Segoe UI', Roboto, sans-serif"} !important;
      font-size: ${p.size}% !important; line-height: 1.65 !important;
      max-width: ${p.width === 'narrow' ? '40em' : '62em'}; margin: 0 auto !important; padding: 2.5em 1.5em 6em !important; }
    body * { color: inherit !important; background-color: transparent !important; }
    a { color: ${t.link} !important; }
    img, svg, video { max-width: 100% !important; height: auto !important; }
    p { margin: 0 0 0.9em; }
    pre, code { white-space: pre-wrap; }
  `;
}

// ───────────────────────── EPUB ─────────────────────────

const EpubReader: React.FC<{ book: Book; onClose: () => void }> = ({ book, onClose }) => {
  const [chapters, setChapters] = useState<{ index: number; title: string; url: string }[]>([]);
  const [err, setErr] = useState('');
  const initial = useMemo(() => {
    const [c, f] = (book.progress?.location || '0:0').split(':');
    return { chapter: Number(c) || 0, frac: Number(f) || 0 };
  }, [book.progress]);
  const [chapter, setChapter] = useState(initial.chapter);
  const [frac, setFrac] = useState(0);
  const [toc, setToc] = useState(false);
  const [prefs, setPrefs] = useState<TextPrefs>(() => safeLocal('maispot.reader.text', DEFAULT_PREFS));
  const frameRef = useRef<HTMLIFrameElement>(null);
  const restoreFrac = useRef<number | null>(initial.frac);
  const save = useSaveProgress(book);
  const { base } = useSrc();

  useEffect(() => {
    api(`${base}/api/books/${book.id}/manifest`)
      .then(d => setChapters(d.chapters.map((c: { url: string }) => ({ ...c, url: withBase(base, c.url) }))))
      .catch(e => setErr(e.message));
  }, [book.id, base]);

  useEffect(() => saveLocal('maispot.reader.text', prefs), [prefs]);

  const doc = () => frameRef.current?.contentDocument || null;
  const win = () => frameRef.current?.contentWindow || null;

  const applyStyle = useCallback(() => {
    const d = doc();
    if (!d?.head) return;
    let s = d.getElementById('maispot-reader') as HTMLStyleElement | null;
    if (!s) {
      s = d.createElement('style');
      s.id = 'maispot-reader';
      d.head.appendChild(s);
    }
    s.textContent = readerCss(prefs);
  }, [prefs]);

  useEffect(applyStyle, [applyStyle]);

  const go = useCallback(
    (i: number, atEnd = false) => {
      if (i < 0 || i >= chapters.length) return;
      restoreFrac.current = atEnd ? 1 : 0;
      setChapter(i);
      setToc(false);
    },
    [chapters.length]
  );

  const page = useCallback(
    (dir: 1 | -1) => {
      const w = win();
      const d = doc();
      if (!w || !d) return;
      const max = d.documentElement.scrollHeight - w.innerHeight;
      const y = w.scrollY;
      if (dir > 0 && y >= max - 4) return go(chapter + 1);
      if (dir < 0 && y <= 4) return go(chapter - 1, true);
      w.scrollBy({ top: dir * w.innerHeight * 0.9, behavior: 'smooth' });
    },
    [chapter, go]
  );

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
        e.preventDefault();
        page(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
        e.preventDefault();
        page(-1);
      }
    },
    [page, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const onLoad = () => {
    const d = doc();
    const w = win();
    if (!d || !w) return;
    applyStyle();
    // If a link inside the book navigated to another chapter, follow along.
    const here = decodeURIComponent(w.location.pathname);
    const idx = chapters.findIndex(c => decodeURIComponent(new URL(c.url, w.location.origin).pathname) === here);
    if (idx >= 0 && idx !== chapter) setChapter(idx);
    const restore = () => {
      if (restoreFrac.current !== null) {
        const max = d.documentElement.scrollHeight - w.innerHeight;
        w.scrollTo(0, max * restoreFrac.current);
        restoreFrac.current = null;
      }
    };
    restore();
    setTimeout(restore, 300); // after images settle
    const onScroll = () => {
      const max = Math.max(1, d.documentElement.scrollHeight - w.innerHeight);
      const f = Math.min(1, w.scrollY / max);
      setFrac(f);
      const ci = idx >= 0 ? idx : chapter;
      save(`${ci}:${f.toFixed(4)}`, chapters.length ? (ci + f) / chapters.length : 0);
    };
    w.addEventListener('scroll', onScroll, { passive: true });
    d.addEventListener('keydown', onKey);
    onScroll();
  };

  const percent = chapters.length ? (chapter + frac) / chapters.length : 0;
  const t = THEMES[prefs.theme];

  return (
    <Shell
      book={book}
      onClose={onClose}
      subtitle={chapters[chapter]?.title}
      percent={percent}
      tools={
        <>
          <span className="text-[11px] font-mono text-zinc-400 mr-1">{Math.round(percent * 100)}%</span>
          <ToolBtn onClick={() => setToc(v => !v)} active={toc} title="Contents">
            <List className="w-4 h-4" />
          </ToolBtn>
          <TextSettings prefs={prefs} onChange={setPrefs} />
        </>
      }
    >
      {err ? (
        <p className="p-8 text-[#ff6b6b]">{err}</p>
      ) : !chapters.length ? (
        <div className="h-full flex items-center justify-center text-zinc-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="h-full flex" style={{ background: t.bg }}>
          {toc && (
            <div className="w-72 shrink-0 overflow-y-auto bg-[#0b1216] border-r border-[#1a323c] py-2">
              {chapters.map(c => (
                <button key={c.index} onClick={() => go(c.index)} className={`block w-full text-left px-4 py-2 text-sm truncate hover:bg-white/5 ${c.index === chapter ? 'text-[var(--spot-accent)] font-bold' : 'text-zinc-300'}`}>
                  {c.title}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex-1">
            <iframe
              ref={frameRef}
              key={chapters[chapter]?.url}
              src={chapters[chapter]?.url}
              onLoad={onLoad}
              title="Book"
              // Same-origin so we can restyle it; no scripts ever run from book files.
              sandbox="allow-same-origin"
              className="absolute inset-0 w-full h-full border-0"
            />
            <button onClick={() => page(-1)} className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center opacity-0 hover:opacity-100 bg-gradient-to-r from-black/20 to-transparent" title="Previous">
              <ChevronLeft className="w-8 h-8" style={{ color: t.fg }} />
            </button>
            <button onClick={() => page(1)} className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center opacity-0 hover:opacity-100 bg-gradient-to-l from-black/20 to-transparent" title="Next">
              <ChevronRight className="w-8 h-8" style={{ color: t.fg }} />
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
};

// ───────────────────────── Plain text / Markdown (poems, notes, stories) ─────────────────────────

function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  return src
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => {
      const h = block.match(/^(#{1,6})\s+(.*)$/);
      if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      if (/^(-{3,}|\*{3,})$/.test(block.trim())) return '<hr/>';
      if (/^>\s?/.test(block)) return `<blockquote>${inline(block.replace(/^>\s?/gm, '')).replace(/\n/g, '<br/>')}</blockquote>`;
      // Keep line breaks: poems live and die by them.
      return `<p>${block.split('\n').map(inline).join('<br/>')}</p>`;
    })
    .join('\n');
}

function renderPlain(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return src
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(b => `<p>${esc(b).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

const TextReader: React.FC<{ book: Book; onClose: () => void }> = ({ book, onClose }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<TextPrefs>(() => safeLocal('maispot.reader.text', DEFAULT_PREFS));
  const [frac, setFrac] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const save = useSaveProgress(book);
  const { base } = useSrc();

  useEffect(() => {
    fetch(`${base}/api/books/${book.id}/file`)
      .then(r => r.text())
      .then(txt => setHtml(book.format === 'md' ? renderMarkdown(txt) : renderPlain(txt)));
  }, [book.id, book.format, base]);
  useEffect(() => saveLocal('maispot.reader.text', prefs), [prefs]);
  useEffect(() => {
    if (!html || !scroller.current) return;
    const el = scroller.current;
    const f = Number(book.progress?.location) || 0;
    requestAnimationFrame(() => (el.scrollTop = f * (el.scrollHeight - el.clientHeight)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = THEMES[prefs.theme];
  return (
    <Shell book={book} onClose={onClose} percent={frac} tools={<><span className="text-[11px] font-mono text-zinc-400 mr-1">{Math.round(frac * 100)}%</span><TextSettings prefs={prefs} onChange={setPrefs} /></>}>
      <div
        ref={scroller}
        className="absolute inset-0 overflow-y-auto"
        style={{ background: t.bg, color: t.fg }}
        onScroll={e => {
          const el = e.currentTarget;
          const f = Math.min(1, el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight));
          setFrac(f);
          save(f.toFixed(4), f);
        }}
      >
        {html === null ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <article
            className="mx-auto px-6 py-10 [&_h1]:text-3xl [&_h1]:font-black [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mt-6 [&_p]:mb-4 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:opacity-80 [&_hr]:my-8 [&_hr]:opacity-30"
            style={{
              maxWidth: prefs.width === 'narrow' ? '40em' : '62em',
              fontSize: `${prefs.size}%`,
              lineHeight: 1.7,
              fontFamily: prefs.serif ? "Georgia, 'Iowan Old Style', serif" : 'system-ui, sans-serif'
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </Shell>
  );
};

// ───────────────────────── Comics (CBZ/CBR, and PDFs marked as comics) ─────────────────────────

type ComicMode = 'single' | 'double' | 'scroll';
interface ComicPrefs {
  mode: ComicMode;
  rtl: boolean;
  fit: 'height' | 'width';
}

const ComicReader: React.FC<{ book: Book; onClose: () => void }> = ({ book, onClose }) => {
  const [pages, setPages] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [i, setI] = useState(() => Math.max(0, Number(book.progress?.location) || 0));
  const [prefs, setPrefs] = useState<ComicPrefs>(() =>
    safeLocal('maispot.reader.comic', { mode: 'single', rtl: book.genre === 'Manga', fit: 'height' } as ComicPrefs)
  );
  const [thumbs, setThumbs] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const save = useSaveProgress(book);
  const { base } = useSrc();

  useEffect(() => {
    api(`${base}/api/books/${book.id}/manifest`)
      .then(d => setPages(d.pages.map((u: string) => withBase(base, u))))
      .catch(e => setErr(e.message));
  }, [book.id, base]);
  useEffect(() => saveLocal('maispot.reader.comic', prefs), [prefs]);

  const step = prefs.mode === 'double' && i > 0 ? 2 : 1;
  const goTo = useCallback(
    (n: number) => {
      const max = pages.length - 1;
      let v = Math.max(0, Math.min(max, n));
      // Keep spreads aligned: cover alone, then pairs (1-2, 3-4, ...).
      if (prefs.mode === 'double' && v > 0 && v % 2 === 0) v -= 1;
      setI(v);
      if (pages.length) save(String(v), (v + 1) / pages.length);
    },
    [pages.length, prefs.mode, save]
  );
  const next = useCallback(() => goTo(i + step), [goTo, i, step]);
  const prev = useCallback(() => goTo(i - (prefs.mode === 'double' && i > 1 ? 2 : 1)), [goTo, i, prefs.mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (prefs.mode === 'scroll') return;
      const fwd = prefs.rtl ? 'ArrowLeft' : 'ArrowRight';
      const back = prefs.rtl ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === back || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'Home') goTo(0);
      else if (e.key === 'End') goTo(pages.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, goTo, prefs, pages.length, onClose]);

  // Scroll mode: jump to saved page once, then track which page is in view.
  useEffect(() => {
    if (prefs.mode !== 'scroll' || !scrollRef.current || !pages.length) return;
    const root = scrollRef.current;
    const imgs = [...root.querySelectorAll('img')];
    imgs[i]?.scrollIntoView();
    const io = new IntersectionObserver(
      entries => {
        for (const en of entries) {
          if (en.isIntersecting) {
            const n = Number((en.target as HTMLElement).dataset.n);
            setI(n);
            save(String(n), (n + 1) / pages.length);
          }
        }
      },
      { root, threshold: 0.5 }
    );
    imgs.forEach(im => io.observe(im));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.mode, pages.length]);

  const shown = prefs.mode === 'double' && i > 0 ? [i, i + 1].filter(n => n < pages.length) : [i];
  const ordered = prefs.rtl ? [...shown].reverse() : shown;
  const imgCls = prefs.fit === 'height' ? 'h-full w-auto max-w-full object-contain' : 'w-full h-auto';

  return (
    <Shell
      book={book}
      onClose={onClose}
      subtitle={pages.length ? `Page ${i + 1}${shown.length > 1 ? `–${i + 2}` : ''} of ${pages.length}` : book.series}
      percent={pages.length ? (i + shown.length) / pages.length : 0}
      tools={
        <>
          <ToolBtn active={prefs.mode === 'single'} onClick={() => setPrefs({ ...prefs, mode: 'single' })} title="Single page"><RectangleVertical className="w-4 h-4" /></ToolBtn>
          <ToolBtn active={prefs.mode === 'double'} onClick={() => setPrefs({ ...prefs, mode: 'double' })} title="Two-page spread"><Columns2 className="w-4 h-4" /></ToolBtn>
          <ToolBtn active={prefs.mode === 'scroll'} onClick={() => setPrefs({ ...prefs, mode: 'scroll', fit: 'width' })} title="Vertical scroll (webtoon)"><ScrollText className="w-4 h-4" /></ToolBtn>
          <ToolBtn active={prefs.rtl} onClick={() => setPrefs({ ...prefs, rtl: !prefs.rtl })} title="Right-to-left (manga)"><ArrowLeftRight className="w-4 h-4" /><span className="hidden sm:inline">RTL</span></ToolBtn>
          {prefs.mode !== 'scroll' && (
            <ToolBtn onClick={() => setPrefs({ ...prefs, fit: prefs.fit === 'height' ? 'width' : 'height' })} title="Fit to height / width">
              <Maximize className="w-4 h-4" /><span className="hidden sm:inline">{prefs.fit === 'height' ? 'Fit H' : 'Fit W'}</span>
            </ToolBtn>
          )}
          <ToolBtn active={thumbs} onClick={() => setThumbs(t => !t)} title="Page thumbnails"><Grid3x3 className="w-4 h-4" /></ToolBtn>
        </>
      }
    >
      {err ? (
        <p className="p-8 text-[#ff6b6b]">{err}</p>
      ) : !pages.length ? (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-xs">Unpacking pages (first open only)…</span>
        </div>
      ) : prefs.mode === 'scroll' ? (
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto">
            {pages.map((p, n) => (
              <img key={p} src={p} data-n={n} alt={`Page ${n + 1}`} loading="lazy" className="w-full block min-h-[200px]" />
            ))}
          </div>
        </div>
      ) : (
        <div ref={wrapRef} className={`absolute inset-0 ${prefs.fit === 'width' ? 'overflow-y-auto' : 'overflow-hidden'} flex justify-center ${prefs.fit === 'height' ? 'items-center' : 'items-start'} p-2 gap-1`}>
          {ordered.map(n => (
            <img key={pages[n]} src={pages[n]} alt={`Page ${n + 1}`} className={`${imgCls} ${shown.length > 1 ? (prefs.fit === 'height' ? 'max-w-[50%]' : 'w-1/2') : ''} select-none`} draggable={false} />
          ))}
          {/* Click zones: tap the left/right side to turn (mirrored for manga). */}
          <button className="absolute left-0 top-0 bottom-0 w-1/3 cursor-w-resize" onClick={() => (prefs.rtl ? next() : prev())} aria-label="Turn page" />
          <button className="absolute right-0 top-0 bottom-0 w-1/3 cursor-e-resize" onClick={() => (prefs.rtl ? prev() : next())} aria-label="Turn page" />
          {/* Preload the next pages. */}
          <div className="hidden">
            {[1, 2, 3].map(k => pages[i + k] && <img key={k} src={pages[i + k]} alt="" />)}
          </div>
        </div>
      )}
      {thumbs && pages.length > 0 && (
        <div className="absolute bottom-0 inset-x-0 bg-black/90 border-t border-white/10 p-2 flex gap-2 overflow-x-auto" dir={prefs.rtl ? 'rtl' : 'ltr'}>
          {pages.map((p, n) => (
            <button key={p} onClick={() => { goTo(n); if (prefs.mode === 'scroll') scrollRef.current?.querySelectorAll('img')[n]?.scrollIntoView(); }} className={`shrink-0 w-14 border-2 rounded ${shown.includes(n) ? 'border-[var(--spot-accent)]' : 'border-transparent'}`}>
              <img src={p} alt="" loading="lazy" className="w-full aspect-[2/3] object-cover rounded-sm" />
              <span className="text-[10px] text-zinc-400">{n + 1}</span>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
};

// ───────────────────────── PDF ─────────────────────────

const PdfReader: React.FC<{ book: Book; onClose: () => void }> = ({ book, onClose }) => {
  const [doc, setDoc] = useState<any>(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(() => Math.max(1, Number(book.progress?.location) || 1));
  const [zoom, setZoom] = useState(1);
  const [spread, setSpread] = useState(book.kind === 'comic');
  const [fit, setFit] = useState<'height' | 'width'>(book.kind === 'comic' ? 'height' : 'width');
  const areaRef = useRef<HTMLDivElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const save = useSaveProgress(book);
  const { base } = useSrc();

  useEffect(() => {
    let d: any;
    openPdf(`${base}/api/books/${book.id}/file`)
      .then(x => {
        d = x;
        setDoc(x);
        if (!book.pageCount && !base) api('/api/books', { method: 'PATCH', json: { id: book.id, pageCount: x.numPages } }).catch(() => {});
      })
      .catch(e => setErr(`Couldn't open this PDF: ${e?.message || e}`));
    return () => d?.destroy?.();
  }, [book.id, book.pageCount, base]);

  const shown = useMemo(() => {
    if (!doc) return [];
    if (spread && page > 1) return [page, page + 1].filter(n => n <= doc.numPages);
    return [page];
  }, [doc, page, spread]);

  useEffect(() => {
    if (!doc || !areaRef.current) return;
    let cancelled = false;
    const tasks: any[] = [];
    (async () => {
      const area = areaRef.current!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let k = 0; k < shown.length; k++) {
        const p = await doc.getPage(shown[k]);
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        const availW = (area.clientWidth - 24) / shown.length;
        const availH = area.clientHeight - 24;
        const fitScale = fit === 'width' ? availW / base.width : Math.min(availW / base.width, availH / base.height);
        const vp = p.getViewport({ scale: fitScale * zoom * dpr });
        const c = canvases.current[k];
        if (!c) continue;
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        c.style.width = `${Math.floor(vp.width / dpr)}px`;
        c.style.height = `${Math.floor(vp.height / dpr)}px`;
        const task = p.render({ canvasContext: c.getContext('2d')!, viewport: vp });
        tasks.push(task);
        await task.promise.catch(() => {});
      }
    })();
    save(String(page), doc.numPages ? (page + shown.length - 1) / doc.numPages : 0);
    return () => {
      cancelled = true;
      tasks.forEach(t => t.cancel?.());
    };
  }, [doc, shown, zoom, fit, page, save]);

  const total = doc?.numPages || 0;
  const go = useCallback(
    (n: number) => {
      let v = Math.max(1, Math.min(total, n));
      if (spread && v > 1 && v % 2 === 1) v -= 1;
      setPage(v);
      areaRef.current?.scrollTo(0, 0);
    },
    [total, spread]
  );
  const next = useCallback(() => go(page + (spread && page > 1 ? 2 : 1)), [go, page, spread]);
  const prev = useCallback(() => go(page - (spread && page > 2 ? 2 : 1)), [go, page, spread]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(4, z + 0.15));
      else if (e.key === '-') setZoom(z => Math.max(0.4, z - 0.15));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  return (
    <Shell
      book={book}
      onClose={onClose}
      subtitle={total ? `Page ${shown.join('–')} of ${total}` : 'Loading…'}
      percent={total ? (page + shown.length - 1) / total : 0}
      tools={
        <>
          <ToolBtn onClick={() => setZoom(z => Math.max(0.4, z - 0.15))} title="Zoom out"><ZoomOut className="w-4 h-4" /></ToolBtn>
          <span className="text-[11px] font-mono text-zinc-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <ToolBtn onClick={() => setZoom(z => Math.min(4, z + 0.15))} title="Zoom in"><ZoomIn className="w-4 h-4" /></ToolBtn>
          <ToolBtn active={fit === 'width'} onClick={() => setFit(f => (f === 'width' ? 'height' : 'width'))} title="Fit width / whole page"><Maximize className="w-4 h-4" /></ToolBtn>
          <ToolBtn active={spread} onClick={() => setSpread(s => !s)} title="Two-page spread"><Columns2 className="w-4 h-4" /></ToolBtn>
          <input
            type="number"
            min={1}
            max={total || 1}
            value={page}
            onChange={e => go(Number(e.target.value))}
            className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white"
            aria-label="Page number"
          />
        </>
      }
    >
      {err ? (
        <p className="p-8 text-[#ff6b6b]">{err}</p>
      ) : !doc ? (
        <div className="h-full flex items-center justify-center text-zinc-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div ref={areaRef} className="absolute inset-0 overflow-auto bg-[#1b1f22]">
          <div className={`min-h-full flex justify-center gap-2 p-3 ${fit === 'height' ? 'items-center' : 'items-start'}`}>
            {shown.map((n, k) => (
              <canvas key={n} ref={el => { canvases.current[k] = el; }} className="shadow-2xl bg-white" />
            ))}
          </div>
          <button onClick={prev} className="fixed left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/80" title="Previous page"><ChevronLeft className="w-6 h-6" /></button>
          <button onClick={next} className="fixed right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/80" title="Next page"><ChevronRight className="w-6 h-6" /></button>
        </div>
      )}
    </Shell>
  );
};

// ───────────────────────── entry ─────────────────────────

/** Open a book. `base` reads a friend's book through their Spot (see FriendSpot). */
export const Reader: React.FC<{ book: Book; onClose: () => void; base?: string }> = ({ book, onClose, base = '' }) => (
  <SourceCtx.Provider value={{ base }}>
    <ReaderInner book={book} onClose={onClose} />
  </SourceCtx.Provider>
);

const ReaderInner: React.FC<{ book: Book; onClose: () => void }> = ({ book, onClose }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  switch (book.format) {
    case 'epub':
      return <EpubReader book={book} onClose={onClose} />;
    case 'cbz':
    case 'cbr':
      return <ComicReader book={book} onClose={onClose} />;
    case 'pdf':
      return <PdfReader book={book} onClose={onClose} />;
    case 'txt':
    case 'md':
      return <TextReader book={book} onClose={onClose} />;
    default:
      return (
        <Shell book={book} onClose={onClose}>
          <div className="p-8 text-zinc-400 flex items-center gap-2"><BookOpen className="w-5 h-5" /> This format can’t be opened yet.</div>
        </Shell>
      );
  }
};
