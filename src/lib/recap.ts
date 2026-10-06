// Listening recap ("Wrapped") — turns a list of play events into the numbers
// the Recap view shows, and draws the shareable card.
//
// Pure functions over PlayEvent[]; where the events come from (cloud history
// for a signed-in user, the local play log otherwise) is the view's business.

import type { Track } from './types'
import type { PlayEvent } from './cloud'
import { webOrigin } from './listen'

export type RecapPeriod = 'month' | 'year' | 'all'

export const PERIODS: { key: RecapPeriod; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

export function periodStart(p: RecapPeriod, now = new Date()): number {
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  if (p === 'year') return new Date(now.getFullYear(), 0, 1).getTime()
  return 0
}

export function periodTitle(p: RecapPeriod, now = new Date()): string {
  if (p === 'month') return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  if (p === 'year') return String(now.getFullYear())
  return 'All time'
}

export interface Recap {
  plays: number
  /**
   * Estimated, not measured: play_history records that a track STARTED, not how
   * long it ran, so this is the sum of track lengths. A skipped song counts in
   * full, which is why the UI labels it "about".
   */
  minutes: number
  uniqueTracks: number
  uniqueArtists: number
  topTracks: { track: Track; count: number }[]
  topArtists: { artist: string; count: number; artwork: string }[]
  /** Plays per hour of day, 24 buckets, local time. */
  byHour: number[]
  peakHour: number
  /** Distinct calendar days with at least one play. */
  activeDays: number
  /** Longest run of consecutive listening days. */
  longestStreak: number
  /** Run of consecutive days ending today (or yesterday). */
  currentStreak: number
  persona: { title: string; blurb: string }
}

const dayNum = (ms: number) => {
  const d = new Date(ms)
  // Local-midnight day index; UTC math would split a late-night session in two.
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000)
}

// Long-form uploads (podcasts, 1h mixes) would swamp the minutes estimate.
const MAX_COUNTED_SEC = 15 * 60
// A local file's length isn't known when its play is logged (there is no tag
// reader), so it is counted as a typical song instead of as zero.
const UNKNOWN_SEC = 210

function personaFor(byHour: number[], plays: number, uniqueTracks: number) {
  if (!plays) return { title: 'Just getting started', blurb: 'Play a few songs and this fills in.' }
  const slice = (from: number, to: number) => {
    let n = 0
    for (let h = from; h < to; h++) n += byHour[h]
    return n / plays
  }
  const night = slice(22, 24) + slice(0, 5)
  const morning = slice(5, 11)
  const repeatRate = 1 - uniqueTracks / plays
  if (night > 0.4)
    return { title: 'Night Owl', blurb: 'Most of your listening happens after the lights go out.' }
  if (morning > 0.4)
    return { title: 'Early Bird', blurb: 'You start the day with the volume already up.' }
  if (repeatRate > 0.6)
    return { title: 'On Repeat', blurb: 'When you find a song you love, you really commit.' }
  if (repeatRate < 0.15 && plays > 20)
    return { title: 'Explorer', blurb: 'Almost everything you played was something new.' }
  return { title: 'All-Rounder', blurb: 'A bit of everything, at every hour of the day.' }
}

export function buildRecap(events: PlayEvent[]): Recap {
  const trackAgg = new Map<string, { track: Track; count: number }>()
  const artistAgg = new Map<string, { artist: string; count: number; artwork: string }>()
  const byHour = new Array<number>(24).fill(0)
  const days = new Set<number>()
  let seconds = 0

  for (const e of events) {
    const t = e.track
    if (!t?.id) continue
    const cur = trackAgg.get(t.id)
    if (cur) cur.count++
    else trackAgg.set(t.id, { track: t, count: 1 })

    const artist = (t.artist || '').trim()
    if (artist) {
      const a = artistAgg.get(artist)
      if (a) a.count++
      else artistAgg.set(artist, { artist, count: 1, artwork: t.artwork || '' })
    }
    seconds += Math.min(t.duration || UNKNOWN_SEC, MAX_COUNTED_SEC)
    if (e.at) {
      byHour[new Date(e.at).getHours()]++
      days.add(dayNum(e.at))
    }
  }

  const sortedDays = [...days].sort((a, b) => a - b)
  let longest = 0
  let run = 0
  let prev = NaN
  for (const d of sortedDays) {
    run = d === prev + 1 ? run + 1 : 1
    if (run > longest) longest = run
    prev = d
  }
  // The current streak survives until a full day is missed, so a streak that
  // ran through yesterday still counts before today's first play.
  const today = dayNum(Date.now())
  let current = 0
  let cursor = days.has(today) ? today : today - 1
  while (days.has(cursor)) {
    current++
    cursor--
  }

  const plays = [...trackAgg.values()].reduce((n, x) => n + x.count, 0)
  let peakHour = 0
  for (let h = 1; h < 24; h++) if (byHour[h] > byHour[peakHour]) peakHour = h

  return {
    plays,
    minutes: Math.round(seconds / 60),
    uniqueTracks: trackAgg.size,
    uniqueArtists: artistAgg.size,
    topTracks: [...trackAgg.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    topArtists: [...artistAgg.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    byHour,
    peakHour,
    activeDays: days.size,
    longestStreak: longest,
    currentStreak: current,
    persona: personaFor(byHour, plays, trackAgg.size),
  }
}

export function fmtHour(h: number): string {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric' })
}

/* ------------------------------------------------------------ share card */

const CARD_W = 1080
const CARD_H = 1350

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

/**
 * Draw the recap as a 4:5 image. Text only, on purpose: album art comes from
 * YouTube and Audius CDNs that don't send CORS headers, and a single such image
 * taints the canvas so toBlob() throws — the card would fail for exactly the
 * users with the most to show.
 */
export function drawRecapCard(recap: Recap, title: string, name: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = CARD_W
  c.height = CARD_H
  const ctx = c.getContext('2d')!
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#ff2e4c'
  const font = (w: number, px: number) => `${w} ${px}px Figtree, system-ui, sans-serif`

  ctx.fillStyle = '#0a0a0c'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  const glow = ctx.createRadialGradient(CARD_W * 0.85, 60, 0, CARD_W * 0.85, 60, 900)
  glow.addColorStop(0, accent)
  glow.addColorStop(1, 'rgba(10,10,12,0)')
  ctx.globalAlpha = 0.5
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.globalAlpha = 1

  const PAD = 84
  const W = CARD_W - PAD * 2
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = accent
  ctx.font = font(800, 30)
  ctx.fillText('SYNAPZ MUSIC  ·  RECAP', PAD, 130)
  ctx.fillStyle = '#fff'
  ctx.font = font(900, 92)
  ctx.fillText(ellipsize(ctx, title, W), PAD, 236)
  ctx.fillStyle = '#a0a0a8'
  ctx.font = font(600, 34)
  ctx.fillText(ellipsize(ctx, name ? `${name}'s listening` : 'My listening', W), PAD, 292)

  // Headline numbers.
  const stats: [string, string][] = [
    [recap.minutes.toLocaleString(), 'minutes (about)'],
    [recap.plays.toLocaleString(), 'songs played'],
    [String(recap.longestStreak), 'day streak'],
  ]
  stats.forEach(([value, label], i) => {
    const x = PAD + (W / 3) * i
    ctx.fillStyle = '#fff'
    ctx.font = font(900, 68)
    ctx.fillText(value, x, 430)
    ctx.fillStyle = '#a0a0a8'
    ctx.font = font(600, 26)
    ctx.fillText(label, x, 472)
  })

  const list = (heading: string, rows: string[], x: number, y: number, w: number) => {
    ctx.fillStyle = accent
    ctx.font = font(800, 28)
    ctx.fillText(heading, x, y)
    rows.forEach((row, i) => {
      const ry = y + 62 + i * 66
      ctx.fillStyle = '#6b6b74'
      ctx.font = font(800, 34)
      ctx.fillText(String(i + 1), x, ry)
      ctx.fillStyle = '#fff'
      ctx.font = font(700, 34)
      ctx.fillText(ellipsize(ctx, row, w - 56), x + 56, ry)
    })
  }
  const colW = W / 2 - 24
  list('TOP ARTISTS', recap.topArtists.slice(0, 5).map((a) => a.artist), PAD, 600, colW)
  list('TOP SONGS', recap.topTracks.slice(0, 5).map((t) => t.track.title), PAD + W / 2 + 24, 600, colW)

  // Persona strip.
  const py = 1040
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.roundRect(PAD, py, W, 200, 28)
  ctx.fill()
  ctx.fillStyle = '#a0a0a8'
  ctx.font = font(700, 26)
  ctx.fillText('YOUR LISTENING STYLE', PAD + 40, py + 62)
  ctx.fillStyle = '#fff'
  ctx.font = font(900, 58)
  ctx.fillText(recap.persona.title, PAD + 40, py + 132)
  ctx.fillStyle = '#a0a0a8'
  ctx.font = font(500, 26)
  ctx.fillText(ellipsize(ctx, recap.persona.blurb, W - 80), PAD + 40, py + 172)

  ctx.fillStyle = '#6b6b74'
  ctx.font = font(600, 24)
  ctx.fillText(webOrigin().replace(/^https?:\/\//, ''), PAD, CARD_H - 56)
  return c
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
}
