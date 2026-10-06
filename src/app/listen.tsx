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
//
// The room's social side — chat, reactions, song requests — lives here too. It
// rides the same channel as the sync ticks (see core/listen.ts) and is entirely
// in memory: it lasts as long as the session and no longer.

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
  type ChatMessage,
  type Reaction,
  type Room,
  type RoomEventName,
  type RoomEvents,
  type RoomMember,
  type SongRequest,
} from '../lib/listen'
import { setListenRoom } from '../lib/discord'
import type { Track } from '../lib/types'

/** The reactions a room offers. Incoming ones outside this set are dropped. */
export const REACTIONS = ['🔥', '❤️', '😂', '👏', '🎉', '😮']

const MAX_CHAT = 200
const MAX_REQUESTS = 30
const MAX_TEXT = 300

export type LiveReaction = Reaction & { key: number }

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/**
 * A track that arrived from another member, reduced to what is safe to play.
 *
 * Whatever a guest sends ends up in the host's player, so the payload is not
 * trusted: a YouTube track is rebuilt around its id alone (no stream URL — it
 * plays through the IFrame), and an Audius track must point at an https stream.
 * Anything else, including a local-file URL, is refused.
 */
function cleanTrack(raw: unknown): Track | null {
  const t = raw as Partial<Track> | null
  if (!t || typeof t.id !== 'string' || typeof t.title !== 'string') return null
  const base = {
    id: t.id,
    title: t.title.slice(0, 200),
    artist: String(t.artist || '').slice(0, 120),
    artistHandle: '',
    duration: Number(t.duration) || 0,
  }
  const img = (u: unknown) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : '')
  if (t.source === 'youtube') {
    if (!/^[\w-]{6,20}$/.test(t.id)) return null
    return {
      ...base,
      source: 'youtube',
      artwork: `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`,
      artworkLarge: `https://i.ytimg.com/vi/${t.id}/maxresdefault.jpg`,
      streamUrl: '',
    }
  }
  if (t.source === 'audius' && typeof t.streamUrl === 'string' && /^https:\/\//.test(t.streamUrl)) {
    return {
      ...base,
      source: 'audius',
      artwork: img(t.artwork),
      artworkLarge: img(t.artworkLarge) || img(t.artwork),
      streamUrl: t.streamUrl,
    }
  }
  return null
}

const byVotes = (list: SongRequest[]) => list.slice().sort((a, b) => b.votes.length - a.votes.length)

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

  // --- chat, reactions, requests ---
  messages: ChatMessage[]
  /** Messages that arrived while the room panel was closed. */
  unread: number
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  sendChat: (text: string) => void
  reactions: LiveReaction[]
  sendReaction: (emoji: string) => void
  /** Sorted most-voted first. The host's copy is the source of truth. */
  requests: SongRequest[]
  myId: string | null
  requestSong: (track: Track) => void
  voteRequest: (id: string) => void
  /** Host only: put the song in the queue and clear the request. */
  acceptRequest: (id: string) => void
  /** Host only. */
  dismissRequest: (id: string) => void
}

const ListenContext = createContext<ListenValue | null>(null)

// A local file can't be played by anyone else, so it is broadcast as "nothing"
// rather than as a track every guest would fail to load.
const shareable = (t: Track | null) => (t?.source === 'local' ? null : t)

export function ListenProvider({ children }: { children: ReactNode }) {
  const player = usePlayer()
  const { user } = useAuth()

  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hostRef = useRef<HostSession | null>(null)
  const guestRef = useRef<GuestSession | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unread, setUnread] = useState(0)
  const [panelOpen, setPanelOpenState] = useState(false)
  const [reactions, setReactions] = useState<LiveReaction[]>([])
  const [requests, setRequests] = useState<SongRequest[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const panelOpenRef = useRef(false)
  // The host's request list, readable from the session-lifetime event handler.
  const requestsRef = useRef<SongRequest[]>([])
  const reactionKey = useRef(0)

  const events = (): RoomEvents | null => hostRef.current ?? guestRef.current

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
    setMessages([])
    setUnread(0)
    setReactions([])
    setRequests([])
    requestsRef.current = []
    setMyId(null)
    setPanelOpenState(false)
    panelOpenRef.current = false
  }, [])

  const showReaction = useCallback((r: Reaction) => {
    const key = ++reactionKey.current
    setReactions((list) => [...list.slice(-11), { ...r, key }])
    window.setTimeout(() => setReactions((list) => list.filter((x) => x.key !== key)), 2600)
  }, [])

  const addMessage = useCallback((m: ChatMessage, mine: boolean) => {
    setMessages((list) => [...list, m].slice(-MAX_CHAT))
    if (!mine && !panelOpenRef.current) setUnread((n) => n + 1)
  }, [])

  // Host: replace the request list and tell the room. Guests never call this.
  const commitRequests = useCallback((next: SongRequest[]) => {
    const sorted = byVotes(next).slice(0, MAX_REQUESTS)
    requestsRef.current = sorted
    setRequests(sorted)
    hostRef.current?.send('requests', { list: sorted })
  }, [])

  // One handler per session, attached when the session is created. It is the
  // only place remote input enters, so every field is checked and clamped here.
  const bindEvents = useCallback(
    (session: RoomEvents, isHost: boolean) => {
      setMyId(session.userId)
      session.onEvent((event: RoomEventName, payload: unknown) => {
        const p = (payload ?? {}) as Record<string, unknown>
        const from = String(p.userId || '')
        const name = String(p.name || 'Listener').slice(0, 40)

        if (event === 'chat') {
          const text = String(p.text || '').trim().slice(0, MAX_TEXT)
          if (!text || !from) return
          addMessage(
            { id: String(p.id || newId()), userId: from, name, text, at: Number(p.at) || Date.now() },
            false,
          )
        } else if (event === 'react') {
          const emoji = String(p.emoji || '')
          if (REACTIONS.includes(emoji)) showReaction({ userId: from, name, emoji })
        } else if (event === 'requests') {
          // Only a guest takes the list from the wire; the host owns it.
          if (isHost || !Array.isArray(p.list)) return
          const list: SongRequest[] = []
          for (const r of p.list as Record<string, unknown>[]) {
            const track = cleanTrack(r?.track)
            if (!track) continue
            list.push({
              id: String(r.id || ''),
              track,
              userId: String(r.userId || ''),
              name: String(r.name || 'Listener').slice(0, 40),
              votes: Array.isArray(r.votes) ? (r.votes as unknown[]).map(String) : [],
            })
          }
          setRequests(list.slice(0, MAX_REQUESTS))
        } else if (event === 'request') {
          if (!isHost || !from) return
          const track = cleanTrack(p.track)
          if (!track) return
          const cur = requestsRef.current
          const dupe = cur.find((r) => r.track.id === track.id)
          if (dupe) {
            // Asking for a song already on the list counts as a vote for it.
            if (dupe.votes.includes(from)) return
            commitRequests(cur.map((r) => (r === dupe ? { ...r, votes: [...r.votes, from] } : r)))
          } else if (cur.length < MAX_REQUESTS) {
            commitRequests([...cur, { id: newId(), track, userId: from, name, votes: [from] }])
          }
        } else if (event === 'vote') {
          if (!isHost || !from) return
          const id = String(p.requestId || '')
          commitRequests(
            requestsRef.current.map((r) =>
              r.id !== id
                ? r
                : {
                    ...r,
                    votes: r.votes.includes(from)
                      ? r.votes.filter((v) => v !== from)
                      : [...r.votes, from],
                  },
            ),
          )
        }
      })
    },
    [addMessage, commitRequests, showReaction],
  )

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
    bindEvents(session, true)
    session.onMembers(setMembers)
    setRoom(session.room)
    setListenRoom(session.room.code)
    return roomUrl(session.room.code)
  }, [user, displayName, teardown, bindEvents])

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
      bindEvents(session, false)
      session.onMembers(setMembers)
      session.onEnded(() => {
        setError('The host ended the session.')
        void teardown()
      })
      setRoom(session.room)
      return true
    },
    [user, displayName, teardown, bindEvents],
  )

  // Host heartbeat. publish() throttles internally, so a steady 1s call is
  // cheap and keeps guests corrected even when nothing is changing.
  useEffect(() => {
    if (!room?.isHost) return
    const id = window.setInterval(() => {
      hostRef.current?.publish({
        track: shareable(trackRef.current),
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
      track: shareable(player.currentTrack),
      positionSec: progressRef.current,
      isPlaying: player.isPlaying,
    })
  }, [room?.isHost, player.currentTrack, player.isPlaying])

  // A guest who joins late has missed every `requests` broadcast so far. The
  // member list changing is the host's cue to send the current list again.
  useEffect(() => {
    if (!room?.isHost || !requestsRef.current.length) return
    hostRef.current?.send('requests', { list: requestsRef.current })
  }, [room?.isHost, members.length])

  const setPanelOpen = useCallback((open: boolean) => {
    panelOpenRef.current = open
    setPanelOpenState(open)
    if (open) setUnread(0)
  }, [])

  const sendChat = useCallback(
    (raw: string) => {
      const session = events()
      const text = raw.trim().slice(0, MAX_TEXT)
      if (!session || !text) return
      const msg: ChatMessage = {
        id: newId(),
        userId: session.userId,
        name: displayName,
        text,
        at: Date.now(),
      }
      session.send('chat', msg)
      addMessage(msg, true) // broadcasts don't echo back to the sender
    },
    [displayName, addMessage],
  )

  const sendReaction = useCallback(
    (emoji: string) => {
      const session = events()
      if (!session || !REACTIONS.includes(emoji)) return
      const r: Reaction = { userId: session.userId, name: displayName, emoji }
      session.send('react', r)
      showReaction(r)
    },
    [displayName, showReaction],
  )

  const requestSong = useCallback(
    (track: Track) => {
      const session = events()
      if (!session) return
      if (hostRef.current) {
        // The host asking is just the host queueing — no vote needed.
        actionsRef.current.addToQueue(track)
        return
      }
      session.send('request', { track, userId: session.userId, name: displayName })
    },
    [displayName],
  )

  const voteRequest = useCallback((id: string) => {
    const session = events()
    if (!session || hostRef.current) return
    session.send('vote', { requestId: id, userId: session.userId })
    // Reflect it at once; the host's next list confirms or corrects it.
    setRequests((list) =>
      byVotes(
        list.map((r) =>
          r.id !== id
            ? r
            : {
                ...r,
                votes: r.votes.includes(session.userId)
                  ? r.votes.filter((v) => v !== session.userId)
                  : [...r.votes, session.userId],
              },
        ),
      ),
    )
  }, [])

  const acceptRequest = useCallback(
    (id: string) => {
      if (!hostRef.current) return
      const req = requestsRef.current.find((r) => r.id === id)
      if (!req) return
      actionsRef.current.addToQueue(req.track)
      commitRequests(requestsRef.current.filter((r) => r.id !== id))
    },
    [commitRequests],
  )

  const dismissRequest = useCallback(
    (id: string) => {
      if (!hostRef.current) return
      commitRequests(requestsRef.current.filter((r) => r.id !== id))
    },
    [commitRequests],
  )

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
    messages,
    unread,
    panelOpen,
    setPanelOpen,
    sendChat,
    reactions,
    sendReaction,
    requests,
    myId,
    requestSong,
    voteRequest,
    acceptRequest,
    dismissRequest,
  }
  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>
}

export function useListen(): ListenValue {
  const ctx = useContext(ListenContext)
  if (!ctx) throw new Error('useListen must be used within ListenProvider')
  return ctx
}
