import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getDatabase } from '@/lib/db';
import { BOOKS_DIR } from '@/lib/paths';
import { serveFile } from '@/lib/serveFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = getDatabase().books.find(b => b.id === id);
  if (!book) return new NextResponse('Not found', { status: 404 });
  return serveFile(request, path.join(BOOKS_DIR, path.basename(book.fileName)));
}
