const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
let win = null;
let appURL = null;
let backendProcess = null;

// Detecta se usa Vite ou dist — callback chamado UMA ÚNICA VEZ
function getAppURL(cb) {
  let done = false;

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

  setTimeout(() => {
    if (!done) {
      done = true;
      req.destroy();
      cb('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
    }
  }, 2000);
}

function createWindow(url) {
  appURL = url;

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
      webviewTag: true,          // permite <webview> no React
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(url);

  // Mostra quando a página carregar
  win.webContents.on('did-finish-load', () => {
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
  });

  // Fallback: mostra em 6s de qualquer forma
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 6000);

  // ─── IMPEDE NAVEGAÇÃO PARA URLs EXTERNAS ──────────────────────
  // Qualquer link clicado dentro do app que não seja o localhost/dist
  // é aberto no browser padrão do sistema, nunca na janela do Electron
  win.webContents.on('will-navigate', (event, targetUrl) => {
    const isInternal = targetUrl.startsWith('http://localhost:5173') ||
                       targetUrl.startsWith('file://') ||
                       targetUrl === appURL;
    if (!isInternal) {
      event.preventDefault();          // bloqueia navegação na janela
      shell.openExternal(targetUrl);   // abre no browser do sistema
    }
  });

  // Links com target="_blank" também vão para o browser externo
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ─── RECUPERAÇÃO AUTOMÁTICA DE CRASH ──────────────────────────
  win.webContents.on('render-process-gone', (event, details) => {
    console.error('[Electron] Renderer caiu:', details.reason);
    // Recarrega a página em vez de fechar o app
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.reload();
      }
    }, 1000);
  });

  win.webContents.on('unresponsive', () => {
    console.warn('[Electron] Renderer travado — recarregando...');
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.reload();
      }
    }, 3000);
  });

  win.on('closed', () => { win = null; });

  // ─── IPC: extrai cookies do Facebook e envia para o backend ───
  ipcMain.handle('facebook:getCookies', async () => {
    try {
      const ses = session.fromPartition('persist:facebook');
      const cookies = await ses.cookies.get({ domain: '.facebook.com' });
      return { ok: true, cookies };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('facebook:isLoggedIn', async () => {
    try {
      const ses = session.fromPartition('persist:facebook');
      const cookies = await ses.cookies.get({ domain: '.facebook.com', name: 'c_user' });
      return { loggedIn: cookies.length > 0 };
    } catch {
      return { loggedIn: false };
    }
  });
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
