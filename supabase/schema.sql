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

-- Sharing flags (added after the initial release). The app SELECTs these, so
-- they must exist or PostgREST rejects the whole query. Idempotent.
alter table public.playlists add column if not exists is_public boolean not null default false;
alter table public.playlists add column if not exists is_collaborative boolean not null default false;

alter table public.playlists enable row level security;

drop policy if exists "playlists_all_own" on public.playlists;
create policy "playlists_all_own" on public.playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Anyone (incl. signed-out) may READ a playlist the owner marked public or
-- collaborative — this is what makes shared links work. Permissive policies are
-- OR-ed, so the owner still sees their private playlists via playlists_all_own.
drop policy if exists "playlists_select_shared" on public.playlists;
create policy "playlists_select_shared" on public.playlists
  for select using (is_public or is_collaborative);

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

-- Read tracks of any playlist that is shared (public/collaborative) or owned by
-- the reader — so shared links resolve, and the owner can see tracks a
-- collaborator added (those rows carry the collaborator's user_id, which the
-- owner-only policy above would otherwise hide).
drop policy if exists "playlist_tracks_select_shared" on public.playlist_tracks;
create policy "playlist_tracks_select_shared" on public.playlist_tracks
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id
        and (p.is_public or p.is_collaborative or p.user_id = auth.uid())
    )
  );

-- A signed-in user may add tracks to a collaborative playlist (rows still carry
-- their own user_id, enforced by with check).
drop policy if exists "playlist_tracks_insert_collab" on public.playlist_tracks;
create policy "playlist_tracks_insert_collab" on public.playlist_tracks
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id
        and (p.is_collaborative or p.user_id = auth.uid())
    )
  );

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

-- ------------------------------------------------------------ listen_rooms ---
-- Listen Along: one row per live session, holding the host's authoritative
-- playback state. Realtime broadcast carries the frequent position ticks (too
-- chatty for the DB); this row is the SNAPSHOT a guest reads on join so they
-- start in sync immediately instead of waiting for the next tick.
--
-- `code` is the short, link-safe id that appears in the share URL and the
-- Discord button, so it — not the uuid — is the primary key.
create table if not exists public.listen_rooms (
  code         text primary key,
  host_id      uuid not null references auth.users (id) on delete cascade,
  host_name    text not null default 'Someone',
  track        jsonb,
  position_sec double precision not null default 0,
  is_playing   boolean not null default false,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.listen_rooms enable row level security;

-- The host owns the row outright.
drop policy if exists "rooms_all_own" on public.listen_rooms;
create policy "rooms_all_own" on public.listen_rooms
  for all using (auth.uid() = host_id) with check (auth.uid() = host_id);

-- Anyone may READ a room by its code — that is what makes a shared link (or the
-- Discord "Listen Along" button) resolve for someone who isn't the host. The
-- code is the capability: unguessable, and the row holds only what the host is
-- already broadcasting publicly. Guests never write here; they only listen on
-- the Realtime channel, so no guest-write policy exists.
drop policy if exists "rooms_select_any" on public.listen_rooms;
create policy "rooms_select_any" on public.listen_rooms
  for select using (true);

create index if not exists listen_rooms_host on public.listen_rooms (host_id);

-- Rooms are ephemeral. Nothing schedules this, but it lets you (or a cron job)
-- reap sessions whose host vanished without a clean disconnect.
create or replace function public.prune_stale_listen_rooms(max_age interval default '12 hours')
returns void language sql security definer as $$
  delete from public.listen_rooms where updated_at < now() - max_age;
$$;
