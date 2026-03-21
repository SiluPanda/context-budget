import type { BudgetConfig, OverflowStrategy, SectionConfig, TruncationStrategy } from './types.js';

export interface ResolvedSectionConfig {
  basis: number | string;
  grow: number;
  shrink: number;
  min: number;
  max: number;
  priority: number;
  overflow: OverflowStrategy;
  truncation: TruncationStrategy;
}

export const BUILT_IN_SECTION_DEFAULTS: Record<string, ResolvedSectionConfig> = {
  system: {
    basis: 'auto',
    grow: 0,
    shrink: 0,
    min: 0,
    max: Infinity,
    priority: 100,
    overflow: 'error',
    truncation: 'head',
  },
  tools: {
    basis: 'auto',
    grow: 0,
    shrink: 1,
    min: 0,
    max: Infinity,
    priority: 70,
    overflow: 'warn',
    truncation: 'tail',
  },
  memory: {
    basis: 0,
    grow: 1,
    shrink: 2,
    min: 0,
    max: Infinity,
    priority: 50,
    overflow: 'truncate',
    truncation: 'tail',
  },
  rag: {
    basis: 0,
    grow: 2,
    shrink: 1,
    min: 0,
    max: Infinity,
    priority: 50,
    overflow: 'truncate',
    truncation: 'tail',
  },
  conversation: {
    basis: 0,
    grow: 1,
    shrink: 1,
    min: 2000,
    max: Infinity,
    priority: 80,
    overflow: 'truncate',
    truncation: 'messages',
  },
  currentMessage: {
    basis: 'auto',
    grow: 0,
    shrink: 0,
    min: 0,
    max: Infinity,
    priority: 100,
    overflow: 'error',
    truncation: 'tail',
  },
};

export const CUSTOM_SECTION_DEFAULTS: ResolvedSectionConfig = {
  basis: 0,
  grow: 0,
  shrink: 1,
  min: 0,
  max: Infinity,
  priority: 50,
  overflow: 'truncate',
  truncation: 'head',
};

export const PRESETS: Record<string, string[]> = {
  chatbot: ['system', 'conversation', 'currentMessage'],
  rag: ['system', 'rag', 'currentMessage'],
  agent: ['system', 'tools', 'memory', 'conversation', 'currentMessage'],
  full: ['system', 'tools', 'memory', 'rag', 'conversation', 'currentMessage'],
};

export function resolveSectionConfig(name: string, partial?: SectionConfig): ResolvedSectionConfig {
  const defaults = BUILT_IN_SECTION_DEFAULTS[name] ?? CUSTOM_SECTION_DEFAULTS;
  return {
    basis: partial?.basis !== undefined ? partial.basis : defaults.basis,
    grow: partial?.grow !== undefined ? partial.grow : defaults.grow,
    shrink: partial?.shrink !== undefined ? partial.shrink : defaults.shrink,
    min: partial?.min !== undefined ? partial.min : defaults.min,
    max: partial?.max !== undefined ? partial.max : defaults.max,
    priority: partial?.priority !== undefined ? partial.priority : defaults.priority,
    overflow: partial?.overflow !== undefined ? partial.overflow : defaults.overflow,
    truncation: partial?.truncation !== undefined ? partial.truncation : defaults.truncation,
  };
}

export function resolveAllSections(config: BudgetConfig): Record<string, ResolvedSectionConfig> {
  const result: Record<string, ResolvedSectionConfig> = {};

  // Expand preset to get base section names
  if (config.preset !== undefined) {
    const presetSections = PRESETS[config.preset] ?? [];
    for (const name of presetSections) {
      result[name] = resolveSectionConfig(name);
    }
  }

  // Apply caller's section overrides on top
  if (config.sections !== undefined) {
    for (const [name, partial] of Object.entries(config.sections)) {
      result[name] = resolveSectionConfig(name, partial);
    }
  }

  return result;
}
