import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { albumDir, thumbPath } from '@/lib/pictures';
import { serveFile } from '@/lib/serveFile';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ kind: string; album: string; name: string }> };

/** /api/pictures/file/<album>/<name> → the picture;  /api/pictures/thumb/... → its preview (or the picture). */
export async function GET(request: NextRequest, { params }: Params) {
  const { kind, album, name } = await params;
  const a = decodeURIComponent(album);
  const n = path.basename(decodeURIComponent(name));
  const dir = albumDir(a);
  if (!dir || (kind !== 'file' && kind !== 'thumb')) return new NextResponse('Not found', { status: 404 });
  const file = path.join(dir, n);
  if (kind === 'thumb') {
    const t = thumbPath(a, n);
    if (fs.existsSync(t)) return serveFile(request, t, { 'Cache-Control': 'private, max-age=86400' }, 'image/jpeg');
  }
  return serveFile(request, file, { 'Cache-Control': 'private, max-age=3600' });
}

/** The browser posts a small JPEG preview it made for a picture. */
export async function POST(request: NextRequest, { params }: Params) {
  const { kind, album, name } = await params;
  const a = decodeURIComponent(album);
  const n = path.basename(decodeURIComponent(name));
  const dir = albumDir(a);
  if (kind !== 'thumb' || !dir || !fs.existsSync(path.join(dir, n))) return fail('No such picture', 404);
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length < 100 || buf.length > 2 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return fail('Not a JPEG preview');
  const t = thumbPath(a, n);
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, buf);
  return ok();
}
