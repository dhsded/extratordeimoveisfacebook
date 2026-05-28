/**
 * Filtro de relevância imobiliária.
 *
 * Regras obrigatórias para um post ser salvo:
 * 1. Ter telefone ou WhatsApp detectado
 * 2. Ter algum sinal imobiliário (tipo, transação, preço, palavras-chave)
 */

// Palavras-chave imobiliárias — pelo menos UMA deve aparecer no texto
const REAL_ESTATE_KEYWORDS = [
  // Tipo de imóvel
  'apartamento', 'apto', 'casa', 'sobrado', 'kitnet', 'quitinete',
  'terreno', 'lote', 'chácara', 'sítio', 'galpão', 'sala', 'sala comercial',
  'flat', 'studio', 'cobertura', 'mansão', 'village',

  // Transação
  'vendo', 'vende', 'à venda', 'aluguel', 'aluga', 'alugo',
  'temporada', 'locação', 'financiamento', 'permuta',

  // Termos comuns
  'imóvel', 'imovel', 'propriedade', 'residência', 'dormitório',
  'quarto', 'suíte', 'suite', 'banheiro', 'garagem', 'vaga',
  'condomínio', 'condominio', 'metragem', 'm²', 'metros',
  'direto com proprietário', 'direto com o dono', 'corretor',
  'creci', 'oportunidade', 'ótima localização', 'bem localizado',
];

// Padrões que indicam que é um anúncio de imóvel (reforça a detecção)
const REAL_ESTATE_PATTERNS = [
  /\bR\$\s*[\d.,]+/i,          // preço em reais
  /\d+\s*(?:quartos?|dorms?)/i, // quartos
  /\d+\s*m[²2]/i,               // metragem
  /\d{4,5}[-\s]?\d{4}/,         // telefone no texto
];

/**
 * Verifica se um post tem contato (telefone/WhatsApp).
 * @param {object} post - post normalizado (após parser Python)
 * @returns {{ ok: boolean, reason: string }}
 */
export function hasContact(post) {
  // Contato extraído pelo parser Python
  if (post.phone) {
    return { ok: true, reason: 'phone_extracted' };
  }

  // Busca telefone no texto bruto como fallback
  const text = [post.content, post.ocr_text].filter(Boolean).join(' ');
  const phonePattern = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4,5}[-\s]?\d{4}/;
  if (phonePattern.test(text)) {
    return { ok: true, reason: 'phone_in_text' };
  }

  // Menciona WhatsApp explicitamente (às vezes o número fica em imagem)
  if (/whatsapp|wha?ts|zap\s*zap/i.test(text)) {
    return { ok: true, reason: 'whatsapp_mentioned' };
  }

  return { ok: false, reason: 'no_contact' };
}

/**
 * Verifica se o conteúdo do post é relevante para o segmento imobiliário.
 * @param {object} post
 * @returns {{ ok: boolean, reason: string, score: number }}
 */
export function isRealEstate(post) {
  const text = [post.content, post.ocr_text].filter(Boolean).join(' ').toLowerCase();

  if (!text.trim()) {
    return { ok: false, reason: 'empty_content', score: 0 };
  }

  // Se o parser já detectou tipo ou transação, já é suficiente
  if (post.property_type || post.transaction_type) {
    return { ok: true, reason: 'parser_detected', score: 10 };
  }

  // Se tem preço extraído, muito provável que seja imóvel
  if (post.price) {
    return { ok: true, reason: 'has_price', score: 8 };
  }

  // Conta quantas palavras-chave aparecem no texto
  let score = 0;
  const matched = [];
  for (const kw of REAL_ESTATE_KEYWORDS) {
    if (text.includes(kw)) {
      score++;
      matched.push(kw);
    }
  }

  // Verifica padrões regex
  for (const pattern of REAL_ESTATE_PATTERNS) {
    if (pattern.test(text)) score += 2;
  }

  if (score >= 2) {
    return { ok: true, reason: `keywords(${matched.slice(0, 3).join(',')})`, score };
  }

  if (score === 1) {
    return { ok: false, reason: `weak_signal(${matched[0]})`, score };
  }

  return { ok: false, reason: 'not_real_estate', score: 0 };
}

/**
 * Filtro combinado: verifica relevância E contato.
 * Retorna motivo de rejeição para logging.
 *
 * @param {object} post - post normalizado
 * @returns {{ accepted: boolean, reason: string }}
 */
export function filterPost(post) {
  // 1. Verifica relevância imobiliária
  const reCheck = isRealEstate(post);
  if (!reCheck.ok) {
    return { accepted: false, reason: `rejected:${reCheck.reason}` };
  }

  // 2. Exige contato (telefone/WhatsApp)
  const contactCheck = hasContact(post);
  if (!contactCheck.ok) {
    return { accepted: false, reason: 'rejected:no_phone_or_whatsapp' };
  }

  return { accepted: true, reason: `accepted(re:${reCheck.reason},contact:${contactCheck.reason})` };
}
