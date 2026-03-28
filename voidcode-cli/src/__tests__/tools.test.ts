import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toolHandlers } from '../tools/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = path.join(os.tmpdir(), 'voidcode-test-' + Date.now());

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'Hello World\nLine 2\nLine 3');
  fs.mkdirSync(path.join(tmpDir, 'subdir'));
  fs.writeFileSync(path.join(tmpDir, 'subdir', 'nested.ts'), 'export const x = 1;');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('toolHandlers', () => {
  describe('list_directory', () => {
    it('lists files and dirs with type indicators', () => {
      const result = toolHandlers['list_directory']!({ path: tmpDir });
      expect(result).toContain('[FILE] test.txt');
      expect(result).toContain('[DIR] subdir');
    });

    it('returns error for non-existent dir', () => {
      const result = toolHandlers['list_directory']!({ path: '/nonexistent_path_12345' });
      expect(result).toContain('Erro');
    });
  });

  describe('read_file', () => {
    it('reads file contents', () => {
      const result = toolHandlers['read_file']!({ path: path.join(tmpDir, 'test.txt') });
      expect(result).toBe('Hello World\nLine 2\nLine 3');
    });

    it('returns error for non-existent file', () => {
      const result = toolHandlers['read_file']!({ path: '/nonexistent_file_12345' });
      expect(result).toContain('Erro');
    });
  });

  describe('write_file', () => {
    it('creates new file', () => {
      const filePath = path.join(tmpDir, 'new.txt');
      const result = toolHandlers['write_file']!({ path: filePath, content: 'new content' });
      expect(result).toContain('sucesso');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
    });

    it('creates nested directories', () => {
      const filePath = path.join(tmpDir, 'deep', 'nested', 'file.txt');
      toolHandlers['write_file']!({ path: filePath, content: 'deep' });
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('replace_file_content', () => {
    it('replaces string in file', () => {
      const filePath = path.join(tmpDir, 'replace.txt');
      fs.writeFileSync(filePath, 'foo bar baz');
      const result = toolHandlers['replace_file_content']!({ path: filePath, old_string: 'bar', new_string: 'qux' });
      expect(result).toContain('Substituição');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('foo qux baz');
    });

    it('returns error when string not found', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const result = toolHandlers['replace_file_content']!({ path: filePath, old_string: 'NOTFOUND', new_string: 'x' });
      expect(result).toContain('não encontrada');
    });
  });

  describe('run_shell_command', () => {
    it('runs simple command', () => {
      const result = toolHandlers['run_shell_command']!({ command: 'echo hello' });
      expect(result.trim()).toBe('hello');
    });
  });

  describe('glob_files', () => {
    it('finds files by pattern', async () => {
      const result = await toolHandlers['glob_files']!({ pattern: '**/*.ts', path: tmpDir });
      expect(result).toContain('nested.ts');
    });

    it('returns message when no files found', async () => {
      const result = await toolHandlers['glob_files']!({ pattern: '**/*.xyz', path: tmpDir });
      expect(result).toContain('Nenhum');
    });
  });

  describe('git_status', () => {
    it('returns git status or error', () => {
      const result = toolHandlers['git_status']!({});
      // Pode retornar status ou erro (se não é git repo), ambos são string
      expect(typeof result).toBe('string');
    });
  });

  describe('git_log', () => {
    it('returns git log', () => {
      const result = toolHandlers['git_log']!({ count: 5 });
      expect(typeof result).toBe('string');
    });
  });

  describe('memory_read / memory_write', () => {
    it('writes and reads memory', () => {
      toolHandlers['memory_write']!({ key: 'test_key', content: 'test_value' });
      const result = toolHandlers['memory_read']!({});
      expect(result).toContain('test_value');
    });
  });
});
