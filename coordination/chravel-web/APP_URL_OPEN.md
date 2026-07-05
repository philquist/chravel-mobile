# Capacitor `App.addListener('appUrlOpen')` — invite deep links (chravel-mobile ↔ chravel-web)

Invite links (`/j/:code` short links and `/join/:code`) opened from outside the
app (Messages, mail, QR, another app) must land in the web SPA **without a full
document reload** — a reload drops React Router's in-memory join context and
re-runs the whole bootstrap. The native shell now delivers these links through
a Capacitor-compatible `App` plugin shim so chravel-web can consume them with
the standard Capacitor API.

## Who owns what

| Piece | Repo | Status |
|---|---|---|
| `window.Capacitor.Plugins.App` shim (`appUrlOpen`, `getLaunchUrl`) | **chravel-mobile** | ✅ Added — `src/bridge.ts` (`buildNativeBootstrapJS`, `buildAppUrlOpenDispatch`) |
| Route `/j/:code` + `/join/:code` deep links through the shim | **chravel-mobile** | ✅ Added — `handleIncomingPath` in `src/ChravelWebView.tsx`, `isJoinPath` in `src/deepLinking.ts` |
| `App.addListener('appUrlOpen', …)` → SPA router `navigate()` | **chravel-web** | ⏳ **Pending** — until it ships, the shell's fallback does a full `window.location.href` navigation (links still work) |
| Serve `/.well-known/apple-app-site-association` covering `/j/*` + `/join/*` | **chravel-web** | ✅ **Verified** — appID `2T6WY43H3X.com.chravel.app` with `/j/*` and `/join/*` in components |
| Serve `/.well-known/assetlinks.json` for `com.chravel.app` | **chravel-web** | ✅ **Verified** — package `com.chravel.app` with SHA-256 fingerprint configured |

## Shim contract (implemented in chravel-mobile)

Injected at document start on both platforms:

```ts
const { App } = (window as any).Capacitor.Plugins;

// event.url is a full https URL, e.g. "https://chravel.app/join/abc?app_context=native"
const handle = await App.addListener('appUrlOpen', (event: { url: string }) => {
  const parsed = new URL(event.url);
  navigate(parsed.pathname + parsed.search + parsed.hash); // React Router — no reload
});

await App.getLaunchUrl(); // Promise<{ url } | undefined> — last URL delivered via the shim
```

Notes for the web implementation:

- **Only `/j/:code` and `/join/:code` arrive via `appUrlOpen`.** All other deep
  links (trips, notification taps, OAuth callbacks) still arrive as full
  navigations — do not expect them in this listener.
- **Fallback is automatic.** If no listener is attached when the link arrives
  (bundle not booted yet, or an old bundle without the listener), the native
  shell falls back to `window.location.href` with the same URL. The listener is
  an optimization, not a requirement — never gate join handling on it.
- The delivered URL carries `app_context=native` (same as all shell
  navigations); strip/ignore it as usual.
- Cold starts: the OS hands the shell the launch URL before the WebView exists,
  so the shell defers it and delivers it (through the same shim path) after the
  web app posts `ready`. `getLaunchUrl()` therefore only returns a value once
  that delivery has happened.

## Domain-association verification (✅ complete)

The domain-association files have been verified against chravel-web's hosted files:

**AASA** (`public/.well-known/apple-app-site-association`):
```json
{
  "applinks": {
    "details": [{
      "appIDs": ["2T6WY43H3X.com.chravel.app"],
      "components": [
        { "/": "/j/*" },
        { "/": "/join/*" },
        … (other paths)
      ]
    }]
  }
}
```

**assetlinks.json** (`public/.well-known/assetlinks.json`):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.chravel.app",
    "sha256_cert_fingerprints": ["2E:31:49:50:..."]
  }
}]
```

Mobile app invariants (locked in tests):
- iOS: `associatedDomains = ["applinks:chravel.app", "applinks:www.chravel.app"]`
- Android: auto-verified intent filters covering `/j/*` and `/join/*` on both hosts
- Bundle/package: `com.chravel.app`

All align correctly. ✅

## Domain-association verification checklist (reference, for future updates)

The app-side halves are locked by tests (`src/__tests__/appConfig.test.ts`):
iOS `associatedDomains` = `applinks:chravel.app` + `applinks:www.chravel.app`,
Android auto-verified intent filters cover `/j` and `/join` on both hosts,
bundle/package = `com.chravel.app`. The server-side halves must match:

```bash
# 1. AASA — must be served on BOTH hosts (each applinks: domain is fetched
#    independently by Apple's CDN), HTTPS, no redirect, Content-Type
#    application/json, no extension:
curl -sSI https://chravel.app/.well-known/apple-app-site-association
curl -sS  https://chravel.app/.well-known/apple-app-site-association
curl -sS  https://www.chravel.app/.well-known/apple-app-site-association
# Expect: { "applinks": { "details": [ { "appIDs": ["<TEAM_ID>.com.chravel.app"],
#   "components": [ { "/": "/j/*" }, { "/": "/join/*" }, ... ] } ] } }
# (or legacy "paths": ["/j/*", "/join/*", ...]) — /j/* and /join/* MUST be listed.
# Apple's CDN view: https://app-site-association.cdn-apple.com/a/v1/chravel.app

# 2. assetlinks — needed for Android App Links autoVerify on both hosts:
curl -sS https://chravel.app/.well-known/assetlinks.json
curl -sS https://www.chravel.app/.well-known/assetlinks.json
# Expect: [{ "relation": ["delegate_permission/common.handle_all_urls"],
#   "target": { "namespace": "android_app", "package_name": "com.chravel.app",
#   "sha256_cert_fingerprints": ["<EAS/Play App Signing SHA-256>"] } }]
# Fingerprint source: Play Console → Setup → App signing (app-signing key),
# or `eas credentials -p android`. Google's checker:
# https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://chravel.app&relation=delegate_permission/common.handle_all_urls
```

If either file is missing a host or the `/j/*` / `/join/*` entries, the OS
opens the link in the browser instead of the app — the shim never gets a
chance to run.
