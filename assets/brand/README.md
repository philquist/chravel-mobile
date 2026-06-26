# Chravel brand assets

Canonical source-of-truth for Chravel's launcher icon, splash, and PWA artwork. This folder is the **only** place brand PNGs should be edited; everything else (Expo `assets/*.png`, ChravelApp `public/*`) is derived from here so that native iOS, native Android, Android 12+ splash circle, and the PWA on both Safari and Chrome stay visually consistent.

## Folder layout

```
assets/brand/
├── source/                                    # masters — edit only these
│   ├── splash-master.png            1536x1024 # gold-globe + "Less Chaos More Coordination"
│   ├── launcher-icon-master.png     1024x1024 # gold C + airplane badge on black (app/launcher icon)
│   ├── splash-icon-master.png       1024x1024 # square globe-ring crop (no tagline)
│   └── splash-icon-master-alpha.png 1024x1024 # globe-ring with alpha-keyed background
├── icons/                                     # native fallback derivatives
│   ├── globe-192.png                 192x192  # square globe (matches A12+ globe-only fallback)
│   ├── globe-512.png                 512x512
│   └── android-splash-icon.png      1024x1024 # globe + tagline (sibling of /assets/splash-icon-android.png)
└── pwa/                                       # drop into ChravelApp/public/
    ├── icon-192.png                  192x192  # standard PWA icon
    ├── icon-512.png                  512x512
    ├── icon-192-maskable.png         192x192  # full-bleed gold (emblem centered in safe zone)
    ├── icon-512-maskable.png         512x512
    ├── apple-touch-icon.png          180x180  # iOS Add-to-Home-Screen
    ├── favicon-32.png                 32x32
    ├── favicon-16.png                 16x16
    └── apple-splash-2732x2048.png   2048x2732 # iPad Pro startup image fallback
```

## What's used where (native, this repo)

| Asset path                                    | Surface                                       |
|-----------------------------------------------|-----------------------------------------------|
| `assets/icon.png`                             | iOS app icon. **Generated** by `regenerate.py` — the gold badge framed at ~90% on black so iOS's own corner-rounding leaves a slim, deliberate dark edge. Flattened to RGB (the App Store rejects icons with an alpha channel). |
| `assets/adaptive-icon.png`                    | Android adaptive launcher **foreground** (wired via `app.config.js` → `android.adaptiveIcon.foregroundImage`, paired with `backgroundColor: "#000000"`). **Generated** by `regenerate.py` — the gold badge framed full-bleed so the launcher's circle/squircle mask fills with gold (no black gaps at the mask midpoints); the emblem stays inside the 66% safe zone. |
| `assets/android-icon-foreground.png`          | Stand-alone adaptive foreground art. Documented layer; **not currently wired** (app.config.js uses `adaptive-icon.png` + a solid `backgroundColor`). |
| `assets/android-icon-background.png`          | Stand-alone adaptive background tile. **Not currently wired.**          |
| `assets/android-icon-monochrome.png`          | Android 13+ themed-icon mono. **Not currently wired.**  |
| `assets/splash-lockup.png`                    | **Active (iOS cold launch only)** — full lockup: globe + gradient `ChravelApp` + white tagline on `#0b0b0f`. Expo iOS splash uses this PNG during cold launch; runtime loading now uses a neutral spinner overlay in `src/ChravelWebView.tsx` (no duplicate branded lockup). |
| `assets/splash-icon-android.png`              | **Active (Android 12+ cold launch only)** — same three elements (globe + gradient `ChravelApp` + tagline) but laid out inside the inscribed circle the OS will clip the splash icon to. Layout measurements (in `regenerate.py`): wordmark center y=560 chord 1018 px (>617 width), tagline bottom y=731 chord 928 px (>828 width with ≈±50 px margin). Rendered via `expo-splash-screen` with `imageWidth: 240`. After native splash handoff, runtime loading uses the neutral spinner overlay (not a second branded lockup). |
| `assets/splash.png`                           | Legacy master composition. No longer wired into runtime; kept as the regenerate.py input for derivatives. |
| `assets/splash-icon.png`                      | Legacy globe-only fallback. No longer wired.  |

`app.config.js` is the single config point — never hand-edit native projects, EAS regenerates them on every build.

## Regenerating derivatives

All PWA derivatives + the Android tagline icon are produced from `source/` via Python + Pillow. Run from repo root:

```bash
pip3 install --quiet Pillow
python3 assets/brand/regenerate.py
```

`assets/brand/regenerate.py` is the canonical, runnable source — read it there rather than relying on a copy here. It is idempotent (running twice is safe) and derives every output below from the `source/` masters: the native app icons (`assets/icon.png`, `assets/adaptive-icon.png`), the PWA set in `pwa/`, the globe fallbacks, and the Android 12+ splash icon. It auto-detects the gold badge inside `launcher-icon-master.png` and re-frames it per platform (see the table above), so the launcher master can stay a badge-on-black render with margin.

## Updating brand artwork

When the design changes:

1. Replace the master PNG(s) in `source/`. Keep the same filenames and dimensions. The launcher master (`launcher-icon-master.png`) may be a gold badge on a pure-black field with margin — `regenerate.py` auto-detects the badge's bounds and re-frames it, so the exact margin in the master doesn't matter.
2. Re-run `python3 assets/brand/regenerate.py`. This now also (re)writes the **native** app icons — `assets/icon.png` (iOS) and `assets/adaptive-icon.png` (Android adaptive foreground) — directly from `source/launcher-icon-master.png`. You no longer hand-copy them.
3. If you change the splash composition, also replace `assets/splash.png` (the legacy `splash-master` mirror) — it is not generated by the script.
4. Copy the regenerated PWA files into `Chravel-Inc/ChravelApp/public/` (see checklist below).
5. No manual version bump is needed to refresh cached splash assets on existing installs — EAS auto-increments the iOS `buildNumber` / Android `versionCode` on every production build (`eas.json`: `appVersionSource: remote` + `autoIncrement`), which already busts the per-build cache token. Do **not** add `versionCode`/`buildNumber` to `app.config.js`; under remote versioning they are ignored.

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

- iOS Safari → share sheet → Add to Home Screen → cold-launch the installed PWA. The icon should be the gold C + airplane badge; the splash should be a dark `#0b0b0f` background centered on the splash artwork (or fall back to the apple-touch-icon centered on dark).
- Android Chrome → install PWA → cold-launch. The install dialog and the standalone window header should both be `#0b0b0f`; the home-screen icon should be the gold C + airplane badge with no white square clipping (maskable variant prevents that).
- DevTools → Application → Manifest: every icon entry resolves to a 200 with the right dimensions.

## Design rules

- **Splash background**: `#0b0b0f` (dark near-black). Matches `expo-splash-screen` plugin `backgroundColor`.
- **Primary brand color**: `#3A60D0` (per `CLAUDE.md`) — used in the WebView, not in launch artwork.
- **Accent gold**: `#c49746` — used for spinner color and tagline highlights.
- **Maskable safe zone**: a `purpose: "maskable"` icon must keep its meaningful content inside the center 40%-radius circle (the OS may crop everything outside it to circle/squircle). The current launcher emblem (gold C + airplane) sits deep in the center, so the maskable variants are rendered **full-bleed gold** — every mask shape fills with gold and the emblem is never clipped. (If a future master pushes detail toward the edges, pull it back in with padding instead.)
- **App-icon framing**: the launcher master is a gold badge on black with margin; `regenerate.py` re-frames it per platform — **iOS** `icon.png` at ~90% width (iOS re-rounds, leaving a slim dark edge; flattened to RGB, no alpha) and **Android** `adaptive-icon.png` full-bleed (the launcher mask shapes it). `app.config.js` sets `android.adaptiveIcon.backgroundColor` to `#000000` to match the black field.
- **Android 12+ splash icon**: anything outside an inscribed circle of diameter = canvas edge will be masked by the OS. Use the `regenerate.py` chord math as a guide before adding text.
- **iOS launch screen**: full 1536x1024 composition, contained on `#0b0b0f` — the entire artwork is visible.

## Why this folder exists

Before this folder, brand assets were tied directly to Expo's `assets/` paths and there was no canonical link to the PWA in the companion repo. That caused two regressions: (1) `assets/splash-icon.png` shipped as the Expo template grid placeholder for months because nobody owned it, and (2) PWA install on iOS / Android still showed a stale or default Chrome icon because there was no source-of-truth to copy from. This folder fixes both by making the masters explicit and the regeneration deterministic.
