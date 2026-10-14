import { NextRequest } from 'next/server';
import { getDatabase, createCollection, updateCollection, deleteCollection } from '@/lib/db';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({ collections: getDatabase().collections });
}

export async function POST(request: NextRequest) {
  try {
    return ok({ collection: createCollection(await request.json()) });
  } catch (e) {
    return fail(e, 500);
  }
}

/** { id, name?, description?, cover?, videoIds? } or { id, toggleVideoId } */
export async function PATCH(request: NextRequest) {
  try {
    const { id, toggleVideoId, ...updates } = await request.json();
    if (toggleVideoId) {
      const col = getDatabase().collections.find(c => c.id === id);
      if (!col) return fail('Collection not found', 404);
      updates.videoIds = col.videoIds.includes(toggleVideoId)
        ? col.videoIds.filter(v => v !== toggleVideoId)
        : [...col.videoIds, toggleVideoId];
    }
    const collection = updateCollection(id, updates);
    return collection ? ok({ collection }) : fail('Collection not found', 404);
  } catch (e) {
    return fail(e, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail('id required');
  deleteCollection(id);
  return ok();
}
