import { describe, it, expect } from 'vitest';
import {
  resolveSectionConfig,
  resolveAllSections,
  BUILT_IN_SECTION_DEFAULTS,
  CUSTOM_SECTION_DEFAULTS,
  PRESETS,
} from '../sections.js';
import type { BudgetConfig } from '../types.js';

describe('resolveSectionConfig', () => {
  it('returns built-in defaults for system when no partial provided', () => {
    const result = resolveSectionConfig('system');
    expect(result).toEqual(BUILT_IN_SECTION_DEFAULTS['system']);
  });

  it('returns built-in defaults for tools when no partial provided', () => {
    const result = resolveSectionConfig('tools');
    expect(result).toEqual(BUILT_IN_SECTION_DEFAULTS['tools']);
  });

  it('returns built-in defaults for conversation when no partial provided', () => {
    const result = resolveSectionConfig('conversation');
    expect(result).toEqual(BUILT_IN_SECTION_DEFAULTS['conversation']);
    expect(result.min).toBe(2000);
    expect(result.truncation).toBe('messages');
  });

  it('returns custom defaults for unknown section names', () => {
    const result = resolveSectionConfig('my-custom-section');
    expect(result).toEqual(CUSTOM_SECTION_DEFAULTS);
    expect(result.basis).toBe(0);
    expect(result.grow).toBe(0);
    expect(result.shrink).toBe(1);
    expect(result.priority).toBe(50);
    expect(result.overflow).toBe('truncate');
    expect(result.truncation).toBe('head');
  });

  it('merges partial override onto built-in defaults for system', () => {
    const result = resolveSectionConfig('system', { priority: 90, overflow: 'warn' });
    expect(result.priority).toBe(90);
    expect(result.overflow).toBe('warn');
    // non-overridden fields retain defaults
    expect(result.basis).toBe('auto');
    expect(result.grow).toBe(0);
    expect(result.shrink).toBe(0);
    expect(result.truncation).toBe('head');
  });

  it('merges partial override onto custom defaults for unknown section', () => {
    const result = resolveSectionConfig('unknown-section', { grow: 3, min: 500 });
    expect(result.grow).toBe(3);
    expect(result.min).toBe(500);
    // non-overridden fields retain custom defaults
    expect(result.basis).toBe(0);
    expect(result.shrink).toBe(1);
    expect(result.priority).toBe(50);
  });

  it('allows overriding basis with auto, number, or percentage', () => {
    expect(resolveSectionConfig('memory', { basis: 'auto' }).basis).toBe('auto');
    expect(resolveSectionConfig('memory', { basis: 1000 }).basis).toBe(1000);
    expect(resolveSectionConfig('memory', { basis: '25%' }).basis).toBe('25%');
  });
});

describe('resolveAllSections', () => {
  it('expands chatbot preset to correct section names', () => {
    const config: BudgetConfig = { model: 'gpt-4o', preset: 'chatbot' };
    const result = resolveAllSections(config);
    expect(Object.keys(result).sort()).toEqual(['conversation', 'currentMessage', 'system'].sort());
    expect(result['system']).toEqual(BUILT_IN_SECTION_DEFAULTS['system']);
    expect(result['conversation']).toEqual(BUILT_IN_SECTION_DEFAULTS['conversation']);
    expect(result['currentMessage']).toEqual(BUILT_IN_SECTION_DEFAULTS['currentMessage']);
  });

  it('expands rag preset to correct section names', () => {
    const config: BudgetConfig = { model: 'gpt-4o', preset: 'rag' };
    const result = resolveAllSections(config);
    expect(Object.keys(result).sort()).toEqual(['currentMessage', 'rag', 'system'].sort());
  });

  it('expands agent preset to correct section names', () => {
    const config: BudgetConfig = { model: 'gpt-4o', preset: 'agent' };
    const result = resolveAllSections(config);
    expect(Object.keys(result).sort()).toEqual(
      PRESETS['agent'].slice().sort(),
    );
  });

  it('expands full preset to all built-in section names', () => {
    const config: BudgetConfig = { model: 'gpt-4o', preset: 'full' };
    const result = resolveAllSections(config);
    expect(Object.keys(result).sort()).toEqual(PRESETS['full'].slice().sort());
  });

  it('uses caller sections directly when no preset', () => {
    const config: BudgetConfig = {
      model: 'gpt-4o',
      sections: { system: {}, mySection: { grow: 2 } },
    };
    const result = resolveAllSections(config);
    expect(Object.keys(result).sort()).toEqual(['mySection', 'system'].sort());
    expect(result['mySection'].grow).toBe(2);
  });

  it('caller sections override preset sections', () => {
    const config: BudgetConfig = {
      model: 'gpt-4o',
      preset: 'chatbot',
      sections: { system: { priority: 50 }, extraSection: {} },
    };
    const result = resolveAllSections(config);
    // preset sections plus extra
    expect(result['system'].priority).toBe(50);
    expect(result['extraSection']).toBeDefined();
    expect(result['conversation']).toEqual(BUILT_IN_SECTION_DEFAULTS['conversation']);
    expect(result['currentMessage']).toEqual(BUILT_IN_SECTION_DEFAULTS['currentMessage']);
  });

  it('returns empty object when no preset and no sections', () => {
    const config: BudgetConfig = { model: 'gpt-4o' };
    const result = resolveAllSections(config);
    expect(Object.keys(result)).toHaveLength(0);
  });
});
