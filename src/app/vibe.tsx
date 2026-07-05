import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

// Animated "vibe" backgrounds — a mood/genre-themed WebGL backdrop the user picks
// in-app. Mirrors the accent-theme pattern: a value persisted to localStorage and
// reflected as `data-vibe` on <html> (so CSS can react), read by <VibeBackground/>.

export interface Vibe {
  key: string
  name: string
  emoji: string
  // Three colors the shader blends (dark base → mid → highlight).
  colors: [string, string, string]
  speed: number // motion speed multiplier (0 = static)
  mode: 0 | 1 | 2 // 0 aurora bands · 1 nebula swirl · 2 depth waves
}

export const VIBES: Vibe[] = [
  { key: 'off', name: 'Off', emoji: '⭘', colors: ['#0a0a0c', '#0a0a0c', '#0a0a0c'], speed: 0, mode: 0 },
  { key: 'lofi', name: 'Lo-Fi', emoji: '🎧', colors: ['#241536', '#7a4b6b', '#e0a878'], speed: 0.22, mode: 2 },
  { key: 'edm', name: 'EDM', emoji: '⚡', colors: ['#070726', '#00e5ff', '#ff2bd6'], speed: 0.95, mode: 1 },
  { key: 'sufi', name: 'Sufi', emoji: '🕌', colors: ['#360f0f', '#b0122a', '#e8b04b'], speed: 0.32, mode: 1 },
  { key: 'hiphop', name: 'Hip-Hop', emoji: '🎤', colors: ['#0d0d0d', '#4a4326', '#e6b800'], speed: 0.48, mode: 0 },
  { key: 'chill', name: 'Chill', emoji: '🌊', colors: ['#08131f', '#0e5a6b', '#3fb0c9'], speed: 0.16, mode: 2 },
  { key: 'classical', name: 'Classical', emoji: '🎻', colors: ['#1a140c', '#5c4326', '#c9a36b'], speed: 0.2, mode: 0 },
  { key: 'rock', name: 'Rock', emoji: '🎸', colors: ['#160806', '#7a1f0a', '#ff6a2b'], speed: 0.6, mode: 1 },
  { key: 'party', name: 'Party', emoji: '🎉', colors: ['#2a0b4a', '#ff4bd0', '#ffd23b'], speed: 0.85, mode: 1 },
]

const LS = 'synapz:vibe'

function readInitial(): string {
  try {
    return localStorage.getItem(LS) || 'off'
  } catch {
    return 'off'
  }
}

function applyVibeAttr(key: string) {
  try {
    if (!key || key === 'off') delete document.documentElement.dataset.vibe
    else document.documentElement.dataset.vibe = key
  } catch {
    /* noop */
  }
}

interface VibeValue {
  vibe: Vibe
  setVibe: (key: string) => void
}

const VibeContext = createContext<VibeValue | null>(null)

export function VibeProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<string>(readInitial)

  useEffect(() => applyVibeAttr(key), [key])

  const setVibe = useCallback((k: string) => {
    setKey(k)
    try {
      localStorage.setItem(LS, k)
    } catch {
      /* ignore quota / private mode */
    }
  }, [])

  const vibe = VIBES.find((v) => v.key === key) ?? VIBES[0]
  return <VibeContext.Provider value={{ vibe, setVibe }}>{children}</VibeContext.Provider>
}

export function useVibe(): VibeValue {
  const ctx = useContext(VibeContext)
  if (!ctx) throw new Error('useVibe must be used within VibeProvider')
  return ctx
}
