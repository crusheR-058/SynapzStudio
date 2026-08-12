// Playback state and queue — the shared half of the two-engine design.
//
// The engines themselves live behind PlaybackEngine so this file never knows
// which one is running. Audius tracks go to the expo-audio engine (real
// background audio, lockscreen transport); YouTube tracks go to the embed
// engine, which can only play in the foreground with its video visible.
//
// Choosing the engine per track, rather than per screen, is what lets one queue
// mix both sources — and it is also the delicate part: the two engines must
// never be playing at once, so switchTo() always stops the outgoing one first.

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
import type { Track } from '@core/types'

export interface PlaybackEngine {
  load(track: Track): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(sec: number): Promise<void>
  stop(): Promise<void>
  /** False for the YouTube embed — the app must say so rather than pretend. */
  readonly backgroundCapable: boolean
}

export interface PlayerState {
  track: Track | null
  queue: Track[]
  index: number
  isPlaying: boolean
  positionSec: number
  /** True while a YouTube track is loaded: the UI must keep the video on screen. */
  needsVideo: boolean
}

interface PlayerApi extends PlayerState {
  playTrack: (track: Track, queue?: Track[]) => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (sec: number) => void
  setPosition: (sec: number) => void
  setPlaying: (v: boolean) => void
  /** Slot a track in directly after the current one without disturbing the rest. */
  playNext: (track: Track) => void
  /** Jump to a queue position — what the queue screen's rows do. */
  jumpTo: (index: number) => void
  /**
   * Engines register themselves as they mount. The embed engine only exists
   * while the player screen is open, so this is called with null on unmount.
   */
  registerEngine: (kind: 'audio' | 'embed', engine: PlaybackEngine | null) => void
}

const Ctx = createContext<PlayerApi | null>(null)

export function usePlayer(): PlayerApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePlayer must be used inside <PlayerProvider>')
  return v
}

/** A track plays through the embed when it is a YouTube id with no stream URL. */
export function isEmbedTrack(t: Track | null): boolean {
  return !!t && t.source === 'youtube' && !t.streamUrl
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<Track | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [index, setIndex] = useState(-1)
  const [isPlaying, setPlaying] = useState(false)
  const [positionSec, setPosition] = useState(0)

  // Engines are registered by their host components (the RNTP service and the
  // embed screen). Held in a ref so swapping one never re-renders the tree.
  const engines = useRef<{ audio?: PlaybackEngine; embed?: PlaybackEngine }>({})
  const activeRef = useRef<PlaybackEngine | null>(null)

  // Mirrors of the latest state for callers that live outside React's render
  // cycle: the lockscreen service, and engines registering mid-flight.
  const trackRef = useRef<Track | null>(null)
  trackRef.current = track
  const playingRef = useRef(false)
  playingRef.current = isPlaying

  const engineFor = useCallback((t: Track): PlaybackEngine | undefined => {
    return isEmbedTrack(t) ? engines.current.embed : engines.current.audio
  }, [])

  const start = useCallback(
    (t: Track) => {
      const nextEngine = engineFor(t)
      const prevEngine = activeRef.current
      // Stop the outgoing engine BEFORE loading the incoming one. Skipping this
      // is how you end up with an Audius track and a YouTube video playing over
      // each other on a source change.
      if (prevEngine && prevEngine !== nextEngine) void prevEngine.stop()
      activeRef.current = nextEngine ?? null
      setPosition(0)
      if (!nextEngine) {
        // Engine not mounted yet (embed screen still opening). The track is set,
        // so the host will pick it up when it registers.
        setPlaying(true)
        return
      }
      void nextEngine.load(t).then(() => nextEngine.play())
      setPlaying(true)
    },
    [engineFor],
  )

  const playTrack = useCallback(
    (t: Track, q?: Track[]) => {
      const list = q && q.length ? q : [t]
      const i = Math.max(0, list.findIndex((x) => x.id === t.id))
      setQueue(list)
      setIndex(i)
      setTrack(t)
      start(t)
    },
    [start],
  )

  const step = useCallback(
    (delta: number) => {
      setIndex((cur) => {
        if (!queue.length) return cur
        const nextIdx = (cur + delta + queue.length) % queue.length
        const t = queue[nextIdx]
        if (t) {
          setTrack(t)
          start(t)
        }
        return nextIdx
      })
    },
    [queue, start],
  )

  const toggle = useCallback(() => {
    const e = activeRef.current
    setPlaying((p) => {
      if (e) void (p ? e.pause() : e.play())
      return !p
    })
  }, [])

  const seek = useCallback((sec: number) => {
    setPosition(sec)
    void activeRef.current?.seek(sec)
  }, [])

  const registerEngine = useCallback(
    (kind: 'audio' | 'embed', engine: PlaybackEngine | null) => {
      if (engine) engines.current[kind] = engine
      else delete engines.current[kind]
      // An engine that mounts after its track was selected has to pick it up —
      // otherwise opening the player screen on a YouTube track leaves it loaded
      // but silent, because start() ran before the embed existed.
      if (engine && trackRef.current && engineFor(trackRef.current) === engine) {
        if (activeRef.current !== engine) activeRef.current = engine
        void engine.load(trackRef.current).then(() => {
          if (playingRef.current) return engine.play()
        })
      }
    },
    [engineFor],
  )

  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => step(-1), [step])

  const playNext = useCallback(
    (t: Track) => {
      setQueue((cur) => {
        if (!cur.length) return [t]
        // Drop any existing copy FIRST, then insert — otherwise queueing a track
        // that is already further down leaves it in twice, and `index` would be
        // measured against the wrong list.
        const without = cur.filter((x) => x.id !== t.id)
        const at = without.findIndex((x) => x.id === trackRef.current?.id)
        const insertAt = at < 0 ? without.length : at + 1
        return [...without.slice(0, insertAt), t, ...without.slice(insertAt)]
      })
    },
    [],
  )

  // Removing a track above the cursor shifts everything down, so `index` has to
  // be re-derived from the current track rather than left pointing at a slot
  // that now holds a different song.
  useEffect(() => {
    if (!track) return
    const at = queue.findIndex((t) => t.id === track.id)
    if (at >= 0 && at !== index) setIndex(at)
  }, [queue, track, index])

  const jumpTo = useCallback(
    (i: number) => {
      const t = queue[i]
      if (!t) return
      setIndex(i)
      setTrack(t)
      start(t)
    },
    [queue, start],
  )


  const value = useMemo<PlayerApi>(
    () => ({
      track,
      queue,
      index,
      isPlaying,
      positionSec,
      needsVideo: isEmbedTrack(track),
      playTrack,
      toggle,
      next,
      prev,
      seek,
      setPosition,
      setPlaying,
      playNext,
      jumpTo,
      registerEngine,
    }),
    [
      track, queue, index, isPlaying, positionSec,
      playTrack, toggle, next, prev, seek, playNext, jumpTo, registerEngine,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
