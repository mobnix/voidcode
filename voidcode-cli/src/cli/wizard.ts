import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { logger, splashScreen } from '../utils/ui.js';
import { PROVIDERS } from '../core/providers.js';
import { saveConfig } from '../core/deepseek.js';
import chalk from 'chalk';

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
  logger.info('Primeira execução! Configurando VoidCode...\n');

  // Escolhe provider
  console.log(chalk.hex('#00FF41')('  Providers disponíveis:'));
  PROVIDERS.forEach((p, i) => {
    console.log(`  ${chalk.hex('#008F11')(`${i + 1})`)} ${chalk.hex('#ADFF2F')(p.name)}`);
  });
  console.log();

  const providerChoice = await ask('Provider (1-5):', '1');
  const idx = parseInt(providerChoice) - 1;
  const provider = PROVIDERS[Math.max(0, Math.min(idx, PROVIDERS.length - 1))]!;

  let baseURL = provider.baseURL;
  if (provider.id === 'custom') {
    baseURL = await ask('Base URL:', '');
    if (!baseURL) return false;
  }

  const apiKey = await ask(`${provider.name} API Key:`);
  if (!apiKey || apiKey.length < 5) {
    logger.error('Key inválida.');
    return false;
  }

  let model = provider.models[0]?.id || '';
  if (provider.models.length > 1) {
    console.log(chalk.hex('#00FF41')('\n  Modelos:'));
    provider.models.forEach((m, i) => {
      console.log(`  ${chalk.hex('#008F11')(`${i + 1})`)} ${chalk.hex('#ADFF2F')(m.name)} - ${chalk.hex('#005500')(m.description)}`);
    });
    const mc = await ask('\nModelo:', '1');
    const mi = parseInt(mc) - 1;
    if (mi >= 0 && mi < provider.models.length) model = provider.models[mi]!.id;
  } else if (!model) {
    model = await ask('Nome do modelo:');
  }

  saveConfig({ provider: provider.id, model, baseURL, apiKey, envKey: provider.envKey });

  logger.success(`Configurado: ${provider.name} / ${model}`);
  logger.matrix('\nWake up... O sistema está pronto.\n');
  return true;
}
