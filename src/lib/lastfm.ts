// Last.fm scrobbling.
//
// Last.fm's API needs an application key + shared secret, and every write is
// signed with the secret (md5 over the sorted parameters). There is no keyless
// path, so credentials come from one of two places:
//
//   • VITE_LASTFM_API_KEY / VITE_LASTFM_API_SECRET baked in at build time —
//     then connecting is one click for everyone using that build.
//   • Otherwise the listener pastes their own key and secret (free, from
//     https://www.last.fm/api/account/create); they stay in localStorage.
//
// The "secret" is not secret in any client that scrobbles — a desktop app has
// to carry it. It guards nothing on its own: acting for a user still needs the
// session key they grant by approving the app on last.fm.
//
// Connecting is the desktop-style flow, which needs no callback URL and so
// works identically in the browser and in Electron:
//   auth.getToken  ->  the user approves at last.fm/api/auth  ->  auth.getSession
//
// Everything is best-effort. A failed scrobble is dropped, never retried into
// the player's way.

import type { Track } from './types'

const API = 'https://ws.audioscrobbler.com/2.0/'

const LS = {
  key: 'synapz:lastfm:key',
  secret: 'synapz:lastfm:secret',
  session: 'synapz:lastfm:session',
  user: 'synapz:lastfm:user',
}

const BUILT_IN = {
  key: ((import.meta as any).env?.VITE_LASTFM_API_KEY as string) || '',
  secret: ((import.meta as any).env?.VITE_LASTFM_API_SECRET as string) || '',
}

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) || ''
    } catch {
      return ''
    }
  },
  set: (k: string, v: string) => {
    try {
      if (v) localStorage.setItem(k, v)
      else localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

/** True when this build ships its own Last.fm app credentials. */
export const lastfmBuiltIn = () => !!(BUILT_IN.key && BUILT_IN.secret)

function creds(): { key: string; secret: string } {
  if (lastfmBuiltIn()) return BUILT_IN
  return { key: ls.get(LS.key), secret: ls.get(LS.secret) }
}

export function lastfmHasCreds(): boolean {
  const c = creds()
  return !!(c.key && c.secret)
}

export function setLastfmCreds(key: string, secret: string): void {
  ls.set(LS.key, key.trim())
  ls.set(LS.secret, secret.trim())
}

export function lastfmUser(): string {
  return ls.get(LS.session) ? ls.get(LS.user) : ''
}

export function lastfmConnected(): boolean {
  return !!ls.get(LS.session) && lastfmHasCreds()
}

export function lastfmDisconnect(): void {
  ls.set(LS.session, '')
  ls.set(LS.user, '')
}

/* -------------------------------------------------------------------- md5 */

// Web Crypto has no MD5 (it is broken for security use), but Last.fm's request
// signature is defined as MD5, so it is implemented here. RFC 1321.
export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const len = bytes.length
  const words = new Uint32Array((((len + 8) >>> 6) + 1) * 16)
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8)
  words[len >> 2] |= 0x80 << ((len % 4) * 8)
  words[words.length - 2] = (len * 8) >>> 0
  words[words.length - 1] = Math.floor(len / 0x20000000)

  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const K = new Uint32Array(64)
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let off = 0; off < words.length; off += 16) {
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const s = S[(i >> 4) * 4 + (i % 4)]
      const x = (a + f + K[i] + words[off + g]) | 0
      a = d
      d = c
      c = b
      b = (b + ((x << s) | (x >>> (32 - s)))) | 0
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const hex = (n: number) => {
    let s = ''
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
    return s
  }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0)
}

/* ------------------------------------------------------------------- calls */

async function call(
  method: string,
  params: Record<string, string>,
  opts: { signed?: boolean; post?: boolean } = {},
): Promise<any> {
  const { key, secret } = creds()
  if (!key) throw new Error('Last.fm is not configured')
  const all: Record<string, string> = { ...params, method, api_key: key }
  if (opts.signed) {
    // Signature: every parameter except `format`, sorted by name, concatenated
    // as name+value, with the secret appended.
    const base = Object.keys(all)
      .sort()
      .map((k) => k + all[k])
      .join('')
    all.api_sig = md5(base + secret)
  }
  all.format = 'json'
  const body = new URLSearchParams(all)
  const res = opts.post
    ? await fetch(API, { method: 'POST', body })
    : await fetch(`${API}?${body.toString()}`)
  const json = await res.json().catch(() => null)
  if (!json || json.error) throw new Error(json?.message || `Last.fm error ${res.status}`)
  return json
}

/** Step 1: get a request token and the URL where the user approves it. */
export async function lastfmBeginAuth(): Promise<{ token: string; url: string }> {
  const json = await call('auth.getToken', {}, { signed: true })
  const token = String(json.token || '')
  if (!token) throw new Error('Last.fm did not return a token')
  return { token, url: `https://www.last.fm/api/auth/?api_key=${creds().key}&token=${token}` }
}

/** Step 2: after approval, trade the token for a permanent session key. */
export async function lastfmFinishAuth(token: string): Promise<string> {
  const json = await call('auth.getSession', { token }, { signed: true })
  const key = String(json.session?.key || '')
  const name = String(json.session?.name || '')
  if (!key) throw new Error('Last.fm did not return a session')
  ls.set(LS.session, key)
  ls.set(LS.user, name)
  return name
}

/* ---------------------------------------------------------------- metadata */

// YouTube titles are video titles, not song titles. Left alone, a scrobble of
// "Tum Hi Ho - Official Video | Aashiqui 2 | Arijit Singh" lands on a Last.fm
// page nobody else's plays are on. This is a best guess, not a parser.
const NOISE =
  /\s*[\(\[][^)\]]*(official|video|audio|lyric|lyrics|visuali[sz]er|hd|4k|full song|remaster(ed)?)[^)\]]*[\)\]]/gi
const TAIL = /\s*[|\-–—:]\s*(official\s+)?(music\s+|lyric(al)?\s+|full\s+)?(video|audio|song)\b.*$/i

export function scrobbleMeta(t: Track): { artist: string; track: string } {
  let title = (t.title || '').replace(NOISE, '').replace(TAIL, '').trim()
  let artist = (t.artist || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim()
  if (t.source === 'youtube') {
    title = title.split('|')[0].trim()
    // "Artist - Title" is the dominant convention for music uploads.
    const m = /^(.{2,60}?)\s+[-–—]\s+(.{2,})$/.exec(title)
    if (m) {
      artist = m[1].trim()
      title = m[2].trim()
    }
  }
  return { artist: artist || 'Unknown Artist', track: title || t.title || 'Unknown' }
}

export async function lastfmNowPlaying(t: Track): Promise<void> {
  const sk = ls.get(LS.session)
  if (!sk) return
  const m = scrobbleMeta(t)
  const params: Record<string, string> = { artist: m.artist, track: m.track, sk }
  if (t.duration) params.duration = String(Math.round(t.duration))
  try {
    await call('track.updateNowPlaying', params, { signed: true, post: true })
  } catch {
    /* best-effort */
  }
}

export async function lastfmScrobble(t: Track, startedAtMs: number): Promise<boolean> {
  const sk = ls.get(LS.session)
  if (!sk) return false
  const m = scrobbleMeta(t)
  const params: Record<string, string> = {
    artist: m.artist,
    track: m.track,
    timestamp: String(Math.floor(startedAtMs / 1000)),
    sk,
  }
  if (t.duration) params.duration = String(Math.round(t.duration))
  try {
    await call('track.scrobble', params, { signed: true, post: true })
    return true
  } catch {
    return false
  }
}
