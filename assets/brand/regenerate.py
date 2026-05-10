"""Regenerate all derived brand assets from source/ masters.

Idempotent. Run from repo root:  python3 assets/brand/regenerate.py
Requires: pip3 install Pillow
See assets/brand/README.md for what each output is used for.
"""
from PIL import Image, ImageDraw, ImageFont, ImageOps

BG = (11, 11, 15, 255)  # #0b0b0f — splash backgroundColor in app.config.js
GOLD = (196, 151, 70, 255)
WHITE = (255, 255, 255, 255)
FONT_BOLD = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'

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

# Android 12+ splash icon: globe + 2-line tagline that survives the circular mask.
# Layout chosen so all visible content stays inside an inscribed circle of diameter 1024:
# at y=628 the chord = 998px, at y=722 the chord = 935px; tagline width = 711px.
SIZE = 1024
GLOBE_DIAM = 470
GLOBE_CY = 312
canvas = Image.new('RGBA', (SIZE, SIZE), BG)
draw = ImageDraw.Draw(canvas)
globe = GLOBE_ALPHA.resize((GLOBE_DIAM, GLOBE_DIAM), Image.LANCZOS)
canvas.paste(globe, ((SIZE - GLOBE_DIAM) // 2, GLOBE_CY - GLOBE_DIAM // 2), globe)

font = ImageFont.truetype(FONT_BOLD, 80)
w_white = font.getbbox("Less ")[2]
w_gold = font.getbbox("Chaos")[2]
x1 = (SIZE - (w_white + w_gold)) // 2
draw.text((x1, 628), "Less ", font=font, fill=WHITE)
draw.text((x1 + w_white, 628), "Chaos", font=font, fill=GOLD)
w2 = font.getbbox("More Coordination")[2]
draw.text(((SIZE - w2) // 2, 722), "More Coordination", font=font, fill=GOLD)

out = Image.new('RGB', (SIZE, SIZE), BG[:3])
out.paste(canvas, mask=canvas.split()[3])
out.save('assets/splash-icon-android.png', 'PNG', optimize=True)
out.save('assets/brand/icons/android-splash-icon.png', 'PNG', optimize=True)

print('OK')
