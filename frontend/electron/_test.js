const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600, show: true });
  win.loadURL('data:text/html,<h1 style="font-family:sans-serif;padding:40px">Electron OK!</h1>');
  win.webContents.on('did-finish-load', () => console.log('JANELA ABRIU COM SUCESSO'));
});
app.on('window-all-closed', () => app.quit());
