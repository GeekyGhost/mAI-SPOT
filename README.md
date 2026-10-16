# 📻 mAI Spot

<img width="1265" height="670" alt="image" src="https://github.com/user-attachments/assets/42cae29d-9155-4546-8b4a-90463f35dc64" />



> **[📥 Download Standalone Release (.zip)](https://github.com/GeekyGhost/mAI-SPOT/releases/latest)** — Unzip and run the launcher; it downloads a private runtime if needed and sets up the app on first launch.

Your own personal broadcast station and social page, in the spirit of MySpace and the early-2000s web. It runs on your own PC and everything stays in this folder.

- **Radio**: your music by genre, artist, album and playlist. Put any station **on air** and it streams like a real radio station.
- **Cinema**: Netflix-style browsing with channels, genres and collections, plus resume-watching.
- **Arcade & Apps**: install HTML5, Canvas and WASM games (sorted by genre) and apps (sorted by category). Each one runs sandboxed.
- **Pictures**: photo albums (each album is a folder), slideshows, and a lightbox.
- **Library**: a built-in e-reader for EPUB, PDF, TXT and Markdown (poems welcome), and comics in CBZ/CBR.
- **Models & builds**: share ZIP packages of STL, 3MF, CAD, Blender and animation files, with an optional image reel, GIF/video previews and printing or assembly instructions.
- **Your Spot**: a three-column home page (you on the left; TV, music, arcade and library in the middle; friends and the feed on the right) that you can rearrange in place, restyle in one click, or redo with a preset. Plus themes, player skins and your own CSS.
- **Friends, for real**: one-time invite links, and you choose *exactly* what each friend can see, item by item, even just for a day. Presence, DMs, group chats, a Friend Feed, voice/video calls.
- **Together**: the **Radio Dial** (channel-surf your friends' live stations), **Listen along** (hear what a friend is playing, in sync) and **Watch parties** (watch a video together, in sync, with chat).

---

## ⚡ Quick start

**Windows:** double-click **`Launch.bat`**. **macOS / Linux:** run **`./launch.sh`**.

1. It uses Node.js 18.18+ if your computer has it. If not, it downloads a private copy into `runtime\` (one time, about 30 MB). Nothing is installed system-wide.
2. It installs the app's packages into `node_modules\` and creates the content folders.
3. It builds the app the first time, and again whenever the code changes (about a minute).
4. It starts your Spot at **http://localhost:8088** and opens the browser. The first time, a short welcome walks you through your name, picture and look.

For hot reload while editing code, run `Launch.bat dev`. Production and dev builds use separate folders (`.next` and `.next-dev`).

Set `PORT=8090` to use a different port. Set `MAISPOT_LAN=0` to make the node listen on this PC only. Set `MAISPOT_REMOTE_ONLY=1` to treat all connections as remote listeners (useful for dedicated public broadcast nodes). If hosting behind a reverse proxy (e.g. Nginx, Caddy), set `MAISPOT_TRUST_PROXY=1` to trust the client's `X-Forwarded-For` address.

**Giving mAI Spot to someone else:** run `npm run release` (or `node scripts\release.mjs`). It writes `release\mAI-Spot-<version>.zip` with the app and starter games only: never your `data\` folder, your identity, or your music/videos/pictures/books. They unzip it, run the launcher, and get a brand-new Spot of their own.

### Updating your Spot

Once you have a release that includes the updater, close the Spot and double-click **Update.bat** on Windows, or run **./update.sh** on macOS/Linux. Then launch the Spot normally. It checks the official GitHub release, downloads and verifies the ZIP, backs up the application and takes a pre-update snapshot of `data`, then updates application files. The next launch updates dependencies and rebuilds if needed.

Your identity, friends, messages, settings, media and installed apps stay in place. Existing files under `content` are never overwritten; missing starter files may be added. Changes you made directly to application source files are kept in the app backup. The updater is for downloaded release folders; Git checkouts use Git instead.

| Command | Windows | macOS / Linux |
| --- | --- | --- |
| Check without updating; works while the Spot runs | `Update.bat --check` | `./update.sh --check` |
| Install the latest release; close the Spot first | `Update.bat` | `./update.sh` |
| Restore the previous application version | `Update.bat --rollback` | `./update.sh --rollback` |
| Install a previously downloaded ZIP | `Update.bat --file "path\mAI-Spot-<version>.zip"` | `./update.sh --file /path/mAI-Spot-<version>.zip` |

For an offline update, download the matching `.zip.sha256` file beside the ZIP; dependency changes may still require internet access on the next launch. Rollback restores application files and keeps current data/content, so new messages are retained. The pre-update data snapshot is available separately in `.updates/backups` if a data migration needs manual recovery. Keep that folder private because snapshots include your identity. Backups and staging files are retained until you remove them; do not remove them while an update is pending.

If your installed release has no updater (v0.4.1 and earlier), make one final manual update: close it, back up its folder, extract a newer release into a separate folder and copy your `data` and `content` folders into it before launching. Subsequent releases can use the updater. For a custom port, keep `PORT` set when updating so the running-server check uses the right port.

If an older launcher left an **incomplete or damaged operation lock**, close all Spot and updater windows, then remove only `.updates/operation.json` and retry. Keep the rest of `.updates`: it contains backups and recovery records. A valid lock reporting a running operation should be left in place. New launchers publish complete lock records and replace them atomically to avoid this interrupted-write problem.

---

## Models & builds

Open **Models → Add model ZIP** (on a phone: **More → Models**). Choose a ZIP containing at least one model, CAD or animation file. STL, 3MF, OBJ, BLEND, FBX, GLTF/GLB, STEP, IGES, USD, SCAD and many other source formats are recognized. Textures, materials and other supporting files stay together in the original ZIP. A folder containing your project inside the ZIP works too.

Only the model files are required. For a more useful package, include any of the following:

```text
Robot.zip
  models/
    body.3mf
    arm.stl
  images/                  # optional: photos or renders shown as a reel
    01-finished.png
    02-parts.jpg
    turntable.gif
  previews/                # optional: MP4 or WebM animation/assembly preview
    assembly.mp4
  README.md                # optional: text instructions displayed in the app
  assembly.pdf             # optional: downloadable instructions
  model.json               # optional: details filled in automatically
```

Images and GIFs appear in a browsable reel with an optional slideshow. Videos play on demand; MP4 and WebM are the most portable choices, while MOV/M4V playback depends on codecs. Explicit image, preview, render or video folders take priority over other artwork, and texture/material folders are excluded from the reel. README, TXT and Markdown files display as plain text. PDF, RTF, DOCX and ODT instructions are available to download. Model files are downloaded for use in your own modeling, animation or slicing software.

You can enter the title, description, creator and license during upload. **View details → Edit details** also lets you add printing and assembly notes later. Alternatively, include a `model.json`:

```json
{
  "title": "Articulated Robot",
  "description": "A small poseable desk robot.",
  "author": "Your name",
  "license": "Your usage and attribution terms",
  "printSettings": "PLA, 0.2 mm layers, 20% infill. Supports on arms only.",
  "assembly": "Fit the arms with two M3 bolts. See assembly.pdf."
}
```

Every field is optional. Nonempty upload fields override `model.json`. Editing details changes the listing; downloads always contain the original, unchanged ZIP.

Choose **Share** on a package to select friends and an optional expiry. The **Models** category in friendship permissions can also share all model packages, including future uploads. A friend opens your Spot’s **Models** tab to see previews, read instructions and download. Both Spots need a release that supports model sharing, and the owner needs to be online. Existing friends are not automatically granted this new category; sharing settings are enforced on each preview, instruction and download request.

ZIPs are limited to 256 MB, 5,000 entries and 2 GB of declared expanded data. Up to 40 previews and 20 documents are shown. Individual preview limits are 20 MB per image, 64 MB per video, 32 MB per PDF, 1 MB per text file and 20 MB per other document, with at most 256 MB of extracted previews/documents. Larger optional files remain in the downloadable ZIP. Packages live under `content/models`; the updater preserves them, and standalone app release ZIPs exclude your packages.

## 🏠 Your Spot (home page)

- **Three columns.** Left: your profile card, picture reel, a clock and a sticky note. Middle: **Spot TV**, your music player, the arcade and your library shelf. Right: *Friends right now*, your friends list and the friend feed. On a tablet it becomes two columns, on a phone one.
- **Spot TV** never starts by itself. Click the screen or ▶ to play, again to pause. ⏮ ⏭ flip channels (with a burst of static), and it keeps playing only if you were watching. Three styles: *Modern TV*, *Channel Grid* (genre chips and a wall of channels) and *Vintage Dial TV* (wood cabinet and a rotary knob).
- **Arrange** (top right): every widget gets arrows to move it up, down or into another column, and an eye to hide it. Hidden widgets wait in a tray so you can add them back. Changes save as you go.
- **Look** (top right): accent colour, panel style (glass, solid, outline, neon, retro), animated background (stars, synthwave grid, aurora, CRT scanlines, bubbles, or plain), corners, spacing, column widths, clock style and sticky-note colour, plus one-click makeovers (*Classic three*, *Theater*, *Social butterfly*, *Arcade cabinet*).
- **Sticky note:** click it to write something for whoever drops by.
- **Studio → Layout** has the same controls with a live, scaled preview of the whole page (desktop or phone), and you can arrange directly in the preview.

## 🎵 Radio

- **Browse** by Stations, Genres, Artists, Albums, Playlists or Songs. The search box covers all of them.
- **Player looks:** *PulseAmp Deck* (LCD hardware deck), *Turntable* (spinning record and tonearm) or *Compact*.
- **Visualizers:** *Spectrum*, *Oscilloscope*, *Radial* (spins with the cover art) and *Horizon* (a synthwave sun that pulses with the bass).
- **Player features:** a 10-band EQ with presets, a queue (play next / add to queue), shuffle and repeat. Media keys work too.
- **Playlists:** create, rename, add a cover, reorder and remove songs. Add songs from any song's ⋮ menu.
- **Song details:** edit title, artist, album, genre, year and cover from the ⋮ menu.
- Music keeps playing while you move around the app. The bar at the bottom follows you, and the radio pauses itself when a video starts.

### Going live

Every **station** draws from the whole library, a genre, an artist, an album or a playlist. Press **Go Live** and it's on air:

- Only one station broadcasts at a time.
- The running order is fixed when it goes live. From then on, what's playing is calculated from the clock, so every listener hears the same song at the same moment.
- It keeps "playing" while the node runs, even with no browser open. After a restart it picks up where the clock says it should be.
- **Skip** moves everyone to the next song. **End broadcast** takes it off air.
- **Other devices on your network** (phone, TV, a friend's laptop) can open `http://<your-PC-IP>:8088/listen`. The Radio page shows the exact address. You'll also see how many people are listening.
  - Visitors can reach **only** the listen page, cover art, and the audio files in the live station. Everything else on your node (your Spot, Studio, uploads, files) answers *403* to them.
  - The first time it runs, Windows Firewall may ask whether Node.js can accept connections. Allow it on **Private networks** for LAN listening.

## 🎬 Cinema

- **Home:** a featured hero, *Continue watching*, *Recently added*, a row per collection and per genre, and the channel list.
- **Channels:** each has a banner, avatar and about text. **Watch channel** plays the whole channel back to back, like a TV channel.
- **Genres** and **Collections:** create collections, give them a cover, and add or remove titles from any video's details.
- **Player:** full-screen, resumes where you left off, and counts down to the next episode.
- **Player controls:** speed, fit or fill, and keyboard shortcuts (Space, ←/→ 10s, ↑/↓ volume, F fullscreen, M mute, N next, Esc).
- **Posters** default to the video's first frame, grabbed automatically in your browser, so no ffmpeg is needed. Pick a different frame or your own image under *Edit* (see [Editing details & cover art](#️-editing-details--cover-art)).
- **Formats:** MP4 (H.264) and WebM play everywhere. MKV and MOV depend on the codecs inside.

## 🕹️ Arcade & Apps

- **Games** are grouped by genre, **apps** by category. Search and filter chips are on top.
- **Install:** upload a **.zip** with an `index.html` inside (Phaser, Godot web export, PICO-8, Construct, plain Canvas or WASM), or a single **.html** file.
- An optional `app.json` next to `index.html` fills in the details:
  ```json
  { "title": "Star Hopper", "kind": "game", "genre": "Platformer",
    "description": "Hop between stars.", "controls": "Arrows + Space", "thumbnail": "cover.png" }
  ```
  For an app, use `"kind": "app"` and `"category": "Productivity"` instead.
- **Sandbox:** each game or app runs in an iframe without same-origin rights, served with a Content-Security-Policy. It can load its own files but can't read your Spot's data, call its APIs, reach other websites or submit forms.
- **High scores:** games that use the arcade kit save your best score; it shows on the game's card and in the game's top bar.
- **Included games (11):** *Block Drop* (falling blocks with hold and ghost piece), *Neon Snake*, *Brick Breaker* (power-ups), *Neon 2048* (with undo), *Comet Dash* (one-button flyer), *Star Invaders*, *Mine Sweeper* (3 sizes, flag mode for touch), *Neon Runner* (jump, double-jump, duck), *Memory Match*, *Cyber Asteroids 2099* and *Neon Paddle Showdown*. Apps: *Neon Sketchpad* and *Focus Timer*. Press **M** in any of them to mute, **Esc** for the menu.
- **Making your own:** copy `content\apps\_kit\arcade-kit.js` into your game's folder and include it. `Arcade.score(n)` saves a score, `Arcade.onBest(fn)` gives you the current best, `Arcade.sfx('pick'|'hit'|'boom'|'win'|'lose'|'jump'|'shoot'|'blip')` plays a sound, `Arcade.swipe(fn)` reports touch swipes.

## 🖼️ Pictures

- **Albums are folders** in `content\pictures\`. Make one in the app, or just drop a folder of photos in there. Pictures sitting loose in `content\pictures\` show up as *Loose pictures*.
- **Add pictures:** the *Add pictures* button, the top bar's *Add* button, or drag them anywhere onto the page.
- **Lightbox:** ←/→ to browse, Space for a slideshow, F for fullscreen. From any picture: *use as profile picture*, *use as banner*, *add to picture reel*, *post to feed*, *move to another album*, or *delete*.
- **Previews** are made once, in your browser, and kept in `content\pictures\.thumbs\` so albums (and friends browsing them) load fast.
- **Share an album** from its ⋮ menu or the *Share* button: tick friends, optionally for a limited time.

## 📚 Library (e-reader)

| Format | Reader |
|---|---|
| EPUB | Chapters and table of contents. Size, serif or sans, line width, and dark/sepia/light themes. Scripts inside books never run. |
| PDF | Page-by-page rendering (pdf.js), zoom, fit width or whole page, two-page spread. |
| TXT / Markdown | Clean reading view that keeps line breaks, which matters for poems. |
| CBZ / CBR | Single page, two-page spread, vertical scroll (webtoon), right-to-left (manga), fit height or width, page thumbnails. |

- **Remembers your place** in every book.
- **Covers, titles and authors** are read from the files. Comic names like `Saga 012 (2013).cbz` become series *Saga*, issue *12*, and issues stack by series.
- **Comic pages** are unpacked once into `content\.cache\` the first time a comic is opened. Delete that folder any time to reclaim space.

## ✏️ Editing details & cover art

Every section (Radio, Cinema, Arcade, Library) has an **Edit library** button, and Studio → Assets has **Edit details & art**. Both open the **Library Manager**: one screen with tabs for Music, Videos, Books & Comics and Games & Apps. Click any item to edit its title, tags and artwork. The **Missing artwork** filter shows only items that still need a cover.

Any cover can come from:
- **Upload**, **drag an image** onto the cover box, or **click the box and paste** (Ctrl+V), for example a screenshot or an image copied from a web page.
- **From my Spot:** reuse an image already in `content\thumbnails\`.
- **Comics:** pick any page of the comic. **PDFs:** pick a page number.
- **Music:** tick *Use this cover for every song on “Album”* to set the whole album at once.

**Video posters:** choose **Frame from the video** (scrub to any frame, step frame by frame, or press *First frame*) or **Custom image**. New videos get their first frame automatically; if it's black, a frame a little further in is used instead. Frames can only be taken from videos your browser can play. For other codecs, use a custom image.

## 📁 Your files

Everything lives in this folder. **Drop files straight into these folders** and they appear within about 30 seconds, with tags, lengths and cover art read automatically:

```
content\
  audio\        MP3, WAV, FLAC, OGG, Opus, M4A
  video\        MP4, WebM, MKV, MOV
  books\        EPUB, PDF, TXT, MD, CBZ, CBR
  apps\         one folder per game/app, each with an index.html
  pictures\     one folder per album
  thumbnails\   covers, posters, avatars
data\
  db.json       your Spot: profile, theme, playlists, stations, progress, etc.
  social.json   friends (and what each can see), invites, messages, group chats, posts
  identity.json your keypair: back it up, never share it
```

- Deleting a song, video, book or app in the app also deletes its file. Deleting a file by hand removes it from the app.
- Uploads stream straight to disk, so big movies are fine.

---

## 👥 Friends & the peer-to-peer network

Every Spot has its own identity: an ed25519 keypair created on first run and kept in `data\identity.json`. **Back that file up.** It *is* your identity; anyone holding it can pose as you.

### Inviting people

- **Invite links are one-time.** *Invite* (Friends page, or your profile menu) makes a link like `spot://<your key>/<code>`. It works **once**: the first Spot to use it is let in and the link is spent, so it can't be passed around. Unused links expire after 1, 7 or 30 days, and you can cancel them any time.
- **Invite-only (on by default):** requests that don't carry a valid invite are turned away automatically. Turn it off under *Privacy & sharing* if you'd rather review every request.
- **Adding someone:** paste their link (or the whole message it came in) into *Add a friend*. Requests to someone who's offline go through when they come back online.
- **The request tells you which invite was used**, so you know who's knocking.

### Choosing what each friend can see

Nothing on your Spot is visible to anyone until you say so, per friend:

- **Item by item:** individual radio stations, playlists, video channels, collections, picture albums, games & apps, books & comics, and your picture reel. Or a whole category with **All**, which also covers things you add later.
- **For a limited time:** any item can be shared for 1 hour, 1 day, 1 week or 30 days. When the time's up it closes by itself, mid-stream if need be.
- **When:** as the request comes in (*Review & accept*), when you send a request, or ahead of time on the invite itself. With *Accept automatically*, an invite can even let them straight in with the access you picked.
- **Later:** a friend's ⋮ menu → *What they can see…*, or *Share with friends…* on any album, station, channel, collection, game or book. Changes reach them instantly.
- **Your usual selection** (under *Privacy & sharing*) pre-fills the picker for new friends.
- What a friend can open: stream shared music and videos, tune in to a shared station when it's on air, browse shared albums, **play shared games and apps** (still sandboxed), and **read shared books and comics**. Your node checks every single file request against their access.

**Who can contact you:** open a friend's menu → **Messages, calls & sharing…**, or the shield button in their chat. Three independent checkboxes control **Direct messages**, **Voice calls** and **Video calls** from that friend. Existing friends start with all three allowed. The receiving Spot enforces these settings even if the sender uses an older app; a disallowed message is not delivered, and disabling a call type also ends an incoming call of that type. These are direct-contact controls; group conversations use group membership.

### Removing a friend or resetting a pairing

On the **Friends** page, open the **⋮** menu beside a friend and choose **Remove friend**. The confirmation explains that saved chat history is kept. Removal revokes that friend's access; it does not delete your Spot identity or media.

To reset a pairing that shows connected peer links but an offline friend, open both Spots, remove each other on both computers if still listed, then create a **new** one-time invite on one computer. Use **Add a friend** on the other computer, paste the new link and accept the incoming request. Verify the contact permissions and try messages in both directions. Keep your existing `data` folder and `identity.json`.

The badge shows **friends online**. Its tooltip also lists peer links, which may include requests and group members; a peer link alone does not establish that a particular friend is ready to chat. Restart and re-pairing are recovery steps, not a guarantee that discovery or local network problems are resolved.

### Doing things together

- **Radio Dial** (Radio page): an FM dial of every friend who's on air, and an AM dial of every friend you can listen along with. Each friend has a fixed frequency; between stations there's real static. Turn the knob, scroll, use the arrow keys, or hit *Seek*.
- **Listen along:** friends see what you're playing (if *Show friends what I'm listening to* is on) and can join in with one click. They hear the same song at the same moment, and pausing is mirrored. Only songs from your own library are shown.
- **Watch parties:** from any video's details (or its ⋮ menu) choose *Watch party*, and invite friends who are online. Everyone watches in sync, streamed from your PC; anyone can play, pause or skip and it happens for everyone; chat runs beside the video. Guests can stream that video only while the party runs.

### How it works

- **Finding each other:** Spots use the public HyperDHT network (the same one Holepunch's Keet uses) only to look up a friend's current address by their key.
- **Connections:** after that, Spots connect directly to each other, punching through home routers. Every connection is end-to-end encrypted (Noise) and both sides prove their keys. No server ever sees your messages, posts or media.
- **Presence:** you see when friends are online, away, do-not-disturb, or on air with their radio, plus their current mood. Your status is set in the OmniPager.
- **Direct messages:** delivery ticks show ⏱ waiting in your outbox, ✓ delivered, and ✓✓ read. The outbox flushes automatically when they reconnect and retries queued messages every 15 seconds while connected. Repeated submissions of the same send request do not duplicate the message.
- **Group chats:** any member can add friends. Members who were offline catch up from whoever's online when they return.
- **Friend Feed:** post thoughts, poems (line breaks kept), pictures, or songs and videos from your library. Friends like and comment, and your node holds the official copy of your posts. Pictures are cached, so they stay visible while you're offline. Songs and videos stream from your PC, so they play only while you're online.
- **Visiting a Spot:** open a friend from the Feed to see their profile, posts and pictures. You can stream their music and videos, or **tune into their live radio station** in sync with everyone else listening.
- **Calls:** voice and video calls go straight between the two browsers (WebRTC). The signalling travels over your encrypted P2P link. A public STUN server (Google's) is only used to discover each side's public address; no audio or video passes through it.
  - Open your own Spot at `http://localhost:8088` (or your configured port) and allow camera/microphone access. Plain HTTP at a LAN IP does not provide the browser access required for calls; visiting another computer's node is restricted to radio listening.
  - An unanswered call ends after 45 seconds; connecting calls time out after 30 seconds. Temporary disconnections have 10 seconds to recover. Hang-up and failure release your camera and microphone, including when a permission prompt finishes late.
  - If your browser blocks call audio, press **Play call audio**. A failed call shows a device, permission or connection error so you can retry.
- **Blocking:** block anyone from their ⋮ menu or their request; they can't reach your Spot at all.

### Limits worth knowing
- Both people's Spots must be running at the same time to chat live, stream, or call. Messages and posts sent while someone is offline are delivered later.
- Hole punching works for most home routers. If **both** sides are behind very strict networks (some mobile carriers, corporate firewalls), the Spots can't reach each other, and calls may fail to connect. There's no relay server to fall back on (by design).
- Watch parties need a video format both browsers can play (MP4/H.264 or WebM is safest).
- On first use, Windows Firewall may ask about Node.js. Allow it on **Private networks**.

### A note on sharing content

Only share things you have the right to share. The private-invite design keeps things between you and the people you invite. It does not change copyright rules.

### Development checks

Run `npm test` for isolated call and messaging regression tests, `npm run lint` for TypeScript checks, and `npm run build` for a production build. The tests use simulated browser media devices and in-memory peer transports; they do not replace a real two-computer microphone, camera and network test.
