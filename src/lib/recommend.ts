// Song radio — "what should play after this?"
//
// Given one song, build a list of related ones. There is no single related-songs
// service for this catalog, so the answer is assembled from what is available,
// best signal first:
//
//   1. YouTube's own mix for the song (desktop only — it is read with the
//      bundled yt-dlp helper, which the hosted site doesn't have). This is the
//      closest thing to a real "radio" and, when present, leads the list.
//   2. The built-in catalogs, which are tagged by artist, mood and era: songs
//      sharing the seed's tags, or by the same artist.
//   3. One YouTube search, only when the first two came up short.
//
// Results are YouTube tracks only. Audius is used for browsing (Home, genres,
// charts) and is deliberately never recommended: a radio that wandered from a
// Bollywood song into an unrelated Audius upload is exactly what this replaces.
// Local files and live radio streams never start a radio at all.

import type { Track } from './types'
import { BOLLYWOOD_TRACKS } from './bollywood'
import { HOLLYWOOD_TRACKS } from './hollywood'
import { STATION_TRACKS } from './stations'
import { PODCAST_TRACKS } from './podcasts'
import { RADIO_STATIONS } from './radio'
import { fetchYtMix, searchYT } from './youtube'
import { scrobbleMeta } from './lastfm'
import { localPlayEvents } from './playlog'
import { isDesktop } from './discord'

type Tagged = Track & { cats: string[] }

const RADIO_SIZE = 25
const MIN_SONG_SEC = 60
const MAX_SONG_SEC = 10 * 60
/** Anything this long is an episode or a compilation, not a song. */
const LONGFORM_SEC = 20 * 60

const MUSIC: Tagged[] = [...BOLLYWOOD_TRACKS, ...HOLLYWOOD_TRACKS, ...STATION_TRACKS]
const musicById = new Map(MUSIC.map((t) => [t.id, t]))
const podcastById = new Map(PODCAST_TRACKS.map((t) => [t.id, t]))
const liveIds = new Set(RADIO_STATIONS.map((t) => t.id))

/** The mix needs the local helper: the desktop app, or `npm run dev`. */
const canReadMix = () => isDesktop() || !!(import.meta as any).env?.DEV

const norm = (s: string) => s.toLowerCase().trim()

/**
 * One key per SONG rather than per upload — the same track is on YouTube as
 * the video, the lyric video and the audio, and a radio should play it once.
 */
function songKey(t: Track): string {
  return (t.title || '')
    .toLowerCase()
    .replace(/[\(\[][^)\]]*[\)\]]/g, ' ')
    .split('|')[0]
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 28)
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Can this song seed a radio at all? */
export function canStartRadio(t: Track | null): boolean {
  return !!t && t.source !== 'local' && !liveIds.has(t.id)
}

function isSong(t: Track): boolean {
  if (t.source !== 'youtube') return false
  // Duration 0 means "unknown" (some search paths omit it) — let it through.
  return !t.duration || (t.duration >= MIN_SONG_SEC && t.duration <= MAX_SONG_SEC)
}

/** Artists this listener plays most, for breaking ties between candidates. */
function tasteArtists(): Set<string> {
  const counts = new Map<string, number>()
  for (const e of localPlayEvents().slice(0, 400)) {
    const a = norm(e.track.artist || '')
    if (a) counts.set(a, (counts.get(a) || 0) + 1)
  }
  return new Set(
    [...counts.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([a]) => a),
  )
}

/** Catalog songs related to the seed, most related first. */
function fromCatalog(seed: Track, artistGuess: string): Track[] {
  const tagged = musicById.get(seed.id)
  const taste = tasteArtists()
  const scored: { t: Tagged; score: number }[] = []

  if (tagged?.cats.length) {
    const mine = new Set(tagged.cats)
    for (const t of MUSIC) {
      if (t.id === seed.id) continue
      let shared = 0
      for (const c of t.cats) if (mine.has(c)) shared++
      if (shared) scored.push({ t, score: shared * 2 + (taste.has(norm(t.artist)) ? 1 : 0) })
    }
  } else {
    // Not a catalog song: fall back to the artist's name, matched loosely
    // against both the credited artist and the tags (many tags ARE artists).
    const names = [artistGuess, seed.artist].map(norm).filter((n) => n.length >= 3)
    if (!names.length) return []
    for (const t of MUSIC) {
      if (t.id === seed.id) continue
      const artist = norm(t.artist)
      const hit = names.some(
        (n) => artist.includes(n) || t.cats.some((c) => norm(c) === n) || norm(t.title).includes(n),
      )
      if (hit) scored.push({ t, score: 2 + (taste.has(artist) ? 1 : 0) })
    }
  }

  // Shuffle first so equal scores don't always come out in catalog order —
  // otherwise every radio from the same lane would be the same radio.
  return shuffle(scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60)
    .map((x) => x.t)
}

function podcastsLike(seed: Track): Track[] {
  const cats = podcastById.get(seed.id)?.cats
  if (!cats?.length) return []
  const mine = new Set(cats)
  return shuffle(PODCAST_TRACKS.filter((t) => t.id !== seed.id && t.cats.some((c) => mine.has(c))))
}

/**
 * Songs to play after `seed`. `exclude` holds ids already queued or recently
 * heard. Resolves to an empty list when the seed can't have a radio.
 */
export async function recommendFor(seed: Track, exclude: Set<string>): Promise<Track[]> {
  if (!canStartRadio(seed)) return []

  // An episode is followed by more of the same show or topic, never by songs.
  if (podcastById.has(seed.id) || seed.duration > LONGFORM_SEC) {
    return podcastsLike(seed)
      .filter((t) => !exclude.has(t.id))
      .slice(0, RADIO_SIZE)
  }

  const meta = scrobbleMeta(seed)
  const artistGuess = meta.artist === 'Unknown Artist' ? '' : meta.artist

  const mix =
    seed.source === 'youtube' && canReadMix() ? await fetchYtMix(seed.id).catch(() => []) : []
  const catalog = fromCatalog(seed, artistGuess)

  const out: Track[] = []
  const seen = new Set<string>([songKey(seed)])
  const take = (list: Track[], limit = RADIO_SIZE) => {
    for (const t of list) {
      if (out.length >= limit) return
      if (!t?.id || t.id === seed.id || exclude.has(t.id) || !isSong(t)) continue
      const key = songKey(t) || t.id
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
  }

  take(mix)
  // With a mix, the catalog only tops the list up; without one it IS the list,
  // but leave room for search results so a radio isn't all one lane.
  take(catalog, mix.length ? RADIO_SIZE : 18)

  if (out.length < 15) {
    // One search at most, and only when needed: on the hosted site each one
    // costs YouTube quota (repeats are cached by query).
    // "<genre> music", not "<genre> songs": several genre names are ordinary
    // words, and "House songs" finds nursery rhymes about houses.
    const query =
      seed.source === 'audius' && seed.genre
        ? `${seed.genre} music`
        : artistGuess
          ? `${artistGuess} songs`
          : seed.genre
            ? `${seed.genre} music`
            : ''
    if (query) {
      const found = await searchYT(query, { minSec: MIN_SONG_SEC, maxSec: MAX_SONG_SEC }).catch(
        () => [] as Track[],
      )
      take(found)
    }
  }

  take(catalog)

  // Still thin (an obscure song, offline, quota spent): keep the music going
  // with a general pick rather than letting the radio run dry.
  if (out.length < 8) take(shuffle(MUSIC))

  return out
}
