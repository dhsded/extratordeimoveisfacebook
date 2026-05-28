const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
let win = null;
let backendProcess = null;

// Detecta se usa Vite ou dist — callback chamado UMA ÚNICA VEZ
function getAppURL(cb) {
  let done = false; // impede dupla chamada

  const req = http.get('http://localhost:5173', (res) => {
    res.destroy();
    if (!done) { done = true; cb('http://localhost:5173'); }
  });

  req.on('error', () => {
    if (!done) {
      done = true;
      cb('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
    }
  });

  // Timeout: se não responder em 2s, usa dist
  setTimeout(() => {
    if (!done) {
      done = true;
      req.destroy();
      cb('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
    }
  }, 2000);
}

function createWindow(url) {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Extrator de Imóveis',
    backgroundColor: '#0a0f1e',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(url);

  // Mostra quando a página estiver pronta
  win.webContents.on('did-finish-load', () => {
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
  });

  // Fallback: mostra em 6 segundos de qualquer forma
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 6000);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

function startBackend() {
  const req = http.get('http://localhost:3001/api/health', () => {});
  req.on('error', () => {
    backendProcess = spawn('node', [path.join(ROOT_DIR, 'src', 'main.js')], {
      cwd: ROOT_DIR, stdio: 'inherit', shell: true,
    });
  });
  req.setTimeout(2000, () => req.destroy());
}

app.whenReady().then(() => {
  startBackend();
  getAppURL((url) => createWindow(url));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});
