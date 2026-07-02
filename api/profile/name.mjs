import { currentUser, signSession, sessionCookie, publicUser } from '../../lib/session.mjs'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const u = currentUser(req)
  if (!u) return res.status(401).json({ error: 'not logged in' })
  const name = (typeof req.body?.name === 'string' ? req.body.name : '').trim()
  if (name) u.name = name.slice(0, 60)
  res.setHeader('Set-Cookie', sessionCookie(signSession(u)))
  res.status(200).json({ user: publicUser(u) })
}
