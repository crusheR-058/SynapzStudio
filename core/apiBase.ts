// Absolute API base for backend calls.
//
// On the web (Vercel) and the desktop app, calls are same-origin, so the base is
// empty and paths stay relative (`/api/...`, `/yt/...`). Mobile has no backend
// of its own, so it configures apiBase to the hosted Vercel origin and every
// backend call is rewritten to hit it.

import { env } from './config'

/** Read lazily — the platform sets config after this module is initialised. */
export function apiBase(): string {
  return env().apiBase.replace(/\/+$/, '')
}

export function apiUrl(path: string): string {
  const base = apiBase()
  if (!base) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}
