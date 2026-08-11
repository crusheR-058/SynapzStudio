/**
 * Harvest a baked Indian-music catalog via the keyless yt-dlp helper — the same
 * approach as scripts/harvest-hollywood.mjs, but segmented BY ARTIST and tagged
 * BY LANGUAGE so the UI can offer per-artist pages grouped into scenes.
 *
 * On the roster below: it is curated, not exhaustive. "Every Indian artist" is
 * tens of thousands of names across a century and twenty-odd languages, and no
 * static file can hold that honestly. What this is instead: broad coverage of
 * the artists people actually search for, across eras (playback golden age →
 * today) and languages (Hindi, Punjabi, Tamil, Telugu, Malayalam, Kannada,
 * Bengali, Marathi) plus composers, indie, hip-hop and sufi/ghazal. Extending it
 * is deliberately trivial — add a name to ARTISTS and re-run.
 *
 * Song lists are NOT hand-written. Every track here comes from a real YouTube
 * search, so every id actually plays; a hand-authored list would be invented
 * video ids that 404.
 *
 * Run:  node scripts/harvest-indian.mjs            (full harvest, slow)
 *       node scripts/harvest-indian.mjs --limit 3  (smoke test)
 * Playback goes through the IFrame player by video id, so this costs ZERO
 * YouTube API quota at runtime. Re-run to refresh; do NOT hand-edit the output.
 */
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const YTDLP = path.join(ROOT, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
const OUT = path.join(ROOT, 'src', 'lib', 'indian.ts')

const PER_ARTIST = 50 // target songs per artist
const MIN_SEC = 60 // drop shorts / clips
const MAX_SEC = 15 * 60 // drop jukeboxes & full concerts (Indian songs run long)
const CONCURRENCY = 4 // parallel yt-dlp searches

const argLimit = (() => {
  const i = process.argv.indexOf('--limit')
  return i > -1 ? Number(process.argv[i + 1]) || 0 : 0
})()

/** [displayName, languageScene]. Order within a scene is roughly by prominence. */
const ARTISTS = [
  // --- Hindi playback, golden age -----------------------------------------
  ['Lata Mangeshkar', 'Hindi'], ['Mohammed Rafi', 'Hindi'], ['Kishore Kumar', 'Hindi'],
  ['Asha Bhosle', 'Hindi'], ['Mukesh', 'Hindi'], ['Manna Dey', 'Hindi'],
  ['Hemant Kumar', 'Hindi'], ['Talat Mahmood', 'Hindi'], ['Geeta Dutt', 'Hindi'],
  ['Mahendra Kapoor', 'Hindi'], ['Shamshad Begum', 'Hindi'],

  // --- Hindi playback, 80s/90s ---------------------------------------------
  ['Kumar Sanu', 'Hindi'], ['Udit Narayan', 'Hindi'], ['Alka Yagnik', 'Hindi'],
  ['Abhijeet Bhattacharya', 'Hindi'], ['Kavita Krishnamurthy', 'Hindi'],
  ['Anuradha Paudwal', 'Hindi'], ['Sadhana Sargam', 'Hindi'], ['Vinod Rathod', 'Hindi'],

  // --- Hindi, modern --------------------------------------------------------
  ['Arijit Singh', 'Hindi'], ['Shreya Ghoshal', 'Hindi'], ['Sonu Nigam', 'Hindi'],
  ['Atif Aslam', 'Hindi'], ['Sunidhi Chauhan', 'Hindi'], ['Mohit Chauhan', 'Hindi'],
  ['KK', 'Hindi'], ['Shaan', 'Hindi'], ['Rahat Fateh Ali Khan', 'Hindi'],
  ['Armaan Malik', 'Hindi'], ['Jubin Nautiyal', 'Hindi'], ['Darshan Raval', 'Hindi'],
  ['Neha Kakkar', 'Hindi'], ['Tulsi Kumar', 'Hindi'], ['Palak Muchhal', 'Hindi'],
  ['Asees Kaur', 'Hindi'], ['Dhvani Bhanushali', 'Hindi'], ['Shilpa Rao', 'Hindi'],
  ['Jonita Gandhi', 'Hindi'], ['Benny Dayal', 'Hindi'], ['Vishal Dadlani', 'Hindi'],
  ['Papon', 'Hindi'], ['Ankit Tiwari', 'Hindi'], ['Sukhwinder Singh', 'Hindi'],
  ['Kailash Kher', 'Hindi'], ['Javed Ali', 'Hindi'], ['Nikhita Gandhi', 'Hindi'],
  ['Vishal Mishra', 'Hindi'], ['Sachet Tandon', 'Hindi'], ['Stebin Ben', 'Hindi'],
  ['Raghav Chaitanya', 'Hindi'], ['Ash King', 'Hindi'],

  // --- Composers ------------------------------------------------------------
  ['A.R. Rahman', 'Composers'], ['R.D. Burman', 'Composers'], ['S.D. Burman', 'Composers'],
  ['Laxmikant-Pyarelal', 'Composers'], ['Kalyanji-Anandji', 'Composers'],
  ['Shankar-Jaikishan', 'Composers'], ['Madan Mohan', 'Composers'], ['Naushad', 'Composers'],
  ['O.P. Nayyar', 'Composers'], ['Bappi Lahiri', 'Composers'], ['Nadeem-Shravan', 'Composers'],
  ['Jatin-Lalit', 'Composers'], ['Anu Malik', 'Composers'], ['Ismail Darbar', 'Composers'],
  ['Himesh Reshammiya', 'Composers'], ['Pritam', 'Composers'], ['Vishal-Shekhar', 'Composers'],
  ['Shankar-Ehsaan-Loy', 'Composers'], ['Amit Trivedi', 'Composers'], ['Sachin-Jigar', 'Composers'],
  ['Salim-Sulaiman', 'Composers'], ['Amaal Mallik', 'Composers'], ['Tanishk Bagchi', 'Composers'],
  ['Mithoon', 'Composers'], ['Jeet Gannguli', 'Composers'],

  // --- Punjabi --------------------------------------------------------------
  ['Diljit Dosanjh', 'Punjabi'], ['Sidhu Moose Wala', 'Punjabi'], ['AP Dhillon', 'Punjabi'],
  ['Karan Aujla', 'Punjabi'], ['Guru Randhawa', 'Punjabi'], ['Yo Yo Honey Singh', 'Punjabi'],
  ['Badshah', 'Punjabi'], ['B Praak', 'Punjabi'], ['Jassie Gill', 'Punjabi'],
  ['Ammy Virk', 'Punjabi'], ['Harrdy Sandhu', 'Punjabi'], ['Shubh', 'Punjabi'],
  ['Gippy Grewal', 'Punjabi'], ['Sharry Maan', 'Punjabi'], ['Ranjit Bawa', 'Punjabi'],
  ['Satinder Sartaaj', 'Punjabi'], ['Gurdas Maan', 'Punjabi'], ['Amrinder Gill', 'Punjabi'],
  ['Nimrat Khaira', 'Punjabi'], ['Jasmine Sandlas', 'Punjabi'], ['Garry Sandhu', 'Punjabi'],
  ['Kaka', 'Punjabi'], ['Arjan Dhillon', 'Punjabi'], ['Jass Manak', 'Punjabi'],
  ['Mankirt Aulakh', 'Punjabi'], ['Babbu Maan', 'Punjabi'], ['Sunanda Sharma', 'Punjabi'],
  ['Prem Dhillon', 'Punjabi'], ['Ninja', 'Punjabi'],

  // --- Tamil ----------------------------------------------------------------
  ['Anirudh Ravichander', 'Tamil'], ['Sid Sriram', 'Tamil'], ['Ilaiyaraaja', 'Tamil'],
  ['Yuvan Shankar Raja', 'Tamil'], ['Harris Jayaraj', 'Tamil'], ['D. Imman', 'Tamil'],
  ['Santhosh Narayanan', 'Tamil'], ['G.V. Prakash Kumar', 'Tamil'],
  ['S.P. Balasubrahmanyam', 'Tamil'], ['K.S. Chithra', 'Tamil'], ['Hariharan', 'Tamil'],
  ['Shankar Mahadevan', 'Tamil'], ['Shweta Mohan', 'Tamil'], ['Chinmayi', 'Tamil'],
  ['Karthik', 'Tamil'], ['Haricharan', 'Tamil'], ['Dhanush', 'Tamil'],

  // --- Telugu ---------------------------------------------------------------
  ['Devi Sri Prasad', 'Telugu'], ['S. Thaman', 'Telugu'], ['M.M. Keeravani', 'Telugu'],
  ['Mickey J Meyer', 'Telugu'], ['Anurag Kulkarni', 'Telugu'], ['Kaala Bhairava', 'Telugu'],
  ['Sunitha Upadrashta', 'Telugu'], ['Mangli', 'Telugu'], ['Ram Miriyala', 'Telugu'],
  ['Vijay Yesudas', 'Telugu'],

  // --- Malayalam ------------------------------------------------------------
  ['K.J. Yesudas', 'Malayalam'], ['Sushin Shyam', 'Malayalam'], ['Gopi Sundar', 'Malayalam'],
  ['Vineeth Sreenivasan', 'Malayalam'], ['Sithara Krishnakumar', 'Malayalam'],
  ['M. Jayachandran', 'Malayalam'], ['Vidhu Prathap', 'Malayalam'], ['Dabzee', 'Malayalam'],

  // --- Kannada --------------------------------------------------------------
  ['Vijay Prakash', 'Kannada'], ['Sanjith Hegde', 'Kannada'], ['B. Ajaneesh Loknath', 'Kannada'],
  ['Rajesh Krishnan', 'Kannada'], ['Chandan Shetty', 'Kannada'],

  // --- Bengali --------------------------------------------------------------
  ['Anupam Roy', 'Bengali'], ['Rupam Islam', 'Bengali'], ['Nachiketa Chakraborty', 'Bengali'],
  ['Kabir Suman', 'Bengali'], ['Lagnajita Chakraborty', 'Bengali'],

  // --- Marathi --------------------------------------------------------------
  ['Ajay-Atul', 'Marathi'], ['Avadhoot Gupte', 'Marathi'], ['Bela Shende', 'Marathi'],
  ['Adarsh Shinde', 'Marathi'], ['Vaishali Samant', 'Marathi'],

  // --- Indie / hip-hop / electronic ----------------------------------------
  ['Prateek Kuhad', 'Indie'], ['Divine', 'Indie'], ['Naezy', 'Indie'],
  ['Seedhe Maut', 'Indie'], ['KR$NA', 'Indie'], ['Raftaar', 'Indie'],
  ['Emiway Bantai', 'Indie'], ['MC Stan', 'Indie'], ['Ritviz', 'Indie'],
  ['Nucleya', 'Indie'], ['When Chai Met Toast', 'Indie'], ['The Local Train', 'Indie'],
  ['Anuv Jain', 'Indie'], ['Lifafa', 'Indie'], ['Peter Cat Recording Co.', 'Indie'],
  ['Taba Chake', 'Indie'], ['Hanumankind', 'Indie'], ['Talwiinder', 'Indie'],
  ['Zaeden', 'Indie'], ['Aditya Rikhari', 'Indie'],

  // --- Sufi / ghazal / classical -------------------------------------------
  ['Nusrat Fateh Ali Khan', 'Sufi & Ghazal'], ['Jagjit Singh', 'Sufi & Ghazal'],
  ['Abida Parveen', 'Sufi & Ghazal'], ['Pankaj Udhas', 'Sufi & Ghazal'],
  ['Ghulam Ali', 'Sufi & Ghazal'], ['Anup Jalota', 'Sufi & Ghazal'],
  ['Zakir Hussain', 'Sufi & Ghazal'], ['Ravi Shankar', 'Sufi & Ghazal'],
  ['Shubha Mudgal', 'Sufi & Ghazal'], ['Kaushiki Chakraborty', 'Sufi & Ghazal'],
]

function run(args, timeout = 90000) {
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
  return (JSON.parse(out).entries || []).filter(Boolean)
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

async function harvestArtist(name, lang, seen) {
  const rows = []
  const take = (entries) => {
    for (const e of entries) {
      const id = e.id
      const dur = Number(e.duration) || 0
      // `seen` is shared across the whole run, so a song surfacing under two
      // artists (playback singer + composer, very common here) lands once.
      if (!id || id.length !== 11 || seen.has(id)) continue
      if (dur < MIN_SEC || dur > MAX_SEC) continue
      const title = clean(e.title)
      if (!title) continue
      seen.add(id)
      rows.push([id, title.slice(0, 120), name, dur, name, lang])
    }
  }
  try {
    take(await search(`${name} songs`, PER_ARTIST))
  } catch (e) {
    console.warn(`  ! "${name}" songs search failed: ${e.message}`)
  }
  if (rows.length < 25) {
    try {
      take(await search(`${name} hit songs audio jukebox`, PER_ARTIST))
    } catch (e) {
      console.warn(`  ! "${name}" backup search failed: ${e.message}`)
    }
  }
  return rows
}

async function main() {
  const roster = argLimit ? ARTISTS.slice(0, argLimit) : ARTISTS
  const seen = new Set()
  const all = []
  let done = 0
  const started = Date.now()

  // Simple worker pool. yt-dlp searches are network-bound, so a few in flight
  // cuts a ~40 minute serial run to roughly a quarter of that. `seen` is only
  // touched inside harvestArtist's synchronous take(), so no locking needed.
  const queue = [...roster]
  const worker = async () => {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const [name, lang] = next
      const rows = await harvestArtist(name, lang, seen)
      all.push(...rows)
      done++
      const secs = Math.round((Date.now() - started) / 1000)
      console.log(
        `[${done}/${roster.length}] ${String(name).padEnd(26)} +${String(rows.length).padStart(2)}  total ${all.length}  ${secs}s`,
      )
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // Keep the roster's curated order rather than whatever order the pool finished in.
  const order = new Map(roster.map(([n], i) => [n, i]))
  all.sort((a, b) => (order.get(a[4]) ?? 0) - (order.get(b[4]) ?? 0))

  const artists = [...new Set(all.map((r) => r[4]))]
  const langs = [...new Set(all.map((r) => r[5]))]
  const perArtist = Object.fromEntries(
    artists.map((a) => [a, all.filter((r) => r[4] === a).length]),
  )

  const out = `import type { Track } from './types'

/**
 * Baked Indian-music catalog (${all.length} songs, ${artists.length} artists, ${langs.length} scenes),
 * harvested via the keyless yt-dlp helper (scripts/harvest-indian.mjs). Playing
 * from this list costs ZERO YouTube API quota — tracks play through the IFrame
 * player by video id, and id/title/artist/duration don't expire.
 *
 * The roster is curated, not exhaustive; add names to the harvester and re-run.
 * Do NOT hand-edit the data below.
 *
 * This module is imported LAZILY (see the Artists view) — it is a few hundred KB
 * and would otherwise land in the initial bundle for every visitor, including
 * those who never open it.
 *
 * Compact tuples: [id, title, artist, durationSec, artistTag, scene].
 */
type Raw = [string, string, string, number, string, string]

// eslint-disable-next-line
const RAW: Raw[] = JSON.parse(${JSON.stringify(JSON.stringify(all))})

export interface IndianTrack extends Track {
  artistTag: string
  scene: string
}

function build(r: Raw): IndianTrack {
  const [id, title, artist, duration, artistTag, scene] = r
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
    artistTag,
    scene,
  }
}

export const INDIAN_TRACKS: IndianTrack[] = RAW.map(build)

/** Artists in curated order, with how many songs each has. */
export const INDIAN_ARTISTS: { name: string; scene: string; count: number }[] = ${JSON.stringify(
    artists.map((a) => ({
      name: a,
      scene: all.find((r) => r[4] === a)[5],
      count: perArtist[a],
    })),
  )}

/** Scene names (Hindi, Punjabi, Tamil, …) in curated order. */
export const INDIAN_SCENES: string[] = ${JSON.stringify(langs)}

/** Every song by one artist. */
export function indianByArtist(name: string): IndianTrack[] {
  return INDIAN_TRACKS.filter((t) => t.artistTag === name)
}

/** Every artist in one scene. */
export function indianArtistsByScene(scene: string) {
  return INDIAN_ARTISTS.filter((a) => a.scene === scene)
}
`
  writeFileSync(OUT, out, 'utf8')
  const mins = ((Date.now() - started) / 60000).toFixed(1)
  console.log(`\nWrote ${OUT}`)
  console.log(`${all.length} tracks · ${artists.length} artists · ${langs.length} scenes · ${mins} min`)
  const thin = artists.filter((a) => perArtist[a] < 10)
  if (thin.length) console.log(`thin (<10 songs): ${thin.join(', ')}`)
}

main().catch((e) => {
  console.error('harvest failed:', e)
  process.exit(1)
})
