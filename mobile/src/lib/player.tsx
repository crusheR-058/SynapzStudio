// Playback state and queue — the shared half of the two-engine design.
//
// The engines themselves live behind PlaybackEngine so this file never knows
// which one is running. Audius tracks go to the track-player engine (real
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
      next: () => step(1),
      prev: () => step(-1),
      seek,
      setPosition,
      setPlaying,
    }),
    [track, queue, index, isPlaying, positionSec, playTrack, toggle, step, seek],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
