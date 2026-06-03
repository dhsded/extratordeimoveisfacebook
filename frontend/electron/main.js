const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// ─── Caminhos ─────────────────────────────────────────────────────────────────
const IS_PACKAGED = app.isPackaged;
// Em produção: resources/  |  Em dev: raiz do projeto
const BACKEND_DIR = IS_PACKAGED
  ? process.resourcesPath
  : path.join(__dirname, '..', '..');

let win = null;
let backendProcess = null;

// ─── URL da Interface ─────────────────────────────────────────────────────────
function getAppURL(cb) {
  if (IS_PACKAGED) {
    // Produção: usa o React já compilado em dist/
    cb('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
    return;
  }

  // Dev: tenta Vite em localhost:5173
  let done = false;
  const req = http.get('http://localhost:5173', (res) => {
    res.destroy();
    if (!done) { done = true; cb('http://localhost:5173'); }
  });
  req.on('error', () => {
    if (!done) { done = true; cb('file://' + path.join(__dirname, '..', 'dist', 'index.html')); }
  });
  setTimeout(() => {
    if (!done) { done = true; req.destroy(); cb('file://' + path.join(__dirname, '..', 'dist', 'index.html')); }
  }, 2000);
}

// ─── Janela Principal ─────────────────────────────────────────────────────────
function createWindow(url) {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Extrator de Imóveis',
    backgroundColor: '#0a0f1e',
    icon: path.join(__dirname, 'icon.ico'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(url);

  win.webContents.on('did-finish-load', () => {
    if (!win.isVisible()) { win.show(); win.focus(); }
  });

  // Fallback: mostra em 8s
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); win.focus(); }
  }, 8000);

  // Impede navegação para URLs externas dentro da janela principal
  win.webContents.on('will-navigate', (event, targetUrl) => {
    const isInternal = targetUrl.startsWith('http://localhost:5173') ||
                       targetUrl.startsWith('file://');
    if (!isInternal) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Recuperação automática de crash do renderer
  win.webContents.on('render-process-gone', (_, details) => {
    if (details.reason !== 'killed') {
      setTimeout(() => { if (win && !win.isDestroyed()) win.reload(); }, 1500);
    }
  });

  // IPC — cookies do Facebook (webview)
  ipcMain.handle('facebook:getCookies', async () => {
    try {
      const ses = session.fromPartition('persist:facebook');
      const cookies = await ses.cookies.get({ domain: '.facebook.com' });
      return { ok: true, cookies };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('facebook:isLoggedIn', async () => {
    try {
      const ses = session.fromPartition('persist:facebook');
      const cookies = await ses.cookies.get({ domain: '.facebook.com', name: 'c_user' });
      return { loggedIn: cookies.length > 0 };
    } catch { return { loggedIn: false }; }
  });

  win.on('closed', () => { win = null; });
}

// ─── Backend ──────────────────────────────────────────────────────────────────
function startBackend() {
  const backendScript = path.join(BACKEND_DIR, 'src', 'main.js');

  // Verifica se já está rodando
  const req = http.get('http://localhost:3001/api/health', () => {});
  req.on('error', () => {
    // Encontra o executável node — em produção usa o node empacotado se disponível
    const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node';

    backendProcess = spawn(nodeBin, [backendScript], {
      cwd: BACKEND_DIR,
      stdio: IS_PACKAGED ? 'ignore' : 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'production' },
    });

    backendProcess.on('error', (err) => {
      console.error('[Backend] Falha ao iniciar:', err.message);
    });
  });
  req.setTimeout(2000, () => req.destroy());
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend();
  // Aguarda 1s para o backend subir antes de abrir a janela
  setTimeout(() => {
    getAppURL((url) => createWindow(url));
  }, IS_PACKAGED ? 2000 : 0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) { try { backendProcess.kill(); } catch (_) {} }
});
