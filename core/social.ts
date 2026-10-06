// Friends and listening activity.
//
// The model is deliberately small: a friendship is two `follows` rows, one in
// each direction. Nothing is visible one-way — a person's listening activity is
// readable only by someone they have ALSO added back (see supabase/social.sql,
// where that rule lives as a row-level policy rather than in this file). So
// adding a stranger by their link shows you nothing until they add you too, and
// no approval queue is needed to keep it that way.
//
// Names ride on the rows themselves. A profile is readable only by its owner,
// so each side stores the display name it knows at the time: the follower's
// own name, and the name the invite link carried for the person being added.
//
// Every call is best-effort and returns empty on failure, like core/cloud. The
// one thing surfaced is "the tables don't exist yet" — that is a setup problem
// the UI should say out loud instead of showing an empty friends list forever.

import { sb, currentUserId } from './supabase'
import { env } from './config'
import type { Track } from './types'

export interface Friend {
  userId: string
  name: string
  /** They have added you back — activity only flows when this is true. */
  mutual: boolean
  /** You have added them. False means this is an incoming request only. */
  added: boolean
}

export interface FriendActivity {
  userId: string
  name: string
  picture: string
  track: Track | null
  isPlaying: boolean
  /** Their live Listen Along room, if they are hosting one. */
  roomCode: string | null
  updatedAt: number
}

export type SocialStatus = 'ok' | 'signed-out' | 'unavailable'

// PostgREST's "relation not in schema cache" and Postgres' "undefined table".
const isMissingTable = (e: { code?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01')

/** The link someone else opens to add you. Carries your name for their list. */
export function friendLink(userId: string, name: string): string {
  const p = new URLSearchParams({ friend: userId, n: name.slice(0, 40) })
  return `${env().webOrigin}/?${p.toString()}`
}

/** Pull a friend id (and name) out of a pasted link, or accept a bare id. */
export function parseFriendRef(input: string): { userId: string; name: string } | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    const id = u.searchParams.get('friend')
    if (id) return { userId: id, name: u.searchParams.get('n') || '' }
  } catch {
    /* not a URL — fall through to the bare-id case */
  }
  return /^[\w-]{6,80}$/.test(raw) ? { userId: raw, name: '' } : null
}

export async function fetchFriends(): Promise<{ status: SocialStatus; friends: Friend[] }> {
  const me = await currentUserId()
  if (!sb() || !me) return { status: 'signed-out', friends: [] }
  try {
    const { data, error } = await sb()!
      .from('follows')
      .select('follower_id, followee_id, follower_name, followee_name')
      .or(`follower_id.eq.${me},followee_id.eq.${me}`)
    if (error) return { status: isMissingTable(error) ? 'unavailable' : 'ok', friends: [] }

    const byId = new Map<string, Friend>()
    const get = (userId: string) => {
      let f = byId.get(userId)
      if (!f) {
        f = { userId, name: '', mutual: false, added: false }
        byId.set(userId, f)
      }
      return f
    }
    for (const r of (data ?? []) as Record<string, string>[]) {
      if (r.follower_id === me) {
        const f = get(r.followee_id)
        f.added = true
        if (!f.name) f.name = r.followee_name || ''
      } else {
        const f = get(r.follower_id)
        f.mutual = true
        // Their own name for themselves beats the label an invite link carried.
        if (r.follower_name) f.name = r.follower_name
      }
    }
    const friends = [...byId.values()].map((f) => ({
      ...f,
      mutual: f.mutual && f.added,
      name: f.name || 'Listener',
    }))
    return { status: 'ok', friends }
  } catch {
    return { status: 'ok', friends: [] }
  }
}

export async function addFriend(userId: string, name: string, myName: string): Promise<boolean> {
  const me = await currentUserId()
  if (!sb() || !me || userId === me) return false
  try {
    const { error } = await sb()!.from('follows').upsert(
      {
        follower_id: me,
        followee_id: userId,
        follower_name: myName.slice(0, 60),
        followee_name: name.slice(0, 60),
      },
      { onConflict: 'follower_id,followee_id' },
    )
    return !error
  } catch {
    return false
  }
}

export async function removeFriend(userId: string): Promise<void> {
  const me = await currentUserId()
  if (!sb() || !me) return
  try {
    await sb()!.from('follows').delete().eq('follower_id', me).eq('followee_id', userId)
  } catch {
    /* best-effort */
  }
}

/** What mutual friends are playing. RLS returns only rows this user may see. */
export async function fetchFriendActivity(): Promise<FriendActivity[]> {
  const me = await currentUserId()
  if (!sb() || !me) return []
  try {
    const { data, error } = await sb()!
      .from('listening_activity')
      .select('user_id, name, picture, track, is_playing, room_code, updated_at')
      .neq('user_id', me)
      .order('updated_at', { ascending: false })
      .limit(100)
    if (error || !data) return []
    return (data as Record<string, unknown>[]).map((r) => ({
      userId: String(r.user_id),
      name: String(r.name || 'Listener'),
      picture: String(r.picture || ''),
      track: (r.track as Track | null) ?? null,
      isPlaying: !!r.is_playing,
      roomCode: (r.room_code as string | null) || null,
      updatedAt: Date.parse(String(r.updated_at)) || 0,
    }))
  } catch {
    return []
  }
}

/** Returns false only when the tables are missing, so the caller can stop trying. */
export async function publishActivity(a: {
  name: string
  picture: string
  track: Track | null
  isPlaying: boolean
  roomCode: string | null
}): Promise<boolean> {
  const me = await currentUserId()
  if (!sb() || !me) return true
  try {
    const { error } = await sb()!.from('listening_activity').upsert(
      {
        user_id: me,
        name: a.name.slice(0, 60),
        picture: a.picture,
        track: a.track,
        is_playing: a.isPlaying,
        room_code: a.roomCode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    return !isMissingTable(error)
  } catch {
    return true
  }
}

/** Stop sharing: remove the row rather than leave a stale "last played". */
export async function clearActivity(): Promise<void> {
  const me = await currentUserId()
  if (!sb() || !me) return
  try {
    await sb()!.from('listening_activity').delete().eq('user_id', me)
  } catch {
    /* best-effort */
  }
}
