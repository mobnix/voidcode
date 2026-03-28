import ora from 'ora';
import chalk from 'chalk';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { DeepSeekService, saveConfig } from '../core/deepseek.js';
import { PROVIDERS } from '../core/providers.js';
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
      console.log(chalk.hex('#008F11')('\n  (Ctrl+C) Use /exit para sair.'));
      rl?.prompt();
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

// --- Tool Result Cache ---
class ToolCache {
  private cache = new Map<string, { result: string; ts: number }>();
  private readonly TTL = 10000;

  key(name: string, args: any): string {
    if (!['read_file', 'list_directory', 'git_status', 'git_log', 'glob_files'].includes(name)) return '';
    return `${name}:${JSON.stringify(args)}`;
  }

  get(k: string): string | null {
    if (!k) return null;
    const entry = this.cache.get(k);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.TTL) { this.cache.delete(k); return null; }
    return entry.result;
  }

  set(k: string, result: string) { if (k) this.cache.set(k, { result, ts: Date.now() }); }
  invalidate() { this.cache.clear(); }
}

interface Task { id: number; text: string; status: 'pending' | 'done'; }

// --- Sessões ---
const SESSION_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.voidcode');
const SESSIONS_FILE = path.join(SESSION_DIR, 'sessions.json');

interface SessionEntry { summary: string; cwd: string; timestamp: string; }

function saveSession(summary: string, cwd: string) {
  try {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    const sessions = loadAllSessions();
    sessions.unshift({ summary, cwd, timestamp: new Date().toISOString() });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions.slice(0, 3), null, 2));
  } catch { /* ok */ }
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
    /configur(e|ar).*(completo|inteiro|todo)/i,
    /\b(full|inteiro|completo|todo o|todos os)\b/i,
    /\bdo zero\b/i,
    /\bfrom scratch\b/i,
    /múltiplo|vários arquivos|varias pastas/i,
    /subir.*servidor|deploy|build.*prod/i,
  ];
  return complexPatterns.some(p => p.test(input));
}

export class ChatLoop {
  private service: DeepSeekService;
  private messages: any[] = [];
  private insaneMode: boolean;
  private planMode = false;
  private abortTask = false;
  private allTools: any[] = [];
  private allHandlers: Record<string, (args: any) => any> = {};
  private readonly MAX_HISTORY_LENGTH = 20;
  private activeAgents: Map<string, { promise: Promise<string>; objective: string; startedAt: Date }> = new Map();
  private agentCounter = 0;
  private tasks: Task[] = [];
  private taskCounter = 0;
  private toolCache = new ToolCache();
  private consecutiveErrors = 0;
  private telegramBot: TelegramBridge | null = null;
  private processing = false; // true quando está processando uma tarefa
  private taskQueue: string[] = []; // fila de inputs pendentes
  private spinner = ora({ text: 'Processando...', color: 'green', spinner: 'dots' });

  constructor(insaneMode = false) {
    this.service = new DeepSeekService();
    this.insaneMode = insaneMode;

    const systemPrompt = [
      `Você é VOIDCODE, engenheiro sênior full-stack.`,
      `REGRAS CRÍTICAS:`,
      `1. CONCISO. Código fala, não explique o óbvio.`,
      `2. Chame MÚLTIPLAS tools em PARALELO na mesma resposta (ex: ler 3 arquivos = 3 tool_calls).`,
      `3. Antes de rodar projeto: instale deps primeiro (npm install, pip install).`,
      `4. Para servidores: use background:true no run_shell_command.`,
      `5. NÃO releia arquivos que você acabou de escrever.`,
      `6. Se um erro ocorrer, analise o erro e tente corrigir automaticamente.`,
      `7. Use memory_write para salvar decisões (category: user/project/feedback).`,
      `8. Para edições cirúrgicas: use patch_file ou replace_file_content em vez de reescrever arquivo inteiro.`,
      this.insaneMode ? '9. INSANE MODE: execute tudo direto.' : '9. Peça permissão antes de alterar.',
      `cwd: ${process.cwd()}`
    ].join('\n');

    this.messages.push({ role: 'system', content: systemPrompt });

    const projectCtx = detectProjectContext();
    if (projectCtx) this.messages.push({ role: 'system', content: projectCtx });
  }

  async start() {
    const { tools: skillTools, handlers: skillHandlers } = await loadSkills();
    this.allTools = [...tools, ...skillTools];
    this.allHandlers = { ...toolHandlers, ...skillHandlers };

    try {
      const memory = loadStructuredMemory();
      if (memory) {
        this.messages.push({ role: 'system', content: `[MEM]:\n${memory}` });
        logger.info('Memória carregada.');
      }
    } catch { /* ok */ }

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

    initFixedFooter();
    this.showFooter();

    while (true) {
      if (this.messages.length > this.MAX_HISTORY_LENGTH) await this.compactHistory();

      const mode = this.planMode ? chalk.hex('#ADFF2F')('[PLAN] ') : '';
      const busy = this.processing ? chalk.hex('#008F11')('[busy] ') : '';
      const userInput = await ask(busy + mode + chalk.hex('#00FF41')('Mob > '));

      if (!userInput) continue;
      if (userInput.toLowerCase() === '/exit' || userInput.toLowerCase() === 'exit') {
        await this.saveAndExit();
      }
      if (userInput.startsWith('/')) { await this.handleCommand(userInput); continue; }

      // Se já está processando, spawna como agente paralelo
      if (this.processing) {
        const preview = userInput.length > 60 ? userInput.substring(0, 60) + '...' : userInput;
        logger.info(`Ocupado. Enviando para agente: "${preview}"`);
        this.spawnBackgroundAgent(userInput);
        continue;
      }

      // Executa task - non-blocking: roda em background e volta pro prompt
      this.processing = true;
      this.executeTaskBackground(userInput);
    }
  }

  private executeTaskBackground(userInput: string) {
    const run = async () => {
      try {
        if (isComplexTask(userInput) && !this.planMode) {
          await this.handleComplexTask(userInput);
        } else {
          const snapshot = getCwdSnapshot();
          if (snapshot) this.messages.push({ role: 'system', content: `[CWD]: ${snapshot}` });
          this.messages.push({ role: 'user', content: userInput });
          this.toolCache.invalidate();
          await this.processResponse();
        }
      } catch (e: any) {
        logger.error(`[ERRO] ${e.message}`);
      } finally {
        this.processing = false;
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
    this.spinner.text = 'Planejando...';
    this.spinner.start();

    const planMessages = [
      ...this.messages,
      { role: 'system', content: `[CWD]: ${snapshot}` },
      { role: 'user', content: `TAREFA: ${userInput}\n\nAntes de executar, crie um plano DETALHADO:\n1. Liste TODOS os arquivos que precisa criar/modificar\n2. Liste as dependências necessárias\n3. Liste os comandos que precisa rodar\n4. Ordene os passos para máxima paralelização\n\nResponda APENAS com o plano, NÃO execute nada ainda.` }
    ];

    try {
      const planResponse = await this.service.chat(planMessages);
      this.spinner.stop();

      if (planResponse.content) {
        smartOutput(planResponse.content, 'PLAN');

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
      this.spinner.stop();
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
    console.log(`\n${sep}\n${chalk.hex('#00FF41').bold('  PROVIDER & AUTH')}`);
    console.log(`  Atual: ${chalk.hex('#ADFF2F').bold(this.service.provider)} / ${chalk.hex('#ADFF2F').bold(this.service.modelName)}\n${sep}`);

    PROVIDERS.forEach((p, i) => {
      const active = p.id === this.service.provider ? chalk.hex('#ADFF2F')(' <--') : '';
      const hasKey = process.env[p.envKey] ? chalk.hex('#00FF41')(' [ok]') : chalk.hex('#005500')(' [sem key]');
      console.log(`  ${chalk.hex('#008F11')(`${i + 1})`)} ${chalk.hex('#ADFF2F')(p.name)}${hasKey}${active}`);
    });
    console.log(`  ${chalk.hex('#008F11')('0)')} Cancelar\n`);

    const idx = parseInt(await ask(chalk.hex('#008F11')('Provider: '))) - 1;
    if (idx < 0 || idx >= PROVIDERS.length) return;
    const provider = PROVIDERS[idx]!;

    let baseURL = provider.baseURL;
    if (provider.id === 'custom') {
      baseURL = await ask(chalk.hex('#008F11')('Base URL: '));
      if (!baseURL) return;
    }

    const existing = process.env[provider.envKey];
    let apiKey = existing || '';
    if (existing) {
      const masked = existing.substring(0, 6) + '...' + existing.substring(existing.length - 4);
      console.log(chalk.hex('#008F11')(`  Key: ${masked}`));
      if ((await ask(chalk.hex('#008F11')('Trocar? (y/N): '))).toLowerCase() === 'y') {
        apiKey = await ask(chalk.hex('#008F11')('Nova key: '));
      }
    } else {
      apiKey = await ask(chalk.hex('#008F11')(`${provider.name} API Key: `));
    }
    if (!apiKey || apiKey.length < 5) { logger.error('Key inválida.'); return; }

    let model = '';
    if (provider.models.length > 0) {
      console.log(chalk.hex('#00FF41')('\n  Modelos:'));
      provider.models.forEach((m, i) => console.log(`  ${i + 1}) ${chalk.hex('#ADFF2F')(m.name)} ${chalk.hex('#005500')(`- ${m.description}`)}`));
      console.log(`  ${provider.models.length + 1}) Custom\n`);
      const mi = parseInt(await ask(chalk.hex('#008F11')('Modelo: '))) - 1;
      model = (mi >= 0 && mi < provider.models.length) ? provider.models[mi]!.id : await ask(chalk.hex('#008F11')('Nome: '));
    } else {
      model = await ask(chalk.hex('#008F11')('Nome do modelo: '));
    }
    if (!model) return;

    saveConfig({ provider: provider.id, model, baseURL, apiKey, envKey: provider.envKey });
    this.service.reconnect(apiKey, baseURL, model, provider.id);
    logger.success(`Conectado: ${provider.name} / ${model}`);
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
      const response = await this.service.chat(this.messages, this.allTools as any);
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
        const finalResponse = await this.service.chat(this.messages, this.allTools as any);
        this.messages.push(finalResponse);
        return finalResponse.content || 'Executado (sem resposta texto).';
      }

      return response.content || 'Sem resposta.';
    });

    await this.telegramBot.start();
  }

  private showUsage() {
    const s = this.service.sessionUsage;
    const l = this.service.lastUsage;
    const sep = chalk.hex('#003B00')('─'.repeat(process.stdout.columns || 80));
    console.log(`\n${sep}\n${chalk.hex('#00FF41').bold('  TOKEN USAGE')}\n${sep}`);
    console.log(`  Sessão: ${chalk.hex('#ADFF2F').bold(s.totalTokens.toLocaleString())} (in:${s.promptTokens.toLocaleString()} out:${s.completionTokens.toLocaleString()}) | ${this.service.requestCount} reqs`);
    console.log(`  Última: in:${l.promptTokens.toLocaleString()} out:${l.completionTokens.toLocaleString()} | ${this.service.provider}/${this.service.modelName} | ${this.messages.length} msgs`);
    console.log(`  Erros auto-corrigidos: ${this.consecutiveErrors > 0 ? this.consecutiveErrors : 'nenhum'}`);
    console.log(sep + '\n');
  }

  private showFooter() {
    renderFooter({
      model: `${this.service.provider}/${this.service.modelName}`,
      mode: this.planMode ? 'PLAN' : this.insaneMode ? 'INSANE' : 'SAFE',
      tokens: this.service.sessionUsage,
      requests: this.service.requestCount,
      cwd: process.cwd(),
      messagesCount: this.messages.length
    });
  }

  private async saveAndExit() {
    try {
      if (this.messages.length > 3) {
        const userMsgs = this.messages.filter(m => m.role === 'user').map(m => m.content).slice(-5);
        saveSession(userMsgs.join(' | ').substring(0, 500), process.cwd());
        logger.dim('  Sessão salva.');
      }
    } catch { /* ok */ }
    destroyFixedFooter();
    logger.matrix('Goodbye, Mr. Anderson...');
    process.exit(0);
  }

  // --- Multi-Agent ---
  private spawnBackgroundAgent(objective: string) {
    const id = `agent-${++this.agentCounter}`;
    logger.info(`[${id}] "${objective}"`);

    const promise = (async () => {
      try {
        const svc = new DeepSeekService();
        const msgs: any[] = [
          { role: 'system', content: `Sub-agente VOIDCODE. Direto. Use múltiplas tools em paralelo. cwd: ${process.cwd()}` },
          { role: 'user', content: objective }
        ];
        for (let i = 0; i < 10; i++) {
          const r = await svc.chat(msgs, this.allTools as any);
          msgs.push(r);
          if (!r.tool_calls?.length) return r.content || 'Concluído.';
          const results = await Promise.all(r.tool_calls.map(async (tc: any) => {
            const h = this.allHandlers[tc.function.name];
            const res = h ? await h(safeJSONParse(tc.function.arguments)) : 'N/A';
            return { role: 'tool', tool_call_id: tc.id, content: truncateToolOutput(String(res)) };
          }));
          msgs.push(...results);
        }
        return 'Limite de iterações.';
      } catch (e: any) { return `Erro: ${e.message}`; }
    })();

    this.activeAgents.set(id, { promise, objective, startedAt: new Date() });
    promise.then(result => {
      logger.success(`\n[${id}] Done!`);
      smartOutput(result, id.toUpperCase());
      this.activeAgents.delete(id);
    });
  }

  private showAgents() {
    if (!this.activeAgents.size) { logger.info('Sem agentes.'); return; }
    for (const [id, a] of this.activeAgents) {
      const s = Math.round((Date.now() - a.startedAt.getTime()) / 1000);
      console.log(`  ${chalk.hex('#ADFF2F')(id)} ${chalk.hex('#008F11')(`${s}s`)} ${a.objective}`);
    }
  }

  // --- Response Processing com retry e auto-correção ---
  private async processResponse() {
    this.spinner.start();
    const sigintHandler = () => { this.abortTask = true; this.spinner.stop(); logger.warn('\n  Abortando...'); };
    process.on('SIGINT', sigintHandler);

    try {
      let iterations = 0;
      this.consecutiveErrors = 0;

      while (!this.abortTask && iterations++ < 25) {
        let toolsToSend: any;
        if (this.planMode) {
          toolsToSend = undefined;
        } else if (iterations === 1) {
          const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');
          toolsToSend = lastUserMsg ? getToolSubset(lastUserMsg.content) : this.allTools;
        } else {
          toolsToSend = this.allTools;
        }

        // Sanitiza antes de enviar para a API (previne tool messages órfãs)
        this.messages = this.sanitizeMessages(this.messages);
        const response = await this.service.chat(this.messages, toolsToSend);
        this.spinner.stop();
        this.messages.push(response);

        if (response.content) smartOutput(response.content, 'VOIDCODE');
        if (!response.tool_calls?.length) break;

        const toolCalls = response.tool_calls;

        if (this.insaneMode) {
          const startTime = Date.now();
          const results = await Promise.all(toolCalls.map(async (tc: any) => {
            const name = tc.function.name;
            const toolArgs = safeJSONParse(tc.function.arguments);
            logger.tool(name, JSON.stringify(toolArgs));

            const cacheKey = this.toolCache.key(name, toolArgs);
            const cached = this.toolCache.get(cacheKey);
            if (cached) { logger.dim(`  ${name} (cache)`); return { role: 'tool' as const, tool_call_id: tc.id, content: cached }; }

            const handler = this.allHandlers[name];
            let result = handler ? await handler(toolArgs) : 'Tool não encontrada.';
            result = truncateToolOutput(String(result));
            this.toolCache.set(cacheKey, result);
            if (['write_file', 'replace_file_content', 'git_commit', 'run_shell_command', 'patch_file'].includes(name)) this.toolCache.invalidate();

            // --- AUTO-CORREÇÃO: detecta erros em tool results ---
            if (result.startsWith('Erro:') || result.includes('MODULE_NOT_FOUND') || result.includes('ENOENT') || result.includes('command not found')) {
              this.consecutiveErrors++;
            } else {
              this.consecutiveErrors = 0;
            }

            return { role: 'tool' as const, tool_call_id: tc.id, content: result };
          }));

          const elapsed = Date.now() - startTime;
          toolProgress(toolCalls.length, toolCalls.length, `${elapsed}ms`);
          this.messages.push(...results);

          // Se muitos erros seguidos, injeta dica de correção
          if (this.consecutiveErrors >= 2) {
            this.messages.push({
              role: 'system',
              content: `[AUTO-FIX] Detectados ${this.consecutiveErrors} erros seguidos nos tool results acima. Analise os erros, identifique a causa raiz e corrija. Não repita a mesma ação que falhou.`
            });
            logger.warn(`  Auto-correção: ${this.consecutiveErrors} erros detectados, instruindo LLM a corrigir.`);
          }
        } else {
          const results = [];
          for (const tc of toolCalls) {
            const name = tc.function.name;
            const toolArgs = safeJSONParse(tc.function.arguments);
            logger.tool(name, JSON.stringify(toolArgs));
            const answer = await ask(chalk.hex('#ADFF2F')(`  Autorizar ${name.toUpperCase()}? (Y/n) `));
            if (answer.toLowerCase() === 'n') { results.push({ role: 'tool' as const, tool_call_id: tc.id, content: 'Recusado.' }); continue; }
            this.spinner.start();
            const handler = this.allHandlers[name];
            let result = handler ? await handler(toolArgs) : 'N/A';
            result = truncateToolOutput(String(result));
            this.spinner.stop();
            logger.success(`${name} ok`);
            results.push({ role: 'tool' as const, tool_call_id: tc.id, content: result });
          }
          this.messages.push(...results);
        }
        this.spinner.start();
      }
    } catch (error: any) {
      this.spinner.stop();
      if (!this.abortTask) logger.error(`[ERRO] ${error.message}`);
    } finally {
      process.removeListener('SIGINT', sigintHandler);
      if (this.abortTask) logger.info('Tarefa interrompida.');
      this.abortTask = false;
    }
  }

  // --- Compactação ---
  private async compactHistory() {
    logger.dim('  Compactando...');
    this.spinner.start();
    try {
      const safeMessages = this.sanitizeMessages(this.messages);
      const r = await this.service.chat([
        ...safeMessages,
        { role: 'user', content: 'Resuma em 3 frases: objetivos, arquivos alterados, estado atual.' }
      ]);
      this.spinner.stop();
      if (r?.content) {
        const sys = this.messages[0];
        const tail = this.sanitizeMessages(this.messages.slice(-6));
        this.messages = [sys, { role: 'system', content: `[CTX]: ${r.content}` }, ...tail];
        logger.success('Contexto compactado.');
      }
    } catch { this.spinner.stop(); }
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
