import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { DeepSeekService } from '../core/deepseek.js';
import { logger, matrixGradient } from '../utils/ui.js';
import { tools, toolHandlers } from '../tools/index.js';
import { safeJSONParse } from '../utils/json.js';
import { KeyboardManager } from '../utils/keyboard.js';

export class ChatLoop {
  private service: DeepSeekService;
  private messages: any[] = [];
  private insaneMode: boolean;
  private keyboard = KeyboardManager.getInstance();
  private isPaused = false;
  private abortTask = false;
  private readonly MAX_HISTORY_LENGTH = 15;
  private spinner = ora({
    text: 'Acessando a rede DeepSeek...',
    color: 'green',
    spinner: 'dots'
  });

  constructor(insaneMode = false) {
    this.service = new DeepSeekService();
    this.insaneMode = insaneMode;
    this.messages.push({
      role: 'system',
      content: `Você é o VOIDCODE, um engenheiro de software sênior e hacker ético do mundo Matrix. Sua missão é ajudar o usuário a codar com perfeição, seguindo SOLID, Clean Code e TDD. Seja conciso, técnico e use gírias nerds/cyberpunk de forma sutil. Você tem acesso total ao sistema de arquivos do usuário através de ferramentas. ${this.insaneMode ? 'O MODO INSANO ESTÁ ATIVADO: Você pode executar ferramentas sem pedir permissão explícita.' : 'Você SEMPRE deve pedir permissão antes de executar ferramentas que alterem arquivos ou o sistema.'}`
    });
  }

  async start() {
    while (true) {
      if (this.messages.length > this.MAX_HISTORY_LENGTH) {
        await this.compactHistory();
      }

      const { userInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'userInput',
          message: chalk.hex('#00FF41')('NEO >'),
          prefix: ''
        }
      ]);

      if (!userInput) continue;

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        logger.matrix('Goodbye, Mr. Anderson...');
        process.exit(0);
      }

      // Handlers de Comandos
      if (userInput.startsWith('/')) {
        const [command, ...args] = userInput.slice(1).split(' ');
        
        if (command === 'create-skill') {
          const { createSkill } = await import('../skills/skill-creator.js');
          await createSkill(args[0] || 'NovaSkill', args.slice(1).join(' ') || 'Descrição padrão');
          continue;
        }

        if (command === 'agent') {
          const prompt = args.join(' ');
          logger.info(`[AGENT MODE] Iniciando tarefa em background: "${prompt}"`);
          this.messages.push({ role: 'user', content: prompt });
          this.processResponse().catch(err => logger.error(`Erro no Agente: ${err.message}`));
          continue;
        }

        if (command === 'btw') {
          const question = args.join(' ');
          this.messages.push({ role: 'user', content: `[BTW] ${question}` });
          await this.processResponse();
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
    this.keyboard.startListening(async () => {
      this.spinner.stop();
      logger.glitch('\n[INTERRUPÇÃO DETECTADA: ESCAPE]');
      const action = await this.keyboard.pausePrompt();
      
      if (action === 'abort') {
        this.abortTask = true;
        logger.error('Missão Abortada pelo usuário.');
      } else if (action === 'pause') {
        this.isPaused = true;
        logger.info('Sistema em Pausa. Use /btw para tirar dúvidas ou pressione Enter para continuar.');
      } else {
        this.spinner.start();
        this.keyboard.startListening(() => this.handleEscape());
      }
    });

    try {
      while (!this.abortTask) {
        if (this.isPaused) {
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        const response = await this.service.chat(this.messages, tools as any);
        this.spinner.stop();
        this.keyboard.stopListening();

        this.messages.push(response);

        if (response.content) {
          console.log('\n' + chalk.hex('#00FF41').bold('VOIDCODE > ') + response.content + '\n');
        }

        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolPromises = response.tool_calls.map(async (toolCall, index) => {
            const name = toolCall.function.name;
            const args = safeJSONParse(toolCall.function.arguments);

            // Mensagem de Progresso
            this.spinner.text = `[EXECUTANDO ${index + 1}/${response.tool_calls.length}] ${name.toUpperCase()}...`;
            this.spinner.start();

            if (!this.insaneMode) {
              this.spinner.stop();
              const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: chalk.hex('#ADFF2F')(`[REQUEST] Autorizar ${name.toUpperCase()}?`),
                default: true
              }]);
              
              if (!confirm) {
                return { role: 'tool', tool_call_id: toolCall.id, content: 'Usuário recusou a execução.' };
              }
              this.spinner.start();
            }

            logger.tool(name, JSON.stringify(args));
            
            const handler = toolHandlers[name];
            const result = handler ? await handler(args) : 'Erro: Ferramenta não encontrada.';
            
            this.spinner.stop();
            return {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: String(result)
            };
          });

          const results = await Promise.all(toolPromises);
          this.messages.push(...results);
          this.spinner.start();
          this.keyboard.startListening(() => this.handleEscape());
          continue; // Loop de volta para a IA processar os resultados das ferramentas
        }

        break; // Sai se não houver mais chamadas de ferramentas
      }
    } catch (error: any) {
      this.spinner.stop();
      this.keyboard.stopListening();
      logger.error(`[CRÍTICO] ${error.message}`);
    } finally {
      this.abortTask = false;
      this.isPaused = false;
    }
  }

  private handleEscape() {
    this.spinner.stop();
    // Reutiliza a lógica de pausa dentro do processResponse
  }

  private async compactHistory() {
    this.spinner.text = chalk.cyan('[SISTEMA]: Otimizando Contexto (Compactação de Tokens)...');
    this.spinner.start();

    try {
      const summaryPrompt = {
        role: 'user',
        content: 'SISTEMA: Resuma nossa conversa até agora em um parágrafo técnico denso. Foque nos objetivos alcançados, arquivos modificados, estado atual do código e decisões arquiteturais. Mantenha os detalhes críticos para continuidade da tarefa.'
      };

      const summaryResponse = await this.service.chat([...this.messages, summaryPrompt]);
      this.spinner.stop();

      if (summaryResponse && summaryResponse.content) {
        const systemPrompt = this.messages[0];
        const lastMessages = this.messages.slice(-4);
        
        this.messages = [
          systemPrompt,
          { 
            role: 'system', 
            content: `[RESUMO DE CONTEXTO ANTERIOR]: ${summaryResponse.content}` 
          },
          ...lastMessages
        ];

        logger.info('[SISTEMA]: Contexto compactado com sucesso.');
      }
    } catch (error) {
      this.spinner.stop();
      logger.error('Falha na compactação de contexto.');
    }
  }

  public async runAutonomously(): Promise<string> {
    await this.processResponse();
    const lastMessage = this.messages[this.messages.length - 1];
    return lastMessage.content || 'Sub-tarefa concluída.';
  }
}
