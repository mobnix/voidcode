import fs from 'node:fs';
import path from 'node:path';

// Auto-detecta contexto do projeto no cwd
export function detectProjectContext(): string {
  const cwd = process.cwd();
  const parts: string[] = [];

  const voidcodeMd = findFileUp('VOIDCODE.md', cwd);
  if (voidcodeMd) {
    const content = fs.readFileSync(voidcodeMd, 'utf-8').trim();
    parts.push(`[PROJ]: ${content.substring(0, 500)}`);
  }

  const projectInfo = detectProjectType(cwd);
  if (projectInfo) parts.push(`[STACK]: ${projectInfo}`);

  const gitInfo = detectGit(cwd);
  if (gitInfo) parts.push(`[GIT]: ${gitInfo}`);

  // Índice do projeto - mapa de todos os arquivos
  const index = generateProjectIndex(cwd);
  if (index) parts.push(`[INDEX]:\n${index}`);

  return parts.join('\n');
}

// Gera índice compacto: árvore de arquivos com tamanho
// O LLM já sabe tudo que existe sem precisar chamar list_directory/read_file
function generateProjectIndex(cwd: string): string {
  const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'coverage', '.cache', '.turbo']);
  const MAX_DEPTH = 4;
  const MAX_FILES = 80;
  const files: string[] = [];

  function walk(dir: string, depth: number, prefix: string) {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.') || e.name === '.env.example')
        .filter(e => !IGNORE.has(e.name))
        .sort((a, b) => {
          // Dirs primeiro, depois arquivos
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (const entry of entries) {
        if (files.length >= MAX_FILES) break;
        const fullPath = path.join(dir, entry.name);
        const rel = path.relative(cwd, fullPath);

        if (entry.isDirectory()) {
          files.push(`${prefix}${entry.name}/`);
          walk(fullPath, depth + 1, prefix + '  ');
        } else {
          try {
            const stat = fs.statSync(fullPath);
            const sizeKB = (stat.size / 1024).toFixed(0);
            files.push(`${prefix}${entry.name} (${sizeKB}KB)`);
          } catch {
            files.push(`${prefix}${entry.name}`);
          }
        }
      }
    } catch { /* permission denied etc */ }
  }

  walk(cwd, 0, '');
  if (!files.length) return '';
  return files.join('\n');
}

function findFileUp(filename: string, startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
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

  // Node.js
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

  // Python
  if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
    detections.push('Python');
  }

  // Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) detections.push('Rust');

  // Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) detections.push('Go');

  // Docker
  if (fs.existsSync(path.join(cwd, 'Dockerfile')) || fs.existsSync(path.join(cwd, 'docker-compose.yml'))) {
    detections.push('Docker');
  }

  return detections.join(' + ');
}

function detectGit(cwd: string): string {
  try {
    if (!fs.existsSync(path.join(cwd, '.git'))) {
      // Procura .git subindo
      let dir = cwd;
      let found = false;
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, '.git'))) { found = true; break; }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      if (!found) return '';
    }
    const { execSync } = require('child_process');
    const branch = execSync('git branch --show-current 2>/dev/null', { encoding: 'utf-8', cwd }).trim();
    const status = execSync('git status --short 2>/dev/null', { encoding: 'utf-8', cwd }).trim();
    const changed = status ? status.split('\n').length : 0;
    return `branch: ${branch || 'detached'}, ${changed} arquivo(s) modificado(s)`;
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

  const categories: Record<string, string[]> = {
    user: [],
    project: [],
    feedback: [],
    other: []
  };

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(memDir, file), 'utf-8'));
      const category = data.category || 'other';
      const entry = `- ${data.key}: ${data.content}`;
      if (categories[category]) categories[category]!.push(entry);
      else categories['other']!.push(entry);
    } catch { /* skip */ }
  }

  const parts: string[] = [];
  if (categories.user!.length) parts.push(`Usuário:\n${categories.user!.join('\n')}`);
  if (categories.project!.length) parts.push(`Projeto:\n${categories.project!.join('\n')}`);
  if (categories.feedback!.length) parts.push(`Feedback:\n${categories.feedback!.join('\n')}`);
  if (categories.other!.length) parts.push(`Outros:\n${categories.other!.join('\n')}`);

  return parts.join('\n');
}
