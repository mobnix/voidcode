import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const tools = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Lista arquivos e pastas em um diretório.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do diretório (default: .)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lê o conteúdo de um arquivo.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Cria ou sobrescreve um arquivo com novo conteúdo.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo.' },
          content: { type: 'string', description: 'Conteúdo completo do arquivo.' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Pesquisa por um padrão regex nos arquivos (usa ripgrep).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'O padrão regex para buscar.' },
          path: { type: 'string', description: 'Diretório para buscar (default: .)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'spawn_sub_agent',
      description: 'Cria um sub-agente especializado para resolver uma tarefa específica em paralelo.',
      parameters: {
        type: 'object',
        properties: {
          objective: { type: 'string', description: 'O objetivo detalhado do sub-agente.' }
        },
        required: ['objective']
      }
    }
  }
];

export const toolHandlers: Record<string, (args: any) => any> = {
  // ... (anteriores)
  list_directory: ({ path: dirPath = '.' }) => {
    try {
      return fs.readdirSync(path.resolve(dirPath)).join('\n');
    } catch (e: any) {
      return `Erro ao listar diretório: ${e.message}`;
    }
  },
  read_file: ({ path: filePath }) => {
    try {
      return fs.readFileSync(path.resolve(filePath), 'utf-8');
    } catch (e: any) {
      return `Erro ao ler arquivo: ${e.message}`;
    }
  },
  write_file: ({ path: filePath, content }) => {
    try {
      const fullPath = path.resolve(filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
      return `Arquivo ${filePath} gravado com sucesso.`;
    } catch (e: any) {
      return `Erro ao gravar arquivo: ${e.message}`;
    }
  },
  run_shell_command: ({ command }) => {
    try {
      const output = execSync(command, { encoding: 'utf-8' });
      return output || 'Comando executado com sucesso (sem output).';
    } catch (e: any) {
      return `Erro ao executar comando: ${e.stderr || e.message}`;
    }
  },
  grep_search: ({ pattern, path: dirPath = '.' }) => {
    try {
      const output = execSync(`rg --vimgrep "${pattern}" ${dirPath}`, { encoding: 'utf-8' });
      return output || 'Nenhum resultado encontrado.';
    } catch (e: any) {
      return `Erro na busca ou nenhum resultado: ${e.message}`;
    }
  },
  replace_file_content: ({ path: filePath, old_string, new_string }) => {
    try {
      const fullPath = path.resolve(filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (!content.includes(old_string)) {
        return `Erro: A string original não foi encontrada no arquivo.`;
      }
      const newContent = content.replace(old_string, new_string);
      fs.writeFileSync(fullPath, newContent);
      return `Substituição realizada com sucesso em ${filePath}.`;
    } catch (e: any) {
      return `Erro ao substituir conteúdo: ${e.message}`;
    }
  },
  spawn_sub_agent: async ({ objective }) => {
    // A lógica real do sub-agente será injetada pelo ChatLoop
    return `Sub-agente iniciado para: ${objective}`;
  }
};
