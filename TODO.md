# Chravel Mobile — Remaining Work

## Blocked on Chikwendu
- [ ] `VITE_GOOGLE_MAPS_API_KEY` value — need access to Google Cloud Console
- [ ] Rotate Google Maps API key `AIzaSyAz3ra...` in Google Cloud Console (exposed in old repo git history)

## Before Store Submission
- [ ] Set RevenueCat production API keys (iOS + Android) as EAS env vars
- [ ] App Store review — submit with review notes (REVIEW_NOTES.md)
- [ ] Run `npx eas-cli metadata:push` to sync App Store Connect listing from `store.config.json`
- [ ] Update app icon to company logo

## Google Play Store Setup
- [x] Google Play Developer account created (ID: 6532601914148218587)
- [x] GCP service account created + permissions granted
- [x] `GOOGLE_SERVICE_ACCOUNT_JSON` GitHub secret added
- [x] Android CI/CD build job added to eas-build.yml
- [x] Draft Play Console store listing copy — canonical source in `fastlane/metadata/android/en-US/` (2026-04-24)
- [ ] Paste `fastlane/metadata/android/en-US/*.txt` into Play Console → Store presence → Main store listing → en-US
- [ ] Upload Play Console screenshots + feature graphic (still TODO — no automated sync)
- [ ] Complete content rating (IARC questionnaire)
- [ ] Complete data safety section (mirror iOS privacy manifest)
- [ ] Create internal testing track + add testers
- [ ] Upload first AAB (triggers app signing setup — run `eas build --platform android --profile production`)
- [ ] Firebase: create project, add Android app (`com.chravel.app`), download `google-services.json`, enable FCM v1
- [ ] Upload FCM credentials to EAS: `eas credentials --platform android`
- [ ] Supabase: add FCM server key for Android push delivery
- [ ] RevenueCat: add Google Play Store app, upload service account JSON, create matching subscriptions
- [ ] Set `REVENUECAT_ANDROID_API_KEY` EAS env var
- [ ] Deploy `/.well-known/assetlinks.json` on chravel.app for Android App Links (needs SHA-256 from Play Console → App signing)
- [ ] Ensure `/.well-known/assetlinks.json` includes `/auth-callback` App Link support for `com.chravel.app` release SHA-256 (OAuth return path)

## Android — SDK 55 minSdkVersion & version code (decision record, 2026-06-25)
Play Console warns that a new build "no longer supports ~18,500 devices that were supported in your previous release" (Android 5/6, API 21–23). **This is expected and is NOT fixable on this stack — do not try to lower `minSdkVersion` to restore them.**

- **Expo SDK 55 floors `minSdkVersion` at API 24** (the 23→24 bump landed in SDK 52). New Architecture is **mandatory** in SDK 55 — Legacy Arch was removed and `newArchEnabled` is no longer a real config key, so the `newArchEnabled: true` line in `app.config.js` is now vestigial and there is no toggle to drop the floor.
- **The native libraries are compiled for API 24** — RN 0.83's New-Arch runtime and `react-native-purchases` (RevenueCat `purchases-hybrid-common`). Forcing `minSdkVersion: 21` via `expo-build-properties` yields a hard build failure (`"library was built for 24"` / manifest-merger), not a working app.
- **The Play Console message is a non-blocking warning** — the release still publishes; API 21–23 devices stay on their last compatible version.
- To set the floor explicitly (optional, self-documenting only — same coverage): add `["expo-build-properties", { android: { minSdkVersion: 24 } }]` to the `plugins` array. `android.minSdkVersion` at the top level of the Expo config is **not** read by Expo.

**Android `versionCode` is managed remotely by EAS** (`eas.json`: `appVersionSource: remote` + `production.android.autoIncrement: true`), exactly like the iOS `buildNumber` noted above. There is no `versionCode` in `app.config.js` and there should not be one — a local value is ignored under remote versioning. Each production build auto-increments (e.g. the rejected `62` → next build `63` automatically). Inspect/repair with `eas build:version:get|set --platform android --profile production`.

## Security
- [ ] Ensure new repo (Chravel-Inc/ChravelApp) has no secrets in git history

## Push Notifications
- [ ] Test push delivery on physical device

## Deep Linking
- [ ] Test universal links on physical device — AASA is deployed with paths for `/join/*`, `/trip/*`, `/event/*`, `/auth`, `/settings/*`. To test: (1) text yourself a link like `https://chravel.app/join/test123` and tap it — it should open in the app, not Safari. (2) Test cold start: force-quit the app, tap a link, verify the app launches and navigates to the right screen. (3) Test warm start: with the app in background, tap a link and verify it navigates correctly. If Universal Links don't fire, check Settings → Chravel → Associated Domains and ensure `applinks:chravel.app` is listed.
- [ ] Test deep link handling (cold start + warm start)
- [ ] Confirm AASA includes `/auth-callback` and `/auth-callback/*` for `2T6WY43H3X.com.chravel.app` and serves `application/json` with no redirects

## Auth / OAuth Deployment Checklist
- [ ] Supabase Dashboard → Authentication → URL Configuration includes:
  - `https://chravel.app/auth-callback`
  - `chravel://auth-callback`
- [ ] Validate AASA at `https://chravel.app/.well-known/apple-app-site-association` (200, JSON, no redirects)
- [ ] Validate Android App Links at `https://chravel.app/.well-known/assetlinks.json` (200, includes release SHA-256)

## Features
- [ ] Bidirectional mic support — WebView config is in place, needs physical device testing
- [x] Bottom padding for pages in WebView — current `env(safe-area-inset-bottom, 34px)` may need adjustment

## Apple Sign In
- [ ] Apple OAuth secret key expires every 6 months — regenerate before expiry (generated 2026-03-26)
- [ ] Test Apple Sign In on mobile app

### App Store v2.0 build 51 rejection fixes (Submission 31f5c251-…)
- [x] **Guideline 2.5.4** — removed the unused `audio` UIBackgroundMode. It was injected
      by the `expo-audio` plugin (`enableBackgroundPlayback` default true → now `false`) and by
      `@mykin-ai/expo-audio-stream` (unconditional, no opt-out → dropped from the `plugins` array;
      its native module still autolinks for Android PCM capture). `plugins/withNoAudioBackgroundMode.js`
      is a belt-and-suspenders guard. Verified via `expo prebuild -p ios`: generated Info.plist has
      no `UIBackgroundModes` key. Voice is foreground-only (notes + Concierge TTS), so no bg mode is needed.
- [x] **Guideline 2.1(a)** — Apple Sign In now completes on iPad. On iOS 17.4+ the OAuth flow uses an
      `https://chravel.app/auth-callback` ASWebAuthenticationSession callback bound to the
      `webcredentials:chravel.app` Associated Domain, so the redirect returns INTO the app's auth
      session (and then the main WebView runs Supabase `detectSessionInUrl`) instead of opening
      external Safari. Android / iOS < 17.4 keep the `chravel://auth-callback` custom scheme.
      **⚠️ SUPERSEDED in build 53 (see below): the https callback was unreliable on iPhone/iOS 26.5;
      all iOS now uses the `chravel://` custom scheme.**
- [ ] **Verify on physical iPad Air (M3) / iPadOS 26.5**: cold-launch the EAS build → "Continue with
      Apple" → Face/Touch ID → land on the post-auth home route inside the app (not stranded in Safari).
- [ ] **Provisioning**: confirm App ID `com.chravel.app` has "Associated Domains" + "Sign in with Apple"
      capabilities and the production profile includes them (`eas credentials`). Entitlements file
      (verified via prebuild) already declares `applesignin` + `applinks/webcredentials:chravel.app`.
- [ ] Build number auto-increments on the production build (`eas.json`: `appVersionSource: remote` +
      `autoIncrement: buildNumber`) — no manual bump needed. Resubmit manually: `eas build -p ios
      --profile production` then `eas submit -p ios --profile production`, or run the
      `build-and-submit-ios` EAS Workflow from the dashboard. (Builds are no longer triggered on merge to main.)

### App Store v2.0 build 53 rejection fixes (Submission 31f5c251-…, reviewed 2026-06-24)
- [x] **Guideline 2.1(a)** — "back to login after sign in with Apple" (iPhone 17 Pro Max / iOS 26.5).
      Root cause: the build-51 https-callback fix above was unreliable — ASWebAuthenticationSession did
      not consistently return the `https://chravel.app/auth-callback` redirect into the app, so the
      session never reached the main WebView and the user bounced back to /auth.
      Fix: `openOAuthAuthSession` (`ChravelWebView.tsx`) now ALWAYS uses the `chravel://auth-callback`
      custom-scheme callback on every platform / iOS version. ASWebAuthenticationSession (iOS) and
      Custom Tabs (Android) capture a custom-scheme redirect natively and hand it back into the app; the
      main WebView then runs Supabase's PKCE exchange at `/auth-callback`. Removed the now-dead
      `supportsHttpsAuthCallback()` / `HTTPS_OAUTH_CALLBACK_URL`. This keeps the existing Supabase OAuth
      flow, so the Apple `provider_refresh_token` capture for account-deletion revocation (5.1.1(v),
      below) is UNAFFECTED.
- [x] **Guideline 3.1.1** — external (non-IAP) purchase paths. `src/webViewRequestFilter.ts`: on iOS,
      top-frame navigations to `checkout.stripe.com` / `buy.stripe.com` are blocked outright (not
      steered externally), and the `browser:open` bridge handler refuses the same hosts via
      `isBlockedPurchaseUrl()`. RevenueCat IAP stays the only iOS purchase path. (Primary fix is the
      chravel-web button gating; this is the native belt-and-suspenders.)
- [ ] **DEPENDS ON chravel-web (Lovable)**: PKCE (`flowType: 'pkce'`) + a `/auth-callback` page that runs
      `exchangeCodeForSession` and never silently bounces to login. The native callback now lands
      reliably, but the web side must complete the session exchange. Also hide/disable the external
      Stripe checkout buttons on iOS (the 3.1.1 primary fix).
- [ ] **Verify on a physical iPhone (iOS 26+)**: cold-launch → "Continue with Apple" → Face/Touch ID →
      land on the post-auth home route (not /auth). Re-test Google OAuth (same chravel:// path). Confirm
      no external Stripe checkout opens on the iOS billing screen.
- [ ] Confirm Supabase Auth → URL Configuration allows `chravel://auth-callback` (see checklist above) —
      required for the custom-scheme redirect to be accepted.
- [ ] Build number auto-increments (`eas.json`: remote versioning + `autoIncrement: buildNumber`) — no
      manual bump. Build + submit manually (EAS dashboard "Run workflow" or `eas workflow:run` / `eas build`);
      no longer auto-built on merge to main.

### Native Sign in with Apple (`expo-apple-authentication`) — IMPLEMENTED for build 56+ (2.1(a))
After build 55 was rejected AGAIN under 2.1(a) ("unable to leverage Sign in with Apple … no action can
occur"), the browser OAuth round-trip was abandoned for iOS in favor of the native ASAuthorization sheet,
which chravel-web already consumes (PR #746, `attemptNativeAppleSignIn` → `supabase.auth.signInWithIdToken`).
- [x] Add `window.ChravelNative.signInWithApple()` bridge (iOS only) — `src/appleAuth.ts`, `src/bridge.ts`,
      `src/ChravelWebView.tsx`. Generates a raw nonce, sends `SHA256(rawNonce)` to Apple, returns the raw
      nonce + `identityToken` + `authorizationCode`. Android keeps the existing OAuth path (method absent).
- [x] Add `expo-apple-authentication` + `expo-crypto` deps and the `expo-apple-authentication` config
      plugin (entitlement `com.apple.developer.applesignin` + `usesAppleSignIn` were already declared).
- [ ] **Resolves the 5.1.1(v) regression that previously blocked this**: native `signInWithIdToken` yields
      no `provider_refresh_token`. The bridge now returns `authorizationCode`; apply the new
      `coordination/chravel-web/functions/exchange-apple-code/index.ts` edge function (server-side
      authorization-code → refresh-token exchange, reuses `appleClientSecret.ts`) and have chravel-web
      forward `authorizationCode` to it. See `coordination/chravel-web/NATIVE_APPLE_SIGNIN.md`.
- [ ] **Verify on physical iPhone + iPad (iOS 26+)**: "Continue with Apple" shows a NATIVE Apple sheet
      (no Safari) → lands authenticated. Google still uses the existing `chravel://` OAuth path.

### Apple token revocation on account deletion (App Store 5.1.1(v))
Backend lives in the shared "Chravel" Supabase project (`jmjiyekmxwsxkfnqwyaa`) / ChravelApp.
Canonical source committed here: `coordination/chravel-web/` (sync into ChravelApp to avoid drift).
- [x] `apple_auth_tokens` table (service-role-only RLS, encrypted token) — migration applied (2026-06-04)
- [x] `store-apple-token` edge function deployed — captures `provider_refresh_token` at Apple sign-in
- [x] `process-account-deletions` + `delete-account` revoke via `appleid.apple.com/auth/revoke` before deleting `auth.users` (2026-06-04)
- [ ] **Set edge-function secrets** (Dashboard → Edge Functions → Secrets; .p8 NEVER committed):
      `APPLE_P8_PRIVATE_KEY`, `APPLE_KEY_ID`, `APPLE_TEAM_ID=2T6WY43H3X`,
      `APPLE_CLIENT_ID=com.chravel.app`, `APPLE_TOKEN_ENCRYPTION_KEY` (base64 of 32 bytes)
- [ ] **chravel-web**: wire `coordination/chravel-web/web/store-apple-token.snippet.ts` into the web auth bootstrap and deploy (until then, no tokens are captured)
- [ ] Sandbox verification — sign in → delete → confirm app removed from Settings → Apple ID → Sign in with Apple; re-sign-in creates a fresh grant (see `coordination/chravel-web/README.md`)

## Infrastructure
- [ ] Set up staging environment for chravel.app (separate Vercel deploy)
- [ ] ~120 stale Codex branches on GitHub need cleanup

## Testing (Phase 2 — Android deferred)
- [ ] Test push notification registration + delivery
- [ ] Test RevenueCat purchase flow
- [x] Test OAuth flows (Google + Apple) — Google working, Apple enabled (2026-03-26)
- [ ] Test offline → online recovery
- [ ] Test cookie/localStorage persistence across app restarts

## Deferred to v1.1
- [ ] Biometric auth (Face ID / Touch ID) lock screen — implemented then removed to simplify v1.0 launch. Re-add with overlay pattern (not unmounting WebView) + iOS inactive state handling.

## Completed
- [x] Expo project scaffolded with EAS (@chravel/chravel)
- [x] App Store Connect listing created
- [x] Apple Team ID, ASC App ID filled in eas.json
- [x] Admin access on Chravel-Inc/ChravelApp repo
- [x] Push notification pre-prompt screen
- [x] App Store review notes (REVIEW_NOTES.md)
- [x] Refactored App.tsx — extracted ErrorScreen, ChravelWebView
- [x] app.config.js with real EAS project ID
- [x] EAS development build on physical iOS device
- [x] Edge-to-edge WebView with safe area CSS injection
- [x] OAuth working in WebView (Safari user agent)
- [x] Vercel reconnected and deploying from Chravel-Inc/ChravelApp
- [x] TestFlight build submitted
- [x] Android voice capture fixed — `@mykin-ai/expo-audio-stream` for PCM streaming via AudioRecord (2026-04-05)
- [x] Android CI/CD — parallel build-android job in eas-build.yml, auto-submit to Play Store internal track (2026-04-05)
- [x] Platform-conditional user agent — iOS keeps Safari UA for WebView compat, Android uses default Chrome UA (2026-04-05)
- [x] APNs key created and uploaded to EAS + Supabase
- [x] Bridge adapter deployed
- [x] AASA file deployed for universal links
- [x] Google OAuth — opens in Safari, redirects back via chravel:// deep link (2026-03-26)
- [x] OAuth loading overlay — hides marketing page flash during auth (2026-03-26)
- [x] Repeat login support — timestamp in redirect URL prevents iOS dedup (2026-03-26)
- [x] Deep link URL parsing fix — custom scheme hostname correctly extracted (2026-03-26)
- [x] Apple Sign In enabled in Supabase with Service ID + JWT secret (2026-03-26)
- [x] Web app OAuth redirect fix — both providers redirect to /auth instead of landing page (2026-03-26)
- [x] Verify payments in WebView — Stripe domains whitelisted, RevenueCat bridge wired up (2026-03-26)
- [x] Verify Google Maps in WebView — domains whitelisted, geolocation enabled, maps loading (2026-03-26)
- [x] Wired up RevenueCat `identifyUser()` via new `revenuecat:identify` bridge message (2026-03-27)
- [x] Implemented `push:unregister` handler with acknowledgment event (2026-03-27)
- [x] Appended `ChravelNative/1.0` to user agent for web app native detection (2026-03-27)
- [x] Added `onContentProcessDidTerminate` for iOS WebKit crash recovery (2026-03-27)
- [x] Reduced loading overlay timeout from 10s to 5s (2026-03-27)
- [x] Removed production console.log statements (2026-03-27)
- [x] Added unit test suite — jest + ts-jest with tests for bridge, deep linking, notifications (2026-03-27)
- [x] Updated REVIEW_NOTES.md to accurately describe biometric auth behavior (2026-03-27)
