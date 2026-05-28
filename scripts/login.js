#!/usr/bin/env node
/**
 * Script de login manual no Facebook.
 * Execute UMA VEZ para salvar a sessão.
 * O browser ficará aberto para você fazer login.
 *
 * Uso: node scripts/login.js
 */
import 'dotenv/config';
import { launchBrowser, newPage } from '../src/browser/launcher.js';
import { saveSession, updateSessionStatus } from '../src/browser/session.js';
import readline from 'readline';

const SESSION_DIR = process.env.FB_SESSION_DIR || './data/sessions/profile1';
const PROFILE_NAME = 'profile1';

async function waitForInput(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log('');
  console.log('🔐 Login Manual do Facebook');
  console.log('═══════════════════════════════════');
  console.log(`📁 Perfil: ${SESSION_DIR}`);
  console.log('');
  console.log('1. O browser irá abrir automaticamente.');
  console.log('2. Faça login normalmente no Facebook.');
  console.log('3. Quando terminar, pressione ENTER aqui.');
  console.log('');

  const context = await launchBrowser({ sessionDir: SESSION_DIR, headless: false });
  const page = await newPage(context);

  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
  console.log('✅ Browser aberto. Faça login no Facebook...');

  await waitForInput('⏎  Pressione ENTER após o login estar completo...');

  // Salva sessão
  await saveSession(context, SESSION_DIR);
  await updateSessionStatus(PROFILE_NAME, SESSION_DIR, 'active');

  console.log('');
  console.log('✅ Sessão salva com sucesso!');
  console.log('   Você pode fechar o browser agora ou aguardar.');

  await context.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro no login:', err.message);
  process.exit(1);
});
