import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { readEpubEntry } from '@/lib/books';
import { mimeFor } from '@/lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Files inside an EPUB, served at their zip paths so a chapter's relative links to its
 * images and stylesheets just work. Scripts inside books are never allowed to run.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: parts } = await params;
  const book = getDatabase().books.find(b => b.id === id);
  if (!book || book.format !== 'epub') return new NextResponse('Not found', { status: 404 });
  const inner = parts.map(p => decodeURIComponent(p)).join('/');
  const data = await readEpubEntry(book, inner);
  if (!data) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(Buffer.from(data), {
    headers: {
      'Content-Type': mimeFor(inner),
      'Content-Security-Policy': "script-src 'none'; object-src 'none'; frame-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600'
    }
  });
}
