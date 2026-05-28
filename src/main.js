import 'dotenv/config';
import { startServer } from './api/server.js';
import './queue/worker.js'; // Inicializa workers

async function main() {
  console.log('🏠 Extrator de Imóveis — Iniciando...');
  await startServer();
  console.log('✅ Sistema pronto! Abra o painel em http://localhost:5173');
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
