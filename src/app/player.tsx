import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Repeat, Track } from '../lib/types'
import { useAuth } from './auth'
import {
  cloudAddLike,
  cloudFetchLikes,
  cloudImportLikes,
  cloudRecordPlay,
  cloudRemoveLike,
} from '../lib/cloud'
import { fetchTrending } from '../lib/audius'
import { BOLLYWOOD_TRACKS } from '../lib/bollywood'
import { pushPresence, clearPresence } from '../lib/discord'
import { onMediaControl, pushNowPlaying } from '../lib/taskbar'

// Fisher–Yates; used to seed autoplay radio from the baked catalog.
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady?: () => void
    webkitAudioContext?: typeof AudioContext
  }
}

// A track uses the YouTube IFrame player only when it's a YouTube track WITHOUT
// a direct stream URL (i.e. the Data-API path). yt-dlp YouTube tracks carry a
// /yt/stream URL and play through the normal <audio> element instead.
function isIframeTrack(t: Track | null): boolean {
  return !!t && t.source === 'youtube' && !t.streamUrl
}
// Crossfade only works for tracks that play through an <audio> element — i.e.
// NOT the YouTube IFrame. This is the gate for that feature.
function isAudioElTrack(t: Track | null): boolean {
  return !!t && !isIframeTrack(t) && !!t.streamUrl
}

interface RawStats {
  listenedSec: number
  plays: Record<string, number>
  daily: Record<string, number>
  tracks: Record<string, Track>
}

export interface PlayerStats {
  listenedSec: number
  totalPlays: number
  uniqueTracks: number
  topSongs: { track: Track; count: number }[]
  topArtists: { artist: string; count: number }[]
  week: { label: string; sec: number }[]
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export interface SleepState {
  endsAt: number | null // wall-clock ms for a timed sleep
  endOfTrack: boolean // stop when the current track ends
}

interface PlayerState {
  currentTrack: Track | null
  queue: Track[]
  index: number
  userQueue: Track[]
  isPlaying: boolean
  isBuffering: boolean
  progress: number // seconds
  duration: number // seconds
  volume: number // 0-100
  muted: boolean
  shuffle: boolean
  repeat: Repeat
  liked: Track[]
  recent: Track[]
  recentAt: Record<string, number>
  error: string | null
  // premium-style playback extras
  rate: number // playback speed
  crossfade: number // seconds, 0 = off
  sleep: SleepState
  canTuneAudio: boolean // current track supports crossfade (audio element)
  autoplay: boolean // keep playing similar songs when the queue ends
}

interface PlayerActions {
  playTrack: (track: Track, context?: Track[]) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  toggleLike: (track: Track) => void
  isLiked: (id: string) => boolean
  playContext: (tracks: Track[], startId?: string) => void
  appendToContext: (tracks: Track[]) => void
  getStats: () => PlayerStats
  // queue management
  addToQueue: (track: Track) => void
  removeFromQueue: (i: number) => void
  moveInQueue: (from: number, to: number) => void
  clearQueue: () => void
  playUpNext: (kind: 'user' | 'context', i: number) => void
  // playback extras
  setRate: (r: number) => void
  setCrossfade: (s: number) => void
  setSleepMinutes: (min: number) => void
  setSleepEndOfTrack: () => void
  clearSleep: () => void
  setAutoplay: (on: boolean) => void
}

type PlayerContextValue = PlayerState & PlayerActions

const PlayerContext = createContext<PlayerContextValue | null>(null)

const LS = {
  liked: 'synapz:liked',
  recent: 'synapz:recent',
  recentAt: 'synapz:recentAt',
  volume: 'synapz:volume',
  stats: 'synapz:stats',
  rate: 'synapz:rate',
  crossfade: 'synapz:crossfade',
  autoplay: 'synapz:autoplay',
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  // Two <audio> "decks" so we can crossfade one track into the next. With
  // crossfade off, only deck 0 is ever used — identical to a single element.
  const [decks] = useState<HTMLAudioElement[]>(() => {
    const mk = () => {
      const a = new Audio()
      a.preload = 'auto'
      return a
    }
    return [mk(), mk()]
  })
  const activeRef = useRef(0)
  const active = useCallback(() => decks[activeRef.current], [decks])
  const idle = useCallback(() => decks[activeRef.current ^ 1], [decks])

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [index, setIndex] = useState(0)
  const [userQueue, setUserQueue] = useState<Track[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState<number>(() => load(LS.volume, 80))
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<Repeat>('off')
  const [liked, setLiked] = useState<Track[]>(() => load(LS.liked, []))
  const [recent, setRecent] = useState<Track[]>(() => load(LS.recent, []))
  const [recentAt, setRecentAt] = useState<Record<string, number>>(() => load(LS.recentAt, {}))
  const [error, setError] = useState<string | null>(null)

  const [rate, setRateState] = useState<number>(() => load(LS.rate, 1))
  const [crossfade, setCrossfadeState] = useState<number>(() => load(LS.crossfade, 0))
  const [sleep, setSleep] = useState<SleepState>({ endsAt: null, endOfTrack: false })
  const [autoplay, setAutoplayState] = useState<boolean>(() => load(LS.autoplay, true))

  const statsRef = useRef<RawStats>(
    load(LS.stats, { listenedSec: 0, plays: {}, daily: {}, tracks: {} }),
  )

  // Refs mirror state for use inside stable event handlers.
  const queueRef = useRef(queue)
  const indexRef = useRef(index)
  const userQueueRef = useRef(userQueue)
  const shuffleRef = useRef(shuffle)
  const repeatRef = useRef(repeat)
  const progressRef = useRef(0)
  const currentTrackRef = useRef<Track | null>(null)
  const isPlayingRef = useRef(false)
  const volRef = useRef(muted ? 0 : volume) // 0-100, effective (0 when muted)
  const volLevelRef = useRef(volume) // 0-100, stored level (ignores mute)
  const rateRef = useRef(rate)
  const crossfadeRef = useRef(crossfade)
  const sleepRef = useRef(sleep)
  const autoplayRef = useRef(autoplay)
  const radioLoadingRef = useRef(false)
  const shufHistRef = useRef<number[]>([]) // recently shuffled-to indices (smart shuffle)
  const handleEndedRef = useRef<() => void>(() => {})
  const advanceRef = useRef<() => void>(() => {})
  useEffect(() => void (queueRef.current = queue), [queue])
  useEffect(() => void (indexRef.current = index), [index])
  useEffect(() => void (userQueueRef.current = userQueue), [userQueue])
  useEffect(() => void (shuffleRef.current = shuffle), [shuffle])
  useEffect(() => void (repeatRef.current = repeat), [repeat])
  useEffect(() => void (progressRef.current = progress), [progress])
  useEffect(() => void (currentTrackRef.current = currentTrack), [currentTrack])
  useEffect(() => void (isPlayingRef.current = isPlaying), [isPlaying])
  useEffect(() => void (rateRef.current = rate), [rate])
  useEffect(() => void (crossfadeRef.current = crossfade), [crossfade])
  useEffect(() => void (sleepRef.current = sleep), [sleep])
  useEffect(() => void (autoplayRef.current = autoplay), [autoplay])

  // --- YouTube IFrame engine ---------------------------------------------
  const mountRef = useRef<HTMLDivElement>(null)
  const ytRef = useRef<any>(null)
  const ytReadyRef = useRef(false)
  const ytPollRef = useRef<number | undefined>(undefined)
  const pendingYtRef = useRef<string | null>(null)

  const stopYtPoll = useCallback(() => {
    if (ytPollRef.current !== undefined) {
      clearInterval(ytPollRef.current)
      ytPollRef.current = undefined
    }
  }, [])
  const startYtPoll = useCallback(() => {
    stopYtPoll()
    ytPollRef.current = window.setInterval(() => {
      const p = ytRef.current
      if (!p || !p.getCurrentTime) return
      setProgress(p.getCurrentTime() || 0)
      const d = p.getDuration ? p.getDuration() : 0
      if (d) setDuration(d)
    }, 500)
  }, [stopYtPoll])

  useEffect(() => {
    let cancelled = false
    const create = () => {
      if (cancelled || !mountRef.current || ytRef.current || !window.YT?.Player) return
      const inner = document.createElement('div')
      mountRef.current.appendChild(inner)
      ytRef.current = new window.YT.Player(inner, {
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => {
            ytReadyRef.current = true
            try {
              ytRef.current.setVolume(volRef.current)
            } catch {
              /* noop */
            }
            if (pendingYtRef.current) {
              ytRef.current.loadVideoById(pendingYtRef.current)
              pendingYtRef.current = null
            }
          },
          onStateChange: (e: any) => {
            const S = window.YT.PlayerState
            if (e.data === S.PLAYING) {
              setIsPlaying(true)
              setIsBuffering(false)
              try {
                ytRef.current.setPlaybackRate(rateRef.current)
              } catch {
                /* noop */
              }
              startYtPoll()
            } else if (e.data === S.PAUSED) {
              setIsPlaying(false)
            } else if (e.data === S.BUFFERING) {
              setIsBuffering(true)
            } else if (e.data === S.ENDED) {
              stopYtPoll()
              handleEndedRef.current()
            }
          },
          onError: () => {
            // e.g. video not embeddable / removed — skip to the next track.
            setIsBuffering(false)
            setError('Skipping a track that can’t be embedded…')
            advanceRef.current()
          },
        },
      })
    }

    if (window.YT?.Player) {
      create()
    } else {
      const prevCb = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        prevCb?.()
        create()
      }
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script')
        s.id = 'yt-iframe-api'
        s.src = 'https://www.youtube.com/iframe_api'
        // If the API can't load (ad-blocker, offline, CSP) a YouTube track would
        // otherwise spin forever — surface it and skip so autoplay isn't wedged.
        s.onerror = () => {
          if (cancelled) return
          if (isIframeTrack(currentTrackRef.current)) {
            setIsBuffering(false)
            setError('YouTube player couldn’t load — skipping this track.')
            advanceRef.current()
          }
        }
        document.body.appendChild(s)
      }
    }
    return () => {
      cancelled = true
      stopYtPoll()
    }
  }, [startYtPoll, stopYtPoll])

  // -----------------------------------------------------------------------
  // Crossfade machinery: ramp the active deck out while the idle deck ramps in.
  const fadeIvRef = useRef<number | undefined>(undefined)
  const fadingRef = useRef(false)

  const cancelCrossfade = useCallback(() => {
    if (fadeIvRef.current !== undefined) {
      clearInterval(fadeIvRef.current)
      fadeIvRef.current = undefined
    }
    fadingRef.current = false
    try {
      idle().pause()
    } catch {
      /* noop */
    }
    // Restore the active deck to full (base) volume.
    active().volume = volRef.current / 100
  }, [active, idle])

  const loadAndPlay = useCallback(
    (track: Track) => {
      cancelCrossfade()
      setError(null)
      setCurrentTrack(track)
      currentTrackRef.current = track
      setProgress(0)
      setDuration(track.duration || 0)
      setIsBuffering(true)

      if (isIframeTrack(track)) {
        try {
          active().pause()
        } catch {
          /* noop */
        }
        const p = ytRef.current
        if (p && ytReadyRef.current) {
          p.loadVideoById(track.id)
        } else {
          pendingYtRef.current = track.id
        }
      } else {
        stopYtPoll()
        if (ytRef.current && ytReadyRef.current) {
          try {
            ytRef.current.stopVideo()
          } catch {
            /* noop */
          }
        }
        const a = active()
        a.volume = volRef.current / 100
        a.playbackRate = rateRef.current
        a.src = track.streamUrl
        a.play().catch((err: any) => {
          // AbortError fires when we switch tracks before the previous load
          // finishes — that's expected, not a real failure.
          if (err?.name === 'AbortError') return
          setIsBuffering(false)
          setError(
            err?.name === 'NotAllowedError'
              ? 'Tap play once to allow audio, then it will work.'
              : 'Could not play this track. Trying the next one may help.',
          )
        })
      }
    },
    [active, cancelCrossfade, stopYtPoll],
  )

  const pushRecent = useCallback((track: Track) => {
    cloudRecordPlay(track) // best-effort; no-op when signed out
    setRecent((prev) => {
      const deduped = [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 30)
      save(LS.recent, deduped)
      return deduped
    })
    setRecentAt((prev) => {
      const updated = { ...prev, [track.id]: Date.now() }
      // Cap to the ~30 most recent so this map can't grow without bound.
      const entries = Object.entries(updated)
      if (entries.length > 40) {
        entries.sort((a, b) => b[1] - a[1])
        const trimmed: Record<string, number> = {}
        for (const [id, ts] of entries.slice(0, 40)) trimmed[id] = ts
        save(LS.recentAt, trimmed)
        return trimmed
      }
      save(LS.recentAt, updated)
      return updated
    })
    // Listening stats: count this play + keep the track for the dashboard.
    const s = statsRef.current
    s.plays[track.id] = (s.plays[track.id] || 0) + 1
    s.tracks[track.id] = track
    const ids = Object.keys(s.tracks)
    if (ids.length > 400) {
      ids.sort((a, b) => (s.plays[a] || 0) - (s.plays[b] || 0))
      // Drop the least-played tracks AND their play counts (previously only
      // s.tracks was pruned, so s.plays leaked one key per track forever).
      for (const id of ids.slice(0, ids.length - 400)) {
        delete s.tracks[id]
        delete s.plays[id]
      }
    }
    save(LS.stats, s)
  }, [])

  // Accumulate real listening time (wall-clock) while something is playing.
  useEffect(() => {
    if (!isPlaying) return
    const iv = setInterval(() => {
      const s = statsRef.current
      s.listenedSec += 1
      const k = dayKey()
      s.daily[k] = (s.daily[k] || 0) + 1
      if (s.listenedSec % 15 === 0) {
        // Keep only the last ~40 days of daily totals (the dashboard shows 7);
        // otherwise s.daily accumulates one key per day forever.
        const days = Object.keys(s.daily)
        if (days.length > 40) {
          for (const d of days.sort().slice(0, days.length - 40)) delete s.daily[d]
        }
        save(LS.stats, s)
      }
    }, 1000)
    return () => {
      save(LS.stats, statsRef.current)
      clearInterval(iv)
    }
  }, [isPlaying])

  // Sleep timer: pause when a timed sleep elapses.
  useEffect(() => {
    if (!sleep.endsAt) return
    const iv = setInterval(() => {
      if (sleepRef.current.endsAt && Date.now() >= sleepRef.current.endsAt) {
        pauseAllRef.current()
        setSleep({ endsAt: null, endOfTrack: false })
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [sleep.endsAt])

  // Auto-dismiss the error toast — otherwise a terminal failure (e.g. the last
  // track fails to load) leaves it stuck on screen forever, since it's only ever
  // cleared by the next successful load.
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 4500)
    return () => clearTimeout(id)
  }, [error])

  const getStats = useCallback((): PlayerStats => {
    const s = statsRef.current
    const entries = Object.entries(s.plays) as [string, number][]
    const topSongs = entries
      .filter(([id]) => s.tracks[id])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, count]) => ({ track: s.tracks[id], count }))
    const artistAgg: Record<string, number> = {}
    for (const [id, count] of entries) {
      const t = s.tracks[id]
      if (t) artistAgg[t.artist] = (artistAgg[t.artist] || 0) + count
    }
    const topArtists = Object.entries(artistAgg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([artist, count]) => ({ artist, count }))
    const totalPlays = entries.reduce((a, [, c]) => a + c, 0)
    const week: { label: string; sec: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      week.push({
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        sec: s.daily[dayKey(d)] || 0,
      })
    }
    return { listenedSec: s.listenedSec, totalPlays, uniqueTracks: entries.length, topSongs, topArtists, week }
  }, [])

  const playAt = useCallback(
    (i: number) => {
      const q = queueRef.current
      if (i < 0 || i >= q.length) return
      setIndex(i)
      indexRef.current = i
      loadAndPlay(q[i])
      pushRecent(q[i])
    },
    [loadAndPlay, pushRecent],
  )

  const playTrack = useCallback(
    (track: Track, context?: Track[]) => {
      const list = context && context.length ? context : [track]
      const idx = Math.max(
        0,
        list.findIndex((t) => t.id === track.id),
      )
      setQueue(list)
      setIndex(idx)
      queueRef.current = list
      indexRef.current = idx
      loadAndPlay(list[idx] ?? track)
      pushRecent(track)
    },
    [loadAndPlay, pushRecent],
  )

  const playContext = useCallback(
    (tracks: Track[], startId?: string) => {
      if (!tracks.length) return
      const start = startId ? tracks.find((t) => t.id === startId) ?? tracks[0] : tracks[0]
      playTrack(start, tracks)
    },
    [playTrack],
  )

  // Append tracks to the END of the current context queue (used by playlist
  // import to stream in matches as they resolve, without interrupting playback).
  const appendToContext = useCallback((tracks: Track[]) => {
    if (!tracks.length) return
    setQueue((q) => {
      const have = new Set(q.map((t) => t.id))
      const fresh = tracks.filter((t) => t.id && !have.has(t.id))
      if (!fresh.length) return q
      const updated = [...q, ...fresh]
      queueRef.current = updated
      return updated
    })
  }, [])

  // Compute the next track WITHOUT advancing — used by crossfade to preload.
  const peekNext = useCallback((): { track: Track; kind: 'user' | 'context'; idx: number } | null => {
    if (repeatRef.current === 'one') return null
    if (userQueueRef.current.length) return { track: userQueueRef.current[0], kind: 'user', idx: 0 }
    const q = queueRef.current
    if (!q.length) return null
    if (shuffleRef.current && q.length > 1) return null // random pick happens at advance
    let i = indexRef.current + 1
    if (i >= q.length) {
      if (repeatRef.current === 'all') i = 0
      else return null
    }
    return { track: q[i], kind: 'context', idx: i }
  }, [])

  const consumeUserQueueHead = useCallback(() => {
    setUserQueue((uq) => {
      const rest = uq.slice(1)
      userQueueRef.current = rest
      return rest
    })
  }, [])

  // Autoplay radio: pick songs to keep the music going once the queue ends.
  // Seeds from Audius trending (by the current track's genre) for Audius tracks,
  // else from the baked Bollywood catalog (0 quota). Excludes what's already queued.
  const fetchRadio = useCallback(async (): Promise<Track[]> => {
    const seed = currentTrackRef.current
    const exclude = new Set(queueRef.current.map((t) => t.id))
    let recs: Track[] = []
    try {
      if (seed?.source === 'audius') recs = await fetchTrending(seed.genre || undefined)
    } catch {
      /* fall back to baked */
    }
    if (!recs.length) recs = shuffled(BOLLYWOOD_TRACKS).slice(0, 30)
    return recs.filter((t) => t.id && !exclude.has(t.id)).slice(0, 25)
  }, [])

  const startRadio = useCallback(async () => {
    if (radioLoadingRef.current) return
    radioLoadingRef.current = true
    setIsBuffering(true)
    try {
      const recs = await fetchRadio()
      const base = queueRef.current
      const have = new Set(base.map((t) => t.id))
      const fresh = recs.filter((t) => !have.has(t.id))
      if (!fresh.length) {
        setIsBuffering(false)
        return
      }
      const updated = [...base, ...fresh]
      queueRef.current = updated
      setQueue(updated)
      const startIdx = base.length
      indexRef.current = startIdx
      setIndex(startIdx)
      loadAndPlay(updated[startIdx])
      pushRecent(updated[startIdx])
    } catch {
      setIsBuffering(false)
    } finally {
      radioLoadingRef.current = false
    }
  }, [fetchRadio, loadAndPlay, pushRecent])

  const next = useCallback(() => {
    cancelCrossfade()
    if (userQueueRef.current.length) {
      const head = userQueueRef.current[0]
      consumeUserQueueHead()
      loadAndPlay(head)
      pushRecent(head)
      return
    }
    const q = queueRef.current
    if (!q.length) return
    if (shuffleRef.current && q.length > 1) {
      // Smart shuffle: avoid songs played recently this session until the pool
      // is exhausted, so you don't hear the same few tracks on repeat.
      const hist = shufHistRef.current
      const avoid = new Set(hist.slice(-Math.min(hist.length, Math.floor(q.length / 2))))
      avoid.add(indexRef.current)
      const pool: number[] = []
      for (let k = 0; k < q.length; k++) if (!avoid.has(k)) pool.push(k)
      let r: number
      if (pool.length) {
        r = pool[Math.floor(Math.random() * pool.length)]
      } else {
        r = indexRef.current
        while (r === indexRef.current) r = Math.floor(Math.random() * q.length)
      }
      hist.push(r)
      if (hist.length > 60) hist.shift()
      playAt(r)
      return
    }
    let i = indexRef.current + 1
    if (i >= q.length) {
      if (repeatRef.current === 'all') i = 0
      else {
        // End of the queue — keep playing if autoplay radio is on.
        if (autoplayRef.current) startRadio()
        return
      }
    }
    playAt(i)
  }, [cancelCrossfade, consumeUserQueueHead, loadAndPlay, playAt, pushRecent, startRadio])

  const seekTo = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds)) return
      cancelCrossfade()
      const t = currentTrackRef.current
      if (isIframeTrack(t)) {
        try {
          ytRef.current?.seekTo(seconds, true)
        } catch {
          /* noop */
        }
      } else {
        active().currentTime = seconds
      }
      setProgress(seconds)
      // Resync the Discord progress bar (desktop only; no-op elsewhere).
      pushPresence(currentTrackRef.current, {
        isPlaying: isPlayingRef.current,
        positionSec: seconds,
      })
    },
    [active, cancelCrossfade],
  )
  const seek = seekTo

  const prev = useCallback(() => {
    if (progressRef.current > 3) {
      seekTo(0)
      return
    }
    const q = queueRef.current
    if (!q.length) return
    let i = indexRef.current - 1
    if (i < 0) i = repeatRef.current === 'all' ? q.length - 1 : 0
    playAt(i)
  }, [playAt, seekTo])

  // Begin a crossfade into the next track (audio-element tracks only).
  const beginCrossfade = useCallback(
    (sel: { track: Track; kind: 'user' | 'context'; idx: number }) => {
      if (fadingRef.current) return
      const cf = crossfadeRef.current
      if (cf <= 0) return
      const a = active()
      const b = idle()
      fadingRef.current = true
      b.src = sel.track.streamUrl
      b.currentTime = 0
      b.volume = 0
      b.playbackRate = rateRef.current

      let id: number | undefined
      let done = false
      let elapsed = 0 // ms of fade progressed (accumulated only while playing)
      let last = Date.now()

      // Tear down THIS fade's interval. We track the id locally (not just via
      // fadeIvRef) so a stale interval can never keep firing after its ref was
      // overwritten by a later fade.
      const stop = () => {
        if (id !== undefined) clearInterval(id)
        if (fadeIvRef.current === id) fadeIvRef.current = undefined
        fadingRef.current = false
      }

      b.play().catch(() => {
        // The next deck couldn't start (dead/geo-blocked stream). Abort the fade
        // and keep the current track playing at full volume instead of ramping
        // it into silence — handleEnded will advance normally when it ends.
        stop()
        try {
          b.pause()
        } catch {
          /* noop */
        }
        a.volume = volRef.current / 100
      })

      id = window.setInterval(() => {
        // Cancelled elsewhere (track change / seek / unmount) — bail out.
        if (!fadingRef.current || done) {
          stop()
          return
        }
        const now = Date.now()
        const dt = now - last
        last = now
        // Freeze the fade while paused so pausing mid-fade doesn't silently
        // auto-advance to the next track.
        if (a.paused) return
        elapsed += dt
        const vol = volRef.current / 100 // honor live volume/mute changes
        const frac = Math.min(1, elapsed / (cf * 1000))
        a.volume = vol * (1 - frac)
        b.volume = vol * frac
        if (frac >= 1) {
          done = true
          stop()
          try {
            a.pause()
          } catch {
            /* noop */
          }
          activeRef.current ^= 1 // idle deck is now the active one
          b.volume = vol
          if (sel.kind === 'user') consumeUserQueueHead()
          else {
            setIndex(sel.idx)
            indexRef.current = sel.idx
          }
          setCurrentTrack(sel.track)
          currentTrackRef.current = sel.track
          setProgress(0)
          setDuration(sel.track.duration || 0)
          pushRecent(sel.track)
        }
      }, 50)
      fadeIvRef.current = id
    },
    [active, idle, consumeUserQueueHead, pushRecent],
  )

  const togglePlay = useCallback(() => {
    const t = currentTrackRef.current
    if (!t) {
      if (userQueueRef.current.length) next()
      else if (queueRef.current.length) playAt(0)
      return
    }
    if (isIframeTrack(t)) {
      const p = ytRef.current
      if (!p) return
      const st = p.getPlayerState ? p.getPlayerState() : -1
      if (st === window.YT?.PlayerState?.PLAYING) p.pauseVideo()
      else p.playVideo()
    } else {
      const a = active()
      if (fadingRef.current) {
        // pause/resume both decks together mid-fade
        if (a.paused) {
          a.play().catch(() => {})
          idle().play().catch(() => {})
        } else {
          a.pause()
          idle().pause()
        }
        return
      }
      if (a.paused) a.play().catch(() => {})
      else a.pause()
    }
  }, [active, idle, next, playAt])

  // repeat-one / advance / sleep-end-of-track, shared by both engines.
  const handleEnded = useCallback(() => {
    if (fadingRef.current) return // crossfade is already handling the transition
    if (sleepRef.current.endOfTrack) {
      setSleep({ endsAt: null, endOfTrack: false })
      setIsPlaying(false)
      return
    }
    if (repeatRef.current === 'one') {
      const t = currentTrackRef.current
      if (isIframeTrack(t)) {
        try {
          ytRef.current?.seekTo(0, true)
          ytRef.current?.playVideo()
        } catch {
          /* noop */
        }
      } else {
        active().currentTime = 0
        active().play().catch(() => {})
      }
      return
    }
    next()
  }, [active, next])
  useEffect(() => void (handleEndedRef.current = handleEnded), [handleEnded])
  useEffect(() => void (advanceRef.current = next), [next])

  const pauseAllRef = useRef<() => void>(() => {})
  useEffect(() => {
    pauseAllRef.current = () => {
      try {
        decks.forEach((d) => d.pause())
      } catch {
        /* noop */
      }
      if (ytRef.current && isIframeTrack(currentTrackRef.current)) {
        try {
          ytRef.current.pauseVideo()
        } catch {
          /* noop */
        }
      }
      setIsPlaying(false)
    }
  }, [decks])

  // --- queue management ---------------------------------------------------
  const addToQueue = useCallback((track: Track) => {
    setUserQueue((uq) => {
      const updated = [...uq, track]
      userQueueRef.current = updated
      return updated
    })
  }, [])
  const removeFromQueue = useCallback((i: number) => {
    setUserQueue((uq) => {
      const updated = uq.filter((_, idx) => idx !== i)
      userQueueRef.current = updated
      return updated
    })
  }, [])
  const moveInQueue = useCallback((from: number, to: number) => {
    setUserQueue((uq) => {
      if (from < 0 || from >= uq.length || to < 0 || to >= uq.length) return uq
      const updated = uq.slice()
      const [it] = updated.splice(from, 1)
      updated.splice(to, 0, it)
      userQueueRef.current = updated
      return updated
    })
  }, [])
  const clearQueue = useCallback(() => {
    setUserQueue([])
    userQueueRef.current = []
  }, [])
  const playUpNext = useCallback(
    (kind: 'user' | 'context', i: number) => {
      cancelCrossfade()
      if (kind === 'user') {
        const head = userQueueRef.current[i]
        if (!head) return
        const rest = userQueueRef.current.filter((_, idx) => idx > i)
        setUserQueue(rest)
        userQueueRef.current = rest
        loadAndPlay(head)
        pushRecent(head)
      } else {
        playAt(i)
      }
    },
    [cancelCrossfade, loadAndPlay, playAt, pushRecent],
  )

  // --- playback extras setters -------------------------------------------
  const setRate = useCallback(
    (r: number) => {
      const clamped = Math.max(0.5, Math.min(2, r))
      setRateState(clamped)
      rateRef.current = clamped
      save(LS.rate, clamped)
      decks.forEach((d) => (d.playbackRate = clamped))
      try {
        ytRef.current?.setPlaybackRate(clamped)
      } catch {
        /* noop */
      }
    },
    [decks],
  )
  const setCrossfade = useCallback((s: number) => {
    const clamped = Math.max(0, Math.min(12, Math.round(s)))
    setCrossfadeState(clamped)
    crossfadeRef.current = clamped
    save(LS.crossfade, clamped)
  }, [])
  const setSleepMinutes = useCallback((min: number) => {
    setSleep({ endsAt: Date.now() + min * 60_000, endOfTrack: false })
  }, [])
  const setSleepEndOfTrack = useCallback(() => {
    setSleep({ endsAt: null, endOfTrack: true })
  }, [])
  const clearSleep = useCallback(() => setSleep({ endsAt: null, endOfTrack: false }), [])

  const setAutoplay = useCallback((on: boolean) => {
    setAutoplayState(on)
    autoplayRef.current = on
    save(LS.autoplay, on)
  }, [])

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, v))
    setVolumeState(clamped)
    volLevelRef.current = clamped
    setMuted(clamped === 0)
    save(LS.volume, clamped)
  }, [])

  const toggleMute = useCallback(() => setMuted((m) => !m), [])
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), [])
  const cycleRepeat = useCallback(
    () => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
    [],
  )

  const isLiked = useCallback((id: string) => liked.some((t) => t.id === id), [liked])
  const toggleLike = useCallback((track: Track) => {
    setLiked((prev) => {
      const exists = prev.some((t) => t.id === track.id)
      const updated = exists ? prev.filter((t) => t.id !== track.id) : [track, ...prev]
      save(LS.liked, updated)
      // Mirror to the cloud (best-effort; no-ops when signed out).
      if (exists) cloudRemoveLike(track.id)
      else cloudAddLike(track)
      return updated
    })
  }, [])

  // Sync liked songs with the account: on sign-in, import any local likes once,
  // then load the cloud library; on sign-out, fall back to the local mirror.
  const importedForRef = useRef<string | null>(null)
  const prevEmailRef = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const email = user?.email ?? null
    // True only on a signed-in → signed-out transition (not the initial load).
    const justSignedOut = !email && !!prevEmailRef.current
    prevEmailRef.current = email
    if (!email) {
      importedForRef.current = null
      if (justSignedOut) {
        // Clear the previous account's mirrored likes so they don't get treated
        // as "local likes" and imported into whoever signs in next.
        setLiked([])
        save(LS.liked, [])
      } else {
        setLiked(load(LS.liked, []))
      }
      return
    }
    ;(async () => {
      if (importedForRef.current !== email) {
        const local = load<Track[]>(LS.liked, [])
        if (local.length) await cloudImportLikes(local)
        importedForRef.current = email
      }
      const cloud = await cloudFetchLikes()
      if (cancelled) return
      setLiked(cloud)
      save(LS.liked, cloud)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  // Apply volume / mute to the active deck + IFrame (skip while crossfading,
  // where the fade interval owns the deck volumes).
  useEffect(() => {
    const v = muted ? 0 : volume
    volRef.current = v
    if (!fadingRef.current) active().volume = v / 100
    if (ytRef.current && ytReadyRef.current) {
      try {
        ytRef.current.setVolume(v)
      } catch {
        /* noop */
      }
    }
  }, [active, volume, muted])

  // Wire up <audio> events for BOTH decks; ignore events from the idle deck.
  useEffect(() => {
    const cleanups = decks.map((a) => {
      const isActive = () => a === decks[activeRef.current]
      const onTime = () => {
        if (!isActive()) return
        setProgress(a.currentTime)
        // crossfade trigger: start fading near the end of an audio-el track
        if (
          !fadingRef.current &&
          crossfadeRef.current > 0 &&
          isAudioElTrack(currentTrackRef.current) &&
          a.duration &&
          a.duration - a.currentTime <= crossfadeRef.current
        ) {
          const sel = peekNext()
          if (sel && isAudioElTrack(sel.track)) beginCrossfade(sel)
        }
      }
      const onMeta = () => isActive() && setDuration(a.duration || 0)
      const onPlay = () => {
        if (!isActive()) return
        setIsPlaying(true)
        setIsBuffering(false)
      }
      const onPause = () => isActive() && !fadingRef.current && setIsPlaying(false)
      const onWaiting = () => isActive() && setIsBuffering(true)
      const onPlaying = () => isActive() && setIsBuffering(false)
      const onEnded = () => isActive() && handleEndedRef.current()
      const onError = () => {
        if (!isActive()) return
        // Suppress only for IFrame (Data-API) tracks, which don't use <audio>.
        if (!isIframeTrack(currentTrackRef.current)) {
          setIsBuffering(false)
          setError('This track failed to load.')
        }
      }
      a.addEventListener('timeupdate', onTime)
      a.addEventListener('loadedmetadata', onMeta)
      a.addEventListener('durationchange', onMeta)
      a.addEventListener('play', onPlay)
      a.addEventListener('pause', onPause)
      a.addEventListener('waiting', onWaiting)
      a.addEventListener('playing', onPlaying)
      a.addEventListener('ended', onEnded)
      a.addEventListener('error', onError)
      return () => {
        a.removeEventListener('timeupdate', onTime)
        a.removeEventListener('loadedmetadata', onMeta)
        a.removeEventListener('durationchange', onMeta)
        a.removeEventListener('play', onPlay)
        a.removeEventListener('pause', onPause)
        a.removeEventListener('waiting', onWaiting)
        a.removeEventListener('playing', onPlaying)
        a.removeEventListener('ended', onEnded)
        a.removeEventListener('error', onError)
      }
    })
    return () => cleanups.forEach((c) => c())
  }, [decks, beginCrossfade, peekNext])

  // Media Session API — OS-level media keys & lockscreen controls.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    if (currentTrack) {
      ms.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        artwork: currentTrack.artwork
          ? [{ src: currentTrack.artwork, sizes: '480x480', type: 'image/jpeg' }]
          : [],
      })
    }
    ms.setActionHandler('play', () => togglePlay())
    ms.setActionHandler('pause', () => togglePlay())
    ms.setActionHandler('nexttrack', () => next())
    ms.setActionHandler('previoustrack', () => prev())
  }, [currentTrack, togglePlay, next, prev])

  // Windows taskbar mini-player (desktop app only). Keeps the play/pause glyph
  // and the hover tooltip in step with the bar, and lets the thumbnail's own
  // transport buttons drive playback. The Media Session handlers above cover the
  // hardware media keys; this covers the taskbar preview, which Windows routes
  // through its own channel rather than through media keys.
  useEffect(() => {
    pushNowPlaying(currentTrack, { isPlaying })
  }, [currentTrack, isPlaying])

  useEffect(
    () =>
      onMediaControl((action) => {
        if (action === 'playpause') togglePlay()
        else if (action === 'next') next()
        else if (action === 'prev') prev()
      }),
    [togglePlay, next, prev],
  )

  // Discord Rich Presence (desktop app only — no-op on the web build). Fires on
  // track change + play/pause; Discord animates the progress bar itself from the
  // timestamps we send, so no per-second updates are needed. seekTo() re-pushes
  // to resync the bar after a scrub.
  useEffect(() => {
    if (currentTrack) pushPresence(currentTrack, { isPlaying, positionSec: progressRef.current })
    else clearPresence()
  }, [currentTrack, isPlaying])

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowRight':
          e.preventDefault()
          seekTo(progressRef.current + (e.shiftKey ? 10 : 5))
          break
        case 'ArrowLeft':
          e.preventDefault()
          seekTo(Math.max(0, progressRef.current - (e.shiftKey ? 10 : 5)))
          break
        case 'ArrowUp':
          e.preventDefault()
          // Use the stored level, not the effective volume (which is 0 when
          // muted) — otherwise ArrowUp while muted would reset volume to 5.
          setVolume(volLevelRef.current + 5)
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume(volLevelRef.current - 5)
          break
        case 'KeyN':
          next()
          break
        case 'KeyP':
          prev()
          break
        case 'KeyM':
          toggleMute()
          break
        case 'KeyS':
          toggleShuffle()
          break
        case 'KeyR':
          cycleRepeat()
          break
        case 'KeyL': {
          const t = currentTrackRef.current
          if (t) toggleLike(t)
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, seekTo, setVolume, next, prev, toggleMute, toggleShuffle, cycleRepeat, toggleLike])

  const value: PlayerContextValue = {
    currentTrack,
    queue,
    index,
    userQueue,
    isPlaying,
    isBuffering,
    progress,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    liked,
    recent,
    recentAt,
    error,
    rate,
    crossfade,
    sleep,
    canTuneAudio: isAudioElTrack(currentTrack),
    autoplay,
    playTrack,
    playContext,
    appendToContext,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    isLiked,
    getStats,
    addToQueue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    playUpNext,
    setRate,
    setCrossfade,
    setSleepMinutes,
    setSleepEndOfTrack,
    clearSleep,
    setAutoplay,
  }

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/*
        YouTube tracks (Bollywood/Hindi) must play through a YouTube IFrame, but
        we want them to feel native — no popup. The player is kept mounted at a
        real size but parked off-screen, so it streams audio from Google's CDN
        while the app's own player bar drives play/pause/seek/next. Audio-only,
        no visible video.
      */}
      <div ref={mountRef} className="yt-audio-host" aria-hidden="true" />
    </PlayerContext.Provider>
  )
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
