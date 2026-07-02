import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Track } from '../lib/types'
import { useAuth } from './auth'
import {
  cloudAddToPlaylist,
  cloudCreatePlaylist,
  cloudDeletePlaylist,
  cloudFetchPlaylistTracks,
  cloudFetchPlaylists,
  cloudRemoveFromPlaylist,
  cloudRenamePlaylist,
  cloudSetPlaylistShare,
} from '../lib/cloud'

/**
 * User-created playlists. Works for everyone:
 *  - signed out  → persisted to localStorage (per-browser)
 *  - signed in   → synced to Supabase (cross-device); local playlists made
 *    while signed out are imported once on first sign-in.
 *
 * Every cloud call is best-effort (guarded inside src/lib/cloud.ts); local
 * state is always updated optimistically so the UI never blocks on the network.
 */

export interface UserPlaylist {
  id: string
  name: string
  description: string | null
  updatedAt: number
  tracks: Track[]
  isPublic: boolean
  isCollaborative: boolean
}

interface PlaylistsValue {
  playlists: UserPlaylist[]
  getPlaylist: (id: string) => UserPlaylist | undefined
  createPlaylist: (name: string, firstTrack?: Track) => Promise<string>
  deletePlaylist: (id: string) => void
  renamePlaylist: (id: string, name: string) => void
  addToPlaylist: (id: string, track: Track) => void
  removeFromPlaylist: (id: string, trackId: string) => void
  inPlaylist: (id: string, trackId: string) => boolean
  setShare: (id: string, patch: { isPublic?: boolean; isCollaborative?: boolean }) => void
}

const LS_KEY = 'synapz:playlists'

function loadLocal(): UserPlaylist[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const arr = raw ? (JSON.parse(raw) as UserPlaylist[]) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveLocal(list: UserPlaylist[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    /* ignore quota / private-mode */
  }
}

function localId(): string {
  return `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

const PlaylistsContext = createContext<PlaylistsValue | null>(null)

export function PlaylistsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [playlists, setPlaylists] = useState<UserPlaylist[]>(() => loadLocal())
  const importedFor = useRef<string | null>(null)
  const prevEmail = useRef<string | null>(null)
  const playlistsRef = useRef(playlists)
  useEffect(() => void (playlistsRef.current = playlists), [playlists])

  // Replace state + persist the local cache in one shot.
  const update = useCallback((fn: (prev: UserPlaylist[]) => UserPlaylist[]) => {
    setPlaylists((prev) => {
      const next = fn(prev)
      saveLocal(next)
      return next
    })
  }, [])

  // Load the right source whenever the signed-in identity changes.
  useEffect(() => {
    let cancelled = false
    const email = user?.email ?? null
    const justSignedOut = !email && !!prevEmail.current
    prevEmail.current = email
    if (!email) {
      importedFor.current = null
      if (justSignedOut) {
        // Drop the previous account's synced playlists so they aren't re-imported
        // into whoever signs in next on this browser.
        setPlaylists([])
        saveLocal([])
      } else {
        setPlaylists(loadLocal())
      }
      return
    }
    ;(async () => {
      let list = await cloudFetchPlaylists()
      // One-time import: push playlists made while signed out up to the cloud.
      if (importedFor.current !== email) {
        importedFor.current = email
        const local = loadLocal()
        if (!list.length && local.length) {
          for (const pl of local) {
            const created = await cloudCreatePlaylist(pl.name)
            if (created) for (const t of pl.tracks) await cloudAddToPlaylist(created.id, t)
          }
          list = await cloudFetchPlaylists()
        }
      }
      const full: UserPlaylist[] = []
      for (const p of list) {
        const tracks = await cloudFetchPlaylistTracks(p.id)
        full.push({
          id: p.id,
          name: p.name,
          description: p.description,
          updatedAt: Date.parse(p.updated_at) || Date.now(),
          tracks,
          isPublic: !!p.is_public,
          isCollaborative: !!p.is_collaborative,
        })
      }
      if (cancelled) return
      setPlaylists(full)
      saveLocal(full)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  const createPlaylist = useCallback(
    async (name: string, firstTrack?: Track): Promise<string> => {
      const clean = name.trim().slice(0, 80) || 'New playlist'
      let id = localId()
      if (user) {
        const created = await cloudCreatePlaylist(clean)
        if (created) {
          id = created.id
          if (firstTrack) cloudAddToPlaylist(id, firstTrack)
        }
      }
      const pl: UserPlaylist = {
        id,
        name: clean,
        description: null,
        updatedAt: Date.now(),
        tracks: firstTrack ? [firstTrack] : [],
        isPublic: false,
        isCollaborative: false,
      }
      update((prev) => [pl, ...prev])
      return id
    },
    [user, update],
  )

  const deletePlaylist = useCallback(
    (id: string) => {
      if (user) cloudDeletePlaylist(id)
      update((prev) => prev.filter((p) => p.id !== id))
    },
    [user, update],
  )

  const renamePlaylist = useCallback(
    (id: string, name: string) => {
      const clean = name.trim().slice(0, 80)
      if (!clean) return
      if (user) cloudRenamePlaylist(id, clean)
      update((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: clean, updatedAt: Date.now() } : p)),
      )
    },
    [user, update],
  )

  const addToPlaylist = useCallback(
    (id: string, track: Track) => {
      // Skip if the track is already in the playlist — otherwise the (un-awaited)
      // cloud insert would write a duplicate row that the local dedupe hides,
      // surfacing as a duplicate after the next reload/sign-in.
      const pl = playlistsRef.current.find((p) => p.id === id)
      if (pl && pl.tracks.some((t) => t.id === track.id)) return
      if (user) cloudAddToPlaylist(id, track)
      update((prev) =>
        prev.map((p) =>
          p.id === id && !p.tracks.some((t) => t.id === track.id)
            ? { ...p, tracks: [...p.tracks, track], updatedAt: Date.now() }
            : p,
        ),
      )
    },
    [user, update],
  )

  const removeFromPlaylist = useCallback(
    (id: string, trackId: string) => {
      if (user) cloudRemoveFromPlaylist(id, trackId)
      update((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId), updatedAt: Date.now() }
            : p,
        ),
      )
    },
    [user, update],
  )

  const setShare = useCallback(
    (id: string, patch: { isPublic?: boolean; isCollaborative?: boolean }) => {
      if (user) {
        cloudSetPlaylistShare(id, {
          ...(patch.isPublic !== undefined ? { is_public: patch.isPublic } : {}),
          ...(patch.isCollaborative !== undefined ? { is_collaborative: patch.isCollaborative } : {}),
        })
      }
      update((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                isPublic: patch.isPublic ?? p.isPublic,
                isCollaborative: patch.isCollaborative ?? p.isCollaborative,
              }
            : p,
        ),
      )
    },
    [user, update],
  )

  const getPlaylist = useCallback(
    (id: string) => playlists.find((p) => p.id === id),
    [playlists],
  )

  const inPlaylist = useCallback(
    (id: string, trackId: string) =>
      playlists.find((p) => p.id === id)?.tracks.some((t) => t.id === trackId) ?? false,
    [playlists],
  )

  const value: PlaylistsValue = {
    playlists,
    getPlaylist,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    inPlaylist,
    setShare,
  }
  return <PlaylistsContext.Provider value={value}>{children}</PlaylistsContext.Provider>
}

export function usePlaylists(): PlaylistsValue {
  const ctx = useContext(PlaylistsContext)
  if (!ctx) throw new Error('usePlaylists must be used within PlaylistsProvider')
  return ctx
}
