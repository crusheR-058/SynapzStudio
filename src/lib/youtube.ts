import type { Track } from './types'
import { Capacitor } from '@capacitor/core'
import { apiUrl } from './apiBase'

/**
 * YouTube client — search via the YouTube Data API v3, playback via the
 * official IFrame Player (wired up in player.tsx). This unlocks the full
 * Hindi / Bollywood catalog (and basically anything else on YouTube).
 *
 * Requires a free API key from https://console.cloud.google.com (enable
 * "YouTube Data API v3" → create an API key). The key is stored in
 * localStorage so no rebuild is needed; an env var VITE_YOUTUBE_API_KEY is
 * used as a fallback.
 *
 * Quota strategy (YouTube Data API v3, free tier = 10,000 units/day):
 *  - search.list costs 100 units/call and returns only ids → it's the expensive
 *    part. videos.list costs just 1 unit and returns full metadata for up to 50
 *    ids at once. So we:
 *    (1) ask search.list for the max 50 results per call (same 100-unit cost,
 *        double the songs),
 *    (2) hydrate them with ONE videos.list call (1 unit / 50 ids),
 *    (3) CACHE every result by query in localStorage, so a repeated search
 *        (fixed stations, Bollywood chips, podcast shows, re-imports) costs 0,
 *    (4) get the "popular" feed via videos.list?chart=mostPopular (1 unit) instead
 *        of a 100-unit text search — see fetchPopular().
 */

const KEY_LS = 'synapz:ytkey'

export function getYtKey(): string {
  try {
    return localStorage.getItem(KEY_LS) || ((import.meta as any).env?.VITE_YOUTUBE_API_KEY ?? '')
  } catch {
    return ''
  }
}
export function setYtKey(k: string) {
  try {
    localStorage.setItem(KEY_LS, k.trim())
  } catch {
    /* ignore */
  }
}
export function clearYtKey() {
  try {
    localStorage.removeItem(KEY_LS)
  } catch {
    /* ignore */
  }
}
export function hasYtKey(): boolean {
  return !!getYtKey()
}

export class YtError extends Error {
  code: 'NO_KEY' | 'QUOTA_OR_KEY' | 'HTTP'
  constructor(code: 'NO_KEY' | 'QUOTA_OR_KEY' | 'HTTP', message?: string) {
    super(message ?? code)
    this.code = code
  }
}

function iso8601ToSec(d?: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d ?? '')
  if (!m) return 0
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + +(m[3] || 0)
}

function decodeEntities(s: string): string {
  try {
    const el = document.createElement('textarea')
    el.innerHTML = s
    return el.value
  } catch {
    return s
  }
}

function mapVideo(v: any): Track {
  const sn = v.snippet || {}
  const th = sn.thumbnails || {}
  const art = (th.high || th.medium || th.default || {}).url || ''
  const artL = (th.maxres || th.standard || th.high || th.medium || {}).url || art
  return {
    id: v.id,
    source: 'youtube',
    title: decodeEntities(sn.title || 'Untitled'),
    artist: decodeEntities((sn.channelTitle || 'YouTube').replace(/\s*-\s*Topic$/, '')),
    artistHandle: '',
    artwork: art,
    artworkLarge: artL,
    duration: iso8601ToSec(v.contentDetails?.duration),
    playCount: Number(v.statistics?.viewCount) || 0,
    streamUrl: '',
  }
}

async function get(url: string): Promise<any> {
  const res = await fetch(url)
  if (res.status === 403) throw new YtError('QUOTA_OR_KEY', 'YouTube quota exceeded or key invalid')
  if (!res.ok) throw new YtError('HTTP', `YouTube ${res.status}`)
  return res.json()
}

const API = 'https://www.googleapis.com/youtube/v3'

// Duration window for results. Songs use the defaults (drops shorts & long
// mixes); podcasts pass a wide window (e.g. 10 min – 5 h) to keep full episodes.
export interface SearchOpts {
  minSec?: number
  maxSec?: number
}

export async function searchYouTube(query: string, max = 50, opts: SearchOpts = {}): Promise<Track[]> {
  const key = getYtKey()
  if (!key) throw new YtError('NO_KEY')
  if (!query.trim()) return []
  const minSec = opts.minSec ?? 1
  const maxSec = opts.maxSec ?? 60 * 30

  // 100-unit call — grab the max 50 ids so each expensive search yields more.
  const sj = await get(
    `${API}/search?part=snippet&type=video&videoEmbeddable=true&maxResults=${Math.min(max, 50)}` +
      `&q=${encodeURIComponent(query)}&key=${key}`,
  )
  const ids: string[] = (sj.items || []).map((it: any) => it.id?.videoId).filter(Boolean)
  if (!ids.length) return []

  // 1-unit call — hydrate up to 50 ids in a single request.
  const dj = await get(
    `${API}/videos?part=contentDetails,snippet,statistics&id=${ids.slice(0, 50).join(',')}&key=${key}`,
  )
  return (dj.items || [])
    .map(mapVideo)
    .filter((t: Track) => t.duration >= minSec && t.duration <= maxSec)
}

/**
 * Popular music feed via videos.list?chart=mostPopular (videoCategoryId=10).
 * Costs just 1 unit and returns full metadata — no 100-unit search needed.
 * Used as the Home fallback when Audius is unreachable. In local dev (no key)
 * it falls back to the keyless yt-dlp helper.
 */
export async function fetchPopular(regionCode = 'IN', max = 25): Promise<Track[]> {
  const key = getYtKey()
  if (key) {
    try {
      const j = await get(
        `${API}/videos?part=snippet,contentDetails,statistics&chart=mostPopular` +
          `&videoCategoryId=10&regionCode=${regionCode}&maxResults=${Math.min(max, 50)}&key=${key}`,
      )
      const tracks = (j.items || [])
        .map(mapVideo)
        .filter((t: Track) => t.duration >= 60 && t.duration <= 60 * 30)
      if (tracks.length) return tracks
    } catch {
      /* fall through to the keyless helper */
    }
  }
  try {
    return await searchYouTubeLocal('top hits songs official video')
  } catch {
    return []
  }
}

/**
 * Keyless search via the local yt-dlp helper (dev-server middleware at
 * /yt/search). Returns tracks whose `streamUrl` points at /yt/stream, so they
 * play through the normal <audio> element — no API key, no IFrame.
 */
function mapLocal(it: any): Track {
  return {
    id: String(it.id),
    source: 'youtube',
    title: it.title || 'Untitled',
    artist: (it.uploader || 'YouTube').replace(/\s*-\s*Topic$/, ''),
    artistHandle: '',
    artwork: it.thumb || `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg`,
    artworkLarge: it.thumb || `https://i.ytimg.com/vi/${it.id}/maxresdefault.jpg`,
    duration: Number(it.duration) || 0,
    playCount: Number(it.views) || 0,
    // Empty streamUrl → the player uses YouTube's official IFrame player
    // (reliable, no key) keyed by this video id, instead of a fragile
    // direct audio URL.
    streamUrl: '',
  }
}

export async function searchYouTubeLocal(query: string, opts: SearchOpts = {}): Promise<Track[]> {
  if (!query.trim()) return []
  const minSec = opts.minSec ?? 1
  const maxSec = opts.maxSec ?? 60 * 15
  // Fewer results = fewer YouTube search pages = a faster yt-dlp call. On the
  // mobile app apiUrl() points this at the hosted Data-API proxy (same shape).
  const res = await fetch(apiUrl(`/yt/search?q=${encodeURIComponent(query)}&n=20`))
  if (!res.ok) throw new YtError('HTTP', `yt helper ${res.status}`)
  const items = await res.json()
  if (items?.error) throw new YtError('HTTP', items.error)
  return (items || [])
    .map(mapLocal)
    .filter((t: Track) => t.duration >= minSec && t.duration <= maxSec)
}

/* ----------------------------------------------------- search-result cache */

// Persistent cache so a repeated query never re-pays the 100-unit search.
// YouTube tracks play through the IFrame by id, so the stored metadata
// (id/title/artist/thumb/duration) stays valid — a cache hit costs 0 units.
const CACHE_PREFIX = 'synapz:ytc:'
const CACHE_INDEX = 'synapz:ytc:index'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h
const CACHE_MAX = 120 // cap stored queries so localStorage can't balloon

function cacheKey(query: string, opts: SearchOpts): string {
  return `${query.trim().toLowerCase()}|${opts.minSec ?? ''}|${opts.maxSec ?? ''}`
}

function readCache(key: string): Track[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj.t !== 'number' || Date.now() - obj.t > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return Array.isArray(obj.tracks) ? (obj.tracks as Track[]) : null
  } catch {
    return null
  }
}

function writeCache(key: string, tracks: Track[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), tracks }))
    let idx: { k: string; t: number }[] = []
    try {
      idx = JSON.parse(localStorage.getItem(CACHE_INDEX) || '[]')
    } catch {
      idx = []
    }
    idx = idx.filter((e) => e.k !== key)
    idx.push({ k: key, t: Date.now() })
    while (idx.length > CACHE_MAX) {
      const old = idx.shift()
      if (old) localStorage.removeItem(CACHE_PREFIX + old.k)
    }
    localStorage.setItem(CACHE_INDEX, JSON.stringify(idx))
  } catch {
    /* quota / private mode — caching is best-effort */
  }
}

// Dedupe concurrent identical searches so two components don't both spend 100.
const inflight = new Map<string, Promise<Track[]>>()

async function runSearch(query: string, opts: SearchOpts): Promise<Track[]> {
  const isProd = !!(import.meta as any).env?.PROD
  // The Electron desktop app bundles the backend, so the keyless /yt (yt-dlp)
  // helper is available there too (same-origin on localhost).
  const isDesktop = typeof window !== 'undefined' && !!(window as any).synapz?.isDesktop
  // The mobile app (Capacitor) reaches /yt/search via the hosted Data-API proxy.
  const isNative = Capacitor.isNativePlatform()
  const hasHelper = !isProd || isDesktop || isNative

  // Native mobile: the client-side key is referrer-blocked from the capacitor
  // origin, so skip it and use the proxy helper (which runs the Data API
  // server-side). Elsewhere, prefer the fast Data-API call when a key exists.
  if (hasYtKey() && !isNative) {
    try {
      return await searchYouTube(query, 50, opts)
    } catch (e) {
      if (!hasHelper) throw e // hosted web has no helper — surface the error
      // else fall through to the yt-dlp / proxy helper below
    }
  }
  if (!hasHelper) throw new YtError('NO_KEY')
  return await searchYouTubeLocal(query, opts)
}

/**
 * Unified YouTube search — cached.
 * - Cache hit → 0 quota (the big saver for fixed stations / chips / re-imports).
 * - Miss: local dev prefers the keyless yt-dlp helper; production uses the Data
 *   API (search.list 100u for 50 ids + videos.list 1u), then caches the result.
 */
export async function searchYT(query: string, opts: SearchOpts = {}): Promise<Track[]> {
  if (!query.trim()) return []
  // Resolve the duration window up-front so the cache key and BOTH search paths
  // use the same filter — otherwise a dev-cached result (15 min cap) could be
  // served for a prod query that expects the 30 min cap, and vice versa.
  const resolved: SearchOpts = { minSec: opts.minSec ?? 1, maxSec: opts.maxSec ?? 60 * 30 }
  const key = cacheKey(query, resolved)
  const cached = readCache(key)
  if (cached) return cached
  const existing = inflight.get(key)
  if (existing) return existing
  const p = (async () => {
    const tracks = await runSearch(query, resolved)
    if (tracks.length) writeCache(key, tracks)
    return tracks
  })()
  inflight.set(key, p)
  try {
    return await p
  } finally {
    inflight.delete(key)
  }
}
