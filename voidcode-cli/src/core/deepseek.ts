import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export class DeepSeekService {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    this.model = process.env.LLM_MODEL || 'deepseek-chat';

    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY não encontrada no .env');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL
    });
  }

  async chat(messages: any[], tools?: any[]) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.1, // Temperatura baixa para mais precisão em ferramentas
        stream: false,
        tools: tools,
        tool_choice: tools ? 'auto' : undefined
      });

      return response.choices[0].message;
    } catch (error) {
      throw new Error(`Erro na API DeepSeek: ${(error as any).message}`);
    }
  }

  // Futuro: Stream de resposta para o visual Matrix ser mais fluido
}
