-- Pace backend schema.
-- Edge functions use the service role, so the WHOOP tables have row level security on and no
-- policies: nothing outside the functions can read tokens.

create table if not exists public.whoop_auth_states (
  state text primary key,
  device_id text not null,
  created_at timestamptz not null default now()
);
alter table public.whoop_auth_states enable row level security;

create table if not exists public.whoop_tokens (
  device_id text primary key,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.whoop_tokens enable row level security;

-- Phase 2: accounts and cloud sync. Each signed-in user owns exactly one row holding their AppData
-- (the same JSON the app keeps on the phone). Policies let users read and write only their own row.
create table if not exists public.app_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_data enable row level security;
create policy "own data: read" on public.app_data for select using (auth.uid() = user_id);
create policy "own data: insert" on public.app_data for insert with check (auth.uid() = user_id);
create policy "own data: update" on public.app_data for update using (auth.uid() = user_id);

-- Phase 2: per-user coach usage, for daily limits that keep AI costs inside the subscription price.
create table if not exists public.coach_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  questions int not null default 0,
  primary key (user_id, day)
);
alter table public.coach_usage enable row level security;
create policy "own usage: read" on public.coach_usage for select using (auth.uid() = user_id);
