/**
 * Harvest a baked Hollywood / English-song catalog via the keyless yt-dlp helper
 * — same approach used for the Bollywood catalog, but segmented BY ARTIST.
 *
 * For each artist we run YouTube searches through yt-dlp (no API key / no quota),
 * keep individual songs (drops shorts & long compilations), dedupe globally, and
 * write src/lib/hollywood.ts as compact tuples: [id, title, artist, dur, "Artist"].
 *
 * Run:  node scripts/harvest-hollywood.mjs
 * The tracks play through the YouTube IFrame by id, so this costs ZERO API quota
 * at runtime. Re-run to refresh; do NOT hand-edit the generated data.
 */
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const YTDLP = path.join(ROOT, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
const OUT = path.join(ROOT, 'src', 'lib', 'hollywood.ts')

const PER_ARTIST = 50 // target songs per artist
const MIN_SEC = 60 // drop shorts / clips
const MAX_SEC = 12 * 60 // drop hour-long compilations & full concerts

// Major English / Hollywood artists across pop, rock, hip-hop, R&B, EDM, classics.
const ARTISTS = [
  'Taylor Swift', 'Ed Sheeran', 'The Weeknd', 'Ariana Grande', 'Justin Bieber',
  'Billie Eilish', 'Dua Lipa', 'Bruno Mars', 'Adele', 'Coldplay',
  'Imagine Dragons', 'Maroon 5', 'Katy Perry', 'Lady Gaga', 'Rihanna',
  'Beyonce', 'Eminem', 'Drake', 'Post Malone', 'Kendrick Lamar',
  'Travis Scott', 'Michael Jackson', 'Queen', 'The Beatles', 'Elton John',
  'Nirvana', 'Linkin Park', 'Green Day', "Guns N' Roses", 'Bon Jovi',
  'U2', 'Red Hot Chili Peppers', 'Metallica', 'OneRepublic', 'Shawn Mendes',
  'Charlie Puth', 'Sam Smith', 'Sia', 'Selena Gomez', 'Miley Cyrus',
  'Harry Styles', 'Olivia Rodrigo', 'Doja Cat', 'SZA', 'Calvin Harris',
  'David Guetta', 'Marshmello', 'Avicii', 'Alan Walker', 'The Chainsmokers',
  'Zedd', 'Chris Brown', 'Usher', 'Nicki Minaj', 'Lana Del Rey',
]

function run(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.toString()?.slice(0, 200) || err.message))
      else resolve(stdout.toString())
    })
  })
}

async function search(query, n) {
  const out = await run([
    '--flat-playlist',
    '-J',
    '--no-warnings',
    '--ignore-config',
    `ytsearch${n}:${query}`,
  ])
  const data = JSON.parse(out)
  return (data.entries || []).filter(Boolean)
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

async function harvestArtist(artist, seen) {
  const rows = []
  const take = (entries) => {
    for (const e of entries) {
      const id = e.id
      const dur = Number(e.duration) || 0
      if (!id || id.length !== 11 || seen.has(id)) continue
      if (dur < MIN_SEC || dur > MAX_SEC) continue
      const title = clean(e.title)
      if (!title) continue
      seen.add(id)
      // Display artist = canonical name; category tag = the same, for chip filtering.
      rows.push([id, title.slice(0, 120), artist, dur, artist])
    }
  }
  try {
    take(await search(`${artist} official audio`, PER_ARTIST))
  } catch (e) {
    console.warn(`  ! "${artist}" audio search failed: ${e.message}`)
  }
  // Top up with official videos if the audio search was thin.
  if (rows.length < 25) {
    try {
      take(await search(`${artist} official video song`, PER_ARTIST))
    } catch (e) {
      console.warn(`  ! "${artist}" video search failed: ${e.message}`)
    }
  }
  return rows
}

async function main() {
  const seen = new Set()
  const all = []
  let i = 0
  for (const artist of ARTISTS) {
    i++
    const rows = await harvestArtist(artist, seen)
    all.push(...rows)
    console.log(`[${i}/${ARTISTS.length}] ${artist.padEnd(24)} +${rows.length}  (total ${all.length})`)
  }

  const artistsWithSongs = [...new Set(all.map((r) => r[4]))]
  const header = `import type { Track } from './types'

/**
 * Baked Hollywood / English catalog (${all.length} songs across ${artistsWithSongs.length} artists),
 * harvested once via the keyless yt-dlp helper (scripts/harvest-hollywood.mjs).
 * Serving the Hollywood view from this list costs ZERO YouTube API quota — the
 * tracks play through the IFrame player by video id, and id/title/artist/duration
 * don't expire. To refresh, re-run the harvester; do NOT hand-edit the data below.
 *
 * Compact tuples: [id, title, artist, durationSec, "Artist"].
 */
type Raw = [string, string, string, number, string]

// eslint-disable-next-line
const RAW: Raw[] = JSON.parse(${JSON.stringify(JSON.stringify(all))})

export interface CatTrack extends Track {
  cats: string[]
}

function build(r: Raw): CatTrack {
  const [id, title, artist, duration, cats] = r
  return {
    id,
    source: 'youtube',
    title,
    artist,
    artistHandle: '',
    artwork: \`https://i.ytimg.com/vi/\${id}/hqdefault.jpg\`,
    artworkLarge: \`https://i.ytimg.com/vi/\${id}/maxresdefault.jpg\`,
    duration,
    playCount: 0,
    streamUrl: '',
    cats: cats ? cats.split('|') : [],
  }
}

export const HOLLYWOOD_TRACKS: CatTrack[] = RAW.map(build)

/** Artists present in the catalog, in harvest order (used for the chips). */
export const HOLLYWOOD_ARTISTS: string[] = ${JSON.stringify(artistsWithSongs)}

/** Songs by a given artist chip label. */
export function hollywoodByArtist(label: string): CatTrack[] {
  return HOLLYWOOD_TRACKS.filter((t) => t.cats.includes(label))
}
`
  writeFileSync(OUT, header, 'utf8')
  console.log(`\nWrote ${OUT}: ${all.length} tracks, ${artistsWithSongs.length} artists.`)
}

main().catch((e) => {
  console.error('harvest failed:', e)
  process.exit(1)
})
