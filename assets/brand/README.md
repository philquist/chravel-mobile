# Chravel brand assets

Canonical source-of-truth for Chravel's launcher icon, splash, and PWA artwork. This folder is the **only** place brand PNGs should be edited; everything else (Expo `assets/*.png`, ChravelApp `public/*`) is derived from here so that native iOS, native Android, Android 12+ splash circle, and the PWA on both Safari and Chrome stay visually consistent.

## Folder layout

```
assets/brand/
├── source/                                    # masters — edit only these
│   ├── splash-master.png            1536x1024 # gold-globe + "Less Chaos More Coordination"
│   ├── launcher-icon-master.png     1024x1024 # white-bg globe collage (app/launcher icon)
│   ├── splash-icon-master.png       1024x1024 # square globe-ring crop (no tagline)
│   └── splash-icon-master-alpha.png 1024x1024 # globe-ring with alpha-keyed background
├── icons/                                     # native fallback derivatives
│   ├── globe-192.png                 192x192  # square globe (matches A12+ globe-only fallback)
│   ├── globe-512.png                 512x512
│   └── android-splash-icon.png      1024x1024 # globe + tagline (sibling of /assets/splash-icon-android.png)
└── pwa/                                       # drop into ChravelApp/public/
    ├── icon-192.png                  192x192  # standard PWA icon
    ├── icon-512.png                  512x512
    ├── icon-192-maskable.png         192x192  # 20% safe-zone padded
    ├── icon-512-maskable.png         512x512
    ├── apple-touch-icon.png          180x180  # iOS Add-to-Home-Screen
    ├── favicon-32.png                 32x32
    ├── favicon-16.png                 16x16
    └── apple-splash-2732x2048.png   2048x2732 # iPad Pro startup image fallback
```

## What's used where (native, this repo)

| Asset path                                    | Surface                                       |
|-----------------------------------------------|-----------------------------------------------|
| `assets/icon.png`                             | iOS app icon                                  |
| `assets/adaptive-icon.png`                    | Android launcher (legacy / non-adaptive)      |
| `assets/android-icon-foreground.png`          | Android adaptive launcher foreground          |
| `assets/android-icon-background.png`          | Android adaptive launcher background tile     |
| `assets/android-icon-monochrome.png`          | Android 13+ themed-icon mono (not yet wired)  |
| `assets/splash-lockup.png`                    | **Active** — iOS + Android cold-launch splash AND in-app loading overlay (full lockup: globe + gradient `ChravelApp` + tagline). Single source of truth, no visual seam at hand-off. |
| `assets/splash.png`                           | Legacy master composition. No longer wired into runtime; kept as the regenerate.py input for derivatives. |
| `assets/splash-icon-android.png`              | Legacy Android 12+ icon (globe + tagline burned in). No longer wired — superseded by the lockup. |
| `assets/splash-icon.png`                      | Legacy globe-only fallback. No longer wired.  |

`app.config.js` is the single config point — never hand-edit native projects, EAS regenerates them on every build.

## Regenerating derivatives

All PWA derivatives + the Android tagline icon are produced from `source/` via Python + Pillow. Run from repo root:

```bash
pip3 install --quiet Pillow
python3 assets/brand/regenerate.py
```

If `regenerate.py` doesn't exist yet, paste the script below into it. The script is idempotent — running twice is safe.

```python
# assets/brand/regenerate.py
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
# All visible content stays inside an inscribed circle of diameter 1024 — verified
# by chord math: at y=628 chord=998px, at y=722 chord=935px; tagline width=711px.
SIZE = 1024
GLOBE_DIAM = 470
GLOBE_CY = 312
canvas = Image.new('RGBA', (SIZE, SIZE), BG)
draw = ImageDraw.Draw(canvas)
globe = GLOBE_ALPHA.resize((GLOBE_DIAM, GLOBE_DIAM), Image.LANCZOS)
canvas.paste(globe, ((SIZE - GLOBE_DIAM) // 2, GLOBE_CY - GLOBE_DIAM // 2), globe)

font = ImageFont.truetype(FONT_BOLD, 80)
# Line 1: "Less " white + "Chaos" gold
w_white = font.getbbox("Less ")[2]
w_gold = font.getbbox("Chaos")[2]
x1 = (SIZE - (w_white + w_gold)) // 2
draw.text((x1, 628), "Less ", font=font, fill=WHITE)
draw.text((x1 + w_white, 628), "Chaos", font=font, fill=GOLD)
# Line 2: "More Coordination" all gold
w2 = font.getbbox("More Coordination")[2]
draw.text(((SIZE - w2) // 2, 722), "More Coordination", font=font, fill=GOLD)

out = Image.new('RGB', (SIZE, SIZE), BG[:3])
out.paste(canvas, mask=canvas.split()[3])
out.save('assets/splash-icon-android.png', 'PNG', optimize=True)
out.save('assets/brand/icons/android-splash-icon.png', 'PNG', optimize=True)

print('OK')
```

## Updating brand artwork

When the design changes:

1. Replace the master PNG(s) in `source/`. Keep the same filenames and dimensions.
2. Re-run `python3 assets/brand/regenerate.py`.
3. Replace `assets/icon.png`, `assets/adaptive-icon.png`, and `assets/splash.png` if they need to change too — they are the same as `source/launcher-icon-master.png` and `source/splash-master.png` and must be updated together.
4. Copy the regenerated PWA files into `Chravel-Inc/ChravelApp/public/` (see checklist below).
5. Bump `versionCode` (Android) and `buildNumber` (iOS) in `app.config.js` so cached splash assets are refreshed on existing installs.

## ChravelApp drop-in checklist (PWA on iOS Safari + Android Chrome)

The PWA branding lives in the companion `Chravel-Inc/ChravelApp` repo, not here. To bring its install-to-home-screen experience in line with native:

### 1. Copy files

Copy the contents of `assets/brand/pwa/` into `ChravelApp/public/` (or wherever `ChravelApp` serves static files — search for an existing `favicon.ico` to find it):

- `icon-192.png`
- `icon-512.png`
- `icon-192-maskable.png`
- `icon-512-maskable.png`
- `apple-touch-icon.png`
- `favicon-32.png`
- `favicon-16.png`
- `apple-splash-2732x2048.png`

### 2. Update the web manifest

`ChravelApp/public/manifest.webmanifest` (create if missing):

```json
{
  "name": "Chravel",
  "short_name": "Chravel",
  "description": "Less chaos, more coordination.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0b0f",
  "theme_color": "#0b0b0f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 3. Update HTML head

In ChravelApp's root layout / `index.html`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="apple-touch-startup-image" href="/apple-splash-2732x2048.png" />
<meta name="theme-color" content="#0b0b0f" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Chravel" />
```

### 4. Verify

After deploying:

- iOS Safari → share sheet → Add to Home Screen → cold-launch the installed PWA. The icon should be the gold globe; the splash should be a dark `#0b0b0f` background centered on the gold-globe artwork (or fall back to the apple-touch-icon centered on dark).
- Android Chrome → install PWA → cold-launch. The install dialog and the standalone window header should both be `#0b0b0f`; the home-screen icon should be the gold-globe collage with no white square clipping (maskable variant prevents that).
- DevTools → Application → Manifest: every icon entry resolves to a 200 with the right dimensions.

## Design rules

- **Splash background**: `#0b0b0f` (dark near-black). Matches `expo-splash-screen` plugin `backgroundColor`.
- **Primary brand color**: `#3A60D0` (per `CLAUDE.md`) — used in the WebView, not in launch artwork.
- **Accent gold**: `#c49746` — used for spinner color and tagline highlights.
- **Maskable safe zone**: 20% padding on all sides for any icon flagged `purpose: "maskable"`. Android home-screen masks crop to circle/squircle; padding ensures the artwork survives.
- **Android 12+ splash icon**: anything outside an inscribed circle of diameter = canvas edge will be masked by the OS. Use the `regenerate.py` chord math as a guide before adding text.
- **iOS launch screen**: full 1536x1024 composition, contained on `#0b0b0f` — the entire artwork is visible.

## Why this folder exists

Before this folder, brand assets were tied directly to Expo's `assets/` paths and there was no canonical link to the PWA in the companion repo. That caused two regressions: (1) `assets/splash-icon.png` shipped as the Expo template grid placeholder for months because nobody owned it, and (2) PWA install on iOS / Android still showed a stale or default Chrome icon because there was no source-of-truth to copy from. This folder fixes both by making the masters explicit and the regeneration deterministic.
