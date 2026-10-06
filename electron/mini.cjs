// Mini player — a small always-on-top window with the artwork and transport.
//
// It is a remote control, not a second player. Audio keeps coming from the main
// window; this one only mirrors the now-playing state the renderer already
// pushes (the same feed as the taskbar thumbnail and the tray) and sends button
// presses back down the `media:control` channel. Loading the full app here
// would start a second audio engine fighting the first.

const { BrowserWindow, ipcMain, screen } = require('electron')
const path = require('node:path')

const WIDTH = 360
const HEIGHT = 112
const MARGIN = 20

let mini = null
let hooks = null // { getWindow, showWindow }
let last = { hasTrack: false, isPlaying: false, title: '', artist: '', artwork: '' }

const alive = () => mini && !mini.isDestroyed()

function push() {
  if (alive()) mini.webContents.send('mini:state', last)
}

function open() {
  if (alive()) {
    mini.show()
    return
  }
  const area = screen.getPrimaryDisplay().workArea
  mini = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: area.x + area.width - WIDTH - MARGIN,
    y: area.y + area.height - HEIGHT - MARGIN,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#121214',
    title: 'Synapz Mini Player',
    webPreferences: {
      preload: path.join(__dirname, 'mini-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mini.loadFile(path.join(__dirname, 'mini.html'))
  mini.once('ready-to-show', () => {
    mini.show()
    push()
  })
  mini.on('closed', () => {
    mini = null
  })
  // The point of the mini player is to get the big window out of the way.
  const main = hooks?.getWindow()
  if (main && !main.isDestroyed() && main.isVisible()) main.minimize()
}

function close() {
  if (alive()) mini.close()
}

function toggle() {
  if (alive()) close()
  else open()
}

/** Renderer pushed a new now-playing state. */
function update(next) {
  if (!next) return
  last = {
    hasTrack: !!next.hasTrack,
    isPlaying: !!next.isPlaying,
    title: String(next.title || ''),
    artist: String(next.artist || ''),
    artwork: typeof next.artwork === 'string' ? next.artwork : '',
  }
  push()
}

/** Call once the app is ready. */
function init(h) {
  hooks = h
  const fromMini = (e) => alive() && e.sender === mini.webContents

  ipcMain.on('mini:control', (e, action) => {
    if (!fromMini(e)) return
    if (!['prev', 'playpause', 'next'].includes(action)) return
    const main = hooks.getWindow()
    if (main && !main.isDestroyed()) main.webContents.send('media:control', action)
  })
  ipcMain.on('mini:close', (e) => fromMini(e) && close())
  ipcMain.on('mini:expand', (e) => {
    if (!fromMini(e)) return
    close()
    hooks.showWindow()
  })
  ipcMain.handle('mini:state', (e) => (fromMini(e) ? last : null))
}

module.exports = { init, toggle, close, update }
