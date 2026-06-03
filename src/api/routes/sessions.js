import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { launchBrowser, newPage } from '../../browser/launcher.js';
import { isAuthenticated, updateSessionStatus } from '../../browser/session.js';
import fs from 'fs';
import path from 'path';

const router = Router();

// Estado global do processo de login em andamento
let loginProcess = null;

/**
 * GET /api/sessions — Lista sessões salvas
 */
router.get('/', async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { last_login: 'desc' },
    });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/status — Verifica se há sessão ativa
 */
router.get('/status', async (req, res) => {
  try {
    const active = await prisma.session.findFirst({
      where: { status: 'active' },
      orderBy: { last_login: 'desc' },
    });
    res.json({ loggedIn: !!active, session: active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sessions/cookies — Salva cookies da webview para uso no Playwright
 * Body: { cookies: [...] }
 */
router.post('/cookies', async (req, res) => {
  try {
    const { cookies } = req.body;
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ error: 'Nenhum cookie fornecido' });
    }

    const sessionDir = './data/sessions/profile1';
    const cookieFile = path.join(sessionDir, 'cookies.json');

    // Garante que a pasta existe
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    // Converte formato Electron → Playwright
    const playwrightCookies = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      expires: c.expirationDate || -1,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: c.sameSite === 'no_restriction' ? 'None'
              : c.sameSite === 'lax' ? 'Lax'
              : c.sameSite === 'strict' ? 'Strict' : 'Lax',
    }));

    fs.writeFileSync(cookieFile, JSON.stringify(playwrightCookies, null, 2));

    // Marca sessão como ativa no banco
    await updateSessionStatus('Facebook', sessionDir, 'active');

    res.json({ message: `${cookies.length} cookies salvos! Extrator pronto para usar.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sessions/login — Abre browser Chromium para login no Facebook
 * Usa Server-Sent Events para informar progresso em tempo real
 */
router.post('/login', async (req, res) => {
  // Se já há um login em andamento, rejeita
  if (loginProcess) {
    return res.status(409).json({ error: 'Login já em andamento. Aguarde.' });
  }

  // SSE headers para progresso em tempo real
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (msg, type = 'info') => {
    res.write(`data: ${JSON.stringify({ type, msg })}\n\n`);
  };

  const sessionDir = './data/sessions/profile1';
  const profileName = 'Facebook';

  try {
    loginProcess = true;
    send('Abrindo navegador Chromium...');

    const context = await launchBrowser({ sessionDir, headless: false });
    const page = await newPage(context);

    send('Navegando para o Facebook...');
    await page.goto('https://www.facebook.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    send('✅ Navegador aberto! Faça seu login no Facebook na janela que apareceu.', 'waiting');

    // Aguarda até 5 minutos pelo login — verifica APENAS a URL, sem recarregar nada
    let authenticated = false;
    const start = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 minutos

    while (Date.now() - start < TIMEOUT) {
      await new Promise(r => setTimeout(r, 3000));

      // Verifica se a janela ainda existe
      try {
        const currentUrl = page.url();

        // URLs que indicam login bem-sucedido (não é mais a tela de login)
        const isLoginPage = currentUrl.includes('/login') ||
                            currentUrl.includes('/checkpoint') ||
                            currentUrl.includes('/recover') ||
                            currentUrl === 'about:blank';

        if (!isLoginPage && currentUrl.includes('facebook.com')) {
          authenticated = true;
          break;
        }
      } catch {
        // Janela foi fechada pelo usuário
        send('Navegador fechado antes do login.', 'error');
        break;
      }

      const remaining = Math.floor((TIMEOUT - (Date.now() - start)) / 1000);
      send(`Aguardando você fazer login... (${remaining}s restantes)`, 'waiting');
    }


    if (authenticated) {
      await updateSessionStatus(profileName, sessionDir, 'active');
      send('🎉 Login realizado com sucesso! Sessão salva.', 'success');
    } else {
      await updateSessionStatus(profileName, sessionDir, 'idle');
      send('Login não detectado. Tente novamente.', 'error');
    }

    // Fecha o browser após login
    try { await context.close(); } catch (_) {}

  } catch (err) {
    send(`Erro: ${err.message}`, 'error');
  } finally {
    loginProcess = null;
    res.write('data: {"type":"done"}\n\n');
    res.end();
  }
});

/**
 * DELETE /api/sessions/:id — Remove sessão
 */
router.delete('/:id', async (req, res) => {
  try {
    await prisma.session.delete({ where: { id: req.params.id } });
    res.json({ message: 'Sessão removida' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
