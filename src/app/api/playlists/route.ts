import { NextRequest } from 'next/server';
import { getDatabase, createPlaylist, updatePlaylist, deletePlaylist } from '@/lib/db';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({ playlists: getDatabase().playlists });
}

export async function POST(request: NextRequest) {
  try {
    return ok({ playlist: createPlaylist(await request.json()) });
  } catch (e) {
    return fail(e, 500);
  }
}

/** { id, name?, description?, cover?, trackIds? } or { id, addTrackIds: [] } */
export async function PATCH(request: NextRequest) {
  try {
    const { id, addTrackIds, ...updates } = await request.json();
    if (addTrackIds) {
      const pl = getDatabase().playlists.find(p => p.id === id);
      if (!pl) return fail('Playlist not found', 404);
      updates.trackIds = [...pl.trackIds, ...(addTrackIds as string[]).filter(t => !pl.trackIds.includes(t))];
    }
    const playlist = updatePlaylist(id, updates);
    return playlist ? ok({ playlist }) : fail('Playlist not found', 404);
  } catch (e) {
    return fail(e, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail('id required');
  deletePlaylist(id);
  return ok();
}
