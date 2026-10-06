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
import { cloudClaimLegacyAccount } from '../lib/cloud'
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

// Longest a sign-in will wait on the legacy-library claim before carrying on.
const CLAIM_TIMEOUT_MS = 4000
const claimedKey = (id: string) => `synapz:claimed:${id}`

interface AuthValue {
  user: User | null
  loading: boolean
  logout: () => Promise<void>
  rename: (name: string) => Promise<void>
  /** False when this build has no Clerk key — sign-in is simply unavailable. */
  authEnabled: boolean
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

  // Someone who had an account before the move to Clerk arrives with a new id,
  // and their library is still filed under the old one. Re-key it BEFORE the
  // app is told anyone is signed in: the player and the playlists each load
  // the cloud library the moment `user` appears, and would otherwise read an
  // empty one and show it.
  //
  // Asked once per account per device. A failed ask (offline, or the function
  // not installed yet) isn't remembered, so it is retried next launch; either
  // way sign-in carries on after a short wait rather than hanging on it.
  const [settledFor, setSettledFor] = useState<string | null>(null)
  useEffect(() => {
    if (!userId) {
      setSettledFor(null)
      return
    }
    let done = false
    try {
      done = localStorage.getItem(claimedKey(userId)) === '1'
    } catch {
      /* private mode — just ask again */
    }
    if (done) {
      setSettledFor(userId)
      return
    }
    let live = true
    const settle = () => live && setSettledFor(userId)
    const timer = window.setTimeout(settle, CLAIM_TIMEOUT_MS)
    void cloudClaimLegacyAccount().then((answered) => {
      if (answered) {
        try {
          localStorage.setItem(claimedKey(userId), '1')
        } catch {
          /* ignore */
        }
      }
      window.clearTimeout(timer)
      settle()
    })
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [userId])

  const user: User | null =
    isSignedIn && clerkUser && settledFor === userId
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
    logout,
    rename,
    authEnabled: true,
    authOpen,
    authMode,
    openAuth,
    closeAuth,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Stand-in for AuthProvider when the build has no Clerk publishable key.
 *
 * Clerk's hooks throw outside a ClerkProvider, and a ClerkProvider with no key
 * never finishes loading — which used to leave the whole app on its loading
 * screen. Listening needs no account, so a keyless build should still be a
 * working player: everyone is a guest, and asking to sign in opens a note
 * saying it isn't available instead of doing nothing.
 */
export function GuestAuthProvider({ children }: { children: ReactNode }) {
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const value: AuthValue = {
    user: null,
    loading: false,
    logout: async () => {},
    rename: async () => {},
    authEnabled: false,
    authOpen,
    authMode,
    openAuth: (mode: AuthMode = 'login') => {
      setAuthMode(mode)
      setAuthOpen(true)
    },
    closeAuth: () => setAuthOpen(false),
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
