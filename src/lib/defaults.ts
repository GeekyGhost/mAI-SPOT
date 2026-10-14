// Default seed data used when db.json is missing sections.
import type { StationProfile, StationTheme, LayoutConfig, Game, SectionKey, SpotColumn, SpotLook } from './types';

export const defaultProfile: StationProfile = {
  id: 'station_owner',
  stationName: 'My Spot',
  displayName: '',
  handle: '',
  stationKey: '',
  avatar: '',
  banner: '',
  bio: '',
  moodBlurb: '',
  pictureReel: [],
  topFriends: [],
  sentimentMode: 'show_all',
  soundEnabled: true,
  soundTheme: 'icq_classic',
  soundVolume: 0.5,
  isOnline: true,
  statusMode: 'online',
  setupDone: false
};

export const defaultTheme: StationTheme = {
  primaryColor: '#2ee8f7',
  surfaceColor: 'rgba(13, 22, 26, 0.9)',
  accentGlow: 'rgba(46, 232, 247, 0.35)',
  backgroundImage: 'radial-gradient(circle at 50% 10%, #0f2a33 0%, #030608 70%)',
  backgroundTiling: 'cover',
  fontFamily: 'clean',
  borderStyle: 'modern',
  customCss: ''
};

export const ALL_SECTIONS: SectionKey[] = ['profile', 'pictures', 'clock', 'note', 'video', 'music', 'arcade', 'library', 'thoughts', 'friends', 'feed'];

export const DEFAULT_COLUMNS: Record<SectionKey, SpotColumn> = {
  profile: 'left', pictures: 'left', clock: 'left', note: 'left',
  video: 'center', music: 'center', arcade: 'center', library: 'center',
  thoughts: 'right', friends: 'right', feed: 'right'
};

export const DEFAULT_LOOK: SpotLook = { panel: 'glass', radius: 'soft', density: 'cozy', background: 'stars', widths: 'balanced' };

export const defaultLayout: LayoutConfig = {
  musicPlayerStyle: 'pulseamp_deck',
  videoPlayerStyle: 'chromavision_theater',
  enabledSections: ['profile', 'pictures', 'clock', 'note', 'video', 'music', 'arcade', 'library', 'thoughts', 'friends', 'feed'],
  sectionOrder: [...ALL_SECTIONS],
  activeMusicGenres: [],
  activeVideoGenres: [],
  visualizerMode: 'spectrum',
  feedDisplayMode: 'stream',
  columns: { ...DEFAULT_COLUMNS },
  look: { ...DEFAULT_LOOK },
  note: { text: 'Welcome to my Spot ✨\nPull up a chair, put a record on.', color: '#ffcf33' },
  clock: { style: 'digital', h24: false }
};

export const defaultGames: Game[] = [
  {
    id: 'game_cyber_asteroids',
    title: 'Cyber Asteroids 2099',
    description: 'Classic vector-style asteroid blaster running in a sandboxed HTML5 Canvas. Destroy space rocks, earn high scores!',
    thumbnail: '/api/media/thumbnails/thumb_space.svg',
    kind: 'game',
    slug: 'asteroids',
    entryPoint: '/api/apps/run/asteroids/index.html',
    controlsHelp: 'Arrow keys: Rotate & Thrust • Space: Fire Lasers • P: Pause',
    genre: 'Arcade',
    plays: 0,
    likes: 0,
    dislikes: 0,
    createdAt: new Date().toISOString()
  },
  {
    id: 'game_neon_pong',
    title: 'Neon Paddle Showdown',
    description: 'High-speed synthwave table tennis against an aggressive AI with glowing trail effects.',
    thumbnail: '/api/media/thumbnails/thumb_turbo.svg',
    kind: 'game',
    slug: 'pong',
    entryPoint: '/api/apps/run/pong/index.html',
    controlsHelp: 'W / S or Up / Down: Move Paddle • Space: Serve Ball',
    genre: 'Sports',
    plays: 0,
    likes: 0,
    dislikes: 0,
    createdAt: new Date().toISOString()
  }
];
