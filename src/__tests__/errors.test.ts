import { describe, it, expect } from 'vitest';
import {
  BudgetError,
  BudgetExceededError,
  SectionOverflowError,
  BudgetConfigError,
  UnknownModelError,
} from '../errors.js';

describe('BudgetError', () => {
  it('sets message and code', () => {
    const err = new BudgetError('something went wrong', 'SOME_CODE');
    expect(err.message).toBe('something went wrong');
    expect(err.code).toBe('SOME_CODE');
  });

  it('is an instance of Error', () => {
    const err = new BudgetError('msg', 'CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BudgetError);
  });

  it('has name BudgetError', () => {
    const err = new BudgetError('msg', 'CODE');
    expect(err.name).toBe('BudgetError');
  });
});

describe('BudgetExceededError', () => {
  const err = new BudgetExceededError('budget exceeded', 1000, 1500, ['system', 'rag']);

  it('has code BUDGET_EXCEEDED', () => {
    expect(err.code).toBe('BUDGET_EXCEEDED');
  });

  it('sets message', () => {
    expect(err.message).toBe('budget exceeded');
  });

  it('sets availableBudget', () => {
    expect(err.availableBudget).toBe(1000);
  });

  it('sets requiredMinimum', () => {
    expect(err.requiredMinimum).toBe(1500);
  });

  it('sets sections', () => {
    expect(err.sections).toEqual(['system', 'rag']);
  });

  it('is instanceof BudgetError and Error', () => {
    expect(err).toBeInstanceOf(BudgetError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BudgetExceededError);
  });

  it('has name BudgetExceededError', () => {
    expect(err.name).toBe('BudgetExceededError');
  });
});

describe('SectionOverflowError', () => {
  const err = new SectionOverflowError('section overflow', 'rag', 500, 800);

  it('has code SECTION_OVERFLOW', () => {
    expect(err.code).toBe('SECTION_OVERFLOW');
  });

  it('sets message', () => {
    expect(err.message).toBe('section overflow');
  });

  it('sets section', () => {
    expect(err.section).toBe('rag');
  });

  it('sets allocated', () => {
    expect(err.allocated).toBe(500);
  });

  it('sets actual', () => {
    expect(err.actual).toBe(800);
  });

  it('is instanceof BudgetError and Error', () => {
    expect(err).toBeInstanceOf(BudgetError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SectionOverflowError);
  });

  it('has name SectionOverflowError', () => {
    expect(err.name).toBe('SectionOverflowError');
  });
});

describe('BudgetConfigError', () => {
  const err = new BudgetConfigError('bad config', ['field A is invalid', 'field B missing']);

  it('has code BUDGET_CONFIG_ERROR', () => {
    expect(err.code).toBe('BUDGET_CONFIG_ERROR');
  });

  it('sets message', () => {
    expect(err.message).toBe('bad config');
  });

  it('sets validationErrors', () => {
    expect(err.validationErrors).toEqual(['field A is invalid', 'field B missing']);
  });

  it('is instanceof BudgetError and Error', () => {
    expect(err).toBeInstanceOf(BudgetError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BudgetConfigError);
  });

  it('has name BudgetConfigError', () => {
    expect(err.name).toBe('BudgetConfigError');
  });
});

describe('UnknownModelError', () => {
  const err = new UnknownModelError('unknown model: gpt-99', 'gpt-99');

  it('has code UNKNOWN_MODEL', () => {
    expect(err.code).toBe('UNKNOWN_MODEL');
  });

  it('sets message', () => {
    expect(err.message).toBe('unknown model: gpt-99');
  });

  it('sets model', () => {
    expect(err.model).toBe('gpt-99');
  });

  it('is instanceof BudgetError and Error', () => {
    expect(err).toBeInstanceOf(BudgetError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnknownModelError);
  });

  it('has name UnknownModelError', () => {
    expect(err.name).toBe('UnknownModelError');
  });
});
