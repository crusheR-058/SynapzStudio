// Absolute API base for backend calls.
//
// On the web (Vercel) and the desktop app, calls are same-origin, so the base is
// empty and paths stay relative (`/api/...`, `/yt/...`). The mobile app (Capacitor)
// runs from a local origin (capacitor://localhost), where relative calls have no
// server — so mobile builds set VITE_API_BASE to the hosted Vercel URL and every
// backend call is rewritten to hit it.

export const API_BASE = ((import.meta as any).env?.VITE_API_BASE as string | undefined)
  ? String((import.meta as any).env.VITE_API_BASE).replace(/\/+$/, '')
  : ''

export function apiUrl(path: string): string {
  if (!API_BASE) return path
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}
