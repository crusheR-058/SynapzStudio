// Preload bridge: exposes a tiny, safe API to the renderer (the React app).
// contextIsolation is on, so the renderer can't touch Node/Electron directly —
// it only sees `window.synapz` with these three methods.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('synapz', {
  // Lets the web UI detect it's running inside the desktop shell.
  isDesktop: true,
  // Fire-and-forget now-playing updates (main-process debounces + relays them).
  setPresence: (data) => ipcRenderer.send('discord:set', data),
  clearPresence: () => ipcRenderer.send('discord:clear'),
  // For the Account-page status indicator.
  discordStatus: () => ipcRenderer.invoke('discord:status'),
})
