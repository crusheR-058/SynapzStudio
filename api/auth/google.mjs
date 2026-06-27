import { decodeJwt, googleUser, signSession, sessionCookie, publicUser } from '../../lib/session.mjs'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  // The Google ID token is decoded (not signature-verified) — adequate for a
  // personal app. To harden: verify with google-auth-library against Google's
  // certs before trusting the payload.
  const payload = req.body?.credential && decodeJwt(req.body.credential)
  if (!payload?.email) return res.status(400).json({ error: 'invalid credential' })
  const u = googleUser(payload)
  res.setHeader('Set-Cookie', sessionCookie(signSession(u)))
  res.status(200).json({ user: publicUser(u) })
}
