import readline from 'node:readline';

export class KeyboardManager {
  private static instance: KeyboardManager;
  private isListening = false;
  private onEscCallback?: () => void;

  private constructor() {}

  static getInstance() {
    if (!KeyboardManager.instance) {
      KeyboardManager.instance = new KeyboardManager();
    }
    return KeyboardManager.instance;
  }

  startListening(onEsc: () => void) {
    if (this.isListening) return;
    this.onEscCallback = onEsc;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('keypress', (str, key) => {
      if (key.name === 'escape') {
        if (this.onEscCallback) this.onEscCallback();
      }
      // Atalho de segurança padrão
      if (key.ctrl && key.name === 'c') {
        process.exit();
      }
    });

    this.isListening = true;
  }

  stopListening() {
    if (!this.isListening) return;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners('keypress');
    this.isListening = false;
  }

  // Método para pausar a execução e aguardar comando do usuário
  async pausePrompt(): Promise<'continue' | 'abort' | 'pause'> {
    this.stopListening();
    const inquirer = (await import('inquirer')).default;
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'O que deseja fazer?',
        choices: [
          { name: 'Continuar', value: 'continue' },
          { name: 'Abortar Missão', value: 'abort' },
          { name: 'Pausar (Modo Consultivo)', value: 'pause' }
        ]
      }
    ]);
    return action;
  }
}
