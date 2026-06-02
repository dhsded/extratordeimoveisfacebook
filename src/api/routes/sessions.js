import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { launchBrowser, newPage } from '../../browser/launcher.js';
import { isAuthenticated, updateSessionStatus } from '../../browser/session.js';

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

    // Aguarda até 5 minutos pelo login
    let authenticated = false;
    const start = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 minutos

    while (Date.now() - start < TIMEOUT) {
      await new Promise(r => setTimeout(r, 3000));

      try {
        authenticated = await isAuthenticated(page);
      } catch {
        authenticated = false;
      }

      if (authenticated) break;

      // Verifica se a página ainda existe (usuário pode ter fechado o browser)
      try {
        await page.title();
      } catch {
        send('Navegador fechado antes do login.', 'error');
        break;
      }

      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.floor((TIMEOUT - (Date.now() - start)) / 1000);
      send(`Aguardando login... (${remaining}s restantes)`, 'waiting');
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
