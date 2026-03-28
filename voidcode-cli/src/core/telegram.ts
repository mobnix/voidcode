import axios from 'axios';
import chalk from 'chalk';
import { logger } from '../utils/ui.js';

const POLL_INTERVAL = 2000; // 2s entre polls

export class TelegramBridge {
  private token: string;
  private baseURL: string;
  private offset = 0;
  private running = false;
  private chatId: string | null = null;
  private onMessage: (text: string) => Promise<string>;

  constructor(token: string, onMessage: (text: string) => Promise<string>) {
    this.token = token;
    this.baseURL = `https://api.telegram.org/bot${token}`;
    this.onMessage = onMessage;
  }

  async start(): Promise<boolean> {
    // Verifica se o token é válido
    try {
      const res = await axios.get(`${this.baseURL}/getMe`, { timeout: 5000 });
      if (!res.data.ok) return false;
      const botName = res.data.result.username;
      logger.success(`Telegram bot @${botName} conectado.`);
      logger.info('Envie uma mensagem para o bot no Telegram para começar.');
      this.running = true;
      this.poll();
      return true;
    } catch (e: any) {
      logger.error(`Telegram: ${e.message}`);
      return false;
    }
  }

  stop() {
    this.running = false;
    logger.info('Telegram bot desconectado.');
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
              const from = update.message.from?.first_name || 'User';

              this.chatId = chatId;
              logger.info(`[TG] ${from}: ${text}`);

              // Comandos do Telegram
              if (text === '/start') {
                await this.send(chatId, '🟢 VoidCode conectado. Envie comandos como se estivesse no terminal.');
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

              // Envia para o ChatLoop processar
              try {
                await this.send(chatId, '⏳ Processando...');
                const response = await this.onMessage(text);
                // Telegram tem limite de 4096 chars por mensagem
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
        // Timeout é normal no long polling
        if (!e.message?.includes('timeout')) {
          logger.error(`[TG] Poll error: ${e.message}`);
          await new Promise(r => setTimeout(r, 5000)); // Espera antes de retry
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
      // Tenta sem Markdown se falhar (chars especiais)
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
