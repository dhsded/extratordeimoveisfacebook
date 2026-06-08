const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onNavigate: (callback) => {
    ipcRenderer.removeAllListeners('navigate');
    ipcRenderer.on('navigate', (_, route) => callback(route));
  },
  // Facebook webview/window helpers
  facebook: {
    getCookies:  () => ipcRenderer.invoke('facebook:getCookies'),
    isLoggedIn:  () => ipcRenderer.invoke('facebook:isLoggedIn'),
    open:        (url) => ipcRenderer.invoke('facebook:open', url),
    close:       () => ipcRenderer.invoke('facebook:close'),
    navigate:    (url) => ipcRenderer.invoke('facebook:navigate', url),
    executeJavaScript: (script) => ipcRenderer.invoke('facebook:executeJavaScript', script),
    isWindowOpen: () => ipcRenderer.invoke('facebook:isWindowOpen'),
    getUrl:      () => ipcRenderer.invoke('facebook:getUrl'),
    goBack:      () => ipcRenderer.invoke('facebook:goBack'),
    goForward:   () => ipcRenderer.invoke('facebook:goForward'),
    reload:      () => ipcRenderer.invoke('facebook:reload'),
    onNavigate:  (callback) => {
      ipcRenderer.removeAllListeners('facebook:on-navigate');
      ipcRenderer.on('facebook:on-navigate', (_, url) => callback(url));
    },
    onClosed:    (callback) => {
      ipcRenderer.removeAllListeners('facebook:on-closed');
      ipcRenderer.on('facebook:on-closed', () => callback());
    }
  },
  // Controle de coleta em segundo plano
  scraping: {
    start: () => ipcRenderer.invoke('scraping:start'),
    stop:  () => ipcRenderer.invoke('scraping:stop'),
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
