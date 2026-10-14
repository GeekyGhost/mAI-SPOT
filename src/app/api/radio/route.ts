import { NextRequest } from 'next/server';
import { getDatabase, createStation, updateStation, deleteStation } from '@/lib/db';
import { goLive, goOffAir, skipLive, computeLive } from '@/lib/radio';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDatabase();
  return ok({ stations: db.stations, live: computeLive(db, Date.now()) });
}

/**
 * { action: 'create', station } | { action: 'update', id, station } | { action: 'delete', id }
 * { action: 'go_live', id } | { action: 'off_air' } | { action: 'skip' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    switch (body.action) {
      case 'create':
        return ok({ station: createStation(body.station || {}) });
      case 'update': {
        const st = updateStation(body.id, body.station || {});
        return st ? ok({ station: st }) : fail('Station not found', 404);
      }
      case 'delete':
        deleteStation(body.id);
        return ok();
      case 'go_live': {
        const st = goLive(body.id);
        if (!st) return fail('Station not found', 404);
        break;
      }
      case 'off_air':
        goOffAir();
        break;
      case 'skip':
        skipLive();
        break;
      default:
        return fail('Unknown action');
    }
    const db = getDatabase();
    return ok({ stations: db.stations, live: computeLive(db, Date.now()) });
  } catch (e) {
    return fail(e);
  }
}
