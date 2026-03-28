import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import fg from 'fast-glob';
import axios from 'axios';

export const tools = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Lista arquivos e pastas em um diretório.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do diretório (default: .)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_info',
      description: 'Retorna informações de um arquivo SEM ler o conteúdo (tamanho, linhas, tipo). Use antes de decidir se lê o arquivo inteiro ou só parte.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lê o conteúdo COMPLETO de um arquivo com linhas numeradas. Para arquivos grandes, prefira read_file_lines.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Cria ou sobrescreve um arquivo com novo conteúdo.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo.' },
          content: { type: 'string', description: 'Conteúdo completo do arquivo.' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'replace_file_content',
      description: 'Substitui uma string específica dentro de um arquivo existente.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo.' },
          old_string: { type: 'string', description: 'Texto a ser substituído.' },
          new_string: { type: 'string', description: 'Novo texto.' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Pesquisa por um padrão regex nos arquivos (usa ripgrep).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'O padrão regex para buscar.' },
          path: { type: 'string', description: 'Diretório para buscar (default: .)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'glob_files',
      description: 'Busca arquivos por padrão glob (ex: "**/*.ts", "src/**/*.js").',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Padrão glob para buscar arquivos.' },
          path: { type: 'string', description: 'Diretório base (default: .)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_shell_command',
      description: 'Executa um comando shell. Use background:true para servidores e processos que ficam rodando (npm start, node server.js, etc).',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'O comando shell a executar.' },
          background: { type: 'boolean', description: 'Se true, roda em background (para servidores). Default: false.' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'spawn_sub_agent',
      description: 'Cria um sub-agente especializado para resolver uma tarefa específica em paralelo.',
      parameters: {
        type: 'object',
        properties: {
          objective: { type: 'string', description: 'O objetivo detalhado do sub-agente.' }
        },
        required: ['objective']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_read',
      description: 'Lê a memória persistente do agente (contexto de sessões anteriores).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_write',
      description: 'Salva informação na memória persistente. Categorias: user (preferências), project (estado do projeto), feedback (correções do usuário).',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Chave/título da memória.' },
          content: { type: 'string', description: 'Conteúdo a memorizar.' },
          category: { type: 'string', description: 'Categoria: user, project, feedback. Default: other.' }
        },
        required: ['key', 'content']
      }
    }
  },
  // --- Smart File Tools ---
  {
    type: 'function',
    function: {
      name: 'read_file_lines',
      description: 'Lê linhas específicas de um arquivo (mais eficiente que ler o arquivo inteiro). Retorna com números de linha.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo.' },
          start: { type: 'number', description: 'Linha inicial (1-based).' },
          end: { type: 'number', description: 'Linha final (inclusive).' }
        },
        required: ['path', 'start', 'end']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'patch_file',
      description: 'Edita linhas específicas de um arquivo por número de linha. Mais preciso que replace_file_content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo.' },
          line_start: { type: 'number', description: 'Linha inicial a substituir (1-based).' },
          line_end: { type: 'number', description: 'Linha final a substituir (inclusive).' },
          new_content: { type: 'string', description: 'Novo conteúdo para substituir as linhas.' }
        },
        required: ['path', 'line_start', 'line_end', 'new_content']
      }
    }
  },
  // --- Git Tools ---
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Mostra o status do repositório git (arquivos modificados, staged, untracked).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Mostra o diff das mudanças atuais (staged e unstaged).',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: 'Se true, mostra apenas staged changes.' },
          file: { type: 'string', description: 'Arquivo específico para diff (opcional).' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Mostra histórico de commits recentes.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Número de commits (default: 10).' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Faz stage de arquivos e cria um commit.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Mensagem do commit.' },
          files: { type: 'string', description: 'Arquivos para stage (separados por espaço). Use "." para todos.' }
        },
        required: ['message']
      }
    }
  },
  // --- Web Tool ---
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Faz uma requisição HTTP GET para uma URL e retorna o conteúdo (text/html/json).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'A URL para acessar.' },
          extract_text: { type: 'boolean', description: 'Se true, extrai apenas texto de HTML (remove tags).' }
        },
        required: ['url']
      }
    }
  }
];

// --- Smart Tool Selection: retorna subset de tools baseado no contexto ---
// Cada tool definition custa ~100-150 tokens. 15 tools = ~2k tokens por request.
// Filtrando para 8-10 relevantes = economia de ~500-700 tokens/request.
const TOOL_CATEGORIES: Record<string, string[]> = {
  fs: ['list_directory', 'file_info', 'read_file', 'read_file_lines', 'write_file', 'replace_file_content', 'patch_file', 'glob_files', 'grep_search'],
  git: ['git_status', 'git_diff', 'git_log', 'git_commit'],
  system: ['run_shell_command', 'spawn_sub_agent'],
  memory: ['memory_read', 'memory_write'],
  web: ['web_fetch'],
};

export function getToolSubset(userMessage: string): any[] {
  // Sempre inclui: fs + system (core)
  const selected = new Set<string>([...TOOL_CATEGORIES.fs!, ...TOOL_CATEGORIES.system!]);

  // Git: só se mencionou git, commit, branch, merge, diff, etc
  if (/\b(git|commit|push|pull|branch|merge|diff|log|status|deploy)\b/i.test(userMessage)) {
    TOOL_CATEGORIES.git!.forEach(t => selected.add(t));
  }

  // Web: só se mencionou url, http, fetch, buscar, pesquisar, site, api
  if (/\b(http|url|fetch|buscar|pesquisa|site|api|web|download|link)\b/i.test(userMessage)) {
    TOOL_CATEGORIES.web!.forEach(t => selected.add(t));
  }

  // Memory: só se mencionou lembrar, memória, salvar contexto
  if (/\b(lembr|memori|memór|salvar|guardar|remember|context)\b/i.test(userMessage)) {
    TOOL_CATEGORIES.memory!.forEach(t => selected.add(t));
  }

  return tools.filter(t => selected.has(t.function.name));
}

// --- Memória persistente ---
const MEMORY_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.voidcode',
  'memory'
);

function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function shell(cmd: string, timeout = 30000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout, maxBuffer: 1024 * 1024 * 5 });
  } catch (e: any) {
    return e.stderr || e.stdout || e.message;
  }
}

// Escapa string para uso seguro em shell (previne injection)
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// Valida que arquivo não é device/proc/etc
function safePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const blocked = ['/proc', '/sys', '/dev'];
  if (blocked.some(b => resolved.startsWith(b))) {
    throw new Error('Acesso negado a path do sistema.');
  }
  return resolved;
}

// Limita tamanho de leitura (10MB)
const MAX_READ_SIZE = 10 * 1024 * 1024;

export const toolHandlers: Record<string, (args: any) => any> = {
  list_directory: ({ path: dirPath = '.' }) => {
    try {
      const entries = fs.readdirSync(path.resolve(dirPath), { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  file_info: ({ path: filePath }) => {
    try {
      const resolved = safePath(filePath);
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return `Tipo: ${stat.isDirectory() ? 'diretório' : 'outro'}`;
      const content = fs.readFileSync(resolved, 'utf-8');
      const lines = content.split('\n').length;
      const sizeKB = (stat.size / 1024).toFixed(1);
      const ext = path.extname(filePath);
      return `${filePath}: ${lines} linhas, ${sizeKB}KB, tipo: ${ext || 'sem extensão'}`;
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  read_file: ({ path: filePath }) => {
    try {
      const resolved = safePath(filePath);
      const stat = fs.statSync(resolved);
      if (stat.size > MAX_READ_SIZE) return `Erro: Arquivo muito grande (${(stat.size / 1024 / 1024).toFixed(1)}MB, max 10MB). Use read_file_lines.`;
      if (!stat.isFile()) return `Erro: Não é um arquivo regular.`;
      const content = fs.readFileSync(resolved, 'utf-8');
      // Retorna com linhas numeradas para facilitar patch_file
      const lines = content.split('\n');
      if (lines.length > 500) {
        // Arquivo grande: retorna resumo + sugere read_file_lines
        return `[${lines.length} linhas - mostrando primeiras 100 e últimas 50. Use read_file_lines para range específico]\n\n` +
          lines.slice(0, 100).map((l, i) => `${i + 1}: ${l}`).join('\n') +
          `\n\n... [${lines.length - 150} linhas ocultas] ...\n\n` +
          lines.slice(-50).map((l, i) => `${lines.length - 50 + i + 1}: ${l}`).join('\n');
      }
      return lines.map((l, i) => `${i + 1}: ${l}`).join('\n');
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  write_file: ({ path: filePath, content }) => {
    try {
      const fullPath = safePath(filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
      return `Arquivo ${filePath} gravado com sucesso.`;
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  replace_file_content: ({ path: filePath, old_string, new_string }) => {
    try {
      const fullPath = safePath(filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (!content.includes(old_string)) {
        return `Erro: String original não encontrada no arquivo.`;
      }
      fs.writeFileSync(fullPath, content.replace(old_string, new_string));
      return `Substituição realizada em ${filePath}.`;
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  run_shell_command: ({ command, background = false }) => {
    if (background) {
      return new Promise<string>((resolve) => {
        try {
          const child = spawn('bash', ['-c', command], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';
          let exited = false;

          child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
          child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

          // Se o processo morrer antes dos 3s = erro
          child.on('exit', (code) => {
            exited = true;
            if (code !== 0) {
              resolve(`ERRO: Processo morreu com código ${code}.\nstdout: ${stdout}\nstderr: ${stderr}`);
            }
          });

          child.on('error', (err) => {
            exited = true;
            resolve(`ERRO ao iniciar: ${err.message}`);
          });

          // Espera 3s para confirmar que está vivo
          setTimeout(() => {
            if (exited) return; // Já resolveu no exit handler
            child.unref();

            // Tenta detectar porta no comando para verificar
            const portMatch = command.match(/(\d{4,5})/);
            if (portMatch) {
              const port = portMatch[1];
              try {
                execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port} 2>/dev/null`, {
                  encoding: 'utf-8', timeout: 2000
                });
                resolve(`Servidor rodando em background (PID: ${child.pid}).\nhttp://localhost:${port} respondendo.\n${stdout ? 'Output: ' + stdout.substring(0, 300) : ''}`);
              } catch {
                resolve(`Processo iniciado em background (PID: ${child.pid}).\nPorta ${port} ainda não respondeu (pode estar iniciando).\n${stdout ? 'Output: ' + stdout.substring(0, 300) : ''}`);
              }
            } else {
              resolve(`Processo em background (PID: ${child.pid}).\n${stdout ? 'Output: ' + stdout.substring(0, 300) : '(sem output ainda)'}`);
            }
          }, 3000);

        } catch (e: any) {
          resolve(`ERRO: ${e.message}`);
        }
      });
    }
    return shell(command) || 'Comando executado (sem output).';
  },

  grep_search: ({ pattern, path: dirPath = '.' }) => {
    const result = shell(`rg --vimgrep ${shellEscape(pattern)} ${shellEscape(path.resolve(dirPath))}`);
    return result || 'Nenhum resultado encontrado.';
  },

  glob_files: async ({ pattern, path: dirPath = '.' }) => {
    try {
      const files = await fg(pattern, { cwd: path.resolve(dirPath), dot: false });
      return files.length > 0 ? files.join('\n') : 'Nenhum arquivo encontrado.';
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  spawn_sub_agent: async ({ objective }) => {
    try {
      const { ChatLoop } = await import('../cli/chat.js');
      const agent = new ChatLoop(true);
      (agent as any).messages.push({ role: 'user', content: objective });
      return await agent.runAutonomously();
    } catch (e: any) {
      return `Erro no sub-agente: ${e.message}`;
    }
  },

  memory_read: () => {
    try {
      ensureMemoryDir();
      const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
      if (files.length === 0) return 'Memória vazia. Nenhuma informação salva ainda.';
      const memories: Record<string, string> = {};
      for (const file of files) {
        const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf-8');
        const key = file.replace('.json', '');
        try { memories[key] = JSON.parse(content).content; } catch { memories[key] = content; }
      }
      return JSON.stringify(memories, null, 2);
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  memory_write: ({ key, content, category = 'other' }) => {
    try {
      ensureMemoryDir();
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      fs.writeFileSync(
        path.join(MEMORY_DIR, `${sanitizedKey}.json`),
        JSON.stringify({ key, content, category, updatedAt: new Date().toISOString() }, null, 2)
      );
      return `Memória "${key}" [${category}] salva.`;
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  // --- Smart File ---
  read_file_lines: ({ path: filePath, start, end }) => {
    try {
      const lines = fs.readFileSync(safePath(filePath), 'utf-8').split('\n');
      const s = Math.max(1, start) - 1;
      const e = Math.min(lines.length, end);
      return lines.slice(s, e).map((line, i) => `${s + i + 1}: ${line}`).join('\n');
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  patch_file: ({ path: filePath, line_start, line_end, new_content }) => {
    try {
      const fullPath = safePath(filePath);
      const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
      const s = Math.max(1, line_start) - 1;
      const e = Math.min(lines.length, line_end);
      const newLines = new_content.split('\n');
      lines.splice(s, e - s, ...newLines);
      fs.writeFileSync(fullPath, lines.join('\n'));
      return `Linhas ${line_start}-${line_end} substituídas em ${filePath} (${newLines.length} linhas novas).`;
    } catch (e: any) {
      return `Erro: ${e.message}`;
    }
  },

  // --- Git ---
  git_status: () => {
    return shell('git status --short') || 'Working tree limpa.';
  },

  git_diff: ({ staged = false, file = '' }) => {
    const cmd = staged
      ? `git diff --staged ${file}`.trim()
      : `git diff ${file}`.trim();
    return shell(cmd) || 'Nenhuma mudança.';
  },

  git_log: ({ count = 10 }) => {
    const n = Math.max(1, Math.min(parseInt(count) || 10, 100));
    return shell(`git log --oneline --graph -${n}`);
  },

  git_commit: ({ message, files = '.' }) => {
    // Sanitiza files: só permite nomes de arquivo, . e paths relativos
    const safeFiles = files.split(/\s+/).filter((f: string) => /^[\w.\/\-]+$/.test(f)).join(' ') || '.';
    const stageResult = shell(`git add ${safeFiles}`);
    if (stageResult.includes('fatal')) return `Erro no stage: ${stageResult}`;
    const commitResult = shell(`git commit -m ${shellEscape(message)}`);
    return commitResult;
  },

  // --- Web ---
  web_fetch: async ({ url, extract_text = false }) => {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'VoidCode-CLI/1.0' },
        responseType: 'text'
      });
      let body = String(response.data);

      if (extract_text) {
        // Remove scripts, styles, tags HTML
        body = body
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }

      // Limita a 20k chars para não estourar contexto
      if (body.length > 20000) {
        body = body.substring(0, 20000) + '\n\n... [TRUNCADO]';
      }

      return `[${response.status}] ${url}\n\n${body}`;
    } catch (e: any) {
      return `Erro ao acessar ${url}: ${e.message}`;
    }
  }
};
