import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { mimeFor } from './paths';

function toWebStream(nodeStream: fs.ReadStream): ReadableStream {
  let closed = false;
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', chunk => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
          nodeStream.destroy();
        }
      });
      nodeStream.on('end', () => {
        if (!closed) {
          closed = true;
          try { controller.close(); } catch {}
        }
      });
      nodeStream.on('error', err => {
        if (!closed) {
          closed = true;
          try { controller.error(err); } catch {}
        }
      });
    },
    cancel() {
      closed = true;
      nodeStream.destroy();
    }
  });
}

/** Stream a file from disk with HTTP Range support (needed for seeking audio/video). */
export function serveFile(
  request: NextRequest,
  filePath: string,
  extraHeaders: Record<string, string> = {},
  contentType?: string
): NextResponse {
  if (!fs.existsSync(filePath)) return new NextResponse('File not found', { status: 404 });
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return new NextResponse('File not found', { status: 404 });
  const size = stat.size;
  const type = contentType || mimeFor(filePath);
  const base = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Last-Modified': stat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=300',
    ...extraHeaders
  };

  const range = request.headers.get('range');
  if (range && size > 0) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    let start: number;
    let end: number;
    if (m && m[1] === '' && m[2] !== '') {
      // suffix range: last N bytes
      start = Math.max(0, size - parseInt(m[2], 10));
      end = size - 1;
    } else {
      start = m && m[1] ? parseInt(m[1], 10) : 0;
      end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    }
    if (isNaN(start) || isNaN(end) || start > end || start >= size) {
      return new NextResponse('Requested range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      });
    }
    return new NextResponse(toWebStream(fs.createReadStream(filePath, { start, end })), {
      status: 206,
      headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
    });
  }

  return new NextResponse(toWebStream(fs.createReadStream(filePath)), {
    status: 200,
    headers: { ...base, 'Content-Length': String(size) }
  });
}
