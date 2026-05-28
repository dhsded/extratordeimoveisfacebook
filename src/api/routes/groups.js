import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { queueGroupCrawl } from '../../queue/jobs.js';

const router = Router();

/**
 * GET /api/groups - Lista todos os grupos
 */
router.get('/', async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { posts: true } } },
    });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/groups - Adiciona grupo e inicia crawling
 * Body: { url: "https://www.facebook.com/groups/..." }
 */
router.post('/', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.includes('facebook.com/groups')) {
      return res.status(400).json({ error: 'URL inválida. Use um link de grupo do Facebook.' });
    }

    // Normaliza URL (remove trailing slash, query params)
    const cleanUrl = url.split('?')[0].replace(/\/$/, '');

    // Cria ou recupera grupo
    const group = await prisma.group.upsert({
      where: { url: cleanUrl },
      update: {},
      create: { url: cleanUrl, status: 'idle' },
    });

    // Enfileira crawling
    await queueGroupCrawl(group.id, group.url);

    res.json({ group, message: 'Grupo adicionado e coleta iniciada!' });
  } catch (err) {
    console.error('[API/groups] POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/groups/:id/run - Executa crawling de um grupo existente
 */
router.post('/:id/run', async (req, res) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

    if (group.status === 'running') {
      return res.status(409).json({ error: 'Grupo já está em execução' });
    }

    await queueGroupCrawl(group.id, group.url);
    res.json({ message: 'Coleta iniciada!', groupId: group.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/groups/:id - Remove grupo
 */
router.delete('/:id', async (req, res) => {
  try {
    await prisma.group.delete({ where: { id: req.params.id } });
    res.json({ message: 'Grupo removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
