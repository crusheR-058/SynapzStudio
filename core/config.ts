// Platform configuration for the shared core.
//
// Core must not read `import.meta.env` (Vite-only — it is a syntax error under
// Metro) or `process.env` (not statically replaced the same way on both
// bundlers). Instead each platform pushes its values in at startup:
//
//   web     src/lib/env.ts        reads import.meta.env.VITE_*
//   mobile  mobile/lib/env.ts     reads process.env.EXPO_PUBLIC_*
//
// Every consumer reads through env() INSIDE a function, never at module scope,
// so import order can't matter: by the time anything is called, the platform
// entry has already run.

export interface SynapzEnv {
  /** Absolute origin for backend calls. Empty means same-origin (web/desktop). */
  apiBase: string
  /** Public origin used to build shareable /play and /listen links. */
  webOrigin: string
  /**
   * YouTube Data API key for calling Google directly.
   *
   * Web and desktop only. The project's key is HTTP-referrer-restricted, which
   * a native app cannot satisfy — there is no referrer to send — so mobile
   * leaves this empty and goes through the hosted /yt/search proxy, where the
   * key lives server-side and no restriction applies.
   */
  youtubeKey: string
  /**
   * Whether /yt/search is reachable. True on the hosted web app, the desktop
   * app (which bundles the helper) and in dev. Mobile sets it too, pointing at
   * the deployed origin via apiBase.
   */
  hasSearchProxy: boolean
}

const DEFAULTS: SynapzEnv = {
  apiBase: '',
  webOrigin: 'https://synapz-music.vercel.app',
  youtubeKey: '',
  hasSearchProxy: true,
}

let current: SynapzEnv = { ...DEFAULTS }

/** Set once per platform, at startup, before any core function is called. */
export function configure(next: Partial<SynapzEnv>): void {
  current = { ...current, ...strip(next) }
}

export function env(): SynapzEnv {
  return current
}

// An undefined/empty override must not clobber a good default — an unset
// VITE_WEB_ORIGIN would otherwise blank the origin and produce "/play/..." links
// with no host, which Discord rejects outright.
//
// Booleans pass through as-is: `false` is a deliberate value, and dropping it as
// "empty" would make hasSearchProxy impossible to turn off.
function strip(next: Partial<SynapzEnv>): Partial<SynapzEnv> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(next)) {
    if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string' && v) out[k] = v
  }
  return out as Partial<SynapzEnv>
}
