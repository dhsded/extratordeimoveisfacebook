import { Router } from 'express';
import { prisma } from '../../db/client.js';

const router = Router();

/**
 * GET /api/sessions - Lista sessões salvas
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

export default router;
