import fs from 'node:fs';
import path from 'node:path';

// Auto-detecta contexto do projeto no cwd
export function detectProjectContext(): string {
  const cwd = process.cwd();
  const parts: string[] = [];

  // 1. Carrega VOIDCODE.md do projeto (equivalente ao CLAUDE.md)
  const voidcodeMd = findFileUp('VOIDCODE.md', cwd);
  if (voidcodeMd) {
    const content = fs.readFileSync(voidcodeMd, 'utf-8').trim();
    if (content.length < 2000) {
      parts.push(`[PROJECT INSTRUCTIONS]\n${content}`);
    } else {
      parts.push(`[PROJECT INSTRUCTIONS]\n${content.substring(0, 2000)}...`);
    }
  }

  // 2. Detecta tipo de projeto
  const projectInfo = detectProjectType(cwd);
  if (projectInfo) parts.push(`[PROJECT]: ${projectInfo}`);

  // 3. Git info
  const gitInfo = detectGit(cwd);
  if (gitInfo) parts.push(`[GIT]: ${gitInfo}`);

  return parts.join('\n');
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
      const stack: string[] = [pkg.name || 'node'];
      if (deps.includes('typescript')) stack.push('TypeScript');
      if (deps.includes('react')) stack.push('React');
      if (deps.includes('next')) stack.push('Next.js');
      if (deps.includes('express')) stack.push('Express');
      if (deps.includes('fastify')) stack.push('Fastify');
      if (deps.includes('vue')) stack.push('Vue');
      if (deps.includes('svelte')) stack.push('Svelte');
      detections.push(`Node.js (${stack.join(', ')}) scripts: ${Object.keys(pkg.scripts || {}).join(', ')}`);
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
