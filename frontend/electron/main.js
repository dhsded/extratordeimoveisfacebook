// Captura TODOS os erros no arquivo de log antes de qualquer import
const fs = require('fs');
const logFile = require('path').join(require('os').tmpdir(), 'electron-imoveis.log');
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(logFile, line);
};

process.on('uncaughtException', (err) => {
  log(`ERRO FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  log(`REJEIÇÃO: ${err?.message || err}`);
});

log('=== Electron iniciando ===');

const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

log(`app path: ${app.getAppPath()}`);

const isDev = process.env.NODE_ENV === 'development';
const ROOT_DIR = path.join(__dirname, '..', '..');

log(`isDev: ${isDev}, ROOT_DIR: ${ROOT_DIR}`);

let mainWindow = null;
let tray = null;
let backendProcess = null;

// ─── Janela Principal ─────────────────────────────────────────────────────────
function createMainWindow() {
  log('Criando janela principal...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: true,
    title: 'Extrator de Imóveis',
    backgroundColor: '#0a0f1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;

  log(`Carregando URL: ${url}`);
  mainWindow.loadURL(url);

  mainWindow.webContents.on('did-finish-load', () => log('Página carregada com sucesso!'));
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => log(`Falha ao carregar: ${code} ${desc}`));
  mainWindow.webContents.on('render-process-gone', (e, d) => log(`Renderer crashed: ${JSON.stringify(d)}`));

  mainWindow.on('closed', () => { mainWindow = null; log('Janela fechada.'); });
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    log(`Ícone: ${iconPath} (existe: ${fs.existsSync(iconPath)})`);
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('Extrator de Imóveis');
    const menu = Menu.buildFromTemplate([
      { label: '🏠 Abrir', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
      { label: '❌ Fechar', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
    log('Tray criado com sucesso.');
  } catch (err) {
    log(`Tray falhou (ignorando): ${err.message}`);
  }
}

// ─── Backend ──────────────────────────────────────────────────────────────────
function startBackend() {
  const req = http.get('http://localhost:3001/api/health', () => {
    log('Backend já está rodando.');
  });
  req.on('error', () => {
    log('Backend não encontrado. Iniciando...');
    backendProcess = spawn('node', [path.join(ROOT_DIR, 'src', 'main.js')], {
      cwd: ROOT_DIR,
      env: { ...process.env },
      stdio: 'inherit',
      shell: true,
    });
    backendProcess.on('error', (err) => log(`Backend erro: ${err.message}`));
  });
  req.setTimeout(2000, () => req.destroy());
}

// ─── App ─────────────────────────────────────────────────────────────────────
log('Aguardando app.whenReady...');

app.whenReady().then(() => {
  log('App pronto! Iniciando componentes...');
  startBackend();
  createTray();
  createMainWindow();
  log('Todos os componentes iniciados.');
}).catch((err) => {
  log(`app.whenReady falhou: ${err.message}`);
});

app.on('window-all-closed', () => {
  log('Todas as janelas fechadas.');
  if (app.isQuitting || !tray) app.quit();
});

app.on('activate', () => { mainWindow?.show(); mainWindow?.focus(); });
app.on('before-quit', () => {
  app.isQuitting = true;
  log('App encerrando...');
  if (backendProcess) backendProcess.kill();
});

log(`Log salvo em: ${logFile}`);
