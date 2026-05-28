/**
 * Módulo de simulação de comportamento humano
 * Todas as funções introduzem aleatoriedade e naturalidade.
 */

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Retorna número aleatório entre min e max */
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

/** Aguarda ms milissegundos */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Aguarda tempo aleatório entre min e max segundos */
async function randomSleep(minSec, maxSec) {
  const ms = rand(minSec * 1000, maxSec * 1000);
  await sleep(ms);
}

// ─── Scroll Humanizado ────────────────────────────────────────────────────────

/**
 * Realiza scroll humanizado no feed.
 * Varia velocidade, às vezes sobe um pouco.
 * @param {Page} page
 * @param {object} opts
 */
export async function humanScroll(page, opts = {}) {
  const {
    totalDistance = rand(400, 1200), // pixels a descer no total
    steps = Math.floor(rand(4, 12)),
    minPause = 0.3,
    maxPause = 2.5,
  } = opts;

  let scrolled = 0;

  for (let i = 0; i < steps; i++) {
    // Às vezes sobe um pouco (comportamento real)
    const goingUp = Math.random() < 0.12;
    const stepSize = goingUp
      ? -rand(30, 120)
      : rand(60, totalDistance / steps);

    scrolled += stepSize;

    // Velocidade variável — simula aceleração/desaceleração
    const speed = rand(80, 300); // px/s
    const duration = Math.abs(stepSize) / speed * 1000;
    const subSteps = Math.ceil(duration / 16); // ~60fps

    for (let j = 0; j < subSteps; j++) {
      const delta = stepSize / subSteps;
      await page.mouse.wheel(0, delta);
      await sleep(16 + rand(0, 8));
    }

    // Pausa entre scrolls
    await randomSleep(minPause, maxPause);

    // Micro-pausa extra ocasional (lendo)
    if (Math.random() < 0.3) {
      await randomSleep(1, 4);
    }
  }
}

// ─── Movimento de Mouse Humanizado ───────────────────────────────────────────

/**
 * Move o mouse em curva bezier até uma posição alvo.
 * @param {Page} page
 * @param {number} targetX
 * @param {number} targetY
 */
export async function humanMouseMove(page, targetX, targetY) {
  const startPos = await page.evaluate(() => ({ x: 0, y: 0 }));

  // Ponto de controle da curva bezier (aleatoriza o caminho)
  const cpX = rand(
    Math.min(startPos.x, targetX),
    Math.max(startPos.x, targetX)
  );
  const cpY = rand(
    Math.min(startPos.y, targetY),
    Math.max(startPos.y, targetY)
  );

  const steps = Math.floor(rand(20, 50));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Quadratic Bezier
    const x = (1 - t) ** 2 * startPos.x + 2 * (1 - t) * t * cpX + t ** 2 * targetX;
    const y = (1 - t) ** 2 * startPos.y + 2 * (1 - t) * t * cpY + t ** 2 * targetY;

    await page.mouse.move(x, y);
    await sleep(rand(8, 25));
  }
}

/**
 * Move o mouse aleatoriamente pela tela (ação idle).
 * @param {Page} page
 */
export async function randomMouseWander(page) {
  const viewport = page.viewportSize() || { width: 1366, height: 768 };
  const x = rand(100, viewport.width - 100);
  const y = rand(100, viewport.height - 100);
  await humanMouseMove(page, x, y);
}

// ─── Clique Humanizado ────────────────────────────────────────────────────────

/**
 * Clique humanizado: move até o elemento, pausa, clica com offset.
 * @param {Page} page
 * @param {string|ElementHandle} selector
 */
export async function humanClick(page, selector) {
  const element =
    typeof selector === 'string' ? await page.waitForSelector(selector) : selector;

  if (!element) return;

  const box = await element.boundingBox();
  if (!box) return;

  // Ponto de clique com offset aleatório (não clica sempre no centro)
  const x = box.x + box.width * rand(0.3, 0.7);
  const y = box.y + box.height * rand(0.3, 0.7);

  await humanMouseMove(page, x, y);
  await randomSleep(0.1, 0.5); // pausa antes de clicar

  await page.mouse.click(x, y, {
    delay: rand(50, 180), // tempo entre mousedown e mouseup
  });

  await randomSleep(0.3, 1.2); // pausa pós-clique
}

// ─── Pausa de Leitura ─────────────────────────────────────────────────────────

/**
 * Pausa proporcional ao tamanho do texto (simula leitura humana).
 * Velocidade: 120-180 palavras/min + ruído aleatório.
 * @param {string|number} textOrLength - texto ou número de caracteres
 */
export async function readingPause(textOrLength) {
  const chars =
    typeof textOrLength === 'string' ? textOrLength.length : textOrLength;

  const words = chars / 5; // ~5 chars por palavra
  const wpm = rand(120, 180);
  const baseMs = (words / wpm) * 60_000;

  // Adiciona ruído de ±30%
  const noise = baseMs * rand(-0.3, 0.3);
  const totalMs = Math.max(1000, baseMs + noise);

  await sleep(totalMs);
}

// ─── Ações Idle Aleatórias ────────────────────────────────────────────────────

/**
 * Realiza uma ação aleatória de idle (mouse, scroll pequeno, pausa).
 * Simula usuário distraído ou pensando.
 * @param {Page} page
 */
export async function randomIdleAction(page) {
  const action = Math.floor(rand(0, 4));

  switch (action) {
    case 0:
      // Mover mouse aleatoriamente
      await randomMouseWander(page);
      break;
    case 1:
      // Pequeno scroll para cima e volta
      await page.mouse.wheel(0, -rand(20, 80));
      await randomSleep(0.5, 1.5);
      await page.mouse.wheel(0, rand(20, 80));
      break;
    case 2:
      // Apenas pausar
      await randomSleep(2, 6);
      break;
    case 3:
      // Mover mouse + pausar
      await randomMouseWander(page);
      await randomSleep(1, 3);
      break;
  }
}

/**
 * Pausa longa de entrada em página (simula usuário se orientando).
 * @param {Page} page
 */
export async function entryPause(page) {
  await randomSleep(8, 20);
  await randomMouseWander(page);
  await randomSleep(2, 5);
}

// Exporta utilitários também
export { sleep, randomSleep, rand };
