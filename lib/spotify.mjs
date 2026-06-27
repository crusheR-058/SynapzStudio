/**
 * Spotify playlist/album/track importer (server-side).
 *
 * Reads a PUBLIC playlist's track list (titles + artists) so we can play matched
 * versions from our own sources. Shared by the Vercel function
 * (api/spotify/playlist.mjs) and the local Express dev server (server/index.mjs).
 *
 * TWO strategies, tried in order:
 *  1. PUBLIC EMBED (primary) — fetches open.spotify.com/embed/{type}/{id} and
 *     reads the track list out of its embedded JSON. Needs NO credentials and
 *     NO Spotify Premium. Server-side only (the embed page has no CORS headers).
 *  2. OFFICIAL WEB API (fallback) — Client-Credentials flow using
 *     SPOTIFY_CLIENT_ID/SECRET. Higher quality (full playlists, durations) but
 *     Spotify now REQUIRES the app owner to have Premium, so it 403s otherwise.
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'
const EMBED = 'https://open.spotify.com/embed'
const MAX_TRACKS = 250

let cachedToken = { value: null, exp: 0 }

export class SpotifyError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

export function parseSpotifyUrl(input) {
  const s = String(input || '').trim()
  let m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i)
  if (m) return { type: m[1].toLowerCase(), id: m[2] }
  m = s.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i)
  if (m) return { type: m[1].toLowerCase(), id: m[2] }
  return null
}

/* ----------------------------------------------- 1) public embed (no creds) */

function pickEmbedCover(entity) {
  const src = entity?.coverArt?.sources || entity?.visualIdentity?.image || []
  if (Array.isArray(src) && src.length) return src[src.length - 1]?.url || src[0]?.url || ''
  return ''
}

async function importViaEmbed(parsed) {
  const res = await fetch(`${EMBED}/${parsed.type}/${parsed.id}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'accept-language': 'en' },
  })
  if (!res.ok) throw new SpotifyError(res.status === 404 ? 'NOT_FOUND' : 'HTTP_' + res.status)
  const html = await res.text()
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s)
  if (!m) throw new SpotifyError('NOT_FOUND')
  let json
  try {
    json = JSON.parse(m[1])
  } catch {
    throw new SpotifyError('NOT_FOUND')
  }
  const entity = json?.props?.pageProps?.state?.data?.entity
  if (!entity) throw new SpotifyError('NOT_FOUND')

  const list = Array.isArray(entity.trackList) ? entity.trackList : []
  let tracks = list
    .map((t) => ({ title: t.title || '', artist: t.subtitle || '', durationMs: t.duration || 0 }))
    .filter((t) => t.title)
    .slice(0, MAX_TRACKS)

  // A single-track embed has no trackList — use the entity itself.
  if (!tracks.length && parsed.type === 'track' && entity.title) {
    tracks = [{ title: entity.title, artist: entity.subtitle || '', durationMs: entity.duration || 0 }]
  }
  if (!tracks.length) throw new SpotifyError('NOT_FOUND')

  return {
    kind: parsed.type,
    name: entity.title || entity.name || 'Spotify',
    image: pickEmbedCover(entity),
    total: tracks.length,
    tracks,
  }
}

/* ------------------------------------------- 2) official API (needs Premium) */

async function getToken() {
  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) throw new SpotifyError('NOT_CONFIGURED')
  if (cachedToken.value && Date.now() < cachedToken.exp - 5000) return cachedToken.value
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new SpotifyError('AUTH_FAILED')
  const j = await res.json()
  cachedToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }
  return cachedToken.value
}

async function apiGet(pathOrUrl, token) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl
  const res = await fetch(url, { headers: { authorization: 'Bearer ' + token } })
  if (res.status === 404) throw new SpotifyError('NOT_FOUND')
  if (!res.ok) throw new SpotifyError('HTTP_' + res.status)
  return res.json()
}

function mapApiTrack(t) {
  if (!t) return null
  return {
    title: t.name || '',
    artist: (t.artists || []).map((a) => a.name).filter(Boolean).join(', '),
    durationMs: t.duration_ms || 0,
  }
}
const stripApi = (next) => (next ? next.replace(API, '') : null)

async function importViaApi(parsed) {
  const token = await getToken()
  const tracks = []

  if (parsed.type === 'track') {
    const t = await apiGet(`/tracks/${parsed.id}`, token)
    return {
      kind: 'track',
      name: t.name || 'Track',
      image: t.album?.images?.[0]?.url || '',
      total: 1,
      tracks: [mapApiTrack(t)].filter(Boolean),
    }
  }
  if (parsed.type === 'album') {
    const al = await apiGet(`/albums/${parsed.id}`, token)
    let page = al.tracks
    while (page && tracks.length < MAX_TRACKS) {
      for (const it of page.items || []) tracks.push(mapApiTrack(it))
      const next = stripApi(page.next)
      page = next ? await apiGet(next, token) : null
    }
    return {
      kind: 'album',
      name: al.name || 'Album',
      image: al.images?.[0]?.url || '',
      total: al.tracks?.total || tracks.length,
      tracks: tracks.filter(Boolean),
    }
  }
  const meta = await apiGet(`/playlists/${parsed.id}?fields=name,images,tracks(total)`, token)
  let next = `/playlists/${parsed.id}/tracks?limit=100&fields=items(track(name,artists(name),duration_ms)),next`
  while (next && tracks.length < MAX_TRACKS) {
    const page = await apiGet(next, token)
    for (const it of page.items || []) {
      const m = mapApiTrack(it.track)
      if (m && m.title) tracks.push(m)
    }
    next = stripApi(page.next)
  }
  return {
    kind: 'playlist',
    name: meta.name || 'Playlist',
    image: meta.images?.[0]?.url || '',
    total: meta.tracks?.total || tracks.length,
    tracks,
  }
}

/* ------------------------------------------------------------- orchestrator */

export async function importSpotify(url) {
  const parsed = parseSpotifyUrl(url)
  if (!parsed) throw new SpotifyError('BAD_URL')
  // Embed first — works for everyone (no credentials / no Premium).
  try {
    return await importViaEmbed(parsed)
  } catch (embedErr) {
    // Fallback to the official API only if it's configured (and the owner has
    // Premium) — gives full, untruncated playlists.
    if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      try {
        return await importViaApi(parsed)
      } catch {
        /* ignore — surface the embed error below */
      }
    }
    throw embedErr
  }
}
