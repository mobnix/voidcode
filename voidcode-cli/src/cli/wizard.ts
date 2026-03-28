import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { logger, splashScreen } from '../utils/ui.js';
import { PROVIDERS } from '../core/providers.js';
import { saveConfig } from '../core/deepseek.js';
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
      rl.close();
      done(answer?.trim() || defaultVal || '');
    });
  });
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

  const providerChoice = await ask('Provider (1-5):', '1');
  const idx = Math.max(0, Math.min(parseInt(providerChoice) - 1, PROVIDERS.length - 1));
  const provider = PROVIDERS[idx]!;

  let baseURL = provider.baseURL;
  if (provider.id === 'custom') {
    baseURL = await ask('Base URL (OpenAI-compatible):', '');
    if (!baseURL) { logger.error('URL necessária.'); return false; }
  }

  const apiKey = await ask(`${provider.name} API Key:`);
  if (!apiKey || apiKey.length < 5) {
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
      // Valida token
      try {
        const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 5000 });
        if (res.data.ok) {
          saveConfig({ envKey: 'TELEGRAM_BOT_TOKEN', apiKey: token });
          logger.success(`Telegram bot @${res.data.result.username} configurado!`);
          logger.info('Use /telegram no VoidCode para ativar.');
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
