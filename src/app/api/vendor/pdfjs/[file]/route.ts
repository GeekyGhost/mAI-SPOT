import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { ROOT } from '@/lib/paths';
import { serveFile } from '@/lib/serveFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// pdf.js is loaded straight from node_modules (no bundling) for the PDF reader.
const FILES: Record<string, string> = {
  'pdf.mjs': 'legacy/build/pdf.min.mjs',
  'pdf.worker.mjs': 'legacy/build/pdf.worker.min.mjs'
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const rel = FILES[file];
  if (!rel) return new NextResponse('Not found', { status: 404 });
  return serveFile(request, path.join(ROOT, 'node_modules', 'pdfjs-dist', rel), {
    'Cache-Control': 'public, max-age=86400'
  }, 'text/javascript; charset=utf-8');
}
