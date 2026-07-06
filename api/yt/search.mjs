// YouTube search proxy for clients without the yt-dlp helper (the mobile app).
// Calls the YouTube Data API server-side and returns the SAME shape the yt-dlp
// helper returns ({ id, title, uploader, duration, views, thumb }) so the client's
// mapLocal() is unchanged. Reachable at /yt/search via a rewrite in vercel.json.

const API = 'https://www.googleapis.com/youtube/v3'

function iso8601ToSec(d) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || '')
  if (!m) return 0
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0)
}

// The Data API returns titles with HTML entities; the yt-dlp helper returns them
// decoded, so decode the common ones here to match.
function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
}

export default async function handler(req, res) {
  const q = (req.query?.q || '').toString().trim()
  if (!q) return res.status(200).json([])
  const n = Math.min(50, Math.max(1, parseInt((req.query?.n || '20').toString(), 10) || 20))

  const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY
  if (!key) return res.status(501).json({ error: 'YouTube API key not configured on the server.' })

  // The key is HTTP-referrer-restricted to this site's origin. A server-side fetch
  // sends no Referer, so set it to our own host (which the key allows).
  const headers = { Referer: `https://${req.headers.host || 'synapz-music.vercel.app'}/` }

  try {
    const sj = await fetch(
      `${API}/search?part=snippet&type=video&videoEmbeddable=true&maxResults=${n}` +
        `&q=${encodeURIComponent(q)}&key=${key}`,
      { headers },
    ).then((r) => r.json())
    if (sj.error) return res.status(502).json({ error: sj.error?.message || 'search failed' })

    const ids = (sj.items || []).map((it) => it.id?.videoId).filter(Boolean)
    if (!ids.length) return res.status(200).json([])

    const dj = await fetch(
      `${API}/videos?part=contentDetails,snippet,statistics&id=${ids.join(',')}&key=${key}`,
      { headers },
    ).then((r) => r.json())

    const items = (dj.items || []).map((v) => {
      const sn = v.snippet || {}
      const th = sn.thumbnails || {}
      return {
        id: v.id,
        title: decode(sn.title || 'Untitled'),
        uploader: decode(sn.channelTitle || 'YouTube'),
        duration: iso8601ToSec(v.contentDetails?.duration),
        views: Number(v.statistics?.viewCount) || 0,
        thumb: (th.high || th.medium || th.default || {}).url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      }
    })
    res.status(200).json(items)
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) })
  }
}
