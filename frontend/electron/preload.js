const { contextBridge, ipcRenderer } = require('electron');

// Expõe API segura para o renderer (React)
// onNavigate registra o callback UMA vez (remove o anterior se existir)
contextBridge.exposeInMainWorld('electronAPI', {
  onNavigate: (callback) => {
    ipcRenderer.removeAllListeners('navigate'); // evita acúmulo de listeners
    ipcRenderer.on('navigate', (_, route) => callback(route));
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
