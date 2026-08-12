// Shareable links to a single track — what the Discord "Play on Synapz" button
// points at, and what /play/<source>/<id> resolves back into a playable Track.
//
// The link is self-contained rather than a lookup key. A YouTube track needs no
// server round-trip to reconstruct: the IFrame plays by video id, artwork is
// derived from the id, and streamUrl is unused for that source — so title and
// artist ride along in the query string and the page can play immediately.
// Audius is the exception: its audio lives behind a resolved stream URL, so
// those are re-fetched by id.

import type { Track } from './types'
import { fetchTrack } from './audius'
import { webOrigin } from './listen'

// Discord rejects a button URL over 512 characters, and the whole activity with
// it. Headroom below that, since the origin is overridable and may be longer.
const URL_LIMIT = 450
const MAX_TITLE = 70
const MAX_ARTIST = 45

/**
 * Build the shareable link, trimming metadata until the URL fits.
 *
 * A character cap alone cannot bound this. Devanagari percent-encodes to about
 * NINE characters each (3 UTF-8 bytes, 3 chars per byte), so a 70-character
 * Hindi title becomes ~630 characters of URL — over the limit on its own, in an
 * app whose catalogue is largely Hindi. So the length that matters is the
 * encoded one, measured on the finished URL and trimmed until it fits.
 */
export function trackUrl(t: Track): string {
  const base = `${webOrigin()}/play/${t.source}/${encodeURIComponent(t.id)}`
  let title = (t.title || '').slice(0, MAX_TITLE)
  let artist = (t.artist || '').slice(0, MAX_ARTIST)

  const build = () => {
    const p = new URLSearchParams()
    if (title) p.set('t', title)
    if (artist) p.set('a', artist)
    if (t.duration) p.set('d', String(Math.round(t.duration)))
    const q = p.toString()
    return q ? `${base}?${q}` : base
  }

  let url = build()
  // Title first — it is the longest and the most compressible. Artist only if
  // that wasn't enough. Both keep a readable stub rather than vanishing.
  while (url.length > URL_LIMIT && title.length > 8) {
    title = title.slice(0, Math.max(8, Math.floor(title.length * 0.75)))
    url = build()
  }
  while (url.length > URL_LIMIT && artist.length > 4) {
    artist = artist.slice(0, Math.max(4, Math.floor(artist.length * 0.75)))
    url = build()
  }
  return url
}

export interface TrackRef {
  source: string
  id: string
  title: string
  artist: string
  duration: number
}

const PATH_RE = /^\/play\/(audius|youtube)\/([\w-]{3,64})\/?$/i

/** Parse a /play/<source>/<id> location (web) or the same shape from a deep link. */
export function parseTrackRef(pathname: string, search: string): TrackRef | null {
  const m = PATH_RE.exec(pathname)
  if (!m) return null
  const q = new URLSearchParams(search)
  return {
    source: m[1].toLowerCase(),
    id: decodeURIComponent(m[2]),
    title: q.get('t') || '',
    artist: q.get('a') || '',
    duration: Number(q.get('d')) || 0,
  }
}

/** The track link in the current URL, if this is a /play/… page. */
export function trackRefFromUrl(): TrackRef | null {
  return parseTrackRef(window.location.pathname, window.location.search)
}

/** Drop /play/… from the address bar once handled, so a refresh doesn't replay. */
export function clearTrackRefFromUrl(): void {
  if (trackRefFromUrl()) window.history.replaceState(null, '', '/')
}

interface PlayBridge {
  isDesktop?: boolean
  consumePendingPlay?: () => Promise<string | null>
  onPlayTrack?: (cb: (path: string) => void) => () => void
}
const bridge = (): PlayBridge | undefined => (window as unknown as { synapz?: PlayBridge }).synapz

/**
 * Watch every route a track link can arrive by: the current /play/… URL (web),
 * a synapz://play/… deep link while the app runs, and one that arrived during a
 * cold start the link itself triggered. Returns an unsubscribe.
 */
export function watchTrackLinks(cb: (ref: TrackRef) => void): () => void {
  const fromUrl = trackRefFromUrl()
  if (fromUrl) cb(fromUrl)

  const api = bridge()
  if (!api?.isDesktop) return () => {}

  const fromPath = (p: string) => {
    const [pathname, search] = p.split('?')
    const ref = parseTrackRef(pathname, search ? `?${search}` : '')
    if (ref) cb(ref)
  }
  api.consumePendingPlay?.().then((p) => {
    if (p) fromPath(p)
  })
  return api.onPlayTrack?.(fromPath) ?? (() => {})
}

export async function resolveTrackRef(r: TrackRef): Promise<Track | null> {
  if (r.source === 'audius') {
    try {
      return await fetchTrack(r.id)
    } catch {
      return null
    }
  }
  // YouTube: everything needed is derivable, so this never fails or waits.
  return {
    id: r.id,
    source: 'youtube',
    title: r.title || 'Shared track',
    artist: r.artist || '',
    artistHandle: '',
    artwork: `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`,
    artworkLarge: `https://i.ytimg.com/vi/${r.id}/maxresdefault.jpg`,
    duration: r.duration,
    playCount: 0,
    streamUrl: '',
  }
}
