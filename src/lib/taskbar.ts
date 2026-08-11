// Renderer-side bridge to the Windows taskbar mini-player.
//
// The desktop shell turns the taskbar hover preview into a player: transport
// buttons under the thumbnail, and the thumbnail itself cropped to the app's
// player bar (see electron/thumbar.cjs). This module feeds it what it needs —
// the current track, and where the player bar sits on screen.
//
// Like the Discord bridge, everything here is a no-op on the plain web build
// (and on macOS/Linux, where the main process ignores it) and must never be
// able to disrupt playback.

import type { Track } from './types'

export type MediaAction = 'prev' | 'playpause' | 'next'

interface NowPlaying {
  hasTrack: boolean
  isPlaying: boolean
  title: string
  artist: string
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface TaskbarBridge {
  isDesktop?: boolean
  setNowPlaying?: (state: NowPlaying) => void
  setPlayerRect?: (rect: Rect) => void
  onMediaControl?: (cb: (action: MediaAction) => void) => () => void
}

const bridge = (): TaskbarBridge | undefined =>
  (window as unknown as { synapz?: TaskbarBridge }).synapz

const noop = () => {}

/** Mirror the current track up to the thumbnail toolbar. */
export function pushNowPlaying(track: Track | null, opts: { isPlaying: boolean }): void {
  const api = bridge()
  if (!api?.isDesktop || !api.setNowPlaying) return
  api.setNowPlaying({
    hasTrack: !!track,
    isPlaying: !!track && opts.isPlaying,
    title: track?.title || '',
    artist: track?.artist || '',
  })
}

/** Subscribe to clicks on the taskbar transport buttons. Returns an unsubscribe. */
export function onMediaControl(cb: (action: MediaAction) => void): () => void {
  const api = bridge()
  if (!api?.isDesktop || !api.onMediaControl) return noop
  return api.onMediaControl(cb)
}

/**
 * Keep the shell told where `el` (the player bar) is, so it can crop the taskbar
 * preview to it. Re-measures whenever the bar resizes or the window does — the
 * bar grows when a track loads and reflows on maximize, and a stale rect would
 * crop the preview to the wrong slice of the window. Returns a cleanup.
 */
export function watchPlayerRect(el: HTMLElement | null): () => void {
  const api = bridge()
  if (!el || !api?.isDesktop || !api.setPlayerRect) return noop
  const send = api.setPlayerRect

  const measure = () => {
    const r = el.getBoundingClientRect()
    // Round outward and pad a little: the crop should read as a deliberate
    // frame around the bar, not a hairline cut through its rounded corners.
    const pad = 6
    send({
      x: Math.max(0, Math.floor(r.left) - pad),
      y: Math.max(0, Math.floor(r.top) - pad),
      width: Math.ceil(r.width) + pad * 2,
      height: Math.ceil(r.height) + pad * 2,
    })
  }

  measure()
  const ro = new ResizeObserver(measure)
  ro.observe(el)
  window.addEventListener('resize', measure)
  return () => {
    ro.disconnect()
    window.removeEventListener('resize', measure)
  }
}
