import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import fg from 'fast-glob';
import axios from 'axios';

// Tool definitions - balanceado entre compacto e claro pro LLM
const t = (name: string, desc: string, params: Record<string, any>, required?: string[]) => ({
  type: 'function' as const,
  function: { name, description: desc, parameters: { type: 'object', properties: params, ...(required ? { required } : {}) } }
});

export const tools = [
  t('list_directory', 'Lista arquivos e pastas de um diretório', { path: { type: 'string', description: 'Diretório (default: .)' } }),
  t('file_info', 'Retorna linhas e tamanho de um arquivo sem ler o conteúdo', { path: { type: 'string' } }, ['path']),
  t('read_file', 'Lê conteúdo completo de um arquivo com linhas numeradas', { path: { type: 'string' } }, ['path']),
  t('read_file_lines', 'Lê um range de linhas de um arquivo', { path: { type: 'string' }, start: { type: 'number', description: 'Linha inicial' }, end: { type: 'number', description: 'Linha final' } }, ['path', 'start', 'end']),
  t('write_file', 'Cria ou sobrescreve um arquivo', { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']),
  t('replace_file_content', 'Substitui uma string em um arquivo existente', { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, ['path', 'old_string', 'new_string']),
  t('patch_file', 'Substitui linhas por número em um arquivo', { path: { type: 'string' }, line_start: { type: 'number' }, line_end: { type: 'number' }, new_content: { type: 'string' } }, ['path', 'line_start', 'line_end', 'new_content']),
  t('grep_search', 'Busca regex nos arquivos com ripgrep', { pattern: { type: 'string' }, path: { type: 'string', description: 'Diretório (default: .)' } }, ['pattern']),
  t('glob_files', 'Busca arquivos por padrão glob', { pattern: { type: 'string', description: 'Ex: **/*.ts' }, path: { type: 'string' } }, ['pattern']),
  t('run_shell_command', 'Executa comando shell. Use background:true para servidores que ficam rodando', { command: { type: 'string' }, background: { type: 'boolean', description: 'true para processos long-running' } }, ['command']),
  t('spawn_sub_agent', 'Cria sub-agente para executar tarefa em paralelo', { objective: { type: 'string' } }, ['objective']),
  t('memory_read', 'Lê memória persistente entre sessões', {}),
  t('memory_write', 'Salva na memória persistente', { key: { type: 'string' }, content: { type: 'string' }, category: { type: 'string', description: 'user, project ou feedback' } }, ['key', 'content']),
  t('git_status', 'Mostra status do repositório git', {}),
  t('git_diff', 'Mostra diff das mudanças', { staged: { type: 'boolean' }, file: { type: 'string' } }),
  t('git_log', 'Mostra commits recentes', { count: { type: 'number', description: 'Quantidade (default: 10)' } }),
  t('git_commit', 'Faz git add e commit', { message: { type: 'string' }, files: { type: 'string', description: 'Arquivos (default: .)' } }, ['message']),
  t('web_fetch', 'Faz HTTP GET em uma URL e retorna o conteúdo', { url: { type: 'string' }, extract_text: { type: 'boolean', description: 'true para extrair texto de HTML' } }, ['url']),
];

// --- Smart Tool Selection ---
// Core mínimo: 4 tools (~200 tokens). Expande conforme contexto.
export function getToolSubset(userMessage: string): any[] {
  // Sempre: core mínimo
  const selected = new Set(['list_directory', 'read_file', 'write_file', 'run_shell_command']);

  // Edição de código mencionada ou implícita
  if (/\b(edit|alter|mud|troc|fix|corrig|refator|patch|substituir|replace|modific)\b/i.test(userMessage)) {
    ['file_info', 'read_file_lines', 'patch_file', 'replace_file_content', 'grep_search'].forEach(t => selected.add(t));
  }

  // Criação de projeto / múltiplos arquivos
  if (/\b(cri|gerar|projeto|app|dashboard|server|api|build|instalar|npm|setup)\b/i.test(userMessage)) {
    ['glob_files', 'file_info'].forEach(t => selected.add(t));
  }

  // Busca
  if (/\b(busc|procur|search|find|grep|onde|qual arquivo)\b/i.test(userMessage)) {
    ['grep_search', 'glob_files'].forEach(t => selected.add(t));
  }

  // Git
  if (/\b(git|commit|push|pull|branch|merge|diff|log|status|deploy)\b/i.test(userMessage)) {
    ['git_status', 'git_diff', 'git_log', 'git_commit'].forEach(t => selected.add(t));
  }

  // Web
  if (/\b(http|url|fetch|buscar|pesquis|site|api|web|download|link)\b/i.test(userMessage)) {
    selected.add('web_fetch');
  }

  // Memória
  if (/\b(lembr|memori|memór|salvar|guardar|remember)\b/i.test(userMessage)) {
    ['memory_read', 'memory_write'].forEach(t => selected.add(t));
  }

  // Agente
  if (/\b(agent|paralel|background|delegar)\b/i.test(userMessage)) {
    selected.add('spawn_sub_agent');
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

function shell(cmd: string, timeout = 15000): string {
  try {
    let output = execSync(cmd, { encoding: 'utf-8', timeout, maxBuffer: 1024 * 1024 * 5 });
    // Limita output de shell pra não estourar contexto
    if (output.length > 4000) {
      output = output.substring(0, 2000) + `\n... [${output.length - 3000} chars ocultos] ...\n` + output.substring(output.length - 1000);
    }
    return output;
  } catch (e: any) {
    const err = e.stderr || e.stdout || e.message;
    // Limita erro também
    return err.length > 2000 ? err.substring(0, 1000) + '\n... [truncado] ...\n' + err.substring(err.length - 500) : err;
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
      if (lines.length > 100) {
        return `[${lines.length} linhas. Use read_file_lines para ver parte específica]\n` +
          lines.slice(0, 30).map((l, i) => `${i + 1}: ${l}`).join('\n') +
          `\n... [${lines.length - 50} linhas ocultas] ...\n` +
          lines.slice(-20).map((l, i) => `${lines.length - 20 + i + 1}: ${l}`).join('\n');
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
      if (files.length === 0) return 'Vazia';
      // Retorna compacto: key=valor (max 100 chars por entry, max 2000 total)
      const entries: string[] = [];
      let totalLen = 0;
      for (const file of files) {
        const raw = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf-8');
        try {
          const data = JSON.parse(raw);
          const entry = `${data.key}: ${data.content}`.substring(0, 100);
          if (totalLen + entry.length > 2000) break;
          entries.push(entry);
          totalLen += entry.length;
        } catch { /* skip */ }
      }
      return entries.join('\n');
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

      if (body.length > 5000) {
        body = body.substring(0, 5000) + '\n... [truncado]';
      }

      return `[${response.status}] ${url}\n\n${body}`;
    } catch (e: any) {
      return `Erro ao acessar ${url}: ${e.message}`;
    }
  }
};
