import type { Track } from './types'
import { searchYT } from './youtube'
import { searchTracks } from './audius'

export interface SpotifyTrackRef {
  title: string
  artist: string
  durationMs: number
}

export interface SpotifyImport {
  kind: 'playlist' | 'album' | 'track'
  name: string
  image: string
  total: number
  tracks: SpotifyTrackRef[]
}

/** Detect a Spotify playlist/album/track link (URL or spotify: URI). */
export function parseSpotifyUrl(input: string): { type: string; id: string } | null {
  const s = (input || '').trim()
  let m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i)
  if (m) return { type: m[1].toLowerCase(), id: m[2] }
  m = s.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i)
  if (m) return { type: m[1].toLowerCase(), id: m[2] }
  return null
}

export const isSpotifyUrl = (s: string): boolean => !!parseSpotifyUrl(s)

/** Ask our server to read the playlist's track list (titles + artists). */
export async function fetchSpotifyImport(url: string): Promise<SpotifyImport> {
  const res = await fetch(`/api/spotify/playlist?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Import failed (${res.status})`)
  }
  return res.json()
}

// crude similarity so we don't accept a wildly different match
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function looksLikeMatch(ref: SpotifyTrackRef, cand: Track): boolean {
  const title = norm(ref.title)
  const ct = norm(cand.title)
  if (!title) return true
  const titleHit = ct.includes(title.split(' ').slice(0, 3).join(' ')) || title.includes(ct.slice(0, 8))
  // duration within 25s when both known
  const durOk =
    !ref.durationMs || !cand.duration || Math.abs(cand.duration - ref.durationMs / 1000) <= 25
  return titleHit && durOk
}

/**
 * Resolve one Spotify track to a playable Track from our own sources.
 * YouTube first (has basically everything incl. Bollywood), Audius as fallback.
 */
export async function resolveTrack(ref: SpotifyTrackRef): Promise<Track | null> {
  const q = `${ref.title} ${ref.artist}`.trim()
  if (!q) return null
  try {
    const yt = await searchYT(q)
    if (yt.length) {
      const hit = yt.find((t) => looksLikeMatch(ref, t)) || yt[0]
      return hit
    }
  } catch {
    /* fall through to Audius */
  }
  try {
    const au = await searchTracks(q)
    if (au.length) return au.find((t) => looksLikeMatch(ref, t)) || au[0]
  } catch {
    /* no match */
  }
  return null
}
