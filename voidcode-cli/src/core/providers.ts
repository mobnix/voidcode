export type CostTier = 'free' | 'cheap' | 'mid' | 'premium';
export type Capability = 'code' | 'reasoning' | 'tools' | 'fast';

export interface ModelDef {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  costTier: CostTier;
  capabilities: Capability[];
  noTools?: boolean;
}

export interface Provider {
  id: string;
  name: string;
  baseURL: string;
  models: ModelDef[];
  envKey: string;
}

// Modelos que NÃO suportam tool use
export const NO_TOOLS_MODELS = new Set([
  'deepseek-r1', 'deepseek-r1:8b', 'deepseek-r1:14b', 'deepseek-r1:32b', 'deepseek-r1:70b',
  'deepseek-reasoner',
  'deepseek-r1-distill-llama-70b',
  'qwen-qwq-32b',
]);

export const PROVIDERS: Provider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', description: 'Rápido, bom para coding e tool use', contextWindow: 64000, costTier: 'cheap', capabilities: ['code', 'tools', 'fast'] },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', description: 'Mais lento, melhor raciocínio complexo', contextWindow: 64000, costTier: 'cheap', capabilities: ['reasoning'], noTools: true },
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Modelo flagship, multimodal', contextWindow: 128000, costTier: 'premium', capabilities: ['code', 'tools', 'reasoning'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Rápido e barato', contextWindow: 128000, costTier: 'mid', capabilities: ['code', 'tools', 'fast'] },
      { id: 'o3-mini', name: 'o3-mini (Codex)', description: 'Raciocínio avançado para código', contextWindow: 128000, costTier: 'premium', capabilities: ['code', 'tools', 'reasoning'] },
    ]
  },
  {
    id: 'qwen',
    name: 'Qwen (Alibaba)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'QWEN_API_KEY',
    models: [
      { id: 'qwen-plus', name: 'Qwen Plus', description: 'Balanceado, bom custo-benefício', contextWindow: 32000, costTier: 'cheap', capabilities: ['code', 'tools', 'fast'] },
      { id: 'qwen-max', name: 'Qwen Max', description: 'Máxima capacidade', contextWindow: 32000, costTier: 'mid', capabilities: ['code', 'tools', 'reasoning'] },
      { id: 'qwen-turbo', name: 'Qwen Turbo', description: 'Mais rápido, mais barato', contextWindow: 32000, costTier: 'cheap', capabilities: ['code', 'tools', 'fast'] },
    ]
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimax.chat/v1',
    envKey: 'MINIMAX_API_KEY',
    models: [
      { id: 'MiniMax-Text-01', name: 'MiniMax Text 01', description: 'Modelo principal de texto', contextWindow: 64000, costTier: 'mid', capabilities: ['code', 'tools'] },
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Ultra rápido, bom para coding', contextWindow: 32000, costTier: 'free', capabilities: ['code', 'tools', 'fast'] },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Rápido, limite 6k tokens (tier free)', contextWindow: 6000, costTier: 'free', capabilities: ['fast'] },
      { id: 'qwen-qwq-32b', name: 'Qwen QWQ 32B', description: 'Reasoning, bom contexto', contextWindow: 32000, costTier: 'free', capabilities: ['reasoning'], noTools: true },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B', description: 'Reasoning avançado', contextWindow: 32000, costTier: 'free', capabilities: ['reasoning'], noTools: true },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', description: 'Google, rápido e leve', contextWindow: 8000, costTier: 'free', capabilities: ['fast'] },
    ]
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    baseURL: 'https://api-inference.huggingface.co/v1',
    envKey: 'HF_API_KEY',
    models: [
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen 2.5 Coder 32B', description: 'Melhor para coding, gratuito', contextWindow: 32000, costTier: 'free', capabilities: ['code'] },
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', description: 'Versátil, gratuito', contextWindow: 32000, costTier: 'free', capabilities: ['code'] },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', description: 'Rápido, gratuito', contextWindow: 32000, costTier: 'free', capabilities: ['fast'] },
      { id: 'deepseek-ai/DeepSeek-Coder-V2-Instruct', name: 'DeepSeek Coder V2', description: 'Coding especializado', contextWindow: 32000, costTier: 'free', capabilities: ['code'] },
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Rápido, bom custo-benefício', contextWindow: 1000000, costTier: 'cheap', capabilities: ['code', 'tools', 'fast'] },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Máxima capacidade', contextWindow: 1000000, costTier: 'mid', capabilities: ['code', 'tools', 'reasoning'] },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Ultra rápido', contextWindow: 1000000, costTier: 'cheap', capabilities: ['code', 'tools', 'fast'] },
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseURL: 'http://localhost:11434/v1',
    envKey: 'OLLAMA_API_KEY',
    models: [
      { id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B', description: 'Melhor para coding local', contextWindow: 16000, costTier: 'free', capabilities: ['code'] },
      { id: 'deepseek-coder-v2:16b', name: 'DeepSeek Coder V2 16B', description: 'Coding especializado', contextWindow: 16000, costTier: 'free', capabilities: ['code'] },
      { id: 'llama3.1:8b', name: 'Llama 3.1 8B', description: 'Rápido e leve', contextWindow: 8000, costTier: 'free', capabilities: ['fast'] },
      { id: 'codellama:13b', name: 'Code Llama 13B', description: 'Meta coding model', contextWindow: 16000, costTier: 'free', capabilities: ['code'] },
      { id: 'mistral:7b', name: 'Mistral 7B', description: 'Balanceado', contextWindow: 8000, costTier: 'free', capabilities: ['fast'] },
    ]
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    baseURL: '',
    envKey: 'CUSTOM_API_KEY',
    models: []
  }
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find(p => p.id === id);
}

export function getModelDef(providerId: string, modelId: string): ModelDef | undefined {
  const p = getProvider(providerId);
  return p?.models.find(m => m.id === modelId);
}
