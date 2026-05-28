/**
 * Interceptador de payloads GraphQL do Facebook.
 * Captura responses da API sem depender de seletores CSS frágeis.
 */

const GRAPHQL_PATTERNS = [
  '/api/graphql',
  '/graphql',
  'graphql?',
];

/**
 * Registra o interceptador de GraphQL em uma página.
 * Quando um payload relevante é detectado, chama o callback.
 *
 * @param {Page} page - Página do Playwright
 * @param {Function} onPost - Callback chamado com dados do post extraídos
 */
export function registerGraphQLInterceptor(page, onPost) {
  page.on('response', async (response) => {
    const url = response.url();

    // Filtra apenas respostas GraphQL
    const isGraphQL = GRAPHQL_PATTERNS.some((p) => url.includes(p));
    if (!isGraphQL) return;

    // Ignora respostas não-OK ou não-JSON
    if (!response.ok()) return;

    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('json')) return;

    try {
      const body = await response.json();
      const posts = extractPostsFromPayload(body);
      for (const post of posts) {
        if (post) onPost(post);
      }
    } catch {
      // Ignora payloads não parseáveis
    }
  });
}

/**
 * Extrai posts de um payload GraphQL do Facebook.
 * O Facebook usa estrutura JSON aninhada com múltiplos formatos.
 * @param {object} payload
 * @returns {Array} posts extraídos
 */
function extractPostsFromPayload(payload) {
  const results = [];

  // Facebook retorna múltiplas "respostas" em um único JSON
  // Percorre recursivamente procurando entidades de posts
  walkObject(payload, results);

  return results;
}

function walkObject(obj, results, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 15) return;

  // Detecta um nó de post pelo campo __typename
  if (obj.__typename === 'Story' || obj.__typename === 'GroupFeedUnit') {
    const post = extractPost(obj);
    if (post) results.push(post);
    return;
  }

  // Detecta listas de posts
  if (Array.isArray(obj)) {
    obj.forEach((item) => walkObject(item, results, depth + 1));
    return;
  }

  // Continua percorrendo
  Object.values(obj).forEach((val) => {
    if (val && typeof val === 'object') {
      walkObject(val, results, depth + 1);
    }
  });
}

/**
 * Extrai campos relevantes de um objeto Story do Facebook.
 * @param {object} story
 */
function extractPost(story) {
  try {
    const actor = story.actors?.[0] || story.author || {};
    const message = story.message || story.comet_sections?.content?.story?.message;
    const text = message?.text || message?.story?.message?.text || '';

    if (!text && !story.id) return null;

    // Timestamp
    let createdAt = null;
    if (story.creation_time) {
      createdAt = new Date(story.creation_time * 1000);
    } else if (story.publish_time) {
      createdAt = new Date(story.publish_time * 1000);
    }

    // Imagens
    const images = extractImages(story);

    // Group ID
    const groupId =
      story.to?.id ||
      story.group?.id ||
      story.comet_sections?.context_layout?.story?.comet_sections?.metadata?.[0]?.story?.to?.id;

    return {
      post_id: story.id || story.post_id,
      author_name: actor.name || actor.display_name,
      author_profile: actor.url || actor.profile_url,
      content: text,
      image_urls: images,
      created_at: createdAt,
      group_id_raw: groupId,
      post_url: story.url || story.permalink_url,
    };
  } catch {
    return null;
  }
}

function extractImages(story) {
  const images = [];

  // Percorre o objeto procurando URLs de imagens
  const walker = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 10) return;

    if (obj.__typename === 'Photo' && obj.url) {
      images.push(obj.url);
    } else if (obj.__typename === 'Image' && obj.uri) {
      images.push(obj.uri);
    }

    if (Array.isArray(obj)) {
      obj.forEach((i) => walker(i, depth + 1));
    } else {
      Object.values(obj).forEach((v) => {
        if (v && typeof v === 'object') walker(v, depth + 1);
      });
    }
  };

  walker(story);
  return [...new Set(images)]; // remove duplicatas
}
