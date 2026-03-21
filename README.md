# context-budget

Token budget allocator for LLM context windows. Define sections of your prompt (system, tools, memory, RAG, conversation, etc.), assign flex-box-style grow/shrink factors, and let the allocator distribute your available token budget across sections while respecting minimum/maximum constraints and priority-based triage.

## Installation

```bash
npm install context-budget
```

## Quick Start

```ts
import { createBudget } from 'context-budget';

// Create a budget using a known model name
const budget = createBudget({
  model: 'gpt-4o',
  outputReservation: 4096,
  preset: 'chatbot', // system + conversation + currentMessage
});

// Or specify the context window directly
const budget2 = createBudget({
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

## API

### `createBudget(config: BudgetConfig): ContextBudget`

Creates a new budget allocator. Validates the configuration and returns a `ContextBudget` instance.

```ts
const budget = createBudget({
  contextWindow: 128000,
  preset: 'agent',
});
```

**Throws:**
- `BudgetConfigError` if the configuration is invalid (all validation errors collected into a single throw).
- `UnknownModelError` if the `model` string does not match any known or registered model.

### `getModelContextWindow(model: string): number | undefined`

Returns the context window size for a known model name, or `undefined` if the model is not recognized. Resolves aliases automatically.

```ts
import { getModelContextWindow } from 'context-budget';

getModelContextWindow('gpt-4o');       // 128000
getModelContextWindow('claude-opus-4'); // 200000
getModelContextWindow('unknown');       // undefined
```

### `registerModel(name: string, contextWindow: number): void`

Registers a custom model (or overrides a built-in model) at runtime.

```ts
import { registerModel } from 'context-budget';

registerModel('my-fine-tuned-model', 65536);
```

**Throws** if `contextWindow` is not a positive integer.

## Configuration

### `BudgetConfig`

| Field | Type | Description |
|---|---|---|
| `contextWindow` | `number` | Total context window size in tokens. Mutually exclusive with `model`. |
| `model` | `string` | Model name to look up context window size. Mutually exclusive with `contextWindow`. |
| `outputReservation` | `number` | Tokens reserved for model output (default `0`). |
| `preset` | `'chatbot' \| 'rag' \| 'agent' \| 'full'` | Built-in section preset to start from. |
| `sections` | `Record<string, SectionConfig>` | Per-section configuration. Overrides/extends preset sections. |
| `tokenCounter` | `(text: string) => number` | Custom token counting function. |

Exactly one of `contextWindow` or `model` must be provided.

### `SectionConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `basis` | `number \| string` | Varies | Initial allocation. A number (tokens), `'auto'` (size from content), or a percentage string like `'20%'`. |
| `grow` | `number` | `0` | Flex-grow factor for absorbing surplus tokens. |
| `shrink` | `number` | `1` | Flex-shrink factor for reducing allocation when over budget. |
| `min` | `number` | `0` | Minimum token allocation (floor). |
| `max` | `number` | `Infinity` | Maximum token allocation (ceiling). |
| `priority` | `number` | `50` | Triage priority. Lower values are omitted first. Priority `100` sections are never omitted. |
| `overflow` | `OverflowStrategy` | `'truncate'` | What to do when content exceeds allocation: `'truncate'`, `'error'`, `'warn'`, or `'summarize'`. |
| `truncation` | `TruncationStrategy` | `'head'` | How to truncate: `'head'` (keep start), `'tail'` (keep end), `'middle-out'`, or `'messages'`. |

## Presets

Built-in presets provide common section layouts:

| Preset | Sections |
|---|---|
| `'chatbot'` | system, conversation, currentMessage |
| `'rag'` | system, rag, currentMessage |
| `'agent'` | system, tools, memory, conversation, currentMessage |
| `'full'` | system, tools, memory, rag, conversation, currentMessage |

Each preset section comes with sensible defaults. Use the `sections` config to override individual fields.

## Built-in Sections

| Section | basis | grow | shrink | min | priority | overflow | truncation |
|---|---|---|---|---|---|---|---|
| `system` | `'auto'` | 0 | 0 | 0 | 100 | `'error'` | `'head'` |
| `tools` | `'auto'` | 0 | 1 | 0 | 70 | `'warn'` | `'tail'` |
| `memory` | 0 | 1 | 2 | 0 | 50 | `'truncate'` | `'tail'` |
| `rag` | 0 | 2 | 1 | 0 | 50 | `'truncate'` | `'tail'` |
| `conversation` | 0 | 1 | 1 | 2000 | 80 | `'truncate'` | `'messages'` |
| `currentMessage` | `'auto'` | 0 | 0 | 0 | 100 | `'error'` | `'tail'` |

Custom section names use these defaults: basis `0`, grow `0`, shrink `1`, min `0`, max `Infinity`, priority `50`, overflow `'truncate'`, truncation `'head'`.

## Supported Models

The model registry includes context window sizes for:

- **OpenAI:** gpt-4o (128K), gpt-4o-mini (128K), gpt-4-turbo (128K), gpt-4 (8K), gpt-4-32k (32K), gpt-3.5-turbo (16K), gpt-4.1/mini/nano (1M), o1 (200K), o1-mini (128K), o3 (200K), o3-mini (200K), o4-mini (200K)
- **Anthropic:** claude-opus-4 (200K), claude-sonnet-4 (200K), claude-3.5-sonnet (200K), claude-3.5-haiku (200K), claude-3-haiku (200K)
- **Google:** gemini-2.5-pro (1M), gemini-2.5-flash (1M), gemini-2.0-flash (1M), gemini-1.5-pro (2M), gemini-1.5-flash (1M)
- **Meta:** llama-4-scout (10M), llama-4-maverick (1M), llama-3.3-70b (131K), llama-3.1-405b (131K)

Aliases: `claude-sonnet-4-20250514` and `claude-opus-4-20250514` resolve to their short names.

## Error Classes

All errors extend `BudgetError` (which extends `Error`):

| Error | Code | Description |
|---|---|---|
| `BudgetError` | varies | Base error class with `code: string`. |
| `BudgetConfigError` | `BUDGET_CONFIG_ERROR` | Invalid configuration. Contains `validationErrors: string[]`. |
| `BudgetExceededError` | `BUDGET_EXCEEDED` | Budget cannot satisfy minimum constraints. |
| `SectionOverflowError` | `SECTION_OVERFLOW` | Section content exceeds allocation (with `overflow: 'error'`). |
| `UnknownModelError` | `UNKNOWN_MODEL` | Model name not found in registry. |

## Types

All TypeScript types and interfaces are exported:

- `BudgetConfig`, `SectionConfig`
- `OverflowStrategy`, `TruncationStrategy`, `TokenCounter`
- `AllocationResult`, `SectionAllocation`
- `FittedContent`, `FittedSection`
- `BudgetReport`, `SectionReport`
- `ContextBudget`, `Message`

## License

MIT
