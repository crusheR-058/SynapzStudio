// Design tokens ported from the web app's src/styles/theme.css so both clients
// read as one product. Values are copied deliberately rather than approximated:
// if the web theme changes, change it here too.
//
// The web theme is "Always dark" — there is no light mode to port, and adding
// one on mobile only would make the two apps diverge.

export const color = {
  /** Elevation ladder: ground → window → card → pressed. */
  ground: '#0a0a0c',
  window: '#121214',
  panel: '#17171b',
  panelStrong: '#202026',
  panelHover: '#28282f',

  hairline: 'rgba(255,255,255,0.07)',
  hairlineLit: 'rgba(255,255,255,0.14)',

  text: '#ffffff',
  dim: '#a0a0a8',
  dimmer: '#6e6e78',

  accent: '#ff2e4c',
  accentHover: '#ff5066',
  accent2: '#ff7081',
  accentFg: '#ffffff',
  /** rgba(accent, .5) — the halo the web app puts behind play buttons. */
  glow: 'rgba(255,46,76,0.5)',
  accentWash: 'rgba(255,46,76,0.12)',

  /** Gradient stops for the play button (web: --play-gradient). */
  playGradient: ['#ff3b4e', '#b00d22'] as const,
} as const

export const radius = {
  sm: 6,
  md: 10,
  /** Web's --radius: 0.75rem. */
  lg: 12,
  xl: 18,
  pill: 999,
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

/**
 * Figtree, the same face the web app loads — bundled through
 * @expo-google-fonts/figtree rather than fetched, so it renders identically
 * offline and there is no flash of a fallback face.
 */
export const font = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  black: 'Figtree_800ExtraBold',
} as const

export const typo = {
  display: { fontFamily: font.black, fontSize: 30, letterSpacing: -0.7, lineHeight: 34 },
  title: { fontFamily: font.bold, fontSize: 21, letterSpacing: -0.4, lineHeight: 26 },
  section: { fontFamily: font.bold, fontSize: 17, letterSpacing: -0.2, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 20 },
  bodyMed: { fontFamily: font.medium, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: font.semibold, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 16 },
  micro: { fontFamily: font.semibold, fontSize: 10.5, letterSpacing: 0.9, lineHeight: 14 },
} as const

/** Height of the mini player; screens pad their scroll content by this. */
export const MINI_PLAYER_HEIGHT = 60
export const TAB_BAR_HEIGHT = 58
