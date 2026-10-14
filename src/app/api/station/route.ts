import { NextRequest, NextResponse } from 'next/server';
import {
  getStationProfile,
  updateStationProfile,
  getStationTheme,
  updateStationTheme,
  getLayoutConfig,
  updateLayoutConfig
} from '@/lib/db';

export async function GET() {
  try {
    const profile = getStationProfile();
    const theme = getStationTheme();
    const layout = getLayoutConfig();
    return NextResponse.json({ success: true, profile, theme, layout });
  } catch (error) {
    console.error('Failed to get station:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve station configuration' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    let updatedProfile = null;
    let updatedTheme = null;
    let updatedLayout = null;

    if (body.profile) {
      updatedProfile = updateStationProfile(body.profile);
    }
    if (body.theme) {
      updatedTheme = updateStationTheme(body.theme);
    }
    if (body.layout) {
      updatedLayout = updateLayoutConfig(body.layout);
    }

    return NextResponse.json({
      success: true,
      profile: updatedProfile || getStationProfile(),
      theme: updatedTheme || getStationTheme(),
      layout: updatedLayout || getLayoutConfig()
    });
  } catch (error) {
    console.error('Failed to update station:', error);
    return NextResponse.json({ success: false, error: 'Failed to update station' }, { status: 500 });
  }
}
