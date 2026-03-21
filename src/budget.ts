import type {
  AllocationResult,
  BudgetConfig,
  ContextBudget,
  FittedContent,
  BudgetReport,
  SectionAllocation,
  FittedSection,
  SectionReport,
} from './types.js';
import { BudgetConfigError, BudgetExceededError, UnknownModelError } from './errors.js';
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

  // ---- helpers captured in closure ----

  const defaultCounter = (text: string): number => Math.ceil(text.length / 4);

  function computeAllocation(sectionOverrides?: Record<string, number>): AllocationResult {
    const totalBudget = resolvedContextWindow;
    const reservation = config.outputReservation ?? 0;
    const available = totalBudget - reservation;

    const sectionEntries = Object.entries(resolvedSections);

    // If caller provided explicit per-section token counts, honour them directly.
    if (sectionOverrides !== undefined) {
      const allocations: SectionAllocation[] = sectionEntries.map(([name, sec]) => {
        const raw = sectionOverrides[name] ?? 0;
        const min = sec.min;
        const max = sec.max === Infinity ? available : sec.max;
        const allocated = Math.min(Math.max(raw, min), max);
        return {
          name,
          basis: typeof sec.basis === 'number' ? sec.basis : 0,
          allocated,
          min,
          max,
          priority: sec.priority,
          overflow: sec.overflow,
          truncation: sec.truncation,
        };
      });
      const totalAllocated = allocations.reduce((s, a) => s + a.allocated, 0);
      return {
        totalBudget,
        outputReservation: reservation,
        availableBudget: available,
        sections: allocations,
        overflowed: totalAllocated > available,
      };
    }

    // --- Phase 1: resolve numeric basis for every section ---
    // basis = number → fixed
    // basis = 'X%'  → percentage of available
    // basis = 'auto' → 0 for now (grows later)
    const basisMap: Record<string, number> = {};
    for (const [name, sec] of sectionEntries) {
      if (typeof sec.basis === 'number') {
        basisMap[name] = sec.basis;
      } else if (typeof sec.basis === 'string' && sec.basis !== 'auto') {
        const pct = parseFloat(sec.basis) / 100;
        basisMap[name] = Math.floor(pct * available);
      } else {
        // 'auto' — treated as 0 basis but eligible to grow
        basisMap[name] = 0;
      }
    }

    // --- Phase 2: compute remaining after basis allocations ---
    const basisTotal = Object.values(basisMap).reduce((s, v) => s + v, 0);
    let remaining = available - basisTotal;

    // --- Phase 3: distribute remaining to sections with grow > 0 ---
    const growSections = sectionEntries.filter(([, sec]) => sec.grow > 0 || sec.basis === 'auto');
    const totalGrow = growSections.reduce((s, [, sec]) => s + Math.max(sec.grow, 1), 0);

    const growExtra: Record<string, number> = {};
    for (const [name, sec] of growSections) {
      const weight = Math.max(sec.grow, 1);
      growExtra[name] = remaining > 0 ? Math.floor((weight / totalGrow) * remaining) : 0;
    }

    // Assign leftover from floor rounding to highest-priority grow section
    const allocatedSoFar = Object.values(basisMap).reduce((s, v) => s + v, 0)
      + Object.values(growExtra).reduce((s, v) => s + v, 0);
    let leftover = available - allocatedSoFar;

    // Sort grow sections by priority descending to give leftover to highest priority first
    const sortedGrow = [...growSections].sort(([, a], [, b]) => b.priority - a.priority);
    for (const [name] of sortedGrow) {
      if (leftover <= 0) break;
      growExtra[name] = (growExtra[name] ?? 0) + 1;
      leftover -= 1;
    }

    // --- Phase 4: combine basis + grow, then clamp to [min, max] ---
    const rawAllocations: Record<string, number> = {};
    for (const [name] of sectionEntries) {
      rawAllocations[name] = (basisMap[name] ?? 0) + (growExtra[name] ?? 0);
    }

    // --- Phase 5: enforce min constraints ---
    // Check total mins are satisfiable
    const totalMins = sectionEntries.reduce((s, [, sec]) => s + sec.min, 0);
    if (totalMins > available) {
      throw new BudgetExceededError(
        `Section minimums (${totalMins}) exceed available budget (${available})`,
        available,
        totalMins,
        sectionEntries.filter(([, sec]) => sec.min > 0).map(([name]) => name),
      );
    }

    // Apply min/max clamps
    const allocations: SectionAllocation[] = sectionEntries.map(([name, sec]) => {
      const raw = rawAllocations[name] ?? 0;
      const effectiveMax = sec.max === Infinity ? available : sec.max;
      const allocated = Math.min(Math.max(raw, sec.min), effectiveMax);
      return {
        name,
        basis: typeof sec.basis === 'number' ? sec.basis : 0,
        allocated,
        min: sec.min,
        max: effectiveMax,
        priority: sec.priority,
        overflow: sec.overflow,
        truncation: sec.truncation,
      };
    });

    const totalAllocated = allocations.reduce((s, a) => s + a.allocated, 0);

    return {
      totalBudget,
      outputReservation: reservation,
      availableBudget: available,
      sections: allocations,
      overflowed: totalAllocated > available,
    };
  }

  // Track last fit result for report()
  let lastFitSections: Record<string, string> | null = null;
  let lastFitResult: FittedContent | null = null;

  return {
    config,

    allocate(sectionOverrides?: Record<string, number>): AllocationResult {
      return computeAllocation(sectionOverrides);
    },

    fit(sectionContent: Record<string, string>): FittedContent {
      const counter = config.tokenCounter ?? defaultCounter;
      const allocation = computeAllocation();
      const allocationMap: Record<string, number> = {};
      for (const sec of allocation.sections) {
        allocationMap[sec.name] = sec.allocated;
      }

      const fitted: FittedSection[] = [];
      let totalTokens = 0;
      let anyOverflowed = false;

      for (const sec of allocation.sections) {
        const content = sectionContent[sec.name] ?? '';
        const contentTokens = counter(content);
        const budget = allocationMap[sec.name] ?? 0;

        if (contentTokens <= budget) {
          fitted.push({ name: sec.name, content, tokens: contentTokens, truncated: false });
          totalTokens += contentTokens;
        } else {
          // Truncate: estimate chars per token, then find last word boundary
          anyOverflowed = true;
          const charsPerToken = content.length / contentTokens;
          const targetChars = Math.floor(budget * charsPerToken);
          // Reserve room for the ellipsis (1 token ~ 4 chars, just use 1 char for '…')
          const cutAt = Math.max(0, targetChars - 1);
          let truncated = content.slice(0, cutAt);
          // Snap to last word boundary
          const lastSpace = truncated.lastIndexOf(' ');
          if (lastSpace > 0) {
            truncated = truncated.slice(0, lastSpace);
          }
          truncated = truncated + '…';
          const truncatedTokens = Math.min(counter(truncated), budget);
          fitted.push({ name: sec.name, content: truncated, tokens: truncatedTokens, truncated: true });
          totalTokens += truncatedTokens;
        }
      }

      lastFitSections = sectionContent;
      lastFitResult = { sections: fitted, totalTokens, overflowed: anyOverflowed };
      return lastFitResult;
    },

    report(sectionContent: Record<string, string>): BudgetReport {
      const counter = config.tokenCounter ?? defaultCounter;
      const allocation = computeAllocation();

      // Determine used tokens per section from sectionContent
      const usedMap: Record<string, number> = {};

      // If fit was already called with the same content, reuse; otherwise compute fresh
      let fitResult: FittedContent;
      if (
        lastFitResult !== null &&
        lastFitSections !== null &&
        JSON.stringify(lastFitSections) === JSON.stringify(sectionContent)
      ) {
        fitResult = lastFitResult;
      } else {
        // Compute fit to get actual used tokens
        fitResult = this.fit(sectionContent);
      }

      for (const sec of fitResult.sections) {
        usedMap[sec.name] = sec.tokens;
      }

      const totalUsed = fitResult.totalTokens;
      const totalBudget = allocation.availableBudget;

      const sectionReports: SectionReport[] = allocation.sections.map((sec) => {
        const used = usedMap[sec.name] ?? counter(sectionContent[sec.name] ?? '');
        const remaining = Math.max(0, sec.allocated - used);
        const utilizationPct = sec.allocated > 0 ? (used / sec.allocated) * 100 : 0;
        return { name: sec.name, allocated: sec.allocated, used, remaining, utilizationPct };
      });

      return {
        totalBudget,
        used: totalUsed,
        remaining: Math.max(0, totalBudget - totalUsed),
        utilizationPct: totalBudget > 0 ? (totalUsed / totalBudget) * 100 : 0,
        sections: sectionReports,
      };
    },
  };
}
