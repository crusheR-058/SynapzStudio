// Renderer-side bridge to Discord Rich Presence.
//
// The desktop shell (Electron) injects `window.synapz` via a preload script. On
// the plain web build that object is absent, so every function here is a safe
// no-op — the browser can't reach Discord anyway. All calls are fire-and-forget
// and must never disrupt playback.

import type { Track } from './types'

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

export function pushPresence(
  track: Track | null,
  opts: { isPlaying: boolean; positionSec: number },
): void {
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
  })
}

export function clearPresence(): void {
  bridge()?.clearPresence?.()
}
