import { registerGraphQLInterceptor } from './graphql.js';
import {
  humanScroll,
  humanClick,
  entryPause,
  randomSleep,
  rand,
} from '../browser/human.js';

const REAL_ESTATE_KEYWORDS = (process.env.KEYWORDS || 'aluguel,vendo,apartamento,lote,terreno,imóvel,financiamento,corretor,casa').split(',');

/**
 * Coleta histórica via busca interna do Facebook.
 * Usa os filtros de busca para encontrar posts antigos do grupo.
 * @param {Page} page
 * @param {string} groupUrl
 * @param {Function} onPost
 */
export async function collectHistory(page, groupUrl, onPost, opts = {}) {
  const { maxPosts = 500, onStatus = () => {} } = opts;

  let totalCollected = 0;

  for (const keyword of REAL_ESTATE_KEYWORDS) {
    if (totalCollected >= maxPosts) break;

    onStatus(`Buscando por: "${keyword}"...`);

    // Extrai o ID/slug do grupo da URL
    const groupMatch = groupUrl.match(/groups\/([^/?]+)/);
    if (!groupMatch) continue;
    const groupSlug = groupMatch[1];

    // URL de busca do Facebook dentro do grupo
    const searchUrl = `https://www.facebook.com/groups/${groupSlug}/search/?q=${encodeURIComponent(keyword)}`;

    const capturedPosts = [];
    registerGraphQLInterceptor(page, (post) => {
      if (post?.post_id) capturedPosts.push(post);
    });

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await entryPause(page);

    // Scroll nos resultados
    let scrollCount = 0;
    const maxScrolls = 20;

    while (scrollCount < maxScrolls && totalCollected < maxPosts) {
      while (capturedPosts.length > 0) {
        const post = capturedPosts.shift();
        onPost(post);
        totalCollected++;
        onStatus(`Histórico: ${totalCollected} posts coletados | Palavra: "${keyword}"`);
      }

      await humanScroll(page, {
        totalDistance: rand(400, 900),
        steps: Math.floor(rand(3, 6)),
        minPause: 1,
        maxPause: 4,
      });

      scrollCount++;

      // Verifica fim da página
      const atBottom = await page.evaluate(() => {
        return window.innerHeight + window.scrollY >= document.body.scrollHeight - 300;
      });

      if (atBottom) {
        console.log(`[History] Fim dos resultados para "${keyword}".`);
        break;
      }
    }

    // Pausa entre palavras-chave (evita padrão linear)
    await randomSleep(15, 45);
  }

  onStatus(`Coleta histórica concluída: ${totalCollected} posts`);
  return { totalCollected };
}
