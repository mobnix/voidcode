#!/usr/bin/env node
import { Command } from 'commander';
import { runConfigWizard } from './cli/wizard.js';
import { splashScreen, logger } from './utils/ui.js';
import { ChatLoop } from './cli/chat.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const VOIDCODE_HOME = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.voidcode'
);
const envPath = path.join(VOIDCODE_HOME, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const program = new Command();

program
  .name('voidcode')
  .description('Multi-LLM Agentic CLI with Matrix Aesthetics')
  .version('2.0.0')
  .option('-i, --insane', 'Modo Insano: Executa comandos sem pedir confirmação', false)
  .option('-c, --continue', 'Continua a última sessão automaticamente', false);

program
  .action(async (options) => {
    // Checa se tem alguma API key configurada
    const { PROVIDERS } = await import('./core/providers.js');
    const hasKey = PROVIDERS.some(p => process.env[p.envKey]);

    if (!hasKey) {
      const success = await runConfigWizard(VOIDCODE_HOME);
      if (!success) process.exit(1);
      dotenv.config({ path: envPath });
    }

    splashScreen();

    // Mostra providers conectados
    const connected = PROVIDERS.filter(p => process.env[p.envKey]).map(p => p.name);
    const defaultProvider = process.env.LLM_PROVIDER || 'deepseek';
    const defaultModel = process.env.LLM_MODEL || 'deepseek-chat';

    if (options.insane) {
      logger.glitch('MODO INSANO ATIVADO');
    }
    if (options.continue) {
      logger.info('Retomando última sessão...');
    }

    if (connected.length > 1) {
      logger.success(`${connected.length} providers: ${connected.join(', ')}`);
      logger.info(`Default: ${defaultProvider}/${defaultModel} | Routing: AUTO`);
    } else {
      logger.success(`Conectado: ${defaultProvider}/${defaultModel}`);
    }
    logger.info('/auth providers | /help comandos\n');

    const chat = new ChatLoop(options.insane, options.continue);
    await chat.start();
  });

program.parse();
