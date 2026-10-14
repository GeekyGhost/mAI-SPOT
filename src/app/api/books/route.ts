import { NextRequest } from 'next/server';
import { getBooks, updateBook, getDatabase, deleteAsset } from '@/lib/db';
import { clearBookCache } from '@/lib/books';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({ books: getBooks() });
}

/** Edit details or save reading progress: { id, title?, author?, kind?, genre?, series?, issue?, cover?, progress? } */
export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    const allowed = ['title', 'author', 'kind', 'genre', 'series', 'issue', 'description', 'cover', 'progress', 'pageCount'];
    const clean = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
    if (clean.progress) {
      const p = clean.progress as { location: string; percent: number };
      clean.progress = { location: String(p.location), percent: Math.max(0, Math.min(1, Number(p.percent) || 0)), updatedAt: new Date().toISOString() };
    }
    const book = updateBook(id, clean);
    return book ? ok({ book }) : fail('Book not found', 404);
  } catch (e) {
    return fail(e, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  const book = getDatabase().books.find(b => b.id === id);
  if (!book) return fail('Book not found', 404);
  clearBookCache(book.id);
  deleteAsset('book', book.fileName);
  return ok();
}
