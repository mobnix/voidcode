import { describe, it, expect } from 'vitest';
import { safeJSONParse } from '../utils/json.js';

describe('safeJSONParse', () => {
  it('parses valid JSON', () => {
    expect(safeJSONParse('{"key": "value"}')).toEqual({ key: 'value' });
  });

  it('parses valid array', () => {
    expect(safeJSONParse('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('repairs unclosed string', () => {
    const result = safeJSONParse('{"key": "value');
    expect(result).toEqual({ key: 'value' });
  });

  it('repairs unclosed object', () => {
    const result = safeJSONParse('{"key": "value"');
    expect(result).toEqual({ key: 'value' });
  });

  it('repairs unclosed array', () => {
    const result = safeJSONParse('[1, 2, 3');
    expect(result).toEqual([1, 2, 3]);
  });

  it('repairs trailing comma', () => {
    const result = safeJSONParse('{"a": 1, "b": 2,}');
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('repairs nested unclosed', () => {
    const result = safeJSONParse('{"a": {"b": "c"');
    expect(result).toEqual({ a: { b: 'c' } });
  });

  it('throws on completely invalid input', () => {
    expect(() => safeJSONParse('not json at all')).toThrow();
  });
});
