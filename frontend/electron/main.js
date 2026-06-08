const { app, BrowserWindow, shell, ipcMain, session, powerSaveBlocker } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

// ─── Log em arquivo para capturar crashes ─────────────────────────────────────
const LOG_DIR  = path.join(app.getPath('userData'), '..', 'Extrator de Imoveis - Logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'electron.log');
const log = (...args) => {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
};

process.on('uncaughtException',      err => log('CRASH uncaughtException:', err.stack || err));
process.on('unhandledRejection',     err => log('CRASH unhandledRejection:', err));

log('=== Electron iniciando ===');
log('IS_PACKAGED:', app.isPackaged);
log('Electron:', process.versions.electron);

// ─── Flags para estabilidade e coleta em segundo plano ───────────────────────
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ─── Configuração ─────────────────────────────────────────────────────────────
const IS_PACKAGED = app.isPackaged;
const BACKEND_DIR = IS_PACKAGED
  ? process.resourcesPath
  : path.join(__dirname, '..', '..');

let win = null;
let backendProcess = null;

// ─── Dados do usuário ─────────────────────────────────────────────────────────
function prepareUserData() {
  const userData = app.getPath('userData');
  [userData, path.join(userData, 'sessions', 'profile1')].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const dbDest = path.join(userData, 'imoveis.db');
  if (!fs.existsSync(dbDest)) {
    const dbSrc = IS_PACKAGED
      ? path.join(process.resourcesPath, 'data', 'imoveis.db')
      : path.join(BACKEND_DIR, 'prisma', 'data', 'imoveis.db');
    if (fs.existsSync(dbSrc)) fs.copyFileSync(dbSrc, dbDest);
  }
  return userData;
}

// ─── URL da interface ─────────────────────────────────────────────────────────
function getAppURL(cb) {
  if (IS_PACKAGED) {
    cb('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
    return;
  }
  let done = false;
  const req = http.get('http://localhost:5173', (res) => {
    res.destroy();
    if (!done) { done = true; log('URL: localhost:5173'); cb('http://localhost:5173'); }
  });
  req.on('error', () => {
    if (!done) { done = true; log('URL fallback: dist/index.html'); cb('file://' + path.join(__dirname, '..', 'dist', 'index.html')); }
  });
  setTimeout(() => {
    if (!done) { done = true; req.destroy(); log('URL timeout fallback'); cb('http://localhost:5173'); }
  }, 3000);
}

// ─── Janela ───────────────────────────────────────────────────────────────────
function createWindow(url) {
  log('createWindow:', url);

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
  win.loadURL(url).catch(err => log('loadURL error:', err.message));

  win.webContents.on('did-finish-load', () => {
    log('did-finish-load OK');
    win.webContents.setBackgroundThrottling(false);
    if (win && !win.isVisible()) { win.show(); win.focus(); }
    // Abre DevTools para capturar erros do renderer
    if (!IS_PACKAGED) win.webContents.openDevTools({ mode: 'detach' });
  });

  // Captura erros do console do renderer
  win.webContents.on('console-message', (e, level, msg, line, src) => {
    if (level >= 2) log(`RENDERER [L${level}] ${msg} (${src}:${line})`);
  });

  win.webContents.on('did-fail-load', (e, code, desc) => {
    log('did-fail-load:', code, desc);
  });

  win.webContents.on('render-process-gone', (_, details) => {
    log('render-process-gone:', details.reason, details.exitCode);
    if (details.reason !== 'killed' && details.reason !== 'clean-exit') {
      setTimeout(() => { if (win && !win.isDestroyed()) { log('Recarregando...'); win.reload(); } }, 2000);
    }
  });

  // Fallback show
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); win.focus(); }
  }, 8000);

  win.webContents.on('will-navigate', (event, targetUrl) => {
    const ok = targetUrl.startsWith('http://localhost:5173') || targetUrl.startsWith('file://');
    if (!ok) { event.preventDefault(); shell.openExternal(targetUrl); }
  });

  win.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: 'deny' };
  });

  win.on('closed', () => { log('Janela fechada'); win = null; });
}

// ─── Backend (apenas em produção) ─────────────────────────────────────────────
function startBackend(userData) {
  if (!IS_PACKAGED) { log('DEV: backend externo, nao iniciando'); return; }

  const backendScript = path.join(process.resourcesPath, 'src', 'main.js');
  const dbPath        = path.join(userData, 'imoveis.db');

  backendProcess = spawn(process.execPath, [backendScript], {
    cwd: process.resourcesPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ASAR: '1',
      NODE_ENV: 'production',
      APP_DATA_DIR: userData,
      DATABASE_URL: `file:${dbPath}`,
      FB_SESSION_DIR: path.join(userData, 'sessions', 'profile1'),
      API_PORT: '3001',
    },
    stdio: 'pipe',
    shell: false,
  });

  backendProcess.stderr?.on('data', d => log('[Backend stderr]', d.toString().trim()));
  backendProcess.on('error', err => log('[Backend] erro:', err.message));
  backendProcess.on('exit', code => log('[Backend] saiu:', code));
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  log('app.whenReady');
  const userData = prepareUserData();
  startBackend(userData);

  // IPC: Facebook
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

  // IPC: coleta em segundo plano
  let psId = null;
  ipcMain.removeHandler('scraping:start');
  ipcMain.handle('scraping:start', () => {
    if (!psId) psId = powerSaveBlocker.start('prevent-app-suspension');
    return { ok: true };
  });
  ipcMain.removeHandler('scraping:stop');
  ipcMain.handle('scraping:stop', () => {
    if (psId !== null) { powerSaveBlocker.stop(psId); psId = null; }
    return { ok: true };
  });

  const delay = IS_PACKAGED ? 3000 : 0;
  setTimeout(() => getAppURL(url => createWindow(url)), delay);
}).catch(err => log('whenReady ERRO:', err));

app.on('window-all-closed', () => {
  log('window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) { try { backendProcess.kill('SIGTERM'); } catch (_) {} }
});
