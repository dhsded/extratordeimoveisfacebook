import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { filterPost } from '../../collector/filter.js';

const router = Router();

/**
 * POST /api/posts/raw — Recebe post bruto do scraper do webview.
 * Aplica filtro de relevância e extrai telefone do texto.
 */
router.post('/raw', async (req, res) => {
  try {
    const { post_id, content, author_name, author_profile, post_url,
            image_urls, group_id, group_url } = req.body;

    if (!post_id || !content) {
      return res.status(400).json({ error: 'post_id e content são obrigatórios' });
    }

    // Verifica duplicata
    const existing = await prisma.post.findUnique({ where: { post_id } });
    if (existing) return res.status(409).json({ error: 'Duplicado' });

    // ── Extração básica do texto ──────────────────────────────────────────
    const text = content.toLowerCase();

    // Telefone / WhatsApp
    const phoneMatch = content.match(
      /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4,5}[-\s]?\d{4}/
    );
    const phone = phoneMatch ? phoneMatch[0].replace(/\D+/g, '').slice(-11) : null;

    // Tipo de imóvel
    const propertyTypes = {
      'apartamento': /\bapartamento|\bapto\b/i,
      'casa':        /\bcasa\b|\bsobrado\b/i,
      'terreno':     /\bterreno\b|\blote\b/i,
      'kitnet':      /\bkitnet\b|\bstudio\b|\bquitinete\b/i,
      'comercial':   /\bsala\s+comercial\b|\bgalpão\b|\bloja\b/i,
      'chacara':     /\bchácara\b|\bsítio\b/i,
    };
    let property_type = null;
    for (const [type, re] of Object.entries(propertyTypes)) {
      if (re.test(content)) { property_type = type; break; }
    }

    // Transação
    const transaction_type = /\balugo\b|\baluguel\b|\blocação\b|\bpara\s+alugar\b/i.test(content) ? 'aluguel'
      : /\bvendo\b|\bvende\b|\bà\s+venda\b|\bvenda\b/i.test(content) ? 'venda'
      : null;

    // Preço
    const priceMatch = content.match(/R\$\s*([\d.,]+)/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) : null;

    // Quartos / banheiros / garagem
    const bedroomsMatch  = content.match(/(\d+)\s*(?:quartos?|dorms?|suítes?)/i);
    const bathroomsMatch = content.match(/(\d+)\s*banheiros?/i);
    const garageMatch    = content.match(/(\d+)\s*(?:vagas?|garagem)/i);

    // Área m²
    const areaMatch = content.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);

    const bedrooms  = bedroomsMatch  ? parseInt(bedroomsMatch[1])  : null;
    const bathrooms = bathroomsMatch ? parseInt(bathroomsMatch[1]) : null;
    const garage    = garageMatch    ? parseInt(garageMatch[1])    : null;
    const area_m2   = areaMatch      ? parseFloat(areaMatch[1].replace(',', '.')) : null;

    // ── Filtro de relevância ──────────────────────────────────────────────
    const rawPost = { content, phone, property_type, transaction_type, price };
    const { accepted, reason } = filterPost(rawPost);

    if (!accepted) {
      return res.status(422).json({ error: `Filtrado: ${reason}` });
    }

    // ── Garante que o grupo existe (upsert) ──────────────────────────────
    let resolvedGroupId = group_id;
    if (!resolvedGroupId && group_url) {
      const group = await prisma.group.upsert({
        where:  { url: group_url },
        create: { url: group_url, name: group_url.match(/groups\/([^/?]+)/)?.[1] || group_url },
        update: {},
      });
      resolvedGroupId = group.id;
    }
    if (!resolvedGroupId) {
      return res.status(400).json({ error: 'group_id ou group_url é necessário' });
    }

    // ── Salva no banco ────────────────────────────────────────────────────
    const post = await prisma.post.create({
      data: {
        post_id,
        group_id:         resolvedGroupId,
        content,
        author_name:      author_name || null,
        author_profile:   author_profile || null,
        post_url:         post_url || null,
        image_urls:       image_urls || '[]',
        phone,
        property_type,
        transaction_type,
        price,
        bedrooms,
        bathrooms,
        garage,
        area_m2,
        scraped_at:       new Date(),
      },
    });

    res.status(201).json({ post, reason });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Duplicado' });
    console.error('[API/posts/raw]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/posts
 * Retorna posts com filtros, paginação e busca.
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '50',
      city,
      neighborhood,
      property_type,
      transaction_type,
      min_price,
      max_price,
      bedrooms,
      phone,
      group_id,
      search,
      sort = 'scraped_at',
      order = 'desc',
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Monta filtros dinâmicos
    const where = {};

    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (neighborhood) where.neighborhood = { contains: neighborhood, mode: 'insensitive' };
    if (property_type) where.property_type = property_type;
    if (transaction_type) where.transaction_type = transaction_type;
    if (bedrooms) where.bedrooms = parseInt(bedrooms);
    if (phone) where.phone = { contains: phone };
    if (group_id) where.group_id = group_id;

    if (min_price || max_price) {
      where.price = {};
      if (min_price) where.price.gte = parseFloat(min_price);
      if (max_price) where.price.lte = parseFloat(max_price);
    }

    if (search) {
      where.content = { contains: search, mode: 'insensitive' };
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take,
        orderBy: { [sort]: order },
        include: { group: { select: { name: true, url: true } } },
      }),
      prisma.post.count({ where }),
    ]);

    res.json({
      data: posts,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error('[API/posts] GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/posts/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { group: true },
    });
    if (!post) return res.status(404).json({ error: 'Post não encontrado' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/posts/stats/summary
 * Estatísticas para o dashboard.
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const [total, byType, byTransaction, byCity, recentCount] = await Promise.all([
      prisma.post.count(),
      prisma.post.groupBy({ by: ['property_type'], _count: true }),
      prisma.post.groupBy({ by: ['transaction_type'], _count: true }),
      prisma.post.groupBy({
        by: ['city'],
        _count: true,
        where: { city: { not: null } },
        orderBy: { _count: { city: 'desc' } },
        take: 10,
      }),
      prisma.post.count({
        where: { scraped_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
    ]);

    res.json({ total, byType, byTransaction, byCity, recentCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
