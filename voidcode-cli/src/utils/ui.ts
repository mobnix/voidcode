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

export const logger = {
  info: (msg: string) => console.log(chalk.hex(matrixColors.mediumGreen)(`[SYS] `) + chalk.hex(matrixColors.green)(msg)),
  success: (msg: string) => console.log(chalk.hex(matrixColors.brightGreen).bold(`  ${msg}`)),
  error: (msg: string) => console.log(chalk.red.bold(`  ${msg}`)),
  matrix: (msg: string) => console.log(matrixGradient(msg)),
  warn: (msg: string) => console.log(chalk.yellow(`  ${msg}`)),
  dim: (msg: string) => console.log(chalk.hex(matrixColors.dim)(msg)),
  glitch: (msg: string) => {
    const colors = [chalk.hex('#00FF41'), chalk.hex('#ADFF2F'), chalk.hex('#008F11')];
    const glitched = msg.split('').map(char => colors[Math.floor(Math.random() * colors.length)]!(char)).join('');
    console.log(glitched);
  },
  tool: (name: string, args: string) => {
    console.log(chalk.hex(matrixColors.darkGreen)('  ┌── ') + chalk.hex(matrixColors.brightGreen).bold(`[${name.toUpperCase()}]`));
    // Trunca args se muito longo
    const truncatedArgs = args.length > 200 ? args.substring(0, 200) + '...' : args;
    console.log(chalk.hex(matrixColors.darkGreen)(`  │   ${truncatedArgs}`));
    console.log(chalk.hex(matrixColors.darkGreen)('  └─────────────────────────────'));
  }
};

// Smart text output - trunca conteúdo longo no terminal
const MAX_OUTPUT_LINES = 50;
const COLLAPSE_THRESHOLD = 60;

export function smartOutput(text: string, label: string = 'VOIDCODE'): void {
  const lines = text.split('\n');
  const prefix = chalk.hex('#00FF41').bold(`${label} > `);

  if (lines.length <= COLLAPSE_THRESHOLD) {
    console.log('\n' + prefix + text + '\n');
    return;
  }

  // Mostra primeiras e últimas linhas com indicador
  const headLines = lines.slice(0, MAX_OUTPUT_LINES / 2);
  const tailLines = lines.slice(-(MAX_OUTPUT_LINES / 2));
  const hidden = lines.length - MAX_OUTPUT_LINES;

  console.log('\n' + prefix);
  console.log(headLines.join('\n'));
  console.log(chalk.hex(matrixColors.dim)(`\n  ... [${hidden} linhas ocultas] ...\n`));
  console.log(tailLines.join('\n'));
  console.log();
}

// Trunca output de ferramentas para não poluir contexto do LLM
const MAX_TOOL_OUTPUT_CHARS = 15000;

export function truncateToolOutput(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT_CHARS) return output;
  const half = Math.floor(MAX_TOOL_OUTPUT_CHARS / 2);
  return output.substring(0, half)
    + `\n\n... [TRUNCADO: ${output.length - MAX_TOOL_OUTPUT_CHARS} caracteres ocultos] ...\n\n`
    + output.substring(output.length - half);
}

// Footer / Status bar
export function renderFooter(opts: {
  model: string;
  mode: string;
  tokens: TokenUsage;
  requests: number;
  cwd: string;
  messagesCount: number;
}): void {
  const cols = process.stdout.columns || 80;
  const sep = chalk.hex(matrixColors.darkGreen)('─'.repeat(cols));

  const left = [
    chalk.hex(matrixColors.dim)(`  ${opts.model}`),
    chalk.hex(matrixColors.dim)(`${opts.mode}`),
    chalk.hex(matrixColors.dim)(`msgs:${opts.messagesCount}`),
  ].join(chalk.hex(matrixColors.darkGreen)(' | '));

  const right = [
    chalk.hex(matrixColors.dim)(`in:${formatTokens(opts.tokens.promptTokens)}`),
    chalk.hex(matrixColors.dim)(`out:${formatTokens(opts.tokens.completionTokens)}`),
    chalk.hex(matrixColors.dim)(`total:${formatTokens(opts.tokens.totalTokens)}`),
    chalk.hex(matrixColors.dim)(`reqs:${opts.requests}`),
  ].join(chalk.hex(matrixColors.darkGreen)(' | '));

  const cwdLine = chalk.hex(matrixColors.dim)(`  cwd: ${shortenPath(opts.cwd)}`);

  const hints = chalk.hex(matrixColors.dim)('  /help  /usage  /plan  /exit  Ctrl+C: interromper  Ctrl+D 2x: sair');

  console.log(sep);
  console.log(left + '  ' + right);
  console.log(cwdLine);
  console.log(hints);
  console.log(sep);
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

export const splashScreen = () => {
  console.clear();
  const title = `
   ██╗   ██╗ ██████╗ ██╗██████╗  ██████╗ ██████╗ ██████╗ ███████╗
   ██║   ██║██╔═══██╗██║██╔══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝
   ██║   ██║██║   ██║██║██║  ██║██║     ██║   ██║██║  ██║█████╗
   ╚██╗ ██╔╝██║   ██║██║██║  ██║██║     ██║   ██║██║  ██║██╔══╝
    ╚████╔╝ ╚██████╔╝██║██████╔╝╚██████╗╚██████╔╝██████╔╝███████╗
     ╚═══╝   ╚═════╝ ╚═╝╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
  `;
  console.log(matrixGradient(title));
  console.log(chalk.hex(matrixColors.mediumGreen).italic('   "Free your mind... the DeepSeek Matrix is everywhere."'));
  console.log(chalk.hex(matrixColors.darkGreen)('   -----------------------------------------------------------'));
  console.log(chalk.hex(matrixColors.green)(`   SYSTEM_STATUS: `) + chalk.hex(matrixColors.brightGreen).bold('ONLINE'));
  console.log(chalk.hex(matrixColors.green)(`   ENCRYPTION:    `) + chalk.hex(matrixColors.brightGreen).bold('AES-256-VOID'));
  console.log(chalk.hex(matrixColors.darkGreen)('   -----------------------------------------------------------\n'));
};
