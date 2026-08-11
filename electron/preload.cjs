// Preload bridge: exposes a tiny, safe API to the renderer (the React app).
// contextIsolation is on, so the renderer can't touch Node/Electron directly —
// it only sees `window.synapz` with the handful of methods below.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('synapz', {
  // Lets the web UI detect it's running inside the desktop shell.
  isDesktop: true,
  // Fire-and-forget now-playing updates (main-process debounces + relays them).
  setPresence: (data) => ipcRenderer.send('discord:set', data),
  clearPresence: () => ipcRenderer.send('discord:clear'),
  // For the Account-page status indicator.
  discordStatus: () => ipcRenderer.invoke('discord:status'),

  // Windows taskbar mini-player: mirror now-playing + the player bar's bounds
  // up to the main process, and take transport clicks back down from it.
  setNowPlaying: (state) => ipcRenderer.send('media:state', state),
  setPlayerRect: (rect) => ipcRenderer.send('media:player-rect', rect),
  onMediaControl: (cb) => {
    const listener = (_e, action) => cb(action)
    ipcRenderer.on('media:control', listener)
    return () => ipcRenderer.removeListener('media:control', listener)
  },

  // OAuth: open the provider URL in the system browser; receive the synapz://
  // deep-link callback back from the main process.
  openOAuth: (url) => ipcRenderer.send('oauth:open-external', url),
  consumePendingOAuth: () => ipcRenderer.invoke('oauth:consume-pending'),
  onOAuthCallback: (cb) => {
    const listener = (_e, url) => cb(url)
    ipcRenderer.on('oauth-callback', listener)
    return () => ipcRenderer.removeListener('oauth-callback', listener)
  },
})
