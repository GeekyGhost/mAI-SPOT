import { NextRequest } from 'next/server';
import { getAllTracks, updateTrack, recordTrackPlay, deleteAsset, getDatabase } from '@/lib/db';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok({ tracks: getAllTracks() });
  } catch (e) {
    return fail(e, 500);
  }
}

/** Edit tags: { id, title?, artist?, album?, genre?, coverArt?, year? } */
export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    const allowed = ['title', 'artist', 'album', 'genre', 'coverArt', 'year', 'channelId'];
    const clean = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
    const track = updateTrack(id, clean);
    if (!track) return fail('Track not found', 404);
    // Optionally give every song on the same album the same cover.
    let albumUpdated = 0;
    if (updates.applyCoverToAlbum && track.album && clean.coverArt !== undefined) {
      const same = getDatabase().tracks.filter(t => t.id !== id && (t.album || '').toLowerCase() === track.album!.toLowerCase());
      for (const t of same) updateTrack(t.id, { coverArt: track.coverArt });
      albumUpdated = same.length;
    }
    return ok({ track, albumUpdated });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === 'play' && body.id) {
      recordTrackPlay(body.id);
      return ok();
    }
    return fail('Unknown action');
  } catch (e) {
    return fail(e, 500);
  }
}

/** Removes the track AND its file (otherwise the library scan would re-import it). */
export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    const track = getDatabase().tracks.find(t => t.id === id);
    if (!track) return fail('Track not found', 404);
    const file = decodeURIComponent(track.filePath.split('/').pop() || '');
    deleteAsset('audio', file);
    return ok();
  } catch (e) {
    return fail(e, 500);
  }
}
