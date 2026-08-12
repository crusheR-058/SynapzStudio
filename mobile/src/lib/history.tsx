// Listening history: what "Recently played" on Home reads from.
//
// Local-first like likes, so it works signed out and offline, with the cloud
// call behind it. A play is recorded once the track has actually been playing
// for a few seconds — recording on load would fill the list with songs skipped
// after half a second, which is exactly the noise that makes a history section
// useless.

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
import { cloudFetchHistory, cloudRecordPlay } from '@core/cloud'
import { useAuth } from './auth'
import { usePlayer } from './player'

const KEY = 'synapz.history.v1'
const MAX = 60
/** How long a track must play before it counts as listened to. */
const COMMIT_SEC = 8

interface HistoryApi {
  history: Track[]
}

const Ctx = createContext<HistoryApi>({ history: [] })

export function useHistory(): HistoryApi {
  return useContext(Ctx)
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<Track[]>([])
  const { user } = useAuth()
  const { track, isPlaying, positionSec } = usePlayer()

  const hydrated = useRef(false)

  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setHistory(JSON.parse(raw) as Track[])
      })
      .catch(() => {})
      .finally(() => {
        hydrated.current = true
      })
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    void AsyncStorage.setItem(KEY, JSON.stringify(history)).catch(() => {})
  }, [history])

  // Prefer the cloud's view once signed in — it carries plays from desktop too.
  const syncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!user || syncedFor.current === user.id) return
    syncedFor.current = user.id
    void cloudFetchHistory(MAX)
      .then((rows) => {
        if (rows.length) setHistory(rows)
      })
      .catch(() => {})
  }, [user])

  // One commit per visit to a track. Keyed by id rather than a boolean so
  // replaying the same song later records again, but a pause-and-resume does
  // not.
  const committed = useRef<string | null>(null)
  useEffect(() => {
    if (!track) {
      committed.current = null
      return
    }
    if (committed.current === track.id) return
    if (!isPlaying || positionSec < COMMIT_SEC) return

    committed.current = track.id
    setHistory((cur) => [track, ...cur.filter((t) => t.id !== track.id)].slice(0, MAX))
    void cloudRecordPlay(track).catch(() => {})
  }, [track, isPlaying, positionSec])

  const value = useMemo<HistoryApi>(() => ({ history }), [history])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
