import 'dotenv/config';
import { spawn } from 'child_process';
import { deduplicateAndInsert } from '../db/dedup.js';
import { launchBrowser, newPage } from '../browser/launcher.js';
import { crawlGroupFeed } from '../collector/feed.js';
import { crawlQueue, parseQueue, queuePostParse } from './jobs.js';
import { prisma } from '../db/client.js';
import { broadcast } from '../api/server.js';
import { filterPost } from '../collector/filter.js';

let browserContext = null;

async function getBrowserContext() {
  if (!browserContext) {
    const sessionDir = process.env.FB_SESSION_DIR || './data/sessions/profile1';
    browserContext = await launchBrowser({ sessionDir, headless: false });
  }
  return browserContext;
}

// ─── Worker: Crawling ─────────────────────────────────────────────────────────

crawlQueue.process(1, async (job) => {
  const { groupId, groupUrl } = job.data;
  console.log(`[Worker] Iniciando crawl: ${groupUrl}`);

  await prisma.group.update({ where: { id: groupId }, data: { status: 'running' } });
  broadcast({ type: 'group_status', groupId, status: 'running' });

  try {
    const context = await getBrowserContext();
    const page = await newPage(context);
    let postCount = 0;

    await crawlGroupFeed(page, groupUrl, async (rawPost) => {
      await queuePostParse(rawPost, groupId);
      postCount++;
      broadcast({ type: 'post_captured', groupId, count: postCount });
    }, {
      onStatus: (msg) => broadcast({ type: 'crawl_status', groupId, message: msg }),
    });

    await page.close();
    await prisma.group.update({ where: { id: groupId }, data: { status: 'idle', last_run: new Date() } });
    broadcast({ type: 'group_status', groupId, status: 'idle' });
    console.log(`[Worker] Crawl concluído: ${postCount} posts capturados`);

  } catch (err) {
    console.error(`[Worker] Erro no crawl:`, err.message);
    await prisma.group.update({ where: { id: groupId }, data: { status: 'error' } });
    broadcast({ type: 'group_status', groupId, status: 'error', error: err.message });
  }
});

// ─── Worker: Parsing ──────────────────────────────────────────────────────────

parseQueue.process(3, async (job) => {
  const { rawPost, groupId } = job.data;

  const parsed = await runPythonParser(rawPost);
  let ocrText = '';
  if (rawPost.image_urls?.length > 0) {
    ocrText = await runPythonOCR(rawPost.image_urls);
  }

  const fullPost = { ...rawPost, ...parsed, group_id: groupId, ocr_text: ocrText };

  // Filtro: rejeita posts sem telefone ou sem dados imobiliários
  const filter = filterPost(fullPost);
  if (!filter.accepted) {
    console.log(`[Filter] Descartado (${filter.reason}): ${rawPost.post_id?.slice(0, 12)}`);
    return;
  }

  const result = await deduplicateAndInsert(fullPost);
  if (result.inserted) {
    broadcast({ type: 'new_post', post: fullPost });
    console.log(`[Worker] ✅ Post salvo: ${rawPost.post_id}`);
  } else {
    console.log(`[Worker] ↩️ Duplicado (${result.reason}): ${rawPost.post_id}`);
  }
});

// ─── Python helpers ───────────────────────────────────────────────────────────

function runPythonParser(post) {
  return new Promise((resolve) => {
    // Tenta python3 depois python
    const cmd = process.platform === 'win32' ? 'python' : 'python3';
    const py = spawn(cmd, ['src/parser/normalizer.py'], { cwd: process.cwd() });
    let out = '';
    py.stdin.write(JSON.stringify({ content: post.content || '' }));
    py.stdin.end();
    py.stdout.on('data', (d) => (out += d));
    py.on('close', () => { try { resolve(JSON.parse(out)); } catch { resolve({}); } });
    py.on('error', () => resolve({})); // Python não instalado — ignora
  });
}

function runPythonOCR(imageUrls) {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'python' : 'python3';
    const py = spawn(cmd, ['src/parser/ocr.py', '--stdin'], { cwd: process.cwd() });
    let out = '';
    py.stdin.write(JSON.stringify({ urls: imageUrls }));
    py.stdin.end();
    py.stdout.on('data', (d) => (out += d));
    py.on('close', () => { try { resolve(JSON.parse(out).text || ''); } catch { resolve(''); } });
    py.on('error', () => resolve(''));
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browserContext) await browserContext.close();
  process.exit(0);
});
