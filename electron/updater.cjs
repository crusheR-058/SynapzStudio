// Automatic updates, via electron-updater against the GitHub Releases feed.
//
// The shape of it: on launch (and every 6h, for machines that never quit the
// app) we ask GitHub whether a newer version exists. If one does it downloads in
// the background, and installs when the user quits — so an update never
// interrupts playback, and the next launch is simply the new version. The
// renderer gets told what's happening so it can offer "Restart now" to anyone
// who doesn't want to wait for their next launch.
//
// This works because electron-builder publishes `latest.yml` (Windows) /
// `latest-mac.yml` alongside the installers on every release; that file is what
// carries the version + checksum this module compares against. The release
// workflow already uploads them — a release missing its .yml is invisible here.
//
// Packaged builds only: an unpackaged run has no app-update.yml, so the updater
// would throw on the first check.

const { app } = require('electron')
const { autoUpdater } = require('electron-updater')

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h

let win = null
let timer = null
// Latest status, replayed to the renderer when it mounts — the first check can
// easily finish before the UI is listening.
let last = { state: 'idle' }

function post(status) {
  // 'ready' is sticky: the update is staged on disk and will install on quit no
  // matter what a later check says, so a subsequent failed or empty check must
  // not retract the offer to restart.
  if (last.state === 'ready' && status.state !== 'ready') return
  last = status
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
}

/**
 * Start the update loop. No-op outside a packaged build.
 * @param {import('electron').BrowserWindow} browserWindow
 */
function start(browserWindow) {
  win = browserWindow
  if (!app.isPackaged) return

  // We install on quit rather than mid-session, so the user is never yanked out
  // of a track. `autoDownload` keeps the wait short when they do restart.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = {
    info: (m) => console.log('[synapz-update]', m),
    warn: (m) => console.warn('[synapz-update]', m),
    error: (m) => console.error('[synapz-update]', m),
    debug: () => {},
  }

  autoUpdater.on('update-available', (info) => post({ state: 'downloading', version: info.version }))
  autoUpdater.on('update-not-available', () => post({ state: 'idle' }))
  autoUpdater.on('download-progress', (p) =>
    post({ state: 'downloading', percent: Math.round(p.percent || 0), version: last.version }),
  )
  autoUpdater.on('update-downloaded', (info) => post({ state: 'ready', version: info.version }))
  // A failed check must never be fatal — no network, a rate-limited API, or a
  // release published without its .yml would all land here, and none of them are
  // a reason to bother someone who just wants to play music.
  autoUpdater.on('error', (err) => {
    console.error('[synapz-update] check failed:', err?.message || err)
    post({ state: 'idle' })
  })

  check()
  timer = setInterval(check, CHECK_INTERVAL_MS)
  app.on('before-quit', () => clearInterval(timer))
}

function check() {
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[synapz-update] check failed:', err?.message || err)
  })
}

/** Current status — lets a freshly-mounted renderer catch up. */
function status() {
  return last
}

/** Install the downloaded update now and relaunch. */
function restart() {
  if (last.state !== 'ready') return
  // isSilent=false so NSIS shows its progress UI; isForceRunAfter=true so the
  // app comes back up rather than leaving the user staring at the desktop.
  autoUpdater.quitAndInstall(false, true)
}

module.exports = { start, status, restart }
