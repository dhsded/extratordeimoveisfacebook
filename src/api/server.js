import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import postsRouter from './routes/posts.js';
import groupsRouter from './routes/groups.js';
import sessionsRouter from './routes/sessions.js';

const PORT = parseInt(process.env.API_PORT || '3001');

// Express app
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Rotas API
app.use('/api/posts', postsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/sessions', sessionsRouter);

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date() }));

// HTTP server
const server = createServer(app);

// WebSocket server para updates em tempo real
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', ts: new Date() }));

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

/**
 * Envia uma mensagem para todos os clientes WebSocket conectados.
 * @param {object} data
 */
export function broadcast(data) {
  const msg = JSON.stringify({ ...data, ts: new Date() });
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
    }
  }
}

export function startServer() {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[API] Servidor rodando em http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

export { app };
