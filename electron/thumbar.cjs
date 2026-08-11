// Windows taskbar mini-player.
//
// Hovering the Synapz button in the taskbar pops the window preview; this module
// turns that preview into a player:
//   • setThumbarButtons  — prev / play-pause / next under the thumbnail, wired
//     back to the renderer over the `media:control` channel.
//   • setThumbnailClip   — crops the preview to the app's player bar, so the
//     hover shows the artwork + transport instead of the whole window.
//   • setThumbnailToolTip — the hovered title reads "Track — Artist".
//
// Windows-only (the APIs are no-ops elsewhere, but we bail early to keep the
// main process quiet on macOS/Linux).

const { nativeImage } = require('electron')
const path = require('node:path')

const WIN = process.platform === 'win32'
const ICON_DIR = path.join(__dirname, 'thumbar')

// Cache the nativeImages — buttons are rebuilt on every play/pause flip.
const cache = new Map()
function icon(name) {
  if (!cache.has(name)) {
    cache.set(name, nativeImage.createFromPath(path.join(ICON_DIR, `${name}.png`)))
  }
  return cache.get(name)
}

// Mirrors what the renderer last told us. `hasTrack` gates both the buttons
// (disabled with an empty player) and the crop (no point cropping to an empty
// bar — an idle app should still preview as the whole window).
const state = { hasTrack: false, isPlaying: false, title: '', artist: '' }
let lastRect = null // player bar, in renderer CSS px relative to the content area
let attached = false

function alive(win) {
  return WIN && win && !win.isDestroyed()
}

function send(win, action) {
  if (alive(win)) win.webContents.send('media:control', action)
}

// The button *count* is fixed at three for the window's lifetime: Windows only
// accepts ThumbBarAddButtons once, and every later update has to keep the same
// layout. So we always ship three and vary icon/tooltip/flags instead.
function buttons(win) {
  const flags = state.hasTrack ? ['enabled'] : ['disabled']
  const toggle = state.isPlaying
    ? { tooltip: 'Pause', icon: icon('pause') }
    : { tooltip: 'Play', icon: icon('play') }
  return [
    { tooltip: 'Previous', icon: icon('prev'), flags, click: () => send(win, 'prev') },
    { ...toggle, flags, click: () => send(win, 'playpause') },
    { tooltip: 'Next', icon: icon('next'), flags, click: () => send(win, 'next') },
  ]
}

function paint(win) {
  if (!alive(win) || !attached) return false
  const ok = win.setThumbarButtons(buttons(win))
  const label = state.hasTrack
    ? `${state.title}${state.artist ? ` — ${state.artist}` : ''}`
    : 'Synapz Music'
  // Windows truncates past 260 chars; do it ourselves so nothing is lost mid-word.
  win.setThumbnailToolTip(label.length > 255 ? `${label.slice(0, 254)}…` : label)
  return ok
}

/**
 * Crop the taskbar preview to `lastRect`, or reset it to the full window.
 *
 * No coordinate translation: setThumbnailClip resolves to ITaskbarList3, whose
 * rect is relative to the window's *client area* — the same origin the renderer
 * measures getBoundingClientRect against. Electron handles DIP → physical px.
 *
 * An idle player is left uncropped: previewing a bare transport with no artwork
 * is worse than previewing the app.
 */
function applyClip(win) {
  if (!alive(win)) return
  const r = lastRect
  if (!state.hasTrack || !r || r.width < 80 || r.height < 24) {
    win.setThumbnailClip({ x: 0, y: 0, width: 0, height: 0 })
    return
  }
  const content = win.getContentBounds()
  win.setThumbnailClip({
    x: Math.max(0, Math.round(r.x)),
    y: Math.max(0, Math.round(r.y)),
    width: Math.min(Math.round(r.width), content.width),
    height: Math.min(Math.round(r.height), content.height),
  })
}

/** Register the toolbar. Call once the taskbar button exists (post ready-to-show). */
function attach(win) {
  if (!alive(win) || attached) return
  attached = true
  // The count is locked in here, so a failure now means no toolbar for the
  // window's lifetime — worth a line in the log rather than silent absence.
  if (!paint(win)) console.warn('[synapz] taskbar thumbnail toolbar was rejected')
  applyClip(win) // the renderer may have reported its bounds before we attached
  win.on('closed', () => {
    attached = false
    lastRect = null
  })
}

/** Renderer pushed a new now-playing state. */
function update(win, next) {
  if (!WIN || !next) return
  const wasIdle = !state.hasTrack
  state.hasTrack = !!next.hasTrack
  state.isPlaying = !!next.isPlaying
  state.title = String(next.title || '')
  state.artist = String(next.artist || '')
  paint(win)
  // Only re-crop when the first track loads or the last one clears; play/pause
  // doesn't move the bar, and setThumbnailClip is a DWM round trip.
  const isIdle = !state.hasTrack
  if (wasIdle !== isIdle) applyClip(win)
}

/** Renderer measured its player bar (CSS px, relative to the content area). */
function setPlayerRect(win, rect) {
  if (!WIN || !rect) return
  lastRect = rect
  applyClip(win)
}

module.exports = { attach, update, setPlayerRect }
