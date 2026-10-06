// System tray + global hotkeys.
//
// The tray is the app's handle while its window is hidden: a menu with the
// current track and transport, and a click to bring the window back. Together
// with the "keep playing in the tray" preference it lets the window be closed
// without stopping the music.
//
// Global hotkeys are Ctrl+Alt chords rather than the bare media keys. The
// media keys already work — Chromium's Media Session handles them — and
// claiming them here as well would make each press fire twice.
//
// Both drive playback the same way the taskbar thumbnail buttons do: by sending
// an action down the `media:control` channel for the renderer's player to act on.

const { app, Menu, Tray, globalShortcut, nativeImage } = require('electron')
const path = require('node:path')

const SHORTCUTS = {
  'Control+Alt+Space': 'playpause',
  'Control+Alt+Right': 'next',
  'Control+Alt+Left': 'prev',
  'Control+Alt+Up': 'volup',
  'Control+Alt+Down': 'voldown',
}
const MINI_SHORTCUT = 'Control+Alt+M'

let tray = null
let hooks = null // { getWindow, showWindow, toggleMini }
let prefs = { closeToTray: false, globalShortcuts: true }
let state = { hasTrack: false, isPlaying: false, title: '', artist: '' }
let quitting = false

function send(action) {
  const win = hooks?.getWindow()
  if (win && !win.isDestroyed()) win.webContents.send('media:control', action)
}

function menu() {
  const now = state.hasTrack
    ? `${state.title}${state.artist ? ` — ${state.artist}` : ''}`
    : 'Nothing playing'
  return Menu.buildFromTemplate([
    { label: now.length > 60 ? `${now.slice(0, 59)}…` : now, enabled: false },
    { type: 'separator' },
    {
      label: state.isPlaying ? 'Pause' : 'Play',
      enabled: state.hasTrack,
      click: () => send('playpause'),
    },
    { label: 'Next', enabled: state.hasTrack, click: () => send('next') },
    { label: 'Previous', enabled: state.hasTrack, click: () => send('prev') },
    { type: 'separator' },
    { label: 'Show Synapz Music', click: () => hooks?.showWindow() },
    { label: 'Mini player', click: () => hooks?.toggleMini() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ])
}

function paint() {
  if (!tray || tray.isDestroyed()) return
  tray.setContextMenu(menu())
  tray.setToolTip(state.hasTrack ? `${state.title} — Synapz Music`.slice(0, 120) : 'Synapz Music')
}

function applyShortcuts() {
  globalShortcut.unregisterAll()
  if (!prefs.globalShortcuts) return
  // register() returns false when another app already owns the chord. That is
  // not an error worth surfacing — the other hotkeys still work.
  for (const [accel, action] of Object.entries(SHORTCUTS)) {
    try {
      globalShortcut.register(accel, () => send(action))
    } catch {
      /* invalid on this platform */
    }
  }
  try {
    globalShortcut.register(MINI_SHORTCUT, () => hooks?.toggleMini())
  } catch {
    /* invalid on this platform */
  }
}

/** Call once the app is ready. */
function init(h) {
  hooks = h
  let icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'))
  // macOS menu-bar icons are ~16pt; Windows/Linux trays take the 32px source.
  if (process.platform === 'darwin') icon = icon.resize({ width: 18, height: 18 })
  try {
    tray = new Tray(icon)
    tray.on('click', () => hooks?.showWindow())
    paint()
  } catch (err) {
    // No tray on this desktop (some Linux setups). Close-to-tray must then be
    // off, or closing the window would strand a process with no way back in.
    console.warn('[synapz] tray unavailable:', err?.message || err)
    tray = null
  }
  applyShortcuts()
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

/** Renderer pushed a new now-playing state. */
function update(next) {
  if (!next) return
  state = {
    hasTrack: !!next.hasTrack,
    isPlaying: !!next.isPlaying,
    title: String(next.title || ''),
    artist: String(next.artist || ''),
  }
  paint()
}

function setPrefs(p) {
  if (!p || typeof p !== 'object') return
  prefs = { closeToTray: !!p.closeToTray, globalShortcuts: !!p.globalShortcuts }
  applyShortcuts()
}

/** Should closing the window hide it instead of quitting? */
function hidesOnClose() {
  return !!tray && prefs.closeToTray && !quitting
}

/** The app is going down on purpose (Quit, or restart-to-update). */
function markQuitting() {
  quitting = true
}

module.exports = { init, update, setPrefs, hidesOnClose, markQuitting }
