import { NextRequest, NextResponse } from 'next/server';
import { getReactions, toggleReaction } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('targetId') || 'station';
    const data = getReactions(targetId);
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('Failed to get reactions:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve reactions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetId = 'station', type = 'like', voterPubkey = 'my_client' } = body;

    if (type !== 'like' && type !== 'dislike') {
      return NextResponse.json({ success: false, error: 'Type must be like or dislike' }, { status: 400 });
    }

    const result = toggleReaction(targetId, type, voterPubkey);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to toggle reaction:', error);
    return NextResponse.json({ success: false, error: 'Failed to record reaction' }, { status: 500 });
  }
}
