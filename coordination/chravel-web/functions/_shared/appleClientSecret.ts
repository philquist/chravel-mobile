/**
 * Mints the Apple "client secret" — an ES256-signed JWT required to authenticate
 * against Apple's token endpoints (including https://appleid.apple.com/auth/revoke).
 *
 * Apple reference: "Generate and validate tokens" / "Revoke tokens".
 * The JWT is signed with the private key from the Apple .p8 (Sign in with Apple key).
 *
 * Required edge-function secrets (set in Supabase Dashboard → Edge Functions → Secrets):
 *   APPLE_P8_PRIVATE_KEY  - full PEM contents of AuthKey_XXXXXXXXXX.p8 (PKCS#8)
 *   APPLE_KEY_ID          - the 10-char Key ID for that .p8
 *   APPLE_TEAM_ID         - Apple Developer Team ID (2T6WY43H3X)
 *   APPLE_CLIENT_ID       - the Services ID / bundle ID used for Apple sign-in (com.chravel.app)
 *
 * The .p8 is NEVER committed to source control — it lives only as a secret.
 */

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts a PEM-encoded PKCS#8 private key into a CryptoKey for ES256 signing.
 * Tolerates either real newlines or literal "\n" (common when pasting a key into
 * a single-line secret value).
 */
async function importP8(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('APPLE_P8_PRIVATE_KEY is empty or malformed');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

export interface AppleClientSecretConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKeyPem: string;
}

export function appleConfigFromEnv(): AppleClientSecretConfig {
  const cfg = {
    teamId: Deno.env.get('APPLE_TEAM_ID') ?? '',
    keyId: Deno.env.get('APPLE_KEY_ID') ?? '',
    clientId: Deno.env.get('APPLE_CLIENT_ID') ?? '',
    privateKeyPem: Deno.env.get('APPLE_P8_PRIVATE_KEY') ?? '',
  };
  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Apple config missing secrets: ${missing.join(', ')}`);
  }
  return cfg;
}

/**
 * Mints a short-lived (5 min) Apple client-secret JWT.
 * ECDSA P-256 sign() returns the raw r‖s concatenation, which is exactly the
 * JOSE ES256 signature format — no DER unwrapping needed.
 */
export async function mintAppleClientSecret(
  cfg: AppleClientSecretConfig = appleConfigFromEnv(),
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: cfg.keyId, typ: 'JWT' };
  const payload = {
    iss: cfg.teamId,
    iat: now,
    exp: now + 300, // 5 minutes; Apple allows up to 6 months
    aud: 'https://appleid.apple.com',
    sub: cfg.clientId,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;

  const key = await importP8(cfg.privateKeyPem);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}
