// Listen Along — React layer.
//
// Binds the sync engine in ../lib/listen.ts to the live player: as HOST it
// publishes this player's state once a second; as GUEST it lets the engine
// drive playTrack/seek/play/pause.
//
// Everything the engine reads goes through refs rather than the rendered
// values. The engine's callbacks live for the lifetime of a session, so a
// closure over `progress` would hand it a value frozen at join time and it
// would "correct" against a position that never moves.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePlayer } from './player'
import { useAuth } from './auth'
import {
  hostRoom,
  joinRoom,
  roomUrl,
  type GuestControls,
  type HostSession,
  type GuestSession,
  type Room,
  type RoomMember,
} from '../lib/listen'
import { setListenRoom } from '../lib/discord'

interface ListenValue {
  room: Room | null
  members: RoomMember[]
  /** True while a room is being opened or joined. */
  busy: boolean
  error: string | null
  /** Start hosting. Returns the shareable URL, or null if it failed. */
  startHosting: () => Promise<string | null>
  /** Join someone else's room by code. */
  join: (code: string) => Promise<boolean>
  leave: () => Promise<void>
  shareUrl: string | null
}

const ListenContext = createContext<ListenValue | null>(null)

export function ListenProvider({ children }: { children: ReactNode }) {
  const player = usePlayer()
  const { user } = useAuth()

  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hostRef = useRef<HostSession | null>(null)
  const guestRef = useRef<GuestSession | null>(null)

  // Live mirrors of player state for the engine (see file header).
  const trackRef = useRef(player.currentTrack)
  const playingRef = useRef(player.isPlaying)
  const progressRef = useRef(player.progress)
  useEffect(() => void (trackRef.current = player.currentTrack), [player.currentTrack])
  useEffect(() => void (playingRef.current = player.isPlaying), [player.isPlaying])
  useEffect(() => void (progressRef.current = player.progress), [player.progress])

  // Player actions change identity on nearly every render; the engine holds its
  // controls object for the whole session, so it must reach them via a ref too.
  const actionsRef = useRef(player)
  actionsRef.current = player

  const displayName = user?.name || 'Listener'

  const teardown = useCallback(async () => {
    const h = hostRef.current
    const g = guestRef.current
    hostRef.current = null
    guestRef.current = null
    if (h) await h.close()
    if (g) await g.leave()
    setRoom(null)
    setMembers([])
    setListenRoom(null) // drops the Discord "Listen Along" button
  }, [])

  const startHosting = useCallback(async (): Promise<string | null> => {
    if (!user) {
      setError('Sign in to start a Listen Along session.')
      return null
    }
    setBusy(true)
    setError(null)
    await teardown()
    const session = await hostRoom(displayName)
    setBusy(false)
    if (!session) {
      setError('Could not start the session. Check your connection and try again.')
      return null
    }
    hostRef.current = session
    session.onMembers(setMembers)
    setRoom(session.room)
    setListenRoom(session.room.code)
    return roomUrl(session.room.code)
  }, [user, displayName, teardown])

  const join = useCallback(
    async (code: string): Promise<boolean> => {
      if (!user) {
        setError('Sign in to join a Listen Along session.')
        return false
      }
      setBusy(true)
      setError(null)
      await teardown()

      const controls: GuestControls = {
        playTrack: (t) => actionsRef.current.playTrack(t),
        seek: (s) => actionsRef.current.seek(s),
        setPlaying: (want) => {
          if (playingRef.current !== want) actionsRef.current.togglePlay()
        },
        getPosition: () => progressRef.current,
        getTrackId: () => trackRef.current?.id ?? null,
        isPlaying: () => playingRef.current,
      }

      const session = await joinRoom(code, displayName, controls)
      setBusy(false)
      if (!session) {
        setError('That session has ended or the link is invalid.')
        return false
      }
      guestRef.current = session
      session.onMembers(setMembers)
      session.onEnded(() => {
        setError('The host ended the session.')
        void teardown()
      })
      setRoom(session.room)
      return true
    },
    [user, displayName, teardown],
  )

  // Host heartbeat. publish() throttles internally, so a steady 1s call is
  // cheap and keeps guests corrected even when nothing is changing.
  useEffect(() => {
    if (!room?.isHost) return
    const id = window.setInterval(() => {
      hostRef.current?.publish({
        track: trackRef.current,
        positionSec: progressRef.current,
        isPlaying: playingRef.current,
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [room?.isHost])

  // Push immediately on the changes a guest would otherwise wait up to a second
  // to hear: a new track, or play/pause.
  useEffect(() => {
    if (!room?.isHost) return
    hostRef.current?.publish({
      track: player.currentTrack,
      positionSec: progressRef.current,
      isPlaying: player.isPlaying,
    })
  }, [room?.isHost, player.currentTrack, player.isPlaying])

  // Close the room if the app is closed mid-session, so guests aren't left
  // following a host that no longer exists.
  useEffect(() => {
    const bye = () => {
      void hostRef.current?.close()
    }
    window.addEventListener('beforeunload', bye)
    return () => window.removeEventListener('beforeunload', bye)
  }, [])

  const value: ListenValue = {
    room,
    members,
    busy,
    error,
    startHosting,
    join,
    leave: teardown,
    shareUrl: room ? roomUrl(room.code) : null,
  }
  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>
}

export function useListen(): ListenValue {
  const ctx = useContext(ListenContext)
  if (!ctx) throw new Error('useListen must be used within ListenProvider')
  return ctx
}
