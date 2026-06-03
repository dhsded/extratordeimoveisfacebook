const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onNavigate: (callback) => {
    ipcRenderer.removeAllListeners('navigate');
    ipcRenderer.on('navigate', (_, route) => callback(route));
  },
  // Facebook webview helpers
  facebook: {
    getCookies:  () => ipcRenderer.invoke('facebook:getCookies'),
    isLoggedIn:  () => ipcRenderer.invoke('facebook:isLoggedIn'),
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
