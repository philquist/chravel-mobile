/**
 * Deno tests for the Apple revocation building blocks.
 *
 * Run from the ChravelApp repo root (where _shared lives), or copy into
 * supabase/functions/tests/. Requires Deno:
 *
 *   deno test --allow-env coordination/chravel-web/functions/tests/apple.test.ts
 *
 * These tests cover the pure/crypto logic. The Apple HTTP revoke call and DB
 * access in appleRevoke.ts are integration-tested via the sandbox flow in README.md.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { encryptToken, decryptToken } from '../_shared/gmailTokenCrypto.ts';
import { mintAppleClientSecret } from '../_shared/appleClientSecret.ts';

function base64Url32(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

// Generate a throwaway P-256 PKCS#8 key in PEM, so we never need a real .p8.
async function generateTestP8Pem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let bin = '';
  for (const b of pkcs8) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
}

Deno.test('AES-GCM token round-trip preserves the token', async () => {
  const key = base64Url32();
  const original = 'apple-refresh-token-abc.123_XYZ';
  const ciphertext = await encryptToken(original, key);
  assertStringIncludes(ciphertext, 'enc:v1:');
  assert(ciphertext !== original);
  const decrypted = await decryptToken(ciphertext, key);
  assertEquals(decrypted, original);
});

Deno.test('decryptToken returns null for null input', async () => {
  assertEquals(await decryptToken(null, base64Url32()), null);
});

Deno.test('mintAppleClientSecret produces a valid ES256 JWT with Apple claims', async () => {
  const pem = await generateTestP8Pem();
  const jwt = await mintAppleClientSecret({
    teamId: '2T6WY43H3X',
    keyId: 'ABC1234567',
    clientId: 'com.chravel.app',
    privateKeyPem: pem,
  });

  const [headerB64, payloadB64, sigB64] = jwt.split('.');
  assert(headerB64 && payloadB64 && sigB64, 'JWT must have three segments');

  const header = decodeJwtPart(headerB64);
  assertEquals(header.alg, 'ES256');
  assertEquals(header.kid, 'ABC1234567');

  const payload = decodeJwtPart(payloadB64) as Record<string, number | string>;
  assertEquals(payload.iss, '2T6WY43H3X');
  assertEquals(payload.sub, 'com.chravel.app');
  assertEquals(payload.aud, 'https://appleid.apple.com');
  assert(typeof payload.iat === 'number');
  assert((payload.exp as number) > (payload.iat as number));
  // Apple requires exp within 6 months of iat.
  assert((payload.exp as number) - (payload.iat as number) <= 15777000);
});

Deno.test('mintAppleClientSecret tolerates literal \\n in the PEM', async () => {
  const pem = (await generateTestP8Pem()).replace(/\n/g, '\\n');
  const jwt = await mintAppleClientSecret({
    teamId: 'T',
    keyId: 'K',
    clientId: 'com.chravel.app',
    privateKeyPem: pem,
  });
  assertEquals(jwt.split('.').length, 3);
});
