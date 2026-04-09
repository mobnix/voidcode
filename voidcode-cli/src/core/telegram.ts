import axios from 'axios';
import chalk from 'chalk';

const POLL_INTERVAL = 2000;

export class TelegramBridge {
  private token: string;
  private baseURL: string;
  private offset = 0;
  private running = false;
  private chatId: string | null = null;
  private onMessage: (text: string) => Promise<string>;
  private silent: boolean;

  constructor(token: string, onMessage: (text: string) => Promise<string>, silent = false) {
    this.token = token;
    this.baseURL = `https://api.telegram.org/bot${token}`;
    this.onMessage = onMessage;
    this.silent = silent;
  }

  async start(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseURL}/getMe`, { timeout: 5000 });
      if (!res.data.ok) return false;
      const botName = res.data.result.username;
      if (!this.silent) {
        process.stderr.write(chalk.hex('#008F11')(`  ✓ Telegram @${botName} conectado (background)\n`));
      }
      this.running = true;
      // Não bloqueia — inicia polling em background
      this.poll().catch(() => {});
      return true;
    } catch (e: any) {
      if (!this.silent) process.stderr.write(chalk.red(`  ✗ Telegram: ${e.message}\n`));
      return false;
    }
  }

  stop() {
    this.running = false;
  }

  get isRunning() { return this.running; }

  private async poll() {
    while (this.running) {
      try {
        const res = await axios.get(`${this.baseURL}/getUpdates`, {
          params: { offset: this.offset, timeout: 20, limit: 10 },
          timeout: 25000
        });

        if (res.data.ok && res.data.result.length > 0) {
          for (const update of res.data.result) {
            this.offset = update.update_id + 1;

            if (update.message?.text) {
              const chatId = update.message.chat.id;
              const text = update.message.text;
              this.chatId = chatId;

              // Comandos internos do Telegram
              if (text === '/start') {
                await this.send(chatId, '🟢 VoidCode conectado.\nEnvie comandos como se estivesse no terminal.\n\n/status — ver status\n/stop — desconectar');
                continue;
              }
              if (text === '/status') {
                await this.send(chatId, `✅ Online\n📂 cwd: ${process.cwd()}`);
                continue;
              }
              if (text === '/stop') {
                await this.send(chatId, '🔴 Bot desconectado.');
                this.stop();
                return;
              }

              // Processa via callback — tudo em background, sem tocar no terminal
              try {
                await this.send(chatId, '⏳ Processando...');
                const response = await this.onMessage(text);
                const chunks = this.splitMessage(response);
                for (const chunk of chunks) {
                  await this.send(chatId, chunk);
                }
              } catch (e: any) {
                await this.send(chatId, `❌ Erro: ${e.message}`);
              }
            }
          }
        }
      } catch (e: any) {
        if (!e.message?.includes('timeout')) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
  }

  private async send(chatId: string | number, text: string) {
    try {
      await axios.post(`${this.baseURL}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      }, { timeout: 10000 });
    } catch {
      try {
        await axios.post(`${this.baseURL}/sendMessage`, {
          chat_id: chatId,
          text
        }, { timeout: 10000 });
      } catch { /* ok */ }
    }
  }

  private splitMessage(text: string): string[] {
    if (text.length <= 4000) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      chunks.push(remaining.substring(0, 4000));
      remaining = remaining.substring(4000);
    }
    return chunks;
  }
}
