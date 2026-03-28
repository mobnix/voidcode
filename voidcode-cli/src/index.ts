#!/usr/bin/env node
import { Command } from 'commander';
import { runConfigWizard } from './cli/wizard.js';
import { splashScreen, logger } from './utils/ui.js';
import { ChatLoop } from './cli/chat.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const program = new Command();

program
  .name('voidcode')
  .description('DeepSeek Agentic CLI with Matrix Aesthetics')
  .version('1.0.0')
  .option('-i, --insane', 'Modo Insano: Executa comandos sem pedir confirmação (YOLO)', false);

program
  .action(async (options) => {
    const envPath = path.join(process.cwd(), '.env');

    if (!fs.existsSync(envPath) || !process.env.DEEPSEEK_API_KEY) {
      const success = await runConfigWizard();
      if (!success) process.exit(1);
    }

    splashScreen();
    
    if (options.insane) {
      logger.glitch('MODO INSANO ATIVADO: Nenhuma confirmação será solicitada.');
    }

    logger.success(`Sistema Conectado. Modelo: ${process.env.LLM_MODEL || 'deepseek-chat'}`);
    logger.matrix('\n[SISTEMA]: Link estabelecido com a Matrix. Digite "exit" para sair.\n');
    
    const chat = new ChatLoop(options.insane);
    await chat.start();
  });

program.parse();
