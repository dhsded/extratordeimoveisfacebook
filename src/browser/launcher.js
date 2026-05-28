import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';

// Aplica o plugin stealth ao Playwright
chromium.use(StealthPlugin());

/**
 * Lança o browser Chromium com perfil persistente e modo stealth.
 * @param {object} options
 * @param {string} options.sessionDir - Caminho para o perfil persistente
 * @param {boolean} options.headless - false para ver o browser (recomendado)
 */
export async function launchBrowser(options = {}) {
  const {
    sessionDir = './data/sessions/profile1',
    headless = false,
  } = options;

  // Garante que o diretório da sessão existe
  const absSessionDir = path.resolve(sessionDir);
  if (!fs.existsSync(absSessionDir)) {
    fs.mkdirSync(absSessionDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(absSessionDir, {
    headless,

    // Viewport consistente — não mude entre sessões
    viewport: { width: 1366, height: 768 },

    // Locale e timezone fixos — simula usuário brasileiro
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',

    // User-Agent realista
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',

    // Argumentos que reduzem detecção
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions-except',
      '--start-maximized',
    ],

    // Ignora erros de HTTPS
    ignoreHTTPSErrors: true,

    // Permissões
    permissions: ['geolocation', 'notifications'],
  });

  // Injeta script em cada nova página para ocultar automação
  await context.addInitScript(() => {
    // Remove propriedade webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Simula plugins de browser real
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Simula idiomas
    Object.defineProperty(navigator, 'languages', {
      get: () => ['pt-BR', 'pt', 'en-US', 'en'],
    });

    // Simula hardware concurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4,
    });
  });

  return context;
}

/**
 * Cria uma nova aba no contexto existente.
 * @param {BrowserContext} context
 */
export async function newPage(context) {
  const page = await context.newPage();

  // Desativa timeout padrão muito curto
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(60_000);

  return page;
}
