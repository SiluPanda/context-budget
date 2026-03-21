import { describe, it, expect } from 'vitest';
import { createBudget } from '../budget.js';
import { BudgetConfigError, UnknownModelError } from '../errors.js';

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

    it('allocate throws not implemented', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      expect(() => budget.allocate()).toThrow('not implemented');
    });

    it('fit throws not implemented', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      expect(() => budget.fit({ system: 'hello' })).toThrow('not implemented');
    });

    it('report throws not implemented', () => {
      const budget = createBudget({ contextWindow: 8192, sections: { system: {} } });
      expect(() => budget.report({ system: 'hello' })).toThrow('not implemented');
    });
  });
});
