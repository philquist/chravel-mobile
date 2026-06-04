-- Apple Sign-in refresh-token store for App Store 5.1.1(v) revocation-on-deletion.
--
-- One row per user that signed in with Apple. The Apple refresh token is stored
-- ENCRYPTED at rest (AES-GCM, "enc:v1:" prefix — same scheme as gmail_accounts,
-- see functions/_shared/gmailTokenCrypto.ts). The plaintext token never touches
-- the database.
--
-- Access model: SERVICE-ROLE ONLY. RLS is enabled with NO policies and all
-- privileges are revoked from anon/authenticated, so only the service role
-- (which bypasses RLS) in our edge functions can read/write it.

create table if not exists public.apple_auth_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  apple_sub     text,
  refresh_token text not null, -- AES-GCM ciphertext ("enc:v1:...")
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.apple_auth_tokens is
  'Encrypted Apple Sign-in refresh tokens, keyed by Supabase user_id. Service-role only. Used to revoke the Apple grant (appleid.apple.com/auth/revoke) on account deletion per App Store 5.1.1(v).';

-- Keep updated_at fresh on upsert/update.
create extension if not exists moddatetime schema extensions;

drop trigger if exists set_apple_auth_tokens_updated_at on public.apple_auth_tokens;
create trigger set_apple_auth_tokens_updated_at
  before update on public.apple_auth_tokens
  for each row execute function extensions.moddatetime(updated_at);

-- Lock it down: service-role only.
alter table public.apple_auth_tokens enable row level security;
-- (intentionally NO policies — default-deny for anon & authenticated)

revoke all on public.apple_auth_tokens from anon, authenticated;
