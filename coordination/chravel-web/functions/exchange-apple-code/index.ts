/**
 * exchange-apple-code Edge Function  (verify_jwt: true)
 *
 * NATIVE Sign in with Apple analog of `store-apple-token`.
 *
 * Background: on iOS the native shell (chravel-mobile) now runs the Apple
 * `ASAuthorization` sheet and the web app authenticates with
 * `supabase.auth.signInWithIdToken({ provider:'apple', token, nonce })`. That
 * id-token flow does NOT perform an authorization-code exchange, so Supabase
 * never produces a `provider_refresh_token` — which means `store-apple-token`
 * has nothing to persist, and account-deletion revocation (App Store 5.1.1(v))
 * would silently no-op.
 *
 * This function closes that gap: the web app forwards the native
 * `authorizationCode` here, and we perform the Apple authorization-code → token
 * exchange SERVER-SIDE (with the ES256 client secret), then persist the
 * resulting `refresh_token` ENCRYPTED in `apple_auth_tokens` exactly like
 * `store-apple-token` — so `delete-account` / `process-account-deletions` can
 * still revoke it via `appleid.apple.com/auth/revoke`.
 *
 * Request:  POST { authorizationCode: string }
 *           Authorization: Bearer <user access token>
 * Response: { success: true }
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   APPLE_P8_PRIVATE_KEY, APPLE_KEY_ID, APPLE_TEAM_ID, APPLE_CLIENT_ID
 *   APPLE_TOKEN_ENCRYPTION_KEY (base64 of 32 random bytes)
 *
 * NOTE: APPLE_CLIENT_ID must equal the `aud`/client_id Apple issued the native
 * authorization code for — i.e. the app bundle id `com.chravel.app` (native
 * Sign in with Apple uses the bundle id as the client, not a Services ID).
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { encryptToken } from '../_shared/gmailTokenCrypto.ts';
import { mintAppleClientSecret, appleConfigFromEnv } from '../_shared/appleClientSecret.ts';

function jsonResponse(data: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/** Exchange a native authorization code for an Apple refresh token. */
async function exchangeAuthorizationCode(
  authorizationCode: string,
  clientId: string,
  clientSecret: string,
): Promise<{ refreshToken?: string; error?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { error: `apple_token_${resp.status}:${text.slice(0, 200)}` };
  }

  const data = (await resp.json().catch(() => ({}))) as { refresh_token?: string };
  return { refreshToken: data.refresh_token };
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const encryptionKey = Deno.env.get('APPLE_TOKEN_ENCRYPTION_KEY') ?? '';

    if (!encryptionKey) {
      console.error('[exchange-apple-code] APPLE_TOKEN_ENCRYPTION_KEY not set');
      return jsonResponse({ error: 'Server misconfigured' }, 503, corsHeaders);
    }

    // Authenticate the caller from their bearer token.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authentication required' }, 401, corsHeaders);
    }

    const userScoped = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userScoped.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid authentication' }, 401, corsHeaders);
    }

    // Only meaningful for Apple identities.
    const providers: string[] = [
      user.app_metadata?.provider,
      ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []),
      ...((user.identities ?? []).map(i => i.provider)),
    ].filter(Boolean) as string[];

    if (!providers.includes('apple')) {
      return jsonResponse({ success: true, skipped: 'not_apple' }, 200, corsHeaders);
    }

    const reqBody = await req.json().catch(() => ({}));
    const authorizationCode: unknown = reqBody?.authorizationCode;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // No code this time (e.g. a returning user whose grant we already captured):
    // preserve the existing token rather than erroring.
    if (typeof authorizationCode !== 'string' || authorizationCode.length === 0) {
      const { data: existing } = await admin
        .from('apple_auth_tokens')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        return jsonResponse({ success: true, preserved: true }, 200, corsHeaders);
      }
      return jsonResponse({ error: 'Missing authorizationCode' }, 400, corsHeaders);
    }

    // Server-side exchange: native code → Apple refresh token.
    const cfg = appleConfigFromEnv();
    const clientSecret = await mintAppleClientSecret(cfg);
    const { refreshToken, error: exchangeError } = await exchangeAuthorizationCode(
      authorizationCode,
      cfg.clientId,
      clientSecret,
    );

    if (exchangeError) {
      console.error('[exchange-apple-code] exchange failed:', exchangeError);
      return jsonResponse({ error: 'Apple code exchange failed' }, 502, corsHeaders);
    }
    if (!refreshToken) {
      // Apple did not return a refresh token (code already consumed / reused).
      // Don't clobber an existing stored token; succeed quietly if we have one.
      const { data: existing } = await admin
        .from('apple_auth_tokens')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        return jsonResponse({ success: true, preserved: true }, 200, corsHeaders);
      }
      return jsonResponse({ error: 'No refresh token returned by Apple' }, 502, corsHeaders);
    }

    const encrypted = await encryptToken(refreshToken, encryptionKey);

    const { error: upsertError } = await admin.from('apple_auth_tokens').upsert(
      {
        user_id: user.id,
        refresh_token: encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      console.error('[exchange-apple-code] upsert failed:', upsertError.message);
      return jsonResponse({ error: 'Failed to store token' }, 500, corsHeaders);
    }

    // Best-effort audit.
    try {
      await admin.from('security_audit_log').insert({
        user_id: user.id,
        action: 'apple_token_stored',
        table_name: 'apple_auth_tokens',
        metadata: { stored_at: new Date().toISOString(), source: 'native_code_exchange' },
      });
    } catch (_) {
      /* non-critical */
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[exchange-apple-code] unexpected error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
  }
});
