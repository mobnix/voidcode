import inquirer from 'inquirer';
import fs from 'node:fs';
import path from 'node:path';
import { logger, splashScreen } from '../utils/ui.js';

const ENV_PATH = path.join(process.cwd(), '.env');

export async function runConfigWizard() {
  splashScreen();
  logger.info('Iniciando o Wizard de Configuração do VoidCode CLI...');

  if (fs.existsSync(ENV_PATH)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Arquivo .env já existe. Deseja reconfigurar a API Key?',
        default: false
      }
    ]);

    if (!overwrite) {
      logger.success('Configuração mantida!');
      return true;
    }
  }

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Insira sua DeepSeek API Key:',
      mask: '*',
      validate: (input: string) => input.length > 10 ? true : 'A API Key parece ser inválida.'
    }
  ]);

  const envContent = `DEEPSEEK_API_KEY=${apiKey}\nDEEPSEEK_BASE_URL=https://api.deepseek.com/v1\nLLM_MODEL=deepseek-chat`;
  
  try {
    fs.writeFileSync(ENV_PATH, envContent);
    logger.success('Configuração salva com sucesso no arquivo .env!');
    logger.matrix('\nWake up, Neo... O sistema está pronto.');
    return true;
  } catch (error) {
    logger.error('Erro ao salvar configuração: ' + (error as Error).message);
    return false;
  }
}
