import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { AUDIO_DIR, VIDEO_DIR, THUMB_DIR, BOOKS_DIR } from '@/lib/paths';
import { serveFile } from '@/lib/serveFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIRS: Record<string, string> = {
  audio: AUDIO_DIR,
  video: VIDEO_DIR,
  thumbnails: THUMB_DIR,
  books: BOOKS_DIR
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; filename: string }> }
) {
  const { type, filename } = await params;
  const dir = DIRS[type];
  if (!dir) return new NextResponse('Invalid media type', { status: 400 });
  // basename() blocks any ../ traversal
  const file = path.join(dir, path.basename(decodeURIComponent(filename)));
  const headers: Record<string, string> = {};
  if (file.toLowerCase().endsWith('.svg')) {
    // SVGs can carry script; never let one run as a document.
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
  }
  return serveFile(request, file, headers);
}
