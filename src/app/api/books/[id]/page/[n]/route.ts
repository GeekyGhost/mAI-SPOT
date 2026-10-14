import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getDatabase } from '@/lib/db';
import { CACHE_DIR } from '@/lib/paths';
import { ensureComicPages } from '@/lib/books';
import { serveFile } from '@/lib/serveFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const book = getDatabase().books.find(b => b.id === id);
  if (!book) return new NextResponse('Not found', { status: 404 });
  const pages = await ensureComicPages(book);
  const name = pages[Number(n) - 1];
  if (!name) return new NextResponse('No such page', { status: 404 });
  return serveFile(request, path.join(CACHE_DIR, book.id, name), { 'Cache-Control': 'private, max-age=86400' });
}
