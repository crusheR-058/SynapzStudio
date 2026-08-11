// YouTube search proxy for clients without the yt-dlp helper (hosted web).
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

// In-memory cache (per warm lambda) — each search.list call costs 100 quota
// units against a 10k/day budget shared by every user, so repeats must be free.
// Layered with the CDN cache header set on success responses, which lets
// Vercel's edge serve repeated queries without invoking this function at all.
const memCache = new Map() // key -> { t, items }
const MEM_TTL = 6 * 60 * 60 * 1000 // 6h
const MEM_MAX = 500

function memGet(k) {
  const hit = memCache.get(k)
  if (!hit) return null
  if (Date.now() - hit.t > MEM_TTL) {
    memCache.delete(k)
    return null
  }
  // LRU touch: re-insert so popular queries survive eviction (Map preserves
  // insertion order; plain oldest-insertion eviction let a burst of unique
  // queries flush every hot entry).
  memCache.delete(k)
  memCache.set(k, hit)
  return hit.items
}

// Per-IP token bucket (per warm lambda) — this endpoint is public and every
// unique query costs 100 quota units of a 10k/day budget shared by all users,
// so a single abusive client must not be able to drain it.
const ipHits = new Map() // ip -> { n, t }
const RATE_MAX = 30 // requests / minute / ip
function rateLimited(ip) {
  const now = Date.now()
  const rec = ipHits.get(ip)
  if (!rec || now - rec.t > 60000) {
    if (ipHits.size > 2000) ipHits.clear() // bound memory
    ipHits.set(ip, { n: 1, t: now })
    return false
  }
  rec.n++
  return rec.n > RATE_MAX
}

function memSet(k, items) {
  if (memCache.size >= MEM_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = memCache.keys().next().value
    if (oldest !== undefined) memCache.delete(oldest)
  }
  memCache.set(k, { t: Date.now(), items })
}

const CDN_CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800'

export default async function handler(req, res) {
  const q = (req.query?.q || '').toString().trim()
  if (!q) return res.status(200).json([])
  const n = Math.min(50, Math.max(1, parseInt((req.query?.n || '20').toString(), 10) || 20))

  const cacheKey = `${q.toLowerCase()}|${n}`
  const cached = memGet(cacheKey)
  if (cached) {
    res.setHeader('Cache-Control', CDN_CACHE)
    return res.status(200).json(cached)
  }

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many searches — slow down a little.' })
  }

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
    if (!ids.length) {
      // The 100-unit search already happened — cache the emptiness too so
      // replaying a no-result query can't re-spend quota.
      memSet(cacheKey, [])
      res.setHeader('Cache-Control', 'public, s-maxage=3600')
      return res.status(200).json([])
    }

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
    memSet(cacheKey, items)
    // Let Vercel's CDN answer repeats (24h for results, 1h for empties, plus
    // stale-while-revalidate) — those hits never reach this function or the quota.
    res.setHeader('Cache-Control', items.length ? CDN_CACHE : 'public, s-maxage=3600')
    res.status(200).json(items)
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) })
  }
}
