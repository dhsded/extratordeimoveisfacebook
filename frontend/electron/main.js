const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// ─── Configurações ────────────────────────────────────────────────────────────
const API_PORT = 3001;
const isDev = process.env.NODE_ENV === 'development';
const ROOT_DIR = path.join(__dirname, '..', '..'); // raiz do projeto

let mainWindow = null;
let splashWindow = null;
let tray = null;
let backendProcess = null;

// ─── Ícone ────────────────────────────────────────────────────────────────────
function getIcon() {
  const iconPath = path.join(__dirname, 'icon.png');
  try {
    return nativeImage.createFromPath(iconPath);
  } catch {
    return nativeImage.createEmpty();
  }
}

// ─── Splash Screen ────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

// ─── Janela Principal ─────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    icon: getIcon(),
    title: 'Extrator de Imóveis',
    backgroundColor: '#0a0f1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Em dev carrega o Vite; em produção carrega o build
  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Abre links externos no browser padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    // Minimiza para tray em vez de fechar
    if (tray && process.platform === 'win32') {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  const icon = getIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL(FALLBACK_ICON) : icon);
  tray.setToolTip('Extrator de Imóveis');

  const menu = Menu.buildFromTemplate([
    { label: '🏠 Abrir Painel', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: '📊 Dashboard', click: () => { mainWindow?.show(); mainWindow?.webContents.send('navigate', '/'); } },
    { label: '🏠 Imóveis', click: () => { mainWindow?.show(); mainWindow?.webContents.send('navigate', '/posts'); } },
    { label: '👥 Grupos', click: () => { mainWindow?.show(); mainWindow?.webContents.send('navigate', '/groups'); } },
    { type: 'separator' },
    { label: '❌ Fechar app', click: () => { app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── Backend Node.js ──────────────────────────────────────────────────────────
function startBackend() {
  const mainJs = path.join(ROOT_DIR, 'src', 'main.js');
  const nodePath = process.execPath.includes('electron')
    ? 'node' // em dev
    : process.execPath;

  console.log('[Electron] Iniciando backend em', mainJs);

  backendProcess = spawn('node', [mainJs], {
    cwd: ROOT_DIR,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  backendProcess.stdout.on('data', (d) => process.stdout.write(`[Backend] ${d}`));
  backendProcess.stderr.on('data', (d) => process.stderr.write(`[Backend ERR] ${d}`));

  backendProcess.on('close', (code) => {
    console.log(`[Electron] Backend encerrado com código ${code}`);
  });
}

// ─── Aguarda backend responder ────────────────────────────────────────────────
function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://localhost:${API_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };

    let tries = 0;
    const retry = () => {
      tries++;
      if (tries >= retries) {
        reject(new Error('Backend não respondeu a tempo'));
      } else {
        setTimeout(attempt, 1000);
      }
    };

    attempt();
  });
}

// ─── Ciclo de vida do app ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();
  createTray();

  // Inicia backend
  startBackend();

  // Aguarda backend estar pronto (máx 30s)
  try {
    await waitForBackend(30);
    console.log('[Electron] Backend pronto!');
  } catch (err) {
    console.warn('[Electron] Backend demorou — abrindo mesmo assim:', err.message);
  }

  createMainWindow();
});

app.on('window-all-closed', () => {
  // No Windows/Linux, mantém no tray
  if (process.platform === 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  else { mainWindow?.show(); mainWindow?.focus(); }
});

app.on('before-quit', () => {
  // Para o backend ao fechar
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

// ─── IPC: navegação via tray ──────────────────────────────────────────────────
ipcMain.on('navigate', (_, route) => {
  mainWindow?.webContents.send('navigate', route);
});

// Ícone fallback (emoji base64 PNG 32x32 azul)
const FALLBACK_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA';
