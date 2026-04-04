import fs from 'node:fs';
import path from 'node:path';

// Cache do contexto — gera uma vez, usa sempre
let _cachedContext: string | null = null;
let _cachedCwd: string | null = null;

// Contexto COMPACTO — só o essencial pro LLM entender o projeto
export function detectProjectContext(): string {
  const cwd = process.cwd();

  // Cache: mesmo cwd = mesmo contexto
  if (_cachedContext && _cachedCwd === cwd) return _cachedContext;

  const parts: string[] = [];

  // VOIDCODE.md — instrução do projeto (máx 300 chars)
  const voidcodeMd = findFileUp('VOIDCODE.md', cwd);
  if (voidcodeMd) {
    const content = fs.readFileSync(voidcodeMd, 'utf-8').trim();
    parts.push(content.substring(0, 300));
  }

  // Stack + Git em uma linha
  const stack = detectProjectType(cwd);
  const git = detectGitCompact(cwd);
  if (stack || git) parts.push([stack, git].filter(Boolean).join(' | '));

  // Index compacto — só top-level + src/ (máx 20 entries)
  const index = generateCompactIndex(cwd);
  if (index) parts.push(index);

  _cachedContext = parts.join('\n');
  _cachedCwd = cwd;
  return _cachedContext;
}

// Index ultra-compacto: top-level dirs + arquivos raiz + src/ depth 1
function generateCompactIndex(cwd: string): string {
  const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'coverage', '.cache', '.turbo', 'legacy', '.docker', 'logs', 'tmp', 'temp']);
  const entries: string[] = [];

  try {
    const items = fs.readdirSync(cwd, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && !IGNORE.has(e.name))
      .sort((a, b) => (a.isDirectory() === b.isDirectory()) ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1);

    for (const item of items.slice(0, 20)) {
      if (item.isDirectory()) {
        // Lista subdiretório depth 1 (só nomes)
        try {
          const sub = fs.readdirSync(path.join(cwd, item.name), { withFileTypes: true })
            .filter(e => !e.name.startsWith('.') && !IGNORE.has(e.name))
            .slice(0, 8)
            .map(e => e.name + (e.isDirectory() ? '/' : ''));
          entries.push(`${item.name}/ [${sub.join(', ')}]`);
        } catch {
          entries.push(`${item.name}/`);
        }
      } else {
        entries.push(item.name);
      }
    }
  } catch { /* ok */ }

  return entries.length ? entries.join('\n') : '';
}

function findFileUp(filename: string, startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) return filePath;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function detectProjectType(cwd: string): string {
  const detections: string[] = [];
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      const stack: string[] = [];
      if (deps.includes('typescript')) stack.push('TS');
      if (deps.includes('react') || deps.includes('next')) stack.push('React');
      if (deps.includes('express') || deps.includes('fastify')) stack.push('Express');
      if (deps.includes('vue')) stack.push('Vue');
      detections.push(`Node(${stack.join(',') || 'JS'})`);
    } catch { detections.push('Node.js'); }
  }
  if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'pyproject.toml'))) detections.push('Python');
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) detections.push('Rust');
  if (fs.existsSync(path.join(cwd, 'go.mod'))) detections.push('Go');
  return detections.join('+');
}

function detectGitCompact(cwd: string): string {
  try {
    const gitDir = findFileUp('.git', cwd);
    if (!gitDir) return '';
    const { execSync } = require('child_process');
    const branch = execSync('git branch --show-current 2>/dev/null', { encoding: 'utf-8', cwd, timeout: 2000 }).trim();
    return branch ? `git:${branch}` : '';
  } catch { return ''; }
}

// Memória estruturada: carrega memória persistente formatada
export function loadStructuredMemory(): string {
  const memDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '~',
    '.voidcode', 'memory'
  );

  if (!fs.existsSync(memDir)) return '';
  const files = fs.readdirSync(memDir).filter(f => f.endsWith('.json'));
  if (!files.length) return '';

  const entries: string[] = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(memDir, file), 'utf-8'));
      entries.push(`${data.category || 'other'}/${data.key}: ${(data.content || '').substring(0, 200)}`);
    } catch { /* skip */ }
  }
  return entries.join('\n');
}
