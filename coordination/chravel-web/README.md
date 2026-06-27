# Apple Sign-in token revocation on account deletion — chravel-web coordination package

> **See also `NATIVE_APPLE_SIGNIN.md`** in this folder — the native Sign in with Apple
> (Guideline 2.1(a)) bridge added in chravel-mobile, and the `exchange-apple-code` function
> that keeps the revocation flow below working for native sign-ins.


App Store Guideline **5.1.1(v)**: an app offering Sign in with Apple must revoke the Apple
token when the user deletes their account. This package adds that to the shared Chravel backend.

> **Why this lives in `chravel-mobile`:** the backend (edge functions, migrations, web auth
> bootstrap) is owned by **`Chravel-Inc/ChravelApp`** (`chravel-web`), which was not reachable from
> the session that authored this change. These files are the **canonical source** — sync them into
> ChravelApp so the git repo matches what is deployed. The runtime changes were already applied to
> the live **"Chravel"** Supabase project (`jmjiyekmxwsxkfnqwyaa`) via the Supabase MCP.

## Architecture note (important)

Apple Sign-in runs through **Supabase GoTrue OAuth in a WebView/ASWebAuthenticationSession** for
**both** web and native. There is **no** native ASAuthorization flow (`chravel-mobile` only
intercepts the OAuth URL and relays the `chravel://auth-callback` deep link). Supabase performs the
Apple authorization-code exchange and exposes the Apple refresh token as
`session.provider_refresh_token`. We therefore capture it **server-side from the Supabase session**,
which covers web + native with zero native code changes.

## What's in this package

```
migrations/20260604000000_apple_auth_tokens.sql   New service-role-only table (encrypted token)
functions/_shared/appleClientSecret.ts            Mint ES256 client-secret JWT from the .p8
functions/_shared/appleRevoke.ts                  revokeAppleForUser() — revoke + audit + delete row
functions/_shared/gmailTokenCrypto.ts             AES-GCM crypto (EXACT copy of existing file — reuse, don't fork)
functions/_shared/cors.ts                         Copy of existing shared CORS (for self-contained bundles)
functions/store-apple-token/index.ts              Stores the token at sign-in; ALSO exchanges the native Apple authorizationCode → refresh token (deployed v27) — see NATIVE_APPLE_SIGNIN.md
functions/process-account-deletions/index.ts      MODIFIED: revoke before Step 7 + fixed audit insert
functions/delete-account/index.ts                 MODIFIED: revoke before Step 6
functions/tests/apple.test.ts                     Deno tests (crypto round-trip + client-secret JWT)
web/store-apple-token.snippet.ts                  Web auth-bootstrap snippet (capture provider_refresh_token)
```

`gmailTokenCrypto.ts` and `cors.ts` already exist in ChravelApp — **do not create divergent
copies**; reuse the existing files. They are included here only so the deploy bundles are
self-contained.

## Required edge-function secrets (set manually — never committed)

Set in **Supabase Dashboard → Project `jmjiyekmxwsxkfnqwyaa` → Edge Functions → Secrets**
(or `supabase secrets set`). The `.p8` must NOT be committed to any repo.

| Secret | Value |
|---|---|
| `APPLE_P8_PRIVATE_KEY` | Full PEM contents of `AuthKey_<KeyID>.p8` (Sign in with Apple key) |
| `APPLE_KEY_ID` | The 10-char Key ID for that `.p8` |
| `APPLE_TEAM_ID` | `2T6WY43H3X` |
| `APPLE_CLIENT_ID` | `com.chravel.app` (the Services ID / bundle ID used for Apple sign-in) |
| `APPLE_TOKEN_ENCRYPTION_KEY` | base64 of 32 random bytes — e.g. `openssl rand -base64 32` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` already exist.

## Deploy order

1. Apply the migration (`apple_auth_tokens` table). *(Already applied to the live project.)*
2. Set the five secrets above.
3. Deploy `store-apple-token`, `process-account-deletions`, `delete-account`. *(Already deployed.)*
4. Sync the `web/store-apple-token.snippet.ts` logic into ChravelApp's auth bootstrap and deploy the
   web app. **Until this step ships, no new tokens are captured** — revocation will no-op for users
   who haven't re-signed-in since.

## Sandbox verification

1. Sign in with a **sandbox Apple ID** in the app.
   - `select user_id, created_at from public.apple_auth_tokens;` → one `enc:v1:` row.
2. Delete the account (either path):
   - Immediate: `POST /functions/v1/delete-account` with the user's bearer token, body `{"confirmation":"DELETE"}`.
   - Cron: set `profiles.deletion_scheduled_for` in the past, then invoke `process-account-deletions`.
   - Edge logs show the `appleid.apple.com/auth/revoke` POST returning **200**.
   - `security_audit_log` has an `apple_token_revoked` row (and `account_deletion_executed` for cron).
   - `apple_auth_tokens` row is gone; `auth.users` row is gone.
3. On device: **Settings → Apple ID → Sign in with Apple** → confirm **Chravel is removed**.
4. Re-sign-in → a fresh grant appears and a new `apple_auth_tokens` row is created.
5. Delete a **non-Apple** (email/Google) account → revocation no-ops, deletion succeeds, no errors.

## Tests

```
deno test --allow-env coordination/chravel-web/functions/tests/apple.test.ts
```
