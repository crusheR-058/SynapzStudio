// "Made for you" — auto-playlists built from what this person actually plays.
//
// Everything here is computed on the device from three inputs: the play events
// (cloud history or the local log), liked songs, and the baked catalogs that
// already ship in the bundle. Building the shelf therefore costs no network and
// no YouTube quota. An artist mix that comes out thin names a search it could be
// topped up with (`fill`), and the Mix view runs that only when the mix is
// actually opened.
//
// Mixes are stable for a day: the shuffle is seeded with the date, so "Daily Mix
// 1" is the same list every time you open it today and a new one tomorrow.

import type { Track } from './types'
import type { PlayEvent } from './cloud'
import { BOLLYWOOD_TRACKS } from './bollywood'
import { HOLLYWOOD_TRACKS } from './hollywood'

export interface Mix {
  id: string
  name: string
  blurb: string
  tracks: Track[]
  /** Up to four artworks for the tile's collage. */
  art: string[]
  /** A search that would add more of the same, if the mix is short. */
  fill?: string
}

const MIX_SIZE = 40
const DAY = 86_400_000

// Small, fast, deterministic PRNG (mulberry32) — enough for a daily shuffle.
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function unique(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  return tracks.filter((t) => t?.id && !seen.has(t.id) && seen.add(t.id))
}

const today = () => new Date().toISOString().slice(0, 10)

const artOf = (tracks: Track[]) =>
  unique(tracks)
    .map((t) => t.artwork)
    .filter(Boolean)
    .slice(0, 4)

const norm = (s: string) => s.toLowerCase().trim()

/**
 * Catalog tracks crediting this artist. Substring both ways, because credits
 * are messy: the catalog says "Arijit Singh, Shreya Ghoshal" where history says
 * "Arijit Singh", and a YouTube channel name is often longer than the artist.
 */
function catalogBy(artist: string): Track[] {
  const a = norm(artist)
  if (a.length < 3) return []
  const hit = (t: Track) => {
    const b = norm(t.artist)
    return b.includes(a) || (b.length >= 3 && a.includes(b))
  }
  return [...BOLLYWOOD_TRACKS.filter(hit), ...HOLLYWOOD_TRACKS.filter(hit)]
}

export function buildMixes(events: PlayEvent[], liked: Track[]): Mix[] {
  const now = Date.now()
  const day = today()
  const mixes: Mix[] = []

  // Local files only mean something on the machine they live on, and their
  // "artist" is a guess from the filename — keep them out of generated mixes.
  const plays = events.filter((e) => e.track?.id && e.track.source !== 'local')

  const count = new Map<string, number>()
  const lastAt = new Map<string, number>()
  const byId = new Map<string, Track>()
  const artistPlays = new Map<string, number>()
  const artistTracks = new Map<string, Track[]>()
  for (const e of plays) {
    const t = e.track
    count.set(t.id, (count.get(t.id) || 0) + 1)
    if ((lastAt.get(t.id) || 0) < e.at) lastAt.set(t.id, e.at)
    byId.set(t.id, t)
    const artist = (t.artist || '').trim()
    if (artist) {
      artistPlays.set(artist, (artistPlays.get(artist) || 0) + 1)
      const list = artistTracks.get(artist)
      if (list) list.push(t)
      else artistTracks.set(artist, [t])
    }
  }
  const played = new Set(byId.keys())

  // Daily mixes: the top artists, two to a mix.
  const topArtists = [...artistPlays.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([a]) => a)
  for (let i = 0; i < topArtists.length; i += 2) {
    const pair = topArtists.slice(i, i + 2)
    const n = i / 2 + 1
    const rand = rng(`${day}:daily:${n}`)
    const own = unique(pair.flatMap((a) => artistTracks.get(a) || []))
    const more = unique(pair.flatMap(catalogBy)).filter((t) => !own.some((o) => o.id === t.id))
    const tracks = shuffle([...own, ...shuffle(more, rand).slice(0, MIX_SIZE)], rand).slice(0, MIX_SIZE)
    if (tracks.length < 4) continue
    mixes.push({
      id: `daily-${n}`,
      name: `Daily Mix ${n}`,
      blurb: `${pair.join(', ')} and more`,
      tracks,
      art: artOf(tracks),
      fill: tracks.length < 15 ? `${pair[0]} songs` : undefined,
    })
  }

  // On Repeat: what has been played most over the last month.
  const recentCount = new Map<string, number>()
  for (const e of plays) {
    if (now - e.at <= 30 * DAY) recentCount.set(e.track.id, (recentCount.get(e.track.id) || 0) + 1)
  }
  const onRepeat = [...recentCount.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([id]) => byId.get(id)!)
  if (onRepeat.length >= 4) {
    mixes.push({
      id: 'on-repeat',
      name: 'On Repeat',
      blurb: 'The songs you can’t stop playing',
      tracks: onRepeat,
      art: artOf(onRepeat),
    })
  }

  // Rediscover: songs you liked or kept returning to, then left alone.
  const stale = (t: Track) => now - (lastAt.get(t.id) || 0) > 21 * DAY
  const forgotten = unique([
    ...liked.filter((t) => t.source !== 'local' && stale(t)),
    ...[...byId.values()].filter((t) => (count.get(t.id) || 0) >= 2 && stale(t)),
  ])
  if (forgotten.length >= 6) {
    const tracks = shuffle(forgotten, rng(`${day}:rediscover`)).slice(0, MIX_SIZE)
    mixes.push({
      id: 'rediscover',
      name: 'Rediscover',
      blurb: 'Favourites you haven’t played in a while',
      tracks,
      art: artOf(tracks),
    })
  }

  // Discovery: catalog songs you have never played, leaning towards the side of
  // the catalog you actually listen to. Also what a brand-new listener sees.
  const hindiIds = new Set(BOLLYWOOD_TRACKS.map((t) => t.id))
  const englishIds = new Set(HOLLYWOOD_TRACKS.map((t) => t.id))
  const leanHindi =
    plays.filter((e) => hindiIds.has(e.track.id)).length >=
    plays.filter((e) => englishIds.has(e.track.id)).length
  const rand = rng(`${day}:discover`)
  const fresh = (list: Track[]) => shuffle(list.filter((t) => !played.has(t.id)), rand)
  const major = fresh(leanHindi ? BOLLYWOOD_TRACKS : HOLLYWOOD_TRACKS).slice(0, 28)
  const minor = fresh(leanHindi ? HOLLYWOOD_TRACKS : BOLLYWOOD_TRACKS).slice(0, 12)
  const discover = shuffle(unique([...major, ...minor]), rand)
  if (discover.length >= 6) {
    mixes.push({
      id: 'discover',
      name: 'Discovery Mix',
      blurb: plays.length ? 'Songs you haven’t played yet' : 'A fresh pick to get you started',
      tracks: discover,
      art: artOf(discover),
    })
  }

  return mixes
}
