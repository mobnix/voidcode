import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { logger, splashScreen } from '../utils/ui.js';
import { PROVIDERS } from '../core/providers.js';
import { saveConfig } from '../core/deepseek.js';
import { openGoogleAIStudio } from '../core/google-auth.js';
import chalk from 'chalk';
import axios from 'axios';

function ask(question: string, defaultVal?: string): Promise<string> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val: string) => { if (!resolved) { resolved = true; resolve(val); } };
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.on('close', () => done(defaultVal || ''));
    const suffix = defaultVal ? chalk.dim(` [${defaultVal}]`) : '';
    rl.question(chalk.hex('#00FF41')(question) + suffix + ' ', (answer) => {
      done(answer?.trim() || defaultVal || '');
      rl.close();
    });
  });
}

async function waitForTelegramMessage(botBase: string, timeout: number): Promise<number | null> {
  const start = Date.now();
  let offset = 0;

  // Limpa updates antigos primeiro
  try {
    const old = await axios.get(`${botBase}/getUpdates`, { params: { offset: -1 }, timeout: 5000 });
    if (old.data.ok && old.data.result.length > 0) {
      offset = old.data.result[old.data.result.length - 1].update_id + 1;
    }
  } catch { /* ok */ }

  while (Date.now() - start < timeout) {
    try {
      const res = await axios.get(`${botBase}/getUpdates`, {
        params: { offset, timeout: 5, limit: 1 },
        timeout: 10000,
      });
      if (res.data.ok && res.data.result.length > 0) {
        const update = res.data.result[0];
        if (update.message?.chat?.id) {
          return update.message.chat.id;
        }
      }
    } catch { /* retry */ }
  }
  return null;
}

export async function runConfigWizard(voidcodeHome: string): Promise<boolean> {
  if (!fs.existsSync(voidcodeHome)) fs.mkdirSync(voidcodeHome, { recursive: true });

  splashScreen();

  const sep = chalk.hex('#003B00')('─'.repeat(process.stdout.columns || 80));
  console.log(sep);
  console.log(chalk.hex('#00FF41').bold('  SETUP INICIAL'));
  console.log(sep);
  console.log(chalk.hex('#008F11')('  Bem-vindo ao VoidCode! Vamos configurar tudo.\n'));

  // ─── STEP 1: Provider ───
  console.log(chalk.hex('#00FF41').bold('  STEP 1/3 — Provider & API Key\n'));

  PROVIDERS.forEach((p, i) => {
    console.log(`  ${chalk.hex('#ADFF2F')(`${i + 1})`)} ${chalk.hex('#00FF41')(p.name)} ${chalk.hex('#005500')(`— ${p.models.map(m => m.id).join(', ') || 'custom'}`)}`);
  });
  console.log();

  const providerChoice = await ask(`Provider (1-${PROVIDERS.length}):`, '1');
  const idx = Math.max(0, Math.min(parseInt(providerChoice) - 1, PROVIDERS.length - 1));
  const provider = PROVIDERS[idx]!;

  let baseURL = provider.baseURL;
  if (provider.id === 'custom') {
    baseURL = await ask('Base URL (OpenAI-compatible):', '');
    if (!baseURL) { logger.error('URL necessária.'); return false; }
  }

  let apiKey = '';

  if (provider.id === 'gemini') {
    // Abre Google AI Studio automaticamente
    logger.info('Abrindo Google AI Studio no navegador...');
    console.log(chalk.hex('#005500')('  Faça login com sua conta Google e copie a API Key.\n'));
    openGoogleAIStudio();
    apiKey = await ask('Cole a API Key:');
  } else if (provider.id === 'ollama') {
    apiKey = 'ollama';
  } else {
    apiKey = await ask(`Insira sua API Key (${provider.name}):`);
  }

  if (provider.id !== 'ollama' && (!apiKey || apiKey.length < 5)) {
    logger.error('Key inválida.');
    return false;
  }

  // ─── STEP 2: Modelo ───
  console.log(chalk.hex('#00FF41').bold('\n  STEP 2/3 — Modelo\n'));

  let model = provider.models[0]?.id || '';
  if (provider.models.length > 0) {
    provider.models.forEach((m, i) => {
      console.log(`  ${chalk.hex('#ADFF2F')(`${i + 1})`)} ${chalk.hex('#00FF41')(m.name)} ${chalk.hex('#005500')(`— ${m.description}`)}`);
    });
    console.log(`  ${chalk.hex('#ADFF2F')(`${provider.models.length + 1})`)} ${chalk.hex('#00FF41')('Custom')}\n`);

    const mc = await ask('Modelo:', '1');
    const mi = parseInt(mc) - 1;
    if (mi >= 0 && mi < provider.models.length) {
      model = provider.models[mi]!.id;
    } else {
      model = await ask('Nome do modelo:');
    }
  } else {
    model = await ask('Nome do modelo:');
  }

  if (!model) { logger.error('Modelo necessário.'); return false; }

  // Salva config do provider
  saveConfig({ provider: provider.id, model, baseURL, apiKey, envKey: provider.envKey });
  logger.success(`Configurado: ${provider.name} / ${model}\n`);

  // ─── STEP 3: Telegram (opcional) ───
  console.log(chalk.hex('#00FF41').bold('  STEP 3/3 — Telegram Bot (opcional)\n'));
  console.log(chalk.hex('#005500')('  Conecte um bot do Telegram para controlar o VoidCode pelo celular.'));
  console.log(chalk.hex('#005500')('  Crie um bot em @BotFather no Telegram e cole o token aqui.\n'));

  const setupTg = await ask('Configurar Telegram agora? (y/N):', 'n');

  if (setupTg.toLowerCase() === 'y') {
    const token = await ask('Bot Token do @BotFather:');

    if (token && token.length > 20) {
      try {
        const botBase = `https://api.telegram.org/bot${token}`;
        const res = await axios.get(`${botBase}/getMe`, { timeout: 5000 });
        if (res.data.ok) {
          const botUsername = res.data.result.username;
          saveConfig({ envKey: 'TELEGRAM_BOT_TOKEN', apiKey: token });
          logger.success(`Bot @${botUsername} validado!`);
          console.log(chalk.hex('#008F11')(`\n  Agora mande qualquer mensagem para @${botUsername} no Telegram.`));
          logger.info('Aguardando sua mensagem...\n');

          // Espera o usuário mandar uma mensagem pro bot (timeout 60s)
          const chatId = await waitForTelegramMessage(botBase, 60_000);
          if (chatId) {
            saveConfig({ envKey: 'TELEGRAM_CHAT_ID', apiKey: String(chatId) });
            await axios.post(`${botBase}/sendMessage`, {
              chat_id: chatId,
              text: '🟢 *VoidCode conectado!*\n\nSeu bot está pronto. Envie comandos aqui como se estivesse no terminal.\n\n`/status` — ver status\n`/stop` — desconectar',
              parse_mode: 'Markdown'
            }, { timeout: 10000 });
            logger.success('Mensagem de confirmação enviada no Telegram!');
          } else {
            logger.warn('Timeout — nenhuma mensagem recebida. Configure depois com /telegram.');
          }
        } else {
          logger.error('Token inválido.');
        }
      } catch {
        logger.error('Não foi possível validar o token. Verifique e tente depois com /telegram.');
      }
    } else {
      logger.info('Sem problema. Configure depois com /telegram ou /menu.');
    }
  } else {
    logger.info('OK. Configure depois com /telegram ou /menu.');
  }

  console.log();
  logger.matrix('  "Free your mind..." — O sistema está pronto.\n');

  return true;
}
