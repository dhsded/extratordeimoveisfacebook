const { contextBridge, ipcRenderer } = require('electron');

// Expõe API segura para o renderer (React)
contextBridge.exposeInMainWorld('electronAPI', {
  onNavigate: (callback) => ipcRenderer.on('navigate', (_, route) => callback(route)),
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
