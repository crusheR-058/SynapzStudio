import express from 'express'
import { execFile } from 'node:child_process'
import path from 'node:path'

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
const YTDLP = path.join(ROOT, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')

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

app.get('/api/health', (_req, res) => res.json({ ok: true, runtime: 'local' }))

app.listen(PORT, () => console.log(`[synapz-api] listening on http://localhost:${PORT}`))
