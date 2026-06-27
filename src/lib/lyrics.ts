import type { Track } from './types'

export interface SyncedLine {
  time: number // seconds
  text: string
}

export interface Lyrics {
  synced: SyncedLine[] | null
  plain: string | null
  instrumental: boolean
  source: 'lrclib'
}

interface LrclibRow {
  syncedLyrics: string | null
  plainLyrics: string | null
  instrumental: boolean
  artistName?: string
  trackName?: string
}

const API = 'https://lrclib.net/api'
const cache = new Map<string, Lyrics | null>()

// YouTube/Audius titles carry a lot of noise ("(Official Video)", "[4K]",
// "| T-Series", "Lyrical", "feat. …"). Strip it so lrclib can match.
function cleanTitle(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(
      /\b(official|video|audio|lyrical?|lyrics?|full\s*song|hd|4k|mv|m\/v|visuali[sz]er|live|remaster(ed)?|reprise|cover|slowed|reverb|extended|version|vevo)\b/gi,
      ' ',
    )
    .replace(/\bfeat\.?\b.*$/i, ' ')
    .replace(/\bft\.?\b.*$/i, ' ')
    .replace(/\s*[|•·–—].*$/, ' ') // trailing " | Artist", " – Movie", etc.
    .replace(/["'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanArtist(raw: string): string {
  return raw
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\bVEVO\b/gi, '')
    .replace(/[|•·].*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseLrc(lrc: string): SyncedLine[] {
  const out: SyncedLine[] = []
  for (const rawLine of lrc.split('\n')) {
    const stamps = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const text = rawLine.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim()
    for (const m of stamps) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0
      out.push({ time: min * 60 + sec + frac, text })
    }
  }
  out.sort((a, b) => a.time - b.time)
  return out
}

function toLyrics(row: LrclibRow | null): Lyrics | null {
  if (!row) return null
  if (row.instrumental) return { synced: null, plain: null, instrumental: true, source: 'lrclib' }
  const synced = row.syncedLyrics ? parseLrc(row.syncedLyrics) : null
  const plain = row.plainLyrics?.trim() || null
  if ((!synced || !synced.length) && !plain) return null
  return {
    synced: synced && synced.length ? synced : null,
    plain,
    instrumental: false,
    source: 'lrclib',
  }
}

async function getJson<T>(url: string, timeoutMs = 12000): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function pickRow(rows: LrclibRow[] | null): LrclibRow | null {
  if (!rows || !rows.length) return null
  return rows.find((r) => r.syncedLyrics) || rows.find((r) => r.plainLyrics) || rows[0]
}

/** Fetch the best available lyrics for a track (synced preferred). Cached. */
export async function fetchLyrics(track: Track): Promise<Lyrics | null> {
  if (cache.has(track.id)) return cache.get(track.id)!

  const title = cleanTitle(track.title)
  const artist = cleanArtist(track.artist)

  // 1) Exact get (best, duration-aware match).
  const params = new URLSearchParams({ artist_name: artist, track_name: title })
  if (track.duration) params.set('duration', String(Math.round(track.duration)))
  let row = await getJson<LrclibRow>(`${API}/get?${params.toString()}`)

  // 2) Search fallbacks — fire both queries in parallel and prefer synced.
  if (!row) {
    const queries = [...new Set([`${title} ${artist}`.trim(), title].filter(Boolean))]
    const results = await Promise.all(
      queries.map((q) => getJson<LrclibRow[]>(`${API}/search?q=${encodeURIComponent(q)}`)),
    )
    for (const rows of results) {
      const r = pickRow(rows)
      if (r?.syncedLyrics) {
        row = r
        break
      }
      if (r && !row) row = r
    }
  }

  const result = toLyrics(row)
  cache.set(track.id, result)
  return result
}

/* ----------------------------------------------------- romanization (Hindi) */

const DV_VOWEL: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ii', उ: 'u', ऊ: 'uu', ऋ: 'ri',
  ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o', ऍ: 'e',
}
const DV_CONS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh',
  ष: 'sh', स: 's', ह: 'h', ळ: 'l',
}
const DV_MATRA: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o',
}
const DV_SIGN: Record<string, string> = { 'ं': 'n', 'ः': 'h', 'ँ': 'n' }
const DV_NUKTA: Record<string, string> = { ज: 'z', ड: 'r', ढ: 'rh', फ: 'f', क: 'q', ख: 'kh', ग: 'gh' }
const DV_DIGIT: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
}
const VIRAMA = '्'
const NUKTA = '़'

export function hasDevanagari(s: string): boolean {
  return /[ऀ-ॿ]/.test(s)
}

/**
 * Best-effort Devanagari → Latin transliteration so non-Hindi readers can sing
 * along. Not linguistically perfect (schwa-deletion is heuristic), but readable.
 * Leaves non-Devanagari text untouched. Never throws.
 */
export function romanize(input: string): string {
  if (!input || !hasDevanagari(input)) return input
  try {
    const chars = [...input]
    let out = ''
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      if (DV_CONS[ch]) {
        let base = DV_CONS[ch]
        // consonant + nukta (foreign sounds: z, f, q…)
        if (chars[i + 1] === NUKTA && DV_NUKTA[ch]) {
          base = DV_NUKTA[ch]
          i++
        }
        const nxt = chars[i + 1]
        if (nxt && DV_MATRA[nxt]) {
          out += base + DV_MATRA[nxt]
          i++
        } else if (nxt === VIRAMA) {
          out += base
          i++
        } else {
          out += base + 'a'
        }
      } else if (DV_VOWEL[ch]) {
        out += DV_VOWEL[ch]
      } else if (DV_SIGN[ch]) {
        out += DV_SIGN[ch]
      } else if (DV_DIGIT[ch]) {
        out += DV_DIGIT[ch]
      } else if (ch === VIRAMA || ch === NUKTA || ch === 'ऽ') {
        /* skip standalone marks */
      } else {
        out += ch
      }
    }
    // light schwa-deletion: drop a trailing inherent 'a' at word ends
    out = out.replace(/([bcdfghjklmnpqrstvwxz])a\b/g, '$1')
    return out.replace(/\s+/g, ' ')
  } catch {
    return input
  }
}

/** Index of the active synced line for a given playback time. -1 if none yet. */
export function activeLineIndex(lines: SyncedLine[], time: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= time + 0.25) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}
