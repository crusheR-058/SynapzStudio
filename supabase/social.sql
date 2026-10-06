-- Friends + listening activity (the Friends tab).
--
-- Run this once in the Supabase SQL editor, after schema.sql. Safe to re-run.
--
-- Until this has been run the Friends tab says it is unavailable; nothing else
-- in the app depends on it.
--
-- THE PRIVACY RULE, in one place: a friendship is two `follows` rows, one each
-- way. A person's listening activity is readable only by someone they have
-- added back. Adding a stranger by link therefore shows you nothing, and no
-- approval step is needed to keep it that way.

begin;

-- ------------------------------------------------------------------ follows ---
create table if not exists public.follows (
  follower_id   uuid not null references auth.users (id) on delete cascade,
  followee_id   uuid not null references auth.users (id) on delete cascade,
  -- A profile is readable only by its owner, so each row carries the names its
  -- author knew: their own, and the one the invite link supplied.
  follower_name text not null default '',
  followee_name text not null default '',
  created_at    timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.follows enable row level security;

-- You can see a row if you are on either end of it: your own adds, and who has
-- added you (which is how an incoming request shows up).
drop policy if exists follows_select_involved on public.follows;
create policy follows_select_involved on public.follows
  for select using (
    follower_id = auth.uid() or followee_id = auth.uid()
  );

-- You can only ever write rows where YOU are the follower.
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert with check (follower_id = auth.uid());

drop policy if exists follows_update_own on public.follows;
create policy follows_update_own on public.follows
  for update using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete using (follower_id = auth.uid());

create index if not exists follows_followee on public.follows (followee_id);

-- ------------------------------------------------------- listening_activity ---
-- One row per user: what they are playing right now. Overwritten in place, so
-- this never grows past one row per person.
create table if not exists public.listening_activity (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  picture    text not null default '',
  track      jsonb,
  is_playing boolean not null default false,
  room_code  text,
  updated_at timestamptz not null default now()
);

alter table public.listening_activity enable row level security;

drop policy if exists activity_all_own on public.listening_activity;
create policy activity_all_own on public.listening_activity
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Readable by a MUTUAL friend only: I follow them AND they follow me.
drop policy if exists activity_select_mutual on public.listening_activity;
create policy activity_select_mutual on public.listening_activity
  for select using (
    exists (
      select 1 from public.follows mine
      where mine.follower_id = auth.uid()
        and mine.followee_id = listening_activity.user_id
    )
    and exists (
      select 1 from public.follows theirs
      where theirs.follower_id = listening_activity.user_id
        and theirs.followee_id = auth.uid()
    )
  );

commit;
