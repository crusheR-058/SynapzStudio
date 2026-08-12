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

/** Catalogues that contribute to the Artists tab. */
const ARTIST_CATALOGS: CatalogName[] = ['indian', 'hollywood']

/**
 * Every artist across the artist-bearing catalogues, with their scene and track
 * count.
 *
 * The two catalogues describe artists differently: indian.json ships objects
 * carrying a scene and a count, hollywood.json ships bare names. The counts for
 * the latter are derived here so both render through the same card.
 */
export async function loadArtists(): Promise<IndianArtist[]> {
  const loaded = await Promise.all(
    ARTIST_CATALOGS.map((name) => loadCatalog(name).catch(() => null)),
  )

  const out: IndianArtist[] = []
  for (const payload of loaded) {
    if (!payload?.artists?.length) continue

    // Count once per catalogue rather than scanning per artist — the Hollywood
    // list is 55 names over 2,668 tracks, and a filter each would be 146k
    // comparisons for a screen that renders on every tab switch.
    let counts: Map<string, number> | null = null
    if (payload.artists.some((a) => typeof a === 'string')) {
      counts = new Map<string, number>()
      for (const t of payload.tracks) {
        const key = t.artist.trim().toLowerCase()
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }

    for (const a of payload.artists) {
      if (typeof a === 'object') out.push(a)
      else out.push({ name: a, scene: 'Hollywood', count: counts?.get(a.trim().toLowerCase()) ?? 0 })
    }
  }
  return out
}

/** Scene names, in catalogue order, with Hollywood appended. */
export async function loadScenes(): Promise<string[]> {
  const indian = (await loadCatalog('indian').catch(() => null))?.scenes ?? []
  return [...indian, 'Hollywood']
}

/**
 * Tracks for one artist, across every artist-bearing catalogue. Matches on the
 * artist field, case-insensitively — the harvester tags each track with the
 * artist it was collected for, so this is an exact-name lookup rather than a
 * fuzzy search.
 */
export async function tracksByArtist(name: string): Promise<Track[]> {
  const target = name.trim().toLowerCase()
  const lists = await Promise.all(
    ARTIST_CATALOGS.map((n) => loadTracks(n).catch(() => [] as Track[])),
  )
  return lists.flat().filter((t) => t.artist.trim().toLowerCase() === target)
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

/** Warm the catalogues used by search and Artists so both are ready on arrival. */
export function prewarm(): void {
  for (const name of ARTIST_CATALOGS) void loadCatalog(name).catch(() => {})
}
