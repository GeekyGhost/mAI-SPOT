# Changelog

## 0.4.3 — 2026-10-16

- Friend removal flushes the encrypted unfriend notice before closing the connection. Previously an immediate socket destroy could discard the notice and leave the other Spot with a one-sided friendship. Chat history is retained for re-pairing.
- Events from replaced or closed peer connections can no longer remove a newly re-added friend or overwrite current presence. Closing peers are excluded from availability and connection counts.
- The network badge now shows the number of friends online; its tooltip explains the broader peer-link count. Friend-management request failures are displayed instead of becoming unhandled rejections.
- Added isolated tests using real local DHT discovery and encrypted Noise/UDX connections for existing-friend reconnects, offline delivery, removal notifications and fresh one-time invites. The reported two-computer offline mismatch still needs retesting on the target network.

## 0.4.2 — 2026-10-16

- Launcher and updater operation locks now publish complete records atomically and replace child-process metadata without truncating the active lock. Interrupted lock writes no longer leave an empty file that blocks future launches; damaged older locks show specific recovery instructions.
- Added Models & builds: upload original ZIP packages containing STL, 3MF, CAD, modeling and animation source files; browse optional image/GIF reels, play video previews, read README/text instructions and download PDF/other documents. Optional model.json or editable details provide creator, license, printing and assembly notes.
- Model packages use per-friend and expiring sharing permissions for details, previews and downloads. ZIP imports reject unsafe paths and symbolic links and limit archive and preview sizes. Original archives download unchanged, and updates preserve personal packages while app release ZIPs exclude them.
- Fixed the message-view crash caused by returning the browser's scrolling Promise from a React effect. Direct and group chat effects now discard that value; regression tests cover both views.
- Added independent per-friend checkboxes for incoming direct messages, voice calls and video calls, enforced by the receiving node. Existing friendships retain their current access by default. Disabling a call type ends an existing incoming call of that type.
- Added Update.bat, update.sh and npm run update: verified release downloads, app backups, a pre-update data snapshot, rollback, offline ZIP support and a check-only option.
- The updater preserves data and existing content, adds only missing starter files, and prevents concurrent setup/server/update operations. Interrupted updates require recovery before launching.
- Release ZIPs now include a file manifest and an automatically generated SHA-256 sidecar. Packaging uses explicit starter game/artwork lists and excludes update backups and personal apps.

## 0.4.1 — 2026-10-16

**Messaging and call reliability**
- Calls release the camera, microphone and peer connection on failure, hang-up, timeout and page unmount. Granting permission after a call ends cannot restart it.
- Call descriptions and connection candidates are sent in order. Early incoming candidates wait for the matching offer and remote description; negotiation errors are handled rather than left as rejected promises.
- Connecting calls time out, temporary disconnections get a recovery window, and old call events cannot affect a newer call. Device and permission errors include recovery instructions.
- Voice calls play through a single media element, with a manual playback button when the browser blocks autoplay.
- Messages are queued immediately, repeated submissions use the same message ID, and delivery retries run every 15 seconds while a friend remains connected, as well as on reconnect.
- Read receipts arriving before delivery responses remain marked read. Concurrent delivery attempts are coalesced.
- Chat load errors are displayed, switching friends resets the chat view, and reconnecting browser event streams refresh saved messages and state.
- Added isolated regression tests with `npm test`; they do not use personal identities or contact real friends.

## 0.4.0

**A new home page**
- Your Spot is now three columns: you on the left (profile, picture reel, clock, sticky note), your media in the middle (Spot TV, music player, arcade, library shelf), your friends on the right (Friends right now, friends list, friend feed). Two columns on tablets, one on phones.
- **Arrange mode**: move any widget up, down or to another column right on the page, hide it, or bring it back from the tray.
- **Look**: accent colour, five panel styles, six animated backgrounds, corners, spacing, column widths, clock style and sticky-note colour, plus four one-click makeovers. Also in Studio → Layout, with a scaled live preview you can arrange in.
- New widgets: a digital or analog clock and an editable sticky note.
- "Friends right now" shows both who's on air and what they're listening to.

**Spot TV**
- Rebuilt: it no longer starts playing on page load. Big play/pause on the screen and in the control bar, seek, volume, fullscreen, and channel up/down with static. Three styles (Modern, Channel Grid, Vintage Dial).

**Arcade**
- Nine new games: Block Drop, Neon Snake, Brick Breaker, Neon 2048, Comet Dash, Star Invaders, Mine Sweeper, Neon Runner and Memory Match. All work with keyboard and touch.
- High scores: your best score is saved per game and shown on its card and in the player's top bar ("★ NEW BEST").
- An arcade kit (`content\apps\_kit\arcade-kit.js`) for your own games: high scores, sound effects, mute and swipe input.
- Clicking a game's title now launches it too.

## 0.3.0

**Friends & privacy**
- One-time invite links. Each link works once, for one Spot, and then it's spent, so it can't be passed around. Links expire if unused (1, 7 or 30 days) and can be cancelled.
- Invite-only mode (on by default): requests without a valid invite are turned away automatically.
- Per-friend access: choose exactly what each friend can see, item by item: radio stations, playlists, video channels, collections, picture albums, games & apps, books & comics, and your picture reel. Or whole categories, including things you add later.
- Temporary access: share anything for an hour, a day, a week or 30 days; it closes by itself.
- Choose access when a request comes in, when you send one, or ahead of time on the invite. "Share with friends…" on any album, station, channel, collection, game or book.
- Friends can now open your shared games and apps (still sandboxed), read your shared books and comics, and browse your shared picture albums.

**New together-features**
- Radio Dial: an FM dial of every friend who's on air, an AM dial of every friend you can listen along with, with real static between stations.
- Listen along: see what friends are playing and join in, in sync. Pausing is mirrored.
- Watch parties: watch a video from your library with friends in sync, streamed from your PC, with shared play/pause/seek and chat.

**Pictures**
- New Pictures section: albums are folders in `content\pictures`. Drag-and-drop uploads, previews, slideshow, lightbox, move between albums, use any picture as your profile picture or banner, add it to your reel, or post it to your feed.

**Profile**
- Profile editor with a crop tool for your picture and a banner, name, handle, status, mood, bio and picture reel, with a live "how friends see you" preview.
- New first-run welcome setup.

**Polish**
- Cleaner navigation (Friends badge for requests and messages, profile menu, phone "More" menu), new Spot home with a profile header and "Friends right now", consistent typography (bundled fonts, works offline), accent colours now render everywhere.
- Single-click a song to play it.

**Distribution**
- `Launch.bat` / `launch.sh` use a private copy of Node.js in `runtime\` if needed, and keep npm's cache inside the folder.
- `npm run release` makes a clean zip with no personal data.
- A fresh install starts with an empty library and the welcome setup.
