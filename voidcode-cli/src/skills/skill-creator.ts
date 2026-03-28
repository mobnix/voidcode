import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/ui.js';
import { getSkillsDir, ensureSkillsDir } from './index.js';

export async function createSkill(name: string, description: string) {
  ensureSkillsDir();
  const toolName = name.toLowerCase().replace(/\s+/g, '_');
  const filePath = path.join(getSkillsDir(), `${toolName}.js`);

  const template = `// Skill: ${name}
// Description: ${description}

export const tool = {
  type: 'function',
  function: {
    name: '${toolName}',
    description: '${description}',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'O input para a skill' }
      },
      required: ['input']
    }
  }
};

export const handler = async ({ input }) => {
  // TODO: Implementar lógica real aqui
  return \`Skill ${name} executada com input: \${input}\`;
};
`;

  try {
    fs.writeFileSync(filePath, template);
    logger.success(`Nova Skill [${name}] forjada!`);
    logger.info(`Arquivo criado em: ${filePath}`);
    logger.info('Reinicie o VoidCode para carregar a skill.');
    return true;
  } catch (error: any) {
    logger.error(`Falha ao forjar skill: ${error.message}`);
    return false;
  }
}
