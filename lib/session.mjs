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

export function googleUser(payload) {
  return {
    email: payload.email,
    name: payload.name || 'Listener',
    picture: payload.picture || '',
    provider: 'google',
    createdAt: Date.now(),
  }
}

