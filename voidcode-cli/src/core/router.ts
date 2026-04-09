// Router inteligente: classifica tarefa e seleciona melhor provider + modelo

import { getProvider, type Capability } from './providers.js';

export type TaskType = 'code' | 'reasoning' | 'quick' | 'sub_agent';

// Tabela de preferência por tipo de tarefa (ordem de prioridade)
const ROUTING_TABLE: Record<TaskType, string[]> = {
  code:       ['deepseek', 'gemini', 'qwen', 'openai', 'groq', 'huggingface', 'ollama'],
  reasoning:  ['gemini', 'openai', 'deepseek', 'groq', 'qwen'],
  quick:      ['groq', 'gemini', 'deepseek', 'qwen', 'openai', 'ollama'],
  sub_agent:  ['deepseek', 'groq', 'gemini', 'qwen', 'huggingface', 'ollama'],
};

// Qual capability importa mais pra cada tipo de tarefa
const TASK_CAPABILITY: Record<TaskType, Capability> = {
  code: 'code',
  reasoning: 'reasoning',
  quick: 'fast',
  sub_agent: 'code',
};

// Padrões para classificação
const CODE_PATTERNS = /\b(cri[ea]|implement[ea]|escrev[ea]|edit[ea]|corrij[ea]|refator[ea]|fix|patch|build|code|função|function|classe|class|component|migrat|deploy|test[ea]|write|create|add|remove|delet[ea]|updat[ea]|chang[ea]|modif|import|export)\b|\.(ts|js|py|rs|go|tsx|jsx|css|html|json|yaml|yml|toml|sql|sh|md)\b/i;

const REASONING_PATTERNS = /\b(analis[ea]|planej[ea]|arquitet|expliqu[ea]|compar[ea]|design|architect|plan|analyze|explain|debug|investigat|diagnosti|strategy|review|avaliar|pensar|reason|think|complex|difficult|optimization|otimiz)\b/i;

const QUICK_PATTERNS = /\b(o que é|what is|como funciona|how does|how to|qual|quais|where|onde|when|quando|why|por que|define|definição|meaning|significado)\b/i;

export function classifyTask(message: string): TaskType {
  const msg = message.trim();

  // Mensagens curtas → quick
  if (msg.length < 40 && !CODE_PATTERNS.test(msg)) {
    return 'quick';
  }

  // Perguntas simples → quick
  if (QUICK_PATTERNS.test(msg) && !CODE_PATTERNS.test(msg) && msg.length < 120) {
    return 'quick';
  }

  // Raciocínio/análise complexa → reasoning
  if (REASONING_PATTERNS.test(msg) && !CODE_PATTERNS.test(msg)) {
    return 'reasoning';
  }

  // Menção de arquivo ou padrão de código → code
  if (CODE_PATTERNS.test(msg)) {
    return 'code';
  }

  // Mensagens longas sem padrão claro → reasoning
  if (msg.length > 200) {
    return 'reasoning';
  }

  // Default → code (é um coding assistant afinal)
  return 'code';
}

export function selectModel(taskType: TaskType, availableProviders: string[]): string {
  const prefs = ROUTING_TABLE[taskType];
  for (const p of prefs) {
    if (availableProviders.includes(p)) return p;
  }
  return availableProviders[0] || 'deepseek';
}

/**
 * Seleciona o melhor modelo de um provider para o tipo de tarefa.
 * Ex: deepseek → deepseek-chat (code) ou deepseek-reasoner (reasoning)
 *     gemini  → gemini-2.5-flash (quick) ou gemini-2.5-pro (reasoning)
 */
export function selectBestModel(providerId: string, taskType: TaskType, currentModel: string): string {
  const provider = getProvider(providerId);
  if (!provider || provider.models.length <= 1) return currentModel;

  const needed = TASK_CAPABILITY[taskType];

  // Procura modelo com a capability ideal
  const ideal = provider.models.find(m => m.capabilities.includes(needed));
  if (ideal) return ideal.id;

  // Fallback: modelo atual
  return currentModel;
}

// Detecta override explícito do user: @deepseek, @gemini, etc.
export function detectProviderOverride(message: string): string | null {
  const match = message.match(/^@(\w+)\s/);
  if (!match) return null;
  const id = match[1].toLowerCase();
  // Valida que é um provider real
  const valid = ['deepseek', 'openai', 'gemini', 'groq', 'qwen', 'minimax', 'huggingface', 'ollama', 'custom'];
  return valid.includes(id) ? id : null;
}

// Remove o @provider do início da mensagem
export function stripProviderOverride(message: string): string {
  return message.replace(/^@\w+\s+/, '');
}
