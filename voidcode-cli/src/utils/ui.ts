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
export const hackerGradient = gradient(['#008F11', '#ADFF2F', '#00FF41']);
const voidGradient = gradient(['#00FF41', '#008F11', '#ADFF2F', '#00FF41']);

export const logger = {
  info: (msg: string) => console.log(chalk.hex(matrixColors.mediumGreen)('  ◈ ') + chalk.hex(matrixColors.green)(msg)),
  success: (msg: string) => console.log(chalk.hex(matrixColors.brightGreen).bold('  ✔ ') + chalk.hex(matrixColors.brightGreen)(msg)),
  error: (msg: string) => console.log(chalk.red.bold('  ✘ ') + chalk.red(msg)),
  matrix: (msg: string) => console.log(matrixGradient(msg)),
  warn: (msg: string) => console.log(chalk.yellow('  ⚠ ') + chalk.yellow(msg)),
  dim: (msg: string) => console.log(chalk.hex(matrixColors.dim)(msg)),
  glitch: (msg: string) => {
    const colors = [chalk.hex('#00FF41'), chalk.hex('#ADFF2F'), chalk.hex('#008F11')];
    const glitched = msg.split('').map(char => colors[Math.floor(Math.random() * colors.length)]!(char)).join('');
    console.log(glitched);
  },
  tool: (name: string, args: string) => {
    const truncatedArgs = args.length > 150 ? args.substring(0, 150) + chalk.hex(matrixColors.dim)('...') : args;
    console.log(
      chalk.hex(matrixColors.darkGreen)('  ┌─') +
      chalk.hex(matrixColors.brightGreen).bold(` ⚡ ${name.toUpperCase()} `) +
      chalk.hex(matrixColors.darkGreen)('─'.repeat(Math.max(0, 40 - name.length)))
    );
    console.log(chalk.hex(matrixColors.darkGreen)('  │ ') + chalk.hex(matrixColors.dim)(truncatedArgs));
    console.log(chalk.hex(matrixColors.darkGreen)('  └' + '─'.repeat(44)));
  }
};

// --- Progress Bar ASCII ---
export function progressBar(current: number, total: number, width = 30): string {
  const pct = Math.min(1, current / total);
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar =
    chalk.hex(matrixColors.brightGreen)('█'.repeat(filled)) +
    chalk.hex(matrixColors.darkGreen)('░'.repeat(empty));
  const pctStr = chalk.hex(matrixColors.green)(`${Math.round(pct * 100)}%`);
  return `  ${bar} ${pctStr} (${current}/${total})`;
}

// Progress bar para tool execution
export function toolProgress(current: number, total: number, name: string): void {
  const pct = Math.min(1, current / total);
  const width = 25;
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar =
    chalk.hex(matrixColors.brightGreen)('█'.repeat(filled)) +
    chalk.hex(matrixColors.darkGreen)('░'.repeat(empty));
  process.stdout.write(
    `\r  ${bar} ${chalk.hex(matrixColors.green)(`${current}/${total}`)} ${chalk.hex(matrixColors.dim)(name)}`
  );
  if (current === total) process.stdout.write('\n');
}

// --- Smart text output ---
const MAX_OUTPUT_LINES = 50;
const COLLAPSE_THRESHOLD = 60;

export function smartOutput(text: string, label: string = 'VOIDCODE'): void {
  const lines = text.split('\n');
  const prefix = chalk.hex('#00FF41').bold(`${label} ▸ `);

  if (lines.length <= COLLAPSE_THRESHOLD) {
    console.log('\n' + prefix + text + '\n');
    return;
  }

  const headLines = lines.slice(0, MAX_OUTPUT_LINES / 2);
  const tailLines = lines.slice(-(MAX_OUTPUT_LINES / 2));
  const hidden = lines.length - MAX_OUTPUT_LINES;

  console.log('\n' + prefix);
  console.log(headLines.join('\n'));
  console.log(chalk.hex(matrixColors.dim)(`\n  ⋯ [${hidden} linhas ocultas] ⋯\n`));
  console.log(tailLines.join('\n'));
  console.log();
}

const MAX_TOOL_OUTPUT_CHARS = 15000;

export function truncateToolOutput(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT_CHARS) return output;
  const half = Math.floor(MAX_TOOL_OUTPUT_CHARS / 2);
  return output.substring(0, half)
    + `\n\n⋯ [TRUNCADO: ${output.length - MAX_TOOL_OUTPUT_CHARS} chars] ⋯\n\n`
    + output.substring(output.length - half);
}

// --- Footer ---
export function initFixedFooter() { /* noop */ }
export function destroyFixedFooter() { /* noop */ }

export function renderFooter(opts: {
  model: string;
  mode: string;
  tokens: TokenUsage;
  requests: number;
  cwd: string;
  messagesCount: number;
}): void {
  const cols = process.stdout.columns || 80;

  // Box drawing footer
  const top = chalk.hex(matrixColors.darkGreen)('  ╔' + '═'.repeat(cols - 4) + '╗');
  const bot = chalk.hex(matrixColors.darkGreen)('  ╚' + '═'.repeat(cols - 4) + '╝');
  const pipe = chalk.hex(matrixColors.darkGreen)('║');

  const info = [
    chalk.hex(matrixColors.green)(`⚡ ${opts.model}`),
    chalk.hex(matrixColors.brightGreen).bold(opts.mode),
    chalk.hex(matrixColors.dim)(`msgs:${opts.messagesCount}`),
    chalk.hex(matrixColors.dim)(`⬆${formatTokens(opts.tokens.promptTokens)}`),
    chalk.hex(matrixColors.dim)(`⬇${formatTokens(opts.tokens.completionTokens)}`),
    chalk.hex(matrixColors.dim)(`Σ${formatTokens(opts.tokens.totalTokens)}`),
    chalk.hex(matrixColors.dim)(`#${opts.requests}`),
  ].join(chalk.hex(matrixColors.darkGreen)(' │ '));

  const hints = chalk.hex(matrixColors.dim)(`📂 ${shortenPath(opts.cwd)}`) +
    chalk.hex(matrixColors.darkGreen)('  ') +
    chalk.hex(matrixColors.dim)('/menu /help /plan /exit');

  console.log(top);
  console.log(`  ${pipe} ${info}`);
  console.log(`  ${pipe} ${hints}`);
  console.log(bot);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function shortenPath(p: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && p.startsWith(home)) return '~' + p.slice(home.length);
  return p;
}

// --- Splash Screen ---
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
  const box = (text: string) => chalk.hex(matrixColors.darkGreen)('  ║ ') + text;
  const line = chalk.hex(matrixColors.darkGreen)('  ╠' + '═'.repeat(cols - 4) + '╣');
  const top = chalk.hex(matrixColors.darkGreen)('  ╔' + '═'.repeat(cols - 4) + '╗');
  const bot = chalk.hex(matrixColors.darkGreen)('  ╚' + '═'.repeat(cols - 4) + '╝');

  console.log(top);
  console.log(box(chalk.hex(matrixColors.mediumGreen).italic('"Free your mind... the Matrix is everywhere."')));
  console.log(line);
  console.log(box(chalk.hex(matrixColors.green)('STATUS    ') + chalk.hex(matrixColors.brightGreen).bold('■ ONLINE')));
  console.log(box(chalk.hex(matrixColors.green)('VERSION   ') + chalk.hex(matrixColors.brightGreen)('2.0.0')));
  console.log(box(chalk.hex(matrixColors.green)('ENGINE    ') + chalk.hex(matrixColors.brightGreen)('Multi-LLM (DeepSeek, OpenAI, Qwen, MiniMax)')));
  console.log(box(chalk.hex(matrixColors.green)('ENCRYPT   ') + chalk.hex(matrixColors.brightGreen)('AES-256-VOID')));
  console.log(line);
  console.log(box(chalk.hex(matrixColors.dim)('Created by Mobnix')));
  console.log(bot);
  console.log();
};
