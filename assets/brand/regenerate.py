"""Regenerate all derived brand assets from source/ masters.

Idempotent. Run from repo root:  python3 assets/brand/regenerate.py
Requires: pip3 install Pillow
See assets/brand/README.md for what each output is used for.
"""
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pathlib import Path

BG = (11, 11, 15, 255)  # #0b0b0f — splash backgroundColor in app.config.js
GOLD = (196, 151, 70, 255)
WHITE = (255, 255, 255, 255)
TAGLINE_WHITE = WHITE
GOLD_STOPS = [(0.0, (255, 215, 0)), (0.5, (212, 175, 55)), (1.0, (184, 134, 11))]  # #FFD700 #D4AF37 #B8860B
FONT_BOLD_CANDIDATES = [
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def load_bold_font(size):
        for font_path in FONT_BOLD_CANDIDATES:
                    if Path(font_path).exists():
                                    return ImageFont.truetype(font_path, size)
    raise FileNotFoundError(f'No supported bold font found. Tried: {FONT_BOLD_CANDIDATES}')
            
LAUNCHER = Image.open('assets/brand/source/launcher-icon-master.png').convert('RGBA')
SPLASH_MASTER = Image.open('assets/brand/source/splash-master.png').convert('RGB')
GLOBE_ALPHA = Image.open('assets/brand/source/splash-icon-master-alpha.png').convert('RGBA')


def square_on_bg(img, size, padding_pct=0.0, mode='RGBA'):
    canvas = Image.new('RGBA', (size, size), BG)
    inner = int(size * (1 - 2 * padding_pct))
    fitted = img.resize((inner, inner), Image.LANCZOS)
    canvas.paste(fitted, ((size - inner) // 2, (size - inner) // 2), fitted)
    if mode == 'RGB':
        out = Image.new('RGB', (size, size), BG[:3])
        out.paste(canvas, mask=canvas.split()[3])
        return out
    return canvas


def gradient_band(width, height, stops):
    """Horizontal gradient image (RGBA) interpolating between stops [(t, rgb), ...]."""
    band = Image.new('RGBA', (width, height))
    px = band.load()
    for x in range(width):
        t = x / max(1, width - 1)
        for i in range(len(stops) - 1):
            t0, c0 = stops[i]
            t1, c1 = stops[i + 1]
            if t0 <= t <= t1:
                u = (t - t0) / max(1e-9, t1 - t0)
                r = round(c0[0] + (c1[0] - c0[0]) * u)
                g = round(c0[1] + (c1[1] - c0[1]) * u)
                b = round(c0[2] + (c1[2] - c0[2]) * u)
                break
        for y in range(height):
            px[x, y] = (r, g, b, 255)
    return band


def paste_gradient_text(canvas, text, font, cx, cy, stops):
    """Draw `text` centered at (cx, cy) using a horizontal gradient fill."""
    bbox = ImageDraw.Draw(canvas).textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).text((-bbox[0], -bbox[1]), text, font=font, fill=255)
    band = gradient_band(w, h, stops)
    canvas.paste(band, (cx - w // 2 - bbox[0], cy - h // 2 - bbox[1]), mask)


def paste_text_centered(canvas, text, font, cx, cy, fill):
    """Draw `text` centered at (cx, cy) with a solid fill."""
    draw = ImageDraw.Draw(canvas)
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - w // 2 - bbox[0], cy - h // 2 - bbox[1]), text, font=font, fill=fill)


# PWA icons (drop these into ChravelApp/public/)
square_on_bg(LAUNCHER, 192).save('assets/brand/pwa/icon-192.png', optimize=True)
square_on_bg(LAUNCHER, 512).save('assets/brand/pwa/icon-512.png', optimize=True)
square_on_bg(LAUNCHER, 192, 0.20).save('assets/brand/pwa/icon-192-maskable.png', optimize=True)
square_on_bg(LAUNCHER, 512, 0.20).save('assets/brand/pwa/icon-512-maskable.png', optimize=True)
square_on_bg(LAUNCHER, 180, mode='RGB').save('assets/brand/pwa/apple-touch-icon.png', optimize=True)
square_on_bg(LAUNCHER, 32).save('assets/brand/pwa/favicon-32.png', optimize=True)
square_on_bg(LAUNCHER, 16).save('assets/brand/pwa/favicon-16.png', optimize=True)

# Globe-only fallback (matches A12+ behavior if you ever want to revert from tagline)
square_on_bg(GLOBE_ALPHA, 192).save('assets/brand/icons/globe-192.png', optimize=True)
square_on_bg(GLOBE_ALPHA, 512).save('assets/brand/icons/globe-512.png', optimize=True)

# iPad Pro PWA startup image fallback
canvas = Image.new('RGB', (2048, 2732), BG[:3])
fitted = ImageOps.contain(SPLASH_MASTER, (2048, 2732))
canvas.paste(fitted, ((2048 - fitted.width) // 2, (2732 - fitted.height) // 2))
canvas.save('assets/brand/pwa/apple-splash-2732x2048.png', optimize=True)

# Android 12+ splash icon: globe + ChravelApp gradient wordmark + single-line
# tagline, all inside the inscribed circle that the OS will clip the icon to.
# Measured widths (Liberation Sans Bold):
#   "ChravelApp" @ 110pt          ≈ 617 px (height ≈ 102 px)
#   "Less Chaos More Coordination" @ 56pt ≈ 829 px (height ≈  41 px)
# Chord at the worst row of each block (canvas diameter 1024, center 512):
#   wordmark bottom y=611 → chord = 1005 px → margin ≈ ±194 px each side
#   tagline bottom y=730  → chord =  928 px → margin ≈  ±50 px each side
# Margins are intentional — some OEMs apply a tighter mask than the geometric
# inscribed circle. If the layout is ever tightened, re-measure here.
SIZE = 1024
GLOBE_DIAM = 380
GLOBE_CY = 270
canvas = Image.new('RGBA', (SIZE, SIZE), BG)
globe = GLOBE_ALPHA.resize((GLOBE_DIAM, GLOBE_DIAM), Image.LANCZOS)
canvas.paste(globe, ((SIZE - GLOBE_DIAM) // 2, GLOBE_CY - GLOBE_DIAM // 2), globe)
paste_gradient_text(canvas, 'ChravelApp',
                    load_bold_font(110),
                    SIZE // 2, 560, GOLD_STOPS)
paste_text_centered(canvas, 'Less Chaos More Coordination',
                    load_bold_font(56),
                    SIZE // 2, 710, TAGLINE_WHITE)

out = Image.new('RGB', (SIZE, SIZE), BG[:3])
out.paste(canvas, mask=canvas.split()[3])
out.save('assets/splash-icon-android.png', 'PNG', optimize=True)
out.save('assets/brand/icons/android-splash-icon.png', 'PNG', optimize=True)

# Full splash lockup (single asset used by iOS expo-splash-screen and the
# JS loading overlay so the cold-launch -> WebView-ready handoff has no visual
# seam). Portrait canvas sized for contain-fit on common phone aspect ratios.
LOCKUP_W, LOCKUP_H = 1242, 2208
GLOBE_W = 720
canvas = Image.new('RGBA', (LOCKUP_W, LOCKUP_H), BG)
globe = GLOBE_ALPHA.resize((GLOBE_W, GLOBE_W), Image.LANCZOS)
globe_y = int(LOCKUP_H * 0.22)
canvas.paste(globe, ((LOCKUP_W - GLOBE_W) // 2, globe_y), globe)
paste_gradient_text(canvas, 'ChravelApp',
                    load_bold_font(200),
                    LOCKUP_W // 2, globe_y + GLOBE_W + 200, GOLD_STOPS)
paste_text_centered(canvas, 'Less Chaos More Coordination',
                    load_bold_font(76),
                    LOCKUP_W // 2, globe_y + GLOBE_W + 380, TAGLINE_WHITE)

lockup_out = Image.new('RGB', (LOCKUP_W, LOCKUP_H), BG[:3])
lockup_out.paste(canvas, mask=canvas.split()[3])
lockup_out.save('assets/splash-lockup.png', 'PNG', optimize=True)
lockup_out.save('assets/brand/icons/splash-lockup.png', 'PNG', optimize=True)

print('OK')
h
