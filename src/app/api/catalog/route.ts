import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/db';
import { syncLibrary } from '@/lib/media';
import { computeLive } from '@/lib/radio';
import { ok, fail } from '@/lib/api';
import { listModels } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the UI needs in one request. Also reconciles the library with content/ on disk. */
export async function GET(request: NextRequest) {
  try {
    const force = new URL(request.url).searchParams.get('sync') === 'force';
    const report = await syncLibrary(force);
    const db = getDatabase();
    return ok({
      sync: report,
      tracks: db.tracks,
      videos: db.videos,
      channels: db.channels,
      videoGenres: db.genres,
      playlists: db.playlists,
      stations: db.stations,
      collections: db.collections,
      watchProgress: db.watchProgress,
      games: db.games,
      books: db.books,
      models: listModels(),
      live: computeLive(db, Date.now())
    });
  } catch (e) {
    return fail(e, 500);
  }
}
