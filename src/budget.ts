import type {
  AllocationResult,
  BudgetConfig,
  ContextBudget,
  FittedContent,
  BudgetReport,
} from './types.js';
import { BudgetConfigError, UnknownModelError } from './errors.js';
import { getModelContextWindow } from './models.js';
import { resolveAllSections } from './sections.js';

const VALID_OVERFLOW_STRATEGIES = new Set(['truncate', 'error', 'warn', 'summarize']);
const VALID_TRUNCATION_STRATEGIES = new Set(['head', 'tail', 'middle-out', 'messages']);

function isPercentageString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^\d+(\.\d+)?%$/.test(value);
}

function isValidBasis(value: unknown): boolean {
  if (value === 'auto') return true;
  if (isPercentageString(value)) return true;
  if (typeof value === 'number' && value >= 0) return true;
  return false;
}

export function createBudget(config: BudgetConfig): ContextBudget {
  const errors: string[] = [];

  // Rule 1: Exactly one of contextWindow or model must be set
  const hasContextWindow = config.contextWindow !== undefined;
  const hasModel = config.model !== undefined;

  if (!hasContextWindow && !hasModel) {
    errors.push('Exactly one of contextWindow or model must be set (neither was provided)');
  } else if (hasContextWindow && hasModel) {
    errors.push('Exactly one of contextWindow or model must be set (both were provided)');
  }

  // Collect errors early if neither/both set — skip further resolution
  if (errors.length > 0 && (!hasContextWindow || hasModel)) {
    // Proceed to collect more errors where possible, but only if we can derive contextWindow
    if (!hasContextWindow && !hasModel) {
      throw new BudgetConfigError('Invalid budget configuration', errors);
    }
    if (hasContextWindow && hasModel) {
      throw new BudgetConfigError('Invalid budget configuration', errors);
    }
  }

  let resolvedContextWindow = 0;

  if (hasContextWindow) {
    // Rule 2: contextWindow must be a positive integer
    const cw = config.contextWindow as number;
    if (!Number.isInteger(cw) || cw <= 0) {
      errors.push(`contextWindow must be a positive integer, got: ${cw}`);
    } else {
      resolvedContextWindow = cw;
    }
  } else if (hasModel) {
    // Rule 3: model must resolve via getModelContextWindow
    const cw = getModelContextWindow(config.model as string);
    if (cw === undefined) {
      throw new UnknownModelError(
        `Unknown model: ${config.model}`,
        config.model as string,
      );
    }
    resolvedContextWindow = cw;
  }

  // Rule 4: outputReservation default 0, must be non-negative and < resolvedContextWindow
  const outputReservation = config.outputReservation ?? 0;
  if (outputReservation < 0) {
    errors.push(`outputReservation must be non-negative, got: ${outputReservation}`);
  } else if (resolvedContextWindow > 0 && outputReservation >= resolvedContextWindow) {
    errors.push(
      `outputReservation (${outputReservation}) must be less than contextWindow (${resolvedContextWindow})`,
    );
  }

  // Rule 5: At least one section must result after resolveAllSections
  const resolvedSections = resolveAllSections(config);
  if (Object.keys(resolvedSections).length === 0) {
    errors.push('At least one section must be defined (via preset or sections config)');
  }

  // Rule 6: Per-section validation
  for (const [sectionName, section] of Object.entries(resolvedSections)) {
    const prefix = `Section "${sectionName}"`;

    if (section.grow < 0) {
      errors.push(`${prefix}: grow must be non-negative, got: ${section.grow}`);
    }
    if (section.shrink < 0) {
      errors.push(`${prefix}: shrink must be non-negative, got: ${section.shrink}`);
    }
    if (section.min < 0) {
      errors.push(`${prefix}: min must be non-negative, got: ${section.min}`);
    }
    if (section.priority < 0) {
      errors.push(`${prefix}: priority must be non-negative, got: ${section.priority}`);
    }
    if (section.max <= 0) {
      errors.push(`${prefix}: max must be positive, got: ${section.max}`);
    } else if (section.max < section.min) {
      errors.push(`${prefix}: max (${section.max}) must be >= min (${section.min})`);
    }
    if (!VALID_OVERFLOW_STRATEGIES.has(section.overflow)) {
      errors.push(
        `${prefix}: overflow must be one of truncate|error|warn|summarize, got: ${section.overflow}`,
      );
    }
    if (!VALID_TRUNCATION_STRATEGIES.has(section.truncation)) {
      errors.push(
        `${prefix}: truncation must be one of head|tail|middle-out|messages, got: ${section.truncation}`,
      );
    }
    if (!isValidBasis(section.basis)) {
      errors.push(
        `${prefix}: basis must be a non-negative number, 'auto', or a percentage string like '10%', got: ${String(section.basis)}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new BudgetConfigError('Invalid budget configuration', errors);
  }

  return {
    config,
    allocate(_sections?: Record<string, number>): AllocationResult {
      throw new Error('not implemented');
    },
    fit(_sections: Record<string, string>): FittedContent {
      throw new Error('not implemented');
    },
    report(_sections: Record<string, string>): BudgetReport {
      throw new Error('not implemented');
    },
  };
}
