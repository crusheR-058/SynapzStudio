// Liked songs — local first, cloud when signed in.
//
// Local-first matters here: liking works before you ever sign in, and keeps
// working with no connection. AsyncStorage is the source of truth for the UI so
// the heart fills instantly; the cloud call is fire-and-forget behind it.
//
// On sign-in, local likes are pushed up (cloudImportLikes de-duplicates
// server-side) and then the merged set comes back down. Without that push,
// everything liked before signing in would silently vanish the moment the cloud
// list replaced the local one.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Track } from '@core/types'
import { cloudAddLike, cloudFetchLikes, cloudImportLikes, cloudRemoveLike } from '@core/cloud'
import { useAuth } from './auth'

const KEY = 'synapz.likes.v1'

interface LikesApi {
  likes: Track[]
  isLiked: (id: string) => boolean
  toggle: (track: Track) => void
}

const Ctx = createContext<LikesApi | null>(null)

export function useLikes(): LikesApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLikes must be used inside <LikesProvider>')
  return v
}

export function LikesProvider({ children }: { children: ReactNode }) {
  const [likes, setLikes] = useState<Track[]>([])
  const { user } = useAuth()
  const ids = useMemo(() => new Set(likes.map((t) => t.id)), [likes])

  // Guards the first write: without it the initial empty state is persisted
  // over real likes before the load has finished.
  const hydrated = useRef(false)

  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setLikes(JSON.parse(raw) as Track[])
      })
      .catch(() => {})
      .finally(() => {
        hydrated.current = true
      })
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    void AsyncStorage.setItem(KEY, JSON.stringify(likes)).catch(() => {})
  }, [likes])

  // Merge on sign-in: push local up first, then take the server's view.
  const syncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!user || syncedFor.current === user.id || !hydrated.current) return
    syncedFor.current = user.id
    void (async () => {
      try {
        if (likes.length) await cloudImportLikes(likes)
        setLikes(await cloudFetchLikes())
      } catch {
        // Offline or RLS refused — local likes stay intact and this retries on
        // the next sign-in.
      }
    })()
  }, [user, likes])

  const toggle = useCallback(
    (track: Track) => {
      setLikes((cur) => {
        const has = cur.some((t) => t.id === track.id)
        if (has) {
          void cloudRemoveLike(track.id).catch(() => {})
          return cur.filter((t) => t.id !== track.id)
        }
        void cloudAddLike(track).catch(() => {})
        // Newest first, matching what the cloud list returns.
        return [track, ...cur]
      })
    },
    [],
  )

  const value = useMemo<LikesApi>(
    () => ({ likes, isLiked: (id: string) => ids.has(id), toggle }),
    [likes, ids, toggle],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
