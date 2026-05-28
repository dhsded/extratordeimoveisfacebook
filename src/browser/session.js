import fs from 'fs';
import path from 'path';
import { prisma } from '../db/client.js';

/**
 * Gerenciamento de sessão persistente do Facebook.
 * Salva e restaura cookies, verifica autenticação.
 */

const COOKIE_FILE = 'cookies.json';

/**
 * Salva cookies da sessão atual no disco.
 * @param {BrowserContext} context
 * @param {string} sessionDir
 */
export async function saveSession(context, sessionDir) {
  const cookiesPath = path.join(sessionDir, COOKIE_FILE);
  const cookies = await context.cookies();
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log(`[Session] Sessão salva em ${cookiesPath} (${cookies.length} cookies)`);
}

/**
 * Restaura cookies de uma sessão salva.
 * @param {BrowserContext} context
 * @param {string} sessionDir
 */
export async function restoreSession(context, sessionDir) {
  const cookiesPath = path.join(sessionDir, COOKIE_FILE);

  if (!fs.existsSync(cookiesPath)) {
    console.log('[Session] Nenhuma sessão salva encontrada. Faça login primeiro.');
    return false;
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    await context.addCookies(cookies);
    console.log(`[Session] ${cookies.length} cookies restaurados.`);
    return true;
  } catch (err) {
    console.error('[Session] Erro ao restaurar sessão:', err.message);
    return false;
  }
}

/**
 * Verifica se o usuário está autenticado no Facebook.
 * @param {Page} page
 */
export async function isAuthenticated(page) {
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Aguarda um pouco para o JS carregar
    await new Promise(r => setTimeout(r, 3000));

    // Verifica presença de elemento que só aparece quando logado
    const loggedIn = await page.evaluate(() => {
      // O Facebook tem um div com role="banner" que contém o menu do usuário logado
      const nav = document.querySelector('[aria-label="Facebook"]');
      const loginBtn = document.querySelector('[data-testid="royal_login_button"]');
      return nav !== null && loginBtn === null;
    });

    return loggedIn;
  } catch {
    return false;
  }
}

/**
 * Atualiza status da sessão no banco de dados.
 * @param {string} profileName
 * @param {string} status
 */
export async function updateSessionStatus(profileName, profileDir, status) {
  try {
    await prisma.session.upsert({
      where: { profile_name: profileName },
      update: { status, last_login: status === 'active' ? new Date() : undefined },
      create: {
        profile_name: profileName,
        profile_dir: profileDir,
        status,
        last_login: status === 'active' ? new Date() : undefined,
      },
    });
  } catch (err) {
    console.error('[Session] Erro ao atualizar banco:', err.message);
  }
}
