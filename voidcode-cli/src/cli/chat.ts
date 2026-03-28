import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { DeepSeekService } from '../core/deepseek.js';
import { logger, matrixGradient } from '../utils/ui.js';
import { tools, toolHandlers } from '../tools/index.js';

export class ChatLoop {
  private service: DeepSeekService;
  private messages: any[] = [];
  private insaneMode: boolean;
  private spinner = ora({
    text: 'Acessando a rede DeepSeek...',
    color: 'green',
    spinner: 'dots'
  });

  constructor(insaneMode = false) {
    this.service = new DeepSeekService();
    this.insaneMode = insaneMode;
    // System Prompt: Define a personalidade de elite
    this.messages.push({
      role: 'system',
      content: `Você é o VOIDCODE, um engenheiro de software sênior e hacker ético do mundo Matrix. Sua missão é ajudar o usuário a codar com perfeição, seguindo SOLID, Clean Code e TDD. Seja conciso, técnico e use gírias nerds/cyberpunk de forma sutil. Você tem acesso total ao sistema de arquivos do usuário através de ferramentas. ${this.insaneMode ? 'O MODO INSANO ESTÁ ATIVADO: Você pode executar ferramentas sem pedir permissão explícita.' : 'Você SEMPRE deve pedir permissão antes de executar ferramentas que alterem arquivos ou o sistema.'}`
    });
  }

  async start() {
    while (true) {
      const { userInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'userInput',
          message: chalk.hex('#00FF41')('NEO >'),
          prefix: ''
        }
      ]);

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        logger.matrix('Goodbye, Mr. Anderson...');
        process.exit(0);
      }

      if (userInput.startsWith('/')) {
        const [command, ...args] = userInput.slice(1).split(' ');
        if (command === 'create-skill') {
          const { createSkill } = await import('../skills/skill-creator.js');
          await createSkill(args[0] || 'NovaSkill', args.slice(1).join(' ') || 'Descrição padrão');
          continue;
        }
        logger.error(`Comando desconhecido: /${command}`);
        continue;
      }

      this.messages.push({ role: 'user', content: userInput });
      await this.processResponse();
    }
  }

  private async processResponse() {
    this.spinner.start();
    try {
      const response = await this.service.chat(this.messages, tools as any);
      this.spinner.stop();

      this.messages.push(response);

      if (response.content) {
        console.log('\n' + chalk.hex('#00FF41').bold('VOIDCODE > ') + response.content + '\n');
      }

      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolPromises = response.tool_calls.map(async (toolCall) => {
          const name = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          if (!this.insaneMode) {
            const { confirm } = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirm',
              message: chalk.hex('#ADFF2F')(`[REQUEST] Autorizar execução de ${name.toUpperCase()}?`),
              default: true
            }]);
            
            if (!confirm) {
              return { role: 'tool', tool_call_id: toolCall.id, content: 'Usuário recusou a execução.' };
            }
          }

          // Visual Hacker Log
          logger.tool(name, JSON.stringify(args));
          
          if (name === 'spawn_sub_agent') {
            const subChat = new ChatLoop(this.insaneMode);
            subChat.messages.push({ role: 'user', content: `OBJETIVO: ${args.objective}` });
            const result = await subChat.runAutonomously();
            return { role: 'tool', tool_call_id: toolCall.id, content: result };
          }

          const handler = toolHandlers[name];
          const result = handler ? await handler(args) : 'Erro: Ferramenta não encontrada.';
          
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: String(result)
          };
        });

        const results = await Promise.all(toolPromises);
        this.messages.push(...results);
        
        await this.processResponse();
      }
    } catch (error: any) {
      this.spinner.stop();
      logger.error(error.message);
    }
  }

  // Novo método para execução autônoma (usado por sub-agentes)
  public async runAutonomously(): Promise<string> {
    await this.processResponse();
    const lastMessage = this.messages[this.messages.length - 1];
    return lastMessage.content || 'Sub-tarefa concluída.';
  }
}
