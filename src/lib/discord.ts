// Renderer-side bridge to Discord Rich Presence.
//
// The desktop shell (Electron) injects `window.synapz` via a preload script. On
// the plain web build that object is absent, so every function here is a safe
// no-op — the browser can't reach Discord anyway. All calls are fire-and-forget
// and must never disrupt playback.

import type { Track } from './types'
import { roomUrl } from './listen'

interface SynapzBridge {
  isDesktop?: boolean
  setPresence: (data: PresencePayload) => void
  clearPresence: () => void
  discordStatus: () => Promise<DiscordStatus>
}

interface PresencePayload {
  title: string
  artist: string
  artwork: string
  durationSec: number
  positionSec: number
  isPlaying: boolean
  /** Live Listen Along room, if hosting — becomes a join button on the profile. */
  listenUrl?: string
}

export interface DiscordStatus {
  configured: boolean
  connected: boolean
}

const bridge = (): SynapzBridge | undefined =>
  (window as unknown as { synapz?: SynapzBridge }).synapz

/** True only inside the Electron desktop app. */
export function isDesktop(): boolean {
  return !!bridge()?.isDesktop
}

const OPT_KEY = 'synapz:discord'

/** Opt-in flag; defaults to ON in the desktop app (the user installed it for this). */
export function discordEnabled(): boolean {
  try {
    return localStorage.getItem(OPT_KEY) !== '0'
  } catch {
    return true
  }
}

export function setDiscordEnabled(on: boolean): void {
  try {
    localStorage.setItem(OPT_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (!on) clearPresence()
}

export async function getDiscordStatus(): Promise<DiscordStatus | null> {
  const api = bridge()
  if (!api?.discordStatus) return null
  try {
    return await api.discordStatus()
  } catch {
    return null
  }
}

// The room this user is currently hosting, if any. Kept module-level rather
// than threaded through every pushPresence() call site: presence is pushed from
// several places (track change, play/pause, seek) that have no idea a Listen
// Along session exists, and all of them must carry the join button once it does.
let listenRoomCode: string | null = null

/** Set (or clear, with null) the room advertised on the Discord profile. */
export function setListenRoom(code: string | null): void {
  listenRoomCode = code
  // Re-push so the button appears/disappears now rather than at the next track.
  if (lastPushed) pushPresence(lastPushed.track, lastPushed.opts)
}

let lastPushed: { track: Track | null; opts: { isPlaying: boolean; positionSec: number } } | null =
  null

export function pushPresence(
  track: Track | null,
  opts: { isPlaying: boolean; positionSec: number },
): void {
  lastPushed = { track, opts }
  const api = bridge()
  if (!api?.isDesktop) return
  if (!discordEnabled()) return
  if (!track) {
    api.clearPresence()
    return
  }
  api.setPresence({
    title: track.title,
    artist: track.artist,
    // Prefer the smaller thumbnail: YouTube's hqdefault (track.artwork) always
    // exists, whereas maxresdefault (track.artworkLarge) 404s for many videos —
    // and a 404 makes Discord show nothing. Audius carries both, so 480px is fine.
    artwork: track.artwork || track.artworkLarge || '',
    durationSec: track.duration || 0,
    positionSec: Math.max(0, Math.floor(opts.positionSec || 0)),
    isPlaying: opts.isPlaying,
    listenUrl: listenRoomCode ? roomUrl(listenRoomCode) : undefined,
  })
}

export function clearPresence(): void {
  bridge()?.clearPresence?.()
}
