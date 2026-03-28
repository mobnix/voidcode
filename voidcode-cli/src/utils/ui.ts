import chalk from 'chalk';
import gradient from 'gradient-string';

export const matrixColors = {
  brightGreen: '#ADFF2F',
  green: '#00FF41',
  mediumGreen: '#008F11',
  darkGreen: '#003B00',
  black: '#0D0208',
  white: '#FFFFFF'
};

// Gradiente Matrix clássico
export const matrixGradient = gradient(['#003B00', '#008F11', '#00FF41', '#ADFF2F']);
// Gradiente de alerta (Hacker mode)
export const hackerGradient = gradient(['#008F11', '#ADFF2F', '#00FF41']);

export const logger = {
  info: (msg: string) => console.log(chalk.hex(matrixColors.mediumGreen)(`[SYSTEM] `) + chalk.hex(matrixColors.green)(msg)),
  success: (msg: string) => console.log(chalk.hex(matrixColors.brightGreen).bold(`✔ ${msg}`)),
  error: (msg: string) => console.log(chalk.red.bold(`✘ ${msg}`)),
  matrix: (msg: string) => console.log(matrixGradient(msg)),
  glitch: (msg: string) => {
    const colors = [chalk.hex('#00FF41'), chalk.hex('#ADFF2F'), chalk.hex('#008F11')];
    const glitched = msg.split('').map(char => colors[Math.floor(Math.random() * colors.length)](char)).join('');
    console.log(glitched);
  },
  tool: (name: string, args: string) => {
    console.log(chalk.hex(matrixColors.darkGreen)('┌── ') + chalk.hex(matrixColors.brightGreen).bold(`ACCESSING_MODULE: [${name.toUpperCase()}]`));
    console.log(chalk.hex(matrixColors.darkGreen)(`│   PARAMS: ${args}`));
    console.log(chalk.hex(matrixColors.darkGreen)('└───────────────────────────────────'));
  }
};

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
