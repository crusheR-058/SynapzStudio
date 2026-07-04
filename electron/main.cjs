// Synapz Music — Electron main process.
//
// Responsibilities:
//   1. In a packaged build, boot the bundled Express backend (server/index.mjs)
//      which serves BOTH the built UI and the /api + /yt routes on localhost, so
//      everything is same-origin and yt-dlp / auth work natively.
//   2. Open the app window (Vite dev server in dev, the local backend in prod).
//   3. Own the Discord Rich Presence connection and relay renderer IPC to it.

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const discord = require('./discord-presence.cjs')

// Load the repo's .env in dev so DISCORD_CLIENT_ID is picked up (the backend
// runs in a separate process, so its env doesn't reach us). No-op if absent.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'))
} catch {
  /* no .env — fine */
}

// Discord Application (Client) ID — from https://discord.com/developers/applications
// (the app should be named "Synapz Music", which is what shows after "Listening
// to"). Baked in so it ships inside packaged builds; DISCORD_CLIENT_ID in the
// environment overrides it. This id is a public identifier, safe to commit.
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1523020362802270290'

// Dev loads the Vite server (hot reload); prod loads the bundled UI off the
// backend. SYNAPZ_PROD=1 forces the prod path in an unpackaged run — handy for
// testing the real flow without building an installer.
const isDev = !app.isPackaged && process.env.SYNAPZ_PROD !== '1'
const DEV_URL = 'http://localhost:5173' // Vite dev server (proxies /api + /yt)
const BACKEND_PORT = Number(process.env.PORT) || 8787
const PROD_URL = `http://localhost:${BACKEND_PORT}` // backend serves UI + api

let win = null
let backend = null // http.Server

async function startBackend() {
  // In a packaged build, point the backend at the yt-dlp binary shipped under
  // resources/bin. In dev it falls back to the repo's ./bin (see server/index.mjs).
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    process.env.YTDLP_PATH = path.join(process.resourcesPath, 'bin', exe)
  }
  const serverEntry = path.join(__dirname, '..', 'server', 'index.mjs')
  const mod = await import(pathToFileURL(serverEntry).href)
  backend = await mod.startBackend(BACKEND_PORT)
}

async function loadApp() {
  const url = isDev ? DEV_URL : PROD_URL
  // In dev, Electron may start before Vite is listening — retry the load.
  try {
    await win.loadURL(url)
  } catch (err) {
    if (isDev) {
      setTimeout(loadApp, 600)
      return
    }
    throw err
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0a0a0c',
    title: 'Synapz Music',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // The app streams audio; allow it to start without a synthetic gesture.
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  // Open real external links (Spotify, GitHub, …) in the system browser rather
  // than a bare Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  win.webContents.on('did-finish-load', () =>
    console.log('[synapz] UI loaded:', win.webContents.getURL()),
  )
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error('[synapz] UI failed to load:', code, desc, url),
  )

  win.on('closed', () => {
    win = null
  })

  loadApp()
}

// --- single instance ----------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    if (DISCORD_CLIENT_ID) discord.connect(DISCORD_CLIENT_ID)

    // Always run the backend from the main process: in prod it serves the UI +
    // /api + /yt; in dev the Vite server proxies /api + /yt to it. (So the
    // dev:electron script does NOT start a separate `node server/index.mjs`.)
    try {
      await startBackend()
    } catch (err) {
      console.error('[synapz] backend failed to start:', err)
    }

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// --- Discord IPC from the renderer --------------------------------------
ipcMain.on('discord:set', (_e, data) => discord.setPresence(data))
ipcMain.on('discord:clear', () => discord.clearPresence())
ipcMain.handle('discord:status', () => ({
  configured: !!DISCORD_CLIENT_ID,
  connected: discord.isConnected(),
}))

// --- lifecycle ----------------------------------------------------------
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await discord.destroy()
  try {
    backend?.close()
  } catch {
    /* noop */
  }
})
