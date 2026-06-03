import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
// Em produção usa AppData (gravável); em dev usa ./data/
const DATA_DIR = process.env.APP_DATA_DIR || path.resolve('./data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  city: 'Juiz de Fora',
  propertyTypes: [],        // [], ['casa'], ['apartamento'], etc.
  priceMin: null,
  priceMax: null,
  bedroomsMin: null,
  neighborhoods: [],        // ['Centro', 'Santa Luzia', ...]
  extraKeywords: [],        // palavras-chave adicionais
  updatedAt: null,
};

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (_) {}
  return { ...DEFAULT_CONFIG };
}

function writeConfig(data) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const config = { ...DEFAULT_CONFIG, ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  return config;
}

/**
 * GET /api/config — Retorna configurações de busca
 */
router.get('/', (req, res) => {
  res.json(readConfig());
});

/**
 * PUT /api/config — Salva configurações de busca
 */
router.put('/', (req, res) => {
  try {
    const config = writeConfig(req.body);
    res.json({ message: 'Configurações salvas!', config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
