// Renderer-side bridge to the desktop-only extras: tray, global hotkeys, the
// mini-player window and the local music folder scan (see electron/tray.cjs,
// electron/mini.cjs and electron/local-files.cjs).
//
// Like the other bridges, every function is a no-op on the plain web build.

export interface DesktopPrefs {
  /** Closing the window keeps Synapz playing in the tray instead of quitting. */
  closeToTray: boolean
  /** System-wide Ctrl+Alt hotkeys for transport and volume. */
  globalShortcuts: boolean
}

export interface LocalFile {
  path: string
  /** File name without directory. */
  name: string
  /** Name of the containing folder — usually the album. */
  dir: string
  size: number
}

export interface LocalScan {
  roots: string[]
  files: LocalFile[]
  /** True when the scan stopped at the file cap rather than the end. */
  truncated: boolean
}

interface DesktopBridge {
  isDesktop?: boolean
  setDesktopPrefs?: (p: DesktopPrefs) => void
  toggleMiniPlayer?: () => void
  localScan?: () => Promise<LocalScan>
  localAddFolder?: () => Promise<LocalScan | null>
  localRemoveFolder?: (root: string) => Promise<LocalScan>
}

const bridge = (): DesktopBridge | undefined =>
  (window as unknown as { synapz?: DesktopBridge }).synapz

const KEY = 'synapz:desktop'
const DEFAULTS: DesktopPrefs = { closeToTray: false, globalShortcuts: true }

export function desktopPrefs(): DesktopPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DesktopPrefs>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

/** Persist and apply. Also called once at startup to hand the shell its prefs. */
export function applyDesktopPrefs(p: DesktopPrefs = desktopPrefs()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
  bridge()?.setDesktopPrefs?.(p)
}

/** The shortcuts the shell registers, for showing in settings. */
export const GLOBAL_SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl + Alt + Space', action: 'Play / pause' },
  { keys: 'Ctrl + Alt + →', action: 'Next track' },
  { keys: 'Ctrl + Alt + ←', action: 'Previous track' },
  { keys: 'Ctrl + Alt + ↑ / ↓', action: 'Volume up / down' },
  { keys: 'Ctrl + Alt + M', action: 'Toggle mini player' },
]

export function toggleMiniPlayer(): void {
  bridge()?.toggleMiniPlayer?.()
}

export const canScanLocal = () => !!bridge()?.localScan

export async function localScan(): Promise<LocalScan | null> {
  try {
    return (await bridge()?.localScan?.()) ?? null
  } catch {
    return null
  }
}

/** Opens the OS folder picker. Null if the user cancelled. */
export async function localAddFolder(): Promise<LocalScan | null> {
  try {
    return (await bridge()?.localAddFolder?.()) ?? null
  } catch {
    return null
  }
}

export async function localRemoveFolder(root: string): Promise<LocalScan | null> {
  try {
    return (await bridge()?.localRemoveFolder?.(root)) ?? null
  } catch {
    return null
  }
}
