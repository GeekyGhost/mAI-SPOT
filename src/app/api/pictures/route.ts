import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api';
import { listAlbums, listPictures, albumDir, createAlbum, renameAlbum, deleteAlbum, deletePicture, movePicture } from '@/lib/pictures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → all albums; GET ?album=<id> → that album's pictures. */
export async function GET(request: NextRequest) {
  const album = new URL(request.url).searchParams.get('album');
  if (album) {
    if (!albumDir(album)) return fail('No such album', 404);
    return ok({ album, pictures: listPictures(album) });
  }
  return ok({ albums: listAlbums() });
}

export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    switch (b.action) {
      case 'create':
        return ok({ id: createAlbum(b.name) });
      case 'rename':
        return ok({ id: renameAlbum(b.id, b.name) });
      case 'delete':
        deleteAlbum(b.id);
        return ok();
      case 'deletePicture':
        deletePicture(b.album, b.name);
        return ok();
      case 'move':
        return ok({ name: movePicture(b.album, b.name, b.to) });
      default:
        return fail('Unknown action');
    }
  } catch (e) {
    return fail(e);
  }
}
