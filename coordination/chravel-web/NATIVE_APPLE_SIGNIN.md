# Native Sign in with Apple — coordination (chravel-mobile ↔ chravel-web ↔ Supabase)

App Store **Guideline 2.1(a)**: the browser OAuth round-trip
(`ASWebAuthenticationSession`) for Apple sign-in strands users on iPhone/iPad
("no action can occur" / "did not proceed"). The fix is to run the **native
Apple sheet** (`ASAuthorization`) in the shell and authenticate the web app with
`supabase.auth.signInWithIdToken` — no browser.

## Who owns what

| Piece | Repo | Status |
|---|---|---|
| `window.ChravelNative.signInWithApple()` native bridge | **chravel-mobile** | ✅ Added — `src/appleAuth.ts`, `src/bridge.ts`, `src/ChravelWebView.tsx` |
| `attemptNativeAppleSignIn()` → `signInWithIdToken` + web OAuth fallback | **chravel-web** | ✅ Shipped (PR #746) |
| Forward native `authorizationCode` to `store-apple-token` | **chravel-web** | ✅ Shipped (PR #746) — `src/hooks/auth/captureAppleToken.ts` (`captureAppleAuthorizationCode`) |
| `store-apple-token` performs the server-side `authorizationCode → refresh_token` exchange | **ChravelApp / Supabase** | ✅ Deployed — `store-apple-token` **v27** (Chravel project `jmjiyekmxwsxkfnqwyaa`) |
| Apple `.p8` edge secrets | **ChravelApp / Supabase** | ⏳ **Must be set** (see below) — until then the exchange no-ops gracefully |

> **Design note:** there is **no** separate `exchange-apple-code` function. chravel-web
> already forwards the native code to the existing `store-apple-token`, which now completes
> the exchange inline. (An earlier draft proposed a standalone function; it was superseded
> and removed.)

## Bridge contract (implemented in chravel-mobile)

`window.ChravelNative.signInWithApple()` is injected **iOS-only**. It returns:

```ts
Promise<{
  identityToken: string;
  rawNonce: string;          // RAW nonce; shell already sent SHA256(rawNonce) to Apple
  authorizationCode?: string; // forwarded to store-apple-token for revocation capture
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

## Why the server-side exchange is required (Guideline 5.1.1(v))

The id-token flow does **not** yield Supabase's `provider_refresh_token`, so the
existing `store-apple-token` capture has nothing to persist and account-deletion
revocation would silently no-op. The native bridge therefore also returns the
one-time `authorizationCode`; chravel-web forwards it to `store-apple-token`,
which exchanges it server-side (`POST appleid.apple.com/auth/token`, reusing
`_shared/appleClientSecret.ts`) and stores the encrypted refresh token in
`apple_auth_tokens`. `delete-account` / `process-account-deletions` then revoke
via `appleid.apple.com/auth/revoke` unchanged.

The exchange branch in `store-apple-token/index.ts` degrades gracefully: if the
Apple `.p8` secrets are missing it returns `{ success: true, skipped:
'native_exchange_unavailable' }` and never blocks sign-in.

## Remaining action: set the Apple `.p8` edge secrets

In Dashboard → Project `jmjiyekmxwsxkfnqwyaa` → Edge Functions → Secrets (the
`.p8` must NEVER be committed):

| Secret | Value |
|---|---|
| `APPLE_P8_PRIVATE_KEY` | full PEM of `AuthKey_<KeyID>.p8` (Sign in with Apple key) |
| `APPLE_KEY_ID` | the 10-char Key ID for that `.p8` |
| `APPLE_TEAM_ID` | `2T6WY43H3X` |
| `APPLE_CLIENT_ID` | `com.chravel.app` (native uses the bundle id as the client) |

`APPLE_TOKEN_ENCRYPTION_KEY` is already referenced by the deployed function.

## Sandbox verification (after secrets are set)

1. iOS device → "Continue with Apple" → confirm a **native Apple sheet** (no
   Safari) → lands authenticated.
2. `select user_id, created_at from public.apple_auth_tokens;` → one `enc:v1:`
   row for the native sign-in, plus a `security_audit_log` `apple_token_stored`
   row with `source: 'native_code_exchange'` (proves the exchange ran).
3. Delete the account → edge logs show `appleid.apple.com/auth/revoke` → 200;
   `apple_auth_tokens` row gone; Chravel removed under Settings → Apple ID →
   Sign in with Apple.
