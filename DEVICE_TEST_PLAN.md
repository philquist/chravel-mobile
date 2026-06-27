# Device Test Plan — App Store pre-submission (chravel-mobile)

Run these on **physical devices** before every submission. The automated suite (`npm test`)
covers the bridge/OAuth/deep-link/purchase-filter/voice logic; this plan covers the on-device
flows a unit test can't exercise. Use the **same devices Apple reviewed on**: iPhone 17 Pro Max
(iOS 26) and iPad Air 11" M3 (iPadOS 26). Install as a **fresh** build (delete any prior version
first) and again as an **update** over the prior version.

> Tip: build with `eas build -p ios --profile preview` (or `production`) and install via TestFlight
> so RevenueCat/IAP and APNs behave like production.

## 1. First-run & onboarding (Guideline 2.1)
- [ ] Cold launch → **Terms & Privacy** consent screen appears; cannot proceed without accepting.
- [ ] Accept → **"Stay in the Loop"** push pre-prompt explains value before the OS prompt.
- [ ] Choose "Maybe Later" → app still fully usable (push is **not** required to function).
- [ ] Relaunch → neither the terms screen nor the pre-prompt reappears.

## 2. Sign in with Apple — the rejection focus (Guideline 2.1(a) / 4.8)
- [ ] Tap **"Continue with Apple"** → a **native** Apple sheet appears (Face/Touch ID), **not** a
      Safari/web page. **iPhone AND iPad** — iPad was specifically called out in the rejection.
- [ ] Complete auth → lands on the **home/dashboard**, NOT back on `/auth` (the prior failure).
- [ ] Force-quit mid-flow and retry → no stuck loading overlay.
- [ ] **Google** sign-in still works (uses the `chravel://` OAuth path, unchanged).
- [ ] **Email** sign-in/up works.
- [ ] After Apple sign-in, account deletion later removes the app from
      **Settings → Apple ID → Sign in with Apple** (verifies the server-side token exchange +
      revocation; requires the Supabase `.p8` secrets to be set — see Part 5).

## 3. In-app purchases (Guideline 3.1.1)
- [ ] Open the subscription/paywall → prices load from RevenueCat (StoreKit), not a web page.
- [ ] Purchase a tier in the **sandbox** → entitlement unlocks; `chravel:purchase-result` success.
- [ ] **Restore Purchases** on a second device / after reinstall → entitlement returns.
- [ ] Confirm **no external Stripe checkout** ever opens on iOS (try every "Upgrade"/"Buy" button,
      incl. Trip Passes) — it must stay in-app or no-op, never open `checkout.stripe.com`.

## 4. Deep links / Universal Links (cross-repo: AASA served by chravel-web)
- [ ] Text yourself `https://chravel.app/trip/<id>` → opens **in the app**, not Safari.
- [ ] Repeat for `/join/<id>`, `/invite/<id>`, `/event/<id>` and a `chravel://` link.
- [ ] Cold-start (app not running) and warm-start (app backgrounded) both route correctly.
- [ ] `curl -sI https://chravel.app/.well-known/apple-app-site-association` → 200, `application/json`,
      no redirect, includes `2T6WY43H3X.com.chravel.app` with the auth-callback + trip paths.

## 5. Push notifications
- [ ] Grant permission via the pre-prompt → device receives a test push (chat message) with the
      correct title/body and, for chats, the thread subtitle.
- [ ] iOS quick actions: **REPLY** (inline text) and **MARK_READ** update state without leaving the app.
- [ ] Badge clears when the app is foregrounded.

## 6. AI Voice Concierge (native audio — justifies 4.2)
- [ ] Tap the AI tab → mic → grant mic permission → speak → transcription + spoken response.
- [ ] **Barge-in**: start speaking while the AI is talking → playback flushes immediately.

## 7. Native share & haptics
- [ ] Share a trip → native iOS share sheet appears with the link/text.
- [ ] Reactions/confirmations produce haptic feedback.

## 8. Resilience / offline (Guideline 4.2 — not a blank-screen wrapper)
- [ ] Enable Airplane Mode and cold-launch → **ErrorScreen** ("Can't reach ChravelApp") with a working
      **Retry**, NOT a blank white screen.
- [ ] Restore network → Retry loads the app.
- [ ] Background the app for several minutes, return → session persists (no forced re-login).

## 9. Account deletion (Guideline 5.1.1) — reachable in-app
- [ ] In-app: Settings/Profile → Account → **Delete Account** is reachable inside the WebView.
- [ ] Complete deletion → signed out; data gone; (Apple users) app removed from Settings → Apple ID.

## 10. Metadata / review parity (Guideline 2.3)
- [ ] Home-screen app name reads **"ChravelApp"** (matches the App Store listing title).
- [ ] `store.config.json` review contact `phone` is a **real, reachable** number (NOT the
      `+1-555-000-0000` placeholder) and the demo account `demo@chravel.app` signs in cleanly.

---

### Sign-off
Record device, OS version, build number, and pass/fail per section before submitting. Any FAIL in
sections 2, 3, or 9 is a hard blocker — those are the guidelines ChravelApp has been rejected under.
