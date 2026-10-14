import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/db';
import { ensureComicPages, getEpubStructure } from '@/lib/books';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Reading structure: EPUB spine/chapters, or the page list of a comic (extracts on first open). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = getDatabase().books.find(b => b.id === id);
  if (!book) return fail('Book not found', 404);
  try {
    if (book.format === 'epub') {
      const s = await getEpubStructure(book);
      return ok({
        format: 'epub',
        chapters: s.spine.map((c, i) => ({
          index: i,
          title: c.title || `Section ${i + 1}`,
          url: `/api/books/${book.id}/epub/${(s.base + c.href).split('/').map(encodeURIComponent).join('/')}`
        }))
      });
    }
    if (book.format === 'cbz' || book.format === 'cbr') {
      const pages = await ensureComicPages(book);
      return ok({
        format: book.format,
        pages: pages.map((_, i) => `/api/books/${book.id}/page/${i + 1}`)
      });
    }
    return ok({ format: book.format, url: `/api/books/${book.id}/file` });
  } catch (e) {
    return fail(`Couldn't open this file: ${(e as Error).message}`, 500);
  }
}
