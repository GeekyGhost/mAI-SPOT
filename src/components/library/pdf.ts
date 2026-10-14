'use client';

import type { Book } from '@/lib/types';
import { api, uploadFile } from '@/lib/client';

// pdf.js is served straight from node_modules by /api/vendor/pdfjs (kept out of the bundle).
let pdfjs: Promise<any> | null = null;

export function loadPdfjs(): Promise<any> {
  if (!pdfjs) {
    const url = '/api/vendor/pdfjs/pdf.mjs';
    pdfjs = import(/* webpackIgnore: true */ url).then((m: any) => {
      m.GlobalWorkerOptions.workerSrc = '/api/vendor/pdfjs/pdf.worker.mjs';
      return m;
    });
    pdfjs.catch(() => (pdfjs = null));
  }
  return pdfjs;
}

export async function openPdf(url: string): Promise<any> {
  const lib = await loadPdfjs();
  return lib.getDocument({ url, isEvalSupported: false }).promise;
}

/** Render page 1 of a PDF and save it as the book's cover (books dropped in have none). */
export async function makePdfCover(book: Book): Promise<boolean> {
  try {
    const doc = await openPdf(`/api/books/${book.id}/file`);
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = 480 / vp1.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    const pageCount = doc.numPages;
    doc.destroy();
    if (!blob) return false;
    const up = await uploadFile('thumbnail', blob, `book_${book.id}.jpg`);
    await api('/api/books', { method: 'PATCH', json: { id: book.id, cover: up.url, pageCount } });
    return true;
  } catch {
    return false;
  }
}
