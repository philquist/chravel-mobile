# App Store Remediation Runbook — Build 2.0 (58), Submission 31f5c251

Rejection (2026-06-30, iPad Air 11" M3 / iPadOS 26.5):
- **2.1(a)** — Sign in with Apple shows *"Sign-in didn't complete / Unable to exchange external code: c892."*
- **2.1(b)** — In-App Purchases referenced by the app were not submitted for review.

## Why this keeps happening

The chravel-mobile **native Apple sign-in is already correct and complete** (`src/appleAuth.ts`,
`src/bridge.ts` injects `window.ChravelNative.signInWithApple()` iOS-only via
`injectedJavaScriptBeforeContentLoaded`, `ChravelWebView.tsx` handles `apple:signin`,
`deepLinking.ts` relays `chravel://auth-callback`). The native flow uses
`supabase.auth.signInWithIdToken` — **no redirect, no PKCE** — so it *cannot* emit
"Unable to exchange external code." That error is the **web OAuth fallback** failing, i.e. the
native sheet was **not used** on the reviewer's device. Causes, all **outside this repo**:

1. Production `chravel.app` (**chravel-web** repo) isn't using the native bridge, or its
   `/auth-callback` PKCE exchange is broken.
2. The iOS provisioning profile may be **missing the "Sign in with Apple" capability** →
   native `signInAsync()` throws → silent fallback to the broken web flow.
3. Supabase Auth redirect-URL allow-list may be missing `chravel://auth-callback`.

**2.1(b)** is an App Store Connect submission task: the IAP products were never **attached to the
version + submitted with the binary**, and lack the required **App Review screenshot**. No product
IDs live in this repo — offerings come from RevenueCat at runtime.

## Key identifiers

| Thing | Value |
|---|---|
| App name | ChravelApp |
| Bundle ID | `com.chravel.app` |
| ASC App ID | `6761122822` |
| Apple Team ID | `2T6WY43H3X` |
| Apple account | `ops@chravelapp.com` |
| EAS owner / slug | `meechyourgoals` / `chravel-mobile` |
| Supabase project (Chravel) | `jmjiyekmxwsxkfnqwyaa` |
| RevenueCat entitlements | `chravel_explorer`, `chravel_frequent_chraveler` |
| Web app repo (chravel.app) | `Chravel-Inc/chravel-web` |
| Review demo account | `demo@chravel.app` / `DemoTrip2025!` |

## Execution order

1. **chravel-web** (Prompt A) → PR + deploy.
2. **Supabase** (Prompt B) → redirect URLs + Apple provider.
3. **App Store Connect – create** (Prompt C) → create IAPs + metadata + screenshots → "Ready to Submit".
4. **RevenueCat** (Prompt D) → map products → entitlements/offering; grab iOS API key.
5. **EAS** (Prompt E) → set `REVENUECAT_IOS_API_KEY`, verify "Sign in with Apple" capability, build + submit.
6. **App Store Connect – attach & submit** (Prompt F) → attach IAPs to the new build, submit together.

> Prompts A & B and the "Sign in with Apple" capability check (Prompt E #2) target **2.1(a)**.
> Prompts C, D, E #1, and F target **2.1(b)**. The capability check is the single most likely
> one-shot fix for 2.1(a).

---

## Prompt A — chravel-web repo (Claude Code on `Chravel-Inc/chravel-web`)

> You are in the **chravel-web** repo — the React/Vite web app served at https://chravel.app and wrapped by the chravel-mobile native shell (an Expo WebView). Fix App Store rejection **Guideline 2.1(a)**: on iPhone/iPad, "Continue with Apple" shows *"Sign-in didn't complete — Unable to exchange external code"*. That means the app used the browser OAuth (PKCE) fallback and the code exchange failed, instead of the **native Apple sheet**.
>
> The native shell injects (iOS only, before page load): `window.ChravelNative.signInWithApple(): Promise<{ identityToken, rawNonce, authorizationCode?, email?, fullName? }>`, plus `window.ChravelNative.isNative === true` and `window.ChravelNative.platform === 'ios'`.
>
> Do this:
> 1. Find the Apple sign-in path: search for `attemptNativeAppleSignIn`, `signInWithApple`, `signInWithIdToken`, `signInWithOAuth`, `captureAppleAuthorizationCode`, and the "Continue with Apple" button handler. Map exactly what runs today on iOS-native.
> 2. Ensure the iOS-native button (`window.ChravelNative?.platform === 'ios'`) calls `attemptNativeAppleSignIn()` **first** and uses ONLY the native path: call `window.ChravelNative.signInWithApple()`, then `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce })`. After success, fire-and-forget the `authorizationCode` to `store-apple-token` (don't block UX).
> 3. On iOS-native, **never** fall through to browser `signInWithOAuth`/PKCE for Apple. If the native call throws, show a retriable inline error — do NOT navigate to `/auth` or the "exchange external code" page. Log the underlying error.
> 4. Audit `/auth-callback` and any `exchangeCodeForSession` usage (used by Google + the legacy Apple web path): confirm the Supabase client uses `flowType: 'pkce'`, that `exchangeCodeForSession` is awaited once, that the PKCE `code_verifier` is read from the same persisted storage (localStorage) the initiation wrote, and that failure shows a retry instead of a dead end. Add explicit error logging so "c892"-type failures map to a cause.
> 5. For any remaining web OAuth path, set `redirectTo: 'chravel://auth-callback'` when `window.ChravelNative?.isNative` (the shell rewrites `redirect_to` to this and captures it natively).
> 6. Keep Google + email sign-in unchanged. Run typecheck/tests, then open a PR describing the files changed and confirming the iOS-native Apple button now uses the native sheet exclusively with no browser round-trip.

## Prompt B — Supabase dashboard (browser extension at supabase.com)

> I'm in the Supabase dashboard for the **"Chravel"** project (ref `jmjiyekmxwsxkfnqwyaa`). Make these auth changes for an iOS app (Guideline 2.1(a) fix) and report results:
> 1. **Authentication → URL Configuration.** Site URL = `https://chravel.app`. Redirect-URL allow list must include all of these (add any missing, exact values): `chravel://auth-callback`, `https://chravel.app/auth-callback`, `https://chravel.app/**`, `https://www.chravel.app/**`.
> 2. **Authentication → Providers → Apple.** Confirm it's enabled. Confirm the "Client IDs" field includes `com.chravel.app` (the iOS bundle ID used for native sign-in) and the Services ID if web OAuth is used. Confirm the Secret Key (JWT) is present and not expired (it lasts ~6 months — regenerate if expired). Report the configured Client IDs.
> 3. **Edge Functions → Secrets.** Without printing values, tell me which of these are MISSING (only needed for account-deletion revocation, 5.1.1(v); sign-in works without them): `APPLE_P8_PRIVATE_KEY`, `APPLE_KEY_ID`, `APPLE_TEAM_ID` (should be `2T6WY43H3X`), `APPLE_CLIENT_ID` (should be `com.chravel.app`), `APPLE_TOKEN_ENCRYPTION_KEY`.
> 4. Summarize what you changed and what still needs my input (e.g., the `.p8` key contents — I'll paste those myself).

## Prompt C — App Store Connect: CREATE the IAP products (browser extension at appstoreconnect.apple.com)

> I'm in App Store Connect for **ChravelApp** (bundle `com.chravel.app`, Apple ID `6761122822`). Rejected under **Guideline 2.1(b)** — the In-App Purchases referenced by the app were never submitted. Create the products and make each "Ready to Submit":
> 1. Open the app → **Monetization**. Create a Subscription Group "Chravel Memberships" and add these **auto-renewable subscriptions** (reference name / suggested product ID / price):
>    - Frequent Chraveler / `com.chravel.app.frequent.monthly` / $19.99 monthly
>    - Annual Explorer / `com.chravel.app.explorer.annual` / $99 yearly
>    - Annual Frequent / `com.chravel.app.frequent.annual` / $199 yearly
>    - Starter Pro / `com.chravel.app.pro.starter.monthly` / $49 monthly
>    - Growth Pro / `com.chravel.app.pro.growth.monthly` / $99 monthly
>    Then add the time-limited **Trip Passes** (create as Non-Renewing Subscriptions unless RevenueCat expects Non-Consumables — ask me if unsure):
>    - Explorer Trip Pass / `com.chravel.app.trippass.explorer` / $39.99
>    - Frequent Chraveler Trip Pass / `com.chravel.app.trippass.frequent` / $74.99
>    Skip "Enterprise/Enterprise+" (sales-led, not IAP) — confirm with me before creating anything for it. **Product IDs MUST match what RevenueCat/the app use; if a product already exists, don't duplicate — just complete its metadata.**
> 2. For each product fill ALL required fields: display name, description, price, localization, and (subscriptions) duration. Target state **"Ready to Submit"**, not "Missing Metadata".
> 3. Upload the **required App Review screenshot** for each IAP — a screenshot of that product as shown on the in-app paywall. If I haven't given you one, tell me exactly what to capture (the paywall showing the product + price) and where to upload it.
> 4. Report each product's product ID, type, price, and state, and flag anything still "Missing Metadata". (We will ATTACH them to the app version and submit in a later step, after the new binary uploads.)

## Prompt D — RevenueCat dashboard (browser extension at app.revenuecat.com)

> I'm in RevenueCat for **ChravelApp** (iOS app, bundle `com.chravel.app`). Wire products so the paywall loads StoreKit prices and purchases unlock entitlements (App Store 2.1(b)):
> 1. **Project Settings → Apps → iOS.** Confirm the app exists with bundle `com.chravel.app` and that the App Store Connect **In-App Purchase Key / shared secret** is configured (for receipt validation). Report the **iOS public SDK API key** (starts with `appl_`) — I need it for EAS.
> 2. **Products.** Import/create products matching the App Store Connect product IDs: `com.chravel.app.frequent.monthly`, `com.chravel.app.explorer.annual`, `com.chravel.app.frequent.annual`, `com.chravel.app.pro.starter.monthly`, `com.chravel.app.pro.growth.monthly`, `com.chravel.app.trippass.explorer`, `com.chravel.app.trippass.frequent`.
> 3. **Entitlements.** Ensure exactly these two identifiers exist (the app checks them verbatim): `chravel_explorer` and `chravel_frequent_chraveler`. Attach products: Explorer products → `chravel_explorer`; Frequent Chraveler + Pro + Trip Passes → `chravel_frequent_chraveler` (ask me on any ambiguous mapping).
> 4. **Offerings.** Ensure a **"current"** Offering contains packages for all the above (the app reads `offerings.current.availablePackages`).
> 5. Report the iOS API key, entitlement IDs, offering/package identifiers, and flag any product not yet approved/available in App Store Connect.

## Prompt E — EAS / Expo dashboard (browser extension at expo.dev)

> I'm in the Expo/EAS dashboard for owner **meechyourgoals**, project **chravel-mobile** (iOS bundle `com.chravel.app`, ASC app `6761122822`, Apple team `2T6WY43H3X`). Help me prep and ship a production resubmission:
> 1. **Environment Variables** for the `production` (and `preview`) environment: set `REVENUECAT_IOS_API_KEY = <the appl_… key from RevenueCat>` and `REVENUECAT_ANDROID_API_KEY = <goog_… key or placeholder>`. The production build FAILS without these (enforced in app.config.js).
> 2. **Credentials → iOS → com.chravel.app.** Verify the Distribution provisioning profile includes BOTH capabilities: **"Sign in with Apple"** (`com.apple.developer.applesignin`) and **"Associated Domains"** (`applinks`/`webcredentials:chravel.app`). If "Sign in with Apple" is missing, regenerate the profile to include it — this is the most likely reason the native Apple sheet failed and fell back to the broken web flow on the reviewer's device.
> 3. Confirm remote versioning (buildNumber auto-increments); tell me the next buildNumber.
> 4. Trigger a production build + submit: run the **build-and-submit-ios** EAS Workflow, or give me the exact `eas build -p ios --profile production` then `eas submit -p ios --profile production` commands.
> 5. Report the build URL, resulting build number, and confirm submission to App Store Connect.

## Prompt F — App Store Connect: ATTACH & SUBMIT (browser extension; run AFTER the new build uploads)

> I'm in App Store Connect for **ChravelApp** (`com.chravel.app`, Apple ID `6761122822`). The new build is uploaded. Finish the 2.1(b) fix by submitting the In-App Purchases **with** the binary:
> 1. Open the app version being resubmitted (2.0, newest build) → select the new build.
> 2. In the version page's **"In-App Purchases"** section, click "+" and **attach EVERY product** created earlier (`com.chravel.app.frequent.monthly`, `.explorer.annual`, `.frequent.annual`, `.pro.starter.monthly`, `.pro.growth.monthly`, `.trippass.explorer`, `.trippass.frequent`). This attach step is exactly what was missing.
> 3. In **App Review Information**: confirm demo account `demo@chravel.app` / `DemoTrip2025!` and add the note: *"All subscription and Trip Pass products are sold via In-App Purchase (RevenueCat/StoreKit). To view them: sign in with the demo account → Settings → Billing / Pro."*
> 4. Confirm every IAP is "Ready to Submit" and attached, then **Submit for Review**. Report the final state of each product and the version's submission status.

---

## Reminders
- The `.p8` private key and the real RevenueCat API key are supplied by you — never commit the `.p8`.
- Trip Pass product TYPE (Non-Renewing Subscription vs Non-Consumable) must match what RevenueCat/the web paywall already assume.
- After deploy/build, verify on device per `DEVICE_TEST_PLAN.md` §2 (native Apple sheet, no Safari) and §3 (StoreKit prices, sandbox purchase unlocks entitlement, Restore works).
