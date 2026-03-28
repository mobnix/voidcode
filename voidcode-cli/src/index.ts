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
  .option('-i, --insane', 'Modo Insano: Executa comandos sem pedir confirmação', false);

program
  .action(async (options) => {
    // Checa se tem alguma API key configurada
    const hasKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY ||
                   process.env.QWEN_API_KEY || process.env.MINIMAX_API_KEY ||
                   process.env.CUSTOM_API_KEY;

    if (!hasKey) {
      const success = await runConfigWizard(VOIDCODE_HOME);
      if (!success) process.exit(1);
      dotenv.config({ path: envPath });
    }

    splashScreen();

    if (options.insane) {
      logger.glitch('MODO INSANO ATIVADO');
    }

    const provider = process.env.LLM_PROVIDER || 'deepseek';
    const model = process.env.LLM_MODEL || 'deepseek-chat';
    logger.success(`Conectado: ${provider}/${model}`);
    logger.matrix('\n[SISTEMA]: Use /auth para trocar provider. /help para comandos.\n');

    const chat = new ChatLoop(options.insane);
    await chat.start();
  });

program.parse();
