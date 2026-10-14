import { NextRequest } from 'next/server';
import { getAllChannels, createChannel, updateChannel, deleteChannel, getDatabase } from '@/lib/db';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok({ channels: getAllChannels(), users: getDatabase().users });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { channelName, handle, description, genre, userId, avatar } = await request.json();
    if (!channelName) return fail('Channel name is required');
    const h = (handle || channelName).replace(/\s+/g, '').toLowerCase();
    const channel = createChannel({
      userId: userId || 'user_default',
      channelName,
      handle: h.startsWith('@') ? h : `@${h}`,
      avatar: avatar || '/api/media/thumbnails/avatar_user.svg',
      genre: genre || 'Mixed',
      description: description || ''
    });
    return ok({ channel });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    const allowed = ['channelName', 'handle', 'description', 'genre', 'avatar', 'banner'];
    const clean = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
    const channel = updateChannel(id, clean);
    return channel ? ok({ channel }) : fail('Channel not found', 404);
  } catch (e) {
    return fail(e, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id') || '';
  return deleteChannel(id) ? ok() : fail('That channel cannot be deleted');
}
