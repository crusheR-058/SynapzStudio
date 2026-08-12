-- Move Row-Level Security from Supabase Auth to Clerk.
--
-- WHY THIS IS NEEDED: sign-in via Clerk creates no Supabase session, so
-- auth.uid() returns null and every existing policy denies. Playlists, likes,
-- history and Listen Along would all come back empty, silently, with no error.
--
-- BEFORE RUNNING THIS, in the Supabase dashboard:
--   Authentication -> Sign In / Providers -> Third Party Auth -> Add Clerk
--   and paste your Clerk domain. Supabase will not verify Clerk tokens without
--   it, and every policy below will deny.
--
-- TWO DELIBERATE CHOICES
--
-- 1. user_id becomes TEXT. Clerk ids look like "user_2abc..." and are not
--    UUIDs, so the column type and the foreign key to auth.users both have to
--    go. Existing UUIDs survive as their text form.
--
-- 2. Policies accept EITHER identity:
--        coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
--    A Clerk token supplies 'sub'; a Supabase session supplies auth.uid(). That
--    means the mobile app -- still on Supabase Auth until it migrates -- keeps
--    working against the same database instead of going dark the moment the web
--    app switches. Remove the auth.uid() half once every client is on Clerk.
--
-- ROLLBACK: see clerk-migration-rollback.sql, written alongside this.
--
-- BACK UP FIRST. In the SQL editor:
--   create schema if not exists backup_preclerk;
--   create table backup_preclerk.liked_tracks    as select * from public.liked_tracks;
--   create table backup_preclerk.playlists       as select * from public.playlists;
--   create table backup_preclerk.playlist_tracks as select * from public.playlist_tracks;
--   create table backup_preclerk.play_history    as select * from public.play_history;
--   create table backup_preclerk.user_settings   as select * from public.user_settings;
--   create table backup_preclerk.listen_rooms    as select * from public.listen_rooms;
--   create table backup_preclerk.profiles        as select * from public.profiles;

begin;

-- Helper: the current user, whichever provider signed them in.
create or replace function public.current_uid()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'sub', auth.uid()::text);
$$;

-- ---------------------------------------------------------------- profiles ---
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id type text using id::text;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select using (id = public.current_uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = public.current_uid());
create policy profiles_update_own on public.profiles
  for update using (id = public.current_uid()) with check (id = public.current_uid());

-- ------------------------------------------------------------ liked_tracks ---
alter table public.liked_tracks drop constraint if exists liked_tracks_user_id_fkey;
alter table public.liked_tracks alter column user_id type text using user_id::text;

drop policy if exists liked_all_own on public.liked_tracks;
create policy liked_all_own on public.liked_tracks
  for all using (user_id = public.current_uid())
  with check (user_id = public.current_uid());

-- --------------------------------------------------------------- playlists ---
alter table public.playlists drop constraint if exists playlists_user_id_fkey;
alter table public.playlists alter column user_id type text using user_id::text;

drop policy if exists playlists_all_own on public.playlists;
drop policy if exists playlists_select_shared on public.playlists;

create policy playlists_all_own on public.playlists
  for all using (user_id = public.current_uid())
  with check (user_id = public.current_uid());
-- Unchanged in spirit: a shared playlist stays readable to anyone with the link.
create policy playlists_select_shared on public.playlists
  for select using (is_public or is_collaborative);

-- --------------------------------------------------------- playlist_tracks ---
alter table public.playlist_tracks drop constraint if exists playlist_tracks_user_id_fkey;
alter table public.playlist_tracks alter column user_id type text using user_id::text;

drop policy if exists playlist_tracks_all_own on public.playlist_tracks;
drop policy if exists playlist_tracks_select_shared on public.playlist_tracks;
drop policy if exists playlist_tracks_insert_collab on public.playlist_tracks;

create policy playlist_tracks_all_own on public.playlist_tracks
  for all using (user_id = public.current_uid())
  with check (user_id = public.current_uid());

create policy playlist_tracks_select_shared on public.playlist_tracks
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id
        and (p.is_public or p.is_collaborative or p.user_id = public.current_uid())
    )
  );

-- A collaborator may add rows, but only rows carrying their OWN id — the
-- with-check half is what stops one collaborator writing as another.
create policy playlist_tracks_insert_collab on public.playlist_tracks
  for insert with check (
    user_id = public.current_uid()
    and exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id
        and (p.is_collaborative or p.user_id = public.current_uid())
    )
  );

-- ------------------------------------------------------------ play_history ---
alter table public.play_history drop constraint if exists play_history_user_id_fkey;
alter table public.play_history alter column user_id type text using user_id::text;

drop policy if exists history_all_own on public.play_history;
create policy history_all_own on public.play_history
  for all using (user_id = public.current_uid())
  with check (user_id = public.current_uid());

-- ----------------------------------------------------------- user_settings ---
alter table public.user_settings drop constraint if exists user_settings_user_id_fkey;
alter table public.user_settings alter column user_id type text using user_id::text;

drop policy if exists settings_all_own on public.user_settings;
create policy settings_all_own on public.user_settings
  for all using (user_id = public.current_uid())
  with check (user_id = public.current_uid());

-- ------------------------------------------------------------ listen_rooms ---
alter table public.listen_rooms drop constraint if exists listen_rooms_host_id_fkey;
alter table public.listen_rooms alter column host_id type text using host_id::text;

drop policy if exists rooms_all_own on public.listen_rooms;
drop policy if exists rooms_select_any on public.listen_rooms;

create policy rooms_all_own on public.listen_rooms
  for all using (host_id = public.current_uid())
  with check (host_id = public.current_uid());
-- The room code IS the capability, so a room stays readable by anyone holding
-- one. Unchanged from before.
create policy rooms_select_any on public.listen_rooms
  for select using (true);

commit;

-- Verify: signed in through Clerk, this should return your Clerk user id.
--   select public.current_uid();
