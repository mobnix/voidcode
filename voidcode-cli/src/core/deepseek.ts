// Backward compatibility — re-exports from llm-service.ts
// Código novo deve importar de './llm-service.js'
import fs from 'node:fs';
import path from 'node:path';
import { PROVIDERS } from './providers.js';
import { LLMService, type LLMServiceConfig } from './llm-service.js';

export type { TokenUsage, LLMServiceConfig } from './llm-service.js';
export { LLMService } from './llm-service.js';

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.voidcode');
const ENV_PATH = path.join(CONFIG_DIR, '.env');

// Carrega config ativa do .env (para backward compat)
export function loadConfig(): LLMServiceConfig {
  const provider = process.env.LLM_PROVIDER || 'deepseek';
  const p = PROVIDERS.find(p => p.id === provider);
  const apiKey = process.env[p?.envKey || 'DEEPSEEK_API_KEY'] || process.env.DEEPSEEK_API_KEY || '';
  const baseURL = process.env.LLM_BASE_URL || p?.baseURL || 'https://api.deepseek.com/v1';
  const model = process.env.LLM_MODEL || p?.models[0]?.id || 'deepseek-chat';
  return { provider, apiKey, baseURL, model };
}

// Salva config no .env (suporta multi-key)
export function saveConfig(config: Partial<LLMServiceConfig> & { apiKey?: string; envKey?: string }) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  let existing: Record<string, string> = {};
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && v.length) existing[k.trim()] = v.join('=').trim();
    }
  }

  if (config.provider) existing['LLM_PROVIDER'] = config.provider;
  if (config.model) existing['LLM_MODEL'] = config.model;
  if (config.baseURL) existing['LLM_BASE_URL'] = config.baseURL;
  if (config.apiKey && config.envKey) existing[config.envKey] = config.apiKey;

  const envContent = Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('\n');
  fs.writeFileSync(ENV_PATH, envContent, { mode: 0o600 });

  for (const [k, v] of Object.entries(existing)) process.env[k] = v;
}

// Remove uma key do .env
export function removeConfigKey(envKey: string) {
  if (!fs.existsSync(ENV_PATH)) return;
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const lines = content.split('\n').filter(line => {
    const [k] = line.split('=');
    return k?.trim() !== envKey;
  });
  fs.writeFileSync(ENV_PATH, lines.join('\n'), { mode: 0o600 });
  delete process.env[envKey];
}

// Backward compat: DeepSeekService = LLMService com config do env
export class DeepSeekService extends LLMService {
  constructor() {
    super(loadConfig());
  }

  reconnect(apiKey: string, baseURL: string, model: string, provider: string) {
    // Cria nova instância internamente — para compat com código antigo
    Object.assign(this, new LLMService({ provider, apiKey, baseURL, model }));
  }
}
