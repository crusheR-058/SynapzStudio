// Listen Along — synchronised playback between users.
//
// One person HOSTS: their player is the source of truth. Everyone else is a
// GUEST whose player is slaved to the host's state. Transport is Supabase
// Realtime, which is already in the stack.
//
// Two channels of state, deliberately:
//
//   • The `listen_rooms` row is a SNAPSHOT, written only when something
//     meaningful changes (track, play/pause, seek). It exists so a guest who
//     joins mid-song starts in sync immediately rather than waiting for the
//     next tick, and so a link can be validated before the UI commits to it.
//   • The Realtime broadcast carries a TICK every second or so. Far too chatty
//     to put through Postgres, and it doesn't need durability — a dropped tick
//     is corrected by the next one.
//
// On clock skew: ticks carry no timestamp, and drift is measured by comparing
// the host's reported position against the guest's own at the moment the tick
// lands. Comparing wall clocks across machines would need offset estimation and
// get it wrong when someone's clock is minutes off; this way the only error is
// network transit (tens of ms), which is inaudible.
//
// On correction: by seeking, not by trimming playback rate. Rate-trimming is
// gentler, but YouTube's setPlaybackRate only accepts discrete steps
// (0.25/0.5/…/2), so a 2% nudge silently snaps back to 1.0 — and YouTube is the
// bulk of the catalog. Seeking works identically on every source.

import type { Track } from './types'
import { sb } from './supabase'
import { env } from './config'
import type { RealtimeChannel } from '@supabase/supabase-js'

/** Where a shared room link points. Set per platform via configure(). */
export const webOrigin = () => env().webOrigin

export const roomUrl = (code: string) => `${webOrigin()}/listen/${code}`

/** Ticks per second is overkill; once a second is plenty to hold sub-second sync. */
const TICK_MS = 1000
/**
 * Correct only past this much drift. Small enough to stay imperceptible
 * (a listener can't hear a shared song being ~1s apart), large enough that
 * normal jitter and YouTube's rebuffering don't trigger a seek storm.
 */
const DRIFT_TOLERANCE_SEC = 1.5
/** Never re-seek faster than this, however bad the drift looks. */
const MIN_SEEK_INTERVAL_MS = 3000

export interface RoomState {
  track: Track | null
  positionSec: number
  isPlaying: boolean
}

export interface RoomMember {
  userId: string
  name: string
  isHost: boolean
}

export interface Room {
  code: string
  hostId: string
  hostName: string
  isHost: boolean
}

/** What a guest's player must expose for the engine to drive it. */
export interface GuestControls {
  playTrack: (track: Track) => void
  seek: (seconds: number) => void
  setPlaying: (playing: boolean) => void
  getPosition: () => number
  getTrackId: () => string | null
  isPlaying: () => boolean
}

type TickPayload = { track: Track | null; positionSec: number; isPlaying: boolean }

const rand = (n: number) => {
  // Link codes are the capability that guards a room, so they come from the
  // CSPRNG rather than Math.random. Ambiguous glyphs (0/O, 1/I/l) are omitted
  // so a code stays readable if someone reads one aloud.
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export const newRoomCode = () => rand(8)

// ---------------------------------------------------------------- hosting ---

export interface HostSession {
  room: Room
  /** Push the current player state. Cheap to call often — ticks are throttled. */
  publish: (state: RoomState) => void
  /** Tear the room down and tell guests it's over. */
  close: () => Promise<void>
  /** Fires when the guest list changes. */
  onMembers: (cb: (members: RoomMember[]) => void) => void
}

export async function hostRoom(hostName: string): Promise<HostSession | null> {
  if (!sb()) return null
  const { data: auth } = await sb()!.auth.getUser()
  const user = auth?.user
  if (!user) return null

  const code = newRoomCode()
  const room: Room = { code, hostId: user.id, hostName, isHost: true }

  const { error } = await sb()!.from('listen_rooms').insert({
    code,
    host_id: user.id,
    host_name: hostName,
    position_sec: 0,
    is_playing: false,
  })
  if (error) return null

  const channel = sb()!.channel(`listen:${code}`, {
    config: { presence: { key: user.id } },
  })

  let membersCb: ((m: RoomMember[]) => void) | null = null
  const readMembers = () => {
    if (!membersCb) return
    const raw = channel.presenceState() as Record<string, Array<Record<string, unknown>>>
    const members: RoomMember[] = Object.entries(raw).map(([userId, metas]) => ({
      userId,
      name: String(metas?.[0]?.name || 'Listener'),
      isHost: userId === user.id,
    }))
    membersCb(members)
  }
  channel.on('presence', { event: 'sync' }, readMembers)

  await channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ name: hostName, host: true })
    }
  })

  // Snapshot writes are debounced and only fire on meaningful change; ticks are
  // throttled. Together they keep a 1s heartbeat from becoming 1 write/sec.
  let lastTick = 0
  let lastSnapshotKey = ''

  const publish = (state: RoomState) => {
    const now = Date.now()
    const payload: TickPayload = {
      track: state.track,
      positionSec: state.positionSec,
      isPlaying: state.isPlaying,
    }

    if (now - lastTick >= TICK_MS) {
      lastTick = now
      channel.send({ type: 'broadcast', event: 'tick', payload }).catch(() => {})
    }

    // Only the things a late joiner needs go to Postgres, and only on change.
    const key = `${state.track?.id ?? ''}|${state.isPlaying}`
    if (key !== lastSnapshotKey) {
      lastSnapshotKey = key
      void sb()!
        .from('listen_rooms')
        .update({
          track: state.track,
          position_sec: state.positionSec,
          is_playing: state.isPlaying,
          updated_at: new Date().toISOString(),
        })
        .eq('code', code)
        .then(() => {})
    }
  }

  const close = async () => {
    try {
      await channel.send({ type: 'broadcast', event: 'ended', payload: {} })
    } catch {
      /* the room is going away regardless */
    }
    try {
      await sb()!.removeChannel(channel)
    } catch {
      /* noop */
    }
    try {
      await sb()!.from('listen_rooms').delete().eq('code', code)
    } catch {
      /* prune_stale_listen_rooms will get it */
    }
  }

  return {
    room,
    publish,
    close,
    onMembers: (cb) => {
      membersCb = cb
      readMembers()
    },
  }
}

// --------------------------------------------------------------- joining ---

export interface RoomPreview {
  code: string
  hostName: string
  track: Track | null
  isPlaying: boolean
  /** Stale by design — see the join path. Only a starting point. */
  positionSec: number
}

/**
 * Look a room up by code without joining — this is what the web landing page
 * shows ("Alice is listening to X") before asking the visitor to open the app.
 * Readable signed-out, by design: the code is the capability.
 */
export async function peekRoom(code: string): Promise<RoomPreview | null> {
  if (!sb() || !code) return null
  const { data, error } = await sb()!
    .from('listen_rooms')
    .select('code, host_name, track, is_playing, position_sec')
    .eq('code', code)
    .maybeSingle()
  if (error || !data) return null
  return {
    code: data.code as string,
    hostName: (data.host_name as string) || 'Someone',
    track: (data.track as Track | null) ?? null,
    isPlaying: !!data.is_playing,
    positionSec: Number(data.position_sec) || 0,
  }
}

export interface GuestSession {
  room: Room
  leave: () => Promise<void>
  onMembers: (cb: (members: RoomMember[]) => void) => void
  /** Host closed the room, or it vanished. */
  onEnded: (cb: () => void) => void
}

export async function joinRoom(
  code: string,
  guestName: string,
  controls: GuestControls,
): Promise<GuestSession | null> {
  if (!sb()) return null
  const { data: auth } = await sb()!.auth.getUser()
  const user = auth?.user
  if (!user) return null

  const snapshot = await peekRoom(code)
  if (!snapshot) return null

  const { data: row } = await sb()!
    .from('listen_rooms')
    .select('host_id')
    .eq('code', code)
    .maybeSingle()

  const room: Room = {
    code,
    hostId: (row?.host_id as string) || '',
    hostName: snapshot.hostName,
    isHost: false,
  }

  let lastSeekAt = 0
  let endedCb: (() => void) | null = null
  let membersCb: ((m: RoomMember[]) => void) | null = null
  /** Most recent host state, so a delayed seek lands on a fresh position. */
  let latest: TickPayload | null = null
  /** Armed while a newly-loaded track is still being seeked into place. */
  // ReturnType, not number: the DOM's setTimeout returns a number but React
  // Native's returns a Timeout object, and this file is shared by both.
  let loadSeek: ReturnType<typeof setTimeout> | null = null

  /**
   * The whole sync loop. Called per tick, and once with the snapshot on join.
   *
   * Order matters: load the track before correcting position, because a track
   * change resets position to 0 and any seek issued first would be discarded.
   */
  const apply = (state: TickPayload) => {
    latest = state
    if (!state.track) return

    if (controls.getTrackId() !== state.track.id) {
      controls.playTrack(state.track)
      // Sources need a beat before they'll accept a seek — YouTube silently
      // drops seekTo() issued before the video is cued. Seek against `latest`
      // rather than this tick's position: loading can outlast a tick or two,
      // and jumping to where the host was a second ago just starts us behind.
      if (loadSeek) clearTimeout(loadSeek)
      loadSeek = setTimeout(() => {
        loadSeek = null
        const pos = latest?.positionSec ?? state.positionSec
        controls.seek(pos)
        lastSeekAt = Date.now()
      }, 800)
      return
    }

    // Don't fight the load-seek that's still pending.
    if (loadSeek) return

    if (controls.isPlaying() !== state.isPlaying) controls.setPlaying(state.isPlaying)

    // Only chase position while playing — a paused host isn't moving, and
    // correcting against a frozen clock just fights the listener.
    if (!state.isPlaying) return

    const drift = state.positionSec - controls.getPosition()
    const now = Date.now()
    if (Math.abs(drift) > DRIFT_TOLERANCE_SEC && now - lastSeekAt > MIN_SEEK_INTERVAL_MS) {
      lastSeekAt = now
      controls.seek(state.positionSec)
    }
  }

  const channel = sb()!.channel(`listen:${code}`, {
    config: { presence: { key: user.id } },
  })

  channel.on('broadcast', { event: 'tick' }, ({ payload }) => apply(payload as TickPayload))
  channel.on('broadcast', { event: 'ended' }, () => endedCb?.())
  channel.on('presence', { event: 'sync' }, () => {
    if (!membersCb) return
    const raw = channel.presenceState() as Record<string, Array<Record<string, unknown>>>
    membersCb(
      Object.entries(raw).map(([userId, metas]) => ({
        userId,
        name: String(metas?.[0]?.name || 'Listener'),
        isHost: !!metas?.[0]?.host,
      })),
    )
  })

  await channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ name: guestName, host: false })
    }
  })

  // Start from the snapshot so there's no silent gap until the first tick. Its
  // position is stale by design (the row is only rewritten on track/play
  // changes, not every second) — it just gets the right track loading. The
  // 800ms load-seek above then reads `latest`, which by then is the first real
  // tick, so playback lands on the host's true position rather than this one.
  if (snapshot.track) {
    apply({
      track: snapshot.track,
      positionSec: snapshot.positionSec,
      isPlaying: snapshot.isPlaying,
    })
  }

  return {
    room,
    leave: async () => {
      try {
        await sb()!.removeChannel(channel)
      } catch {
        /* noop */
      }
    },
    onMembers: (cb) => {
      membersCb = cb
    },
    onEnded: (cb) => {
      endedCb = cb
    },
  }
}
