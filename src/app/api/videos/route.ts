import { NextRequest } from 'next/server';
import {
  getAllVideos, getDatabase, updateVideo, recordVideoView, saveWatchProgress, deleteAsset
} from '@/lib/db';
import { ok, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const genre = new URL(request.url).searchParams.get('genre') || undefined;
    return ok({ videos: getAllVideos(genre), genres: getDatabase().genres });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    const allowed = ['title', 'description', 'genre', 'channelId', 'thumbnail', 'year', 'posterMode', 'posterTime'];
    const clean = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
    const video = updateVideo(id, clean);
    return video ? ok({ video }) : fail('Video not found', 404);
  } catch (e) {
    return fail(e, 500);
  }
}

/** { action: 'view', id } | { action: 'progress', id, position, duration } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === 'view') {
      recordVideoView(body.id);
      return ok();
    }
    if (body.action === 'progress') {
      saveWatchProgress(body.id, Number(body.position) || 0, Number(body.duration) || 0);
      return ok();
    }
    return fail('Unknown action');
  } catch (e) {
    return fail(e, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    const video = getDatabase().videos.find(v => v.id === id);
    if (!video) return fail('Video not found', 404);
    deleteAsset('video', decodeURIComponent(video.filePath.split('/').pop() || ''));
    return ok();
  } catch (e) {
    return fail(e, 500);
  }
}
