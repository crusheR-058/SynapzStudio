import crypto from 'node:crypto'

/**
 * Stateless, signed-cookie sessions — works in BOTH the local Express dev server
 * (server/index.mjs) and Vercel serverless functions (api/*.mjs). No database,
 * no in-memory Map, no filesystem (all of which break on serverless): the whole
 * user object is stored in an HMAC-signed cookie, so it survives across the
 * stateless function invocations Vercel uses.
 *
 * Set SESSION_SECRET in the environment (Vercel project env var) for production.
 */
const SECRET = process.env.SESSION_SECRET || 'synapz-dev-secret-change-me'
if (!process.env.SESSION_SECRET && process.env.VERCEL) {
  // On a real deployment the default secret is public (it's in this file), so
  // anyone could forge a session cookie. Warn loudly — set SESSION_SECRET.
  console.warn('[synapz] SESSION_SECRET is not set — using the insecure default. Set it in the Vercel project env.')
}
const COOKIE = 'synapz'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest()

export function signSession(user) {
  const payload = b64url(JSON.stringify(user))
  const sig = b64url(hmac(payload))
  return `${payload}.${sig}`
}

export function parseSession(token) {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expected = b64url(hmac(payload))
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    return JSON.parse(fromB64url(payload).toString('utf8'))
  } catch {
    return null
  }
}

// Secure cookie only when served over HTTPS (Vercel), never on http://localhost.
export function sessionCookie(token) {
  const secure = process.env.VERCEL ? '; Secure' : ''
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`
}
export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

// Reads a cookie from either a Vercel function req (req.cookies) or a raw Node
// request (req.headers.cookie, as used by Express).
export function getCookie(req, name = COOKIE) {
  if (req.cookies && typeof req.cookies[name] === 'string') return req.cookies[name]
  const raw = req.headers?.cookie || ''
  const m = raw.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

export function currentUser(req) {
  return parseSession(getCookie(req))
}

export function publicUser(u) {
  if (!u) return null
  return {
    name: u.name,
    email: u.email,
    picture: u.picture || '',
    provider: u.provider || 'demo',
    createdAt: u.createdAt || null,
  }
}

export function decodeJwt(cred) {
  try {
    const part = cred.split('.')[1]
    const json = fromB64url(part).toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

// ---- Google ID-token verification (dependency-free) ------------------------
// Verifies the RS256 signature against Google's published JWKS and checks
// iss/exp (and aud, when GOOGLE_CLIENT_ID is set). This is what prevents a
// forged token from minting a session for an arbitrary email — decodeJwt alone
// does NOT, so never trust its output for authentication.
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com']
let jwksCache = { keys: null, exp: 0 }

async function googleKeys(force = false) {
  if (!force && jwksCache.keys && Date.now() < jwksCache.exp) return jwksCache.keys
  const res = await fetch(GOOGLE_CERTS)
  if (!res.ok) throw new Error('jwks fetch failed')
  const { keys } = await res.json()
  jwksCache = { keys, exp: Date.now() + 60 * 60 * 1000 } // Google rotates ~daily
  return keys
}

export async function verifyGoogleToken(cred) {
  if (typeof cred !== 'string' || cred.split('.').length !== 3) return null
  const [h, p, s] = cred.split('.')
  let header, payload
  try {
    header = JSON.parse(fromB64url(h).toString('utf8'))
    payload = JSON.parse(fromB64url(p).toString('utf8'))
  } catch {
    return null
  }
  if (header.alg !== 'RS256' || !header.kid) return null

  const findKey = (keys) => keys?.find((k) => k.kid === header.kid)
  let jwk
  try {
    jwk = findKey(await googleKeys())
    if (!jwk) jwk = findKey(await googleKeys(true)) // kid rotated — refetch once
  } catch {
    return null
  }
  if (!jwk) return null

  let ok = false
  try {
    const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' })
    ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, fromB64url(s))
  } catch {
    return null
  }
  if (!ok) return null

  if (!GOOGLE_ISS.includes(payload.iss)) return null
  if (!payload.exp || Date.now() >= payload.exp * 1000) return null
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID
  if (clientId && payload.aud !== clientId) return null
  if (!payload.email) return null
  return payload
}

export function googleUser(payload) {
  return {
    email: payload.email,
    name: payload.name || 'Listener',
    picture: payload.picture || '',
    provider: 'google',
    createdAt: Date.now(),
  }
}

