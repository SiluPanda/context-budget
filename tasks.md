# context-budget — Implementation Tasks

## Phase 1: Project Scaffolding & Types

- [ ] **Install dev dependencies** — Install `typescript`, `vitest`, and `eslint` as devDependencies. Verify `npm run build`, `npm run test`, and `npm run lint` scripts work with empty source. | Status: not_done

- [ ] **Define core type definitions in `src/types.ts`** — Create all TypeScript interfaces and types specified in the spec: `BudgetConfig`, `SectionConfig`, `OverflowStrategy` (`'truncate' | 'error' | 'warn' | 'summarize'`), `TruncationStrategy` (`'head' | 'tail' | 'middle-out' | 'messages'`), `TokenCounter` (`(text: string) => number`), `AllocationResult`, `SectionAllocation`, `FittedContent`, `FittedSection`, `BudgetReport`, `SectionReport`, `OverflowEvent`, `Message` (with `role`, `content`, `tool_calls`, `tool_call_id`, `name`), and the `ContextBudget` interface. Ensure `BudgetConfig.contextWindow` and `BudgetConfig.model` are mutually exclusive via the type (both optional). `SectionConfig.basis` must accept `number | string` (including `'auto'` and percentage strings like `'10%'`). | Status: not_done

- [ ] **Define error classes in `src/errors.ts`** — Implement `BudgetError` (base class extending `Error` with `readonly code: string`), `BudgetExceededError` (code `'BUDGET_EXCEEDED'`, fields: `availableBudget`, `requiredMinimum`, `sections`), `SectionOverflowError` (code `'SECTION_OVERFLOW'`, fields: `section`, `allocated`, `actual`), `BudgetConfigError` (code `'BUDGET_CONFIG_ERROR'`, field: `validationErrors: string[]`), `UnknownModelError` (code `'UNKNOWN_MODEL'`, field: `model`). | Status: not_done

- [ ] **Set up `src/index.ts` with public API exports** — Export `createBudget`, `registerModel`, `getModelContextWindow`, all type definitions, and all error classes. This file is the public entry point; it re-exports from internal modules. | Status: not_done

---

## Phase 2: Built-in Section Presets & Model Registry

- [ ] **Implement built-in section presets in `src/sections.ts`** — Define default `SectionConfig` values for each built-in section type: `system` (basis `'auto'`, grow 0, shrink 0, min 0, max Infinity, priority 100, overflow `'error'`, truncation `'head'`), `tools` (basis `'auto'`, grow 0, shrink 1, min 0, max Infinity, priority 70, overflow `'warn'`, truncation `'tail'`), `memory` (basis 0, grow 1, shrink 2, min 0, max Infinity, priority 50, overflow `'truncate'`, truncation `'tail'`), `rag` (basis 0, grow 2, shrink 1, min 0, max Infinity, priority 50, overflow `'truncate'`, truncation `'tail'`), `conversation` (basis 0, grow 1, shrink 1, min 2000, max Infinity, priority 80, overflow `'truncate'`, truncation `'messages'`), `currentMessage` (basis `'auto'`, grow 0, shrink 0, min 0, max Infinity, priority 100, overflow `'error'`, truncation `'tail'`). Also define default values for custom sections (basis 0, grow 0, shrink 1, min 0, max Infinity, priority 50, overflow `'truncate'`, truncation `'head'`). | Status: not_done

- [ ] **Implement preset configurations in `src/sections.ts`** — Define the four preset configurations: `'chatbot'` (system, conversation, currentMessage), `'rag'` (system, rag, currentMessage), `'agent'` (system, tools, memory, conversation, currentMessage), `'full'` (system, tools, memory, rag, conversation, currentMessage). Each preset populates the sections map with the built-in section defaults. Caller-provided `sections` config overrides preset values via shallow merge per section. | Status: not_done

- [ ] **Implement model preset registry in `src/models.ts`** — Create a mutable map of model names to context window sizes. Populate with all built-in models: OpenAI (`gpt-4o` 128000, `gpt-4o-mini` 128000, `gpt-4-turbo` 128000, `gpt-4` 8192, `gpt-4-32k` 32768, `gpt-3.5-turbo` 16385, `gpt-3.5-turbo-16k` 16385, `gpt-4.1` 1047576, `gpt-4.1-mini` 1047576, `gpt-4.1-nano` 1047576, `gpt-5` 400000, `o1` 200000, `o1-mini` 128000, `o3` 200000, `o3-mini` 200000, `o4-mini` 200000), Anthropic (`claude-sonnet-4-20250514` 200000, `claude-opus-4-20250514` 200000, `claude-3-5-sonnet-20241022` 200000, `claude-3-5-haiku-20241022` 200000, `claude-3-haiku-20240307` 200000), Google (`gemini-2.5-pro` 1048576, `gemini-2.5-flash` 1048576, `gemini-2.0-flash` 1048576, `gemini-1.5-pro` 2097152, `gemini-1.5-flash` 1048576), Meta (`llama-4-scout` 10000000, `llama-4-maverick` 1048576, `llama-3.3-70b` 131072, `llama-3.1-405b` 131072). | Status: not_done

- [ ] **Implement model aliases in `src/models.ts`** — Support convenience aliases: `claude-sonnet-4` resolves to `claude-sonnet-4-20250514`, `claude-opus-4` resolves to `claude-opus-4-20250514`. Alias resolution should be transparent to the caller. | Status: not_done

- [ ] **Implement `registerModel()` function** — Allow runtime registration of custom models with a name and context window size. Registered models override built-in models if the name collides. Validate that contextWindow is a positive integer. | Status: not_done

- [ ] **Implement `getModelContextWindow()` function** — Return the context window size for a model name, or `undefined` if not recognized. Check aliases first, then the main registry. | Status: not_done

---

## Phase 3: Configuration Validation

- [ ] **Implement configuration validation in `src/budget.ts`** — Validate all `BudgetConfig` fields when `createBudget()` is called. Collect all validation errors into a `string[]` and throw a single `BudgetConfigError` if any errors are found. Validations: (1) Exactly one of `contextWindow` or `model` must be specified (not both, not neither). (2) If `contextWindow` is specified, it must be a positive integer. (3) If `model` is specified, it must resolve to a known model (throw `UnknownModelError` if not). (4) `outputReservation` must be non-negative and less than `contextWindow`. (5) At least one section must be defined (either via `sections` or `preset`). | Status: not_done

- [ ] **Implement per-section config validation** — For each section in the resolved config: `grow` must be non-negative, `shrink` must be non-negative, `min` must be non-negative, `max` must be positive and >= `min`, `priority` must be non-negative, `overflow` must be one of the four valid strategies, `truncation` must be one of the four valid strategies, `basis` must be a non-negative number, a valid percentage string (e.g. `'10%'`), or `'auto'`. Collect all errors with section name context and throw `BudgetConfigError`. | Status: not_done

- [ ] **Implement section config merging logic** — When a built-in section name is used (e.g. `system`, `tools`), shallow-merge the caller's partial config on top of the built-in defaults. When a custom section name is used, shallow-merge on top of the custom section defaults (basis 0, grow 0, shrink 1, min 0, max Infinity, priority 50). When a preset is used, start with the preset's sections, then apply the caller's `sections` overrides. | Status: not_done

---

## Phase 4: Core Allocation Algorithm

- [ ] **Implement approximate token counter in `src/counter.ts`** — Export a default `TokenCounter` function: `(text: string) => Math.ceil(text.length / 4)`. This is the built-in zero-dependency counter used when no `tokenCounter` is provided. | Status: not_done

- [ ] **Implement basis resolution in `src/allocator.ts`** — For each section, resolve `basis` to a concrete token count: if `basis` is a number, use it directly; if `basis` is a percentage string (e.g. `'10%'`), compute `Math.floor(availableBudget * percentage / 100)`; if `basis` is `'auto'`, use the actual content size from `actualSizes` (or 0 if not provided). Clamp the resolved basis to `[min, max]`. | Status: not_done

- [ ] **Implement available budget calculation** — Compute `availableBudget = contextWindow - outputReservation`. Throw `BudgetExceededError` if `availableBudget <= 0`. Default `outputReservation` to 4096 if not specified. | Status: not_done

- [ ] **Implement feasibility check** — Compute the sum of all sections' `min` values. If this sum exceeds the available budget, enter the triage phase. Otherwise, proceed to initial allocation. | Status: not_done

- [ ] **Implement grow phase (surplus distribution)** — When the total of all basis allocations is less than the available budget, distribute the surplus proportionally to each section's `grow` factor. Only sections with `grow > 0` and `allocation < max` participate. If a section hits its `max` during distribution, cap it, compute freed tokens, remove it from the grow pool, and redistribute the freed tokens among remaining growers. Repeat until no section exceeds its max or no growers remain. Ensure all surplus is distributed (no tokens lost). | Status: not_done

- [ ] **Implement shrink phase (deficit reduction)** — When the total allocation exceeds the available budget, reduce sections proportionally using weighted shrink: `reduction = deficit * (section.shrink * section.allocation) / totalWeightedShrink`. Sections with `shrink: 0` are protected and do not participate. If a section would shrink below its `min`, clamp it to `min`, compute the unsatisfied deficit, remove it from the shrink pool, and redistribute. Repeat until all sections are at or above their min or no shrinkable sections remain. | Status: not_done

- [ ] **Implement triage phase (section omission)** — When min constraints prevent the budget from being satisfied after shrinking: (1) Sort sections by priority ascending (lowest first). (2) Omit sections one by one (set allocation to 0, mark as omitted) starting from lowest priority. (3) After each omission, recalculate. Stop when total <= available budget. (4) If removing all sections with priority < 100 still exceeds budget, throw `BudgetExceededError`. Never omit priority-100 sections. | Status: not_done

- [ ] **Implement final validation** — After allocation, verify invariants: every section's allocation is within `[min, max]` (or 0 if omitted), total allocation equals available budget within floating-point tolerance, no section with `shrink: 0` was shrunk below its basis (unless omitted in triage). Round allocations to integers. | Status: not_done

- [ ] **Implement `AllocationResult` building** — Construct the `AllocationResult` object with: per-section `SectionAllocation` entries (name, allocation, actualSize, resolvedBasis, omitted, cappedAtMax, cappedAtMin, grew, shrunk, status, overflowTokens), `totalAllocated`, `availableBudget`, `remaining`, `omitted` array, `shrinkOccurred` boolean, `triageOccurred` boolean. | Status: not_done

---

## Phase 5: ContextBudget Class

- [ ] **Implement `createBudget()` factory function in `src/budget.ts`** — Accept `BudgetConfig`, validate it, resolve model to contextWindow if needed, merge section configs with presets/defaults, and return a `ContextBudget` instance. | Status: not_done

- [ ] **Implement `budget.allocate()` method** — Accept an optional `Record<string, number>` of actual sizes per section. Call the core allocation algorithm with the resolved section configs and actual sizes. Invoke the `onOverflow` callback for sections with `overflow: 'warn'` whose actual size exceeds their allocation. Invoke the `onAllocate` callback with the generated report. Store the last allocation result for `report()`. Return the `AllocationResult`. | Status: not_done

- [ ] **Implement `budget.getSection()` method** — Return the full `SectionConfig` for a named section, or `null` if it does not exist. | Status: not_done

- [ ] **Implement `budget.getSectionNames()` method** — Return an array of all section names currently defined in the budget. | Status: not_done

- [ ] **Implement `budget.addSection()` method** — Add a new section with the given name and partial config (merged with custom section defaults). Throw `BudgetConfigError` if a section with the same name already exists. Validate the section config. | Status: not_done

- [ ] **Implement `budget.removeSection()` method** — Remove a section by name. Throw `BudgetConfigError` if the section does not exist. | Status: not_done

- [ ] **Implement `budget.updateSection()` method** — Update an existing section's config via shallow merge. Throw `BudgetConfigError` if the section does not exist. Validate the merged config. | Status: not_done

- [ ] **Implement `budget.getAvailableBudget()` method** — Return `contextWindow - outputReservation`. | Status: not_done

- [ ] **Implement `budget.getContextWindow()` method** — Return the current context window size. | Status: not_done

- [ ] **Implement `budget.getOutputReservation()` method** — Return the current output reservation. | Status: not_done

- [ ] **Implement `budget.setContextWindow()` method** — Update the context window size. Validate it is a positive integer. | Status: not_done

- [ ] **Implement `budget.setModel()` method** — Resolve the model name to a context window size and update. Throw `UnknownModelError` if not recognized. | Status: not_done

- [ ] **Implement `budget.setOutputReservation()` method** — Update the output reservation. Validate it is non-negative and less than the context window. | Status: not_done

---

## Phase 6: Content Fitting & Truncation

- [ ] **Implement `head` truncation strategy in `src/fitter.ts`** — For string content, use binary search to find the longest prefix whose token count (via the configured `tokenCounter`) is within the allocated budget. Return the truncated string. | Status: not_done

- [ ] **Implement `tail` truncation strategy in `src/fitter.ts`** — For string content, use binary search to find the shortest suffix whose token count is within the allocated budget. Return the truncated string. | Status: not_done

- [ ] **Implement `middle-out` truncation strategy in `src/fitter.ts`** — Split the allocation: keep the first 40% of token budget from the start of the content and the last 60% from the end of the content. Drop the middle. Return the concatenated result. | Status: not_done

- [ ] **Implement `messages` truncation strategy in `src/fitter.ts`** — For `Message[]` content, remove complete messages from the oldest end. Preserve system messages (never remove them). Preserve tool call pairs: if an assistant message with `tool_calls` is removed, its corresponding tool result messages are also removed; if a tool result is the oldest message, its calling assistant message is also removed. Count tokens per message as `tokenCounter(message.content) + messageOverhead + (name overhead) + (tool_calls overhead)`. Remove messages from oldest to newest until the remaining messages fit within the allocated budget. | Status: not_done

- [ ] **Implement message token counting** — Count tokens for a single `Message`: `tokenCounter(message.content) + messageOverhead + (message.name ? tokenCounter(message.name) + 1 : 0) + (message.tool_calls ? tokenCounter(JSON.stringify(message.tool_calls)) : 0)`. Use the configurable `messageOverhead` (default 4). | Status: not_done

- [ ] **Implement `budget.fit()` method** — Accept `Record<string, string | Message[]>`. For each section, count tokens (string via tokenCounter, Message[] via message token counting). Call `allocate()` with the counted sizes. For each section, apply the section's truncation strategy if content exceeds allocation. Handle overflow strategies: `'truncate'` silently truncates, `'error'` throws `SectionOverflowError`, `'warn'` truncates and invokes `onOverflow` callback, `'summarize'` marks as overflow without truncating. Return `FittedContent` with `allocation` and per-section `FittedSection` (original, fitted, originalTokens, fittedTokens, wasTruncated, tokensRemoved, messagesRemoved for messages strategy). | Status: not_done

- [ ] **Handle `summarize` overflow strategy in `fit()`** — When a section's overflow strategy is `'summarize'` and content exceeds allocation, do not truncate the content. Instead, mark the section with `status: 'overflow'` and set `overflowTokens` so the caller can trigger summarization externally. The `FittedSection.fitted` should contain the original (un-truncated) content. | Status: not_done

---

## Phase 7: Reporting & Visualization

- [ ] **Implement `budget.report()` method in `src/report.ts`** — Return a `BudgetReport` object from the last allocation result: `model` (or null), `contextWindow`, `outputReservation`, `availableBudget`, `totalAllocated`, `utilization` (percentage), per-section `SectionReport` (allocated, used, remaining, utilization, budgetShare, omitted), `timestamp` (ISO string). Return `null` if no allocation has been performed yet. | Status: not_done

- [ ] **Implement `budget.reportText()` method in `src/report.ts`** — Generate a human-readable text report matching the spec's format. Include header with model name, context window, output reservation, available budget, total allocated with percentage. Include per-section table with columns: Section, Allocated, Used, Remaining, Util%, Share%. Include footer with omitted sections, triage triggered, shrink applied. Right-align numeric columns. Format numbers with thousands separators. | Status: not_done

- [ ] **Implement ASCII bar chart in `reportText()`** — Append an ASCII bar chart showing each section's share of the total budget using block characters. Scale bars to a reasonable terminal width (e.g. 60 characters for the longest bar). | Status: not_done

---

## Phase 8: Unit Tests — Allocation Algorithm

- [ ] **Write basis resolution tests in `src/__tests__/allocator.test.ts`** — Test numeric basis (used directly), percentage basis (e.g. `'10%'` of 10000 = 1000), `'auto'` basis with provided actual size, `'auto'` basis without actual size (defaults to 0), basis clamped to `[min, max]`. | Status: not_done

- [ ] **Write grow phase tests** — Test: surplus distributes proportionally to grow factors (e.g. grow:2 gets 2x of grow:1). Sections with `grow: 0` do not absorb surplus. Max caps are respected with freed tokens redistributed to remaining growers. Multiple redistribution passes converge correctly. All surplus is distributed (no tokens lost, total equals available budget). Single grower absorbs all surplus. | Status: not_done

- [ ] **Write shrink phase tests** — Test: deficit reduces sections proportionally to `shrink * allocation` (weighted shrink). Sections with `shrink: 0` are not shrunk. Min floors are respected with unsatisfied deficit redistributed. Sections are never shrunk below min. Small sections shrink less than large sections at equal shrink factors (weighted behavior). | Status: not_done

- [ ] **Write triage phase tests** — Test: lowest-priority sections are omitted first when sum of minimums exceeds budget. Omitted sections have allocation 0 and are listed in `result.omitted`. Priority 100 sections are never omitted. `triageOccurred` is true in result. When protected sections alone exceed budget, `BudgetExceededError` is thrown. Multiple sections omitted in priority order. | Status: not_done

- [ ] **Write edge case tests for allocation** — Test: single section absorbs entire budget. All sections have `grow: 0` and `shrink: 0` (static allocation with no redistribution). All sections have `basis: 0` (everything grows from zero). Zero surplus, zero deficit (perfect fit — total basis equals available budget). Very large context window (1M+ tokens). Very small context window (1K tokens with multiple sections). Floating-point rounding does not cause off-by-one errors. | Status: not_done

- [ ] **Write allocation result structure tests** — Test that `AllocationResult` contains correct values for: `totalAllocated`, `availableBudget`, `remaining`, `omitted` array, `shrinkOccurred`, `triageOccurred`. Per-section: `name`, `allocation`, `actualSize`, `resolvedBasis`, `omitted`, `cappedAtMax`, `cappedAtMin`, `grew`, `shrunk`, `status`, `overflowTokens`. | Status: not_done

---

## Phase 9: Unit Tests — Configuration & Models

- [ ] **Write configuration validation tests in `src/__tests__/budget.test.ts`** — Test: error when neither `contextWindow` nor `model` specified. Error when both specified. Error when `contextWindow` is not a positive integer (0, negative, float). Error when `outputReservation` is negative. Error when `outputReservation` >= `contextWindow`. Error when no sections defined and no preset. Error when section `min > max`. Error when section `grow` is negative. Error when section `shrink` is negative. Error when section `priority` is negative. Error when section `overflow` is invalid string. Error when section `truncation` is invalid string. Error when section `basis` is invalid (negative number, invalid string). Multiple errors collected in single `BudgetConfigError`. | Status: not_done

- [ ] **Write model preset tests in `src/__tests__/models.test.ts`** — Test: all built-in model names resolve to positive integer context window sizes. Aliases (`claude-sonnet-4`, `claude-opus-4`) resolve to correct values. `getModelContextWindow()` returns `undefined` for unknown models. `registerModel()` adds new models. Registered models can be resolved. Custom models override built-in models. `createBudget({ model: 'gpt-4o' })` works correctly. `createBudget({ model: 'unknown-model' })` throws `UnknownModelError`. | Status: not_done

- [ ] **Write section preset tests in `src/__tests__/sections.test.ts`** — Test: `'chatbot'` preset creates system, conversation, currentMessage sections. `'rag'` preset creates system, rag, currentMessage sections. `'agent'` preset creates system, tools, memory, conversation, currentMessage sections. `'full'` preset creates all six built-in sections. Caller's `sections` overrides preset defaults. Built-in section names get built-in defaults. Custom section names get custom defaults. | Status: not_done

---

## Phase 10: Unit Tests — Fitting & Truncation

- [ ] **Write `head` truncation tests in `src/__tests__/fitter.test.ts`** — Test: string content truncated at correct boundary. Truncated content fits within allocation. Content that already fits is returned unchanged. Empty string returns empty. Very short allocation (1 token). | Status: not_done

- [ ] **Write `tail` truncation tests** — Test: keeps the end of the string. Drops the beginning. Truncated content fits within allocation. Content that already fits is returned unchanged. | Status: not_done

- [ ] **Write `middle-out` truncation tests** — Test: keeps first 40% and last 60% of token budget. Middle content is dropped. Truncated content fits within allocation. Very short content is not truncated. | Status: not_done

- [ ] **Write `messages` truncation tests** — Test: removes oldest non-system messages. System messages are preserved. Tool call pairs are kept together (assistant with tool_calls and corresponding tool results). Remaining messages fit within budget. `messagesRemoved` count is correct. Empty message array returns empty. Single message that fits is returned unchanged. | Status: not_done

- [ ] **Write overflow strategy tests** — Test: `'truncate'` silently truncates without error or callback. `'error'` throws `SectionOverflowError` with correct `section`, `allocated`, `actual` fields. `'warn'` truncates and invokes `onOverflow` callback with correct `OverflowEvent`. `'summarize'` does not truncate, marks section as overflow. Content that fits does not trigger any overflow handling regardless of strategy. | Status: not_done

- [ ] **Write `fit()` integration tests** — Test: full `fit()` call with mixed string and Message[] content. All sections receive correct fitted content. `FittedSection` fields are correct: `original`, `fitted`, `originalTokens`, `fittedTokens`, `wasTruncated`, `tokensRemoved`. `FittedContent.allocation` matches what `allocate()` would return. | Status: not_done

---

## Phase 11: Unit Tests — Token Counting & Reporting

- [ ] **Write approximate counter tests in `src/__tests__/counter.test.ts`** — Test: empty string returns 0. Single character returns 1 (`Math.ceil(1/4) = 1`). 4 characters returns 1. 5 characters returns 2. Long English text approximates correctly. Verify the formula is `Math.ceil(text.length / 4)`. | Status: not_done

- [ ] **Write message token counting tests** — Test: message with only content. Message with name field adds `tokenCounter(name) + 1`. Message with tool_calls adds `tokenCounter(JSON.stringify(tool_calls))`. Custom `messageOverhead` is applied. Default `messageOverhead` of 4 is used when not specified. | Status: not_done

- [ ] **Write pluggable token counter tests** — Test: custom `tokenCounter` function is used instead of default. `fit()` uses the custom counter for all token counting. `allocate()` is unaffected by tokenCounter (it takes pre-counted sizes). | Status: not_done

- [ ] **Write `report()` tests in `src/__tests__/report.test.ts`** — Test: returns `null` before any allocation. Returns correct `BudgetReport` after allocation. Model name is included when provided. `utilization` percentage is correct. Per-section `SectionReport` has correct `allocated`, `used`, `remaining`, `utilization`, `budgetShare`, `omitted` values. `timestamp` is a valid ISO string. | Status: not_done

- [ ] **Write `reportText()` tests** — Test: output contains model name, context window, output reservation, available budget. Section table has correct columns and values. Numbers are formatted with thousands separators. Omitted sections are listed. Triage and shrink indicators are correct. ASCII bar chart is present with correct proportions. | Status: not_done

---

## Phase 12: Section Management & Dynamic Update Tests

- [ ] **Write `addSection()` tests** — Test: adding a new section succeeds. Adding a section with an existing name throws `BudgetConfigError`. Added section participates in subsequent allocations. Partial config is merged with custom defaults. | Status: not_done

- [ ] **Write `removeSection()` tests** — Test: removing an existing section succeeds. Removing a non-existent section throws `BudgetConfigError`. Removed section does not participate in subsequent allocations. | Status: not_done

- [ ] **Write `updateSection()` tests** — Test: updating an existing section's config succeeds (shallow merge). Updating a non-existent section throws `BudgetConfigError`. Updated config is used in subsequent allocations. Only provided fields are overwritten; unspecified fields retain previous values. | Status: not_done

- [ ] **Write `setContextWindow()` tests** — Test: updating context window changes available budget. Subsequent allocations use new context window. Invalid values (non-positive, non-integer) are rejected. | Status: not_done

- [ ] **Write `setModel()` tests** — Test: setting a known model updates context window. Setting an unknown model throws `UnknownModelError`. Subsequent allocations use the new model's context window. | Status: not_done

- [ ] **Write `setOutputReservation()` tests** — Test: updating output reservation changes available budget. Invalid values (negative, >= contextWindow) are rejected. | Status: not_done

---

## Phase 13: Integration & End-to-End Tests

- [ ] **Write end-to-end chatbot scenario test** — Create a budget with `'chatbot'` preset, fit a system prompt + conversation messages + current message. Verify all sections fit, conversation is truncated correctly, system prompt and current message are preserved. | Status: not_done

- [ ] **Write end-to-end RAG pipeline scenario test** — Create a budget with `'rag'` preset, fit a system prompt + RAG text + current message. Verify RAG content is truncated when it exceeds allocation. Verify the system prompt and current message are protected. | Status: not_done

- [ ] **Write end-to-end agent scenario test** — Create a budget with agent-style sections (system, tools, memory, conversation, currentMessage), allocate with realistic actual sizes, verify allocations are reasonable. Test with both surplus and deficit scenarios. | Status: not_done

- [ ] **Write multi-model switching test** — Create a budget, allocate. Switch model via `setModel()`, re-allocate. Verify allocations change proportionally to the new context window size. | Status: not_done

- [ ] **Write re-allocation test** — Allocate multiple times with different actual sizes (simulating conversation growth over turns). Verify each allocation is independent and correct. Verify `report()` reflects the latest allocation. | Status: not_done

- [ ] **Write triage scenario end-to-end test** — Create a budget with a very small context window where not all sections fit. Verify lowest-priority sections are omitted. Verify remaining sections are allocated correctly. Verify the allocation result reports which sections were omitted. | Status: not_done

- [ ] **Write overflow callback integration test** — Create a budget with `onOverflow` and `onAllocate` callbacks. Perform `allocate()` and `fit()` that trigger overflow on `'warn'` sections. Verify callbacks are invoked with correct arguments. | Status: not_done

---

## Phase 14: Documentation

- [ ] **Create `README.md`** — Write a comprehensive README including: package description, installation instructions (`npm install context-budget`), quick start example, API reference for `createBudget`, `allocate`, `fit`, `report`, `reportText`, `registerModel`, `getModelContextWindow`. Document all configuration options (BudgetConfig, SectionConfig). Document built-in section presets and preset configurations. Document model presets with context window sizes. Document token counting (built-in approximate vs pluggable exact). Document overflow and truncation strategies. Document error classes. Include integration examples with sliding-context and context-packer. | Status: not_done

- [ ] **Add JSDoc comments to all public API functions and types** — Ensure all exported functions, interfaces, types, and class methods have JSDoc comments matching the spec's documentation. Include `@param`, `@returns`, `@throws`, and `@example` tags where appropriate. | Status: not_done

---

## Phase 15: Build, Lint & Publish Preparation

- [ ] **Verify TypeScript compilation** — Run `npm run build` and ensure zero errors. Verify `dist/` output contains `index.js`, `index.d.ts`, and all module files with declarations and source maps. | Status: not_done

- [ ] **Configure and run ESLint** — Ensure `npm run lint` passes with zero warnings/errors. Configure ESLint for TypeScript if not already configured. | Status: not_done

- [ ] **Run full test suite** — Run `npm run test` and verify all tests pass. Verify test coverage is adequate across all modules (allocator, budget, fitter, models, sections, report, counter). | Status: not_done

- [ ] **Verify package.json metadata** — Ensure `name`, `version`, `description`, `main`, `types`, `files`, `engines`, `license`, `keywords`, and `publishConfig` are correct. Add relevant keywords (e.g. `token`, `budget`, `allocator`, `llm`, `context-window`, `flexbox`). | Status: not_done

- [ ] **Bump version in `package.json`** — Bump from `0.1.0` to `1.0.0` (or appropriate version) before publishing. | Status: not_done

- [ ] **Verify zero runtime dependencies** — Confirm `package.json` has no `dependencies` field (or it is empty). All external packages are either `devDependencies` or the caller provides them. | Status: not_done
