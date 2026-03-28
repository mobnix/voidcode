import OpenAI from 'openai';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { PROVIDERS, type Provider } from './providers.js';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface LLMConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.voidcode');
const ENV_PATH = path.join(CONFIG_DIR, '.env');

// Carrega config ativa do .env
function loadConfig(): LLMConfig {
  const provider = process.env.LLM_PROVIDER || 'deepseek';
  const p = PROVIDERS.find(p => p.id === provider);

  // Tenta a key do provider ativo, ou fallback para DEEPSEEK_API_KEY
  const apiKey = process.env[p?.envKey || 'DEEPSEEK_API_KEY'] || process.env.DEEPSEEK_API_KEY || '';
  const baseURL = process.env.LLM_BASE_URL || p?.baseURL || 'https://api.deepseek.com/v1';
  const model = process.env.LLM_MODEL || p?.models[0]?.id || 'deepseek-chat';

  return { provider, apiKey, baseURL, model };
}

// Salva config no .env
export function saveConfig(config: Partial<LLMConfig> & { apiKey?: string; envKey?: string }) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  // Lê .env existente
  let existing: Record<string, string> = {};
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && v.length) existing[k.trim()] = v.join('=').trim();
    }
  }

  // Atualiza
  if (config.provider) existing['LLM_PROVIDER'] = config.provider;
  if (config.model) existing['LLM_MODEL'] = config.model;
  if (config.baseURL) existing['LLM_BASE_URL'] = config.baseURL;
  if (config.apiKey && config.envKey) existing[config.envKey] = config.apiKey;

  // Escreve
  const envContent = Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('\n');
  fs.writeFileSync(ENV_PATH, envContent, { mode: 0o600 });

  // Atualiza process.env
  for (const [k, v] of Object.entries(existing)) process.env[k] = v;
}

export class DeepSeekService {
  private client: OpenAI;
  private model: string;
  private providerName: string;

  private _sessionUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private _lastUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private _requestCount = 0;

  constructor() {
    const config = loadConfig();

    if (!config.apiKey) {
      throw new Error('API Key não encontrada. Use /auth para configurar.');
    }

    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    this.model = config.model;
    this.providerName = config.provider;
  }

  get sessionUsage(): TokenUsage { return { ...this._sessionUsage }; }
  get lastUsage(): TokenUsage { return { ...this._lastUsage }; }
  get requestCount(): number { return this._requestCount; }
  get modelName(): string { return this.model; }
  get provider(): string { return this.providerName; }

  setModel(model: string) { this.model = model; }

  // Reconecta com novo provider/key
  reconnect(apiKey: string, baseURL: string, model: string, provider: string) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
    this.providerName = provider;
  }

  private _abortController: AbortController | null = null;

  // Aborta a request HTTP em andamento
  abort() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  async chat(messages: any[], tools?: any[]): Promise<any> {
    return this._chatWithRetry(messages, tools, 0);
  }

  private async _chatWithRetry(messages: any[], tools: any[] | undefined, attempt: number): Promise<any> {
    const TIMEOUT = 180_000; // 3 minutos
    this._abortController = new AbortController();

    try {
      const apiCall = this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.1,
        max_tokens: Math.min(8192, attempt > 0 ? 2048 : 8192),
        stream: false,
        tools: tools,
        tool_choice: tools ? 'auto' : undefined
      }, { signal: this._abortController.signal as any });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: API não respondeu em ${TIMEOUT/1000}s`)), TIMEOUT)
      );

      const response = await Promise.race([apiCall, timeoutPromise]);

      if (response.usage) {
        this._lastUsage = {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        };
        this._sessionUsage.promptTokens += response.usage.prompt_tokens;
        this._sessionUsage.completionTokens += response.usage.completion_tokens;
        this._sessionUsage.totalTokens += response.usage.total_tokens;
      }
      this._requestCount++;

      return response.choices[0].message;
    } catch (error: any) {
      const msg = error?.message || '';
      // Request too large: reduz contexto e tenta de novo
      if ((msg.includes('413') || msg.includes('too large') || msg.includes('Request too large') || msg.includes('reduce your message')) && attempt < 2) {
        const reduced = this.reduceMessages(messages);
        const reducedTools = attempt === 0 ? tools : undefined;
        return this._chatWithRetry(reduced, reducedTools, attempt + 1);
      }
      // Timeout: retry 1 vez com contexto reduzido
      if (msg.includes('Timeout') && attempt < 1) {
        const reduced = this.reduceMessages(messages);
        return this._chatWithRetry(reduced, tools, attempt + 1);
      }
      throw new Error(`Erro na API (${this.providerName}/${this.model}): ${msg}`);
    }
  }

  // Reduz mensagens mantendo system prompt + últimas 4
  private reduceMessages(messages: any[]): any[] {
    if (messages.length <= 5) return messages;
    const system = messages.filter(m => m.role === 'system').slice(0, 1);
    const last = messages.slice(-4);
    return [...system, { role: 'system', content: '[Contexto reduzido para caber no limite do modelo]' }, ...last];
  }

  async chatStream(messages: any[], tools?: any[]): Promise<any> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.1,
        max_tokens: 8192,
        stream: true,
        tools: tools,
        tool_choice: tools ? 'auto' : undefined
      });

      let content = '';
      let toolCalls: any[] = [];
      let promptTokens = 0;
      let completionTokens = 0;

      process.stdout.write('\n' + chalk.hex('#00FF41').bold('VOIDCODE > '));

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          process.stdout.write(chalk.hex('#00FF41')(delta.content));
          content += delta.content;
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              while (toolCalls.length <= tc.index) {
                toolCalls.push({ type: 'function', id: '', function: { name: '', arguments: '' } });
              }
              const target = toolCalls[tc.index]!;
              if (tc.id) target.id = tc.id;
              if (tc.function?.name) target.function.name += tc.function.name;
              if (tc.function?.arguments) target.function.arguments += tc.function.arguments;
            }
          }
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }

      if (content) process.stdout.write('\n\n');

      const totalTokens = promptTokens + completionTokens;
      this._lastUsage = { promptTokens, completionTokens, totalTokens };
      this._sessionUsage.promptTokens += promptTokens;
      this._sessionUsage.completionTokens += completionTokens;
      this._sessionUsage.totalTokens += totalTokens;
      this._requestCount++;

      return {
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      };
    } catch (error) {
      throw new Error(`Erro na API (${this.providerName}/${this.model}): ${(error as any).message}`);
    }
  }
}
