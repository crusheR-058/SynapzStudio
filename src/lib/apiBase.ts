// Absolute API base for backend calls.
//
// On the web (Vercel) and the desktop app, calls are same-origin, so the base is
// empty and paths stay relative (`/api/...`, `/yt/...`) — which is every build we
// ship. VITE_API_BASE stays as an escape hatch for a build served from an origin
// that has no backend of its own: set it to the hosted Vercel URL and every
// backend call is rewritten to hit it.

export const API_BASE = ((import.meta as any).env?.VITE_API_BASE as string | undefined)
  ? String((import.meta as any).env.VITE_API_BASE).replace(/\/+$/, '')
  : ''

export function apiUrl(path: string): string {
  if (!API_BASE) return path
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}
