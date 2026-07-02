import { clearCookie } from '../../lib/session.mjs'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  res.setHeader('Set-Cookie', clearCookie())
  res.status(200).json({ ok: true })
}
