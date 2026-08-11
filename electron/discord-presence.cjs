// Discord Rich Presence for the Synapz desktop app.
//
// Runs in Electron's MAIN process (it needs a local IPC socket to the Discord
// desktop client — `\\.\pipe\discord-ipc-0` on Windows, a unix socket on macOS
// — which a renderer/browser can't reach). The renderer sends now-playing data
// over Electron IPC; this module relays it to Discord as a "Listening" activity.
//
// Everything here is best-effort: if Discord isn't running, or a request fails,
// we swallow it and keep retrying. Presence must NEVER affect playback.

const { Client } = require('@xhayper/discord-rpc')

let client = null
let ready = false
let connecting = false
let clientId = null
let retryTimer = null

// We coalesce bursts (rapid skip/seek) into a single Discord update. Discord
// rate-limits SET_ACTIVITY to ~5 / 20s, so a trailing debounce keeps us safe.
let pending = null // { kind: 'set', activity } | { kind: 'clear' }
let flushTimer = null
const DEBOUNCE_MS = 700

function log(...a) {
  if (process.env.SYNAPZ_DEBUG) console.log('[discord]', ...a)
}

function scheduleRetry() {
  if (retryTimer || !clientId) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    connect(clientId)
  }, 10_000)
}

function connect(id) {
  clientId = id || clientId
  if (!clientId) return
  if (connecting || ready) return
  connecting = true

  client = new Client({ clientId })
  client.on('ready', () => {
    connecting = false
    ready = true
    log('connected as', client.user?.username)
    flush() // apply whatever the renderer asked for while we were connecting
  })
  client.on('disconnected', () => {
    ready = false
    log('disconnected')
    scheduleRetry()
  })
  client.login().catch((err) => {
    connecting = false
    ready = false
    log('login failed:', err?.message || err)
    scheduleRetry() // Discord probably isn't running yet — try again later
  })
}

function isConnected() {
  return !!(ready && client && client.user)
}

// ---- activity building -------------------------------------------------

function clip(s, n) {
  const v = (s == null ? '' : String(s)).trim()
  return v ? v.slice(0, n) : undefined
}

function toActivity(d) {
  const title = clip(d.title, 128) || 'Unknown track'
  const artist = clip(d.artist, 120) || 'Unknown artist'

  const activity = {
    type: 2, // ActivityType.Listening -> "Listening to Synapz Music"
    name: 'Synapz Music',
    details: title, // line 1
    state: `by ${artist}`, // line 2
    largeImageText: title,
    smallImageText: d.isPlaying ? 'Playing' : 'Paused',
    // Small badge overlaid on the art. These are asset KEYS you upload in the
    // Discord dev portal (Rich Presence -> Art Assets). If absent, nothing shows
    // — harmless.
    smallImageKey: d.isPlaying ? 'playing' : 'paused',
  }

  // Album art: the URL goes in largeImageKey -> assets.large_image (the field
  // Discord actually DISPLAYS; it proxies raw https URLs). largeImageUrl maps to
  // assets.large_url, which is only a click-through link, not the image. Fall
  // back to an uploaded "synapz_logo" asset key when the track has no artwork.
  if (typeof d.artwork === 'string' && /^https?:\/\//.test(d.artwork)) {
    activity.largeImageKey = d.artwork
  } else {
    activity.largeImageKey = 'synapz_logo'
  }

  // Listen Along: while the user is hosting a session, put a join button on
  // their profile. Discord allows at most 2 buttons and requires http(s) URLs;
  // it renders them for people VIEWING the profile, never for the owner — so
  // the host can't see their own button, which is expected, not a bug.
  //
  // The URL is the web app, not a synapz:// deep link: Discord only accepts
  // http(s), and a viewer may not have the desktop app yet. The web page is
  // what offers them the download and then hands off into the app.
  if (typeof d.listenUrl === 'string' && /^https:\/\//.test(d.listenUrl)) {
    activity.buttons = [{ label: '🎧 Listen Along', url: d.listenUrl }]
  }

  // Progress bar: Discord animates it from start/end timestamps, so we only
  // send them once per change (no per-second updates). Omitted while paused so
  // the bar freezes instead of drifting.
  if (d.isPlaying && d.durationSec > 0) {
    const now = Date.now()
    const start = now - Math.max(0, Math.floor(d.positionSec || 0)) * 1000
    activity.startTimestamp = start
    activity.endTimestamp = start + Math.floor(d.durationSec) * 1000
  }

  return activity
}

// ---- public API --------------------------------------------------------

function setPresence(data) {
  pending = { kind: 'set', activity: toActivity(data || {}) }
  flushSoon()
}

function clearPresence() {
  pending = { kind: 'clear' }
  flushSoon()
}

function flushSoon() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, DEBOUNCE_MS)
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!isConnected() || !pending) return // keep `pending` until we're connected
  const job = pending
  pending = null
  const p =
    job.kind === 'clear' ? client.user.clearActivity() : client.user.setActivity(job.activity)
  Promise.resolve(p).catch((err) => log('activity update failed:', err?.message || err))
}

async function destroy() {
  if (flushTimer) clearTimeout(flushTimer)
  if (retryTimer) clearTimeout(retryTimer)
  flushTimer = retryTimer = pending = null
  try {
    if (isConnected()) await client.user.clearActivity()
  } catch {
    /* noop */
  }
  try {
    if (client) await client.destroy()
  } catch {
    /* noop */
  }
  client = null
  ready = connecting = false
}

module.exports = { connect, setPresence, clearPresence, isConnected, destroy }
