// Listen Along on mobile, driving the SAME protocol as web and desktop from
// core/listen.ts. Nothing about the wire format is redefined here — that is the
// whole reason core is shared rather than copied, since a field of drift between
// clients desyncs playback silently.
//
// The host publishes its player state on a heartbeat; a guest hands the engine a
// GuestControls object and lets it drive the local player. Refs mirror the
// player state because the engine calls these from timers that would otherwise
// capture a stale render.

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
import {
  hostRoom,
  joinRoom,
  peekRoom,
  roomUrl,
  type GuestSession,
  type HostSession,
  type RoomMember,
  type RoomPreview,
} from '@core/listen'
import type { Track } from '@core/types'
import { useAuth } from './auth'
import { usePlayer } from './player'

type Mode = 'idle' | 'hosting' | 'guest'

interface ListenApi {
  mode: Mode
  code: string | null
  hostName: string | null
  members: RoomMember[]
  shareUrl: string | null
  busy: boolean
  host: () => Promise<void>
  join: (code: string) => Promise<void>
  peek: (code: string) => Promise<RoomPreview | null>
  leave: () => Promise<void>
}

const Ctx = createContext<ListenApi | null>(null)

export function useListenAlong(): ListenApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useListenAlong must be used inside <ListenProvider>')
  return v
}

export function ListenProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const player = usePlayer()
  const [mode, setMode] = useState<Mode>('idle')
  const [code, setCode] = useState<string | null>(null)
  const [hostName, setHostName] = useState<string | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [busy, setBusy] = useState(false)

  const hostRef = useRef<HostSession | null>(null)
  const guestRef = useRef<GuestSession | null>(null)

  // The engine reads these from timers, so they must not be render-captured.
  const state = useRef({ track: null as Track | null, positionSec: 0, isPlaying: false })
  state.current = {
    track: player.track,
    positionSec: player.positionSec,
    isPlaying: player.isPlaying,
  }
  const api = useRef(player)
  api.current = player

  // Host heartbeat: publish once a second. publish() throttles internally, so
  // calling it on every tick is cheap and keeps late joiners close to the host.
  useEffect(() => {
    if (mode !== 'hosting') return
    const id = setInterval(() => {
      hostRef.current?.publish({
        track: state.current.track,
        positionSec: state.current.positionSec,
        isPlaying: state.current.isPlaying,
      })
    }, 1000)
    return () => clearInterval(id)
  }, [mode])

  const reset = useCallback(() => {
    hostRef.current = null
    guestRef.current = null
    setMode('idle')
    setCode(null)
    setHostName(null)
    setMembers([])
  }, [])

  const host = useCallback(async () => {
    if (!user) throw new Error('Sign in to host a room')
    setBusy(true)
    try {
      const session = await hostRoom(user.name)
      if (!session) throw new Error('Could not create the room')
      hostRef.current = session
      session.onMembers(setMembers)
      setMode('hosting')
      setCode(session.room.code)
      setHostName(user.name)
    } finally {
      setBusy(false)
    }
  }, [user])

  const join = useCallback(
    async (roomCode: string) => {
      if (!user) throw new Error('Sign in to join a room')
      setBusy(true)
      try {
        const session = await joinRoom(roomCode.trim().toLowerCase(), user.name, {
          playTrack: (t) => api.current.playTrack(t, [t]),
          seek: (s) => api.current.seek(s),
          setPlaying: (p) => {
            // Only act on a real change — the engine calls this every tick, and
            // toggling an already-correct state would stutter playback.
            if (api.current.isPlaying !== p) api.current.toggle()
          },
          getPosition: () => state.current.positionSec,
          getTrackId: () => state.current.track?.id ?? null,
          isPlaying: () => state.current.isPlaying,
        })
        if (!session) throw new Error('That room could not be found')
        guestRef.current = session
        session.onMembers(setMembers)
        session.onEnded(() => {
          reset()
        })
        setMode('guest')
        setCode(session.room.code)
        setHostName(session.room.hostName)
      } finally {
        setBusy(false)
      }
    },
    [user, reset],
  )

  const leave = useCallback(async () => {
    try {
      await hostRef.current?.close()
      await guestRef.current?.leave()
    } finally {
      reset()
    }
  }, [reset])

  // Tear the room down if the app unmounts, so a host doesn't leave a ghost room
  // behind for guests to sit in.
  useEffect(() => {
    return () => {
      void hostRef.current?.close()
      void guestRef.current?.leave()
    }
  }, [])

  const value = useMemo<ListenApi>(
    () => ({
      mode,
      code,
      hostName,
      members,
      shareUrl: code ? roomUrl(code) : null,
      busy,
      host,
      join,
      peek: (c: string) => peekRoom(c.trim().toLowerCase()),
      leave,
    }),
    [mode, code, hostName, members, busy, host, join, leave],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
