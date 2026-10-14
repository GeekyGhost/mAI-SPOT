import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { APPS_DIR, safeJoin } from '@/lib/paths';
import { serveFile } from '@/lib/serveFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves an installed game/app. Together with the iframe's sandbox="allow-scripts" (no
 * allow-same-origin) this CSP keeps a game inside its own folder: it can load its own files,
 * but cannot call this node's APIs, reach other sites, or submit forms.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; path: string[] }> }
) {
  const { slug, path: parts } = await params;
  const appRoot = safeJoin(APPS_DIR, path.basename(slug));
  if (!appRoot) return new NextResponse('Not found', { status: 404 });
  const file = safeJoin(appRoot, parts.map(p => decodeURIComponent(p)).join('/'));
  if (!file) return new NextResponse('Not found', { status: 404 });

  const host = request.headers.get('host') || 'localhost';
  const own = `http://${host}/api/apps/run/${encodeURIComponent(path.basename(slug))}/`;
  const csp = [
    `default-src ${own}`,
    `script-src ${own} 'unsafe-inline' 'unsafe-eval' blob:`,
    `style-src ${own} 'unsafe-inline'`,
    `img-src ${own} data: blob:`,
    `media-src ${own} data: blob:`,
    `font-src ${own} data:`,
    `connect-src ${own} data: blob:`,
    `worker-src ${own} blob:`,
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'"
  ].join('; ');

  return serveFile(request, file, {
    'Content-Security-Policy': csp,
    // The sandboxed frame has an opaque ("null") origin, so its own module scripts,
    // fetch() and WASM loads are cross-origin and need CORS to succeed.
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
}
