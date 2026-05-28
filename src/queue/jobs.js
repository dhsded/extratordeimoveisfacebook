/**
 * Fila em memória — substitui BullMQ + Redis.
 * Simples, sem dependências externas, perfeita para app Desktop.
 */
import { EventEmitter } from 'events';

class SimpleQueue extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.queue = [];
    this.processing = false;
    this.concurrency = 1;
    this.handler = null;
  }

  /** Define o handler que processa cada job */
  process(concurrency, handler) {
    this.concurrency = concurrency;
    this.handler = handler;
    this._tick();
  }

  /** Adiciona job à fila */
  add(data) {
    this.queue.push({ data, id: Date.now() + Math.random() });
    this._tick();
  }

  _tick() {
    if (!this.handler || this.processing) return;
    const job = this.queue.shift();
    if (!job) return;

    this.processing = true;
    Promise.resolve(this.handler(job))
      .then(() => { this.processing = false; this._tick(); })
      .catch((err) => {
        console.error(`[Queue:${this.name}] Erro no job:`, err.message);
        this.processing = false;
        this._tick();
      });
  }

  get length() { return this.queue.length; }
}

// Instâncias das filas
export const crawlQueue = new SimpleQueue('crawl');
export const parseQueue = new SimpleQueue('parse');

/**
 * Adiciona um grupo à fila de crawling.
 */
export async function queueGroupCrawl(groupId, groupUrl, opts = {}) {
  console.log(`[Queue] Crawl enfileirado: ${groupUrl}`);
  crawlQueue.add({ groupId, groupUrl, ...opts });
}

/**
 * Adiciona um post à fila de parsing.
 */
export async function queuePostParse(rawPost, groupId) {
  parseQueue.add({ rawPost, groupId });
}
