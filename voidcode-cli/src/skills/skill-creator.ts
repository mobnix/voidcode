import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/ui.js';

export async function createSkill(name: string, description: string) {
  const toolName = name.toLowerCase().replace(/\s+/g, '_');
  const filePath = path.join(process.cwd(), 'src', 'tools', `${toolName}.ts`);

  const template = `
/**
 * Skill: ${name}
 * Description: ${description}
 */
export const ${toolName}Tool = {
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

export const ${toolName}Handler = async ({ input }: { input: string }) => {
  // Implementação gerada automaticamente
  return \`Skill ${name} executada com input: \${input}. (Implemente a lógica real aqui)\`;
};
`;

  try {
    fs.writeFileSync(filePath, template);
    logger.success(`Nova Skill [${name}] forjada nos arquivos da Matrix!`);
    logger.info(`Arquivo criado em: ${filePath}`);
    return true;
  } catch (error: any) {
    logger.error(`Falha ao forjar skill: ${error.message}`);
    return false;
  }
}
