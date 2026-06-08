const { app, BrowserWindow, shell, ipcMain, session, powerSaveBlocker } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

// ─── Flags para manter coleta ativa mesmo em segundo plano ───────────────────
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

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
  const dirs = [userData, path.join(userData, 'sessions', 'profile1')];
  dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

  const dbDest = path.join(userData, 'imoveis.db');
  if (!fs.existsSync(dbDest)) {
    const dbSrc = IS_PACKAGED
      ? path.join(process.resourcesPath, 'data', 'imoveis.db')
      : path.join(BACKEND_DIR, 'prisma', 'data', 'imoveis.db');
    if (fs.existsSync(dbSrc)) fs.copyFileSync(dbSrc, dbDest);
  }
  return userData;
}

// ─── URL da Interface ─────────────────────────────────────────────────────────
function getAppURL(cb) {
  if (IS_PACKAGED) {
    cb('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
    return;
  }
  const req = http.get('http://localhost:5173', (res) => {
    res.destroy();
    cb('http://localhost:5173');
  });
  req.on('error', () => {
    cb('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
  });
  req.setTimeout(2000, () => { req.destroy(); });
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
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(url);

  win.webContents.on('did-finish-load', () => {
    win.webContents.setBackgroundThrottling(false);
    if (!win.isVisible()) { win.show(); win.focus(); }
  });

  // Fallback: mostra a janela após 8s caso did-finish-load não dispare
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); win.focus(); }
  }, 8000);

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

  win.on('closed', () => { win = null; });
}

// ─── Backend ──────────────────────────────────────────────────────────────────
function startBackend(userData) {
  // Em DEV: backend já roda externamente (Iniciar.bat / node src/main.js)
  if (!IS_PACKAGED) return;

  const backendScript = path.join(process.resourcesPath, 'src', 'main.js');
  const dbPath        = path.join(userData, 'imoveis.db');
  const sessionsDir   = path.join(userData, 'sessions', 'profile1');

  backendProcess = spawn(process.execPath, [backendScript], {
    cwd: process.resourcesPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ASAR: '1',
      NODE_ENV: 'production',
      APP_DATA_DIR: userData,
      DATABASE_URL: `file:${dbPath}`,
      FB_SESSION_DIR: sessionsDir,
      API_PORT: '3001',
    },
    stdio: 'pipe',
    shell: false,
  });

  backendProcess.stderr?.on('data', d => console.error('[Backend]', d.toString()));
  backendProcess.on('error', err => console.error('[Backend] Erro:', err.message));
  backendProcess.on('exit', code => { if (code !== 0) console.error('[Backend] Saiu:', code); });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const userData = prepareUserData();
  startBackend(userData);

  // ── IPC: Facebook cookies ──────────────────────────────────────────────────
  ipcMain.removeHandler('facebook:getCookies');
  ipcMain.handle('facebook:getCookies', async () => {
    try {
      const ses = session.fromPartition('persist:facebook');
      const cookies = await ses.cookies.get({ domain: '.facebook.com' });
      return { ok: true, cookies };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.removeHandler('facebook:isLoggedIn');
  ipcMain.handle('facebook:isLoggedIn', async () => {
    try {
      const ses = session.fromPartition('persist:facebook');
      const cookies = await ses.cookies.get({ domain: '.facebook.com', name: 'c_user' });
      return { loggedIn: cookies.length > 0 };
    } catch { return { loggedIn: false }; }
  });

  // ── IPC: controle de coleta em segundo plano ───────────────────────────────
  let psBlockerId = null;
  ipcMain.removeHandler('scraping:start');
  ipcMain.handle('scraping:start', () => {
    if (!psBlockerId) psBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    return { ok: true };
  });
  ipcMain.removeHandler('scraping:stop');
  ipcMain.handle('scraping:stop', () => {
    if (psBlockerId !== null) { powerSaveBlocker.stop(psBlockerId); psBlockerId = null; }
    return { ok: true };
  });

  // Abre a janela
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
