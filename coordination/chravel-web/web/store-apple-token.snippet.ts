/**
 * chravel-web integration snippet — capture the Apple refresh token at sign-in.
 *
 * WHERE THIS GOES: ChravelApp (the web app served at https://chravel.app), in the
 * auth bootstrap that runs after an OAuth redirect — e.g. the supabase
 * `onAuthStateChange` handler or the /auth-callback route. This is NOT mobile-shell
 * code; the native shell only wraps this web app in a WebView, so wiring it here
 * covers BOTH web and native Apple sign-ins.
 *
 * WHY HERE: Supabase only surfaces `provider_refresh_token` on the INITIAL OAuth
 * redirect (it is not returned by later getSession() calls once the Supabase token
 * has been refreshed). So we must read it from the very first SIGNED_IN session and
 * forward it to the `store-apple-token` edge function.
 *
 * Apple returns a refresh token only on the first grant for a given user. On
 * re-sign-in without a new token, store-apple-token preserves the existing row.
 */

import type { SupabaseClient, Session } from '@supabase/supabase-js';

/**
 * Call once, early in app bootstrap, with your initialized Supabase client.
 */
export function registerAppleTokenCapture(supabase: SupabaseClient): void {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' || !session) return;
    // Fire-and-forget; never block the sign-in UX on this.
    void maybeStoreAppleToken(supabase, session);
  });
}

async function maybeStoreAppleToken(
  supabase: SupabaseClient,
  session: Session,
): Promise<void> {
  try {
    const providerRefreshToken = (session as Session & {
      provider_refresh_token?: string | null;
    }).provider_refresh_token;

    // Only act on Apple sign-ins that actually carried a provider refresh token.
    const provider = session.user?.app_metadata?.provider;
    const providers: string[] = session.user?.app_metadata?.providers ?? [];
    const isApple = provider === 'apple' || providers.includes('apple');

    if (!isApple || !providerRefreshToken) return;

    const appleSub = session.user?.identities?.find(i => i.provider === 'apple')?.id ?? null;

    await supabase.functions.invoke('store-apple-token', {
      body: { refreshToken: providerRefreshToken, appleSub },
    });
    // supabase.functions.invoke automatically attaches the user's bearer token.
  } catch (err) {
    // Non-fatal: revocation-on-deletion just won't have a token for this user.
    console.warn('[apple-token-capture] failed to store Apple refresh token', err);
  }
}
