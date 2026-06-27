import { clearCookie } from '../../lib/session.mjs'

export default function handler(_req, res) {
  res.setHeader('Set-Cookie', clearCookie())
  res.status(200).json({ ok: true })
}
