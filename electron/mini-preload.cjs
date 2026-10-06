// Preload for the mini player window — the few channels it needs, nothing else.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mini', {
  control: (action) => ipcRenderer.send('mini:control', action),
  close: () => ipcRenderer.send('mini:close'),
  expand: () => ipcRenderer.send('mini:expand'),
  getState: () => ipcRenderer.invoke('mini:state'),
  onState: (cb) => ipcRenderer.on('mini:state', (_e, state) => cb(state)),
})
