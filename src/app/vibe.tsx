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
  /**
   * Four colors the shader blends: dark base → mid → highlight → accent.
   *
   * The accent is layered off a different noise term than the highlight, so it
   * pools in different regions rather than muddying into the same blend — which
   * is what stops a four-color field from averaging out to one flat wash.
   */
  colors: [string, string, string, string]
  speed: number // motion speed multiplier (0 = static)
  mode: 0 | 1 | 2 // 0 aurora bands · 1 nebula swirl · 2 depth waves
}

export const VIBES: Vibe[] = [
  { key: 'off', name: 'Off', emoji: '⭘', colors: ['#0a0a0c', '#0a0a0c', '#0a0a0c', '#0a0a0c'], speed: 0, mode: 0 },

  // --- warm ----------------------------------------------------------------
  { key: 'lofi', name: 'Lo-Fi', emoji: '🎧', colors: ['#241536', '#7a4b6b', '#e0a878', '#f7d9b0'], speed: 0.22, mode: 2 },
  { key: 'sunset', name: 'Sunset', emoji: '🌇', colors: ['#2b0a2e', '#c9315f', '#ff8c42', '#ffd98a'], speed: 0.3, mode: 0 },
  { key: 'ember', name: 'Ember', emoji: '🔥', colors: ['#100404', '#6b1208', '#ff4d1a', '#ffb03a'], speed: 0.5, mode: 2 },
  { key: 'desert', name: 'Desert', emoji: '🏜️', colors: ['#1c1006', '#8a4b1c', '#e0913f', '#f7dba7'], speed: 0.24, mode: 0 },
  { key: 'rock', name: 'Rock', emoji: '🎸', colors: ['#160806', '#7a1f0a', '#ff6a2b', '#ffc14d'], speed: 0.6, mode: 1 },
  { key: 'classical', name: 'Classical', emoji: '🎻', colors: ['#1a140c', '#5c4326', '#c9a36b', '#efd9a8'], speed: 0.2, mode: 0 },
  { key: 'hiphop', name: 'Hip-Hop', emoji: '🎤', colors: ['#0d0d0d', '#4a4326', '#e6b800', '#ff8c1a'], speed: 0.48, mode: 0 },

  // --- cool ----------------------------------------------------------------
  { key: 'chill', name: 'Chill', emoji: '🌊', colors: ['#08131f', '#0e5a6b', '#3fb0c9', '#8fe3d8'], speed: 0.16, mode: 2 },
  { key: 'monsoon', name: 'Monsoon', emoji: '🌧️', colors: ['#07121a', '#1f4f5e', '#4fa3b8', '#a8d8e8'], speed: 0.18, mode: 2 },
  { key: 'midnight', name: 'Midnight', emoji: '🌙', colors: ['#02040f', '#12224d', '#3b5ea8', '#8fb3ff'], speed: 0.14, mode: 2 },
  { key: 'emerald', name: 'Emerald', emoji: '💎', colors: ['#04120f', '#0b5c4a', '#1fbf9c', '#9ff2dc'], speed: 0.22, mode: 1 },
  { key: 'forest', name: 'Forest', emoji: '🌿', colors: ['#04140c', '#125c33', '#4ecb71', '#c8f7a0'], speed: 0.2, mode: 2 },
  { key: 'aurora', name: 'Aurora', emoji: '🌌', colors: ['#03101a', '#12b886', '#4dd2ff', '#b78cff'], speed: 0.28, mode: 0 },

  // --- vivid ---------------------------------------------------------------
  { key: 'edm', name: 'EDM', emoji: '⚡', colors: ['#070726', '#00e5ff', '#ff2bd6', '#7c4dff'], speed: 0.95, mode: 1 },
  { key: 'neon', name: 'Neon', emoji: '🏙️', colors: ['#04030f', '#00fff0', '#ff00a0', '#6a00ff'], speed: 1.0, mode: 1 },
  { key: 'synthwave', name: 'Synthwave', emoji: '📼', colors: ['#12002e', '#7b2ff7', '#ff2e93', '#ffb037'], speed: 0.7, mode: 0 },
  { key: 'party', name: 'Party', emoji: '🎉', colors: ['#2a0b4a', '#ff4bd0', '#ffd23b', '#41e0ff'], speed: 0.85, mode: 1 },
  { key: 'holi', name: 'Holi', emoji: '🎨', colors: ['#1a0726', '#ff2d78', '#ffd93b', '#3ddc84'], speed: 0.9, mode: 1 },
  { key: 'sakura', name: 'Sakura', emoji: '🌸', colors: ['#1a0a14', '#8c2f52', '#ff8fb1', '#ffd9e4'], speed: 0.26, mode: 2 },

  // --- deep ----------------------------------------------------------------
  { key: 'sufi', name: 'Sufi', emoji: '🕌', colors: ['#360f0f', '#b0122a', '#e8b04b', '#ff7a3d'], speed: 0.32, mode: 1 },
  { key: 'royal', name: 'Royal', emoji: '👑', colors: ['#150a2e', '#4b2a8a', '#9b6bff', '#f0c419'], speed: 0.35, mode: 1 },
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
