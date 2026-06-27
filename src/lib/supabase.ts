import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client — the app's cloud backend (auth + Postgres with Row-Level
 * Security). Created only when the project is configured via env vars, so the
 * app keeps working (with the local/cookie fallback) until then.
 *
 *   VITE_SUPABASE_URL       e.g. https://abcd1234.supabase.co
 *   VITE_SUPABASE_ANON_KEY  the public "anon" key (safe to expose; RLS protects data)
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

export const supabaseEnabled = !!supabase
