import chalk from 'chalk';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { saveConfig, removeConfigKey, loadConfig } from '../core/deepseek.js';
import { LLMService } from '../core/llm-service.js';
import { LLMPool } from '../core/pool.js';
import { detectProviderOverride, stripProviderOverride } from '../core/router.js';
import { PROVIDERS, NO_TOOLS_MODELS } from '../core/providers.js';
import { logger, smartOutput, truncateToolOutput, renderFooter, initFixedFooter, destroyFixedFooter, toolProgress } from '../utils/ui.js';
import { tools, toolHandlers, getToolSubset } from '../tools/index.js';
import { loadSkills } from '../skills/index.js';
import { safeJSONParse } from '../utils/json.js';
import { detectProjectContext, loadStructuredMemory } from '../core/context.js';
import { execSync } from 'node:child_process';
import { TelegramBridge } from '../core/telegram.js';

// --- Readline com histórico persistente ---
let rl: readline.Interface | null = null;
let ctrlDCount = 0;
let ctrlDTimer: ReturnType<typeof setTimeout> | null = null;

const HISTORY_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.voidcode', 'history'
);
const MAX_HISTORY = 200;

// Carrega histórico de sessões anteriores
function loadHistory(): string[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return fs.readFileSync(HISTORY_FILE, 'utf-8').split('\n').filter(Boolean).slice(-MAX_HISTORY);
    }
  } catch { /* ok */ }
  return [];
}

function saveHistory(lines: string[]) {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, lines.slice(-MAX_HISTORY).join('\n'), { mode: 0o600 });
  } catch { /* ok */ }
}

function getRL(): readline.Interface {
  if (!rl) {
    readline.emitKeypressEvents(process.stdin);
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      history: loadHistory(),
      historySize: MAX_HISTORY,
      removeHistoryDuplicates: true,
      tabSize: 2
    } as any); // history option exists in Node 18+ but not in types
    rl.on('SIGINT', () => {
      // Não interfere quando processResponse tem seu próprio SIGINT handler
    });
    rl.on('close', () => {
      ctrlDCount++;
      if (ctrlDTimer) clearTimeout(ctrlDTimer);
      if (ctrlDCount >= 2) { destroyFixedFooter(); console.log(chalk.hex('#008F11')('\nGoodbye.')); process.exit(0); }
      console.log(chalk.hex('#008F11')('\n  (Ctrl+D) Pressione novamente para sair.'));
      rl = null;
      ctrlDTimer = setTimeout(() => { ctrlDCount = 0; }, 2000);
      getRL();
    });
    // Salva histórico quando adiciona linha
    rl.on('line', () => {
      try {
        const history = (rl as any).history || [];
        saveHistory([...history].reverse());
      } catch { /* ok */ }
    });
  }
  return rl;
}

function ask(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    getRL().question(promptText, (answer) => { resolve(answer?.trim() || ''); });
  });
}

// --- Tool Result Cache (session-wide para reads, 30s para git) ---
class ToolCache {
  private cache = new Map<string, { result: string; ts: number }>();

  key(name: string, args: any): string {
    const READ_OPS = ['read_file', 'read_file_lines', 'list_directory', 'file_info', 'glob_files', 'grep_search', 'git_status', 'git_log'];
    if (!READ_OPS.includes(name)) return '';
    return `${name}:${JSON.stringify(args)}`;
  }

  get(k: string): string | null {
    if (!k) return null;
    const entry = this.cache.get(k);
    if (!entry) return null;
    // Git ops: TTL 30s. Reads: session-wide (invalidados em writes)
    const isGit = k.startsWith('git_');
    if (isGit && Date.now() - entry.ts > 30000) { this.cache.delete(k); return null; }
    return entry.result;
  }

  set(k: string, result: string) { if (k) this.cache.set(k, { result, ts: Date.now() }); }
  invalidate() { this.cache.clear(); }
}

interface Task { id: number; text: string; status: 'pending' | 'done'; }

// --- Sessões ---
const SESSION_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.voidcode');
const SESSIONS_FILE = path.join(SESSION_DIR, 'sessions.json');

interface SessionEntry { summary: string; cwd: string; timestamp: string; messages?: any[]; }

const LAST_SESSION_FILE = path.join(SESSION_DIR, 'last-session.json');

function saveSession(summary: string, cwd: string, messages?: any[]) {
  try {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    const sessions = loadAllSessions();
    sessions.unshift({ summary, cwd, timestamp: new Date().toISOString() });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions.slice(0, 3), null, 2));

    // Salva contexto leve da última sessão para --continue
    // Só últimas 3 interações user/assistant (sem tool calls, sem system)
    if (messages && messages.length > 0) {
      const context: any[] = [];
      const relevant = messages.filter(m => m.role === 'user' || (m.role === 'assistant' && m.content && !m.tool_calls));
      for (const m of relevant.slice(-6)) { // ~3 pares user/assistant
        context.push({ role: m.role, content: (m.content || '').substring(0, 500) });
      }
      fs.writeFileSync(LAST_SESSION_FILE, JSON.stringify({ summary, cwd, timestamp: new Date().toISOString(), messages: context }, null, 2), { mode: 0o600 });
    }
  } catch { /* ok */ }
}

function loadLastSession(): SessionEntry | null {
  try {
    if (!fs.existsSync(LAST_SESSION_FILE)) return null;
    return JSON.parse(fs.readFileSync(LAST_SESSION_FILE, 'utf-8'));
  } catch { return null; }
}

function loadAllSessions(): SessionEntry[] {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch { return []; }
}

function formatSessionForDisplay(s: SessionEntry, index: number): string {
  const ago = getTimeAgo(new Date(s.timestamp));
  const cwdShort = s.cwd.replace(process.env.HOME || '', '~');
  return `  ${chalk.hex('#ADFF2F')(`${index + 1})`)} ${chalk.hex('#008F11')(ago)} ${chalk.hex('#005500')(`(${cwdShort})`)}\n     ${chalk.hex('#00FF41')(s.summary.substring(0, 120))}`;
}

function getTimeAgo(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.round(hours / 24)}d atrás`;
}

// --- Pre-prompt: snapshot do cwd antes de cada tarefa ---
function getCwdSnapshot(): string {
  const parts: string[] = [];
  try {
    const files = fs.readdirSync('.', { withFileTypes: true });
    const dirs = files.filter(f => f.isDirectory() && !f.name.startsWith('.')).map(f => f.name + '/');
    const regular = files.filter(f => f.isFile()).map(f => f.name);
    parts.push(`Arquivos: ${[...dirs, ...regular].slice(0, 30).join(', ')}${files.length > 30 ? '...' : ''}`);
  } catch { /* ok */ }
  try {
    const status = execSync('git status --short 2>/dev/null', { encoding: 'utf-8', timeout: 3000 }).trim();
    const branch = execSync('git branch --show-current 2>/dev/null', { encoding: 'utf-8', timeout: 3000 }).trim();
    if (branch) parts.push(`Git: ${branch}${status ? `, ${status.split('\n').length} mudanças` : ', limpo'}`);
  } catch { /* not git */ }
  return parts.join(' | ');
}

// --- Detecta complexidade da tarefa ---
function isComplexTask(input: string): boolean {
  const complexPatterns = [
    /cri(e|ar).*(projeto|app|aplicação|sistema|dashboard|api)/i,
    /implement(e|ar)/i,
    /refator(e|ar)/i,
    /migr(e|ar)/i,
    /\bdo zero\b|from scratch/i,
    /deploy.*prod/i,
  ];
  return complexPatterns.some(p => p.test(input));
}

export class ChatLoop {
  private pool: LLMPool;
  private service: LLMService; // service ativo (pode mudar por roteamento)
  private messages: any[] = [];
  private insaneMode: boolean;
  private planMode = false;
  private abortTask = false;
  private allTools: any[] = [];
  private allHandlers: Record<string, (args: any) => any> = {};
  private readonly MAX_USER_MESSAGES = 50;
  private userMessageCount = 0;
  private activeAgents: Map<string, { promise: Promise<string>; objective: string; startedAt: Date; status: string; iteration: number }> = new Map();
  private agentCounter = 0;
  private tasks: Task[] = [];
  private taskCounter = 0;
  private toolCache = new ToolCache();
  private consecutiveErrors = 0;
  private _callHistory: string[] = [];
  private telegramBot: TelegramBridge | null = null;
  private processing = false;
  private taskQueue: string[] = [];
  private continueMode = false;

  constructor(insaneMode = false, continueMode = false) {
    this.continueMode = continueMode;
    this.pool = new LLMPool();
    this.service = this.pool.getDefault();
    this.insaneMode = insaneMode;

    const modelName = process.env.LLM_MODEL || 'deepseek-chat';
    const noTools = NO_TOOLS_MODELS.has(modelName);

    const ctx = detectProjectContext();
    let systemPrompt = `VOIDCODE. Engenheiro sênior. Conciso, direto, eficiente.
${this.insaneMode ? 'MODO INSANO: execute direto, sem perguntar, sem explicar.' : 'Peça permissão antes de executar.'}
cwd: ${process.cwd()}
${ctx ? ctx + '\n' : ''}
REGRAS CRÍTICAS:
- AÇÃO > EXPLICAÇÃO. Não descreva o que vai fazer — FAÇA. Use tools imediatamente.
- Use MÚLTIPLAS tools em PARALELO numa única chamada.
- Para criar/modificar arquivos: use write_file direto. Não liste o conteúdo no texto.
- Para editar parte de arquivo: read_file_lines → patch_file.
- Para servidores: run_shell_command com background:true.
- NUNCA repita uma tool call com os mesmos argumentos.
- Se o arquivo é grande e precisa reescrever inteiro, use write_file de uma vez.
- Respostas texto devem ter no MÁXIMO 3 linhas. O output das tools fala por si.`;

    if (noTools) {
      systemPrompt += `\nSem tools. Responda com JSON: {"name":"tool_name","arguments":{...}}`;
    }

    this.messages.push({ role: 'system', content: systemPrompt });
  }

  async start() {
    const { tools: skillTools, handlers: skillHandlers } = await loadSkills();
    this.allTools = [...tools, ...skillTools];
    this.allHandlers = { ...toolHandlers, ...skillHandlers };

    // Memória NÃO é injetada no prompt (gasta muitos tokens).
    // O LLM acessa via tool memory_read quando precisar.

    // --continue: restaura conversa completa da última sessão
    if (this.continueMode) {
      const last = loadLastSession();
      if (last?.messages?.length) {
        const oldMsgs = last.messages.filter(m => m.role !== 'system');
        this.messages.push({ role: 'system', content: `[SESSÃO RETOMADA]: ${last.summary}` });
        this.messages.push(...oldMsgs);
        const cwdShort = last.cwd.replace(process.env.HOME || '', '~');
        logger.success(`Sessão restaurada (${oldMsgs.length} msgs, ${cwdShort})\n`);

        // Mostra replay da conversa anterior pra o user lembrar
        const sep = chalk.hex('#003B00')('─'.repeat(process.stdout.columns || 80));
        console.log(sep);
        console.log(chalk.hex('#008F11').bold('  SESSÃO ANTERIOR:\n'));
        for (const m of oldMsgs) {
          if (m.role === 'user') {
            console.log(chalk.hex('#00FF41').bold('  Você > ') + chalk.hex('#00FF41')(m.content));
          } else if (m.role === 'assistant' && m.content) {
            const preview = m.content.length > 300 ? m.content.substring(0, 300) + '...' : m.content;
            console.log(chalk.hex('#008F11').bold('  VOIDCODE > ') + chalk.hex('#008F11')(preview));
          }
          console.log();
        }
        console.log(sep);
      } else {
        logger.warn('Sem sessão anterior para continuar.');
      }
    } else {
      const sessions = loadAllSessions();
      if (sessions.length > 0) {
        console.log(chalk.hex('#00FF41')('\n  Sessões anteriores:'));
        sessions.forEach((s, i) => console.log(formatSessionForDisplay(s, i)));
        console.log(`  ${chalk.hex('#008F11')('0)')} ${chalk.hex('#005500')('Nova sessão')}\n`);
        const choice = await ask(chalk.hex('#008F11')('Retomar? (0/1/2/3): '));
        const idx = parseInt(choice) - 1;
        if (idx >= 0 && idx < sessions.length) {
          const s = sessions[idx]!;
          this.messages.push({
            role: 'system',
            content: `[SESSÃO RETOMADA]: Trabalhando em: ${s.summary}`
          });
          logger.success(`Sessão ${idx + 1} restaurada.`);
        }
      }
    }

    // Ativa footer fixo AGORA - todo output inicial já foi feito
    initFixedFooter();
    this.showFooter();

    while (true) {
      if (this.userMessageCount >= this.MAX_USER_MESSAGES) {
        this.quickCompact();
        this.userMessageCount = 0;
      }

      const mode = this.planMode ? chalk.hex('#ADFF2F')('[PLAN] ') : '';
      const busy = this.processing ? chalk.hex('#008F11')('[busy] ') : '';
      const cols = process.stdout.columns || 80;
      console.log(chalk.hex('#003B00')('─'.repeat(cols)));
      const userInput = await ask(busy + mode + chalk.hex('#00FF41')('> '));
      console.log(chalk.hex('#003B00')('─'.repeat(cols)));

      if (!userInput) continue;
      if (userInput.toLowerCase() === '/exit' || userInput.toLowerCase() === 'exit') {
        await this.saveAndExit();
      }
      if (userInput.startsWith('/')) { await this.handleCommand(userInput); continue; }

      // Detecta override de provider: @gemini, @deepseek, etc.
      const override = detectProviderOverride(userInput);
      let actualInput = userInput;
      if (override) {
        const svc = this.pool.get(override);
        if (svc) {
          this.service = svc;
          actualInput = stripProviderOverride(userInput);
          logger.dim(`  → ${override}/${svc.modelName}`);
        } else {
          logger.error(`Provider ${override} não conectado. Use /auth`);
          continue;
        }
      } else if (this.pool.activeCount > 1) {
        // Roteamento automático
        const { service, taskType, routed } = this.pool.getForMessage(actualInput);
        this.service = service;
        if (routed) logger.dim(`  → ${service.provider}/${service.modelName} (${taskType})`);
      }

      // Se já está processando, spawna agente paralelo (sem limite)
      if (this.processing) {
        const preview = actualInput.length > 60 ? actualInput.substring(0, 60) + '...' : actualInput;
        logger.info(`[+agent] "${preview}"`);
        this.spawnBackgroundAgent(actualInput);
        continue;
      }

      // Primeira tarefa: roda em background, prompt fica livre
      this.userMessageCount++;
      this.processing = true;
      this.executeTaskBackground(actualInput);
    }
  }

  private executeTaskBackground(userInput: string) {
    const run = async () => {
      try {
        if (isComplexTask(userInput) && !this.planMode) {
          await this.handleComplexTask(userInput);
        } else {
          this.messages.push({ role: 'user', content: userInput });
          this.toolCache.invalidate();
          this._callHistory = [];
          await this.processResponse();
        }
      } catch (e: any) {
        logger.error(`Erro: ${e.message}`);
      } finally {
        this.processing = false;
        // Auto-save contexto pra --continue funcionar mesmo sem /exit
        this.autoSaveSession();
        logger.dim('  pronto');
        this.showFooter();
        // Processa fila
        if (this.taskQueue.length > 0) {
          const next = this.taskQueue.shift()!;
          logger.info(`Fila: processando "${next.substring(0, 60)}..."`);
          this.processing = true;
          this.executeTaskBackground(next);
        }
      }
    };
    run();
  }

  // --- TAREFAS COMPLEXAS: plan-then-execute ---
  private async handleComplexTask(userInput: string) {
    logger.info('Tarefa complexa detectada. Planejando antes de executar...');

    // Snapshot do ambiente
    const snapshot = getCwdSnapshot();

    // Fase 1: PLANEJAR (sem tools)
    logger.dim('  planning...');

    const planMessages = [
      ...this.messages,
      { role: 'system', content: `[CWD]: ${snapshot}` },
      { role: 'user', content: `TAREFA: ${userInput}\n\nPLANEJE antes de executar:\n1. Que arquivos precisa LER para entender o contexto?\n2. Que arquivos precisa criar/modificar?\n3. Que comandos precisa rodar (install, build, start)?\n4. Qual a ordem ideal?\n\nSó o plano, NÃO execute ainda.` }
    ];

    try {
      const planResponse = await this.service.chatStream(planMessages);

      if (planResponse.content) {
        // Stream já mostrou o conteúdo — só perguntar
        // Pergunta se quer executar
        const confirm = await ask(chalk.hex('#ADFF2F')('  Executar este plano? (Y/n/edit) '));

        if (confirm.toLowerCase() === 'n') {
          logger.info('Plano cancelado.');
          return;
        }

        let taskDescription = userInput;
        if (confirm.toLowerCase() === 'edit') {
          const edit = await ask(chalk.hex('#008F11')('Ajuste o pedido: '));
          if (edit) taskDescription = edit;
        }

        // Fase 2: EXECUTAR com o plano como contexto
        this.messages.push({ role: 'system', content: `[CWD]: ${snapshot}` });
        this.messages.push({ role: 'user', content: taskDescription });
        this.messages.push({
          role: 'system',
          content: `[PLANO APROVADO]: Siga este plano e execute TUDO de uma vez. Use múltiplas tool calls em paralelo.\n${planResponse.content}`
        });

        this.toolCache.invalidate();
        await this.processResponse();
      }
    } catch (e: any) {
      logger.error(`Erro no planejamento: ${e.message}`);
      // Fallback: executa direto
      this.messages.push({ role: 'user', content: userInput });
      await this.processResponse();
    }
  }

  private async handleCommand(input: string) {
    const [command, ...args] = input.slice(1).split(' ');

    switch (command) {
      case 'createskill': case 'create-skill': {
        const { createSkill } = await import('../skills/skill-creator.js');
        if (!args[0]) {
          const name = await ask(chalk.hex('#008F11')('Nome: '));
          const desc = await ask(chalk.hex('#008F11')('Descrição: '));
          await createSkill(name || 'NovaSkill', desc || 'Skill personalizada');
        } else await createSkill(args[0], args.slice(1).join(' ') || 'Skill personalizada');
        break;
      }
      case 'usage': this.showUsage(); break;
      case 'auth': case 'model': { await this.authMenu(); break; }
      case 'menu': { await this.showMenu(); break; }
      case 'telegram': case 'tg': { await this.telegramMenu(); break; }
      case 'commit': {
        const msg = args.join(' ');
        if (!msg) { logger.error('/commit <msg>'); break; }
        smartOutput(this.allHandlers['git_commit']?.({ message: msg, files: '.' }) || '', 'GIT');
        break;
      }
      case 'diff': smartOutput(this.allHandlers['git_diff']?.({ staged: false, file: args[0] || '' }) || 'Limpo.', 'DIFF'); break;
      case 'log': smartOutput(this.allHandlers['git_log']?.({ count: parseInt(args[0] || '10') }) || '', 'LOG'); break;
      case 'status': smartOutput(this.allHandlers['git_status']?.({}) || '', 'STATUS'); break;
      case 'plan': {
        this.planMode = !this.planMode;
        if (this.planMode) {
          logger.info('PLAN MODE ON - planeja sem executar.');
          this.messages.push({ role: 'system', content: '[PLAN MODE] NÃO use tools. Analise, planeje, liste passos numerados. Identifique riscos.' });
        } else {
          logger.info('PLAN MODE OFF - execução normal.');
          this.messages.push({ role: 'system', content: '[PLAN OFF] Execute normalmente.' });
        }
        break;
      }
      case 'task': case 'tasks': {
        const sub = args[0];
        if (!sub || sub === 'list') this.showTasks();
        else if (sub === 'done') {
          const t = this.tasks.find(t => t.id === parseInt(args[1] || ''));
          if (t) { t.status = 'done'; logger.success(`#${t.id} done.`); }
        }
        else if (sub === 'rm') { this.tasks = this.tasks.filter(t => t.id !== parseInt(args[1] || '')); }
        else {
          const text = sub === 'add' ? args.slice(1).join(' ') : args.join(' ');
          if (text) { this.tasks.push({ id: ++this.taskCounter, text, status: 'pending' }); logger.success(`#${this.taskCounter}: ${text}`); }
        }
        break;
      }
      case 'agent': {
        const obj = args.join(' ');
        if (!obj) { logger.error('/agent <objetivo>'); break; }
        this.spawnBackgroundAgent(obj);
        break;
      }
      case 'agents': this.showAgents(); break;
      case 'queue': {
        if (!this.taskQueue.length && !this.processing && !this.activeAgents.size) {
          logger.info('Sem tarefas em andamento.');
        } else {
          if (this.processing) logger.info('Tarefa principal: em execução');
          if (this.taskQueue.length) {
            console.log(chalk.hex('#00FF41')(`  Fila: ${this.taskQueue.length} pendente(s)`));
            this.taskQueue.forEach((t, i) => console.log(chalk.hex('#005500')(`    ${i + 1}) ${t.substring(0, 80)}`)));
          }
          this.showAgents();
        }
        break;
      }
      case 'btw': {
        const q = args.join(' ');
        if (!q) { logger.error('/btw <pergunta>'); break; }
        this.messages.push({ role: 'user', content: `[BTW breve] ${q}` });
        await this.processResponse();
        this.showFooter();
        break;
      }
      case 'memory': smartOutput(this.allHandlers['memory_read']?.({}) || 'Vazia', 'MEM'); break;
      case 'skills': {
        const list = this.allTools.map(t =>
          `  ${chalk.hex('#ADFF2F')(t.function.name.padEnd(22))} ${chalk.hex('#008F11')(t.function.description)}`
        ).join('\n');
        console.log('\n' + chalk.hex('#00FF41').bold(' TOOLS & SKILLS') + '\n' + list + '\n');
        break;
      }
      case 'compact': await this.compactHistory(); break;
      case 'exit': { await this.saveAndExit(); break; }
      case 'help': {
        console.log(chalk.hex('#00FF41')(`
 Comandos:
  ${chalk.hex('#ADFF2F')('/menu')}  wizard      ${chalk.hex('#ADFF2F')('/auth')}  provider   ${chalk.hex('#ADFF2F')('/telegram')}  bot TG
  ${chalk.hex('#ADFF2F')('/usage')}  tokens    ${chalk.hex('#ADFF2F')('/plan')}  toggle     ${chalk.hex('#ADFF2F')('/compact')}  contexto
  ${chalk.hex('#ADFF2F')('/task <t>')}  add    ${chalk.hex('#ADFF2F')('/task done <id>')}     ${chalk.hex('#ADFF2F')('/task rm <id>')}
  ${chalk.hex('#ADFF2F')('/commit <m>')}       ${chalk.hex('#ADFF2F')('/diff')}            ${chalk.hex('#ADFF2F')('/log')}  ${chalk.hex('#ADFF2F')('/status')}
  ${chalk.hex('#ADFF2F')('/agent <p>')}  bg    ${chalk.hex('#ADFF2F')('/agents')}           ${chalk.hex('#ADFF2F')('/queue')}  fila
  ${chalk.hex('#ADFF2F')('/btw <q>')}  quick
  ${chalk.hex('#ADFF2F')('/createskill')}      ${chalk.hex('#ADFF2F')('/memory')}           ${chalk.hex('#ADFF2F')('/skills')}
  ${chalk.hex('#ADFF2F')('/exit')}  sair       ${chalk.hex('#ADFF2F')('Ctrl+C')}  cancela   ${chalk.hex('#ADFF2F')('Ctrl+D 2x')}  quit
`)); break;
      }
      default: logger.error(`/${command}? /help`);
    }
  }

  private showTasks() {
    if (!this.tasks.length) { logger.info('Sem tasks. /task <texto>'); return; }
    console.log('\n' + chalk.hex('#00FF41').bold(' TASKS'));
    for (const t of this.tasks) {
      const icon = t.status === 'done' ? chalk.hex('#00FF41')('[x]') : chalk.hex('#ADFF2F')('[ ]');
      console.log(`  ${icon} ${chalk.hex('#008F11')(`#${t.id}`)} ${t.status === 'done' ? chalk.strikethrough(t.text) : t.text}`);
    }
    console.log();
  }

  private async authMenu() {
    const sep = chalk.hex('#003B00')('─'.repeat(process.stdout.columns || 80));

    console.log(`\n${sep}\n${chalk.hex('#00FF41').bold('  PROVIDERS CONECTADOS')}`);
    console.log(chalk.hex('#005500')(`  Routing: ${this.pool.activeCount > 1 ? 'AUTO' : 'SINGLE'} (${this.pool.activeCount} provider${this.pool.activeCount !== 1 ? 's' : ''} ativo${this.pool.activeCount !== 1 ? 's' : ''})`));
    console.log(sep);

    PROVIDERS.forEach((p, i) => {
      if (p.id === 'custom' && !process.env[p.envKey]) return;
      const connected = this.pool.get(p.id);
      const status = connected ? chalk.hex('#00FF41')('[✓ ativo]') : chalk.hex('#005500')('[✗ sem key]');
      const isDefault = p.id === this.pool.defaultProvider ? chalk.hex('#ADFF2F')(' ◀ default') : '';
      const modelInfo = connected ? chalk.hex('#005500')(` (${connected.modelName})`) : '';
      const caps = p.models[0]?.capabilities?.join(', ') || '';
      const capsStr = caps ? chalk.hex('#005500')(` [${caps}]`) : '';
      console.log(`  ${chalk.hex('#008F11')(`${i + 1})`)} ${chalk.hex('#ADFF2F')(p.name)} ${status}${isDefault}${modelInfo}${capsStr}`);
    });

    console.log(`\n  ${chalk.hex('#ADFF2F')('A)')} Adicionar/atualizar provider`);
    console.log(`  ${chalk.hex('#ADFF2F')('D)')} Mudar provider padrão`);
    console.log(`  ${chalk.hex('#ADFF2F')('M)')} Mudar modelo do provider ativo`);
    console.log(`  ${chalk.hex('#ADFF2F')('R)')} Remover provider`);
    console.log(`  ${chalk.hex('#008F11')('0)')} Voltar\n`);

    const choice = (await ask(chalk.hex('#008F11')('Opção: '))).toLowerCase();

    switch (choice) {
      case 'a': case 'add': {
        // Listar providers para adicionar
        console.log(chalk.hex('#00FF41')('\n  Providers disponíveis:'));
        PROVIDERS.forEach((p, i) => {
          if (p.id === 'custom') return;
          const hasKey = this.pool.get(p.id) ? chalk.hex('#00FF41')(' ✓') : '';
          console.log(`  ${i + 1}) ${chalk.hex('#ADFF2F')(p.name)}${hasKey}`);
        });
        const idx = parseInt(await ask(chalk.hex('#008F11')('\nProvider: '))) - 1;
        if (idx < 0 || idx >= PROVIDERS.length) return;
        const provider = PROVIDERS[idx]!;

        let baseURL = provider.baseURL;
        let apiKey = '';

        if (provider.id === 'ollama') {
          apiKey = 'ollama';
          const host = await ask(chalk.hex('#008F11')(`Ollama host (${baseURL}): `));
          if (host) baseURL = host;
        } else {
          const existing = process.env[provider.envKey];
          if (existing) {
            const masked = existing.substring(0, 6) + '...' + existing.substring(existing.length - 4);
            console.log(chalk.hex('#008F11')(`  Key atual: ${masked}`));
            const change = await ask(chalk.hex('#008F11')('Trocar key? (y/N): '));
            apiKey = change.toLowerCase() === 'y' ? await ask(chalk.hex('#008F11')('Nova key: ')) : existing;
          } else {
            apiKey = await ask(chalk.hex('#008F11')(`${provider.name} API Key: `));
          }
          if (!apiKey || apiKey.length < 5) { logger.error('Key inválida.'); return; }
        }

        // Escolher modelo
        let model = provider.models[0]?.id || '';
        if (provider.models.length > 1) {
          console.log(chalk.hex('#00FF41')('\n  Modelos:'));
          provider.models.forEach((m, i) => {
            console.log(`  ${i + 1}) ${chalk.hex('#ADFF2F')(m.name)} ${chalk.hex('#005500')(`- ${m.description} [${m.contextWindow/1000}k ctx, ${m.costTier}]`)}`);
          });
          const mi = parseInt(await ask(chalk.hex('#008F11')('Modelo: '))) - 1;
          if (mi >= 0 && mi < provider.models.length) model = provider.models[mi]!.id;
        }
        if (!model) return;

        // Salva key e adiciona ao pool
        saveConfig({ apiKey, envKey: provider.envKey });
        this.pool.addProvider(provider.id, apiKey, baseURL, model);
        logger.success(`✓ ${provider.name}/${model} conectado`);

        // Se é o primeiro provider, seta como default
        if (this.pool.activeCount === 1) {
          this.pool.setDefault(provider.id, model);
          saveConfig({ provider: provider.id, model, baseURL });
          this.service = this.pool.getDefault();
        }
        break;
      }

      case 'd': case 'default': {
        const available = this.pool.getAvailable();
        if (available.length === 0) { logger.error('Nenhum provider conectado.'); return; }
        console.log(chalk.hex('#00FF41')('\n  Providers ativos:'));
        available.forEach((a, i) => {
          const def = a.providerId === this.pool.defaultProvider ? chalk.hex('#ADFF2F')(' ◀ atual') : '';
          console.log(`  ${i + 1}) ${chalk.hex('#ADFF2F')(a.provider.name)} / ${a.model}${def}`);
        });
        const di = parseInt(await ask(chalk.hex('#008F11')('Novo default: '))) - 1;
        if (di < 0 || di >= available.length) return;
        const pick = available[di]!;
        this.pool.setDefault(pick.providerId, pick.model);
        this.service = this.pool.getDefault();
        saveConfig({ provider: pick.providerId, model: pick.model, baseURL: pick.provider.baseURL });
        logger.success(`★ Default: ${pick.provider.name}/${pick.model}`);
        break;
      }

      case 'm': case 'model': {
        const available = this.pool.getAvailable();
        if (available.length === 0) { logger.error('Nenhum provider conectado.'); return; }
        console.log(chalk.hex('#00FF41')('\n  Providers ativos:'));
        available.forEach((a, i) => {
          console.log(`  ${i + 1}) ${chalk.hex('#ADFF2F')(a.provider.name)} / ${a.model}`);
        });
        const pi = parseInt(await ask(chalk.hex('#008F11')('Provider: '))) - 1;
        if (pi < 0 || pi >= available.length) return;
        const prov = available[pi]!;
        const provDef = PROVIDERS.find(p => p.id === prov.providerId);
        if (!provDef?.models.length) { logger.error('Sem modelos.'); return; }
        console.log(chalk.hex('#00FF41')('\n  Modelos:'));
        provDef.models.forEach((m, i) => {
          const cur = m.id === prov.model ? chalk.hex('#ADFF2F')(' ◀ atual') : '';
          console.log(`  ${i + 1}) ${chalk.hex('#ADFF2F')(m.name)} ${chalk.hex('#005500')(`[${m.contextWindow/1000}k, ${m.costTier}]`)}${cur}`);
        });
        const mi = parseInt(await ask(chalk.hex('#008F11')('Modelo: '))) - 1;
        if (mi < 0 || mi >= provDef.models.length) return;
        const newModel = provDef.models[mi]!.id;
        const svc = this.pool.get(prov.providerId);
        if (svc) svc.setModel(newModel);
        if (prov.providerId === this.pool.defaultProvider) {
          this.pool.setDefaultModel(newModel);
          saveConfig({ model: newModel });
        }
        logger.success(`Modelo: ${prov.provider.name}/${newModel}`);
        break;
      }

      case 'r': case 'remove': {
        const available = this.pool.getAvailable();
        if (available.length === 0) { logger.error('Nenhum provider conectado.'); return; }
        console.log(chalk.hex('#00FF41')('\n  Remover provider:'));
        available.forEach((a, i) => {
          console.log(`  ${i + 1}) ${chalk.hex('#ADFF2F')(a.provider.name)} / ${a.model}`);
        });
        const ri = parseInt(await ask(chalk.hex('#008F11')('Remover: '))) - 1;
        if (ri < 0 || ri >= available.length) return;
        const rem = available[ri]!;
        const confirm = await ask(chalk.hex('#ADFF2F')(`  Remover ${rem.provider.name}? Key será apagada. (y/N): `));
        if (confirm.toLowerCase() !== 'y') return;
        this.pool.removeProvider(rem.providerId);
        removeConfigKey(rem.provider.envKey);
        this.service = this.pool.getDefault();
        logger.success(`${rem.provider.name} removido.`);
        break;
      }

      default: {
        // Se digitou número, tenta como atalho pra adicionar
        const idx = parseInt(choice) - 1;
        if (idx >= 0 && idx < PROVIDERS.length) {
          // Redireciona pra add com este provider pré-selecionado
          const provider = PROVIDERS[idx]!;
          if (this.pool.get(provider.id)) {
            // Já conectado, troca pra ele como default
            const svc = this.pool.get(provider.id)!;
            this.pool.setDefault(provider.id, svc.modelName);
            this.service = svc;
            saveConfig({ provider: provider.id, model: svc.modelName, baseURL: provider.baseURL });
            logger.success(`★ Default: ${provider.name}/${svc.modelName}`);
          } else {
            logger.info(`Use a opção A para adicionar ${provider.name}.`);
          }
        }
      }
    }

    this.showFooter();
  }

  // --- /menu - wizard central ---
  private async showMenu() {
    const sep = chalk.hex('#003B00')('─'.repeat(process.stdout.columns || 80));
    console.log(`\n${sep}`);
    console.log(chalk.hex('#00FF41').bold('  VOIDCODE MENU'));
    console.log(sep);
    console.log(`  ${chalk.hex('#ADFF2F')('1)')} Provider & Auth (API keys, modelos)`);
    console.log(`  ${chalk.hex('#ADFF2F')('2)')} Telegram Bot (controle remoto)`);
    console.log(`  ${chalk.hex('#ADFF2F')('3)')} Token Usage`);
    console.log(`  ${chalk.hex('#ADFF2F')('4)')} Skills (listar / criar)`);
    console.log(`  ${chalk.hex('#ADFF2F')('5)')} Memória (ver / limpar)`);
    console.log(`  ${chalk.hex('#ADFF2F')('6)')} Sessões anteriores`);
    console.log(`  ${chalk.hex('#ADFF2F')('7)')} Config (.env)`);
    console.log(`  ${chalk.hex('#008F11')('0)')} Voltar\n`);

    const choice = await ask(chalk.hex('#008F11')('Opção: '));

    switch (choice) {
      case '1': await this.authMenu(); break;
      case '2': await this.telegramMenu(); break;
      case '3': this.showUsage(); break;
      case '4': {
        const sub = await ask(chalk.hex('#008F11')('(L)istar ou (C)riar skill? '));
        if (sub.toLowerCase() === 'c') {
          const { createSkill } = await import('../skills/skill-creator.js');
          const name = await ask(chalk.hex('#008F11')('Nome: '));
          const desc = await ask(chalk.hex('#008F11')('Descrição: '));
          await createSkill(name || 'NovaSkill', desc || 'Skill');
        } else {
          const list = this.allTools.map(t =>
            `  ${chalk.hex('#ADFF2F')(t.function.name.padEnd(22))} ${chalk.hex('#008F11')(t.function.description)}`
          ).join('\n');
          console.log('\n' + list + '\n');
        }
        break;
      }
      case '5': {
        const mem = this.allHandlers['memory_read']?.({});
        smartOutput(mem || 'Vazia', 'MEM');
        const clear = await ask(chalk.hex('#008F11')('Limpar memória? (y/N) '));
        if (clear.toLowerCase() === 'y') {
          const memDir = path.join(SESSION_DIR, 'memory');
          if (fs.existsSync(memDir)) {
            for (const f of fs.readdirSync(memDir)) fs.unlinkSync(path.join(memDir, f));
            logger.success('Memória limpa.');
          }
        }
        break;
      }
      case '6': {
        const sessions = loadAllSessions();
        if (!sessions.length) { logger.info('Sem sessões.'); break; }
        sessions.forEach((s, i) => console.log(formatSessionForDisplay(s, i)));
        const clear = await ask(chalk.hex('#008F11')('\nLimpar sessões? (y/N) '));
        if (clear.toLowerCase() === 'y') {
          fs.writeFileSync(SESSIONS_FILE, '[]');
          logger.success('Sessões limpas.');
        }
        break;
      }
      case '7': {
        const envPath = path.join(SESSION_DIR, '.env');
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf-8');
          // Mascara keys
          const masked = content.replace(/=(.{6})(.+)(.{4})/g, '=$1...$3');
          smartOutput(masked, 'CONFIG');
        } else {
          logger.info('Sem .env configurado.');
        }
        break;
      }
    }
  }

  // --- /telegram ---
  private async telegramMenu() {
    const sep = chalk.hex('#003B00')('─'.repeat(process.stdout.columns || 80));
    console.log(`\n${sep}`);
    console.log(chalk.hex('#00FF41').bold('  TELEGRAM BOT'));
    console.log(sep);

    if (this.telegramBot?.isRunning) {
      console.log(chalk.hex('#00FF41')('  Status: ONLINE'));
      const action = await ask(chalk.hex('#008F11')('  (D)esconectar ou (V)oltar? '));
      if (action.toLowerCase() === 'd') {
        this.telegramBot.stop();
        this.telegramBot = null;
      }
      return;
    }

    console.log(chalk.hex('#005500')('  Status: OFFLINE\n'));
    console.log(chalk.hex('#008F11')('  Para criar um bot:'));
    console.log(chalk.hex('#005500')('  1. Abra @BotFather no Telegram'));
    console.log(chalk.hex('#005500')('  2. Envie /newbot e siga as instruções'));
    console.log(chalk.hex('#005500')('  3. Copie o token aqui\n'));

    // Checa se já tem token salvo
    const existingToken = process.env.TELEGRAM_BOT_TOKEN;
    let token = existingToken || '';

    if (existingToken) {
      const masked = existingToken.substring(0, 8) + '...';
      console.log(chalk.hex('#008F11')(`  Token salvo: ${masked}`));
      const change = await ask(chalk.hex('#008F11')('  Usar este token? (Y/n) '));
      if (change.toLowerCase() === 'n') {
        token = await ask(chalk.hex('#008F11')('  Novo token: '));
      }
    } else {
      token = await ask(chalk.hex('#008F11')('  Bot Token: '));
    }

    if (!token || token.length < 20) {
      logger.error('Token inválido.');
      return;
    }

    // Salva token
    if (token !== existingToken) {
      saveConfig({ envKey: 'TELEGRAM_BOT_TOKEN', apiKey: token });
    }

    // Inicia o bot
    this.telegramBot = new TelegramBridge(token, async (text: string) => {
      // Processa como se fosse input do usuário
      this.messages.push({ role: 'user', content: `[TELEGRAM] ${text}` });
      this.toolCache.invalidate();

      const snapshot = getCwdSnapshot();
      if (snapshot) this.messages.push({ role: 'system', content: `[CWD]: ${snapshot}` });

      // Processa e captura resposta
      this.messages = this.sanitizeMessages(this.messages);
      const tgService = this.pool.getDefault();
      const response = await tgService.chat(this.messages, this.allTools as any);
      this.messages.push(response);

      // Se tem tool calls, executa
      if (response.tool_calls?.length) {
        const results = await Promise.all(response.tool_calls.map(async (tc: any) => {
          const handler = this.allHandlers[tc.function.name];
          const args = safeJSONParse(tc.function.arguments);
          const result = handler ? await handler(args) : 'N/A';
          return { role: 'tool' as const, tool_call_id: tc.id, content: truncateToolOutput(String(result)) };
        }));
        this.messages.push(...results);

        // Segunda chamada para resposta final
        this.messages = this.sanitizeMessages(this.messages);
        const finalResponse = await tgService.chat(this.messages, this.allTools as any);
        this.messages.push(finalResponse);
        return finalResponse.content || 'Executado (sem resposta texto).';
      }

      return response.content || 'Sem resposta.';
    });

    await this.telegramBot.start();
  }

  private showUsage() {
    const sep = chalk.hex('#003B00')('─'.repeat(process.stdout.columns || 80));
    console.log(`\n${sep}\n${chalk.hex('#00FF41').bold('  TOKEN USAGE')}\n${sep}`);

    // Per-provider breakdown
    const perProvider = this.pool.usagePerProvider();
    for (const p of perProvider) {
      if (p.requests === 0) continue;
      console.log(`  ${chalk.hex('#ADFF2F')(p.provider.padEnd(12))} ${chalk.hex('#008F11')(`in:${p.usage.promptTokens.toLocaleString().padEnd(8)} out:${p.usage.completionTokens.toLocaleString().padEnd(8)}`)} ${chalk.hex('#005500')(`(${p.requests} reqs) ${p.model}`)}`);
    }

    const agg = this.pool.aggregatedUsage;
    console.log(`  ${chalk.hex('#00FF41').bold('Total'.padEnd(12))} ${chalk.hex('#ADFF2F').bold(`in:${agg.promptTokens.toLocaleString().padEnd(8)} out:${agg.completionTokens.toLocaleString().padEnd(8)}`)} ${chalk.hex('#005500')(`(${this.pool.totalRequests} reqs)`)}`);
    console.log(`  Providers: ${this.pool.activeCount} | Msgs: ${this.messages.length} | Erros: ${this.consecutiveErrors || 'nenhum'}`);
    console.log(sep + '\n');
  }

  private showFooter() {
    renderFooter({
      model: `${this.service.provider}/${this.service.modelName}`,
      mode: this.planMode ? 'PLAN' : this.insaneMode ? 'INSANE' : 'SAFE',
      tokens: this.pool.aggregatedUsage,
      requests: this.pool.totalRequests,
      cwd: process.cwd(),
      messagesCount: this.messages.length,
      activeProviders: this.pool.activeCount
    });
  }

  // Auto-save silencioso a cada tarefa (pra --continue funcionar sem /exit)
  private autoSaveSession() {
    try {
      if (this.messages.length < 3) return;
      const userMsgs = this.messages.filter(m => m.role === 'user').map(m => m.content).slice(-3);
      const summary = userMsgs.join(' | ').substring(0, 500);
      const context: any[] = [];
      const relevant = this.messages.filter(m => m.role === 'user' || (m.role === 'assistant' && m.content && !m.tool_calls));
      for (const m of relevant.slice(-6)) {
        context.push({ role: m.role, content: (m.content || '').substring(0, 500) });
      }
      const SESSION_DIR_PATH = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.voidcode');
      const LAST_FILE = path.join(SESSION_DIR_PATH, 'last-session.json');
      if (!fs.existsSync(SESSION_DIR_PATH)) fs.mkdirSync(SESSION_DIR_PATH, { recursive: true });
      fs.writeFileSync(LAST_FILE, JSON.stringify({ summary, cwd: process.cwd(), timestamp: new Date().toISOString(), messages: context }, null, 2), { mode: 0o600 });
    } catch { /* silent */ }
  }

  private async saveAndExit() {
    try {
      if (this.messages.length > 3) {
        const userMsgs = this.messages.filter(m => m.role === 'user').map(m => m.content).slice(-5);
        saveSession(userMsgs.join(' | ').substring(0, 500), process.cwd(), this.messages);
        logger.dim('  Sessão salva. Use --continue para retomar.');
      }
    } catch { /* ok */ }
    destroyFixedFooter();
    logger.matrix('Goodbye, Mr. Anderson...');
    process.exit(0);
  }

  // --- Multi-Agent ---
  private spawnBackgroundAgent(objective: string) {
    const id = `agent-${++this.agentCounter}`;
    const agentData = { promise: null as any, objective, startedAt: new Date(), status: 'starting', iteration: 0 };

    const updateStatus = (s: string, iter?: number) => {
      agentData.status = s;
      if (iter !== undefined) agentData.iteration = iter;
      logger.dim(`  [${id}] ${s}`);
    };

    const promise = (async () => {
      try {
        const svc = this.pool.getForTask('sub_agent');
        const msgs: any[] = [
          { role: 'system', content: `Sub-agente VOIDCODE. Direto. Tools em paralelo. cwd: ${process.cwd()}` },
          { role: 'user', content: objective }
        ];

        for (let i = 0; i < 20; i++) {
          const agentTokens = svc.sessionUsage.totalTokens;
          updateStatus(`thinking... ${agentTokens > 1000 ? (agentTokens/1000).toFixed(1)+'k' : agentTokens} tokens`, i + 1);

          let r: any;
          try {
            r = await svc.chat(msgs, this.allTools as any);
          } catch (e: any) {
            updateStatus(`erro: ${e.message}`);
            return `Erro: ${e.message}`;
          }

          if (!r || (!r.content && !r.tool_calls?.length)) {
            updateStatus('resposta vazia, encerrando');
            return 'Resposta vazia da API.';
          }

          msgs.push(r);

          if (!r.tool_calls?.length) {
            updateStatus('done');
            return r.content || 'Concluído.';
          }

          const names = r.tool_calls.map((tc: any) => tc.function.name).join(', ');
          updateStatus(`${r.tool_calls.length} tools: ${names}`, i + 1);

          const results = await Promise.all(r.tool_calls.map(async (tc: any) => {
            const h = this.allHandlers[tc.function.name];
            const res = h ? await h(safeJSONParse(tc.function.arguments)) : 'N/A';
            return { role: 'tool', tool_call_id: tc.id, content: truncateToolOutput(String(res)) };
          }));
          msgs.push(...results);
        }
        updateStatus('max iterations');
        return 'Limite de iterações.';
      } catch (e: any) {
        updateStatus(`erro: ${e.message}`);
        return `Erro: ${e.message}`;
      }
    })();

    agentData.promise = promise;
    this.activeAgents.set(id, agentData as any);

    promise.then(result => {
      logger.success(`[${id}] concluido`);
      smartOutput(result, id);
      this.activeAgents.delete(id);
    });
  }

  private showAgents() {
    if (!this.activeAgents.size) { logger.info('Sem agentes.'); return; }
    const cols = process.stdout.columns || 80;
    console.log(chalk.hex('#003B00')('─'.repeat(cols)));
    for (const [id, a] of this.activeAgents) {
      const sec = Math.round((Date.now() - a.startedAt.getTime()) / 1000);
      const iter = a.iteration ? `iter:${a.iteration}` : '';
      const preview = a.objective.length > 40 ? a.objective.substring(0, 40) + '...' : a.objective;
      console.log(
        chalk.hex('#ADFF2F')(` ${id}`) +
        chalk.hex('#008F11')(` ${sec}s ${iter}`) +
        chalk.hex('#005500')(` ${preview}`)
      );
      console.log(chalk.hex('#008F11')(`   └ ${a.status}`));
    }
    console.log(chalk.hex('#003B00')('─'.repeat(cols)));
  }

  // --- Live timer com watchdog ---
  private startLiveTimer(label: string): () => void {
    const start = Date.now();
    let stopped = false;
    const interval = setInterval(() => {
      if (stopped) return;
      const sec = Math.round((Date.now() - start) / 1000);
      const tokens = this.pool.aggregatedUsage.totalTokens;
      process.stdout.write(`\r${chalk.hex('#005500')(`  ${label} ${sec}s | ${tokens > 1000 ? (tokens/1000).toFixed(1)+'k' : tokens} tokens`)}`);
      // Watchdog: se passou de 150s, aborta (API timeout é 120s)
      if (sec > 150 && !this.abortTask) {
        stopped = true;
        clearInterval(interval);
        process.stdout.write('\r\x1b[2K');
        logger.warn('Watchdog: timeout, forçando abort');
        this.service.abort();
        this.abortTask = true;
      }
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(interval);
      process.stdout.write('\r\x1b[2K');
    };
  }

  // --- Response Processing ---
  private async processResponse() {
    const pauseTask = () => {
      if (this.abortTask) return;
      this.abortTask = true;
      this.service.abort();
      logger.warn('\n  Pausado. (contexto mantido)');
    };

    // ESC + Ctrl+C listener direto no stdin (sem rawMode — usa keypress do readline)
    const keypressHandler = (_str: string, key: any) => {
      if (!key) return;
      if (key.name === 'escape') pauseTask();
    };
    process.stdin.on('keypress', keypressHandler);

    // Ctrl+C via SIGINT
    const sigintHandler = () => pauseTask();
    process.on('SIGINT', sigintHandler);

    let iterations = 0;
    try {
      this.consecutiveErrors = 0;

      const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');
      const modelNoTools = NO_TOOLS_MODELS.has(this.service.modelName);
      const selectedTools = (this.planMode || modelNoTools) ? undefined : (lastUserMsg ? getToolSubset(lastUserMsg.content) : this.allTools);

      while (!this.abortTask && iterations++ < 10) {
        // Tools fixas por iteração — sem expansão dinâmica que infla o payload
        const toolsToSend = selectedTools;

        this.messages = this.sanitizeMessages(this.messages);
        this.compressOldMessages();

        // Streaming: user vê resposta em tempo real (sem timer, o stream já mostra progresso)
        let response: any;
        try {
          response = await this.service.chatStream(this.messages, toolsToSend);
        } catch (e: any) {
          if (this.abortTask) break;

          // Rate limit: cooldown adaptativo + fallback pra outro provider
          if ((e as any).status === 429) {
            const failedProvider = this.service.provider;
            const hitCount = this.pool.markRateLimited(failedProvider);
            const cooldowns = ['60s', '2min', '5min', '10min'];
            const cooldownStr = cooldowns[Math.min(hitCount - 1, cooldowns.length - 1)];
            const available = this.pool.getAvailable().filter(a => a.providerId !== failedProvider);
            if (available.length > 0) {
              const fallback = this.pool.get(available[0]!.providerId)!;
              logger.warn(`429 ${failedProvider} (${cooldownStr} cooldown) → ${fallback.provider}/${fallback.modelName}`);
              this.service = fallback;
              continue; // retry com outro provider
            }
            logger.error(`429 ${failedProvider} — sem providers disponíveis`);
            break;
          }

          // Outros erros de stream: fallback pra non-stream
          try {
            response = await this.service.chat(this.messages, toolsToSend);
          } catch (e2: any) {
            logger.error(`${e2.message || e.message}`);
            break;
          }
        }

        // Limpa tokens especiais de modelos locais
        if (response.content) {
          response.content = response.content.replace(/<\|im_start\|>|<\|im_end\|>|<\|endoftext\|>|<s>|<\/s>/g, '').trim();
        }

        if (!response || (!response.content && !response.tool_calls?.length)) {
          logger.warn('Resposta vazia. Encerrando.');
          break;
        }

        // Detecção de loop: mesma tool+args exata repetiu = loop
        if (response.tool_calls?.length) {
          const callSig = response.tool_calls.map((tc: any) => `${tc.function.name}:${tc.function.arguments}`).join('|');
          const repeatCount = this._callHistory.filter(s => s === callSig).length;
          this._callHistory.push(callSig);

          if (repeatCount >= 2) {
            logger.warn('Loop detectado. Forçando resposta.');
            // NÃO push response com tool_calls (causaria erro 400)
            // Injeta instrução e pede resposta texto
            this.messages.push({ role: 'user', content: 'Você já coletou informação suficiente. Pare de ler arquivos e responda minha pergunta original com o que já sabe. NÃO use mais tools.' });
            const finalResp = await this.service.chat(this.messages); // sem tools
            if (finalResp?.content) {
              let content = finalResp.content.replace(/<\|im_start\|>|<\|im_end\|>|<\|endoftext\|>|<s>|<\/s>/g, '').trim();
              if (content) smartOutput(content, 'VOIDCODE');
              this.messages.push({ role: 'assistant', content });
            }
            break;
          }
        }

        // Ollama/modelos locais: tool calls podem vir como JSON no content
        if (response.content && !response.tool_calls?.length) {
          const parsed = this.parseToolCallFromContent(response.content);
          if (parsed) {
            response.tool_calls = [parsed];
            response.content = null;
          }
        }

        this.messages.push(response);

        // Stream já imprimiu o content na tela — não duplicar
        if (!response.tool_calls?.length) {
          if (!response.content) logger.dim('  (sem resposta)');
          break;
        }

        const toolCalls = response.tool_calls;

        if (this.insaneMode) {
          const startTime = Date.now();
          const results = await Promise.all(toolCalls.map(async (tc: any) => {
            try {
              const name = tc.function.name;
              const toolArgs = safeJSONParse(tc.function.arguments);
              logger.tool(name, JSON.stringify(toolArgs));

              const cacheKey = this.toolCache.key(name, toolArgs);
              const cached = this.toolCache.get(cacheKey);
              if (cached) return { role: 'tool' as const, tool_call_id: tc.id, content: cached };

              const handler = this.allHandlers[name];
              let result = handler ? await handler(toolArgs) : 'Tool não encontrada.';
              result = truncateToolOutput(String(result));
              this.toolCache.set(cacheKey, result);
              if (['write_file', 'replace_file_content', 'git_commit', 'run_shell_command', 'patch_file'].includes(name)) this.toolCache.invalidate();

              if (result.startsWith('Erro:') || result.includes('MODULE_NOT_FOUND') || result.includes('ENOENT') || result.includes('command not found')) {
                this.consecutiveErrors++;
              } else {
                this.consecutiveErrors = 0;
              }

              return { role: 'tool' as const, tool_call_id: tc.id, content: result };
            } catch (toolErr: any) {
              logger.error(`tool ${tc.function?.name} crash: ${toolErr.message}`);
              return { role: 'tool' as const, tool_call_id: tc.id, content: `Erro: ${toolErr.message}` };
            }
          }));

          logger.dim(`  ${toolCalls.length} tools ${Date.now() - startTime}ms`);
          this.messages.push(...results);
          this.showFooter();

          if (this.consecutiveErrors >= 2) {
            this.messages.push({
              role: 'system',
              content: `[AUTO-FIX] ${this.consecutiveErrors} erros seguidos. Analise e corrija.`
            });
          }
        } else {
          const results = [];
          for (const tc of toolCalls) {
            const name = tc.function.name;
            const toolArgs = safeJSONParse(tc.function.arguments);
            logger.tool(name, JSON.stringify(toolArgs));
            const answer = await ask(chalk.hex('#ADFF2F')(`  Autorizar ${name}? (Y/n) `));
            if (answer.toLowerCase() === 'n') { results.push({ role: 'tool' as const, tool_call_id: tc.id, content: 'Recusado.' }); continue; }
            const handler = this.allHandlers[name];
            let result = handler ? await handler(toolArgs) : 'N/A';
            result = truncateToolOutput(String(result));
            results.push({ role: 'tool' as const, tool_call_id: tc.id, content: result });
          }
          this.messages.push(...results);
        }
      }
    } catch (error: any) {
      if (!this.abortTask) logger.error(`Erro: ${error.message}`);
    } finally {
      process.removeListener('SIGINT', sigintHandler);
      process.stdin.removeListener('keypress', keypressHandler);
      if (this.abortTask) {
        // Injeta resumo do que estava fazendo para o próximo prompt ter contexto
        const lastAssistant = [...this.messages].reverse().find(m => m.role === 'assistant' && m.content);
        const lastUser = [...this.messages].reverse().find(m => m.role === 'user');
        const toolsUsed = this.messages
          .filter(m => m.role === 'assistant' && m.tool_calls)
          .flatMap(m => m.tool_calls.map((tc: any) => tc.function.name));
        const uniqueTools = [...new Set(toolsUsed)].slice(-5);

        const pauseCtx = [
          lastUser?.content ? `Tarefa: ${lastUser.content.substring(0, 200)}` : '',
          uniqueTools.length ? `Tools usadas: ${uniqueTools.join(', ')}` : '',
          lastAssistant?.content ? `Último progresso: ${lastAssistant.content.substring(0, 300)}` : '',
          `Iterações: ${iterations}, Status: PAUSADO pelo usuário`
        ].filter(Boolean).join('\n');

        this.messages.push({
          role: 'system',
          content: `[TAREFA PAUSADA - Ctrl+C]\n${pauseCtx}\nO usuário pode dar novo comando ou pedir para continuar esta tarefa.`
        });
      }
      this.abortTask = false;
    }
  }

  // Parseia tool call que veio como JSON no content (Ollama/modelos locais)
  private parseToolCallFromContent(content: string): any | null {
    try {
      // Extrai JSON de code blocks ou content direto
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || content.match(/(\{[\s\S]*"name"[\s\S]*"arguments"[\s\S]*\})/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[1]!);
      if (parsed.name && parsed.arguments) {
        const toolNames = this.allTools.map((t: any) => t.function.name);
        if (toolNames.includes(parsed.name)) {
          return {
            type: 'function',
            id: `call_${Date.now()}`,
            function: {
              name: parsed.name,
              arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments)
            }
          };
        }
      }
    } catch { /* not a tool call */ }
    return null;
  }

  // Estima tokens (~3 chars por token para código/JSON)
  private estimateTokens(msg: any): number {
    let chars = 0;
    if (msg.content) chars += msg.content.length;
    if (msg.tool_calls) chars += JSON.stringify(msg.tool_calls).length;
    return Math.ceil(chars / 3);
  }

  // Token budget: garante que o total de messages não passe do limite
  // Estratégia: comprime do mais antigo pro mais recente até caber
  private compressOldMessages() {
    // Budget baseado no context window do modelo ativo (60% do total)
    const ctxWindow = this.service.contextWindow;
    const TOKEN_BUDGET = Math.min(Math.floor(ctxWindow * 0.6), 50000);
    const KEEP_RECENT = 4; // últimas 4 msgs intactas sempre

    // Calcula total atual
    let total = this.messages.reduce((sum: number, m: any) => sum + this.estimateTokens(m), 0);

    if (total <= TOKEN_BUDGET) return; // dentro do budget

    const cutoff = Math.max(1, this.messages.length - KEEP_RECENT);

    // Passo 1: trunca tool results antigos pra 100 chars
    for (let i = 1; i < cutoff && total > TOKEN_BUDGET; i++) {
      const msg = this.messages[i];
      if (!msg?.content || msg.content.length <= 100) continue;
      if (msg.role === 'tool' || msg.role === 'assistant') {
        const before = this.estimateTokens(msg);
        const firstLine = msg.content.split('\n')[0] || '';
        msg.content = firstLine.substring(0, 100);
        total -= (before - this.estimateTokens(msg));
      }
    }

    // Passo 2: se ainda acima, remove mensagens antigas (mantém system + recentes)
    while (total > TOKEN_BUDGET && this.messages.length > KEEP_RECENT + 1) {
      const removed = this.messages.splice(1, 1)[0]; // remove a 2a msg (depois do system)
      total -= this.estimateTokens(removed);
    }

    if (total > TOKEN_BUDGET) {
      logger.dim(`  contexto: ~${Math.round(total/1000)}k tokens (budget: ${TOKEN_BUDGET/1000}k)`);
    }
  }

  // --- Compactação ---
  // Compactação LOCAL (sem API call) - nunca bloqueia o prompt
  private quickCompact() {
    const sys = this.messages[0];
    // Extrai resumo dos últimos user messages
    const userMsgs = this.messages.filter(m => m.role === 'user').map(m => m.content);
    const summary = userMsgs.slice(-3).join(' | ').substring(0, 300);
    // Mantém system + resumo + últimas 4 msgs
    const tail = this.sanitizeMessages(this.messages.slice(-4));
    this.messages = [sys, { role: 'system', content: `[CTX]: ${summary}` }, ...tail];
    logger.dim('  contexto compactado');
  }

  // Compactação via API (só no /compact manual)
  private async compactHistory() {
    logger.dim('  Compactando via API...');
    const stopTimer = this.startLiveTimer('compacting');
    try {
      const safeMessages = this.sanitizeMessages(this.messages);
      const r = await this.service.chat([
        ...safeMessages,
        { role: 'user', content: 'Resuma em 3 frases: objetivos, arquivos alterados, estado atual.' }
      ]);
      stopTimer();
      if (r?.content) {
        const sys = this.messages[0];
        const tail = this.sanitizeMessages(this.messages.slice(-4));
        this.messages = [sys, { role: 'system', content: `[CTX]: ${r.content}` }, ...tail];
        logger.success('Contexto compactado via API.');
      }
    } catch {
      stopTimer();
      this.quickCompact(); // fallback local
    }
  }

  // Garante que messages estão válidas para a API:
  // - Todo assistant com tool_calls precisa ser seguido por TODAS as tool responses
  // - Toda tool message precisa ter um assistant com tool_calls antes
  private sanitizeMessages(msgs: any[]): any[] {
    // Passo 1: identifica quais tool_call_ids têm respostas
    const toolResponseIds = new Set<string>();
    for (const msg of msgs) {
      if (msg.role === 'tool' && msg.tool_call_id) toolResponseIds.add(msg.tool_call_id);
    }

    // Passo 2: identifica quais assistant+tool_calls estão completos
    const validAssistantIndices = new Set<number>();
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        const allAnswered = msg.tool_calls.every((tc: any) => toolResponseIds.has(tc.id));
        if (allAnswered) validAssistantIndices.add(i);
      }
    }

    // Passo 3: coleta tool_call_ids válidos
    const validToolCallIds = new Set<string>();
    for (const i of validAssistantIndices) {
      for (const tc of msgs[i].tool_calls) validToolCallIds.add(tc.id);
    }

    // Passo 4: filtra
    const clean: any[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.role === 'tool') {
        // Só inclui se pertence a um assistant válido
        if (validToolCallIds.has(msg.tool_call_id)) clean.push(msg);
      } else if (msg.role === 'assistant' && msg.tool_calls?.length) {
        if (validAssistantIndices.has(i)) {
          clean.push(msg);
        } else if (msg.content) {
          // Converte para texto simples
          clean.push({ role: 'assistant', content: msg.content });
        }
      } else {
        clean.push(msg);
      }
    }
    return clean;
  }

  public async runAutonomously(): Promise<string> {
    if (!this.allTools.length) { this.allTools = [...tools]; this.allHandlers = { ...toolHandlers }; }
    await this.processResponse();
    return this.messages[this.messages.length - 1]?.content || 'Concluído.';
  }
}
