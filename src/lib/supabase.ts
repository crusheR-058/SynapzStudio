import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { setSupabase, supabaseEnabled as coreEnabled } from '../../core/supabase'
import { configure } from '../../core/config'
import { setStorage } from '../../core/storage'

/**
 * Supabase client for the WEB and DESKTOP builds — Postgres with Row-Level
 * Security. Identity comes from Clerk, not from Supabase Auth.
 *
 *   VITE_SUPABASE_URL       e.g. https://abcd1234.supabase.co
 *   VITE_SUPABASE_ANON_KEY  the public "anon" key (safe to expose; RLS protects data)
 *
 * The `accessToken` callback is what makes RLS work: every request carries the
 * signed-in Clerk session token, and Supabase — configured with Clerk as a
 * third-party auth provider — verifies it and exposes its claims to policies as
 * auth.jwt(). Policies read ->>'sub' rather than auth.uid().
 *
 * Setting accessToken DISABLES supabase.auth entirely (supabase-js refuses to
 * run both session sources at once). That is why core reads the user id through
 * setUserIdSource instead of auth.getUser(), and why nothing here calls
 * signInWithOAuth any more — Clerk owns sign-in.
 *
 * window.Clerk is read lazily inside the callback rather than captured: the
 * Clerk script attaches it after this module is evaluated, so reading it at
 * module scope would capture undefined forever.
 */
const url = ((import.meta as any).env?.VITE_SUPABASE_URL as string) || ''
const anon = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || ''

interface ClerkGlobal {
  session?: { getToken: () => Promise<string | null> }
}

export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        accessToken: async () => {
          try {
            const clerk = (window as unknown as { Clerk?: ClerkGlobal }).Clerk
            return (await clerk?.session?.getToken()) ?? null
          } catch {
            // Signed out, or Clerk still loading. Null means "anonymous", which
            // RLS answers with an empty result rather than an error.
            return null
          }
        },
      })
    : null

setSupabase(supabase)
configure({
  apiBase: ((import.meta as any).env?.VITE_API_BASE as string) || '',
  webOrigin: ((import.meta as any).env?.VITE_WEB_ORIGIN as string) || '',
  youtubeKey: ((import.meta as any).env?.VITE_YOUTUBE_API_KEY as string) || '',
  // The desktop app bundles the yt-dlp helper; hosted web has the serverless
  // proxy. Both answer /yt/search, so it is available either way.
  hasSearchProxy: true,
})

// Persistent KV for core — this is what keeps the YouTube search cache across
// reloads. Guarded because private mode and storage quotas make it throw.
setStorage({
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* quota or private mode — caching is best-effort */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
})

export const supabaseEnabled = coreEnabled()
