import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase, supabaseEnabled } from '../lib/supabase'
import type { User } from '../lib/api'

type AuthMode = 'login' | 'signup'

interface AuthValue {
  user: User | null
  loading: boolean
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  rename: (name: string) => Promise<void>
  googleEnabled: boolean
  // Auth modal (sign-in / sign-up popup rendered inside the window)
  authOpen: boolean
  authMode: AuthMode
  openAuth: (mode?: AuthMode) => void
  closeAuth: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

// Desktop shell bridge (present only inside the Electron app).
interface DesktopBridge {
  isDesktop?: boolean
  openOAuth?: (url: string) => void
  consumePendingOAuth?: () => Promise<string | null>
  onOAuthCallback?: (cb: (url: string) => void) => () => void
}
const desktop = (): DesktopBridge | undefined =>
  (window as unknown as { synapz?: DesktopBridge }).synapz

// Complete a Supabase session from an OAuth deep-link callback URL. Handles both
// PKCE (?code=) and implicit (#access_token=) returns. Shared by the desktop
// (Electron) and mobile (Capacitor) native flows.
async function completeOAuth(sb: SupabaseClient, callbackUrl: string) {
  try {
    const u = new URL(callbackUrl)
    const code = u.searchParams.get('code')
    if (code) {
      await sb.auth.exchangeCodeForSession(code)
      return
    }
    const frag = new URLSearchParams(u.hash.replace(/^#/, ''))
    const access_token = frag.get('access_token')
    const refresh_token = frag.get('refresh_token')
    if (access_token && refresh_token) {
      await sb.auth.setSession({ access_token, refresh_token })
    }
  } catch (err) {
    console.error('OAuth callback failed', err)
  }
}

// Map a Supabase session into the app's lightweight User shape.
function mapUser(session: Session | null): User | null {
  const u = session?.user
  if (!u) return null
  const m = (u.user_metadata || {}) as Record<string, string>
  return {
    name: m.full_name || m.name || (u.email ? u.email.split('@')[0] : 'Listener'),
    email: u.email || '',
    picture: m.avatar_url || m.picture || '',
    provider: (u.app_metadata?.provider as string) || 'google',
    createdAt: u.created_at ? new Date(u.created_at).getTime() : null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(mapUser(data.session))
      setLoading(false)
    })
    // Fires on sign-in (incl. completing the OAuth redirect), sign-out, refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session))
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Desktop only: complete sign-in when the synapz:// OAuth deep link comes back
  // from the system browser.
  useEffect(() => {
    const sb = supabase
    const bridge = desktop()
    if (!sb || !bridge?.isDesktop) return
    const off = bridge.onOAuthCallback?.((url) => completeOAuth(sb, url))
    // Cold start: pick up a deep link that arrived before this listener mounted.
    bridge.consumePendingOAuth?.().then((u) => {
      if (u) completeOAuth(sb, u)
    })
    return off
  }, [])

  // Mobile (Capacitor) only: sign-in opens the system browser; the synapz://
  // deep link returns here via the App plugin's 'appUrlOpen' event.
  useEffect(() => {
    const sb = supabase
    if (!sb || !Capacitor.isNativePlatform()) return
    let handle: { remove: () => void } | undefined
    App.addListener('appUrlOpen', ({ url }) => {
      if (!url || !url.startsWith('synapz://')) return
      Browser.close().catch(() => {})
      completeOAuth(sb, url)
    }).then((h) => {
      handle = h
    })
    return () => handle?.remove()
  }, [])

  // Auto-close the sign-in popup the moment a session exists.
  useEffect(() => {
    if (user) setAuthOpen(false)
  }, [user])

  const openAuth = useCallback((mode: AuthMode = 'login') => {
    setAuthMode(mode)
    setAuthOpen(true)
  }, [])
  const closeAuth = useCallback(() => setAuthOpen(false), [])

  const loginWithGoogle = useCallback(async () => {
    if (!supabase) return
    if (Capacitor.isNativePlatform()) {
      // Mobile: open Google in the system browser; the synapz:// deep link brings
      // the session back (handled by the appUrlOpen effect above).
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'synapz://auth-callback', skipBrowserRedirect: true },
      })
      if (error) throw error
      if (data?.url) await Browser.open({ url: data.url })
      return
    }
    const bridge = desktop()
    if (bridge?.isDesktop && bridge.openOAuth) {
      // Desktop: don't sign in inside the app window (Google blocks embedded
      // browsers). Get the provider URL, open it in the user's real browser, and
      // let the synapz:// deep link bring the session back (handled in the effect).
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'synapz://auth-callback', skipBrowserRedirect: true },
      })
      if (error) throw error
      if (data?.url) bridge.openOAuth(data.url)
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    // signInWithOAuth resolves with { error } rather than throwing; propagate it
    // so the caller can show feedback instead of the click doing nothing.
    if (error) throw error
    // Browser navigates to Google; on return, onAuthStateChange sets the user.
  }, [])

  const logout = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  const rename = useCallback(
    async (name: string) => {
      if (!supabase || !user) return
      const clean = name.trim().slice(0, 60)
      if (!clean) return
      const { data } = await supabase.auth.getUser()
      const id = data.user?.id
      await supabase.auth.updateUser({ data: { full_name: clean } })
      if (id) await supabase.from('profiles').update({ name: clean }).eq('id', id)
      setUser({ ...user, name: clean })
    },
    [user],
  )

  const value: AuthValue = {
    user,
    loading,
    loginWithGoogle,
    logout,
    rename,
    googleEnabled: supabaseEnabled,
    authOpen,
    authMode,
    openAuth,
    closeAuth,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
