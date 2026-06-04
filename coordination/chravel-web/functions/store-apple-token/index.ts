/**
 * store-apple-token Edge Function  (verify_jwt: true)
 *
 * Captures the Apple Sign-in refresh token for the authenticated user and stores
 * it ENCRYPTED, keyed by Supabase user_id, so it can later be revoked on account
 * deletion (App Store 5.1.1(v)).
 *
 * The web app calls this immediately after an Apple OAuth sign-in, passing the
 * `provider_refresh_token` from the Supabase session (see web/store-apple-token.snippet.ts).
 * Supabase already performed the Apple authorization-code exchange — this function
 * just persists the resulting refresh token.
 *
 * Request:  POST { refreshToken: string, appleSub?: string }
 *           Authorization: Bearer <user access token>
 * Response: { success: true }
 *
 * Secret: APPLE_TOKEN_ENCRYPTION_KEY (base64 of 32 random bytes)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { encryptToken } from '../_shared/gmailTokenCrypto.ts';

function jsonResponse(data: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
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
      console.error('[store-apple-token] APPLE_TOKEN_ENCRYPTION_KEY not set');
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

    // Only store for Apple identities. Check app_metadata + linked identities.
    const providers: string[] = [
      user.app_metadata?.provider,
      ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []),
      ...((user.identities ?? []).map(i => i.provider)),
    ].filter(Boolean) as string[];

    if (!providers.includes('apple')) {
      // Not an Apple user — nothing to store, but don't error the client.
      return jsonResponse({ success: true, skipped: 'not_apple' }, 200, corsHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const refreshToken: unknown = body?.refreshToken;
    const appleSub: unknown = body?.appleSub;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Apple only returns a refresh token on the initial grant. If the client has
    // none this time, preserve whatever we already stored.
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      const { data: existing } = await admin
        .from('apple_auth_tokens')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        return jsonResponse({ success: true, preserved: true }, 200, corsHeaders);
      }
      return jsonResponse({ error: 'Missing refreshToken' }, 400, corsHeaders);
    }

    const encrypted = await encryptToken(refreshToken, encryptionKey);

    const { error: upsertError } = await admin.from('apple_auth_tokens').upsert(
      {
        user_id: user.id,
        apple_sub: typeof appleSub === 'string' ? appleSub : null,
        refresh_token: encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      console.error('[store-apple-token] upsert failed:', upsertError.message);
      return jsonResponse({ error: 'Failed to store token' }, 500, corsHeaders);
    }

    // Best-effort audit.
    try {
      await admin.from('security_audit_log').insert({
        user_id: user.id,
        action: 'apple_token_stored',
        table_name: 'apple_auth_tokens',
        metadata: { stored_at: new Date().toISOString() },
      });
    } catch (_) {
      /* non-critical */
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[store-apple-token] unexpected error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
  }
});
