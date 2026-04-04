import { LLMService, type TokenUsage, type LLMServiceConfig } from './llm-service.js';
import { PROVIDERS, getProvider, type Provider } from './providers.js';
import { classifyTask, selectModel, type TaskType } from './router.js';

export class LLMPool {
  private connections = new Map<string, LLMService>();
  private _defaultProvider: string;
  private _defaultModel: string;
  private _rateLimited = new Map<string, number>(); // provider → timestamp cooldown

  constructor() {
    this._defaultProvider = process.env.LLM_PROVIDER || 'deepseek';
    this._defaultModel = process.env.LLM_MODEL || 'deepseek-chat';

    // Auto-discover: cria conexão pra cada provider com key presente
    for (const p of PROVIDERS) {
      if (p.id === 'custom') continue;
      const key = process.env[p.envKey];
      if (key) {
        try {
          const model = (p.id === this._defaultProvider && this._defaultModel)
            ? this._defaultModel
            : p.models[0]?.id;
          if (!model) continue;
          const service = new LLMService({
            provider: p.id,
            apiKey: key,
            baseURL: p.baseURL,
            model,
          });
          this.connections.set(p.id, service);
        } catch { /* skip invalid */ }
      }
    }

    // Custom provider
    const customKey = process.env.CUSTOM_API_KEY;
    const customURL = process.env.LLM_BASE_URL;
    if (customKey && customURL && this._defaultProvider === 'custom') {
      this.connections.set('custom', new LLMService({
        provider: 'custom',
        apiKey: customKey,
        baseURL: customURL,
        model: this._defaultModel || 'default',
      }));
    }
  }

  // --- Getters ---

  get(providerId: string): LLMService | undefined {
    return this.connections.get(providerId);
  }

  getDefault(): LLMService {
    const svc = this.connections.get(this._defaultProvider);
    if (svc) return svc;
    // Fallback: primeiro disponível
    const first = this.connections.values().next();
    if (first.done) throw new Error('Nenhum provider conectado. Use /auth para configurar.');
    return first.value;
  }

  getAvailable(): { providerId: string; provider: Provider; model: string }[] {
    const result: { providerId: string; provider: Provider; model: string }[] = [];
    for (const [id, svc] of this.connections) {
      const p = getProvider(id);
      if (p) result.push({ providerId: id, provider: p, model: svc.modelName });
    }
    return result;
  }

  // Filtra providers com rate limit ativo (60s cooldown)
  private getAvailableIds(): string[] {
    const now = Date.now();
    return [...this.connections.keys()].filter(id => {
      const limited = this._rateLimited.get(id);
      if (!limited) return true;
      if (now - limited > 60_000) { this._rateLimited.delete(id); return true; }
      return false;
    });
  }

  markRateLimited(providerId: string) {
    this._rateLimited.set(providerId, Date.now());
  }

  getForTask(taskType: TaskType): LLMService {
    const available = this.getAvailableIds();
    if (available.length === 0) return this.getDefault(); // all limited, try default anyway
    if (available.length === 1) return this.connections.get(available[0]!)!;

    const pick = selectModel(taskType, available);
    return this.connections.get(pick) || this.getDefault();
  }

  getForMessage(message: string): { service: LLMService; taskType: TaskType; routed: boolean } {
    const taskType = classifyTask(message);
    const available = this.getAvailableIds();

    if (available.length <= 1) {
      const svc = available.length === 1 ? this.connections.get(available[0]!)! : this.getDefault();
      return { service: svc, taskType, routed: available.length === 1 && available[0] !== this._defaultProvider };
    }

    const pick = selectModel(taskType, available);
    const service = this.connections.get(pick) || this.getDefault();
    const routed = pick !== this._defaultProvider;
    return { service, taskType, routed };
  }

  // --- Mutations ---

  addProvider(providerId: string, apiKey: string, baseURL: string, model: string) {
    const service = new LLMService({ provider: providerId, apiKey, baseURL, model });
    this.connections.set(providerId, service);
  }

  removeProvider(providerId: string) {
    this.connections.delete(providerId);
    if (this._defaultProvider === providerId) {
      const first = this.connections.keys().next();
      this._defaultProvider = first.done ? 'deepseek' : first.value;
    }
  }

  setDefault(providerId: string, model: string) {
    this._defaultProvider = providerId;
    this._defaultModel = model;
    const svc = this.connections.get(providerId);
    if (svc) svc.setModel(model);
  }

  setDefaultModel(model: string) {
    this._defaultModel = model;
    const svc = this.connections.get(this._defaultProvider);
    if (svc) svc.setModel(model);
  }

  // --- Stats ---

  get activeCount(): number {
    return this.connections.size;
  }

  get defaultProvider(): string {
    return this._defaultProvider;
  }

  get defaultModel(): string {
    return this._defaultModel;
  }

  get aggregatedUsage(): TokenUsage {
    const total: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    for (const svc of this.connections.values()) {
      const u = svc.sessionUsage;
      total.promptTokens += u.promptTokens;
      total.completionTokens += u.completionTokens;
      total.totalTokens += u.totalTokens;
    }
    return total;
  }

  get totalRequests(): number {
    let n = 0;
    for (const svc of this.connections.values()) n += svc.requestCount;
    return n;
  }

  usagePerProvider(): { provider: string; model: string; usage: TokenUsage; requests: number }[] {
    const result: { provider: string; model: string; usage: TokenUsage; requests: number }[] = [];
    for (const [id, svc] of this.connections) {
      result.push({ provider: id, model: svc.modelName, usage: svc.sessionUsage, requests: svc.requestCount });
    }
    return result;
  }

  // Abort all
  abortAll() {
    for (const svc of this.connections.values()) svc.abort();
  }
}
