import OpenAI from 'openai';
import chalk from 'chalk';
import { getModelDef, type ModelDef } from './providers.js';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMServiceConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export class LLMService {
  private client: OpenAI;
  private _model: string;
  private _provider: string;
  private _baseURL: string;

  private _sessionUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private _lastUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private _requestCount = 0;
  private _abortController: AbortController | null = null;

  constructor(config: LLMServiceConfig) {
    if (!config.apiKey) {
      throw new Error(`API Key não encontrada para ${config.provider}. Use /auth para configurar.`);
    }
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    this._model = config.model;
    this._provider = config.provider;
    this._baseURL = config.baseURL;
  }

  get sessionUsage(): TokenUsage { return { ...this._sessionUsage }; }
  get lastUsage(): TokenUsage { return { ...this._lastUsage }; }
  get requestCount(): number { return this._requestCount; }
  get modelName(): string { return this._model; }
  get provider(): string { return this._provider; }

  get modelDef(): ModelDef | undefined {
    return getModelDef(this._provider, this._model);
  }

  get contextWindow(): number {
    return this.modelDef?.contextWindow || 64000;
  }

  setModel(model: string) { this._model = model; }

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
    const TIMEOUT = 90_000;
    this._abortController = new AbortController();

    try {
      // max_tokens por provider (DeepSeek max 8192, Gemini/OpenAI 16384)
      const MAX_TOKENS_MAP: Record<string, number> = {
        ollama: 4096, deepseek: 8192, groq: 8192, huggingface: 4096,
        qwen: 8192, minimax: 8192,
        openai: 16384, gemini: 16384,
      };
      const providerMax = MAX_TOKENS_MAP[this._provider] || 8192;
      const maxTokens = attempt > 0 ? Math.min(4096, providerMax) : providerMax;

      const apiCall = this.client.chat.completions.create({
        model: this._model,
        messages,
        temperature: 0.1,
        max_tokens: maxTokens,
        stream: false,
        tools: tools,
        tool_choice: tools ? 'auto' : undefined
      }, { signal: this._abortController.signal as any });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: API não respondeu em ${TIMEOUT / 1000}s`)), TIMEOUT)
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

      const msg = response.choices[0].message;
      if (!msg.content && (msg as any).reasoning) {
        msg.content = (msg as any).reasoning;
      }
      return msg;
    } catch (error: any) {
      const msg = error?.message || '';
      const status = (error as any)?.status || 0;

      // Rate limit (429): propaga com marcação pra pool fazer fallback
      if (status === 429 || msg.includes('429')) {
        const err = new Error(`429 rate limit (${this._provider}/${this._model})`);
        (err as any).status = 429;
        (err as any).provider = this._provider;
        throw err;
      }

      if ((msg.includes('413') || msg.includes('too large') || msg.includes('Request too large') || msg.includes('reduce your message')) && attempt < 2) {
        const reduced = this.reduceMessages(messages);
        const reducedTools = attempt === 0 ? tools : undefined;
        return this._chatWithRetry(reduced, reducedTools, attempt + 1);
      }
      if (msg.includes('Timeout') && attempt < 2) {
        const reduced = this.reduceMessages(messages);
        return this._chatWithRetry(reduced, tools, attempt + 1);
      }
      throw error;
    }
  }

  private reduceMessages(messages: any[]): any[] {
    if (messages.length <= 5) return messages;
    const system = messages.filter(m => m.role === 'system').slice(0, 1);
    const last = messages.slice(-4);
    return [...system, { role: 'system', content: '[Contexto reduzido para caber no limite do modelo]' }, ...last];
  }

  async chatStream(messages: any[], tools?: any[]): Promise<any> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this._model,
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
      throw new Error(`Erro na API (${this._provider}/${this._model}): ${(error as any).message}`);
    }
  }
}
