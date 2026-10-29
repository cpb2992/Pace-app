-- Coach sharing: the athlete's phone uploads a read-only snapshot, the coach opens it with a private link.
-- Tables are prefixed pace_ because Pace currently shares a Supabase project with another app.
--
-- Nothing here is reachable with the anon or publishable key: RLS is on with no policies, and only the
-- pace-share Edge Function (service role) reads or writes. Secrets are stored as SHA-256 hashes, so a
-- database leak exposes neither the phone's key nor the coach link.

create table if not exists public.pace_athletes (
  id uuid primary key default gen_random_uuid(),
  -- Hash of the secret the phone signs every upload with.
  secret_hash text not null unique,
  -- Hash of the token in the coach link; null when the link is turned off.
  view_hash text unique,
  report jsonb,
  report_at timestamptz,
  -- Last time the coach opened the link.
  viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pace_athletes_created_at on public.pace_athletes (created_at);

alter table public.pace_athletes enable row level security;
revoke all on public.pace_athletes from anon, authenticated;

comment on table public.pace_athletes is 'Pace coach sharing. Service role only (pace-share Edge Function).';
