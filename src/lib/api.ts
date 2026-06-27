export interface User {
  name: string
  email: string
  picture: string
  provider: string
  createdAt: number | null
}

export const GOOGLE_CLIENT_ID: string =
  ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string) || ''

async function call<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts?.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `${res.status}`)
  }
  return res.json() as Promise<T>
}

export const getMe = () => call<{ user: User | null }>('/api/me').then((d) => d.user)

export const googleLogin = (credential: string) =>
  call<{ user: User }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  }).then((d) => d.user)

export const logoutApi = () => call<{ ok: true }>('/api/auth/logout', { method: 'POST' })

export const updateName = (name: string) =>
  call<{ user: User }>('/api/profile/name', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then((d) => d.user)
