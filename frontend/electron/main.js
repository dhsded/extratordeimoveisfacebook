const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

// ─── Configuração ─────────────────────────────────────────────────────────────
const IS_PACKAGED = app.isPackaged;
const BACKEND_DIR = IS_PACKAGED
  ? process.resourcesPath
  : path.join(__dirname, '..', '..');

let win = null;
let backendProcess = null;

// ─── Prepara pasta de dados do usuário ───────────────────────────────────────
function prepareUserData() {
  const userData = app.getPath('userData');

  // Cria pastas necessárias
  const dirs = [
    userData,
    path.join(userData, 'sessions', 'profile1'),
  ];
  dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

  // Copia banco de dados inicial se não existir ainda
  const dbDest = path.join(userData, 'imoveis.db');
  if (!fs.existsSync(dbDest)) {
    const dbSrc = IS_PACKAGED
      ? path.join(process.resourcesPath, 'data', 'imoveis.db')
      : path.join(BACKEND_DIR, 'prisma', 'data', 'imoveis.db');
    if (fs.existsSync(dbSrc)) {
      fs.copyFileSync(dbSrc, dbDest);
    }
  }

  return userData;
}

// ─── URL da Interface ─────────────────────────────────────────────────────────
function getAppURL(cb) {
  if (IS_PACKAGED) {
    cb('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
    return;
  }
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

  // Fallback show
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); win.focus(); }
  }, 8000);

  // Bloqueia navegação para URLs externas na janela principal
  win.webContents.on('will-navigate', (event, targetUrl) => {
    const isInternal = targetUrl.startsWith('http://localhost:5173') ||
                       targetUrl.startsWith('file://');
    if (!isInternal) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  win.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: 'deny' };
  });

  win.webContents.on('render-process-gone', (_, details) => {
    if (details.reason !== 'killed') {
      setTimeout(() => { if (win && !win.isDestroyed()) win.reload(); }, 1500);
    }
  });

  // ─── IPC Facebook cookies ───────────────────────────────────────────────────
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

// ─── Backend (integrado via ELECTRON_RUN_AS_NODE) ─────────────────────────────
function startBackend(userData) {
  const backendScript = path.join(BACKEND_DIR, 'src', 'main.js');
  const dbPath        = path.join(userData, 'imoveis.db');
  const sessionsDir   = path.join(userData, 'sessions', 'profile1');

  const env = {
    ...process.env,
    // Faz o Electron agir como Node.js puro — sem UI, apenas runtime
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ASAR: '1',
    NODE_ENV: IS_PACKAGED ? 'production' : (process.env.NODE_ENV || 'development'),
    // Diretório de dados do usuário (gravável mesmo no Program Files)
    APP_DATA_DIR: userData,
    // URL do banco de dados SQLite com caminho absoluto
    DATABASE_URL: `file:${dbPath}`,
    // Pasta de sessão do Playwright
    FB_SESSION_DIR: sessionsDir,
    // Porta da API
    API_PORT: '3001',
  };

  // Em produção: usa o próprio .exe do Electron como runtime Node.js
  // Em dev: usa o node do sistema
  const [exe, args] = IS_PACKAGED
    ? [process.execPath, [backendScript]]
    : ['node', [backendScript]];

  backendProcess = spawn(exe, args, {
    cwd: IS_PACKAGED ? process.resourcesPath : BACKEND_DIR,
    env,
    stdio: IS_PACKAGED ? 'pipe' : 'inherit',
    shell: false,
  });

  if (IS_PACKAGED && backendProcess.stderr) {
    backendProcess.stderr.on('data', d => console.error('[Backend]', d.toString()));
  }

  backendProcess.on('error', err => {
    console.error('[Backend] Falha ao iniciar:', err.message);
  });

  backendProcess.on('exit', (code) => {
    if (code !== 0) console.error('[Backend] Saiu com código:', code);
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const userData = prepareUserData();
  startBackend(userData);

  // Aguarda o backend subir antes de abrir a janela
  const delay = IS_PACKAGED ? 3000 : 0;
  setTimeout(() => {
    getAppURL((url) => createWindow(url));
  }, delay);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) {
    try { backendProcess.kill('SIGTERM'); } catch (_) {}
  }
});
