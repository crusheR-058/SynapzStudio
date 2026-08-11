import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock3,
  Disc3,
  Download,
  Film,
  Gauge,
  GripVertical,
  Headphones,
  Heart,
  Home,
  LayoutGrid,
  ListMusic,
  ListPlus,
  ListX,
  LogIn,
  LogOut,
  Mail,
  Maximize2,
  Mic2,
  Minimize2,
  Moon,
  MoreHorizontal,
  Music2,
  Pencil,
  TrendingUp,
  Pause,
  Play,
  Plus,
  Podcast,
  Radio,
  Repeat,
  Repeat1,
  Search as SearchIcon,
  Shuffle,
  SkipBack,
  SkipForward,
  Copy,
  Link2,
  Lock,
  Share2,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  X,
  Youtube,
} from 'lucide-react'
import { PlayerProvider, usePlayer } from './player'
import { AuthProvider, useAuth } from './auth'
import { PlaylistsProvider, usePlaylists, type UserPlaylist } from './playlists'
import type { Playlist, Track, View } from '../lib/types'
import { activeLineIndex, fetchLyrics, hasDevanagari, romanize, type Lyrics } from '../lib/lyrics'
import {
  fetchSpotifyImport,
  parseSpotifyUrl,
  resolveTrack,
  type SpotifyImport,
} from '../lib/spotify'
import {
  fetchPlaylist,
  fetchPlaylistTracks,
  fetchTrending,
  fetchTrendingPlaylists,
  searchPlaylists,
  searchTracks,
  warmup,
} from '../lib/audius'
import { fetchPopular, searchYT } from '../lib/youtube'
import { BOLLYWOOD_TRACKS, bollywoodByCategory } from '../lib/bollywood'
import { HOLLYWOOD_TRACKS, HOLLYWOOD_ARTISTS, hollywoodByArtist } from '../lib/hollywood'
import {
  isDesktop,
  discordEnabled,
  setDiscordEnabled,
  getDiscordStatus,
  type DiscordStatus,
} from '../lib/discord'
import { VibeProvider, useVibe, VIBES } from './vibe'
import VibeBackground from './VibeBackground'
import { PODCAST_TRACKS, podcastsByCategory } from '../lib/podcasts'
import { stationByName } from '../lib/stations'
import { RADIO_STATIONS } from '../lib/radio'
import { cloudAddToPlaylist, cloudFetchHistory, cloudFetchPublicPlaylist } from '../lib/cloud'
import { watchPlayerRect } from '../lib/taskbar'
import { restartToUpdate, watchUpdates, type UpdateStatus } from '../lib/updater'

/* ------------------------------------------------------------------ utils */

const isCoarsePointer = () => window.matchMedia?.('(hover: none) and (pointer: coarse)').matches

function fmtTime(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtCount(n?: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

function fmtAgo(ts?: number): string {
  if (!ts) return ''
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s} sec ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  return `${d} day${d > 1 ? 's' : ''} ago`
}

function fill(pct: number): CSSProperties {
  return { ['--fill' as string]: `${pct}%` }
}

function fmtDuration(totalSec: number): string {
  const sec = Math.floor(totalSec || 0)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${sec}s`
}

const GENRES: { name: string; genre: string; color: string }[] = [
  { name: 'Electronic', genre: 'Electronic', color: '#c1121f' },
  { name: 'Hip-Hop & Rap', genre: 'Hip-Hop/Rap', color: '#ff2e4c' },
  { name: 'Pop', genre: 'Pop', color: '#e63950' },
  { name: 'Rock', genre: 'Rock', color: '#8e0a1c' },
  { name: 'Lo-Fi', genre: 'Lo-Fi', color: '#ff5066' },
  { name: 'House', genre: 'House', color: '#a30d28' },
  { name: 'Techno', genre: 'Techno', color: '#d62246' },
  { name: 'R&B & Soul', genre: 'R&B/Soul', color: '#ff4d4d' },
  { name: 'Deep House', genre: 'Deep House', color: '#b30000' },
  { name: 'Trap', genre: 'Trap', color: '#ff3b5e' },
  { name: 'Dubstep', genre: 'Dubstep', color: '#7a0915' },
  { name: 'Ambient', genre: 'Ambient', color: '#e0213c' },
  { name: 'Jazz', genre: 'Jazz', color: '#9b1b30' },
  { name: 'Classical', genre: 'Classical', color: '#cc2b3d' },
]

// Top Charts tiles → Audius trending (overall or by genre). 0 extra cost — same
// trending endpoint Home uses, rendered as chart-style lists via GenreView.
const CHARTS: { name: string; genre: string }[] = [
  { name: 'Top 50 · Global', genre: '' },
  { name: 'Pop', genre: 'Pop' },
  { name: 'Hip-Hop & Rap', genre: 'Hip-Hop/Rap' },
  { name: 'Electronic', genre: 'Electronic' },
  { name: 'R&B & Soul', genre: 'R&B/Soul' },
  { name: 'Rock', genre: 'Rock' },
]

// Accent colour themes (keys match html[data-accent=…] blocks in theme.css).
const THEMES: { key: string; name: string; color: string }[] = [
  { key: 'crimson', name: 'Crimson', color: '#ff2e4c' },
  { key: 'ocean', name: 'Ocean', color: '#2d8cff' },
  { key: 'emerald', name: 'Emerald', color: '#20c978' },
  { key: 'violet', name: 'Violet', color: '#a855f7' },
  { key: 'sunset', name: 'Sunset', color: '#ff8a28' },
]

function applyAccent(key: string) {
  try {
    if (!key || key === 'crimson') delete document.documentElement.dataset.accent
    else document.documentElement.dataset.accent = key
  } catch {
    /* noop */
  }
}

const TAGS: { emoji: string; label: string; genre?: string; hindi?: boolean; hollywood?: boolean }[] = [
  { emoji: '🎬', label: 'Bollywood', hindi: true },
  { emoji: '🌟', label: 'Hollywood', hollywood: true },
  { emoji: '🪕', label: 'Punjabi', hindi: true },
  { emoji: '🎸', label: 'Acoustic', genre: 'Acoustic' },
  { emoji: '🎹', label: 'Piano jazz', genre: 'Jazz' },
  { emoji: '🔥', label: 'Indie pop', genre: 'Pop' },
  { emoji: '🎧', label: 'Lo-Fi', genre: 'Lo-Fi' },
]

// Preset Hindi / Bollywood search lanes (work on both YouTube and Audius).
const HINDI_CHIPS: { label: string; q: string }[] = [
  { label: 'New Hits', q: 'new hindi song official video' },
  { label: 'Old Classics', q: 'old hindi song kishore kumar lata mangeshkar' },
  { label: '90s Bollywood', q: '90s bollywood hindi song' },
  { label: '2000s Hits', q: '2000s bollywood hindi song' },
  { label: '2010s Hits', q: '2010s bollywood hindi song' },
  { label: 'Arijit Singh', q: 'arijit singh song' },
  { label: 'Lata & Kishore', q: 'lata mangeshkar kishore kumar duet song' },
  { label: 'Mohammed Rafi', q: 'mohammed rafi song' },
  { label: 'Romantic', q: 'romantic hindi love song official video' },
  { label: 'Sad Songs', q: 'sad hindi song official video' },
  { label: 'Sufi', q: 'sufi song hindi rahat fateh ali khan' },
  { label: 'Ghazals', q: 'ghazal jagjit singh' },
  { label: 'Devotional', q: 'hindi bhajan devotional song' },
  { label: 'Wedding', q: 'bollywood wedding shaadi song' },
  { label: 'Punjabi', q: 'punjabi song official video' },
  { label: 'Honey Singh', q: 'yo yo honey singh song' },
  { label: 'Lo-Fi Hindi', q: 'hindi lofi song slowed reverb' },
  { label: 'Party', q: 'bollywood party dance song official video' },
]

// Hollywood / English chips = one per artist in the baked catalog. Filtering is
// zero-quota (baked); the live query is only used as a fallback if a chip is thin.
const HOLLYWOOD_CHIPS: { label: string; q: string }[] = HOLLYWOOD_ARTISTS.map((a) => ({
  label: a,
  q: `${a} official audio song`,
}))

// Indian podcasts (played from YouTube — full episodes, so the player search
// allows long videos). Each chip is a show / category → a YouTube search.
const INDIAN_PODCASTS: { label: string; q: string }[] = [
  { label: 'Trending', q: 'best indian podcast full episode hindi' },
  { label: 'The Ranveer Show', q: 'the ranveer show podcast full episode' },
  { label: 'Raj Shamani', q: 'figuring out with raj shamani podcast full episode' },
  { label: 'WTF · Nikhil Kamath', q: 'wtf is with nikhil kamath podcast episode' },
  { label: 'BeerBiceps', q: 'beerbiceps podcast hindi full episode' },
  { label: 'Dostcast', q: 'dostcast podcast full episode' },
  { label: 'Cyrus Says', q: 'cyrus says podcast ivm full episode' },
  { label: 'The Deshbhakt', q: 'the deshbhakt akash banerjee podcast' },
  { label: 'Sandeep Maheshwari', q: 'sandeep maheshwari podcast full' },
  { label: 'Finance', q: 'paisa vaisa indian finance podcast episode' },
  { label: 'Startups', q: 'indian startup founder podcast full episode' },
  { label: 'Tech', q: 'indian tech podcast full episode hindi' },
  { label: 'Comedy', q: 'indian comedy podcast hindi full episode' },
  { label: 'Spirituality', q: 'indian spirituality podcast hindi episode' },
  { label: 'Hindi Stories', q: 'hindi kahaniyan audio story podcast' },
  { label: 'Cricket', q: 'indian cricket podcast full episode' },
  { label: 'Bollywood Talk', q: 'bollywood celebrity interview podcast hindi' },
  { label: 'Health', q: 'health fitness podcast india hindi episode' },
]

// Colorful tile palette (cycled) for the Browse catalog tiles.
const TILE_COLORS = [
  '#ff2e4c', '#c1121f', '#e63950', '#8e0a1c', '#ff5066', '#a30d28', '#d62246',
  '#ff4d4d', '#b30000', '#ff3b5e', '#7a0915', '#e0213c', '#ff6b6b', '#9b1b30',
  '#cc2b3d', '#ff4060', '#a31530', '#d11a2a', '#ff5a5f', '#bd1e2d', '#820a18',
]

type Station = { name: string; q: string }

// ── Languages — powered by keyless YouTube search, so every catalog is real &
// huge (Indian regional + world). Clicking a tile opens a "station" of songs.
// NOTE on queries: YouTube returns 1–2h compilation videos for phrasings like
// "latest <lang> hit songs 2025" (filtered out as non-songs). Appending
// "official video" / "video song" reliably yields individual tracks (~39/40).
const LANGUAGES: Station[] = [
  { name: 'Hindi / Bollywood', q: 'bollywood hindi hit songs official video' },
  { name: 'Punjabi', q: 'punjabi hit songs official video' },
  { name: 'Tamil', q: 'tamil hit songs official video' },
  { name: 'Telugu', q: 'telugu hit songs official video' },
  { name: 'Bengali', q: 'bengali hit songs official video' },
  { name: 'Marathi', q: 'marathi hit songs official video' },
  { name: 'Gujarati', q: 'gujarati hit songs official video' },
  { name: 'Bhojpuri', q: 'bhojpuri hit songs official video' },
  { name: 'Kannada', q: 'kannada hit songs official video' },
  { name: 'Malayalam', q: 'malayalam hit songs official video' },
  { name: 'English / Pop', q: 'english pop hit songs official video' },
  { name: 'K-Pop', q: 'kpop song official mv' },
  { name: 'Spanish / Latin', q: 'latin reggaeton hit songs official video' },
  { name: 'Arabic', q: 'arabic hit songs official video' },
  { name: 'Japanese', q: 'jpop hit songs official video' },
  { name: 'Korean R&B', q: 'korean rnb song official mv' },
  { name: 'French', q: 'french pop song official video' },
  { name: 'Turkish', q: 'turkish pop song official video' },
  { name: 'Portuguese', q: 'brazilian hit songs official video' },
  { name: 'Afrobeats', q: 'afrobeats hit songs official video' },
  { name: 'Nepali', q: 'nepali hit songs official video' },
  { name: 'Urdu', q: 'coke studio pakistan song' },
]

// ── Genres — also via YouTube so mainstream genres Audius lacks are covered.
const WORLD_GENRES: Station[] = [
  { name: 'Pop', q: 'pop hit songs official video' },
  { name: 'Hip-Hop / Rap', q: 'hip hop rap song official video' },
  { name: 'Rock', q: 'rock song official video' },
  { name: 'EDM / Dance', q: 'edm dance song official video' },
  { name: 'Lo-Fi', q: 'lofi hip hop beats song' },
  { name: 'R&B / Soul', q: 'rnb soul song official video' },
  { name: 'Jazz', q: 'jazz song official audio' },
  { name: 'Classical', q: 'classical music famous piece' },
  { name: 'Metal', q: 'metal song official video' },
  { name: 'Country', q: 'country song official video' },
  { name: 'Indie', q: 'indie song official video' },
  { name: 'Reggae', q: 'reggae song official video' },
  { name: 'Blues', q: 'blues song official audio' },
  { name: 'Funk', q: 'funk song official video' },
  { name: 'Folk', q: 'folk acoustic song official video' },
  { name: 'Disco', q: 'disco song 70s 80s' },
  { name: 'Phonk', q: 'phonk song' },
  { name: 'Synthwave', q: 'synthwave song' },
]

// ── Moods & activities.
const MOODS: Station[] = [
  { name: 'Workout', q: 'workout motivation song official video' },
  { name: 'Chill', q: 'chill song official video' },
  { name: 'Party', q: 'party dance song official video' },
  { name: 'Focus', q: 'study focus song' },
  { name: 'Sleep', q: 'calm acoustic song' },
  { name: 'Romance', q: 'romantic love song official video' },
  { name: 'Sad', q: 'sad song official video' },
  { name: 'Happy', q: 'happy feel good song official video' },
  { name: 'Drive', q: 'long drive song official video' },
  { name: 'Throwback', q: 'throwback 2000s hit song official video' },
  { name: 'Meditation', q: 'meditation calm music' },
  { name: 'Devotional', q: 'devotional bhajan song' },
]

/* ------------------------------------------------------------ navigation */

interface NavValue {
  view: View
  section: string
  query: string
  setQuery: (q: string) => void
  navigate: (v: View, section?: string) => void
  back: () => void
  forward: () => void
  canBack: boolean
  canForward: boolean
}

const NavContext = createContext<NavValue | null>(null)
const useNav = () => {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be inside NavProvider')
  return ctx
}

function sectionForView(v: View): string {
  switch (v.type) {
    case 'home':
      return 'home'
    case 'search':
      return 'browse'
    case 'station':
      return 'browse'
    case 'library':
      return 'song'
    case 'myplaylist':
      return 'playlists'
    case 'shared':
      return 'playlists'
    case 'hindi':
      return 'hindi'
    case 'hollywood':
      return 'hollywood'
    case 'podcasts':
      return 'podcasts'
    case 'radio':
      return 'radio'
    case 'account':
      return 'account'
    default:
      return ''
  }
}

// A shared playlist link looks like https://…/?pl=<id> — open straight into it.
function initialView(): { view: View; section: string } {
  try {
    const pl = new URLSearchParams(window.location.search).get('pl')
    if (pl) return { view: { type: 'shared', id: pl }, section: 'playlists' }
  } catch {
    /* noop */
  }
  return { view: { type: 'home' }, section: 'home' }
}

function NavProvider({ children }: { children: ReactNode }) {
  const start = initialView()
  const [history, setHistory] = useState<View[]>([start.view])
  const [pointer, setPointer] = useState(0)
  const [section, setSection] = useState(start.section)
  const [query, setQuery] = useState('')

  const navigate = (v: View, sec?: string) => {
    setHistory((h) => [...h.slice(0, pointer + 1), v])
    setPointer((p) => p + 1)
    setSection(sec ?? sectionForView(v))
  }
  const back = () =>
    setPointer((p) => {
      const np = Math.max(0, p - 1)
      setSection(sectionForView(history[np]))
      return np
    })
  const forward = () =>
    setPointer((p) => {
      const np = Math.min(history.length - 1, p + 1)
      setSection(sectionForView(history[np]))
      return np
    })

  const value: NavValue = {
    view: history[pointer],
    section,
    query,
    setQuery,
    navigate,
    back,
    forward,
    canBack: pointer > 0,
    canForward: pointer < history.length - 1,
  }
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

/* ----------------------------------------------------- UI panels (player) */

interface UIValue {
  fullscreen: boolean
  setFullscreen: (v: boolean) => void
  queueOpen: boolean
  setQueueOpen: (v: boolean) => void
  fsTab: 'lyrics' | 'queue'
  setFsTab: (t: 'lyrics' | 'queue') => void
  openFullscreen: (tab?: 'lyrics' | 'queue') => void
}

const UIContext = createContext<UIValue | null>(null)
const useUI = () => {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be inside UIProvider')
  return ctx
}

function UIProvider({ children }: { children: ReactNode }) {
  const [fullscreen, setFullscreen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [fsTab, setFsTab] = useState<'lyrics' | 'queue'>('lyrics')
  const openFullscreen = (tab?: 'lyrics' | 'queue') => {
    if (tab) setFsTab(tab)
    setFullscreen(true)
  }
  const value: UIValue = {
    fullscreen,
    setFullscreen,
    queueOpen,
    setQueueOpen,
    fsTab,
    setFsTab,
    openFullscreen,
  }
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

/* --------------------------------------------------------------- visuals */

function Cover({
  src,
  alt,
  className,
}: {
  src?: string
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  // Reset when the artwork changes — persistent Cover instances (player bar,
  // mini player, fullscreen art) are reused across tracks, so without this one
  // broken image would show the placeholder for every later track too.
  useEffect(() => setFailed(false), [src])
  const show = src && !failed
  return (
    <div className={`cover ${className ?? ''}`}>
      {show ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="cover__fallback" aria-hidden>
          <ListMusic size={'38%'} />
        </div>
      )}
    </div>
  )
}

function PlayingBars() {
  return (
    <span className="eq" aria-label="Now playing">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </span>
  )
}

function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state">
      <div className="spinner" />
      <span>{label}…</span>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="state state--error">
      <p>{message}</p>
      <p className="state__hint">Audius nodes can be flaky — try again in a moment.</p>
    </div>
  )
}

function SourceBadge({ source }: { source: Track['source'] }) {
  if (source !== 'youtube') return null
  return (
    <span className="srcbadge" title="Plays from YouTube">
      <Youtube size={11} /> YT
    </span>
  )
}

/* --------------------------------------------------------------- big play */

function BigPlay({ tracks, size = 52 }: { tracks: Track[]; size?: number }) {
  const { playContext, currentTrack, isPlaying, togglePlay, queue } = usePlayer()
  // "Is this button's list the one currently playing?" — compare by content, not
  // just length: a length check mis-fires between two equal-length lists that
  // share the current track, and breaks once autoplay radio grows the queue.
  const isThis =
    !!currentTrack &&
    tracks.length > 0 &&
    tracks.length <= queue.length &&
    tracks.every((t, i) => t.id === queue[i]?.id)
  const active = isThis && isPlaying
  return (
    <button
      className="bigplay"
      style={{ width: size, height: size }}
      disabled={!tracks.length}
      onClick={() => (isThis ? togglePlay() : playContext(tracks))}
      aria-label={active ? 'Pause' : 'Play'}
    >
      {active ? (
        <Pause size={size * 0.42} fill="#fff" />
      ) : (
        <Play size={size * 0.42} fill="#fff" style={{ marginLeft: 2 }} />
      )}
    </button>
  )
}

/* ------------------------------------------------- add-to-playlist menu */

// A "+" button that opens a small popover to add a track to one of your
// playlists (or create a new one on the spot). The menu is rendered with
// position:fixed off the button's rect so it isn't clipped by the scroll area.
function AddToPlaylistButton({
  track,
  className = 'trow__queue',
  iconSize = 15,
}: {
  track: Track
  className?: string
  iconSize?: number
}) {
  const { playlists, createPlaylist, addToPlaylist, inPlaylist } = usePlaylists()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const popRef = useRef<HTMLDivElement>(null)

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const menuW = 252
    const x = Math.min(window.innerWidth - menuW - 12, Math.max(12, r.right - menuW))
    const y = Math.min(window.innerHeight - 340, Math.max(12, r.bottom + 8))
    setPos({ x, y })
    setCreating(false)
    setName('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    // Don't close on scrolls that happen INSIDE the popover's own (scrollable)
    // playlist list — only on page/background scrolls.
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const create = async () => {
    const n = name.trim()
    if (!n) return
    await createPlaylist(n, track)
    setOpen(false)
  }

  return (
    <>
      <button
        className={className}
        onClick={openMenu}
        aria-label="Add to playlist"
        title="Add to playlist"
      >
        <Plus size={iconSize} />
      </button>
      {open && pos && (
        <>
          <div className="pop__scrim" onClick={() => setOpen(false)} />
          <div
            ref={popRef}
            className="pop"
            style={{ left: pos.x, top: pos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pop__title">Add to playlist</div>
            <div className="pop__list">
              {playlists.length === 0 && !creating && (
                <div className="pop__empty">No playlists yet — create one below.</div>
              )}
              {playlists.map((p) => {
                const has = inPlaylist(p.id, track.id)
                return (
                  <button
                    key={p.id}
                    className={`pop__item ${has ? 'is-in' : ''}`}
                    onClick={() => {
                      if (!has) addToPlaylist(p.id, track)
                      setOpen(false)
                    }}
                  >
                    <ListMusic size={14} />
                    <span className="pop__name" title={p.name}>
                      {p.name}
                    </span>
                    {has ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                )
              })}
            </div>
            {creating ? (
              <div className="pop__create">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') create()
                    if (e.key === 'Escape') setCreating(false)
                  }}
                  placeholder="Playlist name"
                  spellCheck={false}
                />
                <button className="pop__addbtn" onClick={create} aria-label="Create playlist">
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <button className="pop__new" onClick={() => setCreating(true)}>
                <Plus size={16} /> New playlist
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}

/* --------------------------------------------------------------- cards */

function TrackCard({ track, context }: { track: Track; context: Track[] }) {
  const { playContext, currentTrack, isPlaying } = usePlayer()
  const isCurrent = currentTrack?.id === track.id
  return (
    <div
      className="card"
      onDoubleClick={() => playContext(context, track.id)}
      onClick={() => {
        if (isCoarsePointer()) playContext(context, track.id)
      }}
    >
      <div className="card__art">
        <Cover src={track.artwork} alt={track.title} />
        {track.source === 'youtube' && (
          <span className="card__src">
            <Youtube size={13} />
          </span>
        )}
        <button
          className={`card__play ${isCurrent && isPlaying ? 'is-current' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            playContext(context, track.id)
          }}
          aria-label={`Play ${track.title}`}
        >
          {isCurrent && isPlaying ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" />}
        </button>
      </div>
      <div className="card__title" title={track.title}>
        {track.title}
      </div>
      <div className="card__sub" title={track.artist}>
        {track.artist}
      </div>
    </div>
  )
}

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const { navigate } = useNav()
  return (
    <div className="card" onClick={() => navigate({ type: 'playlist', id: playlist.id })}>
      <div className="card__art">
        <Cover src={playlist.artwork} alt={playlist.name} />
        <button className="card__play" aria-label={`Open ${playlist.name}`}>
          <Play size={18} fill="#fff" />
        </button>
      </div>
      <div className="card__title" title={playlist.name}>
        {playlist.name}
      </div>
      <div className="card__sub" title={playlist.description || playlist.owner}>
        {playlist.description?.trim() || `By ${playlist.owner}`}
      </div>
    </div>
  )
}

function Section({
  title,
  onShowAll,
  children,
}: {
  title: string
  onShowAll?: () => void
  children: ReactNode
}) {
  return (
    <section className="section">
      <div className="section__head">
        <h2>{title}</h2>
        {onShowAll && (
          <button className="section__all" onClick={onShowAll}>
            Show all
          </button>
        )}
      </div>
      <div className="row">{children}</div>
    </section>
  )
}

/* --------------------------------------------------- track list (details) */

const TrackRow = memo(function TrackRow({
  track,
  index,
  context,
  onRemove,
}: {
  track: Track
  index: number
  context: Track[]
  onRemove?: () => void
}) {
  const { playContext, currentTrack, isPlaying, toggleLike, isLiked, addToQueue } = usePlayer()
  const isCurrent = currentTrack?.id === track.id
  const liked = isLiked(track.id)
  return (
    <div
      className={`trow ${isCurrent ? 'is-current' : ''}`}
      onDoubleClick={() => playContext(context, track.id)}
    >
      <div className="trow__index">
        {isCurrent && isPlaying ? (
          <PlayingBars />
        ) : (
          <>
            <span className="trow__num">{index + 1}</span>
            <button
              className="trow__play"
              onClick={() => playContext(context, track.id)}
              aria-label={`Play ${track.title}`}
            >
              <Play size={13} fill="currentColor" />
            </button>
          </>
        )}
      </div>
      <div
        className="trow__main"
        onClick={() => {
          if (isCoarsePointer()) playContext(context, track.id)
        }}
      >
        <Cover src={track.artwork} alt={track.title} className="trow__art" />
        <div className="trow__meta">
          <div className={`trow__title ${isCurrent ? 'accent' : ''}`} title={track.title}>
            {track.title}
            <SourceBadge source={track.source} />
          </div>
          <div className="trow__artist" title={track.artist}>
            {track.artist}
          </div>
        </div>
      </div>
      <div className="trow__plays">{fmtCount(track.playCount)} plays</div>
      <div className="trow__actions">
        <button
          className="trow__queue"
          onClick={() => addToQueue(track)}
          aria-label="Add to queue"
          title="Add to queue"
        >
          <ListPlus size={15} />
        </button>
        <AddToPlaylistButton track={track} className="trow__queue" />
        <button
          className={`trow__like ${liked ? 'is-liked' : ''}`}
          onClick={() => toggleLike(track)}
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
        </button>
        {onRemove && (
          <button
            className="trow__queue trow__remove"
            onClick={onRemove}
            aria-label="Remove from playlist"
            title="Remove from playlist"
          >
            <X size={15} />
          </button>
        )}
      </div>
      <div className="trow__time">{fmtTime(track.duration)}</div>
    </div>
  )
})

const TLIST_PAGE = 60

function TrackList({
  tracks,
  context,
  onRemove,
}: {
  tracks: Track[]
  context?: Track[]
  onRemove?: (track: Track, index: number) => void
}) {
  const ctx = context ?? tracks
  // Render incrementally: some baked lists are 700+ rows, and mounting them all
  // at once makes opening the view slow and janky. Show a page, then load more
  // as the sentinel scrolls into view.
  const [shown, setShown] = useState(() => Math.min(tracks.length, TLIST_PAGE))
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Reset the window whenever the list itself changes (new lane / view).
  useEffect(() => setShown(Math.min(tracks.length, TLIST_PAGE)), [tracks])

  useEffect(() => {
    if (shown >= tracks.length) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown((s) => Math.min(tracks.length, s + TLIST_PAGE))
        }
      },
      { rootMargin: '800px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown, tracks.length])

  return (
    <div className="tlist">
      <div className="tlist__head">
        <div className="trow__index">#</div>
        <div className="trow__main">Title</div>
        <div className="trow__plays">Plays</div>
        <div className="trow__like"></div>
        <div className="trow__time">
          <Clock3 size={15} />
        </div>
      </div>
      {tracks.slice(0, shown).map((t, i) => (
        <TrackRow
          key={`${t.id}-${i}`}
          track={t}
          index={i}
          context={ctx}
          onRemove={onRemove ? () => onRemove(t, i) : undefined}
        />
      ))}
      {shown < tracks.length && <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />}
    </div>
  )
}

/* ------------------------------------------------------------------ views */

// Compact "Now Playing" card for the Home rail (mirrors the mockup's bottom-right
// card). Reuses the global player state; tapping the art opens the full player.
function HomeNowPlaying() {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    progress,
    duration,
    togglePlay,
    next,
    prev,
    toggleLike,
    isLiked,
  } = usePlayer()
  const { setFullscreen } = useUI()
  const t = currentTrack
  const dur = duration || t?.duration || 0
  const liked = t ? isLiked(t.id) : false

  return (
    <div className="hmnow">
      <button
        className="hmnow__art"
        onClick={() => t && setFullscreen(true)}
        disabled={!t}
        aria-label="Open full player"
      >
        <Cover src={t?.artworkLarge || t?.artwork} alt={t?.title || ''} />
      </button>
      <div className="hmnow__meta">
        <span className="hmnow__title" title={t?.title}>
          {t?.title || 'Nothing playing'}
        </span>
        <span className="hmnow__artist" title={t?.artist}>
          {t?.artist || 'Pick a song to start'}
        </span>
      </div>
      <div className="hmnow__bar">
        <span style={{ width: dur ? `${Math.min(100, (progress / dur) * 100)}%` : '0%' }} />
      </div>
      <div className="hmnow__ctrls">
        <button className="pbtn" onClick={prev} disabled={!t} aria-label="Previous">
          <SkipBack size={18} fill="currentColor" />
        </button>
        <button
          className="hmnow__play"
          onClick={togglePlay}
          disabled={!t}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isBuffering ? (
            <span className="spinner spinner--sm" />
          ) : isPlaying ? (
            <Pause size={20} fill="#0f1115" />
          ) : (
            <Play size={20} fill="#0f1115" style={{ marginLeft: 2 }} />
          )}
        </button>
        <button className="pbtn" onClick={next} disabled={!t} aria-label="Next">
          <SkipForward size={18} fill="currentColor" />
        </button>
        <button
          className={`pbtn ${liked ? 'on' : ''}`}
          onClick={() => t && toggleLike(t)}
          disabled={!t}
          aria-label="Like"
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
}

function HomeView() {
  const { navigate, setQuery } = useNav()
  const { playContext, toggleLike, isLiked, currentTrack, isPlaying, togglePlay, recent, getStats } =
    usePlayer()
  const [stats] = useState(() => getStats())
  const [trending, setTrending] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    ;(async () => {
      // Primary feed = Audius trending (free + unlimited). If every node is down
      // or it returns nothing, fall back to a YouTube "popular" feed so Home
      // always has music instead of an error.
      let tracks: Track[] = []
      try {
        tracks = await fetchTrending()
      } catch {
        /* fall through to YouTube */
      }
      if (cancelled) return
      if (!tracks.length) {
        try {
          // 1-unit videos.list?chart=mostPopular feed (no 100-unit search).
          tracks = await fetchPopular()
        } catch {
          /* ignore */
        }
        if (cancelled) return
      }
      if (!tracks.length) {
        setErr('Could not load music right now.')
        setLoading(false)
        return
      }
      setTrending(tracks)
      setLoading(false)
      // Popular playlists are an Audius-only bonus row — best-effort, never blocks.
      fetchTrendingPlaylists()
        .then((p) => !cancelled && setPlaylists(p))
        .catch(() => {})
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <Loading label="Loading your music" />
  if (err && !trending.length) return <ErrorState message={err} />

  const hero = trending[0]
  const heroLiked = hero ? isLiked(hero.id) : false
  const heroPlaying = !!hero && currentTrack?.id === hero.id && isPlaying
  const albums = trending.slice(1, 5)
  const listRows = trending.slice(0, 8)

  return (
    <div className="view home">
      <div className="home__grid">
        <div className="home__main">
          {hero && (
            <section className="hmhero">
              <div
                className="hmhero__img"
                style={{ backgroundImage: `url(${hero.artworkLarge || hero.artwork})` }}
                aria-hidden
              />
              <div className="hmhero__veil" />
              <div className="hmhero__content">
                <span className="hmhero__eyebrow">
                  <Disc3 size={14} /> Featured today
                </span>
                <h1 className="hmhero__title" title={hero.title}>
                  {hero.title}
                </h1>
                <div className="hmhero__stats">
                  <span>{trending.length} Songs</span>
                  <span className="hmhero__dot" />
                  <span>{fmtCount(hero.favoriteCount)} Favorites</span>
                  <span className="hmhero__dot" />
                  <span>{fmtCount(hero.playCount)} Plays</span>
                </div>
                <p className="hmhero__desc">
                  {hero.genre ? `${hero.genre} · ` : ''}A fresh mix of what&rsquo;s trending on Synapz
                  right now — hand-picked from {hero.artist} and more. Hit play to dive in.
                </p>
                <div className="hmhero__actions">
                  <button
                    className="hmhero__play"
                    onClick={() => (heroPlaying ? togglePlay() : playContext(trending, hero.id))}
                  >
                    {heroPlaying ? (
                      <Pause size={18} fill="#fff" />
                    ) : (
                      <Play size={18} fill="#fff" style={{ marginLeft: 2 }} />
                    )}
                    {heroPlaying ? 'Pause' : 'Play Now'}
                  </button>
                  <button
                    className={`hmhero__like ${heroLiked ? 'on' : ''}`}
                    onClick={() => toggleLike(hero)}
                    aria-label={heroLiked ? 'Unlike' : 'Like'}
                  >
                    <Heart size={18} fill={heroLiked ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>
            </section>
          )}

          <div className="sub-head">
            <h3>Top Albums</h3>
            <button className="section__all" onClick={() => navigate({ type: 'search' }, 'browse')}>
              Show all
            </button>
          </div>
          <div className="hmtop">
            {albums.map((t) => (
              <TrackCard key={t.id} track={t} context={trending} />
            ))}
          </div>

          {recent.length > 0 && (
            <Section title="Jump back in" onShowAll={() => navigate({ type: 'library' }, 'song')}>
              {recent.slice(0, 10).map((t) => (
                <TrackCard key={t.id} track={t} context={recent} />
              ))}
            </Section>
          )}

          {stats.topArtists.length > 0 && (
            <div className="section">
              <div className="section__head">
                <h2>Your top artists</h2>
              </div>
              <div className="artist-chips">
                {stats.topArtists.slice(0, 8).map((a) => (
                  <button
                    className="artist-chip"
                    key={a.artist}
                    onClick={() => {
                      setQuery(a.artist)
                      navigate({ type: 'search' }, 'browse')
                    }}
                  >
                    <span className="artist-chip__name">{a.artist}</span>
                    <span className="artist-chip__count">{a.count} plays</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {playlists.length > 0 && (
            <Section
              title="Popular playlists"
              onShowAll={() => navigate({ type: 'search' }, 'browse')}
            >
              {playlists.slice(0, 10).map((p) => (
                <PlaylistCard key={p.id} playlist={p} />
              ))}
            </Section>
          )}
        </div>

        <aside className="home__side">
          <section className="hmpl">
            <div className="hmpl__head">
              <h3>Play Lists</h3>
              <button className="section__all" onClick={() => navigate({ type: 'search' }, 'browse')}>
                More
              </button>
            </div>
            <div className="hmpl__list">
              {listRows.map((t, i) => {
                const cur = currentTrack?.id === t.id
                return (
                  <button
                    key={t.id}
                    className={`plrow ${cur ? 'is-current' : ''}`}
                    onClick={() => (cur ? togglePlay() : playContext(trending, t.id))}
                  >
                    <span className="plrow__num">{String(i + 1).padStart(2, '0')}</span>
                    <Cover src={t.artwork} alt={t.title} className="plrow__art" />
                    <span className="plrow__meta">
                      <b title={t.title}>{t.title}</b>
                      <i title={t.artist}>{t.artist}</i>
                    </span>
                    <span className="plrow__play" aria-hidden>
                      {cur && isPlaying ? (
                        <Pause size={15} fill="#fff" />
                      ) : (
                        <Play size={15} fill="#fff" style={{ marginLeft: 1 }} />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
          <HomeNowPlaying />
        </aside>
      </div>
    </div>
  )
}

function GenreView({ genre, name }: { genre: string; name: string }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    fetchTrending(genre || undefined)
      .then((t) => !cancelled && setTracks(t))
      .catch(() => !cancelled && setErr('Could not load this genre.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [genre])

  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--genre">
          <Radio size={56} />
        </div>
        <div className="phead__meta">
          <span className="phead__type">Station · This week</span>
          <h1 className="phead__title">{name}</h1>
          <p className="phead__sub">{tracks.length} trending tracks</p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
          </div>
        </div>
      </header>
      {loading ? <Loading /> : err ? <ErrorState message={err} /> : <TrackList tracks={tracks} />}
    </div>
  )
}

// A labeled grid of colorful category tiles; each opens a YouTube "station".
function CategoryGrid({ title, list, offset = 0 }: { title: string; list: Station[]; offset?: number }) {
  const { navigate } = useNav()
  return (
    <div className="section">
      <div className="section__head">
        <h2>{title}</h2>
      </div>
      <div className="tilegrid">
        {list.map((s, i) => (
          <button
            key={s.name}
            className="tile"
            style={{ background: TILE_COLORS[(i + offset) % TILE_COLORS.length] }}
            onClick={() => navigate({ type: 'station', q: s.q, name: s.name }, 'browse')}
          >
            <span>{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function MobileSearchField() {
  const { query, setQuery } = useNav()
  return (
    <label className="msearch">
      <SearchIcon size={18} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search or paste a Spotify link"
        spellCheck={false}
      />
      {query && (
        <button className="msearch__clear" onClick={() => setQuery('')} aria-label="Clear search">
          <X size={16} />
        </button>
      )}
    </label>
  )
}

// Paste a Spotify playlist/album/track link → read its songs, match each to a
// playable version from our sources (YouTube/Audius), and play. Spotify audio
// itself is licensed and can't be streamed, so we play matched versions.
function ImportView({ url }: { url: string }) {
  const { playTrack, appendToContext } = usePlayer()
  const [data, setData] = useState<SpotifyImport | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'importing' | 'done' | 'error'>(
    'loading',
  )
  const [error, setError] = useState('')
  const [matched, setMatched] = useState(0)
  const [scanned, setScanned] = useState(0)
  const cancelRef = useRef(false)

  useEffect(() => {
    cancelRef.current = false
    setStatus('loading')
    setData(null)
    setError('')
    setMatched(0)
    setScanned(0)
    fetchSpotifyImport(url)
      .then((d) => {
        if (cancelRef.current) return
        setData(d)
        setStatus('ready')
      })
      .catch((e) => {
        if (cancelRef.current) return
        setError(String(e?.message || e))
        setStatus('error')
      })
    return () => {
      cancelRef.current = true
    }
  }, [url])

  const start = async () => {
    if (!data) return
    setStatus('importing')
    setMatched(0)
    setScanned(0)
    const refs = data.tracks
    const results: (Track | null | undefined)[] = new Array(refs.length).fill(undefined)
    let appendIdx = 0
    let started = false
    const flush = () => {
      while (appendIdx < results.length && results[appendIdx] !== undefined) {
        const t = results[appendIdx]
        if (t) {
          if (!started) {
            started = true
            playTrack(t, [t])
          } else {
            appendToContext([t])
          }
          setMatched((m) => m + 1)
        }
        appendIdx++
      }
    }
    let i = 0
    const worker = async () => {
      while (i < refs.length && !cancelRef.current) {
        const idx = i++
        const resolved = (await resolveTrack(refs[idx])) ?? null
        if (cancelRef.current) return // bailed out mid-resolve — don't touch playback
        results[idx] = resolved
        setScanned((s) => s + 1)
        flush()
      }
    }
    // resolve a few at a time so playback starts fast and the queue fills in order
    await Promise.all([worker(), worker(), worker(), worker()])
    if (!cancelRef.current) setStatus('done')
  }

  if (status === 'loading')
    return (
      <div className="import import--state">
        <span className="spinner" />
        <p>Reading the Spotify link…</p>
      </div>
    )
  if (status === 'error' || !data)
    return (
      <div className="import import--state">
        <p className="import__err">{error || 'Could not read that link.'}</p>
        <p className="import__errsub">Public Spotify playlist, album or track links only.</p>
      </div>
    )

  const total = data.tracks.length
  const pct = total ? Math.round((scanned / total) * 100) : 0
  return (
    <div className="import">
      <div className="import__head">
        {data.image ? (
          <img className="import__img" src={data.image} alt="" />
        ) : (
          <div className="import__img import__img--ph">
            <ListMusic size={30} />
          </div>
        )}
        <div className="import__info">
          <span className="import__src">
            <span className="import__dot" /> Spotify {data.kind}
          </span>
          <h1 className="import__name" title={data.name}>
            {data.name}
          </h1>
          <span className="import__count">
            {data.total} song{data.total === 1 ? '' : 's'}
            {data.total > total ? ` · importing first ${total}` : ''}
          </span>
          {status === 'ready' && (
            <button className="import__cta" onClick={start}>
              <Play size={17} fill="#0f1115" /> Import &amp; Play
            </button>
          )}
          {(status === 'importing' || status === 'done') && (
            <div className="import__prog">
              <div className="import__bar">
                <span style={{ width: `${status === 'done' ? 100 : pct}%` }} />
              </div>
              <span className="import__progtxt">
                {status === 'done'
                  ? `✓ Added ${matched} of ${total} songs to your queue`
                  : `Matching… ${scanned}/${total} · ${matched} added`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="import__list">
        {data.tracks.slice(0, 80).map((t, i) => (
          <div className="import__row" key={i}>
            <span className="import__rownum">{i + 1}</span>
            <span className="import__rowmeta">
              <b title={t.title}>{t.title}</b>
              <i title={t.artist}>{t.artist}</i>
            </span>
          </div>
        ))}
        {data.tracks.length > 80 && (
          <div className="import__more">+ {data.tracks.length - 80} more</div>
        )}
      </div>
    </div>
  )
}

function SearchView() {
  const { query, navigate } = useNav()
  const [tracks, setTracks] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [yt, setYt] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()
    // A pasted Spotify link is handled by <ImportView>, not normal search.
    if (!q || parseSpotifyUrl(q)) {
      setTracks([])
      setPlaylists([])
      setYt([])
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    const id = setTimeout(() => {
      const audius = Promise.all([searchTracks(q), searchPlaylists(q)])
        .then(([t, p]) => {
          if (cancelled) return
          setTracks(t)
          setPlaylists(p)
        })
        .catch(() => {})
      const ytp = searchYT(q)
        .then((r) => !cancelled && setYt(r))
        .catch(() => !cancelled && setYt([]))
      Promise.all([audius, ytp]).finally(() => !cancelled && setLoading(false))
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [query])

  const spotify = parseSpotifyUrl(query.trim())
  if (spotify) {
    return (
      <div className="view">
        <MobileSearchField />
        <ImportView key={query.trim()} url={query.trim()} />
      </div>
    )
  }

  if (!query.trim()) {
    return (
      <div className="view">
        <MobileSearchField />
        <div className="head-block">
          <div className="head-block__text">
            <span className="eyebrow">Explore · every language &amp; genre</span>
            <h1 className="big-title">Browse all</h1>
          </div>
        </div>
        <div className="section">
          <div className="section__head">
            <h2>Top Charts</h2>
          </div>
          <div className="tilegrid">
            {CHARTS.map((c, i) => (
              <button
                key={c.name}
                className="tile"
                style={{ background: TILE_COLORS[(i * 3) % TILE_COLORS.length] }}
                onClick={() => navigate({ type: 'genre', genre: c.genre, name: c.name }, 'browse')}
              >
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
        <CategoryGrid title="Languages" list={LANGUAGES} offset={0} />
        <CategoryGrid title="Genres" list={WORLD_GENRES} offset={7} />
        <CategoryGrid title="Moods &amp; activities" list={MOODS} offset={3} />
        <div className="section">
          <div className="section__head">
            <h2>Stations on Audius</h2>
          </div>
          <div className="tilegrid">
            {GENRES.map((g) => (
              <button
                key={g.genre}
                className="tile"
                style={{ background: g.color }}
                onClick={() => navigate({ type: 'genre', genre: g.genre, name: g.name }, 'browse')}
              >
                <span>{g.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const nothing = !loading && !tracks.length && !playlists.length && !yt.length

  return (
    <div className="view">
      <MobileSearchField />
      <div className="head-block">
        <div className="head-block__text">
          <span className="eyebrow">Results for</span>
          <h1 className="big-title">{query}</h1>
        </div>
      </div>

      {loading ? (
        <Loading label="Searching" />
      ) : nothing ? (
        <div className="state">
          <p>No results found.</p>
        </div>
      ) : (
        <>
          {yt.length > 0 && (
            <>
              <div className="sub-head">
                <h3>From YouTube</h3>
                <span className="src-pill">
                  <Youtube size={13} /> Full catalog
                </span>
              </div>
              <TrackList tracks={yt.slice(0, 12)} />
            </>
          )}
          {tracks.length > 0 && (
            <>
              <div className="sub-head">
                <h3>From Audius</h3>
              </div>
              <TrackList tracks={tracks.slice(0, 8)} />
            </>
          )}
          {playlists.length > 0 && (
            <Section title="Playlists">
              {playlists.slice(0, 10).map((p) => (
                <PlaylistCard key={p.id} playlist={p} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function HindiView() {
  // chip 0 = "All"; chips 1.. map to HINDI_CHIPS[chip-1].
  const [chip, setChip] = useState(0)
  const [live, setLive] = useState<Track[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Baked, ZERO-QUOTA catalog: "All" shows the whole list, each chip filters by
  // category. Songs play through the IFrame by id — no YouTube search needed.
  const baked = useMemo<Track[]>(
    () => (chip === 0 ? BOLLYWOOD_TRACKS : bollywoodByCategory(HINDI_CHIPS[chip - 1].label)),
    [chip],
  )
  const useLive = chip !== 0 && baked.length < 6

  useEffect(() => {
    setErr(null)
    setLive(null)
    if (!useLive) {
      setLoading(false)
      return
    }
    // Rare fallback: a lane with too few baked songs → one (cached) live search.
    let cancelled = false
    const q = HINDI_CHIPS[chip - 1].q
    setLoading(true)
    searchYT(q)
      .then((r) => !cancelled && setLive(r))
      .catch(async () => {
        try {
          const a = await searchTracks(
            q.replace(/\b(songs?|latest|2025|slowed reverb|hits)\b/gi, '').trim() || 'hindi',
          )
          if (!cancelled) setLive(a)
        } catch {
          if (!cancelled) {
            setErr('Could not load this lane.')
            setLive([])
          }
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [chip, useLive])

  const tracks = useLive ? live ?? [] : baked

  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--hindi">
          <Clapperboard size={56} />
        </div>
        <div className="phead__meta">
          <span className="phead__type">Made for India</span>
          <h1 className="phead__title">Bollywood &amp; Hindi</h1>
          <p className="phead__sub">
            {BOLLYWOOD_TRACKS.length}+ songs ready instantly — old &amp; new, streaming free. No
            waiting, no limits.
          </p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
          </div>
        </div>
      </header>

      <div className="chips">
        <button className={`chip ${chip === 0 ? 'active' : ''}`} onClick={() => setChip(0)}>
          All
        </button>
        {HINDI_CHIPS.map((c, i) => (
          <button
            key={c.label}
            className={`chip ${chip === i + 1 ? 'active' : ''}`}
            onClick={() => setChip(i + 1)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading label="Loading Hindi songs" />
      ) : err ? (
        <ErrorState message={err} />
      ) : !tracks.length ? (
        <div className="state">
          <p>No songs found for this lane.</p>
        </div>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  )
}

// Hollywood / English songs — same baked + live-fallback pattern as HindiView,
// but chips are ARTISTS and "All" spans the whole catalog.
function HollywoodView() {
  // chip 0 = "All"; chips 1.. map to HOLLYWOOD_CHIPS[chip-1] (one per artist).
  const [chip, setChip] = useState(0)
  const [live, setLive] = useState<Track[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const baked = useMemo<Track[]>(
    () => (chip === 0 ? HOLLYWOOD_TRACKS : hollywoodByArtist(HOLLYWOOD_CHIPS[chip - 1].label)),
    [chip],
  )
  const useLive = chip !== 0 && baked.length < 6

  useEffect(() => {
    setErr(null)
    setLive(null)
    if (!useLive) {
      setLoading(false)
      return
    }
    // Fallback for a thin artist lane → one (cached) live search.
    let cancelled = false
    const q = HOLLYWOOD_CHIPS[chip - 1].q
    setLoading(true)
    searchYT(q)
      .then((r) => !cancelled && setLive(r))
      .catch(async () => {
        try {
          const a = await searchTracks(HOLLYWOOD_CHIPS[chip - 1].label)
          if (!cancelled) setLive(a)
        } catch {
          if (!cancelled) {
            setErr('Could not load this artist.')
            setLive([])
          }
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [chip, useLive])

  const tracks = useLive ? live ?? [] : baked

  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--hollywood">
          <Film size={56} />
        </div>
        <div className="phead__meta">
          <span className="phead__type">English · Global</span>
          <h1 className="phead__title">Hollywood &amp; English</h1>
          <p className="phead__sub">
            {HOLLYWOOD_TRACKS.length}+ songs across {HOLLYWOOD_ARTISTS.length} artists — pop, rock,
            hip-hop &amp; more, streaming free. Pick an artist below.
          </p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
          </div>
        </div>
      </header>

      <div className="chips">
        <button className={`chip ${chip === 0 ? 'active' : ''}`} onClick={() => setChip(0)}>
          All
        </button>
        {HOLLYWOOD_CHIPS.map((c, i) => (
          <button
            key={c.label}
            className={`chip ${chip === i + 1 ? 'active' : ''}`}
            onClick={() => setChip(i + 1)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading label="Loading songs" />
      ) : err ? (
        <ErrorState message={err} />
      ) : !tracks.length ? (
        <div className="state">
          <p>No songs found for this artist.</p>
        </div>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  )
}

// Indian podcasts — full episodes streamed from YouTube. Same chip pattern as
// HindiView, but the search allows long videos (10 min – 5 h) so it returns
// whole episodes instead of dropping them as "too long".
function PodcastsView() {
  // chip 0 = "All"; chips 1.. map to INDIAN_PODCASTS[chip-1].
  const [chip, setChip] = useState(0)
  const [live, setLive] = useState<Track[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Baked, ZERO-QUOTA catalog: "All" shows every episode, each chip filters by
  // show. Episodes play through the IFrame by id — no YouTube search needed.
  const baked = useMemo<Track[]>(
    () => (chip === 0 ? PODCAST_TRACKS : podcastsByCategory(INDIAN_PODCASTS[chip - 1].label)),
    [chip],
  )
  const useLive = chip !== 0 && baked.length < 6

  useEffect(() => {
    setErr(null)
    setLive(null)
    if (!useLive) {
      setLoading(false)
      return
    }
    // Rare fallback: a show with too few baked episodes → one (cached) live search.
    let cancelled = false
    const q = INDIAN_PODCASTS[chip - 1].q
    setLoading(true)
    searchYT(q, { minSec: 600, maxSec: 60 * 60 * 5 })
      .then((r) => !cancelled && setLive(r))
      .catch(() => {
        if (!cancelled) {
          setErr('Could not load this show.')
          setLive([])
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [chip, useLive])

  const tracks = useLive ? live ?? [] : baked

  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--podcast">
          <Podcast size={56} />
        </div>
        <div className="phead__meta">
          <span className="phead__type">Talk &amp; audio</span>
          <h1 className="phead__title">Indian Podcasts</h1>
          <p className="phead__sub">
            {PODCAST_TRACKS.length}+ full episodes from India&rsquo;s top shows — ready instantly,
            streaming free.
          </p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
          </div>
        </div>
      </header>

      <div className="chips">
        <button className={`chip ${chip === 0 ? 'active' : ''}`} onClick={() => setChip(0)}>
          All
        </button>
        {INDIAN_PODCASTS.map((c, i) => (
          <button
            key={c.label}
            className={`chip ${chip === i + 1 ? 'active' : ''}`}
            onClick={() => setChip(i + 1)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading label="Loading podcasts" />
      ) : err ? (
        <ErrorState message={err} />
      ) : !tracks.length ? (
        <div className="state">
          <p>No episodes found for this show.</p>
        </div>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  )
}

// Live internet radio — always-on SomaFM stations streamed through the audio
// element. 0 quota, no search.
function RadioView() {
  const { playTrack, currentTrack, isPlaying } = usePlayer()
  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--genre">
          <Radio size={56} />
        </div>
        <div className="phead__meta">
          <span className="phead__type">Live radio</span>
          <h1 className="phead__title">Radio</h1>
          <p className="phead__sub">
            Always-on, commercial-free stations — streaming live via SomaFM.
          </p>
        </div>
      </header>
      <div className="radiogrid">
        {RADIO_STATIONS.map((s) => {
          const cur = currentTrack?.id === s.id
          return (
            <button
              key={s.id}
              className={`radiocard ${cur ? 'is-current' : ''}`}
              onClick={() => playTrack(s, [s])}
            >
              <Cover src={s.artwork} alt={s.title} className="radiocard__art" />
              <span className="radiocard__meta">
                <b title={s.title}>{s.title}</b>
                <i title={s.artist}>{s.artist}</i>
              </span>
              <span className="radiocard__play" aria-hidden>
                {cur && isPlaying ? (
                  <Pause size={16} fill="#fff" />
                ) : (
                  <Play size={16} fill="#fff" style={{ marginLeft: 1 }} />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Generic "station" — one YouTube search query rendered as a track list. Powers
// every language / genre / mood tile on the Browse page (keyless yt-dlp search,
// with an Audius fallback so it still works if the dev helper is down).
function StationView({ q, name }: { q: string; name: string }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setErr(null)
    // Baked, ZERO-QUOTA catalog first. Sparse stations (long-mix genres like
    // Lo-Fi / Sleep / Focus) fall through to a live search like before.
    const baked = stationByName(name)
    if (baked.length >= 8) {
      setTracks(baked)
      setLoading(false)
      return () => {
        cancelled = true
      }
    }
    setLoading(true)
    setTracks([])
    // Plain-text query for Audius (strip YouTube-specific search words).
    const audiusQ =
      q.replace(/\b(official|video|mv|audio|hit|songs?|latest|2024|2025|playlist)\b/gi, '').trim() ||
      name
    searchYT(q)
      .then(async (r) => {
        if (cancelled) return
        // Thin YouTube yield (e.g. Lo-Fi / Meditation return long mixes that get
        // filtered) — supplement with Audius so the station still feels full.
        if (r.length >= 8) {
          setTracks(r)
          return
        }
        try {
          const a = await searchTracks(audiusQ)
          if (!cancelled) {
            const seen = new Set(r.map((t) => t.id))
            setTracks([...r, ...a.filter((t) => !seen.has(t.id))].slice(0, 40))
          }
        } catch {
          if (!cancelled) setTracks(r)
        }
      })
      .catch(async () => {
        try {
          const a = await searchTracks(audiusQ)
          if (!cancelled) setTracks(a)
        } catch {
          if (!cancelled) setErr('Could not load. Make sure the dev server (npm run dev) is running.')
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [q, name])

  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--genre">
          <Disc3 size={56} />
        </div>
        <div className="phead__meta">
          <span className="phead__type">
            Station <span className="src-pill"><Youtube size={13} /> Full catalog</span>
          </span>
          <h1 className="phead__title">{name}</h1>
          <p className="phead__sub">{tracks.length ? `${tracks.length} songs` : 'Streaming free via YouTube'}</p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
          </div>
        </div>
      </header>
      {loading ? (
        <Loading label={`Loading ${name}`} />
      ) : err ? (
        <ErrorState message={err} />
      ) : !tracks.length ? (
        <div className="state">
          <p>No songs found for this station.</p>
        </div>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  )
}

function PlaylistView({ id }: { id: string }) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    setPlaylist(null)
    setTracks([])
    Promise.all([fetchPlaylist(id), fetchPlaylistTracks(id)])
      .then(([p, t]) => {
        if (cancelled) return
        setPlaylist(p)
        setTracks(t)
      })
      .catch(() => !cancelled && setErr('Could not load this playlist.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <Loading label="Loading playlist" />
  if (err) return <ErrorState message={err} />

  const totalSec = tracks.reduce((a, t) => a + t.duration, 0)

  return (
    <div className="view">
      <header className="phead">
        <Cover src={playlist?.artworkLarge} alt={playlist?.name ?? ''} className="phead__cover" />
        <div className="phead__meta">
          <span className="phead__type">Playlist</span>
          <h1 className="phead__title">{playlist?.name}</h1>
          {playlist?.description && <p className="phead__desc">{playlist.description}</p>}
          <p className="phead__sub">
            <strong>{playlist?.owner}</strong> · {tracks.length} songs ·{' '}
            {Math.round(totalSec / 60)} min
          </p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
          </div>
        </div>
      </header>
      <TrackList tracks={tracks} />
    </div>
  )
}

// One of your own playlists (create / rename / delete / remove songs). Backed by
// PlaylistsProvider — synced to Supabase when signed in, local otherwise.
// Share toggles for a playlist you own: public link + collaborative, with a
// copyable link. Cloud-only (needs sign-in so the playlist lives in Supabase).
function ShareControls({ pl }: { pl: UserPlaylist }) {
  const { setShare } = usePlaylists()
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/?pl=${pl.id}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      /* clipboard may be blocked; the field is selectable as a fallback */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  if (!user) {
    return (
      <div className="share share--off">
        <Share2 size={15} /> Sign in to share this playlist or make it collaborative.
      </div>
    )
  }
  return (
    <div className="share">
      <label className="share__opt">
        <span>
          <Link2 size={15} /> Public link <i>Anyone with the link can listen</i>
        </span>
        <span className="switch">
          <input
            type="checkbox"
            checked={pl.isPublic}
            onChange={(e) => setShare(pl.id, { isPublic: e.target.checked })}
          />
          <span className="switch__sl" />
        </span>
      </label>
      <label className="share__opt">
        <span>
          <Users size={15} /> Collaborative <i>Signed-in friends can add songs</i>
        </span>
        <span className="switch">
          <input
            type="checkbox"
            checked={pl.isCollaborative}
            onChange={(e) => setShare(pl.id, { isCollaborative: e.target.checked })}
          />
          <span className="switch__sl" />
        </span>
      </label>
      {(pl.isPublic || pl.isCollaborative) && (
        <div className="share__link">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn-solid" onClick={copy}>
            {copied ? (
              <>
                <Check size={15} /> Copied
              </>
            ) : (
              <>
                <Copy size={15} /> Copy link
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

function MyPlaylistView({ id }: { id: string }) {
  const { getPlaylist, renamePlaylist, deletePlaylist, removeFromPlaylist } = usePlaylists()
  const { navigate } = useNav()
  const pl = getPlaylist(id)
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(pl?.name || '')

  useEffect(() => {
    setNameVal(pl?.name || '')
  }, [pl?.name])

  if (!pl) {
    return (
      <div className="view">
        <div className="state">
          <p>This playlist doesn&rsquo;t exist anymore.</p>
          <button className="btn-follow" onClick={() => navigate({ type: 'home' }, 'home')}>
            Back home
          </button>
        </div>
      </div>
    )
  }

  const totalSec = pl.tracks.reduce((a, t) => a + t.duration, 0)
  const save = () => {
    const n = nameVal.trim()
    if (n && n !== pl.name) renamePlaylist(pl.id, n)
    setEditing(false)
  }
  const remove = () => {
    deletePlaylist(pl.id)
    navigate({ type: 'home' }, 'home')
  }

  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--mine">
          <ListMusic size={64} />
        </div>
        <div className="phead__meta">
          <span className="phead__type">Playlist</span>
          {editing ? (
            <div className="acct-edit">
              <input
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') setEditing(false)
                }}
                spellCheck={false}
              />
              <button className="btn-solid" onClick={save}>
                Save
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setEditing(false)
                  setNameVal(pl.name)
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="phead__title">
              {pl.name}
              <button
                className="acct-editbtn"
                onClick={() => setEditing(true)}
                aria-label="Rename playlist"
              >
                <Pencil size={16} />
              </button>
            </h1>
          )}
          <p className="phead__sub">
            <strong>You</strong> · {pl.tracks.length} song{pl.tracks.length === 1 ? '' : 's'}
            {pl.tracks.length ? ` · ${Math.round(totalSec / 60)} min` : ''}
          </p>
          <div className="phead__actions">
            <BigPlay tracks={pl.tracks} />
            <button className="btn-del" onClick={remove} title="Delete playlist">
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      </header>
      <ShareControls pl={pl} />
      {pl.tracks.length ? (
        <TrackList tracks={pl.tracks} onRemove={(t) => removeFromPlaylist(pl.id, t.id)} />
      ) : (
        <div className="state">
          <p>This playlist is empty. Add songs with the + button on any track.</p>
          <button className="btn-follow" onClick={() => navigate({ type: 'search' }, 'browse')}>
            Find songs to add
          </button>
        </div>
      )}
    </div>
  )
}

// Inline search to add songs to a collaborative playlist you don't own.
function SharedAddBox({
  playlistId,
  onAdded,
}: {
  playlistId: string
  onAdded: (t: Track) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const search = async () => {
    const query = q.trim()
    if (!query) return
    setLoading(true)
    try {
      const [yt, au] = await Promise.all([
        searchYT(query).catch(() => [] as Track[]),
        searchTracks(query).catch(() => [] as Track[]),
      ])
      const seen = new Set<string>()
      const merged = [...yt, ...au].filter((t) => t.id && !seen.has(t.id) && seen.add(t.id))
      setResults(merged.slice(0, 8))
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="shadd">
      <div className="shadd__bar">
        <SearchIcon size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Search songs to add…"
          spellCheck={false}
        />
        <button className="btn-solid" onClick={search}>
          Search
        </button>
      </div>
      {loading && <Loading label="Searching" />}
      {results.map((t) => (
        <div className="shadd__row" key={t.id}>
          <Cover src={t.artwork} alt={t.title} className="shadd__art" />
          <span className="shadd__meta">
            <b title={t.title}>{t.title}</b>
            <i title={t.artist}>{t.artist}</i>
          </span>
          <button
            className="shadd__add"
            onClick={() => {
              cloudAddToPlaylist(playlistId, t)
              onAdded(t)
            }}
            aria-label="Add to playlist"
          >
            <Plus size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

// Public/collaborative playlist opened from a share link (?pl=<id>). Anyone can
// view + play; signed-in users can add songs if it's collaborative.
function SharedPlaylistView({ id }: { id: string }) {
  const { navigate } = useNav()
  const { user } = useAuth()
  const { createPlaylist, addToPlaylist } = usePlaylists()
  const [data, setData] = useState<{
    playlist: { name: string; is_collaborative?: boolean }
    tracks: Track[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    setData(null)
    setSaved(false)
    cloudFetchPublicPlaylist(id)
      .then((d) => {
        if (cancelled) return
        if (!d) setErr('This playlist is private or no longer shared.')
        else setData(d)
      })
      .catch(() => !cancelled && setErr('Could not load this playlist.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <Loading label="Loading shared playlist" />
  if (err || !data)
    return (
      <div className="view">
        <div className="state">
          <p>{err || 'Playlist not found.'}</p>
          <button className="btn-follow" onClick={() => navigate({ type: 'home' }, 'home')}>
            Go home
          </button>
        </div>
      </div>
    )

  const { playlist, tracks } = data
  const collab = !!playlist.is_collaborative
  const saveCopy = async () => {
    const newId = await createPlaylist(`${playlist.name} (copy)`)
    for (const t of tracks) addToPlaylist(newId, t)
    setSaved(true)
  }

  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--mine">
          {collab ? <Users size={56} /> : <ListMusic size={64} />}
        </div>
        <div className="phead__meta">
          <span className="phead__type">{collab ? 'Collaborative playlist' : 'Shared playlist'}</span>
          <h1 className="phead__title">{playlist.name}</h1>
          <p className="phead__sub">
            {tracks.length} song{tracks.length === 1 ? '' : 's'} · shared with you
          </p>
          <div className="phead__actions">
            <BigPlay tracks={tracks} />
            <button className="btn-del" onClick={saveCopy} disabled={saved}>
              {saved ? (
                <>
                  <Check size={15} /> Saved to your library
                </>
              ) : (
                <>
                  <Plus size={15} /> Save a copy
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {collab && user && (
        <div className="section">
          <div className="section__head">
            <h2>Add to this playlist</h2>
          </div>
          <SharedAddBox
            playlistId={id}
            onAdded={(t) =>
              setData((d) =>
                d
                  ? { ...d, tracks: d.tracks.some((x) => x.id === t.id) ? d.tracks : [...d.tracks, t] }
                  : d,
              )
            }
          />
        </div>
      )}
      {collab && !user && (
        <div className="state">
          <p>Sign in to add songs to this collaborative playlist.</p>
        </div>
      )}

      {tracks.length ? (
        <TrackList tracks={tracks} />
      ) : (
        <div className="state">
          <p>This playlist is empty so far.</p>
        </div>
      )}
    </div>
  )
}

function LibraryView() {
  const { liked } = usePlayer()
  const { navigate } = useNav()
  return (
    <div className="view">
      <header className="phead">
        <div className="phead__cover phead__cover--liked">
          <Heart size={64} fill="#fff" />
        </div>
        <div className="phead__meta">
          <span className="phead__type">Playlist</span>
          <h1 className="phead__title">Liked Songs</h1>
          <p className="phead__sub">
            <strong>You</strong> · {liked.length} songs
          </p>
          <div className="phead__actions">
            <BigPlay tracks={liked} />
          </div>
        </div>
      </header>
      {liked.length ? (
        <TrackList tracks={liked} />
      ) : (
        <div className="state">
          <p>Songs you like will appear here.</p>
          <button className="btn-follow" onClick={() => navigate({ type: 'search' }, 'browse')}>
            Find something to like
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- dashboard */

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className={`stat ${accent ? 'stat--accent' : ''}`}>
      <span className="stat__icon">{icon}</span>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  )
}

// Accent-colour picker. Persists to localStorage; applied app-wide via a
// [data-accent] attribute on <html> (theme.css overrides the accent tokens).
function ThemePicker() {
  const [accent, setAccent] = useState(() => {
    try {
      return localStorage.getItem('synapz:accent') || 'crimson'
    } catch {
      return 'crimson'
    }
  })
  const pick = (key: string) => {
    setAccent(key)
    try {
      localStorage.setItem('synapz:accent', key)
    } catch {
      /* noop */
    }
    applyAccent(key)
  }
  return (
    <section className="section">
      <div className="section__head">
        <h2>Accent colour</h2>
      </div>
      <div className="themepick">
        {THEMES.map((t) => (
          <button
            key={t.key}
            className={`themedot ${accent === t.key ? 'on' : ''}`}
            style={{ background: t.color }}
            onClick={() => pick(t.key)}
            aria-label={t.name}
            title={t.name}
          >
            {accent === t.key && <Check size={16} />}
          </button>
        ))}
      </div>
    </section>
  )
}

// Animated background ("vibe") picker — a mood/genre WebGL backdrop. Off by default.
function VibePicker() {
  const { vibe, setVibe } = useVibe()
  return (
    <section className="section">
      <div className="section__head">
        <h2>Vibe background</h2>
      </div>
      <div className="vibegrid">
        {VIBES.map((v) => (
          <button
            key={v.key}
            className={`vibecard ${vibe.key === v.key ? 'on' : ''} ${
              v.key === 'off' ? 'vibecard--off' : ''
            }`}
            onClick={() => setVibe(v.key)}
            style={
              v.key === 'off'
                ? undefined
                : {
                    backgroundImage: `linear-gradient(135deg, ${v.colors[0]}, ${v.colors[1]} 55%, ${v.colors[2]})`,
                  }
            }
            title={v.name}
          >
            <span className="vibecard__emoji">{v.emoji}</span>
            <span className="vibecard__name">{v.name}</span>
          </button>
        ))}
      </div>
      <p style={{ marginTop: 10, fontSize: 13, color: 'var(--muted-foreground)' }}>
        An animated 3D-style backdrop that matches your mood. Off by default; it uses the GPU
        lightly and pauses when the window is hidden.
      </p>
    </section>
  )
}

// Discord Rich Presence controls — desktop app only (renders nothing on web).
// Toggles the "Listening to Synapz Music" status and surfaces the live
// connection state reported by the Electron main process.
function DiscordSettings() {
  const [enabled, setEnabled] = useState(() => discordEnabled())
  const [status, setStatus] = useState<DiscordStatus | null>(null)

  useEffect(() => {
    if (!isDesktop()) return
    let live = true
    const poll = () => getDiscordStatus().then((s) => live && s && setStatus(s))
    poll()
    const iv = setInterval(poll, 4000)
    return () => {
      live = false
      clearInterval(iv)
    }
  }, [])

  if (!isDesktop()) return null

  const toggle = () => {
    const v = !enabled
    setEnabled(v)
    setDiscordEnabled(v)
  }

  const state = !status?.configured
    ? { dot: '#e0a30b', text: 'No Discord Application ID set — see the setup notes' }
    : status.connected
      ? { dot: '#1db954', text: 'Connected to Discord' }
      : { dot: '#8a8a92', text: 'Waiting for Discord — is the desktop app running?' }

  return (
    <section className="section">
      <div className="section__head">
        <h2>Discord presence</h2>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            flex: '0 0 auto',
            background: enabled ? state.dot : '#5a5a62',
          }}
        />
        <span style={{ flex: 1, color: 'var(--muted-foreground)' }}>
          {enabled ? state.text : 'Turned off'}
        </span>
        <button className={enabled ? 'btn-solid' : 'btn-ghost'} onClick={toggle}>
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
      <p style={{ marginTop: 10, fontSize: 13, color: 'var(--muted-foreground)' }}>
        Shows “Listening to Synapz Music” with album art and a progress bar on your Discord
        profile while a song plays. Requires the Discord desktop app to be running.
      </p>
    </section>
  )
}

// Cross-device listening history (cloud play_history). Signed-in only.
function CloudHistory() {
  const { user } = useAuth()
  const { playContext } = usePlayer()
  const [tracks, setTracks] = useState<Track[]>([])

  useEffect(() => {
    if (!user) {
      setTracks([])
      return
    }
    let cancelled = false
    cloudFetchHistory(40)
      .then((t) => !cancelled && setTracks(t))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user?.email])

  if (!user || !tracks.length) return null
  return (
    <section className="section">
      <div className="section__head">
        <h2>Listening history</h2>
        <span className="section__all">across your devices</span>
      </div>
      <TrackList tracks={tracks} context={tracks} />
      <button
        className="btn-ghost"
        style={{ marginTop: 10 }}
        onClick={() => playContext(tracks, tracks[0]?.id)}
      >
        <Play size={14} fill="currentColor" /> Play all
      </button>
    </section>
  )
}

// Back up / restore the whole library (liked songs + playlists) as a JSON file.
// Works for everyone — no account needed — and re-imports merge (never duplicate).
function LibraryTransfer() {
  const { liked, toggleLike, isLiked } = usePlayer()
  const { playlists, createPlaylist, addToPlaylist } = usePlaylists()
  const [status, setStatus] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportLib = () => {
    const data = {
      app: 'synapz-music',
      version: 1,
      liked,
      playlists: playlists.map((p) => ({ name: p.name, tracks: p.tracks })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `synapz-library-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importLib = async (file: File) => {
    setStatus('Importing…')
    try {
      const data = JSON.parse(await file.text())
      const lk: Track[] = Array.isArray(data.liked) ? data.liked : []
      let songs = 0
      for (const t of lk) {
        if (t && t.id && !isLiked(t.id)) {
          toggleLike(t)
          songs++
        }
      }
      let pls = 0
      const incoming = Array.isArray(data.playlists) ? data.playlists : []
      for (const p of incoming) {
        if (!p?.name || !Array.isArray(p.tracks)) continue
        const id = await createPlaylist(String(p.name))
        for (const t of p.tracks) if (t?.id) addToPlaylist(id, t)
        pls++
      }
      setStatus(
        `Imported ${songs} liked song${songs === 1 ? '' : 's'} and ${pls} playlist${
          pls === 1 ? '' : 's'
        }.`,
      )
    } catch {
      setStatus('Could not read that file — make sure it’s a Synapz export.')
    }
  }

  return (
    <section className="section">
      <div className="section__head">
        <h2>Library backup</h2>
      </div>
      <div className="libxfer">
        <button className="btn-solid libxfer__btn" onClick={exportLib}>
          <Download size={16} /> Export
        </button>
        <button className="btn-ghost libxfer__btn" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importLib(f)
            e.target.value = ''
          }}
        />
        {status && <span className="libxfer__status">{status}</span>}
      </div>
    </section>
  )
}

function AccountView() {
  const { user, logout, rename } = useAuth()
  const { liked, recent, getStats, playContext } = usePlayer()
  const { navigate, setQuery } = useNav()
  const [stats, setStats] = useState(() => getStats())
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(user?.name || '')

  // Refresh while the page is open so the live listening timer ticks.
  useEffect(() => {
    const iv = setInterval(() => setStats(getStats()), 1000)
    return () => clearInterval(iv)
  }, [getStats])

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '—'
  const fav = stats.topSongs[0]
  const weekMax = Math.max(1, ...stats.week.map((d) => d.sec))
  const weekTotal = stats.week.reduce((a, d) => a + d.sec, 0)

  const saveName = async () => {
    const n = nameVal.trim()
    if (n && n !== user?.name) {
      try {
        await rename(n)
      } catch {
        /* ignore */
      }
    }
    setEditing(false)
  }

  const goArtist = (artist: string) => {
    setQuery(artist)
    navigate({ type: 'search' }, 'browse')
  }

  return (
    <div className="view">
      <header className="acct-head">
        {user?.picture ? (
          <img className="acct-avatar" src={user.picture} alt={user.name} />
        ) : (
          <span className="acct-avatar acct-avatar--initials">{initials}</span>
        )}
        <div className="acct-meta">
          <span className="eyebrow">Profile</span>
          {editing ? (
            <div className="acct-edit">
              <input
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                spellCheck={false}
              />
              <button className="btn-solid" onClick={saveName}>
                Save
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setEditing(false)
                  setNameVal(user?.name || '')
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="acct-name">
              {user?.name}
              <button className="acct-editbtn" onClick={() => setEditing(true)} aria-label="Edit name">
                <Pencil size={15} />
              </button>
            </h1>
          )}
          <div className="acct-tags">
            <span className="acct-tag">
              <Mail size={12} /> {user?.email}
            </span>
            <span className="acct-tag">via {user?.provider === 'google' ? 'Google' : 'Guest'}</span>
            <span className="acct-tag">Member since {memberSince}</span>
          </div>
        </div>
        <div className="acct-actions">
          <button
            className="btn-ghost"
            onClick={() => {
              logout()
              navigate({ type: 'home' }, 'home')
            }}
          >
            <LogOut size={15} /> Log out
          </button>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard icon={<Headphones size={18} />} label="Listening time" value={fmtDuration(stats.listenedSec)} accent />
        <StatCard icon={<Play size={16} fill="currentColor" />} label="Songs played" value={stats.totalPlays} />
        <StatCard icon={<ListMusic size={18} />} label="Unique tracks" value={stats.uniqueTracks} />
        <StatCard icon={<Heart size={18} />} label="Liked songs" value={liked.length} />
      </div>

      <ThemePicker />

      <VibePicker />

      <DiscordSettings />

      <CloudHistory />

      <LibraryTransfer />

      {fav && (
        <section className="section">
          <div className="section__head">
            <h2>Your favourite song</h2>
          </div>
          <button className="fav" onClick={() => playContext([fav.track], fav.track.id)}>
            <Cover src={fav.track.artwork} alt={fav.track.title} className="fav__art" />
            <div className="fav__meta">
              <span className="fav__title">
                {fav.track.title}
                <SourceBadge source={fav.track.source} />
              </span>
              <span className="fav__sub">{fav.track.artist}</span>
              <span className="fav__count">
                <TrendingUp size={13} /> Played {fav.count} time{fav.count > 1 ? 's' : ''}
              </span>
            </div>
            <span className="fav__play">
              <Play size={20} fill="#fff" />
            </span>
          </button>
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <h2>This week</h2>
          <span className="section__all">{fmtDuration(weekTotal)} listened</span>
        </div>
        <div className="weekchart">
          {stats.week.map((d, i) => (
            <div className="weekbar" key={i} title={fmtDuration(d.sec)}>
              <div className="weekbar__track">
                <div
                  className="weekbar__fill"
                  style={{ height: `${Math.round((d.sec / weekMax) * 100)}%` }}
                />
              </div>
              <span className="weekbar__label">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {stats.topSongs.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Top songs</h2>
          </div>
          <div className="tlist">
            {stats.topSongs.map((x, i) => (
              <div
                className="trow"
                key={x.track.id}
                onDoubleClick={() => playContext([x.track], x.track.id)}
              >
                <div className="trow__index">
                  <span className="trow__num">{i + 1}</span>
                  <button
                    className="trow__play"
                    onClick={() => playContext([x.track], x.track.id)}
                    aria-label="Play"
                  >
                    <Play size={13} fill="currentColor" />
                  </button>
                </div>
                <div className="trow__main">
                  <Cover src={x.track.artwork} alt={x.track.title} className="trow__art" />
                  <div className="trow__meta">
                    <div className="trow__title">{x.track.title}</div>
                    <div className="trow__artist">{x.track.artist}</div>
                  </div>
                </div>
                <div className="trow__plays">{x.count} plays</div>
                <div className="trow__like"></div>
                <div className="trow__time">{fmtTime(x.track.duration)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats.topArtists.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Top artists</h2>
          </div>
          <div className="artist-chips">
            {stats.topArtists.map((a) => (
              <button className="artist-chip" key={a.artist} onClick={() => goArtist(a.artist)}>
                <span className="artist-chip__name">{a.artist}</span>
                <span className="artist-chip__count">{a.count} plays</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <Section title="Recently played">
          {recent.slice(0, 10).map((t) => (
            <TrackCard key={t.id} track={t} context={recent} />
          ))}
        </Section>
      )}

      {stats.totalPlays === 0 && (
        <div className="state">
          <p>Start playing songs and your stats will appear here.</p>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- sidebar */

function NavItem({
  icon: Icon,
  label,
  active,
  badge,
  dot,
  onClick,
}: {
  icon: typeof Home
  label: string
  active: boolean
  badge?: string
  dot?: boolean
  onClick: () => void
}) {
  return (
    <button className={`navitem ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={20} />
      <span className="navitem__label">{label}</span>
      {badge && <span className="navitem__badge">{badge}</span>}
      {dot && <span className="navitem__dot" />}
    </button>
  )
}

function Sidebar() {
  const { section, navigate, query, setQuery, view } = useNav()
  const { user, logout, openAuth } = useAuth()
  const { playlists, createPlaylist } = usePlaylists()
  const [creating, setCreating] = useState(false)
  const [plName, setPlName] = useState('')

  const onSearchChange = (v: string) => {
    setQuery(v)
    if (view.type !== 'search') navigate({ type: 'search' }, 'browse')
  }

  const submitCreate = async () => {
    const n = plName.trim()
    setPlName('')
    setCreating(false)
    if (!n) return
    const id = await createPlaylist(n)
    navigate({ type: 'myplaylist', id })
  }

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className="sidebar">
      <div className="brand">
        <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden>
          <defs>
            <linearGradient id="brand-g" x1="8" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ff3b4e" />
              <stop offset="1" stopColor="#b00d22" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="32" fill="url(#brand-g)" />
          <g
            stroke="#0f1115"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="#0f1115"
          >
            <path d="M24 26 L20.5 18.5" opacity="0.9" />
            <path d="M42 24 L46 16" opacity="0.9" />
            <path d="M14 41 L24 26 L33 35 L42 24 L50 31" fill="none" />
            <circle cx="14" cy="41" r="3.6" />
            <circle cx="24" cy="26" r="4" />
            <circle cx="33" cy="35" r="3.4" />
            <circle cx="42" cy="24" r="4" />
            <circle cx="50" cy="31" r="3.6" />
          </g>
        </svg>
        <span className="brand__name">Synapz</span>
        <button className="brand__collapse" aria-label="Collapse">
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="search">
        <SearchIcon size={16} />
        <input
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search or paste a Spotify link"
          spellCheck={false}
        />
      </div>

      <div className="menu-label">
        <span>Menu</span>
        <span className="menu-label__n">6</span>
        <MoreHorizontal size={15} />
      </div>
      <nav className="nav">
        <NavItem icon={Home} label="Home" active={section === 'home'} onClick={() => navigate({ type: 'home' }, 'home')} />
        <NavItem
          icon={Clapperboard}
          label="Bollywood"
          badge="new"
          active={section === 'hindi'}
          onClick={() => navigate({ type: 'hindi' }, 'hindi')}
        />
        <NavItem
          icon={Film}
          label="Hollywood"
          badge="new"
          active={section === 'hollywood'}
          onClick={() => navigate({ type: 'hollywood' }, 'hollywood')}
        />
        <NavItem icon={LayoutGrid} label="Browse" active={section === 'browse'} onClick={() => { setQuery(''); navigate({ type: 'search' }, 'browse') }} />
        <NavItem
          icon={Podcast}
          label="Podcasts"
          active={section === 'podcasts'}
          onClick={() => navigate({ type: 'podcasts' }, 'podcasts')}
        />
        <NavItem
          icon={Radio}
          label="Radio"
          active={section === 'radio'}
          onClick={() => navigate({ type: 'radio' }, 'radio')}
        />
      </nav>

      <div className="menu-label">
        <span>Library</span>
        <span className="menu-label__n">3</span>
        <MoreHorizontal size={15} />
      </div>
      <nav className="nav">
        <NavItem
          icon={Disc3}
          label="Albums"
          dot
          active={section === 'albums'}
          onClick={() => { setQuery(''); navigate({ type: 'search' }, 'albums') }}
        />
        <NavItem icon={Music2} label="Song" active={section === 'song'} onClick={() => navigate({ type: 'library' }, 'song')} />
        <NavItem icon={Users} label="Artists" active={section === 'artists'} onClick={() => { setQuery(''); navigate({ type: 'search' }, 'artists') }} />
      </nav>

      <div className="menu-label">
        <span>Playlists</span>
        <button
          className="menu-label__add"
          onClick={() => setCreating((v) => !v)}
          aria-label="Create playlist"
          title="Create playlist"
        >
          <Plus size={15} />
        </button>
      </div>
      {creating && (
        <div className="sb-create">
          <input
            autoFocus
            value={plName}
            onChange={(e) => setPlName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate()
              if (e.key === 'Escape') {
                setCreating(false)
                setPlName('')
              }
            }}
            placeholder="Playlist name"
            spellCheck={false}
          />
          <button className="sb-create__ok" onClick={submitCreate} aria-label="Create playlist">
            <Check size={15} />
          </button>
        </div>
      )}
      <nav className="nav sb-pls">
        {playlists.length === 0 && !creating && (
          <button className="sb-pls__empty" onClick={() => setCreating(true)}>
            <Plus size={15} /> New playlist
          </button>
        )}
        {playlists.map((p) => (
          <button
            key={p.id}
            className={`navitem navitem--pl ${
              view.type === 'myplaylist' && view.id === p.id ? 'active' : ''
            }`}
            onClick={() => navigate({ type: 'myplaylist', id: p.id })}
          >
            <ListMusic size={18} />
            <span className="navitem__label" title={p.name}>
              {p.name}
            </span>
            <span className="navitem__count">{p.tracks.length}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__spacer" />

      {!isDesktop() && (
        <a
          className="sb-getapp"
          href="https://github.com/crusheR-058/SynapzStudio/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          title="Download the Synapz Music desktop app (Windows & macOS)"
        >
          <Download size={16} />
          <span>Get the desktop app</span>
        </a>
      )}

      {user ? (
        <div className={`profile ${section === 'account' ? 'active' : ''}`}>
          <button
            className="profile__main"
            onClick={() => navigate({ type: 'account' }, 'account')}
            title="Open your profile & stats"
          >
            {user.picture ? (
              <img className="profile__avatar profile__avatar--img" src={user.picture} alt={user.name} />
            ) : (
              <span className="profile__avatar">{initials}</span>
            )}
            <span className="profile__meta">
              <span className="profile__name">{user.name || 'Guest'}</span>
              <span className="profile__role">{user.provider === 'google' ? 'Google account' : 'Guest account'}</span>
            </span>
          </button>
          <button
            className="profile__logout"
            onClick={() => {
              logout()
              navigate({ type: 'home' }, 'home')
            }}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        <div className="authcta">
          <button className="authcta__signup" onClick={() => openAuth('signup')}>
            <UserPlus size={16} /> Sign up
          </button>
          <button className="authcta__login" onClick={() => openAuth('login')}>
            <LogIn size={16} /> Log in
          </button>
        </div>
      )}
    </aside>
  )
}

/* ----------------------------------------------------------- now playing */

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted || volume === 0) return <VolumeX size={16} />
  if (volume < 34) return <Volume size={16} />
  if (volume < 67) return <Volume1 size={16} />
  return <Volume2 size={16} />
}

/* ---------------------------------------------------- lyrics (synced) */

function LyricsPanel({ karaoke = false }: { karaoke?: boolean }) {
  const { currentTrack, progress, seek } = usePlayer()
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [roman, setRoman] = useState(false)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])
  const trackId = currentTrack?.id

  useEffect(() => {
    if (!currentTrack) {
      setLyrics(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setLyrics(null)
    fetchLyrics(currentTrack).then((l) => {
      if (!cancelled) {
        setLyrics(l)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId])

  const synced = lyrics?.synced || null
  const activeIdx = synced ? activeLineIndex(synced, progress) : -1
  const hasHindi = synced
    ? synced.some((l) => hasDevanagari(l.text))
    : hasDevanagari(lyrics?.plain || '')
  const tx = (s: string) => (roman ? romanize(s) : s)

  useEffect(() => {
    if (activeIdx < 0) return
    lineRefs.current[activeIdx]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIdx])

  if (!currentTrack) return <div className="lyrics lyrics--empty">Nothing playing.</div>
  if (loading)
    return (
      <div className="lyrics lyrics--empty">
        <span className="spinner" />
      </div>
    )
  if (lyrics?.instrumental)
    return <div className="lyrics lyrics--empty">🎵 This track is instrumental.</div>
  if (!lyrics) return <div className="lyrics lyrics--empty">No lyrics found for this track.</div>

  const romanBtn = hasHindi ? (
    <button
      className={`lyrics__roman ${roman ? 'on' : ''}`}
      onClick={() => setRoman((r) => !r)}
      title="Show Hindi lyrics in English letters"
    >
      {roman ? 'Hindi' : 'Romanize'}
    </button>
  ) : null

  if (synced) {
    return (
      <div className={`lyrics lyrics--synced ${karaoke ? 'lyrics--karaoke' : ''}`}>
        {romanBtn}
        {synced.map((line, i) => (
          <p
            key={i}
            ref={(el) => {
              lineRefs.current[i] = el
            }}
            className={`lyrics__line ${i === activeIdx ? 'is-active' : ''} ${
              i < activeIdx ? 'is-past' : ''
            }`}
            onClick={() => seek(line.time)}
            title="Jump to this line"
          >
            {tx(line.text) || '♪'}
          </p>
        ))}
        <div className="lyrics__src">Lyrics via lrclib.net</div>
      </div>
    )
  }
  return (
    <div className="lyrics lyrics--plain">
      {romanBtn}
      {(roman ? romanize(lyrics.plain!) : lyrics.plain!).split('\n').map((ln, i) => (
        <p key={i} className="lyrics__line lyrics__line--plain">
          {ln || ' '}
        </p>
      ))}
      <div className="lyrics__src">Lyrics via lrclib.net · not time-synced</div>
    </div>
  )
}

/* ---------------------------------------------------------- queue panel */

function QueueRow({
  track,
  playing,
  draggable,
  onPlay,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  track: Track
  playing?: boolean
  draggable?: boolean
  onPlay?: () => void
  onRemove?: () => void
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
}) {
  return (
    <div
      className={`qrow ${playing ? 'is-playing' : ''} ${draggable ? 'qrow--drag' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={onPlay}
    >
      {draggable && (
        <span className="qrow__grip" aria-hidden>
          <GripVertical size={14} />
        </span>
      )}
      <Cover src={track.artwork} alt={track.title} className="qrow__art" />
      <div className="qrow__meta">
        <div className="qrow__title" title={track.title}>
          {track.title}
        </div>
        <div className="qrow__artist" title={track.artist}>
          {track.artist}
        </div>
      </div>
      {playing ? (
        <PlayingBars />
      ) : (
        <div className="qrow__actions">
          {onPlay && (
            <button className="qrow__btn" onClick={onPlay} aria-label="Play now">
              <Play size={13} fill="currentColor" />
            </button>
          )}
          {onRemove && (
            <button className="qrow__btn" onClick={onRemove} aria-label="Remove from queue">
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function QueueList() {
  const {
    currentTrack,
    queue,
    index,
    userQueue,
    playUpNext,
    removeFromQueue,
    moveInQueue,
    clearQueue,
  } = usePlayer()
  const dragIdx = useRef<number | null>(null)
  const contextNext = queue.slice(index + 1)

  if (!currentTrack && !userQueue.length && !contextNext.length)
    return <div className="queuepanel__empty">Your queue is empty. Play something to begin.</div>

  return (
    <>
      {currentTrack && (
        <>
          <div className="queuepanel__label">Now playing</div>
          <QueueRow track={currentTrack} playing />
        </>
      )}
      {userQueue.length > 0 && (
        <>
          <div className="queuepanel__label">
            <span>Next in queue</span>
            <button className="link" onClick={clearQueue}>
              <ListX size={13} /> Clear
            </button>
          </div>
          {userQueue.map((t, i) => (
            <QueueRow
              key={`u-${t.id}-${i}`}
              track={t}
              draggable
              onPlay={() => playUpNext('user', i)}
              onRemove={() => removeFromQueue(i)}
              onDragStart={() => (dragIdx.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx.current !== null && dragIdx.current !== i)
                  moveInQueue(dragIdx.current, i)
                dragIdx.current = null
              }}
            />
          ))}
        </>
      )}
      {contextNext.length > 0 && (
        <>
          <div className="queuepanel__label">
            <span>Next up</span>
          </div>
          {contextNext.map((t, i) => (
            <QueueRow
              key={`c-${t.id}-${i}`}
              track={t}
              onPlay={() => playUpNext('context', index + 1 + i)}
            />
          ))}
        </>
      )}
    </>
  )
}

function QueuePanel() {
  const { queueOpen, setQueueOpen } = useUI()
  if (!queueOpen) return null
  return (
    <aside className="queuepanel">
      <div className="queuepanel__head">
        <h3>
          <ListMusic size={16} /> Queue
        </h3>
        <button className="dots" onClick={() => setQueueOpen(false)} aria-label="Close queue">
          <X size={16} />
        </button>
      </div>
      <div className="queuepanel__scroll">
        <QueueList />
      </div>
    </aside>
  )
}

/* ------------------------------------------------- playback extras menu */

function ExtrasMenu({ onClose }: { onClose: () => void }) {
  const {
    rate,
    setRate,
    crossfade,
    setCrossfade,
    sleep,
    setSleepMinutes,
    setSleepEndOfTrack,
    clearSleep,
    canTuneAudio,
    autoplay,
    setAutoplay,
  } = usePlayer()
  const ref = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!sleep.endsAt) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [sleep.endsAt])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // Ignore clicks anywhere in the .extras wrapper (which holds BOTH this menu
      // and its toggle button) — otherwise clicking the toggle to close would
      // fire this close, then the button's onClick would re-open it.
      const wrap = ref.current?.parentElement ?? ref.current
      if (wrap && !wrap.contains(e.target as Node)) onClose()
    }
    // defer so the opening click doesn't immediately close it
    const id = setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const sleepActive = !!sleep.endsAt || sleep.endOfTrack
  const remain = sleep.endsAt ? Math.max(0, Math.round((sleep.endsAt - now) / 1000)) : 0
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

  return (
    <div className="exmenu" ref={ref}>
      <div className="exmenu__sec">
        <div className="exmenu__title">
          <span>
            <Radio size={14} /> Autoplay radio
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(e) => setAutoplay(e.target.checked)}
            />
            <span className="switch__sl" />
          </label>
        </div>
        <div className="exmenu__note">Keep playing similar songs when the queue ends.</div>
      </div>

      <div className="exmenu__sec">
        <div className="exmenu__title">
          <span>
            <Moon size={14} /> Sleep timer
          </span>
          {sleepActive && (
            <button className="link" onClick={clearSleep}>
              Turn off
            </button>
          )}
        </div>
        {sleep.endsAt ? (
          <div className="exmenu__note">Pausing in {fmtTime(remain)}</div>
        ) : sleep.endOfTrack ? (
          <div className="exmenu__note">Pausing at end of track</div>
        ) : (
          <div className="chips">
            {[5, 10, 15, 30, 45, 60].map((m) => (
              <button key={m} className="exchip" onClick={() => setSleepMinutes(m)}>
                {m} min
              </button>
            ))}
            <button className="exchip" onClick={setSleepEndOfTrack}>
              End of track
            </button>
          </div>
        )}
      </div>

      <div className="exmenu__sec">
        <div className="exmenu__title">
          <span>
            <Gauge size={14} /> Playback speed
          </span>
          <span className="exmenu__val">{rate}×</span>
        </div>
        <div className="chips">
          {speeds.map((s) => (
            <button
              key={s}
              className={`exchip ${rate === s ? 'on' : ''}`}
              onClick={() => setRate(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className={`exmenu__sec ${!canTuneAudio ? 'exmenu__sec--locked' : ''}`}>
        <div className="exmenu__title">
          <span>Crossfade</span>
          <span className="exmenu__val">{crossfade ? `${crossfade}s` : 'Off'}</span>
        </div>
        <input
          className="range range--ex"
          type="range"
          min={0}
          max={12}
          step={1}
          value={crossfade}
          disabled={!canTuneAudio}
          onChange={(e) => setCrossfade(Number(e.target.value))}
          style={fill((crossfade / 12) * 100)}
          aria-label="Crossfade seconds"
        />
      </div>

      {!canTuneAudio && (
        <div className="exmenu__locked">
          <Lock size={13} />
          <span>
            Crossfade works on <b>Audius</b> tracks. YouTube songs (Bollywood, podcasts, radio
            &amp; most search results) play through YouTube&rsquo;s own player, which doesn&rsquo;t
            let apps adjust the sound.
          </span>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------ full-screen now playing */

// Audio-reactive bars for the full-screen player. Uses the real Web Audio
// analyser for Audius / yt-dlp tracks; falls back to a procedural animation for
// YouTube-IFrame tracks (whose audio isn't exposed to Web Audio).
// Procedural bar visualizer for the full-screen player. Deliberately does NOT tap
// the audio graph (createMediaElementSource taints cross-origin streams and can
// silence Audius / radio), so it's purely a motion effect synced to play/pause.
function Visualizer() {
  const { isPlaying } = usePlayer()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | undefined>(undefined)
  const playingRef = useRef(isPlaying)
  playingRef.current = isPlaying

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const BARS = 32
    const phase = Array.from({ length: BARS }, (_, i) => i * 0.4)
    let t = 0
    const render = () => {
      rafRef.current = requestAnimationFrame(render)
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      t += playingRef.current ? 0.09 : 0.012
      const bw = w / BARS
      for (let i = 0; i < BARS; i++) {
        const v = playingRef.current
          ? (Math.sin(t + phase[i]) * 0.5 + 0.5) * (0.55 + 0.45 * Math.sin(t * 0.5 + i)) * 0.85 + 0.06
          : 0.04
        const bh = Math.max(2, Math.min(1, v) * h)
        const grad = ctx.createLinearGradient(0, h, 0, h - bh)
        grad.addColorStop(0, '#b00d22')
        grad.addColorStop(1, '#ff5066')
        ctx.fillStyle = grad
        ctx.fillRect(i * bw + bw * 0.18, h - bh, bw * 0.64, bh)
      }
    }
    render()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return <canvas ref={canvasRef} className="viz" width={560} height={84} aria-hidden />
}

function NowPlaying() {
  const { fullscreen, setFullscreen, fsTab, setFsTab } = useUI()
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    progress,
    duration,
    togglePlay,
    next,
    prev,
    seek,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    isLiked,
    volume,
    muted,
    setVolume,
    toggleMute,
  } = usePlayer()
  const [extrasOpen, setExtrasOpen] = useState(false)
  const [karaoke, setKaraoke] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, setFullscreen])

  if (!fullscreen) return null
  const t = currentTrack
  const dur = duration || t?.duration || 0
  const liked = t ? isLiked(t.id) : false

  return (
    <div className="nowfs">
      <div
        className="nowfs__bg"
        style={{ backgroundImage: t ? `url(${t.artworkLarge || t.artwork})` : undefined }}
      />
      <div className="nowfs__top">
        <span className="nowfs__src">Now playing</span>
        <button className="pbtn" onClick={() => setFullscreen(false)} aria-label="Exit full screen">
          <Minimize2 size={18} />
        </button>
      </div>
      <div className="nowfs__body">
        <div className="nowfs__left">
          <Cover
            src={t?.artworkLarge || t?.artwork || ''}
            alt={t?.title || ''}
            className="nowfs__art"
          />
          <div className="nowfs__meta">
            <h1 title={t?.title}>{t?.title || 'Nothing playing'}</h1>
            <p>{t?.artist}</p>
          </div>
          <div className="nowfs__seek">
            <span>{fmtTime(progress)}</span>
            <input
              className="range"
              type="range"
              min={0}
              max={dur || 0}
              step={0.5}
              value={Math.min(progress, dur || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              style={fill(dur ? (progress / dur) * 100 : 0)}
              aria-label="Seek"
            />
            <span>{fmtTime(dur)}</span>
          </div>
          <div className="nowfs__controls">
            <button
              className={`pbtn ${shuffle ? 'on' : ''}`}
              onClick={toggleShuffle}
              aria-label="Shuffle"
            >
              <Shuffle size={18} />
            </button>
            <button className="pbtn" onClick={prev} aria-label="Previous">
              <SkipBack size={22} fill="currentColor" />
            </button>
            <button
              className="pplay pplay--lg"
              onClick={togglePlay}
              disabled={!t}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isBuffering ? (
                <span className="spinner spinner--sm" />
              ) : isPlaying ? (
                <Pause size={24} fill="#0f1115" />
              ) : (
                <Play size={24} fill="#0f1115" style={{ marginLeft: 2 }} />
              )}
            </button>
            <button className="pbtn" onClick={next} aria-label="Next">
              <SkipForward size={22} fill="currentColor" />
            </button>
            <button
              className={`pbtn ${repeat !== 'off' ? 'on' : ''}`}
              onClick={cycleRepeat}
              aria-label="Repeat"
            >
              {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>
          <div className="nowfs__sub">
            <button
              className={`pbtn ${liked ? 'on' : ''}`}
              disabled={!t}
              onClick={() => t && toggleLike(t)}
              aria-label="Like"
            >
              <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
            </button>
            <button className="pbtn" onClick={toggleMute} aria-label="Mute">
              <VolumeIcon volume={volume} muted={muted} />
            </button>
            <input
              className="range range--vol"
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              style={fill(muted ? 0 : volume)}
              aria-label="Volume"
            />
            <div className="extras">
              <button
                className={`pbtn ${extrasOpen ? 'on' : ''}`}
                onClick={() => setExtrasOpen((o) => !o)}
                aria-label="Playback settings"
                title="Sleep timer, speed & crossfade"
              >
                <SlidersHorizontal size={18} />
              </button>
              {extrasOpen && <ExtrasMenu onClose={() => setExtrasOpen(false)} />}
            </div>
          </div>
          <Visualizer />
        </div>
        <div className="nowfs__right">
          <div className="nowfs__tabs">
            <button className={fsTab === 'lyrics' ? 'on' : ''} onClick={() => setFsTab('lyrics')}>
              <Mic2 size={15} /> Lyrics
            </button>
            <button className={fsTab === 'queue' ? 'on' : ''} onClick={() => setFsTab('queue')}>
              <ListMusic size={15} /> Queue
            </button>
            {fsTab === 'lyrics' && (
              <button
                className={`nowfs__kar ${karaoke ? 'on' : ''}`}
                onClick={() => setKaraoke((k) => !k)}
                title="Karaoke mode — big centred lyrics"
              >
                Karaoke
              </button>
            )}
          </div>
          <div className="nowfs__panel">
            {fsTab === 'lyrics' ? (
              <LyricsPanel karaoke={karaoke} />
            ) : (
              <div className="queuepanel__scroll">
                <QueueList />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Player() {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    progress,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
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
  } = usePlayer()
  const { setFullscreen, queueOpen, setQueueOpen, openFullscreen } = useUI()
  const [extrasOpen, setExtrasOpen] = useState(false)

  // Desktop app: this bar *is* the taskbar hover preview — the shell crops the
  // thumbnail to these bounds. No-op in the browser.
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => watchPlayerRect(barRef.current), [])

  const dur = duration || currentTrack?.duration || 0
  const liked = currentTrack ? isLiked(currentTrack.id) : false

  return (
    <div className="player" ref={barRef}>
      {currentTrack && (
        <div className="player__now">
          <Cover src={currentTrack.artwork} alt={currentTrack.title} className="player__art" />
          <div className="player__nowmeta">
            <b title={currentTrack.title}>{currentTrack.title}</b>
            <i title={currentTrack.artist}>{currentTrack.artist}</i>
          </div>
        </div>
      )}

      <div className="player__pill">
        <div className="player__row">
          <div className="player__side">
            <button
              className={`pbtn ${liked ? 'on' : ''}`}
              disabled={!currentTrack}
              onClick={() => currentTrack && toggleLike(currentTrack)}
              aria-label="Like"
            >
              <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
            </button>
            <button
              className="pbtn"
              disabled={!currentTrack}
              onClick={() => openFullscreen('lyrics')}
              aria-label="Lyrics"
              title="Lyrics"
            >
              <Mic2 size={16} />
            </button>
            <button
              className={`pbtn ${queueOpen ? 'on' : ''}`}
              onClick={() => setQueueOpen(!queueOpen)}
              aria-label="Queue"
              title="Queue"
            >
              <ListMusic size={16} />
            </button>
            {currentTrack && (
              <AddToPlaylistButton track={currentTrack} className="pbtn" iconSize={16} />
            )}
            <div className="extras">
              <button
                className={`pbtn ${extrasOpen ? 'on' : ''}`}
                onClick={() => setExtrasOpen((o) => !o)}
                aria-label="Playback settings"
                title="Sleep timer, speed & crossfade"
              >
                <SlidersHorizontal size={16} />
              </button>
              {extrasOpen && <ExtrasMenu onClose={() => setExtrasOpen(false)} />}
            </div>
            <button
              className="pbtn"
              disabled={!currentTrack}
              onClick={() => setFullscreen(true)}
              aria-label="Full screen"
              title="Full screen"
            >
              <Maximize2 size={15} />
            </button>
          </div>

          <div className="player__transport">
            <button
              className={`pbtn ${repeat !== 'off' ? 'on' : ''}`}
              onClick={cycleRepeat}
              aria-label="Repeat"
            >
              {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
            <button className="pbtn" onClick={prev} aria-label="Previous">
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button
              className="pplay"
              onClick={togglePlay}
              disabled={!currentTrack}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isBuffering ? (
                <span className="spinner spinner--sm" />
              ) : isPlaying ? (
                <Pause size={18} fill="#0f1115" />
              ) : (
                <Play size={18} fill="#0f1115" style={{ marginLeft: 1 }} />
              )}
            </button>
            <button className="pbtn" onClick={next} aria-label="Next">
              <SkipForward size={18} fill="currentColor" />
            </button>
            <button
              className={`pbtn ${shuffle ? 'on' : ''}`}
              onClick={toggleShuffle}
              aria-label="Shuffle"
            >
              <Shuffle size={16} />
            </button>
          </div>

          <div className="player__side player__vol">
            <button className="pbtn" onClick={toggleMute} aria-label="Mute">
              <VolumeIcon volume={volume} muted={muted} />
            </button>
            <input
              className="range range--vol"
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              style={fill(muted ? 0 : volume)}
              aria-label="Volume"
            />
          </div>
        </div>

        <div className="player__progress">
          <span>{fmtTime(progress)}</span>
          <input
            className="range"
            type="range"
            min={0}
            max={dur || 0}
            step={0.5}
            value={Math.min(progress, dur || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            style={fill(dur ? (progress / dur) * 100 : 0)}
            aria-label="Seek"
          />
          <span>{fmtTime(dur)}</span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ right rail */

function RightRail() {
  const { navigate } = useNav()
  const { recent, recentAt, playContext } = usePlayer()
  const [featured, setFeatured] = useState<Playlist | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTrendingPlaylists()
      .then((ps) => !cancelled && setFeatured(ps[0] ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <aside className="rail">
      <section className="rail__sec">
        <div className="rail__head">
          <h3>Tags</h3>
          <button className="dots" aria-label="More">
            <MoreHorizontal size={16} />
          </button>
        </div>
        <div className="tags">
          {TAGS.map((t) => (
            <button
              key={t.label}
              className="tag"
              onClick={() =>
                t.hindi
                  ? navigate({ type: 'hindi' }, 'hindi')
                  : t.hollywood
                    ? navigate({ type: 'hollywood' }, 'hollywood')
                    : navigate({ type: 'genre', genre: t.genre ?? '', name: t.label }, 'browse')
              }
            >
              <span className="tag__e">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rail__sec">
        <div className="rail__head">
          <h3>Played</h3>
          <button className="link" onClick={() => navigate({ type: 'library' }, 'song')}>
            See all
          </button>
        </div>
        <div className="played">
          {recent.length === 0 && <div className="played__empty">Nothing played yet.</div>}
          {recent.slice(0, 4).map((t) => (
            <button key={t.id} className="played__item" onClick={() => playContext(recent, t.id)}>
              <Cover src={t.artwork} alt={t.title} className="played__art" />
              <span className="played__meta">
                <span className="played__title" title={t.title}>
                  {t.title}
                </span>
                <span className="played__sub" title={t.artist}>
                  {t.artist}
                </span>
              </span>
              <span className="played__time">{fmtAgo(recentAt[t.id])}</span>
            </button>
          ))}
        </div>
      </section>

      {featured && (
        <section
          className="feature"
          onClick={() => navigate({ type: 'playlist', id: featured.id })}
        >
          <Cover src={featured.artworkLarge} alt={featured.name} className="feature__img" />
          <div className="feature__row">
            <div className="feature__meta">
              <span className="feature__title" title={featured.name}>
                {featured.name}
              </span>
              <span className="feature__sub" title={featured.owner}>
                {featured.owner}
              </span>
            </div>
            <button
              className="feature__add"
              onClick={(e) => {
                e.stopPropagation()
                navigate({ type: 'playlist', id: featured.id })
              }}
              aria-label="Open playlist"
            >
              <Plus size={18} />
            </button>
          </div>
        </section>
      )}
    </aside>
  )
}

/* ---------------------------------------------------------------- center */

function CenterColumn() {
  const { view, back, forward, canBack, canForward } = useNav()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [view])

  let body: ReactNode
  switch (view.type) {
    case 'home':
      body = <HomeView />
      break
    case 'search':
      body = <SearchView />
      break
    case 'library':
      body = <LibraryView />
      break
    case 'playlist':
      body = <PlaylistView id={view.id} />
      break
    case 'myplaylist':
      body = <MyPlaylistView id={view.id} />
      break
    case 'shared':
      body = <SharedPlaylistView id={view.id} />
      break
    case 'genre':
      body = <GenreView genre={view.genre} name={view.name} />
      break
    case 'station':
      body = <StationView q={view.q} name={view.name} />
      break
    case 'hindi':
      body = <HindiView />
      break
    case 'hollywood':
      body = <HollywoodView />
      break
    case 'podcasts':
      body = <PodcastsView />
      break
    case 'radio':
      body = <RadioView />
      break
    case 'account':
      body = <AccountView />
      break
  }

  return (
    <section className="center">
      <div className="center__bar">
        <button className="histbtn" disabled={!canBack} onClick={back} aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <button className="histbtn" disabled={!canForward} onClick={forward} aria-label="Forward">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="center__scroll" ref={scrollRef}>
        {body}
      </div>
      <Player />
    </section>
  )
}

/* -------------------------------------------------------------- login */

// Sign in / sign up popup, rendered INSIDE the app window (not a separate page
// or tab). Opened from the sidebar's "Log in / Sign up" buttons; auto-closes the
// moment a session exists (handled in AuthProvider).
function AuthModal() {
  const { authOpen, authMode, closeAuth, loginWithGoogle, googleEnabled } = useAuth()
  const [authErr, setAuthErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Esc closes the popup.
  useEffect(() => {
    if (!authOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAuth()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [authOpen, closeAuth])

  if (!authOpen) return null
  const signup = authMode === 'signup'

  const doGoogle = async () => {
    setAuthErr('')
    setBusy(true)
    try {
      await loginWithGoogle()
    } catch (e: any) {
      // e.g. provider not enabled in Supabase, or a network error before redirect.
      setAuthErr(e?.message || 'Sign-in failed. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="authmodal" onClick={closeAuth}>
      <div className="authmodal__card" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={closeAuth} aria-label="Close">
          <X size={18} />
        </button>
        <div className="login__brand">
          <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden>
            <defs>
              <linearGradient id="login-g" x1="8" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#ff3b4e" />
                <stop offset="1" stopColor="#b00d22" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="32" fill="url(#login-g)" />
            <g stroke="#0f1115" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="#0f1115">
              <path d="M14 41 L24 26 L33 35 L42 24 L50 31" fill="none" />
              <circle cx="14" cy="41" r="3.6" />
              <circle cx="24" cy="26" r="4" />
              <circle cx="33" cy="35" r="3.4" />
              <circle cx="42" cy="24" r="4" />
              <circle cx="50" cy="31" r="3.6" />
            </g>
          </svg>
          <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p>Sign in with Google to save your likes, playlists &amp; listening stats across devices.</p>
        </div>

        {googleEnabled ? (
          <>
            <button className="gbtn" onClick={doGoogle} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
              {busy ? 'Connecting…' : 'Continue with Google'}
            </button>
            {authErr && <p className="login__err">{authErr}</p>}
          </>
        ) : (
          <p className="login__note">
            Sign-in isn’t configured yet. Set <code>VITE_SUPABASE_URL</code> &amp;{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> to enable it.
          </p>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- mobile chrome */

// Compact bottom mini-player (phones). Tap the artwork/title to open the
// full-screen Now Playing; play/pause + next stay inline.
function MobileMiniPlayer() {
  const { currentTrack, isPlaying, isBuffering, togglePlay, next, progress, duration } = usePlayer()
  const { setFullscreen } = useUI()
  if (!currentTrack) return null
  const dur = duration || currentTrack.duration || 0
  return (
    <div className="mini">
      <div className="mini__prog">
        <span style={{ width: dur ? `${Math.min(100, (progress / dur) * 100)}%` : '0%' }} />
      </div>
      <button className="mini__open" onClick={() => setFullscreen(true)} aria-label="Open player">
        <Cover src={currentTrack.artwork} alt={currentTrack.title} className="mini__art" />
        <span className="mini__meta">
          <b title={currentTrack.title}>{currentTrack.title}</b>
          <i title={currentTrack.artist}>{currentTrack.artist}</i>
        </span>
      </button>
      <button className="mini__btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
        {isBuffering ? (
          <span className="spinner spinner--sm" />
        ) : isPlaying ? (
          <Pause size={20} fill="currentColor" />
        ) : (
          <Play size={20} fill="currentColor" />
        )}
      </button>
      <button className="mini__btn" onClick={next} aria-label="Next">
        <SkipForward size={20} fill="currentColor" />
      </button>
    </div>
  )
}

// Bottom tab bar (phones) — primary navigation.
function MobileNav() {
  const { section, navigate, setQuery } = useNav()
  const { user, openAuth } = useAuth()
  return (
    <nav className="mnav">
      <button
        className={`mnav__tab ${section === 'home' ? 'on' : ''}`}
        onClick={() => navigate({ type: 'home' }, 'home')}
      >
        <Home size={20} />
        <span>Home</span>
      </button>
      <button
        className={`mnav__tab ${section === 'browse' ? 'on' : ''}`}
        onClick={() => {
          setQuery('')
          navigate({ type: 'search' }, 'browse')
        }}
      >
        <SearchIcon size={20} />
        <span>Search</span>
      </button>
      <button
        className={`mnav__tab ${section === 'hindi' ? 'on' : ''}`}
        onClick={() => navigate({ type: 'hindi' }, 'hindi')}
      >
        <Clapperboard size={20} />
        <span>Bollywood</span>
      </button>
      <button
        className={`mnav__tab ${section === 'hollywood' ? 'on' : ''}`}
        onClick={() => navigate({ type: 'hollywood' }, 'hollywood')}
      >
        <Film size={20} />
        <span>Hollywood</span>
      </button>
      <button
        className={`mnav__tab ${section === 'song' ? 'on' : ''}`}
        onClick={() => navigate({ type: 'library' }, 'song')}
      >
        <Music2 size={20} />
        <span>Library</span>
      </button>
      <button
        className={`mnav__tab ${section === 'account' ? 'on' : ''}`}
        onClick={() => (user ? navigate({ type: 'account' }, 'account') : openAuth('login'))}
      >
        {user?.picture ? (
          <img className="mnav__ava" src={user.picture} alt={user.name} />
        ) : (
          <UserPlus size={20} />
        )}
        <span>You</span>
      </button>
    </nav>
  )
}

/* --------------------------------------------------------------- updates */

// Desktop only. The update installs on quit regardless, so this is an offer to
// skip the wait rather than a demand — it stays quiet until a version is
// actually downloaded and ready, and can be dismissed.
function UpdateNotice() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => watchUpdates(setStatus), [])
  useEffect(() => setDismissed(false), [status.version])

  if (status.state !== 'ready' || dismissed) return null
  return (
    <div className="toast toast--update">
      <span>
        Version {status.version} is ready — it installs when you close Synapz.
      </span>
      <button className="toast__cta" onClick={restartToUpdate}>
        Restart now
      </button>
      <button className="toast__x" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ shell */

function Shell() {
  const { error } = usePlayer()
  const { view } = useNav()
  const isHome = view.type === 'home'
  return (
    <div className="wallpaper">
      <VibeBackground />
      <div className="window">
        <div className={`app-grid ${isHome ? 'app-grid--home' : ''}`}>
          <Sidebar />
          <CenterColumn />
          {!isHome && <RightRail />}
        </div>
        <MobileMiniPlayer />
        <MobileNav />
        <QueuePanel />
        <NowPlaying />
        <AuthModal />
      </div>
      {error && <div className="toast">{error}</div>}
      <UpdateNotice />
    </div>
  )
}

function Gate() {
  const { loading } = useAuth()
  if (loading) {
    return (
      <div className="wallpaper splash">
        <div className="spinner" />
      </div>
    )
  }
  // No login wall — anyone can listen immediately. Signing in is optional and
  // happens through the AuthModal popup (rendered inside the window by Shell).
  return (
    <VibeProvider>
      <PlayerProvider>
        <PlaylistsProvider>
          <NavProvider>
            <UIProvider>
              <Shell />
            </UIProvider>
          </NavProvider>
        </PlaylistsProvider>
      </PlayerProvider>
    </VibeProvider>
  )
}

// Cinematic intro on load: the brand mark draws itself, "Synapz" rises
// letter by letter, an underline sweeps in, then the veil lifts to reveal the
// app. Click anywhere to skip. Respects prefers-reduced-motion.
function SynapzIntro() {
  const [leaving, setLeaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const hold = reduce ? 500 : 2600
    const t1 = setTimeout(() => setLeaving(true), hold)
    const t2 = setTimeout(() => setDone(true), hold + 850)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  if (done) return null

  const skip = () => {
    setLeaving(true)
    setTimeout(() => setDone(true), 850)
  }

  return (
    <div className={`intro ${leaving ? 'intro--leave' : ''}`} onClick={skip} role="presentation">
      <div className="intro__stage">
        <svg className="intro__mark" viewBox="0 0 64 64" width="76" height="76" aria-hidden>
          <defs>
            <linearGradient id="intro-g" x1="8" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ff3b4e" />
              <stop offset="1" stopColor="#b00d22" />
            </linearGradient>
          </defs>
          <circle className="intro__ring" cx="32" cy="32" r="30" />
          <path
            className="intro__wave"
            d="M14 41 L24 26 L33 35 L42 24 L50 31"
            fill="none"
            stroke="url(#intro-g)"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g className="intro__dots" fill="#ff5066">
            <circle cx="14" cy="41" r="3.4" />
            <circle cx="24" cy="26" r="3.9" />
            <circle cx="33" cy="35" r="3.3" />
            <circle cx="42" cy="24" r="3.9" />
            <circle cx="50" cy="31" r="3.4" />
          </g>
        </svg>

        <div className="intro__word" aria-label="Synapz">
          {'Synapz'.split('').map((c, i) => (
            <span key={i} style={{ animationDelay: `${0.6 + i * 0.06}s` }}>
              {c}
            </span>
          ))}
        </div>
        <div className="intro__sub">MUSIC</div>
        <div className="intro__line" />
      </div>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    warmup()
    try {
      applyAccent(localStorage.getItem('synapz:accent') || 'crimson')
    } catch {
      /* noop */
    }
  }, [])
  return (
    <AuthProvider>
      <SynapzIntro />
      <Gate />
    </AuthProvider>
  )
}
