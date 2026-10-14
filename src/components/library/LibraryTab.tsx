'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Library, Search, Upload, BookMarked, Layers, ChevronLeft } from 'lucide-react';
import { Pencil as PencilIcon } from 'lucide-react';
import { useP2P } from '@/components/social/P2PProvider';
import type { Book, BookKind } from '@/lib/types';
import { BOOK_GENRES } from '@/lib/types';
import { api } from '@/lib/client';
import { Reader } from './Reader';
import { makePdfCover } from './pdf';
import { PageCoverPicker } from './PageCoverPicker';
import { Modal, Field, inputCls, Btn, Chip, Menu, Art, ImagePicker, Empty } from '@/components/ui/kit';

interface Props {
  books: Book[];
  onRefresh: () => void;
  onUpload: () => void;
  /** Opens the Library Manager to edit details and artwork. */
  onManage?: () => void;
}

const triedCovers = new Set<string>();

export const LibraryTab: React.FC<Props> = ({ books, onRefresh, onUpload, onManage }) => {
  const p2p = useP2P();
  const [kind, setKind] = useState<BookKind>('ebook');
  const [genre, setGenre] = useState('');
  const [series, setSeries] = useState<string | null>(null);
  const [bySeries, setBySeries] = useState(true);
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState<Book | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);

  // PDFs dropped into content\books have no cover; render page 1 in the background.
  useEffect(() => {
    const todo = books.filter(b => b.format === 'pdf' && !b.cover && !triedCovers.has(b.id));
    if (!todo.length) return;
    let changed = false;
    (async () => {
      for (const b of todo) {
        triedCovers.add(b.id);
        if (await makePdfCover(b)) changed = true;
      }
      if (changed) onRefresh();
    })();
  }, [books, onRefresh]);

  const items = books.filter(b => b.kind === kind);
  const q = query.trim().toLowerCase();
  const filtered = items.filter(
    b =>
      (!genre || b.genre === genre) &&
      (!series || (b.series || b.title) === series) &&
      (!q || [b.title, b.author, b.series, b.genre].some(s => s?.toLowerCase().includes(q)))
  );
  const genres = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(b => m.set(b.genre, (m.get(b.genre) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  const inProgress = items
    .filter(b => b.progress && b.progress.percent > 0.005 && b.progress.percent < 0.995)
    .sort((a, b) => (b.progress!.updatedAt || '').localeCompare(a.progress!.updatedAt || ''));

  const seriesGroups = useMemo(() => {
    const m = new Map<string, Book[]>();
    filtered.forEach(b => {
      const k = b.series || b.title;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    });
    for (const list of m.values()) list.sort((a, b) => (Number(a.issue) || 0) - (Number(b.issue) || 0) || a.title.localeCompare(b.title));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const close = () => {
    setReading(null);
    onRefresh();
  };

  const cover = (b: Book) => (
    <div key={b.id} className="group cursor-pointer" onClick={() => setReading(b)}>
      <Art src={b.cover} title={b.title} className="aspect-[2/3] rounded-lg shadow-lg border border-white/5 group-hover:border-[var(--spot-accent)] transition-all group-hover:-translate-y-1">
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-black uppercase text-white">{b.format}</span>
        {b.progress && b.progress.percent > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/60">
            <div className="h-full bg-[var(--spot-accent)]" style={{ width: `${Math.round(b.progress.percent * 100)}%` }} />
          </div>
        )}
      </Art>
      <div className="flex items-start gap-1 mt-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{b.issue && b.series ? `${b.series} #${b.issue}` : b.title}</div>
          <div className="text-xs text-zinc-500 truncate">
            {b.author || b.genre}
            {b.progress && b.progress.percent > 0 ? ` · ${Math.round(b.progress.percent * 100)}%` : ''}
          </div>
        </div>
        <Menu
          items={[
            { label: 'Read', onClick: () => setReading(b) },
            { label: 'Share with friends…', onClick: () => p2p.setDialog({ type: 'share', rid: `book:${b.id}`, name: b.series && b.issue ? `${b.series} #${b.issue}` : b.title }) },
            { label: 'Edit details', onClick: () => setEditing(b) },
            { label: b.kind === 'comic' ? 'Move to Books' : 'Move to Comics', onClick: async () => { await api('/api/books', { method: 'PATCH', json: { id: b.id, kind: b.kind === 'comic' ? 'ebook' : 'comic' } }); onRefresh(); } },
            b.progress ? { label: 'Mark as unread', onClick: async () => { await api('/api/books', { method: 'PATCH', json: { id: b.id, progress: { location: '0', percent: 0 } } }); onRefresh(); } } : null,
            {
              label: 'Delete (removes the file)',
              danger: true,
              onClick: async () => {
                if (!confirm(`Delete “${b.title}” from your library and disk?`)) return;
                await api(`/api/books?id=${b.id}`, { method: 'DELETE' });
                onRefresh();
              }
            }
          ]}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Library className="w-6 h-6 text-[#ffcf33]" /> Library
          </h1>
          <p className="text-sm text-[#649fae]">Read e-books, poems and comics right here. EPUB, PDF, TXT, Markdown, CBZ and CBR, and it remembers your place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onManage && (
            <Btn onClick={onManage} title="Edit titles, tags and cover art">
              <PencilIcon className="w-4 h-4" /> Edit library
            </Btn>
          )}
          <Btn variant="primary" onClick={onUpload}>
            <Upload className="w-4 h-4" /> Add books or comics
          </Btn>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-black/40 rounded-xl p-1 border border-white/10">
          {(
            [
              ['ebook', 'Books', BookOpen],
              ['comic', 'Comics', BookMarked]
            ] as [BookKind, string, React.ComponentType<{ className?: string }>][]
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setGenre('');
                setSeries(null);
              }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold ${kind === k ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              <Icon className="w-4 h-4" /> {label}
              <span className={kind === k ? 'text-black/50' : 'text-zinc-600'}>{books.filter(b => b.kind === k).length}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {kind === 'comic' && (
            <Btn small onClick={() => { setBySeries(s => !s); setSeries(null); }}>
              <Layers className="w-3.5 h-3.5" /> {bySeries ? 'Showing series' : 'Showing issues'}
            </Btn>
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Title, author, series" className={`${inputCls} pl-9 w-56`} />
          </div>
        </div>
      </div>

      {genres.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={!genre} onClick={() => setGenre('')} count={items.length}>All</Chip>
          {genres.map(([g, n]) => (
            <Chip key={g} active={genre === g} onClick={() => setGenre(g)} count={n}>{g}</Chip>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Empty icon={kind === 'comic' ? <BookMarked className="w-10 h-10" /> : <BookOpen className="w-10 h-10" />} title={kind === 'comic' ? 'No comics yet' : 'No books yet'}>
          Upload files or drop them into <code className="text-white">content\books</code>. EPUB, PDF, TXT and Markdown go to Books; CBZ and CBR go to Comics. Covers, titles and authors are read from the files.
        </Empty>
      ) : (
        <>
          {inProgress.length > 0 && !series && !q && !genre && (
            <div>
              <h3 className="text-lg font-black text-white mb-3">Continue reading</h3>
              <div className="flex gap-4 overflow-x-auto pb-2 [&>*]:w-36 [&>*]:shrink-0">{inProgress.map(cover)}</div>
            </div>
          )}
          {series && (
            <button onClick={() => setSeries(null)} className="text-sm text-zinc-400 hover:text-white flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> All series
            </button>
          )}
          {kind === 'comic' && bySeries && !series ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
              {seriesGroups.map(([name, list]) =>
                list.length === 1 ? (
                  cover(list[0])
                ) : (
                  <button key={name} onClick={() => setSeries(name)} className="text-left group">
                    <div className="relative aspect-[2/3]">
                      {list
                        .slice(0, 3)
                        .reverse()
                        .map((b, k, arr) => {
                          const depth = arr.length - 1 - k; // back covers peek out up and to the right
                          return (
                            <div key={b.id} className="absolute inset-0 transition-transform group-hover:-translate-y-1" style={{ transform: `translate(${depth * 6}px, ${depth * -6}px)` }}>
                              <Art src={b.cover} title={b.title} className="w-full h-full rounded-lg shadow-lg border border-white/10" />
                            </div>
                          );
                        })}
                      <span className="absolute bottom-2 right-2 z-10 px-2 py-0.5 rounded-full bg-[var(--spot-accent)] text-black text-[10px] font-black">{list.length} issues</span>
                    </div>
                    <div className="text-sm font-bold text-white truncate mt-3">{name}</div>
                    <div className="text-xs text-zinc-500">{list.filter(b => b.progress && b.progress.percent > 0.99).length} of {list.length} read</div>
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">{(series ? seriesGroups.flatMap(([, l]) => l) : filtered).map(cover)}</div>
          )}
        </>
      )}

      {reading && <Reader book={reading} onClose={close} />}
      {editing && <BookEditor book={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onRefresh(); }} />}
    </div>
  );
};

export const BookEditor: React.FC<{ book: Book; onClose: () => void; onSaved: () => void }> = ({ book, onClose, onSaved }) => {
  const [b, setB] = useState<Book>({ ...book });
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit details"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={async () => {
              await api('/api/books', {
                method: 'PATCH',
                json: { id: b.id, title: b.title, author: b.author, kind: b.kind, genre: b.genre, series: b.series || '', issue: b.issue || '', description: b.description || '', cover: b.cover }
              });
              onSaved();
            }}
          >
            Save
          </Btn>
        </>
      }
    >
      <Field label="Title">
        <input className={inputCls} value={b.title} onChange={e => setB({ ...b, title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={b.kind === 'comic' ? 'Writer / artist' : 'Author'}>
          <input className={inputCls} value={b.author} onChange={e => setB({ ...b, author: e.target.value })} />
        </Field>
        <Field label="Shelf">
          <select className={inputCls} value={b.kind} onChange={e => setB({ ...b, kind: e.target.value as BookKind })}>
            <option value="ebook">Books</option>
            <option value="comic">Comics</option>
          </select>
        </Field>
        <Field label="Genre">
          <input className={inputCls} list="book-genres" value={b.genre} onChange={e => setB({ ...b, genre: e.target.value })} />
          <datalist id="book-genres">{BOOK_GENRES.map(g => <option key={g} value={g} />)}</datalist>
        </Field>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <Field label="Series">
            <input className={inputCls} value={b.series || ''} onChange={e => setB({ ...b, series: e.target.value })} />
          </Field>
          <Field label="#">
            <input className={inputCls} value={b.issue || ''} onChange={e => setB({ ...b, issue: e.target.value })} />
          </Field>
        </div>
      </div>
      <Field label="Description">
        <textarea className={inputCls} rows={3} value={b.description || ''} onChange={e => setB({ ...b, description: e.target.value })} />
      </Field>
      <ImagePicker
        value={b.cover}
        onChange={url => setB({ ...b, cover: url })}
        label="Cover"
        aspect="aspect-[2/3]"
        extra={['cbz', 'cbr', 'pdf'].includes(b.format) ? <PageCoverPicker book={book} onPick={url => setB({ ...b, cover: url })} /> : undefined}
      />
    </Modal>
  );
};
