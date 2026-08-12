// Auth for the mobile app — Google OAuth through the system browser.
//
// The redirect is `synapz://auth-callback`, the SAME string the desktop app
// registered in Supabase's allow-list, so this flow needs zero dashboard
// changes. The system browser (Custom Tabs / ASWebAuthenticationSession via
// expo-web-browser) is required rather than a WebView: Google blocks sign-in
// from embedded browsers outright.
//
// Flow: signInWithOAuth(skipBrowserRedirect) hands back Google's URL → the auth
// browser opens it → Google redirects to synapz://auth-callback?code=… → the
// browser closes and hands us that URL → exchangeCodeForSession turns the code
// into a session, verified against the PKCE code_verifier already sitting in
// AsyncStorage. Both the ?code= and legacy #access_token forms are handled,
// mirroring the web app's completeOAuth.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as WebBrowser from 'expo-web-browser'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

WebBrowser.maybeCompleteAuthSession()

const REDIRECT = 'synapz://auth-callback'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar: string
}

interface AuthApi {
  user: AuthUser | null
  /** True until the persisted session has been read — gate UI on it once. */
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}

function mapUser(session: Session | null): AuthUser | null {
  const u = session?.user
  if (!u) return null
  const meta = (u.user_metadata ?? {}) as Record<string, string>
  return {
    id: u.id,
    email: u.email ?? '',
    name: meta.full_name || meta.name || (u.email ? u.email.split('@')[0] : 'You'),
    avatar: meta.avatar_url || meta.picture || '',
  }
}

async function completeFromUrl(url: string): Promise<void> {
  if (!supabase) return
  const u = new URL(url)
  const code = u.searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    return
  }
  const frag = new URLSearchParams(u.hash.replace(/^#/, ''))
  const access_token = frag.get('access_token')
  const refresh_token = frag.get('refresh_token')
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) throw error
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(!!supabase)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setUser(mapUser(data.session))
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(mapUser(session))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async () => {
    if (!supabase) throw new Error('Cloud sync is not configured in this build')
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    })
    if (error) throw error
    if (!data?.url) throw new Error('No sign-in URL returned')

    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT)
    // 'cancel'/'dismiss' is the user backing out — not an error, say nothing.
    if (result.type === 'success' && result.url) {
      await completeFromUrl(result.url)
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  const value = useMemo<AuthApi>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
