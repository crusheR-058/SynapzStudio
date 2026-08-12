import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/react'
import { setUserIdSource } from '../../core/supabase'
import { supabaseEnabled } from '../lib/supabase'
import type { User } from '../lib/api'

/**
 * Auth for the WEB and DESKTOP builds. Identity is Clerk; the database is still
 * Supabase.
 *
 * The AuthValue contract below is unchanged from the Supabase-Auth version on
 * purpose — App.tsx, listen.tsx, player.tsx and playlists.tsx all consume it and
 * none of them had to change. Only what fills it did.
 *
 * How the two halves meet: Clerk holds the session, and src/lib/supabase.ts
 * builds the Supabase client with an accessToken callback that hands Clerk's
 * session token to every request. Supabase (configured with Clerk as a
 * third-party auth provider) verifies it and exposes the claims to RLS as
 * auth.jwt(). setUserIdSource below is the other half: supabase.auth is
 * unusable in that mode, so core reads the current user id from here instead.
 */

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
}
const desktop = (): DesktopBridge | undefined =>
  (window as unknown as { synapz?: DesktopBridge }).synapz

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser()
  const { userId } = useClerkAuth()
  const clerk = useClerk()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')

  // Hand core the current user id. Registered as a getter rather than a value so
  // it is always read fresh — cloud.ts calls it long after this render.
  useEffect(() => {
    setUserIdSource(() => userId ?? null)
    return () => setUserIdSource(null)
  }, [userId])

  const user: User | null =
    isSignedIn && clerkUser
      ? {
          name:
            clerkUser.fullName ||
            clerkUser.username ||
            clerkUser.primaryEmailAddress?.emailAddress?.split('@')[0] ||
            'Listener',
          email: clerkUser.primaryEmailAddress?.emailAddress || '',
          picture: clerkUser.imageUrl || '',
          // Clerk exposes the provider on the external account, if any.
          provider: clerkUser.externalAccounts?.[0]?.provider || 'clerk',
          createdAt: clerkUser.createdAt ? clerkUser.createdAt.getTime() : null,
        }
      : null

  const loginWithGoogle = useCallback(async () => {
    // Clerk's modal renders in-page, which the Electron window handles fine —
    // unlike Google's own OAuth page, which refuses to load in an embedded
    // browser and is why the old flow had to shell out to the system browser.
    clerk.openSignIn({})
    setAuthOpen(false)
  }, [clerk])

  const logout = useCallback(async () => {
    await clerk.signOut()
  }, [clerk])

  const rename = useCallback(
    async (name: string) => {
      const clean = name.trim().slice(0, 40)
      if (!clean || !clerkUser) return
      // Clerk is the profile of record now, so the new name has to go there or
      // it reverts on the next load.
      await clerkUser.update({ firstName: clean, lastName: '' })
    },
    [clerkUser],
  )

  const openAuth = useCallback(
    (mode: AuthMode = 'login') => {
      setAuthMode(mode)
      if (mode === 'signup') clerk.openSignUp({})
      else clerk.openSignIn({})
    },
    [clerk],
  )

  const closeAuth = useCallback(() => setAuthOpen(false), [])

  const value: AuthValue = {
    user,
    loading: !isLoaded,
    loginWithGoogle,
    logout,
    rename,
    // Sign-in needs Clerk to be configured; cloud sync additionally needs
    // Supabase. Reported together because the UI offers them as one thing.
    googleEnabled: supabaseEnabled && isLoaded,
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

/** Kept for the desktop shell, which still checks whether it is Electron. */
export const isDesktopShell = () => !!desktop()?.isDesktop
