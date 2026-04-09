import { exec } from 'node:child_process';

/**
 * Abre o Google AI Studio no navegador para o usuário pegar a API Key.
 */
export function openGoogleAIStudio() {
  const url = 'https://aistudio.google.com/apikey';
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}
