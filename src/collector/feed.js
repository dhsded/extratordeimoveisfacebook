import { registerGraphQLInterceptor } from './graphql.js';
import {
  humanScroll,
  entryPause,
  randomIdleAction,
  randomSleep,
  rand,
} from '../browser/human.js';

const MAX_AGE_DAYS = parseInt(process.env.MAX_POST_AGE_DAYS || '365');
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Navega no feed de um grupo do Facebook, coletando posts via GraphQL.
 * @param {Page} page - Página do Playwright
 * @param {string} groupUrl - URL do grupo
 * @param {Function} onPost - Callback chamado a cada post capturado
 * @param {object} opts
 */
export async function crawlGroupFeed(page, groupUrl, onPost, opts = {}) {
  const {
    maxPosts = 200,
    sessionDurationMin = parseInt(process.env.SESSION_DURATION_MIN || '20'),
    sessionDurationMax = parseInt(process.env.SESSION_DURATION_MAX || '40'),
    onStatus = () => {},
  } = opts;

  const sessionEndTime =
    Date.now() + rand(sessionDurationMin, sessionDurationMax) * 60_000;

  let postsCollected = 0;
  let oldestPostDate = null;
  let reachedLimit = false;

  // Registra interceptador GraphQL
  const capturedPosts = [];
  registerGraphQLInterceptor(page, (post) => {
    if (post && post.post_id) {
      capturedPosts.push(post);
    }
  });

  // Navega para o grupo
  onStatus('Navegando para o grupo...');
  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });

  // Pausa de entrada humanizada
  await entryPause(page);

  onStatus('Coletando posts...');

  while (!reachedLimit && Date.now() < sessionEndTime) {
    // Processa posts capturados pelo interceptador
    while (capturedPosts.length > 0) {
      const post = capturedPosts.shift();
      postsCollected++;

      // Verifica idade do post
      if (post.created_at) {
        const postAge = Date.now() - post.created_at.getTime();
        if (postAge > MAX_AGE_MS) {
          console.log(`[Feed] Post muito antigo (${post.created_at.toLocaleDateString()}), encerrando coleta.`);
          reachedLimit = true;
          break;
        }
        if (!oldestPostDate || post.created_at < oldestPostDate) {
          oldestPostDate = post.created_at;
        }
      }

      onPost(post);
      onStatus(`${postsCollected} posts coletados | Post mais antigo: ${oldestPostDate?.toLocaleDateString() || '?'}`);

      if (postsCollected >= maxPosts) {
        reachedLimit = true;
        break;
      }
    }

    if (reachedLimit) break;

    // Scroll humanizado para carregar mais posts
    await humanScroll(page, {
      totalDistance: rand(500, 1500),
      steps: Math.floor(rand(3, 8)),
      minPause: 0.5,
      maxPause: 3,
    });

    // Ação idle aleatória
    if (Math.random() < 0.25) {
      await randomIdleAction(page);
    }

    // Verifica se chegou ao fim do feed
    const atBottom = await page.evaluate(() => {
      return (
        window.innerHeight + window.scrollY >=
        document.body.scrollHeight - 200
      );
    });

    if (atBottom) {
      console.log('[Feed] Fim do feed detectado, aguardando carregamento...');
      await randomSleep(3, 8);

      // Verifica novamente
      const stillAtBottom = await page.evaluate(() => {
        return (
          window.innerHeight + window.scrollY >=
          document.body.scrollHeight - 200
        );
      });

      if (stillAtBottom) {
        console.log('[Feed] Feed totalmente carregado ou sem mais posts.');
        break;
      }
    }
  }

  const reason = Date.now() >= sessionEndTime
    ? 'Tempo de sessão atingido'
    : reachedLimit
    ? 'Limite de posts ou data atingida'
    : 'Fim do feed';

  console.log(`[Feed] Coleta encerrada. Motivo: ${reason}. Total: ${postsCollected} posts.`);
  onStatus(`Concluído: ${postsCollected} posts coletados`);

  return { postsCollected, oldestPostDate, reason };
}
