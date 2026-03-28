# 📟 voidcode-cli — Task Board

## 🎯 Objetivo
Criar um CLI Agentic (estilo Gemini/Claude Code) que utiliza a API da DeepSeek, com visual Matrix e arquitetura Clean Code.

---

## 🛠️ Sprint 1: Fundação & UX Matrix
- [ ] **Setup Inicial**
    - [ ] `npm init` e configuração de TypeScript.
    - [ ] Configuração do Vitest para TDD.
    - [ ] Estrutura de pastas (src/core, src/cli, src/tools).
- [ ] **The Wizard (Config)**
    - [ ] Implementar Check de primeiro boot (existe `.env`?).
    - [ ] Wizard interativo com `inquirer` para salvar `DEEPSEEK_API_KEY`.
- [ ] **Visual Identity**
    - [ ] Splash screen com `gradient-string` (Matrix Style).
    - [ ] Spinners personalizados com `ora`.

## 🧠 Sprint 2: O Cérebro (DeepSeek Agent)
- [ ] **LLM Layer**
    - [ ] Service de integração com DeepSeek API.
    - [ ] Gestão de histórico de chat (Memory).
- [ ] **Agentic Tools (Iniciais)**
    - [ ] Tool: `ListFiles` (exploração).
    - [ ] Tool: `ReadFile` (entendimento).
    - [ ] Tool: `WriteFile` (escrita).

## 🧪 Sprint 3: Validação & Segurança
- [ ] Testes unitários de todos os serviços.
- [ ] Implementar "Human-in-the-loop" (pedir permissão antes de rodar comandos).

---

## 📈 Progresso Atual
- [x] Planejamento inicial concluído.
- [x] Setup Inicial (Node/TS/Vitest).
- [x] The Wizard (Configuração automática via terminal).
- [x] Visual Identity (Matrix Splash Screen).
- [ ] Implementação do Loop de Chat e Integração DeepSeek.
