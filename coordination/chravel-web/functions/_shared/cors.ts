// NOTE: Copy of the existing supabase/functions/_shared/cors.ts in ChravelApp,
// included so the deploy bundles in this package are self-contained. Keep in
// sync with the canonical file when syncing into ChravelApp.
//
// Allowed origins for CORS - restricts which domains can call Edge Functions.
// SECURITY: Only list specific known origins. Wildcard subdomain matchers like
// '.vercel.app' allow ANY project on that platform to call our edge functions.
// Use ADDITIONAL_ALLOWED_ORIGINS env var for preview/staging URLs.
const ALLOWED_ORIGINS = [
  // Production domains
  'https://chravel.app',
  'https://www.chravel.app',
  'https://chravelapp.com',
  'https://www.chravelapp.com',
  'https://app.chravelapp.com',
  'https://app.chravel.com',
  // Specific Supabase project
  'https://jmjiyekmxwsxkfnqwyaa.supabase.co',
  // Local development
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
  // Mobile app / local dev (Capacitor origins on iOS/Android + localhost)
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  // Lovable project preview (exact origin — do NOT use wildcard .lovableproject.com)
  'https://20feaa04-0946-4c68-a68d-0eb88cc1b9c4.lovableproject.com',
  // Lovable preview and published domains
  'https://id-preview--20feaa04-0946-4c68-a68d-0eb88cc1b9c4.lovable.app',
  'https://chravel.lovable.app',
];

const ENV_ALLOWED_ORIGINS = (Deno.env.get('ADDITIONAL_ALLOWED_ORIGINS') || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;

  const allowlist = [...ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS];

  return allowlist.some(allowed => {
    if (allowed.startsWith('.')) {
      return (
        origin.endsWith(allowed) ||
        origin === `https://${allowed.slice(1)}` ||
        origin === `http://${allowed.slice(1)}`
      );
    }
    return origin === allowed;
  });
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get('origin') || '';
  const allowedOrigin = isOriginAllowed(origin) ? origin : 'https://chravel.app';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export const corsHeaders = getCorsHeaders();
