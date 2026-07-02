import { verifyGoogleToken, googleUser, signSession, sessionCookie, publicUser } from '../../lib/session.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  // Verify the Google ID token's signature against Google's certs before trusting
  // it — otherwise anyone could POST a forged payload and mint a session for any email.
  const payload = req.body?.credential ? await verifyGoogleToken(req.body.credential) : null
  if (!payload?.email) return res.status(401).json({ error: 'invalid credential' })
  const u = googleUser(payload)
  res.setHeader('Set-Cookie', sessionCookie(signSession(u)))
  res.status(200).json({ user: publicUser(u) })
}
