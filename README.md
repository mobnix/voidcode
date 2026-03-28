# VOIDCODE — Multi-LLM Agentic CLI v2.0

> *"Free your mind... the terminal is your weapon."*
>
> Created by **Mobnix**

**VOIDCODE** é uma CLI agêntica multi-provider para engenheiros de software. Conecta com **DeepSeek**, **OpenAI** (GPT-4o, Codex), **Qwen**, **MiniMax** ou qualquer API OpenAI-compatible. Planeja tarefas complexas antes de executar, roda agentes em paralelo, controla remotamente via **Telegram**, e mantém contexto entre sessões.

---

## Destaques

- **5 Providers** — DeepSeek, OpenAI, Qwen, MiniMax, Custom. Troque a qualquer momento com `/auth`
- **17 Tools nativas** — filesystem, git, shell, web, memória, sub-agentes
- **Plan-then-Execute** — detecta tarefas complexas, planeja e confirma antes de executar
- **Auto-correção** — quando tools falham, injeta feedback para o LLM corrigir sozinho
- **Agentes paralelos** — terminal non-blocking, novas tarefas vão para agentes em background
- **Telegram Bot** — controle remoto pelo celular via @BotFather
- **Memória persistente** — categorizada (user/project/feedback), carregada automaticamente
- **Sessões** — salva as 3 últimas, resume ao iniciar
- **Histórico de input** — seta cima/baixo navega inputs anteriores, persiste entre sessões
- **VOIDCODE.md** — instruções por projeto (como CLAUDE.md)
- **Modo Insano** (`--insane`) — executa tudo sem pedir permissão

---

## Instalação

**Requisitos:** Node.js 18+, ripgrep

```bash
cd voidcode-cli
npm install
npm run build
npm install -g .
```

Primeira execução abre o wizard de setup:

```bash
voidcode --insane
```

```
╔═══════════════════════════════════════╗
║ SETUP INICIAL                        ║
╠═══════════════════════════════════════╣
║ STEP 1/3 — Provider & API Key       ║
║ STEP 2/3 — Modelo                   ║
║ STEP 3/3 — Telegram Bot (opcional)  ║
╚═══════════════════════════════════════╝
```

Config salva em `~/.voidcode/.env` — funciona de qualquer diretório.

---

## Providers Suportados

| Provider | Modelos | Observação |
|----------|---------|------------|
| **DeepSeek** | deepseek-chat, deepseek-reasoner | Bom custo-benefício, tool use sólido |
| **OpenAI** | gpt-4o, gpt-4o-mini, o3-mini (Codex) | Multimodal, raciocínio avançado |
| **Qwen** | qwen-plus, qwen-max, qwen-turbo | Alibaba Cloud |
| **MiniMax** | MiniMax-Text-01 | Modelo chinês alternativo |
| **Custom** | qualquer modelo | Qualquer endpoint OpenAI-compatible |

Troque em tempo real com `/auth` ou `/menu`.

---

## Telegram Bot

Controle o VoidCode remotamente do celular:

1. Crie um bot no **@BotFather** no Telegram
2. Execute `/telegram` no VoidCode e cole o token
3. Envie mensagens do celular — o VoidCode executa e responde

```
📱 Telegram                          💻 Terminal
─────────────                        ──────────────
"crie um server express porta 3000"  → processa como input
                                     ← "✔ Server rodando em background"
"/status"                            ← "📂 cwd: ~/meuapp"
"/stop"                              ← bot desconecta
```

---

## Tools (17 nativas)

| Tool | Descrição |
|------|-----------|
| `list_directory` | Lista arquivos e pastas |
| `read_file` | Lê arquivo (proteção de path + size 10MB) |
| `read_file_lines` | Lê range de linhas (eficiente para arquivos grandes) |
| `write_file` | Cria/sobrescreve arquivo |
| `replace_file_content` | Substitui string em arquivo |
| `patch_file` | Edita por número de linha (cirúrgico) |
| `grep_search` | Busca regex com ripgrep |
| `glob_files` | Busca por padrão glob |
| `run_shell_command` | Executa comando (suporta `background:true` para servidores) |
| `spawn_sub_agent` | Cria sub-agente paralelo |
| `memory_read` | Lê memória persistente |
| `memory_write` | Salva memória (categorias: user/project/feedback) |
| `git_status` | Status do repositório |
| `git_diff` | Diff staged/unstaged |
| `git_log` | Histórico de commits |
| `git_commit` | Stage + commit |
| `web_fetch` | HTTP GET com extração de texto de HTML |

---

## Comandos

### Geral
| Comando | Descrição |
|---------|-----------|
| `/menu` | Wizard central (auth, telegram, skills, memória, sessões, config) |
| `/auth` | Trocar provider / modelo / API key |
| `/telegram` | Configurar bot Telegram |
| `/usage` | Token usage da sessão |
| `/plan` | Toggle plan mode (planeja sem executar) |
| `/compact` | Compactar contexto manualmente |
| `/exit` | Sair (salva sessão) |
| `Ctrl+C` | Interromper tarefa atual |
| `Ctrl+D 2x` | Sair imediato |

### Tasks
| Comando | Descrição |
|---------|-----------|
| `/task <texto>` | Adicionar tarefa |
| `/task done <id>` | Marcar concluída |
| `/task rm <id>` | Remover |

### Git
| Comando | Descrição |
|---------|-----------|
| `/commit <msg>` | Git commit rápido |
| `/diff [file]` | Git diff |
| `/log [n]` | Git log |
| `/status` | Git status |

### Agentes
| Comando | Descrição |
|---------|-----------|
| `/agent <prompt>` | Spawna agente em background |
| `/agents` | Lista agentes ativos |
| `/queue` | Mostra fila de tarefas e agentes |
| `/btw <pergunta>` | Pergunta rápida sem interromper |

### Skills
| Comando | Descrição |
|---------|-----------|
| `/createskill` | Cria nova skill (interativo) |
| `/skills` | Lista tools e skills |
| `/memory` | Ver memória persistente |

---

## Inteligência

### Non-blocking Terminal
O terminal fica **livre durante a execução**. Se digitar algo enquanto uma tarefa roda, a nova tarefa vai automaticamente para um **agente paralelo**. O prompt mostra `[busy]` quando ocupado.

### Plan-then-Execute
Tarefas complexas (criar projetos, refatorar, migrar) são **detectadas automaticamente**. O VoidCode planeja primeiro, mostra o plano, e pede confirmação antes de executar.

### Auto-correção
Quando 2+ tool calls consecutivas falham, o sistema injeta uma instrução de correção automática para o LLM analisar os erros e tentar de forma diferente.

### Context Injection
Antes de cada tarefa, injeta automaticamente: lista de arquivos do cwd + git branch + status. O LLM já sabe onde está sem gastar uma tool call.

### Smart Tool Selection
Analisa a mensagem do usuário e envia só as tools relevantes (economia de ~500 tokens/request).

### Histórico de Input
Seta ↑/↓ navega inputs anteriores. Persiste entre sessões em `~/.voidcode/history`. Suporta `Ctrl+R` para busca reversa.

---

## Segurança

- Shell injection prevention (`shellEscape` em grep e git)
- Path traversal protection (bloqueia `/proc`, `/dev`, `/sys`)
- File size limits (max 10MB para leitura)
- `.env` com permissões 0o600 (só owner)
- Histórico com permissões 0o600
- Input validation nos git tools
- 0 vulnerabilidades em dependências (`npm audit`)

---

## Estrutura

```
voidcode/
├── VOIDCODE.md                 # Instruções do projeto (auto-carregado)
├── README.md
├── voidcode-cli/
│   ├── src/
│   │   ├── cli/
│   │   │   ├── chat.ts         # Loop principal, non-blocking, plan-execute
│   │   │   └── wizard.ts       # Setup wizard (provider + telegram)
│   │   ├── core/
│   │   │   ├── deepseek.ts     # LLM service multi-provider
│   │   │   ├── providers.ts    # Definição dos 5 providers
│   │   │   ├── context.ts      # Auto-detect projeto, memória estruturada
│   │   │   └── telegram.ts     # Telegram bot bridge
│   │   ├── tools/
│   │   │   └── index.ts        # 17 tools + handlers + security
│   │   ├── skills/             # Skills dinâmicas (~/.voidcode/skills/)
│   │   ├── utils/
│   │   │   ├── ui.ts           # ASCII art, progress bar, footer, splash
│   │   │   ├── json.ts         # Safe JSON parser (repara JSON quebrado)
│   │   │   └── keyboard.ts     # Keyboard manager
│   │   └── __tests__/          # 26 testes unitários
│   ├── package.json
│   └── tsconfig.json
└── ~/.voidcode/                # Config global (criado automaticamente)
    ├── .env                    # API keys (perm 600)
    ├── history                 # Histórico de input (perm 600)
    ├── memory/                 # Memória persistente categorizada
    ├── skills/                 # Skills customizadas (.js)
    └── sessions.json           # Últimas 3 sessões
```

---

## Testes

```bash
cd voidcode-cli
npm test
# 26/26 passing (json, ui, tools)
```

---

## Licença

MIT

---

**v2.0** — Multi-LLM · Telegram · Plan-Execute · Non-blocking · Auto-Correction · Security Hardening

Created by **Mobnix**
