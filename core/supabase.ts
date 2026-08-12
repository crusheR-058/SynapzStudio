// Supabase client holder for the shared core.
//
// Core can't construct the client itself: web and mobile need different options
// (mobile persists the session in AsyncStorage and must set
// detectSessionInUrl: false, since there is no URL to read a token back from).
// So each platform builds its own client and registers it here, and core reads
// it through sb() inside functions — never at module scope, so import order
// can't leave a null behind.

import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Called once by the platform entry (src/lib/supabase.ts, mobile/lib/supabase.ts). */
export function setSupabase(c: SupabaseClient | null): void {
  client = c
}

/** The registered client, or null when the project isn't configured. */
export function sb(): SupabaseClient | null {
  return client
}

export function supabaseEnabled(): boolean {
  return !!client
}

// ------------------------------------------------------------ identity ---

/**
 * Who is signed in.
 *
 * Supabase's own `auth.getUser()` cannot answer this once the client is built
 * with an `accessToken` callback — supabase-js disables the entire auth
 * namespace in that mode, which is exactly the mode third-party auth (Clerk)
 * requires. So the id is injected, the same way the client itself is.
 *
 * Platforms that still use Supabase Auth register nothing and fall through to
 * getUser(), which is what lets the web app move to Clerk while mobile keeps
 * signing in through Supabase.
 */
let userIdSource: (() => string | null) | null = null

export function setUserIdSource(fn: (() => string | null) | null): void {
  userIdSource = fn
}

export async function currentUserId(): Promise<string | null> {
  if (userIdSource) return userIdSource()
  const c = client
  if (!c) return null
  try {
    const { data } = await c.auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}
