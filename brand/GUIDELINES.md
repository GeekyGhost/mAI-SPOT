# Digital Forge — brand guidelines

Digital Forge is the studio. Video Studio is a product under it. These rules exist so the next
product looks like it came from the same place without anyone re-deciding.

---

## 1. The mark

A flat orange body whose right edge rakes inward toward the base, a magenta wedge filling that
rake, a cyan bar across the full width of the base, and **DF** set heavy and black across the body.

Read it as a frame leaning into motion: the rake and the wedge give direction, the cyan base line
grounds it.

**The dark tile is not part of the logo.** The mark is the artwork alone, on transparency. The
tiles in `logo/icon-tile/` exist only because app icons, favicons and store listings require a
filled square — they are containers. Never reproduce the tile as if it were the logo, never put the
mark in a box in running layout, and never assume the background is black.

The mark's body is opaque, so it holds on light, dark and mid-tone backgrounds with no variant
needed. `logo/df-mark.svg` is the master.

**The fills are flat.** No gradient, ever — that is what separates the mark from the ember gradient
used elsewhere in the interface. The two must not be confused, and the mark must never be
"upgraded" to a gradient to match a banner.

The vector here was rebuilt from the original artwork. If you still have the source file, reconcile
the two and treat whichever you keep as the single master — `build.py` regenerates everything else
from it.

### Two cuts, and when to use each

| Cut | File | Use at |
|---|---|---|
| **Full** | `logo/df-mark.svg` | **33px and above.** The master, lettering included, transparent. |
| **Small** | `logo/df-mark-small.svg` | **32px and below.** Lettering removed; the three-colour silhouette carries it. |
| **Tiles** | `logo/icon-tile/df-tile-*.svg` | App icons and favicons only, where a filled square is required. |

Below 33px the counters in the **D** close up and the **F** loses its arms — the lettering stops
reading as letters and becomes noise inside the body. The small cut is not a different logo; it is
the same shape with the detail that cannot survive removed. Favicons, taskbar icons, tray icons and
timeline chips all take the small cut.

The tile files scale the artwork ~1.16× about the centre so it fills the square properly. The master
mark is unscaled — correct beside text, far too much padding once boxed.

### Clear space

Leave **one cyan-bar height** of empty space on every side — that is `0.10 × mark height`. Nothing
else sits inside it: no text, no rules, no edge of a container.

### Minimum sizes

| Context | Minimum |
|---|---|
| Digital, in a tile (app icon) | 16px |
| Digital, mark on its own | 20px |
| Print | 8mm |
| Full lockup with wordmark | 120px wide |

### Never

- Recolour the mark. The three fills are fixed, and they are flat — never a gradient.
- Rotate, skew, or add a drop shadow, bevel, outer glow or stroke.
- Re-space the D and F, or set the F in a different typeface.
- Put the mark in a box in running layout. The tile is for icons only.
- Place it on a busy photo without the watermark treatment in `ui/watermark.svg`.
- Use the full cut below 33px "because it looks fine on my monitor". It does not on someone else's.

---

## 2. Lockups

### Studio

`logo/df-lockup-horizontal.svg` · `logo/df-lockup-stacked.svg`

Mark, then **DIGITAL FORGE** in display caps. Horizontal is the default; stacked is for square or
vertical space.

### Product

`logo/product/video-studio-horizontal.svg` and friends.

Product lockups add a **hairline rule** and the product name in **ember orange** beneath the studio
name. The studio name is always larger and always white — the studio leads, the product follows.

```
┌──────┐   DIGITAL FORGE        ← #e6fdff, 700 weight, tracked +9
│ mark │   ─────────────────    ← #1a323c hairline
└──────┘   VIDEO STUDIO         ← #ff8e2b, regular, tracked +12
```

**Adding a product:** copy `logo/product/_template-horizontal.svg` and change one string. Do not
invent a per-product mark, a per-product colour, or a new arrangement. The system is the point —
`Digital Forge / Image Studio` should be recognisable as a sibling of `Digital Forge / Video
Studio` at a glance.

---

## 3. Colour

Full values in `palette/palette.json`, ready-to-paste variables in `palette/palette.css`, and a
visual sheet in `palette/swatches.png`. These mirror `:root` in `src/styles.css` — **if you change
one, change both.**

### Two colour systems, kept apart

**The mark** uses three flat brand colours and nothing else: `#f9993c` body, `#ff2e6e` wedge,
`#2ee8f7` base, with `#111111` lettering.

**The interface** uses the ember gradient — `#ffcf33 → #ff8e2b → #ff3385`, always top-left to
bottom-right — for accent rules, progress and highlights. Reserved for exactly that. **Never use it
for body text or large fills**, and never apply it to the mark. Keeping the flat mark and the
gradient interface distinct is what stops the logo dissolving into the chrome around it.

The brand and accent values sit close but are not identical (`#ff2e6e` vs `#ff3385`,
`#2ee8f7` vs `#00f0ff`). That is deliberate and documented — do not "fix" one to match the other
without deciding to change the logo.

### Accents carry meaning — this is not decoration

| | | Means |
|---|---|---|
| Blue `#00f0ff` | structure | selection, primary action, panel chrome |
| Pink `#ff3385` | motion | transitions, video, anything moving |
| Gold `#ffcf33` | selection | audio, warnings, the active range |
| Orange `#ff8e2b` | in progress | ember mid-tone, running jobs |
| Green `#39ff88` | health | ready, success, passing |
| Red `#ff3c3c` | stop | errors, destructive actions |

A green "delete" button or a red "ready" pill breaks the system. When in doubt, ask what the colour
*means* here, not what looks good.

### Surfaces

Six steps from `#030608` to `#121e24`. Depth comes from **stepping up the surface**, not from
shadows. Borders are `#1a323c`; internal dividers are `#14262e`.

### Contrast

Body text is `#a1efff` on `#0d161a` — comfortably past WCAG AA. **Muted text `#649fae` is not.**
Use it for metadata and secondary labels only, never for anything a user must read to proceed.

---

## 4. Typography

| Role | Face | Used for |
|---|---|---|
| Display | **Outfit** | headings, buttons, labels, the wordmark |
| Body | **Inter** | paragraphs, descriptions, help text |
| Code | **DM Mono** | paths, hashes, values, timecode, technical readouts |

Fallback stacks are in `palette/palette.css` and match the application exactly.

**Display type is uppercase and tracked.** Letter-spacing `.08em` at panel-header size, `.05em` at
button size. This is the single most recognisable typographic habit in the interface — keep it.

**Technical values are always mono.** File paths, seeds, resolutions, frame counts, durations, VRAM
figures. If it is a number a user might copy or compare, it is DM Mono.

---

## 5. Interface language

`ui/chrome-motifs.svg` shows the vocabulary.

- **Angled chrome.** Panels chamfer one or two corners at ~20px. Not all four — the asymmetry is
  what makes it read as forged rather than merely rounded.
- **Accent rules.** A 6px ember bar along a top edge marks a primary surface. Blue and pink rules
  mark structure and motion respectively.
- **Glow, sparingly.** `0 0 12px` at ~28% opacity on the accent colour, for focus and selection
  only. Never on static elements.

### Supplied decals

| File | For |
|---|---|
| `ui/splash.svg` | startup / loading, 1280×720 |
| `ui/watermark.svg` | burn-in over footage, white, single colour, 55% |
| `ui/corner-bug.svg` | corner identification in video or UI |
| `ui/empty-state.svg` | empty panels, 22% muted, deliberately quiet |
| `ui/chrome-motifs.svg` | reference sheet for the above |

---

## 6. Voice

The interface explains rather than reassures. It is the same voice the codebase comments are
written in.

- **Name the blocker.** "Pack missing", "CPU-only PyTorch", "Adapter missing" — not "Something went
  wrong."
- **Give the command.** If a script fixes it, print the script.
- **State the cost.** "about 5 MB", "roughly 2.5 GB and only happens once", "this stays disabled
  until then."
- **No exclamation marks, no congratulation.** Finishing a render is not an achievement worth a
  🎉. Say what happened and how long it took.
- **Say what is not supported and why.** The absence of a control is information.

---

## 7. Files

```
brand/
  build.py              regenerates everything — never hand-edit a PNG
  GUIDELINES.md         this file
  logo/                 mark, variants, lockups, product system
  icon/png/             16 … 1024, plus a contact sheet
  ui/                   splash, watermark, corner bug, empty state, chrome
  social/               GitHub social card, OG image, README banner
  palette/              JSON, CSS and a visual swatch sheet
```

Every PNG in this pack is generated from the SVG sources by `build.py`. If a raster asset is wrong,
fix the geometry and re-run — do not retouch the output, or the next rebuild will silently discard
your fix.
