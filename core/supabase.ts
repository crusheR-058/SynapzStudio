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
