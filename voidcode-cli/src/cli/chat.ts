import ora from 'ora';
import chalk from 'chalk';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { DeepSeekService, saveConfig } from '../core/deepseek.js';
import { PROVIDERS } from '../core/providers.js';
import { logger, smartOutput, truncateToolOutput, renderFooter } from '../utils/ui.js';
import { tools, toolHandlers, getToolSubset } from '../tools/index.js';
// getToolSubset: envia só tools relevantes ao contexto = menos tokens por request
import { loadSkills } from '../skills/index.js';
import { safeJSONParse } from '../utils/json.js';
import { detectProjectContext, loadStructuredMemory } from '../core/context.js';

// --- Readline persistente ---
let rl: readline.Interface | null = null;
let ctrlDCount = 0;
let ctrlDTimer: ReturnType<typeof setTimeout> | null = null;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.on('SIGINT', () => {
      console.log(chalk.hex('#008F11')('\n  (Ctrl+C) Use /exit para sair.'));
      rl?.prompt();
    });
    rl.on('close', () => {
      ctrlDCount++;
      if (ctrlDTimer) clearTimeout(ctrlDTimer);
      if (ctrlDCount >= 2) { console.log(chalk.hex('#008F11')('\nGoodbye.')); process.exit(0); }
      console.log(chalk.hex('#008F11')('\n  (Ctrl+D) Pressione novamente para sair.'));
      rl = null;
      ctrlDTimer = setTimeout(() => { ctrlDCount = 0; }, 2000);
      getRL();
    });
  }
  return rl;
}

function ask(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    getRL().question(promptText, (answer) => { resolve(answer?.trim() || ''); });
  });
}

// --- Tool Result Cache (evita re-ler mesmo arquivo na mesma iteração) ---
class ToolCache {
  private cache = new Map<string, { result: string; ts: number }>();
  private readonly TTL = 10000; // 10 segundos

  key(name: string, args: any): string {
    // Só cacheia leituras
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

  set(k: string, result: string) {
    if (!k) return;
    this.cache.set(k, { result, ts: Date.now() });
  }

  invalidate() {
    this.cache.clear();
  }
}

interface Task { id: number; text: string; status: 'pending' | 'done'; }

// --- Persistência de sessão (últimas 3) ---
const SESSION_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.voidcode');
const SESSIONS_FILE = path.join(SESSION_DIR, 'sessions.json');
const MAX_SESSIONS = 3;

interface SessionEntry {
  summary: string;
  cwd: string;
  timestamp: string;
}

function saveSession(summary: string, cwd: string) {
  try {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    const sessions = loadAllSessions();
    sessions.unshift({ summary, cwd, timestamp: new Date().toISOString() });
    // Mantém só as últimas 3
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions.slice(0, MAX_SESSIONS), null, 2));
  } catch { /* ok */ }
}

function loadAllSessions(): SessionEntry[] {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch { return []; }
}

function formatSessionForDisplay(s: SessionEntry, index: number): string {
  const date = new Date(s.timestamp);
  const ago = getTimeAgo(date);
  const cwdShort = s.cwd.replace(process.env.HOME || '', '~');
  return `  ${chalk.hex('#ADFF2F')(`${index + 1})`)} ${chalk.hex('#008F11')(ago)} ${chalk.hex('#005500')(`(${cwdShort})`)}\n     ${chalk.hex('#00FF41')(s.summary.substring(0, 120))}`;
}

function getTimeAgo(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.round(hours / 24);
  return `${days}d atrás`;
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
  private spinner = ora({ text: 'Processando...', color: 'green', spinner: 'dots' });

  constructor(insaneMode = false) {
    this.service = new DeepSeekService();
    this.insaneMode = insaneMode;

    // System prompt otimizado para eficiência
    const systemPrompt = [
      `Você é VOIDCODE, engenheiro sênior full-stack.`,
      `REGRAS DE EFICIÊNCIA:`,
      `- CONCISO. Sem explicações óbvias. Código fala.`,
      `- Chame MÚLTIPLAS tools em PARALELO (ex: ler 3 arquivos = 3 calls na mesma resposta).`,
      `- Antes de rodar: instale deps (npm install, pip install).`,
      `- Não releia arquivos que você acabou de escrever.`,
      `- Tarefas complexas: faça tudo de uma vez, não passo a passo.`,
      `- Use memory_write para salvar decisões importantes (category: user/project/feedback).`,
      `- Se o usuário corrigir você, salve na memória como feedback.`,
      this.insaneMode ? '- INSANE MODE: execute tools direto.' : '- Peça permissão antes de alterar arquivos.',
      `cwd: ${process.cwd()}`
    ].join('\n');

    this.messages.push({ role: 'system', content: systemPrompt });

    // Injeta contexto do projeto automaticamente
    const projectCtx = detectProjectContext();
    if (projectCtx) {
      this.messages.push({ role: 'system', content: projectCtx });
    }
  }

  async start() {
    const { tools: skillTools, handlers: skillHandlers } = await loadSkills();
    this.allTools = [...tools, ...skillTools];
    this.allHandlers = { ...toolHandlers, ...skillHandlers };

    // Carrega memória estruturada
    try {
      const memory = loadStructuredMemory();
      if (memory) {
        this.messages.push({ role: 'system', content: `[MEMÓRIA]:\n${memory}` });
        logger.info('Memória carregada.');
      }
    } catch { /* ok */ }

    // Oferece resumo de sessões anteriores
    const sessions = loadAllSessions();
    if (sessions.length > 0) {
      console.log(chalk.hex('#00FF41')('\n  Sessões anteriores:'));
      sessions.forEach((s, i) => console.log(formatSessionForDisplay(s, i)));
      console.log(`  ${chalk.hex('#008F11')('0)')} ${chalk.hex('#005500')('Nova sessão (ignorar)')}\n`);

      const choice = await ask(chalk.hex('#008F11')('Retomar sessão? (0/1/2/3): '));
      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < sessions.length) {
        const s = sessions[idx]!;
        this.messages.push({
          role: 'system',
          content: `[SESSÃO RETOMADA (${s.cwd}, ${getTimeAgo(new Date(s.timestamp))})]: O usuário estava trabalhando em: ${s.summary}`
        });
        logger.success(`Sessão ${idx + 1} restaurada.`);
      }
    }

    this.showFooter();

    while (true) {
      if (this.messages.length > this.MAX_HISTORY_LENGTH) await this.compactHistory();

      const mode = this.planMode ? chalk.hex('#ADFF2F')('[PLAN] ') : '';
      const userInput = await ask(mode + chalk.hex('#00FF41')('Mob >'));

      if (!userInput) continue;
      if (userInput.toLowerCase() === '/exit' || userInput.toLowerCase() === 'exit') {
        await this.saveAndExit();
      }

      if (userInput.startsWith('/')) { await this.handleCommand(userInput); continue; }

      this.messages.push({ role: 'user', content: userInput });
      this.toolCache.invalidate(); // Nova mensagem = cache limpo
      await this.processResponse();
      this.showFooter();
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
      case 'auth': case 'model': {
        await this.authMenu();
        break;
      }
      case 'commit': {
        const msg = args.join(' ');
        if (!msg) { logger.error('Uso: /commit <msg>'); break; }
        smartOutput(this.allHandlers['git_commit']?.({ message: msg, files: '.' }) || '', 'GIT');
        break;
      }
      case 'diff': smartOutput(this.allHandlers['git_diff']?.({ staged: false, file: args[0] || '' }) || 'Sem mudanças.', 'DIFF'); break;
      case 'log': smartOutput(this.allHandlers['git_log']?.({ count: parseInt(args[0] || '10') }) || '', 'LOG'); break;
      case 'status': smartOutput(this.allHandlers['git_status']?.({}) || '', 'STATUS'); break;
      case 'plan': {
        this.planMode = !this.planMode;
        logger.info(this.planMode ? 'PLAN MODE ON - só planeja, não executa.' : 'PLAN MODE OFF - execução normal.');
        this.messages.push({
          role: 'system',
          content: this.planMode
            ? '[PLAN MODE] NÃO use tools. Apenas planeje e liste passos.'
            : '[PLAN OFF] Pode usar tools normalmente.'
        });
        break;
      }
      case 'task': case 'tasks': {
        const sub = args[0];
        if (!sub || sub === 'list') this.showTasks();
        else if (sub === 'done') {
          const t = this.tasks.find(t => t.id === parseInt(args[1] || ''));
          if (t) { t.status = 'done'; logger.success(`#${t.id} concluída.`); }
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
        if (!obj) { logger.error('Uso: /agent <objetivo>'); break; }
        this.spawnBackgroundAgent(obj);
        break;
      }
      case 'agents': this.showAgents(); break;
      case 'btw': {
        const q = args.join(' ');
        if (!q) { logger.error('Uso: /btw <pergunta>'); break; }
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
  ${chalk.hex('#ADFF2F')('/auth')}  provider    ${chalk.hex('#ADFF2F')('/usage')}  tokens   ${chalk.hex('#ADFF2F')('/plan')}  toggle
  ${chalk.hex('#ADFF2F')('/task <t>')}  add    ${chalk.hex('#ADFF2F')('/task done <id>')}     ${chalk.hex('#ADFF2F')('/task rm <id>')}
  ${chalk.hex('#ADFF2F')('/commit <m>')}       ${chalk.hex('#ADFF2F')('/diff')}            ${chalk.hex('#ADFF2F')('/log')}  ${chalk.hex('#ADFF2F')('/status')}
  ${chalk.hex('#ADFF2F')('/agent <p>')}  bg    ${chalk.hex('#ADFF2F')('/agents')}           ${chalk.hex('#ADFF2F')('/btw <q>')}  quick
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
    const cols = process.stdout.columns || 80;
    const sep = chalk.hex('#003B00')('─'.repeat(cols));
    const current = this.service.provider;
    const currentModel = this.service.modelName;

    console.log(`\n${sep}`);
    console.log(chalk.hex('#00FF41').bold('  PROVIDER & AUTH'));
    console.log(`  Atual: ${chalk.hex('#ADFF2F').bold(current)} / ${chalk.hex('#ADFF2F').bold(currentModel)}`);
    console.log(sep);

    // Lista providers
    PROVIDERS.forEach((p, i) => {
      const active = p.id === current ? chalk.hex('#ADFF2F')(' <-- ativo') : '';
      const hasKey = process.env[p.envKey] ? chalk.hex('#00FF41')(' [key ok]') : chalk.hex('#005500')(' [sem key]');
      console.log(`  ${chalk.hex('#008F11')(`${i + 1})`)} ${chalk.hex('#ADFF2F')(p.name)}${hasKey}${active}`);
    });
    console.log(`  ${chalk.hex('#008F11')('0)')} ${chalk.hex('#005500')('Cancelar')}\n`);

    const providerChoice = await ask(chalk.hex('#008F11')('Provider: '));
    const idx = parseInt(providerChoice) - 1;
    if (idx < 0 || idx >= PROVIDERS.length) return;

    const provider = PROVIDERS[idx]!;

    // Se é custom, pede base URL
    let baseURL = provider.baseURL;
    if (provider.id === 'custom') {
      baseURL = await ask(chalk.hex('#008F11')('Base URL (OpenAI-compatible): '));
      if (!baseURL) return;
    }

    // Checa se já tem key
    const existingKey = process.env[provider.envKey];
    let apiKey = existingKey || '';

    if (existingKey) {
      const masked = existingKey.substring(0, 8) + '...' + existingKey.substring(existingKey.length - 4);
      console.log(chalk.hex('#008F11')(`\n  Key atual: ${masked}`));
      const changeKey = await ask(chalk.hex('#008F11')('Trocar key? (y/N): '));
      if (changeKey.toLowerCase() === 'y') {
        apiKey = await ask(chalk.hex('#008F11')('Nova API Key: '));
      }
    } else {
      apiKey = await ask(chalk.hex('#008F11')(`${provider.name} API Key: `));
    }

    if (!apiKey || apiKey.length < 5) {
      logger.error('Key inválida.');
      return;
    }

    // Escolhe modelo
    let model = '';
    if (provider.models.length > 0) {
      console.log(chalk.hex('#00FF41')('\n  Modelos:'));
      provider.models.forEach((m, i) => {
        console.log(`  ${chalk.hex('#008F11')(`${i + 1})`)} ${chalk.hex('#ADFF2F')(m.name)} ${chalk.hex('#005500')(`- ${m.description}`)}`);
      });
      console.log(`  ${chalk.hex('#008F11')(`${provider.models.length + 1})`)} ${chalk.hex('#ADFF2F')('Custom')}\n`);

      const modelChoice = await ask(chalk.hex('#008F11')('Modelo: '));
      const mi = parseInt(modelChoice) - 1;
      if (mi >= 0 && mi < provider.models.length) {
        model = provider.models[mi]!.id;
      } else {
        model = await ask(chalk.hex('#008F11')('Nome do modelo: '));
      }
    } else {
      model = await ask(chalk.hex('#008F11')('Nome do modelo: '));
    }

    if (!model) return;

    // Salva e reconecta
    saveConfig({
      provider: provider.id,
      model,
      baseURL,
      apiKey,
      envKey: provider.envKey
    });

    this.service.reconnect(apiKey, baseURL, model, provider.id);
    logger.success(`Conectado: ${provider.name} / ${model}`);
    this.showFooter();
  }

  private showUsage() {
    const s = this.service.sessionUsage;
    const l = this.service.lastUsage;
    const sep = chalk.hex('#003B00')('─'.repeat(process.stdout.columns || 80));
    console.log(`\n${sep}\n${chalk.hex('#00FF41').bold('  TOKEN USAGE')}\n${sep}`);
    console.log(`  Sessão: ${chalk.hex('#ADFF2F').bold(s.totalTokens.toLocaleString())} total (in:${s.promptTokens.toLocaleString()} out:${s.completionTokens.toLocaleString()}) | ${this.service.requestCount} reqs`);
    console.log(`  Última: in:${l.promptTokens.toLocaleString()} out:${l.completionTokens.toLocaleString()} | ${this.service.modelName} | ${this.messages.length} msgs`);
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

  // --- Session Save & Exit ---
  private async saveAndExit() {
    // Salva resumo da sessão para próxima vez
    try {
      if (this.messages.length > 3) {
        const userMsgs = this.messages.filter(m => m.role === 'user').map(m => m.content).slice(-5);
        const summary = userMsgs.join(' | ');
        saveSession(summary.substring(0, 500), process.cwd());
        logger.dim('  Sessão salva.');
      }
    } catch { /* ok */ }
    logger.matrix('Goodbye, Mr. Anderson...');
    this.showFooter();
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
          { role: 'system', content: `Sub-agente. Direto e eficiente. cwd: ${process.cwd()}` },
          { role: 'user', content: objective }
        ];
        for (let i = 0; i < 10; i++) {
          const r = await svc.chat(msgs, this.allTools as any);
          msgs.push(r);
          if (!r.tool_calls?.length) return r.content || 'Concluído.';
          // Paralleliza tools do sub-agente
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

  // --- Response Processing com paralelização de tools ---
  private async processResponse() {
    this.spinner.start();

    // Captura Ctrl+C durante execução para abortar tarefa
    const sigintHandler = () => {
      this.abortTask = true;
      this.spinner.stop();
      logger.warn('\n  (Ctrl+C) Abortando tarefa...');
    };
    process.on('SIGINT', sigintHandler);

    try {
      let iterations = 0;
      while (!this.abortTask && iterations++ < 25) {
        // Smart tool selection: na 1a iteração, filtra tools pelo contexto do user
        // Nas iterações seguintes (tool results), manda todas (o LLM pode precisar)
        let toolsToSend: any;
        if (this.planMode) {
          toolsToSend = undefined;
        } else if (iterations === 1) {
          const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');
          toolsToSend = lastUserMsg ? getToolSubset(lastUserMsg.content) : this.allTools;
        } else {
          toolsToSend = this.allTools;
        }

        const response = await this.service.chat(this.messages, toolsToSend);
        this.spinner.stop();
        this.messages.push(response);

        if (response.content) smartOutput(response.content, 'VOIDCODE');
        if (!response.tool_calls?.length) break;

        // --- PARALELIZAÇÃO: executa TODAS as tool calls ao mesmo tempo ---
        const toolCalls = response.tool_calls;

        // Se insane mode, executa tudo em paralelo
        if (this.insaneMode) {
          const startTime = Date.now();

          const results = await Promise.all(toolCalls.map(async (tc: any) => {
            const name = tc.function.name;
            const toolArgs = safeJSONParse(tc.function.arguments);
            logger.tool(name, JSON.stringify(toolArgs));

            // Checa cache primeiro
            const cacheKey = this.toolCache.key(name, toolArgs);
            const cached = this.toolCache.get(cacheKey);
            if (cached) {
              logger.dim(`  ${name} (cache hit)`);
              return { role: 'tool' as const, tool_call_id: tc.id, content: cached };
            }

            const handler = this.allHandlers[name];
            let result = handler ? await handler(toolArgs) : 'Tool não encontrada.';
            result = truncateToolOutput(String(result));

            // Cacheia resultado
            this.toolCache.set(cacheKey, result);

            // Invalida cache se é operação de escrita
            if (['write_file', 'replace_file_content', 'git_commit', 'run_shell_command'].includes(name)) {
              this.toolCache.invalidate();
            }

            return { role: 'tool' as const, tool_call_id: tc.id, content: result };
          }));

          const elapsed = Date.now() - startTime;
          logger.success(`${toolCalls.length} tools em ${elapsed}ms (paralelo)`);
          this.messages.push(...results);
        } else {
          // Modo safe: sequencial com confirmação
          const results = [];
          for (const tc of toolCalls) {
            const name = tc.function.name;
            const toolArgs = safeJSONParse(tc.function.arguments);
            logger.tool(name, JSON.stringify(toolArgs));

            const answer = await ask(chalk.hex('#ADFF2F')(`  Autorizar ${name.toUpperCase()}? (Y/n) `));
            if (answer.toLowerCase() === 'n') {
              results.push({ role: 'tool' as const, tool_call_id: tc.id, content: 'Recusado.' });
              continue;
            }

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

  // --- Compactação inteligente ---
  private async compactHistory() {
    logger.dim('  Compactando...');
    this.spinner.start();

    try {
      const r = await this.service.chat([
        ...this.messages,
        { role: 'user', content: 'Resuma em 3 frases: objetivos, arquivos alterados, estado atual.' }
      ]);
      this.spinner.stop();

      if (r?.content) {
        const sys = this.messages[0];
        // Pega últimas mensagens mas sanitiza para não ter tool órfã
        const tail = this.sanitizeMessages(this.messages.slice(-6));
        this.messages = [sys, { role: 'system', content: `[CTX]: ${r.content}` }, ...tail];
        logger.success('Contexto compactado.');
      }
    } catch { this.spinner.stop(); }
  }

  // Remove mensagens tool órfãs (sem assistant+tool_calls antes)
  private sanitizeMessages(msgs: any[]): any[] {
    const clean: any[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.role === 'tool') {
        // Só inclui se a mensagem anterior é assistant com tool_calls
        const prev = clean[clean.length - 1];
        if (prev?.role === 'assistant' && prev?.tool_calls?.length) {
          clean.push(msg);
        }
        // Senão, descarta
      } else if (msg.role === 'assistant' && msg.tool_calls?.length) {
        // Inclui assistant com tool_calls só se as tools correspondentes estão no tail
        const toolIds = new Set(msg.tool_calls.map((tc: any) => tc.id));
        const hasAllTools = msg.tool_calls.every((tc: any) =>
          msgs.slice(i + 1).some((m: any) => m.role === 'tool' && m.tool_call_id === tc.id)
        );
        if (hasAllTools) {
          clean.push(msg);
        } else {
          // Converte para assistant simples com texto
          if (msg.content) {
            clean.push({ role: 'assistant', content: msg.content });
          }
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
