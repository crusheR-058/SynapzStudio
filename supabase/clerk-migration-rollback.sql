-- Undo clerk-migration.sql: put Row-Level Security back on Supabase Auth.
--
-- Run this if the Clerk switch goes wrong. It restores the original policies
-- from schema.sql and converts the id columns back to uuid.
--
-- IMPORTANT: the cast back to uuid FAILS if any row was written by a Clerk user,
-- because "user_2abc..." is not a uuid. That failure is deliberate — it stops
-- the migration silently destroying rows. Delete or re-key those rows first:
--
--   select 'liked_tracks' as t, count(*) from public.liked_tracks
--     where user_id !~ '^[0-9a-f-]{36}$'
--   union all select 'playlists', count(*) from public.playlists
--     where user_id !~ '^[0-9a-f-]{36}$';
--
-- The whole thing is one transaction, so a failure leaves the database exactly
-- as it was.

begin;

-- ---------------------------------------------------------------- profiles ---
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

alter table public.profiles alter column id type uuid using id::uuid;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ------------------------------------------------------------ liked_tracks ---
drop policy if exists liked_all_own on public.liked_tracks;
alter table public.liked_tracks alter column user_id type uuid using user_id::uuid;
alter table public.liked_tracks
  add constraint liked_tracks_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
create policy "liked_all_own" on public.liked_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --------------------------------------------------------------- playlists ---
drop policy if exists playlists_all_own on public.playlists;
drop policy if exists playlists_select_shared on public.playlists;
alter table public.playlists alter column user_id type uuid using user_id::uuid;
alter table public.playlists
  add constraint playlists_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
create policy "playlists_all_own" on public.playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "playlists_select_shared" on public.playlists
  for select using (is_public or is_collaborative);

-- --------------------------------------------------------- playlist_tracks ---
drop policy if exists playlist_tracks_all_own on public.playlist_tracks;
drop policy if exists playlist_tracks_select_shared on public.playlist_tracks;
drop policy if exists playlist_tracks_insert_collab on public.playlist_tracks;
alter table public.playlist_tracks alter column user_id type uuid using user_id::uuid;
alter table public.playlist_tracks
  add constraint playlist_tracks_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
create policy "playlist_tracks_all_own" on public.playlist_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "playlist_tracks_select_shared" on public.playlist_tracks
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id
        and (p.is_public or p.is_collaborative or p.user_id = auth.uid())
    )
  );
create policy "playlist_tracks_insert_collab" on public.playlist_tracks
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id
        and (p.is_collaborative or p.user_id = auth.uid())
    )
  );

-- ------------------------------------------------------------ play_history ---
drop policy if exists history_all_own on public.play_history;
alter table public.play_history alter column user_id type uuid using user_id::uuid;
alter table public.play_history
  add constraint play_history_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
create policy "history_all_own" on public.play_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------- user_settings ---
drop policy if exists settings_all_own on public.user_settings;
alter table public.user_settings alter column user_id type uuid using user_id::uuid;
alter table public.user_settings
  add constraint user_settings_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
create policy "settings_all_own" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------ listen_rooms ---
drop policy if exists rooms_all_own on public.listen_rooms;
drop policy if exists rooms_select_any on public.listen_rooms;
alter table public.listen_rooms alter column host_id type uuid using host_id::uuid;
alter table public.listen_rooms
  add constraint listen_rooms_host_id_fkey foreign key (host_id) references auth.users (id) on delete cascade;
create policy "rooms_all_own" on public.listen_rooms
  for all using (auth.uid() = host_id) with check (auth.uid() = host_id);
create policy "rooms_select_any" on public.listen_rooms
  for select using (true);

drop function if exists public.current_uid();

commit;
