import { Router } from 'express';
import { prisma } from '../../db/client.js';

const router = Router();

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
