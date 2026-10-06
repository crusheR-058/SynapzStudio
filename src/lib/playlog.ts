// A local, timestamped log of plays — what the recap and the daily mixes are
// built from when there is no account (or no network) to ask.
//
// The stats blob in player.tsx only keeps running totals: plays per track and
// seconds per day. That can rank a favourite song but cannot say WHEN anything
// was played, which is what "your listening by hour" and "your streak" need. So
// each play is appended here with its time, capped so the log can't grow past a
// few hundred KB of localStorage.

import type { Track } from './types'
import type { PlayEvent } from './cloud'

const KEY = 'synapz:playlog'
const MAX = 1500

function read(): PlayEvent[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as PlayEvent[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function recordPlay(track: Track): void {
  try {
    const list = read()
    list.unshift({ track, at: Date.now() })
    if (list.length > MAX) list.length = MAX
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* quota or private mode — the log is best-effort */
  }
}

/** Newest first. */
export function localPlayEvents(sinceMs = 0): PlayEvent[] {
  const list = read()
  return sinceMs > 0 ? list.filter((e) => e.at >= sinceMs) : list
}
