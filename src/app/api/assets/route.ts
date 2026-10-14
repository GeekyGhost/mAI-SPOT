import { NextRequest, NextResponse } from 'next/server';
import { getAssetLibrary, deleteAsset } from '@/lib/db';

export async function GET() {
  try {
    const assets = getAssetLibrary();
    return NextResponse.json({ success: true, assets });
  } catch (error) {
    console.error('Failed to get assets:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve asset library' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const filename = searchParams.get('filename');

    if (!type || !filename) {
      return NextResponse.json({ success: false, error: 'Missing type or filename' }, { status: 400 });
    }

    const deleted = deleteAsset(type, filename);
    if (deleted) {
      return NextResponse.json({ success: true, assets: getAssetLibrary() });
    } else {
      return NextResponse.json({ success: false, error: 'Asset not found or cannot be deleted' }, { status: 404 });
    }
  } catch (error) {
    console.error('Failed to delete asset:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete asset' }, { status: 500 });
  }
}
