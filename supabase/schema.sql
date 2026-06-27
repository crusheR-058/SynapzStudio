-- ============================================================================
-- Synapz Music — Supabase schema
-- Run this once in your project: Supabase Dashboard → SQL Editor → New query →
-- paste → Run. Safe to re-run (idempotent).
--
-- Every table has Row-Level Security ON with policies scoped to auth.uid(), so a
-- signed-in user can only ever read/write their OWN rows. The frontend uses the
-- public "anon" key; RLS — not the key — is what protects the data.
-- ============================================================================

-- ---------------------------------------------------------------- profiles ---
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  picture    text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up (Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, picture)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, 'listener'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ liked_tracks ---
-- The full track object is stored as jsonb so it stays playable without
-- re-querying Audius/YouTube.
create table if not exists public.liked_tracks (
  user_id  uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  track    jsonb not null,
  added_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table public.liked_tracks enable row level security;

drop policy if exists "liked_all_own" on public.liked_tracks;
create policy "liked_all_own" on public.liked_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists liked_tracks_user_added
  on public.liked_tracks (user_id, added_at desc);

-- --------------------------------------------------------------- playlists ---
create table if not exists public.playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.playlists enable row level security;

drop policy if exists "playlists_all_own" on public.playlists;
create policy "playlists_all_own" on public.playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists playlists_user on public.playlists (user_id, updated_at desc);

-- --------------------------------------------------------- playlist_tracks ---
create table if not exists public.playlist_tracks (
  id          bigint generated always as identity primary key,
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  track_id    text not null,
  track       jsonb not null,
  position    integer not null default 0,
  added_at    timestamptz not null default now()
);

alter table public.playlist_tracks enable row level security;

drop policy if exists "playlist_tracks_all_own" on public.playlist_tracks;
create policy "playlist_tracks_all_own" on public.playlist_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists playlist_tracks_order
  on public.playlist_tracks (playlist_id, position);

-- ------------------------------------------------------------ play_history ---
create table if not exists public.play_history (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  track_id  text not null,
  track     jsonb not null,
  seconds   integer not null default 0,
  played_at timestamptz not null default now()
);

alter table public.play_history enable row level security;

drop policy if exists "history_all_own" on public.play_history;
create policy "history_all_own" on public.play_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists play_history_user_time
  on public.play_history (user_id, played_at desc);

-- ----------------------------------------------------------- user_settings ---
-- One row per user holding volume / EQ / crossfade / rate etc. as jsonb.
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "settings_all_own" on public.user_settings;
create policy "settings_all_own" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
