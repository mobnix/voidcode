# 📟 VOIDCODE — DeepSeek Agentic CLI

> "Wake up, Neo... the terminal is your weapon." 🟢⬛🦾

**VOIDCODE** é uma CLI agêntica de elite projetada para engenheiros de software que buscam o poder da IA (DeepSeek) integrado diretamente ao sistema de arquivos, com uma interface inspirada na estética clássica da Matrix.

---

## 🧬 Características de Elite

- **🧠 DeepSeek Engine:** Alimentado pelos modelos `deepseek-chat` e `deepseek-coder` para máxima eficiência e custo reduzido.
- **🚀 Agentic Loop:** A IA não apenas responde, ela **age**. Possui ferramentas nativas para ler, escrever, listar e buscar arquivos.
- **🐝 Swarm (Sub-Agentes):** Capacidade de "spawnar" sub-agentes especialistas para resolver tarefas em paralelo.
- **🔄 Parallelism:** Execução de múltiplas ferramentas e chamadas de API simultaneamente usando `Promise.all`.
- **🦍 Modo Insano (`--insane`):** Protocolo YOLO para execução de comandos sem necessidade de confirmação (use por sua conta e risco).
- **🎨 Matrix UI:** Interface hacker futurista com gradientes neon, spinners customizados e logs estilo console da Nebuchadnezzar.
- **🧬 Dynamic Skills:** Sistema modular de extensões via comando `/create-skill`.

---

## 🛠️ Instalação

Certifique-se de ter o **Node.js 18+** e **ripgrep** instalados no seu sistema.

```bash
# Entre na pasta do projeto
cd voidcode-cli

# Build do sistema
npm run build

# Instalação global
sudo npm install -g .
```

---

## 📟 Comandos e Parâmetros

### Inicialização
```bash
voidcode
```
*Na primeira execução, o Wizard do VoidCode irá configurar sua **DeepSeek API Key**.*

### Parâmetros
- `-i, --insane`: Ativa o modo sem confirmação (YOLO).
- `-v, --version`: Exibe a versão do sistema.
- `-h, --help`: Exibe a ajuda.

### Comandos Internos (Chat)
- `/create-skill [Nome] [Descrição]`: Cria uma nova habilidade para o VoidCode.
- `exit` ou `quit`: Encerra o link com a Matrix.

---

## 📂 Estrutura do Projeto

```text
voidcode/
├── voidcode           # Script de boot principal
├── voidcode-cli/
│   ├── src/
│   │   ├── core/      # LLM & DeepSeek Service
│   │   ├── cli/       # Chat Loop & Wizard
│   │   ├── tools/     # Native Toolset (Grep, Write, Shell)
│   │   ├── skills/    # Custom Extensions
│   │   └── utils/     # UI & Matrix Logger
│   ├── void.MD        # Protocolo de Engenharia (SOLID, TDD)
│   └── memoryvoid.md  # Memória persistente do Agente
└── tasks/             # Task Board do projeto
```

---

## 🧠 Protocolo de Engenharia (`void.MD`)
O VoidCode segue um rigoroso código de honra:
1. **Clean Code & SOLID** é a lei.
2. **TDD** é obrigatório antes da implementação final.
3. **Edições Cirúrgicas** em vez de sobrescrever arquivos.
4. **Paralelismo** sempre que possível para performance.

---

## 🛡️ Segurança e Privacidade
O VoidCode armazena sua chave de API localmente em um arquivo `.env` protegido pelo `.gitignore`. Nenhum dado ou código do seu projeto sai da sua máquina, exceto para a API oficial da DeepSeek.

---

**[SYSTEM_STATUS: ACTIVE]**  
*Forjado nos arquivos da Matrix por um Arquiteto de Elite.* 🟢⬛🦾
