# CLAUDE.md — chravel-mobile

## What this repo is

This is the **native mobile shell only** — an Expo/React Native app (~1,500 lines of TypeScript) that wraps the Chravel web platform (`https://chravel.app`) in a WebView and bridges native device capabilities. The actual product UI, business logic, backend, database, AI orchestration, and design system live in the **companion repo**: `Chravel-Inc/ChravelApp`.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Expo / React Native Shell (this repo)          │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │  WebView → https://chravel.app/auth        │ │
│  │  (all product UI comes from the web app)   │ │
│  └──────────────────┬─────────────────────────┘ │
│                     │ JSON bridge protocol       │
│         postMessage ↕ injectJavaScript           │
│  ┌──────────────────┴─────────────────────────┐ │
│  │  Native Modules                            │ │
│  │  ├─ Push Notifications (APNs / FCM)        │ │
│  │  ├─ RevenueCat (in-app subscriptions)      │ │
│  │  ├─ Voice Audio (capture + playback)       │ │
│  │  ├─ Haptics                                │ │
│  │  ├─ Deep Linking (chravel:// + universal)   │ │
│  │  └─ Native Share Sheet                     │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         │
         ▼ Backend (in ChravelApp repo)
   Supabase · Vercel · Stripe · Vertex AI
```

## File map

| File | Role |
|---|---|
| `App.tsx` | Root component — terms, push prompt, error/splash state |
| `src/ChravelWebView.tsx` | **Core** — WebView config, bridge handler, OAuth interception, deep links |
| `src/bridge.ts` | **Core** — bridge protocol types and message building |
| `src/voiceBridge.ts` | Voice audio orchestrator (capture + playback ↔ WebView) |
| `src/revenuecat.ts` | RevenueCat SDK: configure, identify, purchase, restore |
| `src/notifications.ts` | Push notification registration + deep link routing |
| `src/deepLinking.ts` | URL parsing for `chravel://` and `https://chravel.app` |
| `src/webViewRequestFilter.ts` | WebView navigation allowlist + OAuth-authorize URL detection |
| `src/authUrl.ts` | Sign-in route detection (distinguishes `/auth` from substring look-alikes) |
| `src/authRouting.ts` | Ready-state routing for OAuth callbacks + deferred paths; auth-surface mapping |
| `src/loadWatchdog.ts` | 15s initial-load watchdog — guarantees the splash always yields to the app or the ErrorScreen |
| `src/httpError.ts` | Main-document HTTP-error classification (4xx/5xx on chravel.app → ErrorScreen; sub-resources ignored) |
| `src/haptics.ts` | Haptic feedback trigger |
| `src/constants.ts` | URLs, entitlement IDs, push types |
| `src/ErrorScreen.tsx` | Network error UI with retry |
| `src/PushPrePrompt.tsx` | Push notification opt-in screen |
| `src/TermsAgreement.tsx` | Terms & privacy acceptance screen |
| `src/audio/capture.ts` | Microphone recording — iOS: 200ms chunks via expo-audio; Android: PCM streaming via expo-audio-stream |
| `src/audio/androidCapture.ts` | Android-specific PCM capture using @mykin-ai/expo-audio-stream |
| `src/audio/playback.ts` | Audio playback — gapless queue, barge-in, 24kHz |
| `src/audio/utils.ts` | WAV header generation, base64 conversion, RMS calculation |
| `src/audio/constants.ts` | Audio sample rates and intervals |
| `app.config.js` | Expo config: permissions, deep links, privacy manifest, entitlements |
| `plugins/withNoAudioBackgroundMode.js` | Local config plugin — strips the unused `audio` UIBackgroundMode from iOS Info.plist (App Store Guideline 2.5.4; voice is foreground-only) |
| `eas.json` | EAS build profiles (dev, preview, production) + submit config |
| `store.config.json` | App Store Connect listing (title, subtitle, description, keywords, review info) — push with `npx eas-cli metadata:push` |
| `fastlane/metadata/android/en-US/` | Play Store listing copy (title, short/full description) — canonical source; paste into Play Console manually (EAS Metadata does not support Google Play) |
| `.github/workflows/eas-build.yml` | CI only: tests + TypeScript + platform smoke on push to main. Does **not** build — no EAS credits spent. |
| `.eas/workflows/build-and-submit-ios.yml` | EAS Workflow: build iOS + submit to TestFlight. **Manual-only** (`workflow_dispatch`) — run from the EAS dashboard or `eas workflow:run`. |
| `.eas/workflows/build-and-submit-android.yml` | EAS Workflow: build Android + submit to Play Store. **Manual-only** (`workflow_dispatch`) — run from the EAS dashboard or `eas workflow:run`. |

## Bridge protocol contract

Any changes here **must** be coordinated with the web app in `ChravelApp`.

### Web → Native (via `window.ReactNativeWebView.postMessage`)

| Message type | Payload | Purpose |
|---|---|---|
| `ready` | — | Web app finished loading |
| `haptic` | `style: light\|medium\|heavy\|success\|warning\|error` | Trigger haptic feedback |
| `push:register` | — | Request native push token (fires `chravel:push-token`) |
| `push:unregister` | — | Revoke push registration |
| `push:checkPermissions` | `requestId` | Query push permission without prompting; native replies by resolving the `PushNotifications` shim promise (`{ receive }`) |
| `push:requestPermissions` | `requestId` | Request push permission (OS prompt); native resolves the shim promise (`{ receive }`) |
| `apple:signin` | `requestId` | **iOS only.** Run the native Apple `ASAuthorization` sheet; native resolves the `signInWithApple()` promise with `{ identityToken, rawNonce, authorizationCode?, email?, fullName? }` (or rejects — a user cancel rejects with `Error.code === "canceled"` so the web treats it as a no-op instead of falling back to browser OAuth). Avoids the browser OAuth round-trip Apple rejects under Guideline 2.1(a). |
| `openAppSettings` | — | Open the iOS app settings page (denied-permission UX) |
| `openNotificationSettings` | — | Open notification settings (falls back to app settings on iOS) |
| `revenuecat:identify` | `userId` | Link Supabase user to RevenueCat |
| `revenuecat:purchase` | `packageId` | Purchase a subscription |
| `revenuecat:restore` | — | Restore purchases |
| `revenuecat:getCustomerInfo` | — | Get active entitlements |
| `share` | `text?, url?, title?` | Open native share sheet |
| `voice:request-permission` | — | Request microphone permission |
| `voice:start-capture` | — | Begin audio recording |
| `voice:stop-capture` | — | Stop audio recording |
| `voice:play-audio` | `audio (base64), sampleRate?` | Play AI response audio |
| `voice:flush-playback` | — | Stop playback + clear queue (barge-in) |

### Native → Web (via `window.dispatchEvent(new CustomEvent(...))`)

| Event name | Detail | Purpose |
|---|---|---|
| `chravel:native-ready` | — | Native shell initialized |
| `chravel:push-token` | `token, platform, error?` | Push token result (`platform`: `ios`\|`android`; iOS token is APNs, Android is FCM). Emitted on web-driven `push:register` **and** proactively on launch if permission is already granted. The web app owns the `push_device_tokens` upsert (`platform`, `disabled_at: null`). |
| `chravel:push-unregistered` | `success` | Unregistration ack |
| `chravel:purchase-result` | `success, error?` | Purchase outcome |
| `chravel:restore-result` | `success, error?` | Restore outcome |
| `chravel:customer-info` | `entitlements[]` | Active entitlements |
| `chravel:voice-permission` | `granted, canAskAgain` | Mic permission result |
| `chravel:voice-audio-data` | `audio (base64), rms, timestamp` | Mic chunk captured |
| `chravel:voice-capture-started` | — | Recording started |
| `chravel:voice-capture-stopped` | — | Recording stopped |
| `chravel:voice-playback-rms` | `rms` | Playback volume level |
| `chravel:voice-playback-complete` | — | Queue drained |
| `chravel:voice-playback-flushed` | — | Barge-in complete |
| `chravel:voice-error` | `error, code` | Audio pipeline error |
| `chravel:notification-action` | `action, userText?, type?, tripId?, threadId?` | iOS quick-action tapped on a push (REPLY / MARK_READ). Inline actions do NOT deep-link nav — the web app updates state in place. |

### APNs / FCM payload contract

The backend (in `Chravel-Inc/ChravelApp`) generates these payloads from Supabase notification rows. Categories and channel IDs are registered by the native shell on first launch (`src/notifications.ts`).

**iOS (APNs):**
```
aps: {
  alert: { title, body, subtitle? },          // subtitle = chat thread name for chat_message
  category: "CHAT_MESSAGE" | "BROADCAST" | "BROADCAST_PINNED",
  thread-id: "<tripId>" for broadcasts, "<threadId>" for chats,  // iOS uses this for grouping
  sound: "default",
  badge: <n>,
  mutable-content: 1                          // allow Notification Service Extension to mutate
}
data: { type, tripId, threadId?, eventId?, pollId?, taskId? }
```

**Android (FCM):**
```
data: { type, tripId, threadId?, eventId?, pollId?, taskId? }
notification: {
  title,
  body,
  channel_id: getChannelForPushType(type)     // "chat-messages" | "important-updates" | "default"
}
```

`getChannelForPushType` is exported from `src/notifications.ts` and is the single source of truth for the channel mapping.

### Injected globals

The native shell injects these before page load (`buildInjectedJS` in `bridge.ts`):
- `window.ChravelNative` — `{ platform: "ios"|"android", isNative: true, version: "1.0.0", isTablet, openOAuthUrl(url), openAppSettings(), openNotificationSettings(), signInWithApple()? }` (`signInWithApple()` is injected **iOS only** — returns `Promise<{ identityToken, rawNonce, authorizationCode?, email?, fullName? }>`; consumed by chravel-web `attemptNativeAppleSignIn`, which falls back to web OAuth when the method is absent. A user cancel rejects with `Error.code === "canceled"` and must be treated as a no-op, not a fallback — see `coordination/chravel-web/NATIVE_APPLE_SIGNIN.md`)
- `window.ChravelNativeAudio` — `{ isAvailable, requestPermission(), startCapture(), stopCapture(), playAudio(base64, sampleRate), flushPlayback() }`
- `window.Capacitor` — `{ isNativePlatform(): true, Plugins: { Browser, PushNotifications, App } }`

#### `window.Capacitor.Plugins.PushNotifications`

Capacitor-compatible push shim consumed by chravel-web (implements the contract
from **chravel-web PR #683** — `src/lib/nativePushBridge.ts` — which reads the
plugin from `window.Capacitor.Plugins.PushNotifications` rather than bundling
`@capacitor/push-notifications`):

| Method | Returns | Notes |
|---|---|---|
| `checkPermissions()` | `Promise<{ receive }>` | `receive`: `granted` \| `denied` \| `prompt` (iOS provisional → `granted`). Routed through `push:checkPermissions`. |
| `requestPermissions()` | `Promise<{ receive }>` | Shows the OS prompt. Routed through `push:requestPermissions`. |
| `register()` | `Promise<void>` | Posts `push:register`; the token is delivered asynchronously to the `registration` listener. |
| `addListener(event, cb)` | `Promise<{ remove() }>` | `event`: `registration` \| `registrationError`. Listeners may be attached **before** `register()`. The last result is replayed to listeners added after the token arrived (covers proactive on-launch registration and app restart). |
| `removeAllListeners()` | `Promise<void>` | Clears all listeners. |

Events fired to listeners:
- `registration` → `{ value: "<token>" }` — the native device token (**APNs on iOS, FCM on Android**, from `getDevicePushTokenAsync()`).
- `registrationError` → `{ error: "<message>" }`.

The shim is a thin translator: the native side keeps emitting the existing
`chravel:push-token` event (via `emitPushToken` in `ChravelWebView.tsx`), and the
injected shim re-dispatches it as `registration` / `registrationError`. No
Capacitor or Firebase SDK is bundled in this repo. The web app owns the
`push_device_tokens` upsert once it receives the token.

#### `window.Capacitor.Plugins.App`

Capacitor-compatible App shim for deep-link delivery. chravel-web attaches
`App.addListener('appUrlOpen', ({ url }) => …)` and routes the URL through its
SPA router (React Router `navigate`) — no full document reload.

| Method | Returns | Notes |
|---|---|---|
| `addListener('appUrlOpen', cb)` | `Promise<{ remove() }>` | `cb` receives `{ url }` — a full `https://chravel.app/...` URL. |
| `removeAllListeners()` | `Promise<void>` | Clears all listeners. |
| `getLaunchUrl()` | `Promise<{ url } \| undefined>` | Last URL delivered through the shim (undefined before any delivery). |

Native side: `handleIncomingPath` (`ChravelWebView.tsx`) routes **invite-join
links only** (`/j/:code`, `/join/:code` — `isJoinPath` in `deepLinking.ts`)
through the shim via `buildAppUrlOpenDispatch` (`bridge.ts`). If no `appUrlOpen`
listener is attached (older web bundle, or the link raced page bootstrap), the
injected JS falls back to a full `window.location.href` navigation so the link
is never dropped. All other deep links (trips, notification taps, OAuth
callbacks) keep the full-navigation path via `navigateWebView`.

## Commands

```bash
npm start          # Expo dev server
npm run ios        # Run on iOS
npm run android    # Run on Android
npm test           # Jest unit tests (27 tests across 3 files)
```

Build & deploy is handled by EAS (see CI/CD section).

## Tech stack

- **Expo SDK 55** / React Native 0.83.2 / React 19.2.0
- **TypeScript 5.9.2** (strict mode)
- **react-native-webview 13.16.1** — hosts the web app
- **react-native-purchases 9.14.0** — RevenueCat subscriptions
- **expo-audio** — voice capture (iOS) + playback (both platforms) for Gemini Live
- **@mykin-ai/expo-audio-stream 0.3.x** — voice capture on Android (PCM streaming via AudioRecord)
- **expo-notifications** — APNs/FCM push
- **Jest 30.3.0 + ts-jest** — testing

## Environment variables

| Variable | Where used | Purpose |
|---|---|---|
| `REVENUECAT_IOS_API_KEY` | `app.config.js` → `revenuecat.ts` | RevenueCat iOS key (client-safe) |
| `REVENUECAT_ANDROID_API_KEY` | `app.config.js` → `revenuecat.ts` | RevenueCat Android key (client-safe) |
| `EXPO_TOKEN` | GitHub Actions secret | EAS CI authentication |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GitHub Actions secret | Google Play submit (service account key JSON) |

No `.env` files are committed. RevenueCat keys are public client-side keys by design.

## CI/CD

**Push to `main` runs free CI only — no builds, no EAS credits spent.**
Builds are **manual / on-demand** so updates to this repo don't burn EAS build credits.

```
Push to main → GitHub Actions → tests + TypeScript + platform smoke   (free, no build)

Ship a build (manual, when you choose):
  EAS dashboard "Run workflow"  OR  eas workflow:run build-and-submit-ios.yml
                                    eas workflow:run build-and-submit-android.yml
  → EAS Build → auto-submit (iOS → TestFlight, Android → Play Store production)
```

- **CI workflow:** `.github/workflows/eas-build.yml` — `test` + `platform-smoke` jobs only.
- **Build workflows:** `.eas/workflows/build-and-submit-{ios,android}.yml` — `workflow_dispatch`
  (manual). Each builds then submits in one run. Trigger from the EAS dashboard or
  `eas workflow:run <file>`. You can also build straight from the CLI:
  `eas build --platform ios --profile production` (then `eas submit` if you want to ship it).
- Versions auto-increment on each production build (`appVersionSource: remote` in `eas.json`).
- **No preview/PR builds. No build-on-push.**

## Conventions

- Functional components only, no class components
- `StyleSheet.create()` for all styling — no Tailwind, no CSS-in-JS
- Colors hardcoded: `#191817` (bg), `#3A60D0` (primary), `#FFFFFF` (text), `#999999` (muted)
- No React Navigation — routing is WebView URL-based via `navigateWebView(path)`
- No global state — `useState`/`useRef` only, no Redux/Zustand/Context
- Adding a new bridge capability: (1) add type to union in `bridge.ts`, (2) add handler in `ChravelWebView.tsx` switch, (3) optionally add response event
- Tests go in `src/__tests__/` with `.test.ts` extension

## Known limitations

- **Android voice capture** uses `@mykin-ai/expo-audio-stream` instead of `expo-audio` (Android's MediaRecorder has no PCM WAV output)
- **No offline support** — blank screen without internet
- **No crash reporting** — no Sentry/Bugsnag/Crashlytics
- **No staging environment** — web app changes go to production
- **No analytics** in the native shell
- **2-second loading timeout** — hardcoded fallback in `scheduleLoadingFallback` (`ChravelWebView.tsx`); separately, a **15-second initial-load watchdog** (`src/loadWatchdog.ts`, wired in `App.tsx`) drops the splash to the retryable ErrorScreen if the first load neither ends nor errors

## Security notes

- **Apple OAuth secret expires ~September 2026** (generated 2026-03-26, 6-month lifespan) — see `TODO.md`
- **Apple token revocation on account deletion (App Store 5.1.1(v))** — Apple sign-in runs through Supabase WebView OAuth (no native ASAuthorization). The Apple refresh token is captured server-side from `session.provider_refresh_token` (`store-apple-token` edge function), stored encrypted in the `apple_auth_tokens` table (service-role-only), and revoked via `appleid.apple.com/auth/revoke` by both `process-account-deletions` and `delete-account` before `auth.users` is deleted. Backend canonical source: `coordination/chravel-web/` (sync into ChravelApp). Requires edge secrets `APPLE_P8_PRIVATE_KEY` / `APPLE_KEY_ID` / `APPLE_TEAM_ID` / `APPLE_CLIENT_ID` / `APPLE_TOKEN_ENCRYPTION_KEY` — **the .p8 must never be committed.**
- **Demo credentials** in `REVIEW_NOTES.md` — `demo@chravelapp.com` for App Store review. Rotate after review.
- **Google Maps API key exposed in old repo git history** — `TODO.md` says it needs rotation
- **Ensure `Chravel-Inc/ChravelApp` has no secrets in git history** — flagged in `TODO.md`
- Bridge message parsing does type assertion without shape validation (`bridge.ts` line 123) — low risk since WebView only loads `chravel.app`

## Companion repo

The actual product lives at **`Chravel-Inc/ChravelApp`** — that's where the web app, Supabase backend, edge functions, AI orchestration, database migrations, and design system are. The only coupling point between repos is the bridge protocol documented above. Changes to bridge message types or `window.ChravelNative`/`window.ChravelNativeAudio` APIs must be coordinated across both repos.
