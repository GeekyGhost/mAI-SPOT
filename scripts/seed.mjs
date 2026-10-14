import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const contentDir = path.join(rootDir, 'content');
const audioDir = path.join(contentDir, 'audio');
const videoDir = path.join(contentDir, 'video');
const thumbsDir = path.join(contentDir, 'thumbnails');
const dataDir = path.join(rootDir, 'data');
const dbFile = path.join(dataDir, 'db.json');

// Ensure directories exist
for (const dir of [contentDir, audioDir, videoDir, thumbsDir, dataDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

console.log('Generating expanded media catalog across genres...');

// Helper to create audio via FFmpeg
const generateAudio = (filename, filterFormula, duration = 30) => {
  const filePath = path.join(audioDir, filename);
  if (!fs.existsSync(filePath)) {
    try {
      console.log(`Synthesizing audio: ${filename}...`);
      execSync(
        `ffmpeg -y -f lavfi -i "aevalsrc=${filterFormula}:d=${duration}:s=44100" -c:a libmp3lame -b:a 192k "${filePath}"`,
        { stdio: 'ignore' }
      );
    } catch (err) {
      console.warn(`Failed to synthesize ${filename}:`, err.message);
    }
  }
};

// Helper to create video via FFmpeg
const generateVideo = (filename, sourceFilter, audioFreq, duration = 15) => {
  const filePath = path.join(videoDir, filename);
  if (!fs.existsSync(filePath)) {
    try {
      console.log(`Generating video preview: ${filename}...`);
      execSync(
        `ffmpeg -y -f lavfi -i "${sourceFilter}=size=1280x720:rate=30" -f lavfi -i "sine=frequency=${audioFreq}:duration=${duration}" -t ${duration} -pix_fmt yuv420p -c:v libx264 -preset ultrafast -c:a aac -b:a 128k "${filePath}"`,
        { stdio: 'ignore' }
      );
    } catch (err) {
      console.warn(`Failed to generate video ${filename}:`, err.message);
    }
  }
};

// 1. Synthwave Tracks
generateAudio('neon_horizon.mp3', 'sin(220*2*PI*t)*0.2*sin(8*2*PI*t)+sin(440*2*PI*t)*0.15*cos(4*2*PI*t)+sin(110*2*PI*t)*0.25');
generateAudio('turbo_overdrive.mp3', 'sin(293.66*2*PI*t)*0.25+sin(587.33*2*PI*t)*0.2*sin(12*2*PI*t)+sin(146.83*2*PI*t)*0.3');
generateAudio('midnight_cruiser.mp3', 'sin(174.61*2*PI*t)*0.25+sin(349.23*2*PI*t)*0.15*cos(6*2*PI*t)+sin(87.31*2*PI*t)*0.35');

// 2. Lo-Fi Tracks
generateAudio('midnight_lofi.mp3', 'sin(130.81*2*PI*t)*0.3+sin(164.81*2*PI*t)*0.25+sin(196*2*PI*t)*0.2');
generateAudio('rainy_cafe.mp3', 'sin(146.83*2*PI*t)*0.25+sin(174.61*2*PI*t)*0.2+sin(220*2*PI*t)*0.18');
generateAudio('study_session.mp3', 'sin(110*2*PI*t)*0.3+sin(138.59*2*PI*t)*0.22+sin(164.81*2*PI*t)*0.2');

// 3. Sci-Fi Ambient Tracks
generateAudio('cosmic_odyssey.mp3', 'sin(55*2*PI*t)*0.35+sin(110*2*PI*t)*0.2*sin(0.2*2*PI*t)+sin(165*2*PI*t)*0.15');
generateAudio('andromeda_signal.mp3', 'sin(65.41*2*PI*t)*0.3+sin(130.81*2*PI*t)*0.2+sin(196*2*PI*t)*0.15*sin(0.3*2*PI*t)');
generateAudio('orbital_drift.mp3', 'sin(73.42*2*PI*t)*0.35+sin(146.83*2*PI*t)*0.18+sin(220*2*PI*t)*0.12');

// 4. Electronic / Club Tracks
generateAudio('cyber_pulse.mp3', 'sin(330*2*PI*t)*0.2*sin(16*2*PI*t)+sin(165*2*PI*t)*0.35');
generateAudio('glitch_dimension.mp3', 'sin(392*2*PI*t)*0.25*cos(14*2*PI*t)+sin(196*2*PI*t)*0.3');

// 5. Rock / Alternative Tracks
generateAudio('overdrive_anthem.mp3', 'sin(164.81*2*PI*t)*0.35+sin(246.94*2*PI*t)*0.3+sin(329.63*2*PI*t)*0.25');
generateAudio('desert_highway.mp3', 'sin(146.83*2*PI*t)*0.3+sin(220*2*PI*t)*0.25+sin(293.66*2*PI*t)*0.2');

// Videos across genres
generateVideo('cyber_neon_highway.mp4', 'testsrc', 220, 15);
generateVideo('deep_space_station.mp4', 'smptebars', 110, 15);
generateVideo('coffee_shop_rain.mp4', 'rgbtestsrc', 164.81, 15);
generateVideo('matrix_grid.mp4', 'testsrc', 293.66, 15);
generateVideo('nebula_drift.mp4', 'smptebars', 73.42, 15);
generateVideo('overdrive_stage.mp4', 'rgbtestsrc', 164.81, 15);

// Create SVG Thumbnails
const createSvgThumb = (filePath, title, color1, color2, iconType = 'play') => {
  if (!fs.existsSync(filePath)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#grad)" />
      <circle cx="320" cy="150" r="50" fill="rgba(0,0,0,0.3)" stroke="white" stroke-width="3" />
      <polygon points="310,130 340,150 310,170" fill="#ffffff" />
      <text x="320" y="250" font-family="Arial, sans-serif" font-weight="900" font-size="26" fill="#ffffff" text-anchor="middle" letter-spacing="2">${title}</text>
      <text x="320" y="280" font-family="Arial, sans-serif" font-weight="bold" font-size="13" fill="rgba(255,255,255,0.7)" text-anchor="middle" letter-spacing="1">AI BROADCAST NETWORK • 4K HDR</text>
    </svg>`;
    fs.writeFileSync(filePath, svg);
  }
};

createSvgThumb(path.join(thumbsDir, 'thumb_neon.svg'), 'NEON HORIZON', '#ff007f', '#00f0ff');
createSvgThumb(path.join(thumbsDir, 'thumb_turbo.svg'), 'TURBO OVERDRIVE', '#ff4500', '#ff007f');
createSvgThumb(path.join(thumbsDir, 'thumb_midnight.svg'), 'MIDNIGHT CRUISER', '#7928ca', '#00dfd8');

createSvgThumb(path.join(thumbsDir, 'thumb_lofi.svg'), 'MIDNIGHT CHILL', '#2b1b17', '#8b5a2b');
createSvgThumb(path.join(thumbsDir, 'thumb_cafe.svg'), 'RAINY CAFE', '#3d261d', '#9c6644');
createSvgThumb(path.join(thumbsDir, 'thumb_study.svg'), 'STUDY SESSION', '#1f1b24', '#5e503f');

createSvgThumb(path.join(thumbsDir, 'thumb_space.svg'), 'COSMIC ODYSSEY', '#0b0033', '#3700b3');
createSvgThumb(path.join(thumbsDir, 'thumb_signal.svg'), 'ANDROMEDA SIGNAL', '#03045e', '#0077b6');
createSvgThumb(path.join(thumbsDir, 'thumb_drift.svg'), 'ORBITAL DRIFT', '#140152', '#22007c');

createSvgThumb(path.join(thumbsDir, 'thumb_pulse.svg'), 'CYBER PULSE', '#00f5d4', '#7b2cbf');
createSvgThumb(path.join(thumbsDir, 'thumb_glitch.svg'), 'GLITCH DIMENSION', '#f72585', '#4361ee');

createSvgThumb(path.join(thumbsDir, 'thumb_rock.svg'), 'OVERDRIVE ANTHEM', '#9e0059', '#ff0054');
createSvgThumb(path.join(thumbsDir, 'thumb_highway.svg'), 'DESERT HIGHWAY', '#d00000', '#ffba08');

// Build Rich Database Schema
const initialDb = {
  users: [
    {
      id: "user_neon",
      username: "neon_rider",
      displayName: "Neon Rider",
      avatar: "/api/media/thumbnails/thumb_neon.svg",
      bio: "80s Outrun, Darksynth and Retrowave producer."
    },
    {
      id: "user_lofi",
      username: "chill_beats",
      displayName: "Lo-Fi Coffee Club",
      avatar: "/api/media/thumbnails/thumb_lofi.svg",
      bio: "Relaxing beats to study, code and sleep to."
    },
    {
      id: "user_cosmic",
      username: "astral_labs",
      displayName: "Astral Frequency",
      avatar: "/api/media/thumbnails/thumb_space.svg",
      bio: "Ambient, cinematic sci-fi soundscapes."
    },
    {
      id: "user_electro",
      username: "cyber_beats",
      displayName: "Pulse Club 2099",
      avatar: "/api/media/thumbnails/thumb_pulse.svg",
      bio: "Underground dark club and techno."
    },
    {
      id: "user_default",
      username: "studio_creator",
      displayName: "My Creator Studio",
      avatar: "/api/media/thumbnails/thumb_highway.svg",
      bio: "Personal broadcaster channel."
    }
  ],
  channels: [
    {
      id: "chan_synth",
      userId: "user_neon",
      channelName: "Neon Pulse FM",
      handle: "@neonpulse",
      avatar: "/api/media/thumbnails/thumb_neon.svg",
      genre: "Synthwave",
      subscribers: 28450,
      description: "24/7 Retrowave & Cyberpunk streaming station."
    },
    {
      id: "chan_lofi",
      userId: "user_lofi",
      channelName: "Lo-Fi Study Lounge",
      handle: "@lofibits",
      avatar: "/api/media/thumbnails/thumb_lofi.svg",
      genre: "Lo-Fi",
      subscribers: 54800,
      description: "Cozy lo-fi beats, rain sounds, and chill chords."
    },
    {
      id: "chan_cosmic",
      userId: "user_cosmic",
      channelName: "Deep Space Station",
      handle: "@deepspace",
      avatar: "/api/media/thumbnails/thumb_space.svg",
      genre: "Sci-Fi",
      subscribers: 18900,
      description: "Interstellar drones, ambient textures, and sci-fi series."
    },
    {
      id: "chan_electro",
      userId: "user_electro",
      channelName: "Pulse Rave 2099",
      handle: "@pulserave",
      avatar: "/api/media/thumbnails/thumb_pulse.svg",
      genre: "Electronic",
      subscribers: 14200,
      description: "High-octane electronic and dark synth."
    },
    {
      id: "chan_my_station",
      userId: "user_default",
      channelName: "My Personal Radio",
      handle: "@mystation",
      avatar: "/api/media/thumbnails/thumb_highway.svg",
      genre: "Rock",
      subscribers: 42,
      description: "My personal uploads and customized radio broadcast."
    }
  ],
  tracks: [
    // Synthwave Roll
    {
      id: "track_syn_1",
      title: "Neon Horizon",
      artist: "Neon Rider",
      channelId: "chan_synth",
      genre: "Synthwave",
      duration: 30,
      filePath: "/api/media/audio/neon_horizon.mp3",
      coverArt: "/api/media/thumbnails/thumb_neon.svg",
      kbps: 192,
      khz: 44.1,
      plays: 14200,
      createdAt: new Date().toISOString()
    },
    {
      id: "track_syn_2",
      title: "Turbo Overdrive",
      artist: "Neon Rider",
      channelId: "chan_synth",
      genre: "Synthwave",
      duration: 30,
      filePath: "/api/media/audio/turbo_overdrive.mp3",
      coverArt: "/api/media/thumbnails/thumb_turbo.svg",
      kbps: 320,
      khz: 44.1,
      plays: 9840,
      createdAt: new Date().toISOString()
    },
    {
      id: "track_syn_3",
      title: "Midnight Cruiser",
      artist: "Vector Prime",
      channelId: "chan_synth",
      genre: "Synthwave",
      duration: 30,
      filePath: "/api/media/audio/midnight_cruiser.mp3",
      coverArt: "/api/media/thumbnails/thumb_midnight.svg",
      kbps: 192,
      khz: 44.1,
      plays: 7650,
      createdAt: new Date().toISOString()
    },

    // Lo-Fi Roll
    {
      id: "track_lofi_1",
      title: "Midnight Lo-Fi Chill",
      artist: "Lo-Fi Coffee Club",
      channelId: "chan_lofi",
      genre: "Lo-Fi",
      duration: 30,
      filePath: "/api/media/audio/midnight_lofi.mp3",
      coverArt: "/api/media/thumbnails/thumb_lofi.svg",
      kbps: 192,
      khz: 44.1,
      plays: 32890,
      createdAt: new Date().toISOString()
    },
    {
      id: "track_lofi_2",
      title: "Rainy Window Coffee",
      artist: "Cozy Bedroom Beats",
      channelId: "chan_lofi",
      genre: "Lo-Fi",
      duration: 30,
      filePath: "/api/media/audio/rainy_cafe.mp3",
      coverArt: "/api/media/thumbnails/thumb_cafe.svg",
      kbps: 192,
      khz: 44.1,
      plays: 21400,
      createdAt: new Date().toISOString()
    },
    {
      id: "track_lofi_3",
      title: "Late Night Study Session",
      artist: "Lo-Fi Coffee Club",
      channelId: "chan_lofi",
      genre: "Lo-Fi",
      duration: 30,
      filePath: "/api/media/audio/study_session.mp3",
      coverArt: "/api/media/thumbnails/thumb_study.svg",
      kbps: 192,
      khz: 44.1,
      plays: 18720,
      createdAt: new Date().toISOString()
    },

    // Sci-Fi Ambient Roll
    {
      id: "track_sci_1",
      title: "Cosmic Odyssey",
      artist: "Astral Frequency",
      channelId: "chan_cosmic",
      genre: "Sci-Fi",
      duration: 30,
      filePath: "/api/media/audio/cosmic_odyssey.mp3",
      coverArt: "/api/media/thumbnails/thumb_space.svg",
      kbps: 320,
      khz: 44.1,
      plays: 8740,
      createdAt: new Date().toISOString()
    },
    {
      id: "track_sci_2",
      title: "Andromeda Transmission",
      artist: "Astral Frequency",
      channelId: "chan_cosmic",
      genre: "Sci-Fi",
      duration: 30,
      filePath: "/api/media/audio/andromeda_signal.mp3",
      coverArt: "/api/media/thumbnails/thumb_signal.svg",
      kbps: 192,
      khz: 44.1,
      plays: 6210,
      createdAt: new Date().toISOString()
    },
    {
      id: "track_sci_3",
      title: "Orbital Drift",
      artist: "Deep Void",
      channelId: "chan_cosmic",
      genre: "Sci-Fi",
      duration: 30,
      filePath: "/api/media/audio/orbital_drift.mp3",
      coverArt: "/api/media/thumbnails/thumb_drift.svg",
      kbps: 192,
      khz: 44.1,
      plays: 5120,
      createdAt: new Date().toISOString()
    },

    // Electronic Roll
    {
      id: "track_el_1",
      title: "Cyber Pulse 140",
      artist: "Pulse Rave 2099",
      channelId: "chan_electro",
      genre: "Electronic",
      duration: 30,
      filePath: "/api/media/audio/cyber_pulse.mp3",
      coverArt: "/api/media/thumbnails/thumb_pulse.svg",
      kbps: 320,
      khz: 44.1,
      plays: 12450,
      createdAt: new Date().toISOString()
    },
    {
      id: "track_el_2",
      title: "Glitch Dimension",
      artist: "Hexadec",
      channelId: "chan_electro",
      genre: "Electronic",
      duration: 30,
      filePath: "/api/media/audio/glitch_dimension.mp3",
      coverArt: "/api/media/thumbnails/thumb_glitch.svg",
      kbps: 192,
      khz: 44.1,
      plays: 9110,
      createdAt: new Date().toISOString()
    },

    // Rock Roll
    {
      id: "track_rk_1",
      title: "Overdrive Anthem",
      artist: "Circuit Breakers",
      channelId: "chan_my_station",
      genre: "Rock",
      duration: 30,
      filePath: "/api/media/audio/overdrive_anthem.mp3",
      coverArt: "/api/media/thumbnails/thumb_rock.svg",
      kbps: 320,
      khz: 44.1,
      plays: 11050,
      createdAt: new Date().toISOString()
    },
    {
      id: "track_rk_2",
      title: "Desert Highway Distortion",
      artist: "Dust & Neon",
      channelId: "chan_my_station",
      genre: "Rock",
      duration: 30,
      filePath: "/api/media/audio/desert_highway.mp3",
      coverArt: "/api/media/thumbnails/thumb_highway.svg",
      kbps: 192,
      khz: 44.1,
      plays: 7420,
      createdAt: new Date().toISOString()
    }
  ],
  videos: [
    {
      id: "vid_syn_1",
      title: "Cyber Neon Highway - 24/7 Outrun Broadcast",
      channelId: "chan_synth",
      channelName: "Neon Pulse FM",
      genre: "Synthwave",
      duration: 15,
      filePath: "/api/media/video/cyber_neon_highway.mp4",
      thumbnail: "/api/media/thumbnails/thumb_neon.svg",
      views: 18940,
      createdAt: new Date().toISOString(),
      description: "Cruising down the virtual grid at 180 MPH with neon synths and chrome horizons."
    },
    {
      id: "vid_syn_2",
      title: "Matrix Grid Live - Cyberpunk Special",
      channelId: "chan_synth",
      channelName: "Neon Pulse FM",
      genre: "Synthwave",
      duration: 15,
      filePath: "/api/media/video/matrix_grid.mp4",
      thumbnail: "/api/media/thumbnails/thumb_turbo.svg",
      views: 14210,
      createdAt: new Date().toISOString(),
      description: "Live visualizer broadcast rendered in ultra-widescreen cyber aesthetics."
    },
    {
      id: "vid_sci_1",
      title: "Deep Space Station 9 - Episode 1: Orbital Drift",
      channelId: "chan_cosmic",
      channelName: "Deep Space Station",
      genre: "Sci-Fi",
      duration: 15,
      filePath: "/api/media/video/deep_space_station.mp4",
      thumbnail: "/api/media/thumbnails/thumb_space.svg",
      views: 9510,
      createdAt: new Date().toISOString(),
      description: "Documentary voyage through the outer rings of the nebula with crew commentary."
    },
    {
      id: "vid_sci_2",
      title: "Nebula Drift - Sci-Fi Feature Film Special",
      channelId: "chan_cosmic",
      channelName: "Deep Space Station",
      genre: "Sci-Fi",
      duration: 15,
      filePath: "/api/media/video/nebula_drift.mp4",
      thumbnail: "/api/media/thumbnails/thumb_drift.svg",
      views: 11200,
      createdAt: new Date().toISOString(),
      description: "A 40-minute visual journey into the heart of an unknown star cluster."
    },
    {
      id: "vid_lofi_1",
      title: "Coffee Shop Rain Session - Study With Me Live",
      channelId: "chan_lofi",
      channelName: "Lo-Fi Study Lounge",
      genre: "Lo-Fi",
      duration: 15,
      filePath: "/api/media/video/coffee_shop_rain.mp4",
      thumbnail: "/api/media/thumbnails/thumb_lofi.svg",
      views: 42080,
      createdAt: new Date().toISOString(),
      description: "Warm rain dripping against the window pane with relaxing jazz chords."
    },
    {
      id: "vid_rk_1",
      title: "Live in Tokyo - Overdrive Stage Show",
      channelId: "chan_my_station",
      channelName: "Circuit Breakers",
      genre: "Rock",
      duration: 15,
      filePath: "/api/media/video/overdrive_stage.mp4",
      thumbnail: "/api/media/thumbnails/thumb_rock.svg",
      views: 8930,
      createdAt: new Date().toISOString(),
      description: "High energy guitar solos and visual projections recorded live."
    }
  ],
  genres: [
    "Synthwave",
    "Lo-Fi",
    "Sci-Fi",
    "Electronic",
    "Rock"
  ]
};

fs.writeFileSync(dbFile, JSON.stringify(initialDb, null, 2));
console.log(`Updated database initialized with ${initialDb.tracks.length} tracks and ${initialDb.videos.length} videos!`);
