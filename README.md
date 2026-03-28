# VOIDCODE — Multi-LLM Agentic CLI v2.0

> "Wake up... the terminal is your weapon."

**VOIDCODE** é uma CLI agêntica para engenheiros de software. Suporta múltiplos providers de LLM (DeepSeek, OpenAI, Qwen, MiniMax), executa tarefas complexas com planejamento automático, e pode ser controlada remotamente via Telegram.

---

## Features

### Core
- **Multi-Provider** — DeepSeek, OpenAI (Codex/GPT-4o), Qwen, MiniMax, ou qualquer API OpenAI-compatible
- **Agentic Loop** — a IA age: lê, escreve, busca, executa comandos, cria projetos
- **Tool Calls Paralelas** — executa múltiplas tools simultaneamente (`Promise.all`)
- **Plan-then-Execute** — detecta tarefas complexas e planeja antes de executar
- **Auto-correção** — quando tools falham, injeta feedback automático para o LLM corrigir
- **Modo Insano (`--insane`)** — executa tudo sem pedir confirmação

### Tools (17 ferramentas nativas)
| Tool | Descrição |
|------|-----------|
| `list_directory` | Lista arquivos e pastas |
| `read_file` | Lê arquivo (com proteção de path e size) |
| `read_file_lines` | Lê range de linhas (eficiente) |
| `write_file` | Cria/sobrescreve arquivo |
| `replace_file_content` | Substitui string em arquivo |
| `patch_file` | Edita por número de linha |
| `grep_search` | Busca regex (ripgrep) |
| `glob_files` | Busca por padrão glob |
| `run_shell_command` | Executa comando (com `background:true` para servidores) |
| `spawn_sub_agent` | Cria sub-agente paralelo |
| `memory_read` | Lê memória persistente |
| `memory_write` | Salva memória (categorias: user/project/feedback) |
| `git_status` | Status do repo |
| `git_diff` | Diff staged/unstaged |
| `git_log` | Histórico de commits |
| `git_commit` | Stage + commit |
| `web_fetch` | HTTP GET com extração de texto |

### Inteligência
- **Context Injection** — auto-detecta stack (Node/Python/Rust/Go/Docker), git branch, arquivos
- **VOIDCODE.md** — coloque na raiz de qualquer projeto para instruir o agente (como CLAUDE.md)
- **Memória Persistente** — categorizada (user/project/feedback), carregada automaticamente
- **Sessões** — salva as 3 últimas, oferece retomada ao iniciar
- **CWD Snapshot** — injeta `ls` + `git status` antes de cada tarefa (zero tokens extras)
- **Smart Tool Selection** — envia só tools relevantes ao contexto (-500 tokens/request)
- **Tool Cache** — resultados de leitura cacheados por 10s

### Telegram Bot
- Controle remoto do VoidCode pelo celular
- Processa comandos como se fosse o terminal
- Long polling, executa tools, retorna resultado
- Setup: `/telegram` ou `/menu > 2`

### Segurança
- Shell injection prevention (`shellEscape`)
- Path traversal protection (bloqueia `/proc`, `/dev`, `/sys`)
- File size limits (max 10MB)
- `.env` com permissões 0o600
- Input validation nos git tools
- 0 vulnerabilidades em dependências (`npm audit`)

---

## Instalação

**Requisitos:** Node.js 18+, ripgrep

```bash
cd voidcode-cli
npm install
npm run build
npm install -g .
```

Na primeira execução, o wizard configura o provider e API key:
```bash
voidcode --insane
```

Config fica em `~/.voidcode/.env` — funciona de qualquer diretório.

---

## Comandos

### Terminal
```
/menu               Wizard central (auth, telegram, skills, memória, config)
/auth               Trocar provider / modelo / API key
/telegram           Configurar bot Telegram
/usage              Token usage da sessão
/plan               Toggle plan mode (planeja sem executar)
/task <texto>       Adicionar tarefa
/task done <id>     Marcar concluída
/task rm <id>       Remover
/commit <msg>       Git commit rápido
/diff [file]        Git diff
/log [n]            Git log
/status             Git status
/agent <prompt>     Agente em background
/agents             Listar agentes ativos
/btw <pergunta>     Pergunta rápida
/createskill        Criar nova skill
/memory             Ver memória persistente
/skills             Listar tools e skills
/compact            Compactar contexto
/exit               Sair (salva sessão)
Ctrl+C              Interromper tarefa
Ctrl+D 2x           Sair imediato
```

### Telegram
```
/start              Confirma conexão
/status             Mostra cwd
/stop               Desconecta bot
<qualquer texto>    Executa como comando no VoidCode
```

---

## Providers Suportados

| Provider | Modelos | Base URL |
|----------|---------|----------|
| DeepSeek | deepseek-chat, deepseek-reasoner | api.deepseek.com/v1 |
| OpenAI | gpt-4o, gpt-4o-mini, o3-mini | api.openai.com/v1 |
| Qwen | qwen-plus, qwen-max, qwen-turbo | dashscope.aliyuncs.com/compatible-mode/v1 |
| MiniMax | MiniMax-Text-01 | api.minimax.chat/v1 |
| Custom | qualquer modelo | qualquer URL OpenAI-compatible |

Troque a qualquer momento com `/auth` ou `/menu > 1`.

---

## Estrutura

```
voidcode/
├── VOIDCODE.md              # Instruções do projeto (lido auto pelo CLI)
├── voidcode-cli/
│   ├── src/
│   │   ├── cli/chat.ts      # Loop principal, comandos, plan-execute
│   │   ├── cli/wizard.ts    # Setup wizard
│   │   ├── core/deepseek.ts # LLM service (multi-provider)
│   │   ├── core/providers.ts # Definição dos providers
│   │   ├── core/context.ts  # Auto-detect projeto, memória estruturada
│   │   ├── core/telegram.ts # Telegram bot bridge
│   │   ├── tools/index.ts   # 17 tools + handlers
│   │   ├── skills/          # Skills dinâmicas
│   │   └── utils/           # UI, JSON parser, keyboard
│   └── src/__tests__/       # 26 testes unitários
└── ~/.voidcode/             # Config global
    ├── .env                 # API keys (perm 600)
    ├── memory/              # Memória persistente
    ├── skills/              # Skills customizadas
    └── sessions.json        # Últimas 3 sessões
```

---

## Testes

```bash
cd voidcode-cli
npm test
# 26/26 passing (json, ui, tools)
```

---

**v2.0** — Multi-LLM, Telegram, Plan-Execute, Auto-Correction, Security Hardening
