// Catalogue loading: fetch once, cache to disk, keep in memory for the session.
//
// The catalogues are served as static JSON from the web app (public/catalog/)
// rather than bundled, because Metro has no dynamic import() and all 12,759
// tracks would otherwise sit in the JS bundle, paid on every cold start. Fetched
// and cached, the app starts small and the catalogue refreshes without a store
// release.

import { File, Paths } from 'expo-file-system'
import { env } from '@core/config'
import type { Track } from '@core/types'

export type CatalogName = 'indian' | 'bollywood' | 'hollywood' | 'podcasts' | 'stations'

export interface IndianArtist {
  name: string
  scene: string
  count: number
}

interface CatalogPayload {
  tracks: Track[]
  artists?: (string | IndianArtist)[]
  scenes?: string[]
}

const memory = new Map<CatalogName, CatalogPayload>()
// Requests in flight, so two screens mounting at once fetch once rather than
// twice — the payloads are megabytes and the duplicate is not free.
const inflight = new Map<CatalogName, Promise<CatalogPayload>>()

function cacheFile(name: CatalogName): File {
  return new File(Paths.cache, `synapz-catalog-${name}.json`)
}

export async function loadCatalog(name: CatalogName): Promise<CatalogPayload> {
  const hit = memory.get(name)
  if (hit) return hit

  const running = inflight.get(name)
  if (running) return running

  const job = (async (): Promise<CatalogPayload> => {
    // Disk first — this is the path taken on every launch after the first, and
    // it is what makes the catalogue work with no connection.
    try {
      const f = cacheFile(name)
      if (f.exists) {
        const parsed = JSON.parse(f.textSync()) as CatalogPayload
        if (parsed?.tracks?.length) {
          memory.set(name, parsed)
          return parsed
        }
      }
    } catch {
      // A corrupt or half-written cache must not be fatal; fall through and
      // re-fetch rather than leaving the user with a permanently broken tab.
    }

    const url = `${env().apiBase}/catalog/${name}.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`catalog ${name}: HTTP ${res.status}`)
    const payload = (await res.json()) as CatalogPayload
    if (!payload?.tracks?.length) throw new Error(`catalog ${name}: empty`)

    memory.set(name, payload)
    // Write after returning would be tidier, but a failed write must not fail
    // the load — the catalogue is already usable in memory.
    try {
      cacheFile(name).write(JSON.stringify(payload))
    } catch {
      /* cache is an optimisation, not a requirement */
    }
    return payload
  })().finally(() => inflight.delete(name))

  inflight.set(name, job)
  return job
}

export async function loadTracks(name: CatalogName): Promise<Track[]> {
  return (await loadCatalog(name)).tracks
}

/** Artists with their scene and track count. Indian catalogue only. */
export async function loadIndianArtists(): Promise<IndianArtist[]> {
  const c = await loadCatalog('indian')
  return (c.artists ?? []).filter((a): a is IndianArtist => typeof a === 'object')
}

export async function loadScenes(): Promise<string[]> {
  return (await loadCatalog('indian')).scenes ?? []
}

/**
 * Tracks for one artist. Matches on the artist field, case-insensitively —
 * the harvester tags each track with the artist it was collected for, so this
 * is an exact-name lookup rather than a fuzzy search.
 */
export async function tracksByArtist(name: string): Promise<Track[]> {
  const target = name.trim().toLowerCase()
  const tracks = await loadTracks('indian')
  return tracks.filter((t) => t.artist.trim().toLowerCase() === target)
}

/** Substring search across already-loaded catalogues. Instant, and offline. */
export function searchLoaded(query: string, limit = 60): Track[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const out: Track[] = []
  for (const payload of memory.values()) {
    for (const t of payload.tracks) {
      if (t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)) {
        out.push(t)
        if (out.length >= limit) return out
      }
    }
  }
  return out
}

/** Warm the catalogues used by search so results are there when typing starts. */
export function prewarm(): void {
  void loadCatalog('indian').catch(() => {})
  void loadCatalog('hollywood').catch(() => {})
}
