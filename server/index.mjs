import express from 'express'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { Readable } from 'node:stream'

// Load .env locally so SPOTIFY_CLIENT_ID/SECRET (and SESSION_SECRET) are
// available to this dev server. Node 20.6+/24 built-in — no dotenv dependency.
// (On Vercel, env vars come from the project settings, so this is a no-op there.)
try {
  process.loadEnvFile()
} catch {
  /* no .env file — fine */
}
import {
  currentUser,
  publicUser,
  signSession,
  sessionCookie,
  clearCookie,
  verifyGoogleToken,
  googleUser,
} from '../lib/session.mjs'
import { importSpotify, SpotifyError } from '../lib/spotify.mjs'

/**
 * Synapz LOCAL dev backend — same auth logic as the Vercel functions in /api
 * (shared via lib/session.mjs: stateless signed-cookie sessions), plus the
 * keyless YouTube search via yt-dlp (which only runs locally — on Vercel the
 * frontend uses the YouTube Data API instead).
 */

const PORT = process.env.PORT || 8787
const ROOT = process.cwd()
// Locate yt-dlp: an explicit YTDLP_PATH wins (set it in Docker / hosts), else
// the bundled binary in bin/ (local dev), else fall back to `yt-dlp` on PATH
// (e.g. installed system-wide in a container).
const BUNDLED_YTDLP = path.join(ROOT, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
const YTDLP = process.env.YTDLP_PATH || (existsSync(BUNDLED_YTDLP) ? BUNDLED_YTDLP : 'yt-dlp')

function run(args, timeout = 25000) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout, maxBuffer: 1024 * 1024 * 24 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.toString() || err.message))
      else resolve(stdout.toString())
    })
  })
}

const app = express()
app.use(express.json({ limit: '256kb' }))

// --- auth (shared, stateless cookie sessions) ---------------------------
app.post('/api/auth/google', async (req, res) => {
  const payload = req.body?.credential ? await verifyGoogleToken(req.body.credential) : null
  if (!payload?.email) return res.status(401).json({ error: 'invalid credential' })
  const u = googleUser(payload)
  res.setHeader('Set-Cookie', sessionCookie(signSession(u)))
  res.json({ user: publicUser(u) })
})

app.get('/api/me', (req, res) => res.json({ user: publicUser(currentUser(req)) }))

app.post('/api/profile/name', (req, res) => {
  const u = currentUser(req)
  if (!u) return res.status(401).json({ error: 'not logged in' })
  const name = (typeof req.body?.name === 'string' ? req.body.name : '').trim()
  if (name) u.name = name.slice(0, 60)
  res.setHeader('Set-Cookie', sessionCookie(signSession(u)))
  res.json({ user: publicUser(u) })
})

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearCookie())
  res.json({ ok: true })
})

// --- spotify playlist import (Client-Credentials; reads public playlists) ---
app.get('/api/spotify/playlist', async (req, res) => {
  const url = String(req.query.url || '')
  if (!url) return res.status(400).json({ error: 'Missing ?url' })
  try {
    res.json(await importSpotify(url))
  } catch (e) {
    const code = e instanceof SpotifyError ? e.code : 'UNKNOWN'
    if (code === 'NOT_CONFIGURED')
      return res
        .status(501)
        .json({ error: 'Spotify import isn’t set up — add SPOTIFY_CLIENT_ID & SPOTIFY_CLIENT_SECRET.' })
    if (code === 'BAD_URL') return res.status(400).json({ error: 'That isn’t a Spotify link.' })
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'Playlist not found — is it public?' })
    res.status(502).json({ error: 'Couldn’t read that playlist (make sure it’s public).' })
  }
})

// --- keyless youtube search (yt-dlp) — LOCAL DEV ONLY -------------------
app.get('/yt/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json([])
  const n = Math.min(50, Math.max(1, parseInt(String(req.query.n || '40'), 10) || 40))
  try {
    const out = await run([
      '--flat-playlist',
      '-J',
      '--no-warnings',
      '--ignore-config',
      `ytsearch${n}:${q}`,
    ])
    const data = JSON.parse(out)
    const items = (data.entries || []).filter(Boolean).map((e) => ({
      id: e.id,
      title: e.title || 'Untitled',
      uploader: (e.uploader || e.channel || 'YouTube').replace(/\s*-\s*Topic$/, ''),
      duration: e.duration || 0,
      views: e.view_count || 0,
      thumb:
        e.thumbnails && e.thumbnails.length
          ? e.thumbnails[e.thumbnails.length - 1].url
          : `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
    }))
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

// --- keyless youtube AUDIO stream proxy (yt-dlp) -----------------------
// This is what lets Bollywood/Hollywood/YouTube tracks play through a normal
// <audio> element (and therefore keep playing when the phone is locked), instead
// of the YouTube IFrame embed which mobile browsers force-pause on lock.
//
// How it works: yt-dlp extracts the direct googlevideo audio URL (cached ~5h),
// then we PROXY the bytes. Proxying (rather than redirecting) is required —
// googlevideo URLs are IP-locked to whoever requested them, so the fetch must
// originate from this server, not the user's browser. We forward the client's
// Range header so seeking works.
const streamCache = new Map() // id -> { url, exp }

async function resolveAudioUrl(id) {
  const cached = streamCache.get(id)
  if (cached && cached.exp > Date.now()) return cached.url
  // Prefer m4a/AAC — the one audio codec every browser (incl. iOS Safari) plays.
  const out = await run(
    [
      '-f',
      'bestaudio[ext=m4a]/bestaudio/best',
      '-g',
      '--no-warnings',
      '--ignore-config',
      `https://www.youtube.com/watch?v=${id}`,
    ],
    30000,
  )
  const url = out.trim().split('\n').filter(Boolean).pop()
  if (!url) throw new Error('no audio url')
  streamCache.set(id, { url, exp: Date.now() + 5 * 60 * 60 * 1000 })
  return url
}

// Lets the frontend detect at runtime that background streaming is available.
// On Vercel (no /yt routes) this 404s, so the app transparently falls back to
// the IFrame — nothing breaks.
app.get('/yt/capabilities', (_req, res) => res.json({ stream: true }))

app.get('/yt/stream', async (req, res) => {
  const id = String(req.query.id || '').trim()
  if (!/^[\w-]{6,15}$/.test(id)) return res.status(400).end('bad id')

  const fetchUpstream = async (url) => {
    const headers = { 'user-agent': 'Mozilla/5.0', accept: '*/*' }
    if (req.headers.range) headers.range = req.headers.range
    return fetch(url, { headers })
  }

  try {
    let url = await resolveAudioUrl(id)
    let upstream = await fetchUpstream(url)
    // A cached URL can expire / get rejected — re-resolve once and retry.
    if (upstream.status === 403 || upstream.status === 410 || upstream.status === 404) {
      streamCache.delete(id)
      url = await resolveAudioUrl(id)
      upstream = await fetchUpstream(url)
    }
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).end('upstream error')
    }
    res.status(upstream.status)
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h)
      if (v) res.setHeader(h, v)
    }
    if (!upstream.headers.get('accept-ranges')) res.setHeader('accept-ranges', 'bytes')
    if (!upstream.headers.get('content-type')) res.setHeader('content-type', 'audio/mp4')
    res.setHeader('cache-control', 'no-store')
    if (!upstream.body) return res.end()
    const node = Readable.fromWeb(upstream.body)
    req.on('close', () => node.destroy())
    node.on('error', () => {
      try {
        res.end()
      } catch {
        /* client already gone */
      }
    })
    node.pipe(res)
  } catch (e) {
    res.status(500).end(String(e?.message || e))
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true, runtime: 'local' }))

// --- serve the built SPA (single-server / self-host deploys) -------------
// When a production build exists in /dist, this same process can serve the
// whole app on one origin — so /yt/stream is same-origin and background audio
// works end-to-end from `node server/index.mjs`. Harmless in dev (Vite serves
// the frontend and only proxies /api + /yt here).
const DIST = path.join(ROOT, 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/yt')) {
      return res.sendFile(path.join(DIST, 'index.html'))
    }
    next()
  })
}

app.listen(PORT, () => console.log(`[synapz-api] listening on http://localhost:${PORT}`))
