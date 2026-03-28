export interface Provider {
  id: string;
  name: string;
  baseURL: string;
  models: { id: string; name: string; description: string }[];
  envKey: string; // nome da var no .env
}

export const PROVIDERS: Provider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', description: 'Rápido, bom para coding e tool use' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', description: 'Mais lento, melhor raciocínio complexo' },
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Modelo flagship, multimodal' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Rápido e barato' },
      { id: 'o3-mini', name: 'o3-mini (Codex)', description: 'Raciocínio avançado para código' },
    ]
  },
  {
    id: 'qwen',
    name: 'Qwen (Alibaba)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'QWEN_API_KEY',
    models: [
      { id: 'qwen-plus', name: 'Qwen Plus', description: 'Balanceado, bom custo-benefício' },
      { id: 'qwen-max', name: 'Qwen Max', description: 'Máxima capacidade' },
      { id: 'qwen-turbo', name: 'Qwen Turbo', description: 'Mais rápido, mais barato' },
    ]
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimax.chat/v1',
    envKey: 'MINIMAX_API_KEY',
    models: [
      { id: 'MiniMax-Text-01', name: 'MiniMax Text 01', description: 'Modelo principal de texto' },
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Ultra rápido, bom para coding' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Mais rápido, tarefas simples' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', description: 'Bom contexto (32k), balanceado' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', description: 'Google, rápido e leve' },
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
