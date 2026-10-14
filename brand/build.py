#!/usr/bin/env python3
"""Generate the Digital Forge brand pack.

Re-run this after editing any source geometry below; every PNG in the pack is derived,
never hand-edited. Requires: pip install cairosvg pillow

The SVG deliverables carry live text in the brand font stack (Outfit / Inter / DM Mono).
PNGs rendered on a machine without those fonts fall back to a neutral grotesque, which is
close but not canonical — install the fonts and re-run for final assets.
"""
import json
import os
import cairosvg
from PIL import Image

OUT = os.path.dirname(os.path.abspath(__file__))

# ----------------------------------------------------------------- palette
PALETTE = {
    "surface": {
        "black":       ("#030608", "App background, the deepest layer"),
        "steel":       ("#080f12", "Panel headers, toolbars"),
        "panel":       ("#0d161a", "Panel bodies"),
        "panel-light": ("#121e24", "Cards, inputs, raised surfaces"),
        "border-glow": ("#1a323c", "Standard borders"),
        "border-dim":  ("#14262e", "Internal dividers"),
    },
    "text": {
        "primary": ("#a1efff", "Body text"),
        "bright":  ("#e6fdff", "Headings, emphasis"),
        "muted":   ("#649fae", "Secondary text, metadata"),
    },
    "brand": {
        "df-orange": ("#f9993c", "Logo body. Flat, never gradient."),
        "df-magenta": ("#ff2e6e", "Logo wedge"),
        "df-cyan":   ("#2ee8f7", "Logo base bar"),
        "df-ink":    ("#111111", "The DF letterforms"),
    },
    "accent": {
        "blue":   ("#00f0ff", "Structure, selection, primary action"),
        "pink":   ("#ff3385", "Motion, transitions, video"),
        "gold":   ("#ffcf33", "Selection, audio, warnings"),
        "orange": ("#ff8e2b", "Ember mid-tone, in-progress"),
        "green":  ("#39ff88", "Health, success, ready"),
        "red":    ("#ff3c3c", "Errors, destructive actions"),
    },
}

FONT_DISPLAY = "Outfit, 'Segoe UI', system-ui, sans-serif"
FONT_BODY = "Inter, 'Segoe UI', system-ui, sans-serif"
FONT_CODE = "'DM Mono', 'Courier New', Courier, monospace"

DEFS = """<defs>
    <linearGradient id="forge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d161a"/><stop offset="1" stop-color="#030608"/></linearGradient>
    <linearGradient id="ember" x1="0.05" y1="0" x2="0.95" y2="1">
      <stop offset="0" stop-color="#ffcf33"/><stop offset="0.5" stop-color="#ff8e2b"/>
      <stop offset="1" stop-color="#ff3385"/></linearGradient>
    <linearGradient id="emberFlat" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffcf33"/><stop offset="1" stop-color="#ff3385"/></linearGradient>
    <radialGradient id="forgeGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ff8e2b" stop-opacity="0.20"/>
      <stop offset="0.55" stop-color="#ff3385" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#ff3385" stop-opacity="0"/></radialGradient>
  </defs>"""

# ------------------------------------------------------------ the mark
ORANGE, PINK, CYAN, INK = "#f9993c", "#ff2e6e", "#2ee8f7", "#111111"

# The Digital Forge mark, rebuilt as vector from the supplied artwork.
# Flat fills, no gradient: a rectangular body whose right edge rakes inward toward the base,
# a magenta wedge filling that rake, and a cyan bar across the full width of the base.
MARK_FULL = f"""
  <polygon points="70,88 398,88 385,380 70,380" fill="{ORANGE}"/>
  <polygon points="398,88 442,88 412,380 385,380" fill="{PINK}"/>
  <polygon points="70,380 412,380 408,424 70,424" fill="{CYAN}"/>
  <text x="228" y="252" text-anchor="middle" font-family="{FONT_DISPLAY}" font-size="182"
    font-weight="800" letter-spacing="-4" fill="{INK}" dominant-baseline="middle">DF</text>"""

# Small-size cut, 32px and below: the lettering closes up and turns to mush, so it is removed.
# The three-colour silhouette still identifies the mark.
MARK_SMALL = f"""
  <polygon points="70,88 398,88 385,380 70,380" fill="{ORANGE}"/>
  <polygon points="398,88 442,88 412,380 385,380" fill="{PINK}"/>
  <polygon points="70,380 412,380 408,424 70,424" fill="{CYAN}"/>"""


def mono(body, colour):
    """Flatten the mark to one colour, for single-colour reproduction."""
    out = body
    for c in (ORANGE, PINK, CYAN):
        out = out.replace(f'fill="{c}"', f'fill="{colour}"')
    return out.replace(f'fill="{INK}"', 'fill="none"')

FRAME = """<rect width="512" height="512" rx="96" fill="#0d0d0d"/>"""

# The mark's real ink bounds inside its 512 box. Everything that places the mark beside text
# must use these, not the 512 box, or the padding reads as unintendedwhitespace and the optical
# alignment drifts.
MARK_X, MARK_Y, MARK_W, MARK_H = 70, 88, 372, 336

def place(body, height, x, y):
    """Drop the bare mark at (x, y) rendered `height` px tall. No tile, ever."""
    k = height / MARK_H
    return (f'<g transform="translate({x:.1f},{y:.1f}) scale({k:.4f}) '
            f'translate({-MARK_X},{-MARK_Y})">{body}</g>')

def framed(body, fill=1.16):
    """Icon-ready: mark scaled about the canvas centre so it fills the tile properly.

    The bare mark leaves ~34% padding, which is right for a lockup and far too much for an
    app icon — at 16px the artwork all but disappears inside its own tile.
    """
    return (FRAME + f'<g transform="translate(256,256) scale({fill}) translate(-256,-256)">'
            + body + '</g>')

def svg(body, w=512, h=512, vb=None, defs=DEFS):
    vb = vb or f"0 0 {w} {h}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}">'
            f'{defs}{body}</svg>\n')

def write(path, content):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "w", encoding="utf-8").write(content)
    return full

def png(svg_path, out_path, w, h=None):
    full_in = os.path.join(OUT, svg_path)
    full_out = os.path.join(OUT, out_path)
    os.makedirs(os.path.dirname(full_out), exist_ok=True)
    cairosvg.svg2png(url=full_in, write_to=full_out, output_width=w, output_height=h or w)

# ============================================================ logo/
# The mark itself: transparent, no container. This is the master.
write("logo/df-mark.svg", svg(MARK_FULL))
write("logo/df-mark-small.svg", svg(MARK_SMALL))
# Tiled variants exist only because app icons and favicons require a filled tile. The tile is
# a container, NOT part of the logo, and must never be reproduced as though it were.
write("logo/icon-tile/df-tile-dark.svg", svg(framed(MARK_FULL)))
write("logo/icon-tile/df-tile-dark-small.svg", svg(framed(MARK_SMALL, 1.22)))
write("logo/icon-tile/df-tile-light.svg",
      svg(framed(MARK_FULL).replace('fill="#0d0d0d"', 'fill="#f4f6f8"')))
write("logo/df-mark-mono-light.svg", svg(mono(MARK_FULL, "#e6fdff")))
write("logo/df-mark-mono-dark.svg", svg(mono(MARK_FULL, "#030608")))
write("logo/df-mark-mono-ember.svg", svg(mono(MARK_FULL, "#ff8e2b")))

def lockup_h(product=None, w=1200, ink="#e6fdff", rule="#1a323c", sub="#ff8e2b"):
    """Mark left, name right. Product name sits under the studio name on a rule."""
    h = 320
    mh = 196
    mark = place(MARK_FULL, mh, 40, (h - mh) / 2)
    tx = int(40 + MARK_W * mh / MARK_H + 46)
    if product:
        text = (f'<text x="{tx}" y="140" font-family="{FONT_DISPLAY}" font-size="76" font-weight="700" '
                f'letter-spacing="10" fill="{ink}">DIGITAL FORGE</text>'
                f'<rect x="{tx}" y="168" width="620" height="3" fill="{rule}"/>'
                f'<text x="{tx}" y="232" font-family="{FONT_DISPLAY}" font-size="46" font-weight="400" '
                f'letter-spacing="14" fill="{sub}">{product.upper()}</text>')
    else:
        text = (f'<text x="{tx}" y="185" font-family="{FONT_DISPLAY}" font-size="86" font-weight="700" '
                f'letter-spacing="12" fill="{ink}">DIGITAL FORGE</text>')
    return svg(mark + text, w=w, h=h, vb=f"0 0 {w} {h}")

def lockup_v(product=None, w=640, ink="#e6fdff", rule="#1a323c", sub="#ff8e2b"):
    h = 620 if product else 560
    mh = 236
    mark = place(MARK_FULL, mh, (w - MARK_W * mh / MARK_H) / 2, 56)
    cx = w // 2
    if product:
        text = (f'<text x="{cx}" y="450" text-anchor="middle" font-family="{FONT_DISPLAY}" font-size="62" '
                f'font-weight="700" letter-spacing="8" fill="{ink}">DIGITAL FORGE</text>'
                f'<rect x="{cx-230}" y="480" width="460" height="3" fill="{rule}"/>'
                f'<text x="{cx}" y="546" text-anchor="middle" font-family="{FONT_DISPLAY}" font-size="38" '
                f'letter-spacing="12" fill="{sub}">{product.upper()}</text>')
    else:
        text = (f'<text x="{cx}" y="470" text-anchor="middle" font-family="{FONT_DISPLAY}" font-size="66" '
                f'font-weight="700" letter-spacing="9" fill="{ink}">DIGITAL FORGE</text>')
    return svg(mark + text, w=w, h=h, vb=f"0 0 {w} {h}")

# Every lockup ships twice. The mark is background-agnostic, the type is not: near-white
# wordmarks vanish on light backgrounds, which is exactly what a transparent asset invites.
LIGHT_BG = dict(ink="#101418", rule="#c3ccd2", sub="#d2691e")

write("logo/df-lockup-horizontal.svg", lockup_h())
write("logo/df-lockup-horizontal-onlight.svg", lockup_h(**LIGHT_BG))
write("logo/df-lockup-stacked.svg", lockup_v())
write("logo/df-lockup-stacked-onlight.svg", lockup_v(**LIGHT_BG))
write("logo/product/video-studio-horizontal.svg", lockup_h("Video Studio"))
write("logo/product/video-studio-horizontal-onlight.svg", lockup_h("Video Studio", **LIGHT_BG))
write("logo/product/video-studio-stacked.svg", lockup_v("Video Studio"))
write("logo/product/image-studio-horizontal.svg", lockup_h("Image Studio"))
write("logo/product/_template-horizontal.svg", lockup_h("Product Name"))

def wordmark(colour):
    return svg(f'<text x="0" y="90" font-family="{FONT_DISPLAY}" font-size="96" font-weight="700" '
               f'letter-spacing="13" fill="{colour}">DIGITAL FORGE</text>',
               w=1120, h=124, vb="0 0 1120 124")

write("logo/df-wordmark.svg", wordmark("#e6fdff"))
write("logo/df-wordmark-onlight.svg", wordmark("#101418"))

# ============================================================ icon/
ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
for s in ICON_SIZES:
    src = ("logo/icon-tile/df-tile-dark-small.svg" if s <= 32
           else "logo/icon-tile/df-tile-dark.svg")
    png(src, f"icon/png/df-icon-{s}.png", s)
write("icon/favicon.svg", svg(framed(MARK_SMALL, 1.22), w=64, h=64, vb="0 0 512 512"))
write("icon/favicon-bare.svg", svg(MARK_SMALL, w=64, h=64, vb="0 0 512 512"))

# ============================================================ ui/
# Corner bug: the mark reduced, for burning into video or a UI corner.
write("ui/corner-bug.svg", svg(
    f'<g opacity="0.95">{place(MARK_FULL, 112, 24, 34)}</g>'
    f'<text x="196" y="86" font-family="{FONT_DISPLAY}" font-size="34" font-weight="700" '
    f'letter-spacing="5" fill="#e6fdff" opacity="0.9">DIGITAL FORGE</text>',
    w=560, h=180, vb="0 0 560 180"))

# Watermark: single colour, low opacity, safe over any footage.
write("ui/watermark.svg", svg(
    f'<g opacity="0.55">{mono(MARK_FULL, "#ffffff")}</g>', w=256, h=256, vb="0 0 512 512"))

# Splash / loading
splash = f"""<rect width="1280" height="720" fill="url(#forge)"/>
  <g opacity="0.06">
    {''.join(f'<rect x="{x}" y="0" width="2" height="720" fill="#00f0ff"/>' for x in range(0, 1280, 64))}
  </g>
  <path d="M0 0 H1280 V6 H0 Z" fill="url(#emberFlat)"/>
  {place(MARK_FULL, 236, 640 - MARK_W * 236 / MARK_H / 2, 168)}
  <text x="640" y="530" text-anchor="middle" font-family="{FONT_DISPLAY}" font-size="52"
    font-weight="700" letter-spacing="11" fill="#e6fdff">DIGITAL FORGE</text>
  <rect x="410" y="558" width="460" height="2" fill="#1a323c"/>
  <text x="640" y="606" text-anchor="middle" font-family="{FONT_DISPLAY}" font-size="30"
    letter-spacing="13" fill="#ff8e2b">VIDEO STUDIO</text>
  <text x="640" y="672" text-anchor="middle" font-family="{FONT_CODE}" font-size="18"
    fill="#649fae">local processing · 16 GB profile</text>"""
write("ui/splash.svg", svg(splash, w=1280, h=720, vb="0 0 1280 720"))

# Empty state: mark outline, quiet
write("ui/empty-state.svg", svg(
    f'<g opacity="0.22">{mono(MARK_FULL, "#649fae")}</g>', w=200, h=200, vb="0 0 512 512"))

# Chrome motifs: the angled clip-path language used across the UI
chrome = """<rect width="900" height="360" fill="#0d161a"/>
  <g fill="none" stroke="#1a323c" stroke-width="2">
    <path d="M40 40 H300 L320 60 V140 H60 L40 120 Z"/>
    <path d="M340 40 H600 L620 60 V140 H360 L340 120 Z"/>
    <path d="M660 40 H860 V120 L840 140 H660 Z"/>
  </g>
  <g fill="url(#emberFlat)">
    <path d="M40 200 H300 L308 208 V216 H48 L40 208 Z"/>
  </g>
  <g fill="#00f0ff" opacity="0.85">
    <path d="M340 200 H600 L608 208 V216 H348 L340 208 Z"/>
  </g>
  <g fill="#ff3385" opacity="0.85">
    <path d="M660 200 H860 L868 208 V216 H668 L660 208 Z"/>
  </g>
  <g font-family="'DM Mono', monospace" font-size="13" fill="#649fae">
    <text x="40" y="270">angled panel chrome · 20px chamfer</text>
    <text x="40" y="296">accent rules: ember / blue / pink</text>
  </g>"""
write("ui/chrome-motifs.svg", svg(chrome, w=900, h=360, vb="0 0 900 360"))

# ============================================================ social/
def banner(w, h, sub="VIDEO STUDIO", tag="Local-first AI video editing on one 16 GB GPU"):
    """One banner routine for every aspect ratio.

    Type is scaled by the geometric mean of the canvas rather than by height, so a wide-short
    README banner and a near-square social card get the same optical weight. Scaling on height
    alone made 1600x400 render its tagline at 16px.
    """
    k = (w * h) ** 0.5 / 900.0
    mark_h = 260 * k
    mark_w = MARK_W * mark_h / MARK_H
    mx, my = w * 0.075, (h - mark_h) / 2
    tx = mx + mark_w + 54 * k
    base = h / 2 - 30 * k
    return f"""<rect width="{w}" height="{h}" fill="url(#forge)"/>
  <g opacity="0.05">{''.join(f'<rect x="{x}" y="0" width="2" height="{h}" fill="#00f0ff"/>' for x in range(0, w, 56))}</g>
  <ellipse cx="{w*0.30}" cy="{h*0.52}" rx="{w*0.42}" ry="{h*0.62}" fill="url(#forgeGlow)"/>
  <rect x="0" y="0" width="{w}" height="6" fill="url(#emberFlat)"/>
  {place(MARK_FULL, mark_h, mx, my)}
  <text x="{tx:.0f}" y="{base:.0f}" font-family="{FONT_DISPLAY}" font-size="{74*k:.0f}"
    font-weight="700" letter-spacing="{9*k:.1f}" fill="#e6fdff">DIGITAL FORGE</text>
  <rect x="{tx:.0f}" y="{base + 26*k:.0f}" width="{560*k:.0f}" height="{max(2, 3*k):.0f}" fill="#1a323c"/>
  <text x="{tx:.0f}" y="{base + 86*k:.0f}" font-family="{FONT_DISPLAY}" font-size="{40*k:.0f}"
    letter-spacing="{12*k:.1f}" fill="#ff8e2b">{sub}</text>
  <text x="{tx:.0f}" y="{base + 148*k:.0f}" font-family="{FONT_BODY}" font-size="{26*k:.0f}"
    fill="#649fae">{tag}</text>"""

write("social/github-social.svg", svg(banner(1280, 640), w=1280, h=640, vb="0 0 1280 640"))
png("social/github-social.svg", "social/github-social-1280x640.png", 1280, 640)
write("social/og-image.svg", svg(banner(1200, 630), w=1200, h=630, vb="0 0 1200 630"))
png("social/og-image.svg", "social/og-image-1200x630.png", 1200, 630)
write("social/readme-banner.svg", svg(banner(1600, 400), w=1600, h=400, vb="0 0 1600 400"))
png("social/readme-banner.svg", "social/readme-banner-1600x400.png", 1600, 400)

# ============================================================ palette/
swatch_rows = []
y = 70
for group, entries in PALETTE.items():
    swatch_rows.append(f'<text x="30" y="{y}" font-family="{FONT_DISPLAY}" font-size="20" '
                       f'font-weight="700" letter-spacing="4" fill="#e6fdff">{group.upper()}</text>')
    y += 26
    x = 30
    for name, (hexv, use) in entries.items():
        swatch_rows.append(
            f'<rect x="{x}" y="{y}" width="150" height="88" rx="4" fill="{hexv}" stroke="#1a323c"/>'
            f'<text x="{x+8}" y="{y+108}" font-family="{FONT_CODE}" font-size="13" fill="#e6fdff">{hexv}</text>'
            f'<text x="{x+8}" y="{y+128}" font-family="{FONT_CODE}" font-size="12" fill="#649fae">{name}</text>')
        x += 166
    y += 168
write("palette/swatches.svg", svg(
    f'<rect width="1030" height="{y}" fill="#030608"/>' + "".join(swatch_rows),
    w=1030, h=y, vb=f"0 0 1030 {y}"))
png("palette/swatches.svg", "palette/swatches.png", 1030, y)

write("palette/palette.json", json.dumps(
    {g: {k: {"hex": v[0], "use": v[1]} for k, v in e.items()} for g, e in PALETTE.items()},
    indent=2) + "\n")

css = ["/* Digital Forge palette. Mirrors :root in src/styles.css — keep the two in step. */",
       ":root {"]
for group, entries in PALETTE.items():
    css.append(f"  /* {group} */")
    for name, (hexv, use) in entries.items():
        prefix = "" if group == "surface" else f"{group}-"
        css.append(f"  --{prefix}{name}: {hexv}; /* {use} */")
css += ["", f"  --font-display: {FONT_DISPLAY};", f"  --font-body: {FONT_BODY};",
        f"  --font-code: {FONT_CODE};", "}", ""]
write("palette/palette.css", "\n".join(css))

# ============================================================ contact sheet
sizes = [256, 128, 64, 48, 32, 24, 16]
sheet = Image.new("RGBA", (1100, 520), (14, 22, 26, 255))
x = 20
for s in sizes:
    im = Image.open(os.path.join(OUT, f"icon/png/df-icon-{s}.png")).convert("RGBA")
    sheet.alpha_composite(im, (x, 20))
    # 1:1 above, nearest-neighbour blow-up below, so small-size legibility is judged honestly
    if s <= 48:
        z = im.resize((s * 4, s * 4), Image.NEAREST)
        sheet.alpha_composite(z, (x, 300))
    x += max(s, s * 4 if s <= 48 else s) + 18
sheet.convert("RGB").save(os.path.join(OUT, "icon/contact-sheet.png"))

print("brand pack built")
