import { describe, it, expect } from 'vitest';
import { createBudget } from '../budget.js';
import { BudgetConfigError, BudgetExceededError, UnknownModelError } from '../errors.js';

describe('createBudget validation', () => {
  describe('contextWindow / model mutual exclusion', () => {
    it('throws BudgetConfigError when neither contextWindow nor model is provided', () => {
      expect(() =>
        createBudget({ sections: { system: {} } }),
      ).toThrow(BudgetConfigError);

      try {
        createBudget({ sections: { system: {} } });
      } catch (e) {
        expect(e).toBeInstanceOf(BudgetConfigError);
        const err = e as BudgetConfigError;
        expect(err.validationErrors.some((msg) => /contextWindow.*model|model.*contextWindow/i.test(msg))).toBe(true);
      }
    });

    it('throws BudgetConfigError when both contextWindow and model are provided', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, model: 'gpt-4', sections: { system: {} } }),
      ).toThrow(BudgetConfigError);

      try {
        createBudget({ contextWindow: 8192, model: 'gpt-4', sections: { system: {} } });
      } catch (e) {
        const err = e as BudgetConfigError;
        expect(err.validationErrors.some((msg) => /both/i.test(msg))).toBe(true);
      }
    });
  });

  describe('contextWindow validation', () => {
    it('accepts a valid positive integer contextWindow', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      expect(budget.config.contextWindow).toBe(8192);
    });

    it('throws when contextWindow is negative', () => {
      expect(() =>
        createBudget({ contextWindow: -1, sections: { system: {} } }),
      ).toThrow(BudgetConfigError);

      try {
        createBudget({ contextWindow: -1, sections: { system: {} } });
      } catch (e) {
        const err = e as BudgetConfigError;
        expect(err.validationErrors.some((msg) => /positive integer/i.test(msg))).toBe(true);
      }
    });

    it('throws when contextWindow is zero', () => {
      expect(() =>
        createBudget({ contextWindow: 0, sections: { system: {} } }),
      ).toThrow(BudgetConfigError);
    });

    it('throws when contextWindow is a float', () => {
      expect(() =>
        createBudget({ contextWindow: 1024.5, sections: { system: {} } }),
      ).toThrow(BudgetConfigError);
    });
  });

  describe('model validation', () => {
    it('accepts a known model', () => {
      const budget = createBudget({ model: 'gpt-4o', sections: { system: {} } });
      expect(budget.config.model).toBe('gpt-4o');
    });

    it('accepts a model alias', () => {
      const budget = createBudget({ model: 'claude-sonnet-4-20250514', sections: { system: {} } });
      expect(budget.config.model).toBe('claude-sonnet-4-20250514');
    });

    it('throws UnknownModelError for unrecognized model', () => {
      expect(() =>
        createBudget({ model: 'totally-unknown-model-xyz', sections: { system: {} } }),
      ).toThrow(UnknownModelError);

      try {
        createBudget({ model: 'totally-unknown-model-xyz', sections: { system: {} } });
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownModelError);
        const err = e as UnknownModelError;
        expect(err.model).toBe('totally-unknown-model-xyz');
        expect(err.code).toBe('UNKNOWN_MODEL');
      }
    });
  });

  describe('outputReservation validation', () => {
    it('defaults outputReservation to 0 when not provided', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      expect(budget.config.outputReservation).toBeUndefined();
    });

    it('accepts a valid outputReservation', () => {
      const budget = createBudget({
        contextWindow: 8192,
        outputReservation: 1000,
        sections: { system: {} },
      });
      expect(budget.config.outputReservation).toBe(1000);
    });

    it('throws when outputReservation is negative', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, outputReservation: -1, sections: { system: {} } }),
      ).toThrow(BudgetConfigError);

      try {
        createBudget({ contextWindow: 8192, outputReservation: -1, sections: { system: {} } });
      } catch (e) {
        const err = e as BudgetConfigError;
        expect(err.validationErrors.some((msg) => /non-negative/i.test(msg))).toBe(true);
      }
    });

    it('throws when outputReservation equals contextWindow', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, outputReservation: 8192, sections: { system: {} } }),
      ).toThrow(BudgetConfigError);
    });

    it('throws when outputReservation exceeds contextWindow', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, outputReservation: 9000, sections: { system: {} } }),
      ).toThrow(BudgetConfigError);
    });
  });

  describe('sections validation', () => {
    it('throws when no sections result (no preset, no sections config)', () => {
      expect(() => createBudget({ contextWindow: 8192 })).toThrow(BudgetConfigError);

      try {
        createBudget({ contextWindow: 8192 });
      } catch (e) {
        const err = e as BudgetConfigError;
        expect(err.validationErrors.some((msg) => /at least one section/i.test(msg))).toBe(true);
      }
    });

    it('accepts a preset without explicit sections', () => {
      const budget = createBudget({ contextWindow: 8192, preset: 'chatbot' });
      expect(budget).toBeDefined();
    });

    it('accepts explicit sections without preset', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      expect(budget).toBeDefined();
    });
  });

  describe('per-section field validation', () => {
    it('throws on negative grow', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, sections: { system: { grow: -1 } } }),
      ).toThrow(BudgetConfigError);

      try {
        createBudget({ contextWindow: 8192, sections: { system: { grow: -1 } } });
      } catch (e) {
        const err = e as BudgetConfigError;
        expect(err.validationErrors.some((msg) => /grow/i.test(msg))).toBe(true);
      }
    });

    it('throws on negative shrink', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, sections: { system: { shrink: -2 } } }),
      ).toThrow(BudgetConfigError);
    });

    it('throws on negative min', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, sections: { system: { min: -10 } } }),
      ).toThrow(BudgetConfigError);
    });

    it('throws on negative priority', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, sections: { system: { priority: -5 } } }),
      ).toThrow(BudgetConfigError);
    });

    it('throws when max < min', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, sections: { system: { min: 500, max: 100 } } }),
      ).toThrow(BudgetConfigError);

      try {
        createBudget({ contextWindow: 8192, sections: { system: { min: 500, max: 100 } } });
      } catch (e) {
        const err = e as BudgetConfigError;
        expect(err.validationErrors.some((msg) => /max.*>=.*min/i.test(msg))).toBe(true);
      }
    });

    it('throws on invalid overflow value', () => {
      expect(() =>
        createBudget({
          contextWindow: 8192,
          sections: { system: { overflow: 'invalid' as never } },
        }),
      ).toThrow(BudgetConfigError);
    });

    it('throws on invalid truncation value', () => {
      expect(() =>
        createBudget({
          contextWindow: 8192,
          sections: { system: { truncation: 'invalid' as never } },
        }),
      ).toThrow(BudgetConfigError);
    });

    it('throws on invalid basis (negative number)', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, sections: { system: { basis: -100 } } }),
      ).toThrow(BudgetConfigError);
    });

    it('throws on invalid basis (non-percentage string)', () => {
      expect(() =>
        createBudget({ contextWindow: 8192, sections: { system: { basis: 'bad' } } }),
      ).toThrow(BudgetConfigError);
    });

    it('accepts basis as auto string', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: { basis: 'auto' } } });
      expect(budget).toBeDefined();
    });

    it('accepts basis as percentage string', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: { basis: '20%' } } });
      expect(budget).toBeDefined();
    });

    it('accepts basis as non-negative number', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: { basis: 1000 } } });
      expect(budget).toBeDefined();
    });

    it('collects multiple section validation errors', () => {
      try {
        createBudget({
          contextWindow: 8192,
          sections: { system: { grow: -1, shrink: -1 } },
        });
      } catch (e) {
        const err = e as BudgetConfigError;
        expect(err.validationErrors.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('returned ContextBudget', () => {
    it('has config property', () => {
      const config = { contextWindow: 8192, sections: { system: {} } };
      const budget = createBudget(config);
      expect(budget.config).toBe(config);
    });

    it('allocate returns an AllocationResult', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      const result = budget.allocate();
      expect(result).toBeDefined();
      expect(result.totalBudget).toBe(8192);
    });

    it('fit returns a FittedContent', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      const result = budget.fit({ system: 'hello' });
      expect(result).toBeDefined();
      expect(result.sections).toHaveLength(1);
    });

    it('report returns a BudgetReport', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      const result = budget.report({ system: 'hello' });
      expect(result).toBeDefined();
      expect(result.totalBudget).toBe(8192);
    });
  });
});

describe('allocate()', () => {
  it('returns correct totalBudget, outputReservation, and availableBudget', () => {
    const budget = createBudget({
      contextWindow: 10000,
      outputReservation: 1000,
      sections: { system: { basis: 0 } },
    });
    const result = budget.allocate();
    expect(result.totalBudget).toBe(10000);
    expect(result.outputReservation).toBe(1000);
    expect(result.availableBudget).toBe(9000);
  });

  it('allocates fixed basis sections with grow:0 and no extras', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: {
        system: { basis: 2000, grow: 0 },
        memory: { basis: 3000, grow: 0 },
      },
    });
    const result = budget.allocate();
    const systemSec = result.sections.find((s) => s.name === 'system')!;
    const memorySec = result.sections.find((s) => s.name === 'memory')!;
    // Basis-only sections with grow:0 get exactly their basis tokens
    expect(systemSec.allocated).toBe(2000);
    expect(memorySec.allocated).toBe(3000);
  });

  it('distributes remaining tokens proportionally by grow factor', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: {
        system: { basis: 0, grow: 1 },
        memory: { basis: 0, grow: 3 },
      },
    });
    const result = budget.allocate();
    const systemSec = result.sections.find((s) => s.name === 'system')!;
    const memorySec = result.sections.find((s) => s.name === 'memory')!;
    // system gets 1/4, memory gets 3/4 of 10000
    expect(systemSec.allocated).toBeCloseTo(2500, -1);
    expect(memorySec.allocated).toBeCloseTo(7500, -1);
  });

  it('handles percentage basis sections with grow:0', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: {
        system: { basis: '20%', grow: 0 },
        memory: { basis: '30%', grow: 0 },
      },
    });
    const result = budget.allocate();
    const systemSec = result.sections.find((s) => s.name === 'system')!;
    const memorySec = result.sections.find((s) => s.name === 'memory')!;
    // percentage of 10000: system=2000, memory=3000
    expect(systemSec.allocated).toBe(2000);
    expect(memorySec.allocated).toBe(3000);
  });

  it('handles a mix of fixed, percentage, and flex sections', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: {
        system: { basis: 1000, grow: 0 },      // fixed: 1000, no growth
        rag: { basis: '20%', grow: 0 },         // percentage: 2000, no growth
        conversation: { basis: 0, grow: 1 },    // flex: absorbs remaining 7000
      },
    });
    const result = budget.allocate();
    const systemSec = result.sections.find((s) => s.name === 'system')!;
    const ragSec = result.sections.find((s) => s.name === 'rag')!;
    const convSec = result.sections.find((s) => s.name === 'conversation')!;
    expect(systemSec.allocated).toBe(1000);
    expect(ragSec.allocated).toBe(2000);
    expect(convSec.allocated).toBe(7000);
  });

  it('respects max cap on sections', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: {
        system: { basis: 0, grow: 1, max: 1000 },
        memory: { basis: 0, grow: 1 },
      },
    });
    const result = budget.allocate();
    const systemSec = result.sections.find((s) => s.name === 'system')!;
    expect(systemSec.allocated).toBeLessThanOrEqual(1000);
  });

  it('throws BudgetExceededError when section minimums exceed available budget', () => {
    expect(() =>
      createBudget({
        contextWindow: 1000,
        sections: {
          system: { basis: 0, min: 600 },
          memory: { basis: 0, min: 600 },
        },
      }).allocate(),
    ).toThrow(BudgetExceededError);

    try {
      createBudget({
        contextWindow: 1000,
        sections: {
          system: { basis: 0, min: 600 },
          memory: { basis: 0, min: 600 },
        },
      }).allocate();
    } catch (e) {
      expect(e).toBeInstanceOf(BudgetExceededError);
      const err = e as BudgetExceededError;
      expect(err.availableBudget).toBe(1000);
      expect(err.requiredMinimum).toBe(1200);
    }
  });

  it('honours explicit sectionOverrides passed to allocate()', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: { system: {}, memory: {} },
    });
    const result = budget.allocate({ system: 3000, memory: 2000 });
    const systemSec = result.sections.find((s) => s.name === 'system')!;
    const memorySec = result.sections.find((s) => s.name === 'memory')!;
    expect(systemSec.allocated).toBe(3000);
    expect(memorySec.allocated).toBe(2000);
  });

  it('section allocation objects have expected shape', () => {
    const budget = createBudget({
      contextWindow: 8192,
      sections: { system: { basis: 1000, priority: 90 } },
    });
    const result = budget.allocate();
    expect(result.sections).toHaveLength(1);
    const sec = result.sections[0];
    expect(sec).toHaveProperty('name');
    expect(sec).toHaveProperty('basis');
    expect(sec).toHaveProperty('allocated');
    expect(sec).toHaveProperty('min');
    expect(sec).toHaveProperty('max');
    expect(sec).toHaveProperty('priority');
    expect(sec).toHaveProperty('overflow');
    expect(sec).toHaveProperty('truncation');
  });

  it('total allocations do not exceed availableBudget (overflowed=false)', () => {
    // Use custom section names (not built-in) so defaults apply cleanly
    // Custom defaults: basis=0, grow=0, shrink=1
    const budget = createBudget({
      contextWindow: 10000,
      outputReservation: 500,
      sections: {
        sysBlock: { basis: '10%', grow: 0 },
        memBlock: { basis: '20%', grow: 0 },
        convBlock: { basis: 0, grow: 1 },
      },
    });
    const result = budget.allocate();
    const total = result.sections.reduce((s, sec) => s + sec.allocated, 0);
    expect(total).toBeLessThanOrEqual(result.availableBudget);
    expect(result.overflowed).toBe(false);
  });
});

describe('fit()', () => {
  it('passes through content that fits within budget', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const shortText = 'Hello world';
    const result = budget.fit({ system: shortText });
    expect(result.sections).toHaveLength(1);
    const sec = result.sections[0];
    expect(sec.content).toBe(shortText);
    expect(sec.truncated).toBe(false);
  });

  it('truncates content that exceeds the section budget', () => {
    // Give system only 10 tokens (=~40 chars) budget
    const budget = createBudget({
      contextWindow: 100,
      sections: { system: { basis: 10 } },
    });
    // 200 chars → ~50 tokens, exceeds 10-token budget
    const longText = 'word '.repeat(40);
    const result = budget.fit({ system: longText });
    const sec = result.sections[0];
    expect(sec.truncated).toBe(true);
    expect(sec.content.endsWith('…')).toBe(true);
    // Truncated content should be shorter than original
    expect(sec.content.length).toBeLessThan(longText.length);
  });

  it('uses custom tokenCounter when provided', () => {
    const counter = (text: string) => text.split(' ').length;
    const budget = createBudget({
      contextWindow: 10000,
      tokenCounter: counter,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const text = 'one two three';
    const result = budget.fit({ system: text });
    expect(result.sections[0].tokens).toBe(counter(text));
  });

  it('sets totalTokens as sum of all section tokens', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: {
        system: { basis: 0, grow: 1 },
        memory: { basis: 0, grow: 1 },
      },
    });
    const result = budget.fit({ system: 'hello', memory: 'world' });
    const expected = result.sections.reduce((s, sec) => s + sec.tokens, 0);
    expect(result.totalTokens).toBe(expected);
  });

  it('sets overflowed=true when any section was truncated', () => {
    const budget = createBudget({
      contextWindow: 100,
      sections: { system: { basis: 5 } },
    });
    const longText = 'word '.repeat(50);
    const result = budget.fit({ system: longText });
    expect(result.overflowed).toBe(true);
  });

  it('sets overflowed=false when no section was truncated', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const result = budget.fit({ system: 'short' });
    expect(result.overflowed).toBe(false);
  });

  it('returns empty string for sections not provided in content map', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: { system: {}, memory: {} },
    });
    const result = budget.fit({ system: 'hello' });
    const memorySec = result.sections.find((s) => s.name === 'memory')!;
    expect(memorySec.content).toBe('');
    expect(memorySec.tokens).toBe(0);
  });
});

describe('report()', () => {
  it('returns BudgetReport with correct shape', () => {
    const budget = createBudget({
      contextWindow: 8192,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const result = budget.report({ system: 'hello world' });
    expect(result).toHaveProperty('totalBudget');
    expect(result).toHaveProperty('used');
    expect(result).toHaveProperty('remaining');
    expect(result).toHaveProperty('utilizationPct');
    expect(result).toHaveProperty('sections');
    expect(Array.isArray(result.sections)).toBe(true);
  });

  it('section reports have correct shape', () => {
    const budget = createBudget({
      contextWindow: 8192,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const result = budget.report({ system: 'hello' });
    const sec = result.sections[0];
    expect(sec).toHaveProperty('name');
    expect(sec).toHaveProperty('allocated');
    expect(sec).toHaveProperty('used');
    expect(sec).toHaveProperty('remaining');
    expect(sec).toHaveProperty('utilizationPct');
  });

  it('totalBudget equals availableBudget from allocate()', () => {
    const budget = createBudget({
      contextWindow: 10000,
      outputReservation: 1000,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const rpt = budget.report({ system: 'hello' });
    expect(rpt.totalBudget).toBe(9000);
  });

  it('remaining = totalBudget - used', () => {
    const budget = createBudget({
      contextWindow: 8192,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const rpt = budget.report({ system: 'hello world' });
    expect(rpt.remaining).toBe(rpt.totalBudget - rpt.used);
  });

  it('utilizationPct is used/totalBudget * 100', () => {
    const budget = createBudget({
      contextWindow: 8192,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const rpt = budget.report({ system: 'hello world' });
    expect(rpt.utilizationPct).toBeCloseTo((rpt.used / rpt.totalBudget) * 100, 5);
  });

  it('section used tokens match content token count for fitting content', () => {
    const counter = (text: string) => text.split(' ').filter(Boolean).length;
    const budget = createBudget({
      contextWindow: 10000,
      tokenCounter: counter,
      sections: { system: { basis: 0, grow: 1 } },
    });
    const text = 'one two three four';
    const rpt = budget.report({ system: text });
    const sec = rpt.sections[0];
    expect(sec.used).toBe(counter(text));
  });

  it('reports correct structure for multiple sections', () => {
    const budget = createBudget({
      contextWindow: 10000,
      sections: {
        system: { basis: 2000 },
        memory: { basis: 3000 },
      },
    });
    const rpt = budget.report({ system: 'sys content', memory: 'mem content' });
    expect(rpt.sections).toHaveLength(2);
    const names = rpt.sections.map((s) => s.name).sort();
    expect(names).toEqual(['memory', 'system'].sort());
  });
});
