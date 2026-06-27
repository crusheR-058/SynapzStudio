import type { Track, Playlist } from './types'

/**
 * Audius API client.
 *
 * Audius is a free, legal, decentralized music streaming network. Reads go
 * through a "discovery node" — we bootstrap the list of healthy nodes from
 * https://api.audius.co, then talk to one of them. The stream endpoint
 * (/v1/tracks/{id}/stream) 302-redirects to the actual audio file, so it can
 * be used directly as the `src` of an <audio> element to play full tracks.
 *
 * Docs: https://docs.audius.org/developers/api/
 */

const APP_NAME = 'SynapzStudio'
const BOOTSTRAP = 'https://api.audius.co'

// Used if the bootstrap endpoint is unreachable.
const FALLBACK_HOSTS = [
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co',
  'https://audius-discovery-1.cultur3stake.com',
  'https://audius-metadata-1.figment.io',
]

// The pool of discovery nodes we'll try, in order. Starts with the fallbacks and
// gets replaced by the live healthy-node registry once bootstrap resolves.
// `currentHost` is the last node confirmed working — pinned so subsequent reads
// AND stream URLs use a node we know is up.
let hosts: string[] = [...FALLBACK_HOSTS]
let currentHost = FALLBACK_HOSTS[0]
let bootstrapPromise: Promise<void> | null = null

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Pull the live list of healthy discovery nodes once. Audius returns many; we
// keep a shuffled subset (so load is spread) plus the hard-coded fallbacks as a
// backstop. Never throws — on failure we keep the fallback list.
async function ensureHosts(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        const res = await fetch(BOOTSTRAP, { signal: AbortSignal.timeout(6000) })
        const json = await res.json()
        const list: string[] = Array.isArray(json?.data) ? json.data : []
        if (list.length) {
          const merged = Array.from(new Set([...shuffle(list).slice(0, 12), ...FALLBACK_HOSTS]))
          hosts = merged
          currentHost = merged[0]
        }
      } catch {
        hosts = [...FALLBACK_HOSTS]
        currentHost = FALLBACK_HOSTS[0]
      }
    })()
  }
  return bootstrapPromise
}

/** Build a streamable URL for a track id (safe to call before host resolves). */
export function streamUrl(id: string): string {
  return `${currentHost}/v1/tracks/${id}/stream?app_name=${APP_NAME}`
}

async function fetchJson(
  host: string,
  path: string,
  params: Record<string, string | number | undefined>,
  timeoutMs: number,
): Promise<any> {
  const url = new URL(host + path)
  url.searchParams.set('app_name', APP_NAME)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`Audius ${path} -> ${res.status}`)
  return res.json()
}

// Try the current node first, then fail over to other nodes. A short per-node
// timeout means a dead/slow node is abandoned fast instead of stalling the UI.
// The first node that answers gets pinned as `currentHost` for later calls.
async function api<T = any>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  await ensureHosts()
  const order = [currentHost, ...hosts.filter((h) => h !== currentHost)]
  const maxAttempts = Math.min(order.length, 5)
  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    const host = order[i]
    try {
      const json = await fetchJson(host, path, params, 7000)
      currentHost = host
      return json as T
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error(`Audius ${path} failed on all nodes`)
}

function mapTrack(t: any): Track {
  const art = t?.artwork || {}
  return {
    id: String(t.id),
    source: 'audius',
    title: t.title ?? 'Untitled',
    artist: t.user?.name ?? t.user?.handle ?? 'Unknown Artist',
    artistHandle: t.user?.handle ?? '',
    artwork: art['480x480'] || art['150x150'] || '',
    artworkLarge: art['1000x1000'] || art['480x480'] || art['150x150'] || '',
    duration: Number(t.duration) || 0,
    genre: t.genre || undefined,
    mood: t.mood || undefined,
    playCount: t.play_count ?? 0,
    favoriteCount: t.favorite_count ?? 0,
    streamUrl: `${currentHost}/v1/tracks/${t.id}/stream?app_name=${APP_NAME}`,
  }
}

function mapPlaylist(p: any): Playlist {
  const art = p?.artwork || {}
  return {
    id: String(p.id),
    name: p.playlist_name ?? 'Untitled Playlist',
    owner: p.user?.name ?? p.user?.handle ?? '',
    ownerHandle: p.user?.handle ?? '',
    artwork: art['480x480'] || art['150x150'] || '',
    artworkLarge: art['1000x1000'] || art['480x480'] || art['150x150'] || '',
    trackCount: p.track_count ?? p.total_track_count ?? 0,
    description: p.description ?? '',
    totalPlays: p.total_play_count ?? 0,
  }
}

function isPlayable(t: Track): boolean {
  // Some tracks are gated / premium (stream not free). Keep things simple and
  // just require a positive duration; the stream endpoint handles the rest.
  return t.duration > 0
}

export async function fetchTrending(genre?: string, time = 'week'): Promise<Track[]> {
  const json = await api('/v1/tracks/trending', { genre, time })
  return (json.data ?? []).map(mapTrack).filter(isPlayable)
}

export async function fetchUnderground(): Promise<Track[]> {
  const json = await api('/v1/tracks/trending/underground')
  return (json.data ?? []).map(mapTrack).filter(isPlayable)
}

export async function searchTracks(query: string): Promise<Track[]> {
  if (!query.trim()) return []
  const json = await api('/v1/tracks/search', { query })
  return (json.data ?? []).map(mapTrack).filter(isPlayable)
}

export async function fetchTrendingPlaylists(time = 'week'): Promise<Playlist[]> {
  const json = await api('/v1/playlists/trending', { time })
  return (json.data ?? []).map(mapPlaylist)
}

export async function searchPlaylists(query: string): Promise<Playlist[]> {
  if (!query.trim()) return []
  const json = await api('/v1/playlists/search', { query })
  return (json.data ?? []).map(mapPlaylist)
}

export async function fetchPlaylist(id: string): Promise<Playlist | null> {
  const json = await api(`/v1/playlists/${id}`)
  const p = Array.isArray(json.data) ? json.data[0] : json.data
  return p ? mapPlaylist(p) : null
}

export async function fetchPlaylistTracks(id: string): Promise<Track[]> {
  const json = await api(`/v1/playlists/${id}/tracks`)
  return (json.data ?? []).map(mapTrack).filter(isPlayable)
}

export async function fetchTrack(id: string): Promise<Track | null> {
  const json = await api(`/v1/tracks/${id}`)
  const t = Array.isArray(json.data) ? json.data[0] : json.data
  return t ? mapTrack(t) : null
}

/** Warm the host selection up-front so the first stream URL is correct. */
export async function warmup(): Promise<string> {
  await ensureHosts()
  return currentHost
}
