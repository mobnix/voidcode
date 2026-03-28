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

// Logger minimalista - sem emojis, sem ruído
export const logger = {
  info: (msg: string) => console.log(chalk.hex(matrixColors.green)(msg)),
  success: (msg: string) => console.log(chalk.hex(matrixColors.brightGreen)(msg)),
  error: (msg: string) => console.log(chalk.red(msg)),
  matrix: (msg: string) => console.log(matrixGradient(msg)),
  warn: (msg: string) => console.log(chalk.yellow(msg)),
  dim: (msg: string) => console.log(chalk.hex(matrixColors.dim)(msg)),
  glitch: (msg: string) => console.log(chalk.hex(matrixColors.brightGreen)(msg)),
  tool: (name: string, args: string) => {
    const short = args.length > 100 ? args.substring(0, 100) + '...' : args;
    console.log(chalk.hex(matrixColors.dim)(`  ${name} ${short}`));
  }
};

// Progress bar
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

// Output de texto do LLM
const COLLAPSE_THRESHOLD = 60;

export function smartOutput(text: string, label: string = 'VOIDCODE'): void {
  const lines = text.split('\n');

  if (lines.length <= COLLAPSE_THRESHOLD) {
    console.log('\n' + chalk.hex('#00FF41').bold(`${label} > `) + text + '\n');
    return;
  }

  const head = lines.slice(0, 25);
  const tail = lines.slice(-25);
  const hidden = lines.length - 50;

  console.log('\n' + chalk.hex('#00FF41').bold(`${label} >`));
  console.log(head.join('\n'));
  console.log(chalk.hex(matrixColors.dim)(`  ... ${hidden} linhas ocultas ...`));
  console.log(tail.join('\n') + '\n');
}

const MAX_TOOL_OUTPUT = 3000; // 3k chars max por tool result (~750 tokens)

export function truncateToolOutput(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT) return output;
  const head = 1500;
  const tail = 1000;
  return output.substring(0, head) +
    `\n... [${output.length - head - tail} chars ocultos] ...\n` +
    output.substring(output.length - tail);
}

// Footer fixo nas 2 últimas linhas via scroll region
const FOOTER_LINES = 2;
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
  // Scroll region: linhas 1 até (rows - 2). Footer fica fora.
  process.stdout.write(`\x1b[1;${rows - FOOTER_LINES}r`);
  if (lastOpts) paintFooter(lastOpts);
}

export function destroyFixedFooter() {
  if (!process.stdout.isTTY) return;
  footerActive = false;
  const rows = process.stdout.rows || 24;
  process.stdout.write(`\x1b[1;${rows}r`); // reset scroll region
  process.stdout.write(`\x1b[${rows};1H\n`);
}

function paintFooter(opts: any) {
  if (!process.stdout.isTTY) return;
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;

  const parts = [
    chalk.hex(matrixColors.green)(opts.model),
    chalk.hex(matrixColors.brightGreen)(opts.mode),
    chalk.hex(matrixColors.dim)(`msgs:${opts.messagesCount}`),
    chalk.hex(matrixColors.dim)(`in:${fmtT(opts.tokens.promptTokens)}`),
    chalk.hex(matrixColors.dim)(`out:${fmtT(opts.tokens.completionTokens)}`),
    chalk.hex(matrixColors.dim)(`total:${fmtT(opts.tokens.totalTokens)}`),
    chalk.hex(matrixColors.dim)(`reqs:${opts.requests}`),
  ].join(chalk.hex(matrixColors.darkGreen)(' | '));

  const hints = chalk.hex(matrixColors.dim)(`${shortenPath(opts.cwd)}  /menu /help /plan /exit`);

  // Salva cursor, pinta nas 2 últimas linhas, restaura cursor
  process.stdout.write('\x1b7');
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
}): void {
  lastOpts = opts;
  if (footerActive) {
    paintFooter(opts);
  } else {
    // Fallback inline se não é TTY
    const cols = process.stdout.columns || 80;
    console.log(chalk.hex(matrixColors.darkGreen)('─'.repeat(cols)));
    const parts = [
      chalk.hex(matrixColors.green)(opts.model),
      chalk.hex(matrixColors.brightGreen)(opts.mode),
      chalk.hex(matrixColors.dim)(`msgs:${opts.messagesCount} total:${fmtT(opts.tokens.totalTokens)}`),
    ].join(chalk.hex(matrixColors.darkGreen)(' | '));
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
