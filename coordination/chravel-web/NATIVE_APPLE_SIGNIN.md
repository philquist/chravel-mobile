# Native Sign in with Apple — coordination (chravel-mobile ↔ chravel-web ↔ Supabase)

App Store **Guideline 2.1(a)**: the browser OAuth round-trip
(`ASWebAuthenticationSession`) for Apple sign-in strands users on iPhone/iPad
("no action can occur" / "did not proceed"). The fix is to run the **native
Apple sheet** (`ASAuthorization`) in the shell and authenticate the web app with
`supabase.auth.signInWithIdToken` — no browser.

## Who owns what

| Piece | Repo | Status |
|---|---|---|
| `window.ChravelNative.signInWithApple()` native bridge | **chravel-mobile** | ✅ Added (this change) — `src/appleAuth.ts`, `src/bridge.ts`, `src/ChravelWebView.tsx` |
| `attemptNativeAppleSignIn()` → `signInWithIdToken` + web OAuth fallback | **chravel-web** | ✅ Already shipped (PR #746) |
| `exchange-apple-code` edge function (native code → Apple refresh token) | **ChravelApp / Supabase** | ⏳ Apply `functions/exchange-apple-code/index.ts` from this folder |
| Forward `authorizationCode` to `exchange-apple-code` after native sign-in | **chravel-web** | ⏳ Small addition (see below) |

## Bridge contract (implemented in chravel-mobile)

`window.ChravelNative.signInWithApple()` is injected **iOS-only**. It returns:

```ts
Promise<{
  identityToken: string;
  rawNonce: string;          // RAW nonce; shell already sent SHA256(rawNonce) to Apple
  authorizationCode?: string; // forward to exchange-apple-code for revocation capture
  email?: string;            // first authorization only
  fullName?: string;         // first authorization only
}>
```

It rejects on cancel/unavailable/missing token; chravel-web's
`attemptNativeAppleSignIn` already treats a throw as `{ handled:false }` and
falls back to the existing browser OAuth flow. On Android the method is **not**
injected, so the web keeps its OAuth path unchanged.

The web passes `identityToken` + `rawNonce` to
`supabase.auth.signInWithIdToken({ provider:'apple', token, nonce: rawNonce })`.
Supabase re-hashes the raw nonce and matches it against the id-token's `nonce`
claim.

## Why `exchange-apple-code` is required (Guideline 5.1.1(v))

The id-token flow does **not** yield Supabase's `provider_refresh_token`, so the
existing `store-apple-token` capture has nothing to persist and account-deletion
revocation would silently no-op. `exchange-apple-code` performs the Apple
authorization-code → refresh-token exchange **server-side** (reusing
`_shared/appleClientSecret.ts`) and stores the encrypted refresh token in
`apple_auth_tokens`, so `delete-account` / `process-account-deletions` keep
revoking via `appleid.apple.com/auth/revoke` unchanged.

## chravel-web change needed (small)

After a **successful native** Apple sign-in (i.e. `attemptNativeAppleSignIn`
returned `handled:true`), call the new function with the captured code:

```ts
// once the signInWithIdToken session exists and we have a bearer token:
if (native.handled && native.authorizationCode) {
  await supabase.functions.invoke('exchange-apple-code', {
    body: { authorizationCode: native.authorizationCode },
  });
}
```

This mirrors how the web OAuth path calls `store-apple-token` today. It is
best-effort: a failure must not block sign-in.

## Deploy order

1. Apply `functions/exchange-apple-code/index.ts` to ChravelApp and deploy it
   (`verify_jwt: true`). Secrets are the **same** ones `store-apple-token` /
   revocation already use — no new secrets:
   `APPLE_P8_PRIVATE_KEY`, `APPLE_KEY_ID`, `APPLE_TEAM_ID`, `APPLE_CLIENT_ID`
   (= `com.chravel.app`), `APPLE_TOKEN_ENCRYPTION_KEY`.
2. Ship the chravel-web `exchange-apple-code` invoke above.
3. Ship the chravel-mobile build with the native bridge.

## Sandbox verification

1. iOS device → "Continue with Apple" → confirm a **native Apple sheet** (no
   Safari) → lands authenticated.
2. `select user_id from public.apple_auth_tokens;` → one `enc:v1:` row for the
   native sign-in (proves the code exchange ran).
3. Delete the account → edge logs show `appleid.apple.com/auth/revoke` → 200;
   `apple_auth_tokens` row gone; Chravel removed under Settings → Apple ID →
   Sign in with Apple.
