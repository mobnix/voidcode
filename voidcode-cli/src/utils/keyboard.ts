import readline from 'node:readline';
import chalk from 'chalk';

export class KeyboardManager {
  private static instance: KeyboardManager;
  private isListening = false;
  private onEscCallback?: () => void;
  private keypressHandler?: (str: string, key: any) => void;

  private constructor() {}

  static getInstance() {
    if (!KeyboardManager.instance) {
      KeyboardManager.instance = new KeyboardManager();
    }
    return KeyboardManager.instance;
  }

  startListening(onEsc: () => void) {
    if (this.isListening) {
      this.onEscCallback = onEsc;
      return;
    }
    this.onEscCallback = onEsc;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }

    this.keypressHandler = (_str: string, key: any) => {
      if (!key) return;
      // ESC ou Ctrl+C durante execução = interromper
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        if (this.onEscCallback) this.onEscCallback();
      }
      // Ctrl+D = sair sempre
      if (key.ctrl && key.name === 'd') {
        console.log(chalk.hex('#008F11')('\nGoodbye.'));
        process.exit(0);
      }
    };

    process.stdin.on('keypress', this.keypressHandler);
    this.isListening = true;
  }

  stopListening() {
    if (!this.isListening) return;
    if (this.keypressHandler) {
      process.stdin.removeListener('keypress', this.keypressHandler);
      this.keypressHandler = undefined;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    this.isListening = false;
  }

  async pausePrompt(): Promise<'continue' | 'abort' | 'pause'> {
    this.stopListening();

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log(chalk.hex('#ADFF2F')(`
  [1] Continuar
  [2] Abortar Missão
  [3] Pausar (Modo Consultivo)
`));
      rl.question(chalk.hex('#00FF41')('Escolha > '), (answer) => {
        rl.close();
        if (answer === '2') resolve('abort');
        else if (answer === '3') resolve('pause');
        else resolve('continue');
      });
    });
  }
}
