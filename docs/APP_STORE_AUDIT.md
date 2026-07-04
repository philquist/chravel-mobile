# App Store Resubmission Audit — 2026-07-04

Full-repo audit for the iOS resubmission (Submission 31f5c251 lineage). Companion to
[`APP_STORE_REMEDIATION.md`](./APP_STORE_REMEDIATION.md) — that runbook owns the
step-by-step external prompts (A–F); this document owns the risk matrix, what changed
in this round, and the verification evidence.

**Scope statement:** this audit removes every *known* repo-level blocker. It does not
guarantee acceptance — reviewer interpretation, policy changes, and out-of-repo
configuration (App Store Connect, RevenueCat, provisioning profiles, chravel-web)
remain outside this repo's control. Those items are enumerated under
**External actions**.

## What changed this round (Fixed)

| Fix | Files | Rejection risk closed |
|---|---|---|
| Demo credentials were **broken in production** — docs pointed at `demo@chravel.app` (nonexistent) and the password didn't match the real account | `store.config.json`, `REVIEW_NOTES.md`, `docs/APP_STORE_REMEDIATION.md`, `DEVICE_TEST_PLAN.md`, `CLAUDE.md` + a production password reset (see evidence) | 2.1 / 2.3.10 — reviewer cannot sign in → instant rejection |
| 15s initial-load watchdog; splash now always yields to the app or the retryable ErrorScreen. Also fixes ErrorScreen rendering *underneath* a never-hidden splash when `onError` fires before the first `onLoadEnd` | `src/loadWatchdog.ts` (new), `App.tsx` | 2.1 — infinite splash / hang on launch |
| Main-document HTTP 4xx now surfaces the retryable ErrorScreen (was ≥500 only); sub-resource and third-party errors can no longer be misclassified | `src/httpError.ts` (new), `src/ChravelWebView.tsx`, `src/webViewRequestFilter.ts` | 2.1 — stranded on a blank/error page at `/auth` |
| Apple sign-in **user cancel** now rejects with machine-readable `Error.code === "canceled"` so chravel-web can no-op instead of falling back to browser OAuth (the prior 2.1(a) vector) | `src/appleAuth.ts`, `src/bridge.ts`, `src/ChravelWebView.tsx`, `coordination/chravel-web/NATIVE_APPLE_SIGNIN.md` | 2.1(a) — cancel bounced users into the broken web OAuth flow |
| Privacy manifest now discloses **Audio Data** (AI Concierge streams mic audio off-device) | `app.config.js` | 5.1.1 / 5.1.2 — App Privacy under-disclosure |
| Location consistency: `geolocationEnabled={true}` (Android-only prop) so Android matches iOS and the declared location permissions are truthful; backend confirms live location features (`update-location`, `delete-stale-locations` edge functions) | `src/ChravelWebView.tsx` | 5.1.1 — declared-but-dead capability |
| Stale coordination docs corrected (no `exchange-apple-code` function; native ASAuthorization is real) | `coordination/chravel-web/README.md` | Team executes wrong runbook during a rejection cycle |
| Config invariants locked by tests (privacy manifest, tracking=false, location triple, bundle/entitlement/display-name parity) | `src/__tests__/appConfig.test.ts` (new) + `loadWatchdog`/`httpError`/`appleAuth`/`bridge` test additions | Regression guard |

## Top-25 rejection-risk matrix

Statuses: **Pass** (verified sound) · **Fixed** (this round) · **External** (dashboard/other-repo action, see below) · **N/A**.

| # | Risk | Status | Evidence |
|---|---|---|---|
| 1 | Crash on launch / core flows | Pass | No native crash reports in 4 review rounds; content-process kill auto-recovers (`ChravelWebView.tsx` `onContentProcessDidTerminate`); 283 unit tests green |
| 2 | Broken/incomplete login | Pass / External | Email+Google+Apple paths implemented; chravel-web `/auth-callback` exchange fix is External (Prompt A) |
| 3 | Apple Sign-In missing/broken/non-equivalent | Pass / External | Native ASAuthorization sheet (`src/appleAuth.ts`), iOS-only injection, hashed-nonce contract; provisioning-profile capability check is External (Prompt E #2) |
| 4 | Login/session redirect loops | Fixed / Pass | Cancel no longer falls into web OAuth (`code:"canceled"`); `chravel://auth-callback` custom scheme; `isAuthRedirectRef` reset guards; 2s overlay fallback |
| 5 | Demo credentials invalid | **Fixed** | Production account verified + password reset; all docs corrected to `demo@chravelapp.com` (see evidence) |
| 6 | Backend unavailable / env mismatch | Pass / External | Supabase project ACTIVE_HEALTHY (verified 2026-07-04); prod build hard-fails without RevenueCat keys (`app.config.js` guard); `REVENUECAT_IOS_API_KEY` EAS var is External (Prompt E) |
| 7 | Placeholder content / debug UI | Pass | Repo-wide scan: no TODO/FIXME/lorem/debug surfaces in shipping code |
| 8 | Broken links (privacy/terms/support/deletion) | External (verify) | `chravel.app/privacy`, `/terms` unverifiable from this container (network policy blocks the domain) — verify manually pre-submit; in-app deletion lives in chravel-web Settings |
| 9 | Metadata not matching behavior | Pass | `store.config.json` description matches shipped features; `CFBundleDisplayName` = store title ("ChravelApp", 2.3.7) |
| 10 | IAP misconfig / non-IAP unlocking | Pass / External | Stripe checkout hosts hard-blocked on iOS (`isBlockedPurchaseUrl`, 3.1.1); IAP creation/attachment in ASC is External (Prompts C, F) |
| 11 | Restore purchases missing | Pass | `revenuecat:restore` bridge + `restorePurchases()` (`src/revenuecat.ts`); web UI owns the button |
| 12 | Paywall lacks price/term/renewal clarity | External | Paywall copy lives in chravel-web; verify against StoreKit prices during device QA (`DEVICE_TEST_PLAN.md` §3) |
| 13 | RevenueCat entitlement/product mismatch | External | Entitlement IDs `chravel_explorer` / `chravel_frequent_chraveler` pinned in `src/constants.ts`; dashboard mapping is External (Prompt D) |
| 14 | Account deletion missing | Pass / External | `delete-account` + `process-account-deletions` deployed (verified 2026-07-04); Apple token revocation needs `.p8` secrets — External |
| 15 | Privacy policy inconsistent with data collected | Fixed | Audio Data added to privacy manifest; ASC privacy label must mirror it — External |
| 16 | Missing/vague purpose strings | Pass | All six `NS*UsageDescription` strings specific and feature-tied (`app.config.js`) |
| 17 | Permissions requested too early / no denied fallback | Pass | Push behind user-tapped pre-prompt (`PushPrePrompt.tsx`); mic requested on concierge use; `openAppSettings` bridge for denied states |
| 18 | UGC without moderation/report/block | External | Lives in chravel-web (chat moderation via Stream — `stream-moderation-action` edge function exists, verified 2026-07-04) |
| 19 | Age-rating mismatch | External (verify) | ASC questionnaire item; app is 4+ travel content |
| 20 | Hidden/reviewer-inaccessible features | Pass | No feature flags or remote kill-switches in the shell |
| 21 | Unnecessary signup requirement | Pass | Sign-in is core to group-trip product; demo account provided |
| 22 | Social-login token handling/revocation | Pass / External | Dual-path capture into `apple_auth_tokens` (table verified present); revocation blocked only on `.p8` secrets — External |
| 23 | Private-API misuse / deprecated APIs | Pass | Expo SDK 55 / RN 0.83 stock modules only |
| 24 | Trap states (empty/offline/401/500/loading) | **Fixed** | Watchdog (15s), main-document 4xx→ErrorScreen, 2s overlay fallback, retry re-arms watchdog |
| 25 | Undocumented external-dashboard dependencies | Fixed | This doc + `APP_STORE_REMEDIATION.md` enumerate every one |

## Verification evidence (2026-07-04)

Local validation:

- `npx tsc --noEmit` — clean.
- `npx jest` — **283 tests, 17 suites, all passing** (includes new `loadWatchdog`, `httpError`, `appConfig` suites and the Apple-cancel bridge tests that execute the injected bootstrap JS).
- `react-native-webview` 13.16.1 typings confirm `nativeEvent.url` on the http-error event; `expo-apple-authentication` confirms `ERR_REQUEST_CANCELED` as the cancel code.

Production Supabase (project `jmjiyekmxwsxkfnqwyaa`, status ACTIVE_HEALTHY — read-only checks via MCP, except the one password reset):

- `demo@chravel.app` **does not exist** in `auth.users` → prior docs pointed App Review at un-loginable credentials.
- Real demo account: `demo@chravelapp.com` (user `11ba817d-f0c8-411d-9a75-b1bde6c4df4a`), email confirmed, not banned, profile "Carlton Gold", **30 trip memberships**, last sign-in 2026-07-02.
- Password reset executed with approval: `encrypted_password = crypt('DemoTrip2025!', gen_salt('bf'))`; post-check `password_matches_docs = true`. Existing sessions unaffected. **Anyone using the old password needs the new one.**
- Edge functions deployed: `store-apple-token` (v39), `delete-account`, `process-account-deletions`, `seed-demo-data`, `revenuecat-webhook`, `sync-revenuecat-entitlement`, `update-location`, `delete-stale-locations`, `stream-moderation-action` (+ ~80 others).
- Tables present: `apple_auth_tokens`, `push_device_tokens`.

Re-run these checks any time:

```sql
-- demo account is loginable and seeded
select email, email_confirmed_at is not null as confirmed, banned_until,
       (encrypted_password = crypt('DemoTrip2025!', encrypted_password)) as password_ok
from auth.users where email = 'demo@chravelapp.com';

select count(*) from public.profiles      where user_id = '11ba817d-f0c8-411d-9a75-b1bde6c4df4a'; -- 1
select count(*) from public.trip_members  where user_id = '11ba817d-f0c8-411d-9a75-b1bde6c4df4a'; -- ~30
```

Not verifiable from this environment (container network policy blocks `chravel.app`) — do manually before submitting:

- `https://chravel.app/privacy`, `/terms`, `/auth` return 200 and render.
- Paywall shows live StoreKit prices with period/renewal copy (`DEVICE_TEST_PLAN.md` §3).
- Device pass per `DEVICE_TEST_PLAN.md` (iPhone 17 Pro Max + iPad Air M3 — the reviewed devices).

## Demo account (reviewer-ready)

- **Username:** `demo@chravelapp.com`
- **Password:** `DemoTrip2025!` (also in `store.config.json` review info; rotate after approval — it is committed to the repo)
- **Expected landing:** Home with ~30 pre-populated trips (profile "Carlton Gold")
- **Premium path:** Settings → Billing / Pro (paywall with StoreKit prices; sandbox purchase + Restore Purchases)
- **Reset/seed strategy:** `seed-demo-data` edge function exists for re-seeding; the account is stable and in active team use

## App Review Notes draft (paste into ASC)

> Demo account: `demo@chravelapp.com` / `DemoTrip2025!` — pre-populated with trips, chat, calendar, expenses.
> Test path: Launch → accept Terms → (optional) enable push → Sign in with the demo account → Home → open a trip → Chat / Calendar / Expenses → AI tab → tap mic for the voice concierge (mic permission prompts here) → Share.
> Sign in with Apple runs the native ASAuthorization sheet (Face ID/Touch ID) — no browser round-trip. Canceling the sheet returns to the sign-in screen.
> All subscriptions and Trip Passes are sold via In-App Purchase (RevenueCat/StoreKit): sign in → Settings → Billing / Pro. No external purchase flow is reachable on iOS.
> Support: ops@chravelapp.com · +1 (424) 424-1464

## External actions (in execution order — details in APP_STORE_REMEDIATION.md)

1. **chravel-web (Prompt A + one addition):** native-Apple-exclusive on iOS, fix `/auth-callback` exchange, **and treat `error.code === 'canceled'` from `signInWithApple()` as a no-op** (contract: `coordination/chravel-web/NATIVE_APPLE_SIGNIN.md`).
2. **Supabase (Prompt B):** redirect allow-list incl. `chravel://auth-callback`; Apple provider secret (expires ~Sept 2026); set the five Apple `.p8` edge secrets (revocation currently no-ops without them).
3. **App Store Connect (Prompts C + F):** create IAPs with review screenshots → "Ready to Submit", attach to the version, submit with the binary. Update the **privacy label**: add **Audio Data** (App Functionality, linked); confirm **Precise Location** is declared. Confirm demo credentials `demo@chravelapp.com` / `DemoTrip2025!` in App Review Information. Check **EU trader status** (DSA) is completed if distributing in the EU.
4. **RevenueCat (Prompt D):** product↔entitlement mapping; offering package identifiers must match the web paywall's `packageId` values; grab the `appl_` key.
5. **EAS (Prompt E):** set `REVENUECAT_IOS_API_KEY` (+ Android key, `GOOGLE_SERVICES_JSON`); **verify the distribution provisioning profile includes "Sign in with Apple"** — the most likely one-shot 2.1(a) fix; build + submit.
6. **Post-approval:** rotate the demo password; rotate the exposed Google Maps key (TODO.md).

## Rollback

All changes are plain code/docs — revert the commits on `claude/app-store-resubmission-audit-wrh3vt`; no migrations, no dependency changes. The production password reset is reverted by setting a new password for `demo@chravelapp.com` (the prior password was not recorded anywhere and is unrecoverable by design).

## Remaining risks (stated plainly)

- Everything under **External actions** is outside this repo; the build-58 rejection causes (2.1(a) fallback path, 2.1(b) IAP submission) are only fully closed once Prompts A–F are executed.
- `chravel.app` liveness, paywall copy, and real-device behavior could not be exercised from this environment.
- Reviewer discretion is never guaranteed; this round removes every blocker we can find and control from `chravel-mobile`.
