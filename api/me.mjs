import { currentUser, publicUser } from '../lib/session.mjs'

export default function handler(req, res) {
  res.status(200).json({ user: publicUser(currentUser(req)) })
}
