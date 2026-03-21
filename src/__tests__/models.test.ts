import { describe, it, expect } from 'vitest';
import { getModelContextWindow, registerModel } from '../models.js';

describe('getModelContextWindow', () => {
  it('returns context window for known OpenAI models', () => {
    expect(getModelContextWindow('gpt-4o')).toBe(128000);
    expect(getModelContextWindow('gpt-4')).toBe(8192);
    expect(getModelContextWindow('gpt-4-32k')).toBe(32768);
    expect(getModelContextWindow('gpt-3.5-turbo')).toBe(16385);
    expect(getModelContextWindow('gpt-4.1')).toBe(1047576);
    expect(getModelContextWindow('gpt-4.1-mini')).toBe(1047576);
    expect(getModelContextWindow('gpt-4.1-nano')).toBe(1047576);
    expect(getModelContextWindow('o1')).toBe(200000);
    expect(getModelContextWindow('o1-mini')).toBe(128000);
    expect(getModelContextWindow('o3')).toBe(200000);
    expect(getModelContextWindow('o3-mini')).toBe(200000);
    expect(getModelContextWindow('o4-mini')).toBe(200000);
  });

  it('returns context window for known Anthropic models', () => {
    expect(getModelContextWindow('claude-opus-4')).toBe(200000);
    expect(getModelContextWindow('claude-sonnet-4')).toBe(200000);
    expect(getModelContextWindow('claude-3-5-sonnet-20241022')).toBe(200000);
    expect(getModelContextWindow('claude-3-5-haiku-20241022')).toBe(200000);
    expect(getModelContextWindow('claude-3-haiku-20240307')).toBe(200000);
  });

  it('returns context window for known Google models', () => {
    expect(getModelContextWindow('gemini-2.5-pro')).toBe(1048576);
    expect(getModelContextWindow('gemini-2.5-flash')).toBe(1048576);
    expect(getModelContextWindow('gemini-2.0-flash')).toBe(1048576);
    expect(getModelContextWindow('gemini-1.5-pro')).toBe(2097152);
    expect(getModelContextWindow('gemini-1.5-flash')).toBe(1048576);
  });

  it('returns context window for known Meta models', () => {
    expect(getModelContextWindow('llama-4-scout')).toBe(10000000);
    expect(getModelContextWindow('llama-4-maverick')).toBe(1048576);
    expect(getModelContextWindow('llama-3.3-70b')).toBe(131072);
    expect(getModelContextWindow('llama-3.1-405b')).toBe(131072);
  });

  it('resolves aliases', () => {
    expect(getModelContextWindow('claude-sonnet-4-20250514')).toBe(200000);
    expect(getModelContextWindow('claude-opus-4-20250514')).toBe(200000);
  });

  it('returns undefined for unknown models', () => {
    expect(getModelContextWindow('gpt-99')).toBeUndefined();
    expect(getModelContextWindow('unknown-model')).toBeUndefined();
    expect(getModelContextWindow('')).toBeUndefined();
  });
});

describe('registerModel', () => {
  it('adds a new model that can be retrieved', () => {
    registerModel('my-custom-model', 32768);
    expect(getModelContextWindow('my-custom-model')).toBe(32768);
  });

  it('overrides a built-in model', () => {
    // gpt-4 is built-in at 8192; override it
    registerModel('gpt-4', 9999);
    expect(getModelContextWindow('gpt-4')).toBe(9999);
    // restore original for other tests
    registerModel('gpt-4', 8192);
  });

  it('throws on non-positive contextWindow (zero)', () => {
    expect(() => registerModel('bad-model', 0)).toThrow();
  });

  it('throws on negative contextWindow', () => {
    expect(() => registerModel('bad-model', -1)).toThrow();
  });

  it('throws on float contextWindow', () => {
    expect(() => registerModel('bad-model', 1024.5)).toThrow();
  });
});
