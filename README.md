# context-budget

Token budget allocator for LLM context windows. Define sections of your prompt -- system, tools, memory, RAG, conversation -- assign flexbox-style grow/shrink factors, and let the allocator distribute your available token budget while respecting minimum/maximum constraints and priority-based triage.

[![npm version](https://img.shields.io/npm/v/context-budget.svg)](https://www.npmjs.com/package/context-budget)
[![license](https://img.shields.io/npm/l/context-budget.svg)](https://github.com/SiluPanda/context-budget/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/context-budget.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

When building LLM applications with multiple context sections -- system prompts, tool definitions, retrieved documents, conversation history, the current user message -- you need to decide how many tokens each section gets. Static allocations waste tokens on short sections and overflow on long ones. `context-budget` replaces manual allocation with a declarative system inspired by CSS flexbox. Each section declares its basis size, grow/shrink factors, and min/max bounds. The allocator computes optimal per-section budgets given the actual content, automatically redistributing unused tokens to sections that need them. Zero runtime dependencies.

## Installation

```bash
npm install context-budget
```

## Quick Start

```ts
import { createBudget } from 'context-budget';

// Create a budget using a known model name and a preset
const budget = createBudget({
  model: 'gpt-4o',
  outputReservation: 4096,
  preset: 'chatbot', // system + conversation + currentMessage
});

// Allocate token budgets across sections
const allocation = budget.allocate();
// allocation.availableBudget  => 123904 (128000 - 4096)
// allocation.sections         => per-section allocations

// Fit actual content into the budget (truncates if necessary)
const fitted = budget.fit({
  system: 'You are a helpful assistant.',
  conversation: 'Long conversation history...',
  currentMessage: 'What is the weather today?',
});
// fitted.sections[0].truncated => false
// fitted.totalTokens           => sum of all section token counts

// Get a utilization report
const report = budget.report({
  system: 'You are a helpful assistant.',
  conversation: 'Long conversation history...',
  currentMessage: 'What is the weather today?',
});
// report.utilizationPct => percentage of budget used
```

You can also specify the context window directly and define custom sections:

```ts
const budget = createBudget({
  contextWindow: 128000,
  outputReservation: 4096,
  sections: {
    system: { basis: 'auto', priority: 100 },
    rag: { basis: '20%', grow: 2, shrink: 1 },
    conversation: { grow: 1, shrink: 1, min: 2000, truncation: 'messages' },
    currentMessage: { basis: 'auto', priority: 100 },
  },
});
```

## Features

- Flexbox-inspired allocation algorithm with basis, grow, shrink, min, max, and priority per section
- Built-in presets for common layouts: chatbot, RAG, agent, and full
- Model registry with 25+ models from OpenAI, Anthropic, Google, and Meta
- Runtime model registration for custom or fine-tuned models
- Percentage-based and absolute token basis values
- Content fitting with automatic word-boundary truncation
- Utilization reporting with per-section breakdowns
- Pluggable token counter (built-in approximate counter: `Math.ceil(text.length / 4)`)
- Four overflow strategies: truncate, error, warn, summarize
- Four truncation strategies: head, tail, middle-out, messages
- Full TypeScript support with strict types for all inputs and outputs
- Zero runtime dependencies

## API Reference

### `createBudget(config: BudgetConfig): ContextBudget`

Creates and validates a new budget allocator. Returns a `ContextBudget` instance with `allocate`, `fit`, and `report` methods.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config` | `BudgetConfig` | Budget configuration object (see Configuration section). |

**Returns:** `ContextBudget` -- an object with `config`, `allocate()`, `fit()`, and `report()` methods.

**Throws:**

- `BudgetConfigError` -- if the configuration is invalid. All validation errors are collected into a single throw with a `validationErrors: string[]` property.
- `UnknownModelError` -- if the `model` string does not match any known or registered model.

```ts
import { createBudget } from 'context-budget';

const budget = createBudget({
  model: 'claude-sonnet-4',
  outputReservation: 4096,
  preset: 'agent',
});
```

---

### `budget.allocate(sectionOverrides?: Record<string, number>): AllocationResult`

Computes token allocations for all sections using the flex algorithm:

1. Sections with a percentage `basis` (e.g. `'20%'`) receive that percentage of the available budget.
2. Sections with a numeric `basis` receive that fixed number of tokens.
3. Sections with `basis: 'auto'` or `grow > 0` share remaining tokens proportionally by grow factor.
4. All allocations are clamped to `[min, max]`.
5. Leftover tokens from floor rounding are distributed to the highest-priority grow sections.

If `sectionOverrides` is provided, it bypasses the flex algorithm and uses those explicit token counts directly (still clamped to `[min, max]`).

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `sectionOverrides` | `Record<string, number>` | Optional. Explicit per-section token counts that bypass the flex algorithm. |

**Returns:** `AllocationResult`

| Field | Type | Description |
|---|---|---|
| `totalBudget` | `number` | Total context window size. |
| `outputReservation` | `number` | Tokens reserved for model output. |
| `availableBudget` | `number` | `totalBudget - outputReservation`. |
| `sections` | `SectionAllocation[]` | Per-section allocation details. |
| `overflowed` | `boolean` | `true` if total allocations exceed the available budget. |

Each `SectionAllocation` contains:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Section name. |
| `basis` | `number` | Resolved numeric basis. |
| `allocated` | `number` | Final token allocation for this section. |
| `min` | `number` | Minimum constraint. |
| `max` | `number` | Maximum constraint. |
| `priority` | `number` | Section priority. |
| `overflow` | `OverflowStrategy` | Overflow strategy for this section. |
| `truncation` | `TruncationStrategy` | Truncation strategy for this section. |

**Throws:** `BudgetExceededError` -- if the sum of all section `min` values exceeds the available budget.

```ts
const budget = createBudget({
  contextWindow: 10000,
  outputReservation: 1000,
  sections: {
    system: { basis: 1000, grow: 0 },
    rag: { basis: '20%', grow: 0 },
    reply: { basis: 0, grow: 1 },
  },
});

const result = budget.allocate();
// result.totalBudget      => 10000
// result.outputReservation => 1000
// result.availableBudget   => 9000
// result.sections[0]       => { name: 'system', allocated: 1000, ... }
// result.sections[1]       => { name: 'rag', allocated: 1800, ... }
// result.sections[2]       => { name: 'reply', allocated: 6200, ... }
// result.overflowed        => false
```

Using explicit overrides:

```ts
const result = budget.allocate({ system: 500, rag: 2000, reply: 3000 });
// Bypasses flex algorithm; values are clamped to [min, max]
```

---

### `budget.fit(sections: Record<string, string>): FittedContent`

Fits content into the allocated budget. For each section, counts the tokens in the provided string content. If the content exceeds its allocated budget, it is truncated at a word boundary and suffixed with an ellipsis character.

The token counter used is either the custom `tokenCounter` from `BudgetConfig` or the built-in default (`Math.ceil(text.length / 4)`).

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `sections` | `Record<string, string>` | Map of section names to content strings. Sections not provided default to an empty string. |

**Returns:** `FittedContent`

| Field | Type | Description |
|---|---|---|
| `sections` | `FittedSection[]` | Per-section fitted content. |
| `totalTokens` | `number` | Sum of all section token counts after fitting. |
| `overflowed` | `boolean` | `true` if any section was truncated. |

Each `FittedSection` contains:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Section name. |
| `content` | `string` | The fitted content (original if it fit, truncated otherwise). |
| `tokens` | `number` | Token count of the fitted content. |
| `truncated` | `boolean` | `true` if the content was truncated to fit. |

```ts
const budget = createBudget({
  contextWindow: 10000,
  sections: {
    system: { basis: 0, grow: 1 },
    rag: { basis: 0, grow: 1 },
  },
});

const result = budget.fit({
  system: 'You are a helpful assistant.',
  rag: 'Very long retrieved document text that may exceed the budget...',
});

for (const sec of result.sections) {
  console.log(`${sec.name}: ${sec.tokens} tokens, truncated=${sec.truncated}`);
}
```

---

### `budget.report(sections: Record<string, string>): BudgetReport`

Returns a utilization summary showing how many tokens are allocated per section, how many were used by the provided content, and overall utilization percentages.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `sections` | `Record<string, string>` | Map of section names to content strings. |

**Returns:** `BudgetReport`

| Field | Type | Description |
|---|---|---|
| `totalBudget` | `number` | Available tokens after output reservation. |
| `used` | `number` | Total tokens consumed across all sections. |
| `remaining` | `number` | `totalBudget - used`. |
| `utilizationPct` | `number` | `(used / totalBudget) * 100`. |
| `sections` | `SectionReport[]` | Per-section breakdown. |

Each `SectionReport` contains:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Section name. |
| `allocated` | `number` | Tokens allocated to this section. |
| `used` | `number` | Tokens actually consumed by the content. |
| `remaining` | `number` | `allocated - used`. |
| `utilizationPct` | `number` | `(used / allocated) * 100`. |

```ts
const budget = createBudget({
  contextWindow: 10000,
  outputReservation: 1000,
  sections: { system: { basis: 0, grow: 1 } },
});

const report = budget.report({ system: 'You are a helpful assistant.' });
// report.totalBudget    => 9000
// report.used           => 8 (approximate token count)
// report.remaining      => 8992
// report.utilizationPct => ~0.09
```

---

### `getModelContextWindow(model: string): number | undefined`

Returns the context window size for a known model name, or `undefined` if the model is not recognized. Resolves aliases automatically (e.g., `claude-sonnet-4-20250514` resolves to `claude-sonnet-4`).

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `model` | `string` | Model name or alias. |

**Returns:** `number | undefined`

```ts
import { getModelContextWindow } from 'context-budget';

getModelContextWindow('gpt-4o');                  // 128000
getModelContextWindow('claude-opus-4');            // 200000
getModelContextWindow('claude-opus-4-20250514');   // 200000 (alias)
getModelContextWindow('gemini-1.5-pro');           // 2097152
getModelContextWindow('unknown-model');            // undefined
```

---

### `registerModel(name: string, contextWindow: number): void`

Registers a custom model at runtime, or overrides an existing built-in model. Registered models are immediately available to `createBudget()` and `getModelContextWindow()`.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Model name. |
| `contextWindow` | `number` | Context window size. Must be a positive integer. |

**Throws:** `Error` if `contextWindow` is not a positive integer.

```ts
import { registerModel, createBudget } from 'context-budget';

registerModel('my-fine-tuned-model', 65536);

const budget = createBudget({
  model: 'my-fine-tuned-model',
  preset: 'chatbot',
});
```

## Configuration

### BudgetConfig

| Field | Type | Default | Description |
|---|---|---|---|
| `contextWindow` | `number` | -- | Total context window size in tokens. Mutually exclusive with `model`. |
| `model` | `string` | -- | Model name to look up the context window size. Mutually exclusive with `contextWindow`. |
| `outputReservation` | `number` | `0` | Tokens reserved for model output. Subtracted from the context window to compute available budget. |
| `preset` | `'chatbot' \| 'rag' \| 'agent' \| 'full'` | -- | Built-in section preset. Sections from the preset can be overridden via `sections`. |
| `sections` | `Record<string, SectionConfig>` | -- | Per-section configuration. Merged on top of preset sections if both are provided. |
| `tokenCounter` | `(text: string) => number` | `Math.ceil(text.length / 4)` | Custom token counting function. Used by `fit()` and `report()`. |

Exactly one of `contextWindow` or `model` must be provided.

### SectionConfig

| Field | Type | Default | Description |
|---|---|---|---|
| `basis` | `number \| string` | Varies by section | Initial allocation. A number (absolute tokens), `'auto'` (content-sized), or a percentage string like `'20%'`. |
| `grow` | `number` | `0` | Flex-grow factor. Controls how much surplus space this section absorbs. `grow: 2` absorbs twice as much as `grow: 1`. |
| `shrink` | `number` | `1` | Flex-shrink factor. Controls how much this section gives up under deficit. `shrink: 0` protects the section. |
| `min` | `number` | `0` | Minimum token allocation (hard floor). |
| `max` | `number` | `Infinity` | Maximum token allocation (hard ceiling). |
| `priority` | `number` | `50` | Triage priority. Lower-priority sections are omitted first when minimums cannot be met. Priority `100` sections are never omitted. |
| `overflow` | `OverflowStrategy` | `'truncate'` | What happens when content exceeds allocation: `'truncate'`, `'error'`, `'warn'`, or `'summarize'`. |
| `truncation` | `TruncationStrategy` | `'head'` | How to truncate: `'head'` (keep start), `'tail'` (keep end), `'middle-out'`, or `'messages'` (drop oldest messages). |

### Presets

Built-in presets provide common section layouts:

| Preset | Sections |
|---|---|
| `'chatbot'` | system, conversation, currentMessage |
| `'rag'` | system, rag, currentMessage |
| `'agent'` | system, tools, memory, conversation, currentMessage |
| `'full'` | system, tools, memory, rag, conversation, currentMessage |

Each preset section uses the built-in defaults shown below. Use the `sections` config to override individual fields on top of a preset.

### Built-in Section Defaults

| Section | basis | grow | shrink | min | priority | overflow | truncation |
|---|---|---|---|---|---|---|---|
| `system` | `'auto'` | 0 | 0 | 0 | 100 | `'error'` | `'head'` |
| `tools` | `'auto'` | 0 | 1 | 0 | 70 | `'warn'` | `'tail'` |
| `memory` | 0 | 1 | 2 | 0 | 50 | `'truncate'` | `'tail'` |
| `rag` | 0 | 2 | 1 | 0 | 50 | `'truncate'` | `'tail'` |
| `conversation` | 0 | 1 | 1 | 2000 | 80 | `'truncate'` | `'messages'` |
| `currentMessage` | `'auto'` | 0 | 0 | 0 | 100 | `'error'` | `'tail'` |

Custom section names (any name not listed above) use: basis `0`, grow `0`, shrink `1`, min `0`, max `Infinity`, priority `50`, overflow `'truncate'`, truncation `'head'`.

### Supported Models

The built-in model registry includes context window sizes for:

**OpenAI:** gpt-4o (128K), gpt-4o-mini (128K), gpt-4-turbo (128K), gpt-4 (8K), gpt-4-32k (32K), gpt-3.5-turbo (16K), gpt-3.5-turbo-16k (16K), gpt-4.1 (1M), gpt-4.1-mini (1M), gpt-4.1-nano (1M), o1 (200K), o1-mini (128K), o3 (200K), o3-mini (200K), o4-mini (200K)

**Anthropic:** claude-opus-4 (200K), claude-sonnet-4 (200K), claude-3-5-sonnet-20241022 (200K), claude-3-5-haiku-20241022 (200K), claude-3-haiku-20240307 (200K)

**Google:** gemini-2.5-pro (1M), gemini-2.5-flash (1M), gemini-2.0-flash (1M), gemini-1.5-pro (2M), gemini-1.5-flash (1M)

**Meta:** llama-4-scout (10M), llama-4-maverick (1M), llama-3.3-70b (131K), llama-3.1-405b (131K)

**Aliases:** `claude-sonnet-4-20250514` resolves to `claude-sonnet-4`, `claude-opus-4-20250514` resolves to `claude-opus-4`.

## Error Handling

All errors extend `BudgetError`, which extends the native `Error` class and adds a `code: string` property for programmatic error handling.

### BudgetConfigError

Thrown by `createBudget()` when the configuration is invalid. All validation errors are collected into a single throw.

| Property | Type | Description |
|---|---|---|
| `code` | `'BUDGET_CONFIG_ERROR'` | Error code. |
| `validationErrors` | `string[]` | List of all validation errors found. |

```ts
import { createBudget, BudgetConfigError } from 'context-budget';

try {
  createBudget({ contextWindow: -1, sections: { system: { grow: -1 } } });
} catch (err) {
  if (err instanceof BudgetConfigError) {
    console.error('Validation errors:', err.validationErrors);
    // ['contextWindow must be a positive integer, got: -1',
    //  'Section "system": grow must be non-negative, got: -1']
  }
}
```

### BudgetExceededError

Thrown by `allocate()` when the sum of all section `min` values exceeds the available budget.

| Property | Type | Description |
|---|---|---|
| `code` | `'BUDGET_EXCEEDED'` | Error code. |
| `availableBudget` | `number` | The available budget. |
| `requiredMinimum` | `number` | The sum of all section minimums. |
| `sections` | `string[]` | Names of sections with non-zero minimums. |

```ts
import { createBudget, BudgetExceededError } from 'context-budget';

try {
  const budget = createBudget({
    contextWindow: 1000,
    sections: {
      system: { min: 600 },
      memory: { min: 600 },
    },
  });
  budget.allocate();
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.error(`Need ${err.requiredMinimum} tokens but only ${err.availableBudget} available`);
  }
}
```

### SectionOverflowError

Thrown when a section with `overflow: 'error'` has content that exceeds its allocation.

| Property | Type | Description |
|---|---|---|
| `code` | `'SECTION_OVERFLOW'` | Error code. |
| `section` | `string` | Name of the overflowing section. |
| `allocated` | `number` | Tokens allocated to the section. |
| `actual` | `number` | Actual token count of the content. |

### UnknownModelError

Thrown by `createBudget()` when the `model` string does not match any known or registered model.

| Property | Type | Description |
|---|---|---|
| `code` | `'UNKNOWN_MODEL'` | Error code. |
| `model` | `string` | The unrecognized model name. |

```ts
import { createBudget, UnknownModelError } from 'context-budget';

try {
  createBudget({ model: 'gpt-99', sections: { system: {} } });
} catch (err) {
  if (err instanceof UnknownModelError) {
    console.error(`Model not found: ${err.model}`);
  }
}
```

## Advanced Usage

### Custom Token Counter

The built-in token counter (`Math.ceil(text.length / 4)`) is a rough approximation. For production use, provide an exact token counter:

```ts
import { createBudget } from 'context-budget';
import { encoding_for_model } from 'tiktoken';

const enc = encoding_for_model('gpt-4o');

const budget = createBudget({
  model: 'gpt-4o',
  outputReservation: 4096,
  tokenCounter: (text) => enc.encode(text).length,
  preset: 'agent',
});
```

### Mixing Presets with Custom Sections

Start from a preset and override or add sections:

```ts
const budget = createBudget({
  model: 'gpt-4o',
  outputReservation: 4096,
  preset: 'agent',
  sections: {
    // Override the conversation section from the preset
    conversation: { min: 4000, grow: 2 },
    // Add a custom section not in the preset
    fewShotExamples: { basis: 1000, grow: 0, priority: 60 },
  },
});
```

### Explicit Section Overrides

Bypass the flex algorithm when you already know the exact token counts:

```ts
const budget = createBudget({
  contextWindow: 128000,
  outputReservation: 4096,
  sections: {
    system: { min: 100 },
    rag: {},
    conversation: { min: 2000 },
  },
});

// Use pre-counted token sizes directly
const result = budget.allocate({
  system: 450,
  rag: 8000,
  conversation: 12000,
});
```

### Multi-Model Switching

The same section definitions produce different allocations for different models:

```ts
const sections = {
  system: { basis: 500, grow: 0 },
  rag: { basis: '20%', grow: 1 },
  conversation: { grow: 1, min: 2000 },
};

// GPT-4o: 128K context
const gpt4o = createBudget({ model: 'gpt-4o', outputReservation: 4096, sections });
const gpt4oAlloc = gpt4o.allocate();

// GPT-4: 8K context
const gpt4 = createBudget({ model: 'gpt-4', outputReservation: 1024, sections });
const gpt4Alloc = gpt4.allocate();

// Allocations scale proportionally to the context window
```

### Registering Custom Models

```ts
import { registerModel, getModelContextWindow, createBudget } from 'context-budget';

registerModel('my-org/fine-tuned-llama', 131072);

// Verify registration
getModelContextWindow('my-org/fine-tuned-llama'); // 131072

// Use in a budget
const budget = createBudget({
  model: 'my-org/fine-tuned-llama',
  preset: 'rag',
});
```

## TypeScript

All types are exported from the package entry point:

```ts
import type {
  BudgetConfig,
  SectionConfig,
  OverflowStrategy,
  TruncationStrategy,
  TokenCounter,
  AllocationResult,
  SectionAllocation,
  FittedContent,
  FittedSection,
  BudgetReport,
  SectionReport,
  ContextBudget,
  Message,
} from 'context-budget';
```

The `ContextBudget` interface defines the object returned by `createBudget()`:

```ts
interface ContextBudget {
  readonly config: BudgetConfig;
  allocate(sections?: Record<string, number>): AllocationResult;
  fit(sections: Record<string, string>): FittedContent;
  report(sections: Record<string, string>): BudgetReport;
}
```

## License

MIT
