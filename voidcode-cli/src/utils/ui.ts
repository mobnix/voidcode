import chalk from 'chalk';
import gradient from 'gradient-string';
import type { TokenUsage } from '../core/deepseek.js';

export const matrixColors = {
  brightGreen: '#ADFF2F',
  green: '#00FF41',
  mediumGreen: '#008F11',
  darkGreen: '#003B00',
  black: '#0D0208',
  white: '#FFFFFF',
  dim: '#005500'
};

export const matrixGradient = gradient(['#003B00', '#008F11', '#00FF41', '#ADFF2F']);
const voidGradient = gradient(['#00FF41', '#008F11', '#ADFF2F', '#00FF41']);

// Logger minimalista
export const logger = {
  info: (msg: string) => console.log(chalk.hex(matrixColors.green)(msg)),
  success: (msg: string) => console.log(chalk.hex(matrixColors.brightGreen)(msg)),
  error: (msg: string) => console.log(chalk.red(msg)),
  matrix: (msg: string) => console.log(matrixGradient(msg)),
  warn: (msg: string) => console.log(chalk.yellow(msg)),
  dim: (msg: string) => console.log(chalk.hex(matrixColors.dim)(msg)),
  glitch: (msg: string) => console.log(chalk.hex(matrixColors.brightGreen)(msg)),
  tool: (name: string, args: string) => {
    const short = args.length > 80 ? args.substring(0, 80) + '...' : args;
    console.log(chalk.hex(matrixColors.dim)(`  ${name} ${short}`));
  }
};

// Progress
export function progressBar(current: number, total: number, width = 30): string {
  const pct = Math.min(1, current / total);
  const filled = Math.round(width * pct);
  const bar = chalk.hex(matrixColors.brightGreen)('█'.repeat(filled)) + chalk.hex(matrixColors.darkGreen)('░'.repeat(width - filled));
  return `  ${bar} ${Math.round(pct * 100)}% (${current}/${total})`;
}

export function toolProgress(current: number, total: number, name: string): void {
  process.stdout.write(`\r  ${current}/${total} ${chalk.hex(matrixColors.dim)(name)}`);
  if (current === total) process.stdout.write('\n');
}

// --- Smart Output: recolhe blocos longos ---
const COLLAPSE_AT = 5; // recolhe a partir de 5 linhas

export function smartOutput(text: string, label: string = 'VOIDCODE'): void {
  const prefix = chalk.hex('#00FF41').bold(`${label} > `);

  // Divide em blocos: texto normal, code blocks, listas
  const blocks = splitBlocks(text);
  let output = '\n' + prefix;

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length <= COLLAPSE_AT) {
      output += block;
    } else {
      // Recolhe: mostra 3 primeiras + contagem + 2 últimas
      const head = lines.slice(0, 3).join('\n');
      const tail = lines.slice(-2).join('\n');
      const hidden = lines.length - 5;
      output += head + '\n';
      output += chalk.hex(matrixColors.dim)(`  ── ${hidden} linhas recolhidas ──`) + '\n';
      output += tail;
    }
  }

  console.log(output + '\n');
}

// Separa texto em blocos por code fences e seções
function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current = '';
  let inCode = false;

  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (inCode) {
        current += line + '\n';
        blocks.push(current);
        current = '';
        inCode = false;
      } else {
        if (current) blocks.push(current);
        current = line + '\n';
        inCode = true;
      }
    } else {
      current += line + '\n';
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// Truncate tool output — generous para evitar re-requests
const MAX_TOOL_OUTPUT = 8000;

export function truncateToolOutput(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT) return output;
  const head = 5000;
  const tail = 2000;
  return output.substring(0, head) +
    `\n... [${output.length - head - tail} chars truncados] ...\n` +
    output.substring(output.length - tail);
}

// --- Fixed Footer (5 linhas: título + input + separador + stats + hints) ---
const FOOTER_LINES = 5;
let footerActive = false;
let lastOpts: any = null;

export function initFixedFooter() {
  if (!process.stdout.isTTY) return;
  footerActive = true;
  setupScrollRegion();
  process.stdout.on('resize', () => { if (footerActive) setupScrollRegion(); });
}

function setupScrollRegion() {
  const rows = process.stdout.rows || 24;
  process.stdout.write('\x1b7');
  process.stdout.write(`\x1b[1;${rows - FOOTER_LINES}r`);
  process.stdout.write('\x1b8');
  if (lastOpts) paintFooter(lastOpts);
}

// Posiciona cursor na linha do input (entre título e separador)
export function moveCursorToInput() {
  if (!process.stdout.isTTY || !footerActive) return;
  const rows = process.stdout.rows || 24;
  process.stdout.write(`\x1b[${rows - 3};1H\x1b[2K`);
}

export function destroyFixedFooter() {
  if (!process.stdout.isTTY) return;
  footerActive = false;
  const rows = process.stdout.rows || 24;
  process.stdout.write(`\x1b[1;${rows}r`);
  process.stdout.write(`\x1b[${rows};1H\n`);
}

function paintFooter(opts: any) {
  if (!process.stdout.isTTY) return;
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;

  // Linha 1: título do projeto na barra
  const projectName = opts.projectName || '';
  const title = projectName ? ` ${projectName} ` : '';
  const titleRemaining = Math.max(0, cols - title.length);
  const tLeft = Math.floor(titleRemaining / 2);
  const tRight = titleRemaining - tLeft;
  const titleBar = chalk.hex(matrixColors.darkGreen)('─'.repeat(tLeft)) + chalk.hex(matrixColors.mediumGreen)(title) + chalk.hex(matrixColors.darkGreen)('─'.repeat(tRight));

  // Linha 2: separador
  const sep = chalk.hex(matrixColors.darkGreen)('─'.repeat(cols));

  // Linha 3: stats
  const provCount = opts.activeProviders && opts.activeProviders > 1 ? chalk.hex(matrixColors.dim)(`${opts.activeProviders}x`) : '';
  const parts = [
    provCount,
    chalk.hex(matrixColors.green)(opts.model),
    chalk.hex(matrixColors.brightGreen)(opts.mode),
    chalk.hex(matrixColors.dim)(`${opts.messagesCount} msgs`),
    chalk.hex(matrixColors.dim)(`${fmtT(opts.tokens.totalTokens)} tokens`),
    chalk.hex(matrixColors.dim)(`${opts.requests} reqs`),
  ].filter(Boolean).join(chalk.hex(matrixColors.darkGreen)(' · '));

  // Linha 4: cwd + atalhos
  const cwdStr = shortenPath(opts.cwd);
  const hints = chalk.hex(matrixColors.dim)(`${cwdStr}  ESC pausa · /auth · /help · /exit`);

  process.stdout.write('\x1b7');
  process.stdout.write(`\x1b[${rows - 4};1H\x1b[2K${titleBar}`);
  // rows-3 = linha do input (não limpa, readline controla)
  process.stdout.write(`\x1b[${rows - 2};1H\x1b[2K${sep}`);
  process.stdout.write(`\x1b[${rows - 1};1H\x1b[2K ${parts}`);
  process.stdout.write(`\x1b[${rows};1H\x1b[2K ${hints}`);
  process.stdout.write('\x1b8');
}

export function renderFooter(opts: {
  model: string;
  mode: string;
  tokens: TokenUsage;
  requests: number;
  cwd: string;
  messagesCount: number;
  activeProviders?: number;
  projectName?: string;
}): void {
  lastOpts = opts;
  if (footerActive) {
    paintFooter(opts);
  } else {
    const cols = process.stdout.columns || 80;
    console.log(chalk.hex(matrixColors.darkGreen)('─'.repeat(cols)));
    const parts = [
      chalk.hex(matrixColors.green)(opts.model),
      chalk.hex(matrixColors.brightGreen)(opts.mode),
      chalk.hex(matrixColors.dim)(`${opts.messagesCount} msgs · ${fmtT(opts.tokens.totalTokens)} tokens`),
    ].join(chalk.hex(matrixColors.darkGreen)(' · '));
    console.log(` ${parts}`);
  }
}

function fmtT(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function shortenPath(p: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return (home && p.startsWith(home)) ? '~' + p.slice(home.length) : p;
}

// Splash screen
export const splashScreen = () => {
  console.clear();
  const logo = `
  ██╗   ██╗ ██████╗ ██╗██████╗  ██████╗ ██████╗ ██████╗ ███████╗
  ██║   ██║██╔═══██╗██║██╔══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝
  ██║   ██║██║   ██║██║██║  ██║██║     ██║   ██║██║  ██║█████╗
  ╚██╗ ██╔╝██║   ██║██║██║  ██║██║     ██║   ██║██║  ██║██╔══╝
   ╚████╔╝ ╚██████╔╝██║██████╔╝╚██████╗╚██████╔╝██████╔╝███████╗
    ╚═══╝   ╚═════╝ ╚═╝╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝`;

  console.log(voidGradient(logo));
  console.log();
  const cols = process.stdout.columns || 80;
  const line = chalk.hex(matrixColors.darkGreen)('─'.repeat(cols));
  console.log(line);
  console.log(chalk.hex(matrixColors.dim)(' Multi-LLM Agentic CLI v2.0                                   by Mobnix'));
  console.log(line);
  console.log();
};
