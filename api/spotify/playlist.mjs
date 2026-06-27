import { importSpotify, SpotifyError } from '../../lib/spotify.mjs'

export default async function handler(req, res) {
  const url = (req.query?.url || req.body?.url || '').toString()
  if (!url) return res.status(400).json({ error: 'Missing ?url' })
  try {
    const data = await importSpotify(url)
    res.status(200).json(data)
  } catch (e) {
    const code = e instanceof SpotifyError ? e.code : 'UNKNOWN'
    if (code === 'NOT_CONFIGURED')
      return res
        .status(501)
        .json({ error: 'Spotify import isn’t set up — add SPOTIFY_CLIENT_ID & SPOTIFY_CLIENT_SECRET.' })
    if (code === 'BAD_URL') return res.status(400).json({ error: 'That isn’t a Spotify link.' })
    if (code === 'NOT_FOUND')
      return res.status(404).json({ error: 'Playlist not found — is it public?' })
    res.status(502).json({ error: 'Couldn’t read that playlist (make sure it’s public).' })
  }
}
