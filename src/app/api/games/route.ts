import { NextRequest } from 'next/server';
import { getAllGames, recordGamePlay, updateGame, deleteAsset, getDatabase, toggleReaction } from '@/lib/db';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok({ games: getAllGames() });
  } catch (e) {
    return fail(e, 500);
  }
}

/**
 * { action: 'play', gameId } | { action: 'score', id, score } | { action: 'update', id, ...fields } | { action: 'react', id, type }
 * New games/apps are installed through /api/upload?kind=app (zip or html).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === 'play' && body.gameId) {
      recordGamePlay(body.gameId);
      return ok();
    }
    if (body.action === 'score' && body.id) {
      const g = getDatabase().games.find(x => x.id === body.id);
      if (!g) return fail('Not found', 404);
      const score = Math.max(0, Math.floor(Number(body.score) || 0));
      const isBest = score > (g.best || 0);
      updateGame(body.id, { ...(isBest ? { best: score } : {}), lastPlayed: new Date().toISOString() });
      return ok({ best: isBest ? score : g.best || 0, isBest });
    }
    if (body.action === 'update' && body.id) {
      const allowed = ['title', 'description', 'thumbnail', 'controlsHelp', 'genre', 'category', 'kind'];
      const clean = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
      const game = updateGame(body.id, clean);
      return game ? ok({ game }) : fail('Not found', 404);
    }
    if (body.action === 'react' && body.id && (body.type === 'like' || body.type === 'dislike')) {
      const counts = toggleReaction(body.id, body.type);
      updateGame(body.id, { likes: counts.likes, dislikes: counts.dislikes });
      return ok(counts);
    }
    return fail('Invalid action');
  } catch (e) {
    return fail(e, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  const game = getDatabase().games.find(g => g.id === id);
  if (!game?.slug) return fail('Not found', 404);
  deleteAsset('game', game.slug);
  return ok();
}
