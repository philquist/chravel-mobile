/**
 * Revokes a user's Sign in with Apple grant and removes the stored token.
 *
 * Called from the account-deletion edge functions BEFORE auth.users is deleted,
 * so we still have the user_id to look the token up. Satisfies App Store 5.1.1(v):
 * deleting the account also revokes the Apple token.
 *
 * Behaviour:
 *   - No stored token (non-Apple user, or token never captured) → no-op, success.
 *   - Token present → POST appleid.apple.com/auth/revoke with the minted client
 *     secret, audit-log the outcome, then delete the apple_auth_tokens row.
 *   - Apple revoke HTTP failure → logged, NOT fatal. We never block account
 *     deletion on Apple availability (mirrors the gmail-auth disconnect pattern).
 *
 * Reuses the AES-GCM token crypto already used for gmail_accounts
 * (functions/_shared/gmailTokenCrypto.ts), keyed by APPLE_TOKEN_ENCRYPTION_KEY.
 */

import { decryptToken } from './gmailTokenCrypto.ts';
import { appleConfigFromEnv, mintAppleClientSecret } from './appleClientSecret.ts';

const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

export interface AppleRevokeResult {
  revoked: boolean;
  reason?: 'no_token' | 'revoke_http_error' | 'misconfigured' | 'exception';
  status?: number;
}

/**
 * @param adminClient a service-role Supabase client (bypasses RLS)
 * @param userId      the Supabase auth user id being deleted
 */
export async function revokeAppleForUser(
  // deno-lint-ignore no-explicit-any -- avoid deep SupabaseClient generic inference
  adminClient: any,
  userId: string,
): Promise<AppleRevokeResult> {
  // 1. Look up the stored (encrypted) refresh token.
  const { data: row, error: selectError } = await adminClient
    .from('apple_auth_tokens')
    .select('id, refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    console.warn('[appleRevoke] lookup failed (continuing):', selectError.message);
    return { revoked: false, reason: 'exception' };
  }

  // Non-Apple user (or token never captured) — nothing to revoke.
  if (!row || !row.refresh_token) {
    return { revoked: false, reason: 'no_token' };
  }

  let result: AppleRevokeResult = { revoked: false };

  try {
    const encryptionKey = Deno.env.get('APPLE_TOKEN_ENCRYPTION_KEY') ?? '';
    if (!encryptionKey) throw new Error('APPLE_TOKEN_ENCRYPTION_KEY not set');

    const token = await decryptToken(row.refresh_token, encryptionKey);
    if (!token) throw new Error('decrypted Apple token was empty');

    const cfg = appleConfigFromEnv();
    const clientSecret = await mintAppleClientSecret(cfg);

    const resp = await fetch(APPLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: 'refresh_token',
      }),
    });

    // Apple returns 200 with an empty body on success.
    result = resp.ok
      ? { revoked: true, status: resp.status }
      : { revoked: false, reason: 'revoke_http_error', status: resp.status };

    if (!resp.ok) {
      console.warn(
        `[appleRevoke] revoke returned ${resp.status} for user ${userId}:`,
        await resp.text().catch(() => ''),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[appleRevoke] error for user ${userId} (continuing):`, message);
    result = {
      revoked: false,
      reason: message.includes('not set') || message.includes('missing secrets')
        ? 'misconfigured'
        : 'exception',
    };
  }

  // 2. Audit the attempt (best-effort; never throws).
  try {
    await adminClient.from('security_audit_log').insert({
      user_id: userId,
      action: 'apple_token_revoked',
      table_name: 'apple_auth_tokens',
      record_id: row.id,
      metadata: {
        revoked: result.revoked,
        reason: result.reason ?? null,
        http_status: result.status ?? null,
        revoked_at: new Date().toISOString(),
      },
    });
  } catch (auditErr) {
    console.warn('[appleRevoke] audit log insert failed:', auditErr);
  }

  // 3. Remove the stored token regardless of revoke outcome — the account is
  //    being deleted, so the encrypted token must not linger.
  try {
    await adminClient.from('apple_auth_tokens').delete().eq('user_id', userId);
  } catch (delErr) {
    console.warn('[appleRevoke] failed to delete apple_auth_tokens row:', delErr);
  }

  return result;
}
