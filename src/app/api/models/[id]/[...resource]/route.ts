import { NextRequest } from 'next/server';
import { modelFile } from '@/lib/models';
import { serveFile } from '@/lib/serveFile';
import { fail } from '@/lib/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; resource: string[] }> }) {
  try {
    const { id, resource } = await params;
    const asset = resource.length === 1 && resource[0] === 'download' ? 'download' : resource.length === 2 && resource[0] === 'asset' ? resource[1] : '';
    const item = modelFile(id, asset);
    const filename = encodeURIComponent(item.name).replace(/['()*]/g, ch => `%${ch.charCodeAt(0).toString(16)}`);
    return serveFile(request, item.file, { 'Cache-Control': 'no-store', 'Content-Disposition': `${item.attachment ? 'attachment' : 'inline'}; filename*=UTF-8''${filename}`,
      'Content-Security-Policy': "default-src 'none'; sandbox" }, item.mime);
  } catch { return fail('No such model file', 404); }
}
