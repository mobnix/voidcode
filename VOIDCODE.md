# VOIDCODE.md - Instruções do Projeto

Este arquivo é lido automaticamente pelo VoidCode CLI ao iniciar neste diretório.
Coloque aqui instruções específicas para o agente.

## Stack
- Node.js + TypeScript (ESM)
- Build: tsup
- Test: vitest

## Regras
- Sempre rodar testes antes de commitar
- Build com: npm run build (de dentro de voidcode-cli/)
- Install global: npm install -g . (de dentro de voidcode-cli/)
- Configuração fica em ~/.voidcode/.env

## Estrutura
- voidcode-cli/src/ - código fonte
- voidcode-cli/src/cli/chat.ts - loop principal
- voidcode-cli/src/core/deepseek.ts - serviço LLM
- voidcode-cli/src/tools/index.ts - todas as tools
- voidcode-cli/src/core/context.ts - context injection
