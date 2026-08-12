import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { setSupabase, supabaseEnabled as coreEnabled } from '../../core/supabase'
import { configure } from '../../core/config'

/**
 * Supabase client for the WEB and DESKTOP builds — the app's cloud backend
 * (auth + Postgres with Row-Level Security). Created only when the project is
 * configured via env vars, so the app keeps working (with the local/cookie
 * fallback) until then.
 *
 *   VITE_SUPABASE_URL       e.g. https://abcd1234.supabase.co
 *   VITE_SUPABASE_ANON_KEY  the public "anon" key (safe to expose; RLS protects data)
 *
 * This file is the platform half of the split: core/ never reads env or builds
 * a client, because mobile needs different options (AsyncStorage persistence,
 * detectSessionInUrl: false). Each platform constructs its own and registers it.
 */
const url = ((import.meta as any).env?.VITE_SUPABASE_URL as string) || ''
const anon = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || ''

export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // completes the OAuth redirect on return
        },
      })
    : null

// Hand core its dependencies. Both run at module scope, and every core consumer
// reads them inside a function, so anything imported later sees them set.
setSupabase(supabase)
configure({
  apiBase: ((import.meta as any).env?.VITE_API_BASE as string) || '',
  webOrigin: ((import.meta as any).env?.VITE_WEB_ORIGIN as string) || '',
})

export const supabaseEnabled = coreEnabled()
