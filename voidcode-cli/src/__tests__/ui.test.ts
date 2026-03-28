import { describe, it, expect } from 'vitest';
import { truncateToolOutput } from '../utils/ui.js';

describe('truncateToolOutput', () => {
  it('returns short strings unchanged', () => {
    const input = 'hello world';
    expect(truncateToolOutput(input)).toBe(input);
  });

  it('returns string at limit unchanged', () => {
    const input = 'x'.repeat(3000);
    expect(truncateToolOutput(input)).toBe(input);
  });

  it('truncates strings over limit', () => {
    const input = 'x'.repeat(20000);
    const result = truncateToolOutput(input);
    expect(result.length).toBeLessThan(input.length);
    expect(result).toContain('ocultos');
  });

  it('preserves head and tail of truncated content', () => {
    const input = 'HEAD' + 'x'.repeat(20000) + 'TAIL';
    const result = truncateToolOutput(input);
    expect(result.startsWith('HEAD')).toBe(true);
    expect(result.endsWith('TAIL')).toBe(true);
  });
});
