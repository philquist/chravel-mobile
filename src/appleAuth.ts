/**
 * Native Sign in with Apple (ASAuthorization).
 *
 * iOS App Review Guideline 2.1(a): the browser OAuth round-trip
 * (ASWebAuthenticationSession) strands users on iPhone/iPad. Instead we run the
 * native Apple sheet here and hand the credential to chravel-web, which calls
 * `supabase.auth.signInWithIdToken` — no browser, no redirect.
 *
 * Nonce handling matches the bridge contract chravel-web documents in
 * `src/utils/nativeAppleSignIn.ts`: generate a random RAW nonce, send
 * `SHA256(rawNonce)` to Apple as the request nonce, and return the RAW nonce so
 * the web can pass it to `signInWithIdToken` (Supabase hashes it again and
 * compares against the id_token's `nonce` claim).
 */
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import type { AppleSignInCredential } from "./bridge";

/**
 * Run the native Apple sign-in flow and return a credential for the web app.
 *
 * Throws on cancellation, unavailability, or a missing identity token. The
 * caller (`ChravelWebView`) turns a throw into `{ ok: false }`; chravel-web's
 * `attemptNativeAppleSignIn` then returns `{ handled: false }` and falls back to
 * the existing browser OAuth flow.
 */
export async function runNativeAppleSignIn(): Promise<AppleSignInCredential> {
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error("Apple authentication is not available on this device");
  }

  const rawNonce = await generateRawNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error("Apple sign-in returned no identity token");
  }

  return {
    identityToken: credential.identityToken,
    rawNonce,
    // Apple returns email/fullName only on the FIRST authorization; forward what
    // we get. authorizationCode is forwarded for server-side refresh-token
    // capture (account-deletion revocation, Guideline 5.1.1(v)).
    authorizationCode: credential.authorizationCode ?? undefined,
    email: credential.email ?? undefined,
    fullName: formatFullName(credential.fullName),
  };
}

export type AppleSignInFailureCode = "canceled";

/**
 * Map a `runNativeAppleSignIn` failure to a machine-readable code for the web.
 * expo-apple-authentication rejects with a CodedError whose `code` is
 * `ERR_REQUEST_CANCELED` when the user dismisses the ASAuthorization sheet.
 * Cancel must be distinguishable from real failures: chravel-web treats a
 * `canceled` rejection as a no-op (stay on the sign-in screen) instead of
 * falling back to the browser OAuth flow — the prior 2.1(a) rejection vector.
 */
export function getAppleSignInFailureCode(
  error: unknown,
): AppleSignInFailureCode | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED") {
    return "canceled";
  }
  return undefined;
}

/** 32 random bytes as a lowercase hex string — used as the raw OAuth nonce. */
async function generateRawNonce(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** Apple only returns the name on first authorization; collapse it to a string. */
function formatFullName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null,
): string | undefined {
  if (!fullName) return undefined;
  const parts = [fullName.givenName, fullName.familyName].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}
