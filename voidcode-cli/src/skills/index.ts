import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/ui.js';

export interface Skill {
  name: string;
  description: string;
  tool: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  };
  handler: (args: any) => Promise<string>;
}

const SKILLS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.voidcode',
  'skills'
);

const loadedSkills: Map<string, Skill> = new Map();

export function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

export async function loadSkills(): Promise<{ tools: any[]; handlers: Record<string, (args: any) => any> }> {
  ensureSkillsDir();
  const tools: any[] = [];
  const handlers: Record<string, (args: any) => any> = {};

  const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const skillPath = path.join(SKILLS_DIR, file);
      const mod = await import(`file://${skillPath}`);

      if (mod.tool && mod.handler) {
        const skillName = mod.tool.function?.name || file.replace('.js', '');
        tools.push(mod.tool);
        handlers[skillName] = mod.handler;
        loadedSkills.set(skillName, {
          name: skillName,
          description: mod.tool.function?.description || '',
          tool: mod.tool,
          handler: mod.handler
        });
        logger.info(`Skill carregada: ${skillName}`);
      }
    } catch (e: any) {
      logger.error(`Falha ao carregar skill ${file}: ${e.message}`);
    }
  }

  return { tools, handlers };
}

export function getLoadedSkills(): Map<string, Skill> {
  return loadedSkills;
}

export function getSkillsDir(): string {
  return SKILLS_DIR;
}
