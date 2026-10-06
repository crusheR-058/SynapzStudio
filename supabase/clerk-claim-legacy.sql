-- Carry an existing account's library across the move to Clerk.
--
-- WHY: clerk-migration.sql keeps every old row, but under its old Supabase
-- user id. Someone who signs in through Clerk gets a NEW id ("user_2abc…"), so
-- their likes, playlists and history are still in the database and no longer
-- theirs — to them it looks like the switch deleted everything.
--
-- This adds one function, claim_legacy_account(). The app calls it once after a
-- Clerk sign-in. It finds the old Supabase account with the same email address
-- and re-keys that account's rows to the caller's Clerk id.
--
-- RUN AFTER clerk-migration.sql (it relies on the id columns being text).
-- Safe to re-run.
--
-- ONE DASHBOARD STEP IS REQUIRED, or the function does nothing:
--   Clerk dashboard -> Sessions -> Customize session token, add
--     {
--       "email": "{{user.primary_email_address}}",
--       "email_verified": "{{user.email_verified}}"
--     }
--   Clerk's default token carries no email, and the email is the only thing
--   that links the two identities.
--
-- WHY IT IS SAFE TO EXPOSE
--   It is `security definer` and bypasses row-level security, so everything
--   that makes it safe is in the body:
--   - the caller's identity and email come from the JWT Supabase has already
--     verified against Clerk, never from an argument — there are no arguments;
--   - the email must be marked verified by Clerk, and the old account's email
--     must have been confirmed too, so neither side can be claimed by typing
--     someone else's address into a sign-up form;
--   - it only ever moves rows FROM the matching legacy id TO the caller.
--
-- NOTE FOR ROLLBACK: once rows have been claimed they carry Clerk ids, and
-- clerk-migration-rollback.sql will refuse to cast them back to uuid (by
-- design). Take the backup described in clerk-migration.sql before going live.

begin;

create or replace function public.claim_legacy_account()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me     text := auth.jwt() ->> 'sub';
  mail   text := lower(nullif(auth.jwt() ->> 'email', ''));
  old_id text;
  moved  integer := 0;
  n      integer;
begin
  if me is null or mail is null then
    return 0;
  end if;
  -- A Supabase-Auth session's `sub` IS a legacy uuid; only a Clerk identity
  -- has anything to claim.
  if me ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 0;
  end if;
  if lower(coalesce(auth.jwt() ->> 'email_verified', 'false')) <> 'true' then
    return 0;
  end if;

  select u.id::text into old_id
  from auth.users u
  where lower(u.email) = mail
    and u.email_confirmed_at is not null
  order by u.created_at
  limit 1;

  if old_id is null or old_id = me then
    return 0;
  end if;

  -- Likes: (user_id, track_id) is the primary key, so a song liked under both
  -- identities would collide. Move what doesn't clash, drop the duplicates.
  update public.liked_tracks l set user_id = me
  where l.user_id = old_id
    and not exists (
      select 1 from public.liked_tracks x where x.user_id = me and x.track_id = l.track_id
    );
  get diagnostics n = row_count;
  moved := moved + n;
  delete from public.liked_tracks where user_id = old_id;

  update public.playlists set user_id = me where user_id = old_id;
  get diagnostics n = row_count;
  moved := moved + n;

  update public.playlist_tracks set user_id = me where user_id = old_id;
  get diagnostics n = row_count;
  moved := moved + n;

  update public.play_history set user_id = me where user_id = old_id;
  get diagnostics n = row_count;
  moved := moved + n;

  -- One settings row per user: keep the new one if it already exists.
  update public.user_settings s set user_id = me
  where s.user_id = old_id
    and not exists (select 1 from public.user_settings x where x.user_id = me);
  delete from public.user_settings where user_id = old_id;

  update public.profiles p set id = me
  where p.id = old_id
    and not exists (select 1 from public.profiles x where x.id = me);
  delete from public.profiles where id = old_id;

  -- listen_rooms are live sessions, not library data; nothing to carry over.
  return moved;
end;
$$;

-- Callable by signed-in clients only. With Clerk's Supabase integration on, the
-- token's role is `authenticated`; `anon` is included because a Clerk token
-- without that role claim is treated as anon, and the body does its own checks.
revoke all on function public.claim_legacy_account() from public;
grant execute on function public.claim_legacy_account() to anon, authenticated;

commit;
