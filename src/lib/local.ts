// Local files — your own music, played next to the streams.
//
// Two ways in, depending on where the app runs:
//
//   • Desktop: pick a folder once. The shell remembers it, scans it for audio,
//     and serves the files over a private synapz-file:// scheme (a page loaded
//     from http://localhost cannot read file:// URLs directly).
//   • Browser: pick a folder with the file input. The browser hands over File
//     objects, which play through object URLs — for this session only, since a
//     web page is not allowed to keep access to a folder across reloads.
//
// There is no tag reader. Title and artist are read off the file name, which
// for the common "Artist - Title.mp3" convention is exactly right and for
// everything else is the file name — still enough to find and play the song.

import type { Track } from './types'
import type { LocalFile } from './desktop'

export const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|weba|webm)$/i

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** "03 - Artist - Title.mp3" -> { artist, title }, with the folder as fallback. */
export function parseFileName(name: string, dir: string): { title: string; artist: string } {
  let base = name.replace(AUDIO_EXT, '').replace(/_/g, ' ').trim()
  // Leading track numbers: "01 ", "01. ", "1 - ", "01-".
  base = base.replace(/^\d{1,3}\s*[.\-–)]?\s+/, '').trim() || base
  const m = /^(.{1,80}?)\s+[-–—]\s+(.{1,})$/.exec(base)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { title: base || name, artist: dir || 'Local file' }
}

function toTrack(id: string, name: string, dir: string, streamUrl: string): Track {
  const { title, artist } = parseFileName(name, dir)
  return {
    id,
    source: 'local',
    title,
    artist,
    artistHandle: '',
    artwork: '',
    artworkLarge: '',
    // Unknown until the file is opened; the player reads the real length off
    // the audio element once it starts.
    duration: 0,
    genre: dir || undefined,
    streamUrl,
  }
}

const byTitle = (a: Track, b: Track) =>
  (a.genre || '').localeCompare(b.genre || '') || a.title.localeCompare(b.title)

/** Desktop: files the shell scanned -> tracks streamed over synapz-file://. */
export function tracksFromScan(files: LocalFile[]): Track[] {
  return files
    .map((f) =>
      toTrack(
        `local-${hash(f.path)}`,
        f.name,
        f.dir,
        `synapz-file://track/${encodeURIComponent(f.path)}`,
      ),
    )
    .sort(byTitle)
}

// Browser session library. Module-level so leaving the Local Files view and
// coming back doesn't lose the folder the user just picked.
let sessionTracks: Track[] = []
let sessionUrls: string[] = []

export const browserTracks = () => sessionTracks

/** Browser: a FileList from <input webkitdirectory> -> tracks on object URLs. */
export function loadBrowserFiles(files: FileList | File[]): Track[] {
  for (const u of sessionUrls) URL.revokeObjectURL(u)
  sessionUrls = []
  const out: Track[] = []
  for (const f of Array.from(files)) {
    if (!AUDIO_EXT.test(f.name)) continue
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    const parts = rel.split('/')
    const dir = parts.length > 1 ? parts[parts.length - 2] : ''
    const url = URL.createObjectURL(f)
    sessionUrls.push(url)
    out.push(toTrack(`local-${hash(`${rel || f.name}:${f.size}`)}`, f.name, dir, url))
  }
  sessionTracks = out.sort(byTitle)
  return sessionTracks
}
