import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
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
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
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
