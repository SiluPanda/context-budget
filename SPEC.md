# context-budget -- Specification

## 1. Overview

`context-budget` is a token budget allocator for LLM context windows. It takes the sections that compose an LLM prompt -- system prompt, tool definitions, memory, RAG context, conversation history, current user message, and output reservation -- and allocates a token budget to each section using a flexbox-inspired layout algorithm. Each section is a "flex item" with configurable properties: a basis allocation, grow and shrink factors, minimum and maximum bounds, and a priority level. The allocator distributes available tokens across sections, handles overflow when content exceeds the budget, and returns an allocation result that downstream components use to fit their content within their assigned budgets.

The analogy to CSS flexbox is deliberate and precise. In CSS flexbox, a container has a fixed size (the main axis), and flex items compete for that space. Each item has a `flex-basis` (initial size), `flex-grow` (how much extra space it absorbs), `flex-shrink` (how much it gives up when space is tight), `min-width` and `max-width` (hard bounds), and items can be ordered by priority. The flexbox algorithm first allocates basis sizes, then distributes remaining space proportionally by grow factors, and when overflow occurs, shrinks items proportionally by shrink factors while respecting minimums. `context-budget` applies this exact algorithm to token allocation: the container is the context window, flex items are prompt sections, and pixels are tokens.

The gap this package fills is specific and well-defined. The LLM tooling ecosystem has libraries for individual pieces of context management -- `llm-info` provides model metadata including context window sizes, `context-lens` visualizes context window usage, `sliding-context` manages conversation history within a token budget, `context-packer` optimally packs RAG chunks into a fixed allocation -- but nothing sits above these components to decide how much budget each one gets. When a developer builds an agent with a system prompt, 15 tool definitions, a RAG knowledge base, conversation history with summarization, and a current user message, they must manually decide: "system prompt gets 500 tokens, tools get 3000, RAG gets 2000, conversation gets the rest, reserve 4096 for output." These manual allocations are fragile. Add three more tools and the tool section overflows its budget. Remove RAG from a request and 2000 tokens go unused while conversation history is being aggressively summarized. The allocation does not adapt to the actual content.

`context-budget` replaces manual allocation with a declarative system. The developer declares each section's flex properties -- "the system prompt is fixed, tools should grow but cap at 4000 tokens, RAG can grow aggressively but shrink first when space is tight, conversation fills the rest" -- and the allocator computes optimal budgets given the actual content sizes. When the system prompt is short, more tokens flow to conversation. When there are many tools, RAG shrinks to accommodate. When a section's content is smaller than its allocation, the unused tokens redistribute to sections that need them. The system adapts to each request's actual content profile instead of using static allocations that waste tokens on some requests and overflow on others.

`context-budget` provides a TypeScript/JavaScript API only. No CLI. The API returns structured allocation results -- per-section budgets, usage reports, and overflow warnings -- that the caller uses to truncate, summarize, or omit content to fit each section within its allocated budget. The package does not perform truncation or summarization itself. It allocates budgets; downstream packages (`sliding-context` for conversation, `context-packer` for RAG, the caller's own logic for tools) consume those budgets.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `createBudget(options)` function that returns a `ContextBudget` instance configured with a context window size, output reservation, section definitions, and a pluggable token counter.
- Model each context section as a flex item with configurable properties: `basis` (initial allocation), `grow` (share of surplus space), `shrink` (share of deficit reduction), `min` (hard floor), `max` (hard ceiling), and `priority` (triage order when content must be omitted entirely).
- Implement a multi-pass allocation algorithm inspired by CSS flexbox: allocate basis, distribute surplus by grow ratios, shrink by shrink ratios when over budget, enforce min/max bounds with redistribution, and omit lowest-priority sections when minimums cannot be met.
- Provide built-in section presets with sensible defaults for common context sections: `system`, `tools`, `memory`, `rag`, `conversation`, `currentMessage`, and `outputReservation`.
- Support custom sections with user-defined flex properties for application-specific context sections (few-shot examples, scratchpad, chain-of-thought buffer, image descriptions).
- Provide a `budget.allocate(actualSizes)` method that takes the actual token counts of each section's content and returns an `AllocationResult` specifying how many tokens each section is allocated.
- Provide a `budget.fit(contents)` method that takes actual content (strings or message arrays) for each section, counts tokens, allocates budgets, and returns a `FittedContent` result indicating what fits and what must be truncated.
- Provide a `budget.report()` method that returns a structured `BudgetReport` showing per-section allocation, usage, remaining capacity, and utilization percentage.
- Support per-section overflow strategies: `truncate`, `error`, `warn`, and `summarize`, controlling what happens when a section's content exceeds its allocated budget.
- Support per-section truncation strategies: `tail` (keep end, drop start), `head` (keep start, drop end), `middle-out` (keep start and end, drop middle), and `messages` (drop oldest messages for conversation sections).
- Provide built-in model presets mapping model names to context window sizes, so callers can write `createBudget({ model: 'gpt-4o' })` instead of `createBudget({ contextWindow: 128000 })`.
- Support pluggable token counting: a built-in approximate counter (`Math.ceil(text.length / 4)`) for zero-dependency use, and a pluggable interface for exact counters (tiktoken, gpt-tokenizer, Anthropic's tokenizer).
- Keep runtime dependencies at zero. The package uses only built-in JavaScript APIs.
- Integrate with sibling packages: provide budgets that `sliding-context` consumes for conversation management, that `context-packer` consumes for RAG chunk packing, and that `prompt-optimize` consumes for prompt compression.

### Non-Goals

- **Not a context manager.** This package allocates token budgets. It does not manage conversation history, trigger summarization, evict messages, or maintain state across turns. Use `sliding-context` for conversation context management within the budget that `context-budget` allocates.
- **Not a RAG chunk packer.** This package does not select, rank, or pack retrieved chunks. It allocates a token budget for the RAG section. Use `context-packer` to pack chunks within that budget.
- **Not a token counter.** This package includes a rough approximate counter as a convenience. For accurate token counting, the caller provides a `tokenCounter` function. The package does not bundle tiktoken, gpt-tokenizer, or any tokenizer library.
- **Not a prompt builder.** This package does not construct or template prompts. It does not concatenate sections into a final prompt string. The caller assembles the final prompt using the allocation results. Use `rag-prompt-builder` for RAG prompt assembly.
- **Not an LLM API client.** This package does not make HTTP requests, manage API keys, or call any model API. It operates entirely on token counts and content strings.
- **Not a cost optimizer.** While efficient token allocation indirectly reduces cost by avoiding wasted context capacity, this package does not track spending, enforce cost budgets, or estimate costs. Use `ai-cost-compare` or `model-price-registry` for cost analysis.
- **Not a model registry.** Built-in model presets map model names to context window sizes as a convenience. For comprehensive model metadata (pricing, capabilities, rate limits), use `llm-info` or `model-price-registry`.
- **Not a content truncation library.** This package reports how many tokens each section is allocated. The actual truncation of content to fit within the allocation is the caller's responsibility (or the responsibility of downstream packages like `sliding-context`). The `fit()` method provides basic truncation as a convenience, but sophisticated truncation (message-level, semantic, summarization-based) is out of scope.

---

## 3. Target Users and Use Cases

### Agent Framework Authors

Teams building autonomous agent frameworks where the agent has a system prompt defining its persona and capabilities, tool definitions for the tools it can call, a memory section with retrieved agent memories, conversation history spanning many turns, and the current user message. The framework needs to allocate tokens across these sections dynamically. When the agent has 20 tools, tool definitions consume more space and conversation history must shrink. When the agent is between tool calls and has no pending memory, those tokens should flow to conversation. `context-budget` provides the allocation logic that the framework wraps with its own content management. A typical integration: the framework calls `budget.allocate({ system: 450, tools: 2800, memory: 600, conversation: 5200, currentMessage: 300 })` before each LLM call and uses the result to decide how many conversation turns to include and how many memory entries to inject.

### Chatbot Developers

Developers building multi-turn chatbots where the context window fills up over long conversations. The chatbot has a fixed system prompt, no tools, no RAG, and a growing conversation history. The budget allocation is simple -- system prompt and output reservation are fixed, everything else goes to conversation -- but the developer still needs to know exactly how many tokens are available for conversation on each turn. `context-budget` computes this automatically: `createBudget({ model: 'gpt-4o-mini', sections: { system: { basis: 200, shrink: 0 }, conversation: { grow: 1 } }, outputReservation: 2048 })`. The conversation section's allocation is the context window minus system minus output reservation.

### RAG Pipeline Builders

Teams building retrieval-augmented generation pipelines where the context must accommodate a system prompt with instructions, retrieved document chunks, and the user's question. The number and size of retrieved chunks varies per query. With a fixed allocation, some queries waste tokens (few short chunks) while others overflow (many long chunks). `context-budget` allocates a flexible budget for the RAG section: `rag: { basis: 4000, grow: 2, shrink: 1, max: 8000 }`. When the system prompt is short, more tokens flow to RAG. When the user's question is long, RAG shrinks. The pipeline uses the allocated budget to decide how many chunks to include.

### Tool-Heavy Applications

Applications with large tool schemas (10+ tools with complex JSON Schema parameters). Tool definitions can consume 200-500 tokens each. An application with 20 tools uses 4000-10000 tokens on tool definitions alone, leaving less room for conversation and context. `context-budget` lets the developer declare tools as a high-priority, shrinkable section: the tools section gets space for all definitions when the context is not full, but shrinks (by omitting least-used tools) when conversation history needs more room. The application queries the allocation to decide which tools to include.

### Multi-Model Applications

Applications that route requests to different models with different context window sizes. A request to GPT-4o has 128K tokens; a request to a local Llama model has 8K tokens. The same prompt structure needs different budget allocations for each model. `context-budget` handles this by accepting a model name that resolves to the appropriate context window size, and the flex algorithm automatically adjusts all allocations proportionally.

### Cost-Conscious Production Applications

Applications running on large-context models where the context window is not the constraint but cost is. Even with 200K available, using 200K per request is expensive. The team configures a budget of 16K tokens (well below the model's limit) to control costs, and `context-budget` allocates that 16K across sections. When the team decides to spend more on context for premium users, they increase the budget and the allocations scale up automatically.

---

## 4. Core Concepts

### Context Window

The context window is the total number of tokens an LLM can process in a single API call, including both input and output. GPT-4o has a 128K-token context window. Claude Sonnet 4.6 has a 1M-token context window. Gemini 2.5 Pro has a 1M-token context window. GPT-5 has a 400K-token context window. The context window is a hard limit enforced by the provider -- exceeding it causes an API error.

### Available Budget

The available budget is the context window minus the output reservation. The output reservation is the number of tokens reserved for the model's response (`max_tokens` in OpenAI's API, `max_tokens` in Anthropic's API). If the context window is 128K and the output reservation is 4096, the available budget for input sections is 123,904 tokens. `context-budget` allocates this available budget across the input sections.

### Section

A section is a named region of the context window that holds a specific type of content. Each section has flex properties that control how it participates in budget allocation. Sections are the flex items in the flexbox analogy. Standard sections include `system` (the system prompt), `tools` (tool/function definitions), `memory` (agent memory or knowledge base excerpts), `rag` (retrieved document chunks), `conversation` (past messages), and `currentMessage` (the current user query). Custom sections can be defined for application-specific needs.

### Flex Properties

Each section has five flex properties that control its allocation behavior:

- **`basis`**: The starting allocation in tokens (or as a percentage of available budget). This is the section's size before grow/shrink adjustments. Analogous to CSS `flex-basis`.
- **`grow`**: A non-negative number controlling how much surplus space this section absorbs. A section with `grow: 2` absorbs twice as much surplus as a section with `grow: 1`. A section with `grow: 0` never grows beyond its basis. Analogous to CSS `flex-grow`.
- **`shrink`**: A non-negative number controlling how much this section gives up when the total exceeds the available budget. A section with `shrink: 0` is protected from shrinking. A section with `shrink: 2` shrinks twice as fast as one with `shrink: 1`. Analogous to CSS `flex-shrink`.
- **`min`**: The minimum allocation in tokens. The section is never allocated fewer tokens than this. If the algorithm cannot satisfy all minimums, the lowest-priority sections are omitted entirely.
- **`max`**: The maximum allocation in tokens. The section is never allocated more tokens than this, even if surplus space is available. Tokens that would exceed the max are redistributed to other growing sections.

### Priority

Each section has a priority level that determines the order in which sections are omitted when the available budget cannot satisfy all sections' minimums. Higher-priority sections are kept; lower-priority sections are omitted first. Priority is only relevant during the triage phase -- when the total of all minimums exceeds the available budget. During normal allocation (grow/shrink), all sections participate regardless of priority.

Priority levels are numeric, with higher numbers indicating higher priority. The built-in presets use: `system` = 100, `currentMessage` = 100, `outputReservation` = 100, `conversation` = 80, `tools` = 70, `rag` = 50, `memory` = 50. Custom sections default to priority 50.

### Overflow Strategy

The overflow strategy determines what happens when a section's actual content exceeds its allocated budget. Each section can have its own overflow strategy:

- **`truncate`**: Silently truncate the content to fit. This is the default.
- **`error`**: Throw an error if the content does not fit.
- **`warn`**: Fit the content (truncate) but emit a warning via the `onOverflow` callback.
- **`summarize`**: Signal to the caller that the content should be summarized to fit (for integration with `sliding-context` or other summarization pipelines).

### Allocation Result

The allocation result is the output of the allocation algorithm: a map from section names to their allocated token budgets, plus metadata about the allocation (which sections were omitted, which were capped at min/max, total utilization). The caller uses this result to prepare content for each section.

---

## 5. The Flexbox Model for Context

### The Analogy

A CSS flexbox container has a fixed width. Flex items compete for that width. Each item has `flex-basis` (starting width), `flex-grow` (share of extra width), `flex-shrink` (share of deficit), `min-width` (floor), and `max-width` (ceiling). The flexbox algorithm distributes available pixels across items.

An LLM context window has a fixed token count. Context sections compete for those tokens. Each section has `basis` (starting tokens), `grow` (share of extra tokens), `shrink` (share of deficit), `min` (floor), and `max` (ceiling). The `context-budget` algorithm distributes available tokens across sections.

The analogy maps precisely:

| CSS Flexbox | context-budget | Description |
|---|---|---|
| Container width | Available budget (context window - output reservation) | Total space to distribute |
| Flex item | Section | A region that consumes space |
| `flex-basis` | `basis` | Starting allocation |
| `flex-grow` | `grow` | Share of surplus space |
| `flex-shrink` | `shrink` | Share of deficit reduction |
| `min-width` | `min` | Hard minimum |
| `max-width` | `max` | Hard maximum |
| Pixel | Token | Unit of space |
| Overflow: hidden | Truncation | Content cut to fit |
| Overflow: visible | Error/warn | Content exceeds allocation |

### Visual Model

```
Context Window: 32,768 tokens
Output Reservation: 4,096 tokens
Available Budget: 28,672 tokens

┌──────────────────────────── Available Budget: 28,672 tokens ────────────────────────────┐
│                                                                                         │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────┐ ┌───────────┐  │
│  │ system  │ │  tools   │ │  memory  │ │    rag    │ │  conversation  │ │  current  │  │
│  │         │ │          │ │          │ │           │ │                │ │  message  │  │
│  │ basis:  │ │ basis:   │ │ basis:   │ │ basis:    │ │ basis:         │ │ basis:    │  │
│  │  500    │ │  2000    │ │  1000    │ │  3000     │ │  auto          │ │  500      │  │
│  │ grow: 0 │ │ grow: 0  │ │ grow: 1  │ │ grow: 2   │ │ grow: 1        │ │ grow: 0   │  │
│  │ shrink:0│ │ shrink:1 │ │ shrink:2 │ │ shrink: 1 │ │ shrink: 1      │ │ shrink: 0 │  │
│  │ min:500 │ │ min:500  │ │ min: 0   │ │ min: 0    │ │ min: 2000      │ │ min: 500  │  │
│  │ max:500 │ │ max:5000 │ │ max:3000 │ │ max: 8000 │ │ max: none      │ │ max: 500  │  │
│  │ pri:100 │ │ pri: 70  │ │ pri: 50  │ │ pri: 50   │ │ pri: 80        │ │ pri: 100  │  │
│  └─────────┘ └──────────┘ └──────────┘ └───────────┘ └────────────────┘ └───────────┘  │
│   fixed        flexible     flexible     flexible       fills rest        fixed         │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### How Surplus Space Distributes

When the sum of all basis allocations is less than the available budget, surplus tokens are distributed to sections with `grow > 0`, proportionally to their grow factors.

```
Available budget:       28,672 tokens
Sum of basis values:     7,000 tokens  (500 + 2000 + 1000 + 3000 + 0 + 500)
Surplus:                21,672 tokens

Grow factors:  memory=1, rag=2, conversation=1  →  total grow = 4

memory gets:      21,672 * (1/4) = 5,418 tokens  →  1,000 + 5,418 = 6,418
  capped at max 3,000  →  3,000 (freed 3,418 tokens)

Redistribute 3,418 among remaining growers (rag=2, conversation=1, total=3):
  rag gets:       remaining * (2/3) + 3,000 basis
  conversation:   remaining * (1/3) + 0 basis

(Multiple redistribution passes until all maxes satisfied and all surplus allocated)
```

### How Deficit Space Distributes

When the sum of actual content sizes exceeds the available budget, deficit tokens are reclaimed from sections with `shrink > 0`, proportionally to their shrink factors weighted by their current size (matching CSS flexbox behavior where shrink is proportional to `shrink * basis`).

```
Available budget:       28,672 tokens
Sum of actual content:  35,000 tokens
Deficit:                 6,328 tokens

Shrink factors (weighted by current size):
  tools:        shrink=1 × 3,000 = 3,000
  memory:       shrink=2 × 2,000 = 4,000
  rag:          shrink=1 × 6,000 = 6,000
  conversation: shrink=1 × 20,000 = 20,000
  Total weighted shrink: 33,000

tools shrinks by:        6,328 * (3,000/33,000) =   575 tokens
memory shrinks by:       6,328 * (4,000/33,000) =   767 tokens
rag shrinks by:          6,328 * (6,000/33,000) = 1,151 tokens
conversation shrinks by: 6,328 * (20,000/33,000) = 3,835 tokens

(Respecting min bounds, with redistribution if any section hits its min)
```

---

## 6. Built-in Section Types

`context-budget` provides pre-defined section configurations for the standard parts of an LLM prompt. These are defaults that can be overridden. Using the presets, a developer can create a budget with a single line: `createBudget({ model: 'gpt-4o', preset: 'agent' })`, and all sections are configured with sensible defaults.

### `system`

The system prompt: instructions, persona, constraints, output format directives.

```typescript
{
  basis: 'auto',      // Measured from actual content
  grow: 0,            // Never grows beyond actual size
  shrink: 0,          // Never shrinks (protected)
  min: 0,             // No minimum if no system prompt
  max: Infinity,      // No cap
  priority: 100,      // Highest -- never omitted
  overflow: 'error',  // Error if system prompt exceeds allocation
  truncation: 'head', // If forced to truncate, keep the beginning
}
```

The system prompt is treated as sacred. It is never truncated in normal operation (`shrink: 0`), and exceeding the allocation is an error. If the system prompt alone exceeds the available budget, the allocator throws a `BudgetExceededError` because there is no safe way to proceed.

### `tools`

Tool/function definitions: JSON Schema descriptions of functions the model can call. Each tool definition typically costs 200-500 tokens depending on the complexity of the parameter schema.

```typescript
{
  basis: 'auto',      // Measured from actual content
  grow: 0,            // Does not grow beyond actual size
  shrink: 1,          // Can shrink (by removing tools)
  min: 0,             // Can be reduced to zero (all tools removed)
  max: Infinity,      // No cap
  priority: 70,       // High but below system/conversation
  overflow: 'warn',   // Warn if tools exceed allocation
  truncation: 'tail', // Drop tools from the end (least important last)
}
```

Tool definitions shrink by removing entire tools rather than truncating tool schemas mid-definition. The caller is responsible for deciding which tools to remove when the tools section is told to shrink. The allocation result reports how many tokens the tools section gets, and the caller selects tools that fit within that budget.

### `memory`

Agent memory, knowledge base excerpts, or persistent context that spans across conversations.

```typescript
{
  basis: 0,           // No baseline allocation
  grow: 1,            // Absorbs surplus space moderately
  shrink: 2,          // Shrinks aggressively when space is tight
  min: 0,             // Can be omitted entirely
  max: Infinity,      // No cap
  priority: 50,       // Medium -- omitted before conversation and tools
  overflow: 'truncate',
  truncation: 'tail', // Drop least relevant memories
}
```

Memory is treated as a flexible, expendable section. When the budget is tight, memory shrinks first (high shrink factor). When the budget has surplus, memory grows to include more context. The zero minimum means memory can be omitted entirely under extreme budget pressure without causing an error.

### `rag`

Retrieved document chunks for retrieval-augmented generation.

```typescript
{
  basis: 0,           // No baseline allocation
  grow: 2,            // Absorbs surplus space aggressively
  shrink: 1,          // Shrinks moderately
  min: 0,             // Can be omitted entirely
  max: Infinity,      // No cap
  priority: 50,       // Medium -- omitted before conversation and tools
  overflow: 'truncate',
  truncation: 'tail', // Drop lowest-relevance chunks
}
```

RAG grows aggressively (`grow: 2`) because more retrieved context generally improves response quality. It shrinks moderately because losing RAG context degrades quality but does not break the conversation. The higher grow factor compared to memory reflects the assumption that RAG context is typically more relevant to the current query.

### `conversation`

Past conversation messages (user and assistant turns).

```typescript
{
  basis: 0,           // No baseline; fills remaining space
  grow: 1,            // Absorbs surplus space
  shrink: 1,          // Shrinks proportionally
  min: 2000,          // Minimum to maintain conversational coherence
  max: Infinity,      // No cap
  priority: 80,       // High -- preserved over RAG and memory
  overflow: 'truncate',
  truncation: 'messages', // Drop oldest complete messages
}
```

Conversation has a 2000-token minimum to ensure at least a few recent exchanges are always preserved. The `messages` truncation strategy means that when conversation must be truncated, entire messages are removed from the oldest end rather than cutting mid-message. This is critical for coherent conversation: a half-truncated assistant message is worse than no message. The priority of 80 means conversation is preserved over RAG and memory but can be sacrificed when system and currentMessage need more room.

### `currentMessage`

The current user message: the latest query or instruction.

```typescript
{
  basis: 'auto',      // Measured from actual content
  grow: 0,            // Never grows beyond actual size
  shrink: 0,          // Never shrinks (protected)
  min: 0,             // No minimum if no current message
  max: Infinity,      // No cap
  priority: 100,      // Highest -- never omitted
  overflow: 'error',  // Error if current message exceeds allocation
  truncation: 'tail', // If forced, keep beginning of message
}
```

Like the system prompt, the current user message is protected. Truncating the user's question would produce a nonsensical response. If the current message alone exceeds the available budget, the allocator throws.

### `outputReservation`

Tokens reserved for the model's response. This is not a content section -- it is subtracted from the context window before allocation begins. It is defined separately from the other sections.

```typescript
{
  default: 4096,       // Conservative default
  min: 256,            // At least some output space
  max: Infinity,       // No cap
}
```

### Custom Sections

Applications can define any number of custom sections with user-specified flex properties. Custom sections participate in the allocation algorithm identically to built-in sections.

```typescript
const budget = createBudget({
  model: 'gpt-4o',
  sections: {
    system: { basis: 500, shrink: 0, priority: 100 },
    fewShotExamples: { basis: 2000, grow: 0, shrink: 1, min: 0, max: 4000, priority: 60 },
    scratchpad: { basis: 1000, grow: 1, shrink: 2, min: 0, priority: 40 },
    conversation: { grow: 1, min: 2000, priority: 80 },
    currentMessage: { basis: 'auto', shrink: 0, priority: 100 },
  },
});
```

---

## 7. Allocation Algorithm

The allocation algorithm runs in multiple passes, mirroring how CSS flexbox resolves layout. The input is the available budget (context window minus output reservation) and the section configurations. The output is a token allocation for each section.

### Step 1: Calculate Available Budget

```
availableBudget = contextWindow - outputReservation
```

If `availableBudget <= 0`, throw `BudgetExceededError`.

### Step 2: Resolve Basis Values

For each section, resolve `basis` to a concrete token count:

- If `basis` is a number, use it directly.
- If `basis` is a string like `"10%"`, compute `Math.floor(availableBudget * 0.10)`.
- If `basis` is `"auto"`, use the actual content size (if provided) or 0.
- Clamp the resolved basis to `[min, max]`.

### Step 3: Check Feasibility

Compute the sum of all sections' `min` values. If this sum exceeds the available budget, enter the triage phase (Step 7). Otherwise, proceed.

### Step 4: Initial Allocation

Set each section's current allocation to its resolved basis.

Compute `totalBasis = sum of all allocations`.

### Step 5: Distribute Surplus (Grow Phase)

If `totalBasis < availableBudget`:

```
surplus = availableBudget - totalBasis
totalGrow = sum of grow factors for sections where grow > 0 and allocation < max
```

If `totalGrow > 0`, distribute surplus:

```
for each section with grow > 0 and allocation < max:
  share = surplus * (section.grow / totalGrow)
  section.allocation += share
```

Apply `max` caps. If any section hits its max, compute freed tokens (the amount allocated beyond max), remove that section from the grow pool, and redistribute the freed tokens among remaining growers. Repeat until no section exceeds its max or no growers remain.

Apply `min` floors. If any section is below its min after grow distribution (should not happen in the grow phase since we start at basis which is already clamped to min, but handle defensively), raise it to min and reduce surplus accordingly.

### Step 6: Reduce Deficit (Shrink Phase)

If `totalBasis > availableBudget` (or after grow phase, if total allocation exceeds available budget due to actual content sizes):

```
deficit = totalAllocation - availableBudget
totalWeightedShrink = sum of (section.shrink * section.allocation) for sections where shrink > 0
```

If `totalWeightedShrink > 0`, distribute deficit:

```
for each section with shrink > 0:
  weightedShrink = section.shrink * section.allocation
  reduction = deficit * (weightedShrink / totalWeightedShrink)
  section.allocation -= reduction
```

The use of weighted shrink (shrink factor multiplied by current size) matches CSS flexbox behavior. This prevents small sections from shrinking to zero before large sections are noticeably reduced. A 500-token section with `shrink: 1` gives up far fewer tokens than a 20,000-token section with `shrink: 1`.

Apply `min` floors. If any section would shrink below its min, clamp it to min, compute the unsatisfied deficit, remove that section from the shrink pool, and redistribute the remaining deficit. Repeat until all sections are at or above their min or no shrinkable sections remain.

### Step 7: Triage (Omit Sections)

If, after shrinking, the total allocation still exceeds the available budget (because min constraints prevent sufficient shrinking):

1. Sort sections by priority, ascending (lowest priority first).
2. For each section in order, starting with the lowest priority:
   a. Remove the section entirely (set allocation to 0, mark as omitted).
   b. Recalculate the total. If total <= available budget, stop.
3. If removing all omittable sections (priority < 100) still does not bring the total within budget, throw `BudgetExceededError`. This means the protected sections (system, currentMessage) alone exceed the context window, which is an unrecoverable configuration error.

### Step 8: Final Validation

Verify invariants:
- Every section's allocation is within `[min, max]` (or 0 if omitted).
- The total allocation equals the available budget (within floating-point tolerance).
- No section with `shrink: 0` was shrunk below its basis (unless omitted in triage).

### Pseudocode

```typescript
function allocate(sections: SectionConfig[], availableBudget: number, actualSizes?: Record<string, number>): AllocationResult {
  // Step 1: Available budget already provided

  // Step 2: Resolve basis
  for (const section of sections) {
    section.resolved_basis = resolveBasis(section.basis, availableBudget, actualSizes?.[section.name]);
    section.allocation = clamp(section.resolved_basis, section.min, section.max);
  }

  // Step 3: Check feasibility
  const totalMin = sum(sections.map(s => s.min));
  if (totalMin > availableBudget) {
    return triage(sections, availableBudget);
  }

  // Step 4-5: Grow phase
  let total = sum(sections.map(s => s.allocation));
  if (total < availableBudget) {
    distributeGrow(sections, availableBudget - total);
  }

  // Step 6: Shrink phase
  total = sum(sections.map(s => s.allocation));
  if (total > availableBudget) {
    distributeShrink(sections, total - availableBudget);
  }

  // Step 7: Triage if still over
  total = sum(sections.map(s => s.allocation));
  if (total > availableBudget) {
    return triage(sections, availableBudget);
  }

  // Step 8: Validate and return
  return buildResult(sections, availableBudget);
}
```

---

## 8. API Surface

### Installation

```bash
npm install context-budget
```

### Primary Function: `createBudget`

```typescript
import { createBudget } from 'context-budget';

const budget = createBudget({
  contextWindow: 128000,
  outputReservation: 4096,
  sections: {
    system: { basis: 500, shrink: 0, priority: 100 },
    tools: { basis: 'auto', shrink: 1, priority: 70 },
    memory: { grow: 1, shrink: 2, priority: 50 },
    rag: { grow: 2, shrink: 1, priority: 50 },
    conversation: { grow: 1, min: 2000, priority: 80 },
    currentMessage: { basis: 'auto', shrink: 0, priority: 100 },
  },
});

// Allocate based on actual content sizes
const result = budget.allocate({
  system: 450,
  tools: 2800,
  memory: 600,
  rag: 3200,
  conversation: 12000,
  currentMessage: 350,
});

// result.sections.conversation.allocation → the number of tokens allocated to conversation
// result.sections.rag.allocation → the number of tokens allocated to RAG
```

### Type Definitions

```typescript
// ── Budget Configuration ────────────────────────────────────────────

/** Configuration for creating a ContextBudget. */
interface BudgetConfig {
  /**
   * Total context window size in tokens.
   * Mutually exclusive with `model`.
   */
  contextWindow?: number;

  /**
   * Model name to resolve to a context window size.
   * Uses built-in model presets.
   * Mutually exclusive with `contextWindow`.
   */
  model?: string;

  /**
   * Tokens reserved for the model's response.
   * Subtracted from contextWindow to determine the available budget.
   * Default: 4096.
   */
  outputReservation?: number;

  /**
   * Section definitions. Keys are section names, values are section configs.
   * Built-in section names ("system", "tools", "memory", "rag",
   * "conversation", "currentMessage") use preset defaults that the
   * provided config overrides (shallow merge).
   * Custom section names use base defaults (basis: 0, grow: 0,
   * shrink: 1, min: 0, max: Infinity, priority: 50).
   */
  sections: Record<string, Partial<SectionConfig>>;

  /**
   * Preset configuration that pre-populates section definitions
   * with sensible defaults for common use cases.
   * The `sections` config overrides preset values.
   * - 'agent': system, tools, memory, conversation, currentMessage
   * - 'chatbot': system, conversation, currentMessage
   * - 'rag': system, rag, currentMessage
   * - 'full': system, tools, memory, rag, conversation, currentMessage
   */
  preset?: 'agent' | 'chatbot' | 'rag' | 'full';

  /**
   * Token counter function.
   * Default: approximate counter (Math.ceil(text.length / 4)).
   */
  tokenCounter?: TokenCounter;

  /**
   * Per-message token overhead (role prefix, delimiters).
   * Added to each message's content token count when counting
   * conversation messages.
   * Default: 4 (matches OpenAI's chat completion overhead).
   */
  messageOverhead?: number;

  /**
   * Callback invoked when a section's content exceeds its allocation
   * and the section's overflow strategy is 'warn'.
   */
  onOverflow?: (event: OverflowEvent) => void;

  /**
   * Callback invoked after each allocation with the full report.
   * Useful for logging and monitoring context utilization.
   */
  onAllocate?: (report: BudgetReport) => void;
}

// ── Section Configuration ───────────────────────────────────────────

/** Configuration for a single context section. */
interface SectionConfig {
  /**
   * Starting allocation before grow/shrink.
   * - number: exact tokens
   * - string ending in '%': percentage of available budget (e.g., '10%')
   * - 'auto': use actual content size (requires actualSize in allocate())
   * Default: 0.
   */
  basis: number | string;

  /**
   * How much surplus space this section absorbs.
   * 0 = never grows beyond basis.
   * Higher values absorb proportionally more surplus.
   * Default: 0.
   */
  grow: number;

  /**
   * How much this section shrinks when budget is tight.
   * 0 = never shrinks (protected).
   * Higher values shrink proportionally more.
   * Shrink is weighted by current size (matching CSS flexbox).
   * Default: 1.
   */
  shrink: number;

  /**
   * Minimum allocation in tokens. The section is never
   * allocated fewer tokens unless omitted entirely during triage.
   * Default: 0.
   */
  min: number;

  /**
   * Maximum allocation in tokens. The section is never
   * allocated more tokens, even if surplus space is available.
   * Default: Infinity.
   */
  max: number;

  /**
   * Priority for triage. When minimums cannot be met, sections
   * with lower priority are omitted first.
   * Higher number = higher priority = kept longer.
   * Default: 50.
   */
  priority: number;

  /**
   * What to do when content exceeds the allocated budget.
   * - 'truncate': silently truncate content to fit
   * - 'error': throw BudgetExceededError
   * - 'warn': truncate and invoke onOverflow callback
   * - 'summarize': signal to caller that summarization is needed
   * Default: 'truncate'.
   */
  overflow: OverflowStrategy;

  /**
   * How to truncate content when it exceeds the allocation.
   * - 'head': keep the beginning, drop the end
   * - 'tail': keep the end, drop the beginning
   * - 'middle-out': keep start and end, drop the middle
   * - 'messages': drop oldest complete messages (for conversation sections)
   * Default: 'head'.
   */
  truncation: TruncationStrategy;
}

type OverflowStrategy = 'truncate' | 'error' | 'warn' | 'summarize';
type TruncationStrategy = 'head' | 'tail' | 'middle-out' | 'messages';

// ── Token Counter ───────────────────────────────────────────────────

/**
 * Function that counts the number of tokens in a text string.
 * The caller implements this using their preferred tokenizer.
 */
type TokenCounter = (text: string) => number;

// ── Allocation Result ───────────────────────────────────────────────

/** Result of the allocation algorithm. */
interface AllocationResult {
  /** Per-section allocation details. */
  sections: Record<string, SectionAllocation>;

  /** Total tokens allocated across all sections. */
  totalAllocated: number;

  /** Available budget (contextWindow - outputReservation). */
  availableBudget: number;

  /** Tokens remaining unallocated (should be 0 in normal operation). */
  remaining: number;

  /** Names of sections that were omitted during triage. */
  omitted: string[];

  /** Whether any section was shrunk below its basis. */
  shrinkOccurred: boolean;

  /** Whether triage was triggered (sections omitted). */
  triageOccurred: boolean;
}

/** Allocation details for a single section. */
interface SectionAllocation {
  /** The section name. */
  name: string;

  /** Allocated token budget for this section. */
  allocation: number;

  /** The actual content size (if provided in allocate()). */
  actualSize: number | null;

  /** The resolved basis before grow/shrink. */
  resolvedBasis: number;

  /** Whether this section was omitted during triage. */
  omitted: boolean;

  /** Whether this section hit its max cap. */
  cappedAtMax: boolean;

  /** Whether this section hit its min floor. */
  cappedAtMin: boolean;

  /** Whether grow was applied to this section. */
  grew: boolean;

  /** Whether shrink was applied to this section. */
  shrunk: boolean;

  /**
   * Overflow status: how actual content compares to allocation.
   * Only present when actualSize is provided.
   * - 'fits': actualSize <= allocation
   * - 'overflow': actualSize > allocation
   */
  status: 'fits' | 'overflow' | null;

  /** Tokens over budget (actualSize - allocation), or 0 if fits. */
  overflowTokens: number;
}

// ── Fitted Content ──────────────────────────────────────────────────

/** Result of the fit() method: allocation + truncated content. */
interface FittedContent {
  /** The allocation result. */
  allocation: AllocationResult;

  /** Per-section fitted content. */
  sections: Record<string, FittedSection>;
}

/** A section's content after fitting to its allocated budget. */
interface FittedSection {
  /** The original content. */
  original: string | Message[];

  /** The fitted (potentially truncated) content. */
  fitted: string | Message[];

  /** Original token count. */
  originalTokens: number;

  /** Fitted token count. */
  fittedTokens: number;

  /** Whether truncation was applied. */
  wasTruncated: boolean;

  /** Number of tokens removed by truncation. */
  tokensRemoved: number;

  /** For 'messages' truncation: number of messages removed. */
  messagesRemoved?: number;
}

// ── Budget Report ───────────────────────────────────────────────────

/** Allocation report for monitoring and visualization. */
interface BudgetReport {
  /** Model name (if provided). */
  model: string | null;

  /** Total context window size. */
  contextWindow: number;

  /** Output reservation. */
  outputReservation: number;

  /** Available budget. */
  availableBudget: number;

  /** Total tokens allocated. */
  totalAllocated: number;

  /** Overall utilization percentage. */
  utilization: number;

  /** Per-section report. */
  sections: Record<string, SectionReport>;

  /** Timestamp of the allocation. */
  timestamp: string;
}

/** Report for a single section. */
interface SectionReport {
  /** Allocated tokens. */
  allocated: number;

  /** Actual tokens used (if known). */
  used: number | null;

  /** Remaining tokens (allocated - used). */
  remaining: number | null;

  /** Section utilization percentage. */
  utilization: number | null;

  /** Percentage of total budget. */
  budgetShare: number;

  /** Whether the section was omitted. */
  omitted: boolean;
}

// ── Events ──────────────────────────────────────────────────────────

/** Emitted when a section's content exceeds its allocation. */
interface OverflowEvent {
  /** The section name. */
  section: string;

  /** Allocated tokens. */
  allocated: number;

  /** Actual content tokens. */
  actual: number;

  /** Overflow amount. */
  overflow: number;

  /** The section's overflow strategy. */
  strategy: OverflowStrategy;
}

// ── Message Type (for conversation fitting) ─────────────────────────

/** A message in the LLM conversation. */
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

// ── Error Classes ───────────────────────────────────────────────────

/** Base error for all context-budget errors. */
class BudgetError extends Error {
  readonly code: string;
}

/** Thrown when the budget cannot accommodate required sections. */
class BudgetExceededError extends BudgetError {
  readonly code = 'BUDGET_EXCEEDED';
  readonly availableBudget: number;
  readonly requiredMinimum: number;
  readonly sections: string[];
}

/** Thrown when a section's content exceeds its allocation and overflow is 'error'. */
class SectionOverflowError extends BudgetError {
  readonly code = 'SECTION_OVERFLOW';
  readonly section: string;
  readonly allocated: number;
  readonly actual: number;
}

/** Thrown when configuration is invalid. */
class BudgetConfigError extends BudgetError {
  readonly code = 'BUDGET_CONFIG_ERROR';
  readonly validationErrors: string[];
}

/** Thrown when a model name is not recognized. */
class UnknownModelError extends BudgetError {
  readonly code = 'UNKNOWN_MODEL';
  readonly model: string;
}
```

### ContextBudget API

```typescript
/**
 * Create a new context budget allocator.
 *
 * @param config - Budget configuration including context window size,
 *   section definitions, and optional token counter.
 * @returns A ContextBudget instance.
 * @throws BudgetConfigError if the configuration is invalid.
 * @throws UnknownModelError if the model name is not recognized.
 */
function createBudget(config: BudgetConfig): ContextBudget;

/** The context budget allocator instance. */
interface ContextBudget {
  // ── Allocation ────────────────────────────────────────────────────

  /**
   * Allocate token budgets across sections based on actual content sizes.
   *
   * @param actualSizes - Map of section names to actual token counts.
   *   Sections not in this map use their basis for allocation.
   *   Sections with basis 'auto' that are not in this map get 0 tokens.
   * @returns The allocation result with per-section budgets.
   * @throws BudgetExceededError if protected sections exceed the budget.
   */
  allocate(actualSizes?: Record<string, number>): AllocationResult;

  /**
   * Fit content into allocated budgets. Counts tokens, allocates,
   * and truncates content to fit within each section's allocation.
   *
   * @param contents - Map of section names to content.
   *   String content is truncated according to the section's truncation strategy.
   *   Message[] content is truncated using the 'messages' strategy.
   * @returns The fitted content with allocation and truncation details.
   * @throws BudgetExceededError if protected sections exceed the budget.
   * @throws SectionOverflowError if overflow strategy is 'error' and content overflows.
   */
  fit(contents: Record<string, string | Message[]>): FittedContent;

  // ── Section Management ────────────────────────────────────────────

  /**
   * Add a section to the budget.
   * @throws BudgetConfigError if a section with the same name already exists.
   */
  addSection(name: string, config: Partial<SectionConfig>): void;

  /**
   * Remove a section from the budget.
   * @throws BudgetConfigError if the section does not exist.
   */
  removeSection(name: string): void;

  /**
   * Get the configuration for a section.
   * Returns null if the section does not exist.
   */
  getSection(name: string): SectionConfig | null;

  /**
   * List all section names.
   */
  getSectionNames(): string[];

  /**
   * Update a section's configuration (shallow merge).
   * @throws BudgetConfigError if the section does not exist.
   */
  updateSection(name: string, config: Partial<SectionConfig>): void;

  // ── Budget Configuration ──────────────────────────────────────────

  /**
   * Get the current available budget (contextWindow - outputReservation).
   */
  getAvailableBudget(): number;

  /**
   * Get the context window size.
   */
  getContextWindow(): number;

  /**
   * Get the output reservation.
   */
  getOutputReservation(): number;

  /**
   * Update the context window size.
   * Useful when switching models mid-conversation.
   */
  setContextWindow(tokens: number): void;

  /**
   * Update the context window by model name.
   * @throws UnknownModelError if the model is not recognized.
   */
  setModel(model: string): void;

  /**
   * Update the output reservation.
   */
  setOutputReservation(tokens: number): void;

  // ── Reporting ─────────────────────────────────────────────────────

  /**
   * Generate a budget report from the last allocation.
   * Returns null if no allocation has been performed.
   */
  report(): BudgetReport | null;

  /**
   * Generate a text-formatted budget report for logging/debugging.
   * Returns a human-readable string showing the allocation breakdown.
   */
  reportText(): string;
}
```

### Function Signatures

```typescript
/**
 * Create a new context budget allocator.
 *
 * @param config - Budget configuration.
 * @returns A ContextBudget instance for allocating token budgets.
 * @throws BudgetConfigError if configuration validation fails:
 *   - Neither contextWindow nor model is specified.
 *   - Both contextWindow and model are specified.
 *   - contextWindow is not a positive integer.
 *   - outputReservation is negative.
 *   - Section min > max.
 *   - Section grow, shrink, or priority is negative.
 *   - No sections defined.
 * @throws UnknownModelError if model name is not in the preset registry.
 */
function createBudget(config: BudgetConfig): ContextBudget;

/**
 * Register a custom model with its context window size.
 * Registered models can be used with `createBudget({ model: name })`.
 *
 * @param name - Model identifier (e.g., 'my-custom-model').
 * @param contextWindow - Context window size in tokens.
 */
function registerModel(name: string, contextWindow: number): void;

/**
 * Get the context window size for a model name.
 * Returns undefined if the model is not recognized.
 *
 * @param name - Model identifier.
 * @returns Context window size in tokens, or undefined.
 */
function getModelContextWindow(name: string): number | undefined;
```

---

## 9. Content Fitting

The `fit()` method goes beyond allocation: it takes actual content for each section, counts tokens, allocates budgets, and returns truncated content that fits within each section's allocation.

### String Content Truncation

For sections containing plain text (system prompt, RAG chunks concatenated, memory entries concatenated), truncation is applied character-by-character using the token counter to find the boundary.

**`head` (keep beginning)**: Binary search for the longest prefix whose token count is within the allocation. This is the default for most sections.

```
Original:  "You are a helpful assistant who specializes in customer support..."
Allocated: 10 tokens
Fitted:    "You are a helpful assistant who"  (10 tokens)
```

**`tail` (keep end)**: Binary search for the shortest suffix whose token count is within the allocation. Useful for memory sections where the most recent entries are most relevant.

```
Original:  "Early fact. Middle fact. Recent and important fact."
Allocated: 8 tokens
Fitted:    "Recent and important fact."  (6 tokens)
```

**`middle-out` (keep start and end)**: Split the allocation between the first 40% and last 60% of the content. This preserves the beginning (often contains important context or instructions) and the end (most recent information), dropping the middle.

```
Original:  "Introduction. ... long middle section ... Conclusion with key details."
Allocated: 20 tokens
Fitted:    "Introduction. ... [truncated] ... Conclusion with key details."
```

### Message Array Truncation

For conversation sections containing `Message[]`, the `messages` truncation strategy removes complete messages from the oldest end of the array, preserving:

1. **System messages**: Never removed.
2. **Tool call pairs**: If an assistant message with tool calls is removed, its corresponding tool result messages are removed too. If a tool result is the oldest message, the assistant message that called it is also removed.
3. **The most recent messages**: Removed from the oldest end toward the newest.

```typescript
// Original: 20 messages totaling 15,000 tokens
// Allocated: 8,000 tokens
// Result: Remove the 8 oldest non-system messages (preserving tool call pairs),
//         keeping the 12 most recent messages within 8,000 tokens.
```

### Per-Section Truncation Configuration

Each section's `truncation` property determines which strategy is used for that section's content. This allows different sections to use different strategies:

```typescript
const budget = createBudget({
  model: 'gpt-4o',
  sections: {
    system: { shrink: 0, truncation: 'head', overflow: 'error' },
    rag: { grow: 2, truncation: 'tail' },        // Drop least relevant (last) chunks
    conversation: { grow: 1, truncation: 'messages' }, // Drop oldest messages
    currentMessage: { shrink: 0, overflow: 'error' },
  },
});
```

---

## 10. Overflow Strategies

Overflow occurs when a section's actual content size exceeds its allocated budget. Each section independently configures its response to overflow.

### `truncate`

The content is silently truncated to fit within the allocation using the section's truncation strategy. No error is thrown, no warning is emitted. This is the default for most sections and is appropriate when truncation is an expected and acceptable operation (e.g., conversation history is expected to be truncated on every turn once the conversation grows beyond the budget).

### `error`

A `SectionOverflowError` is thrown. This is appropriate for sections that must not be truncated under any circumstances. If the system prompt exceeds its allocation, something is fundamentally wrong (the prompt is too long for the model, or the budget configuration is incorrect). Throwing an error forces the developer to fix the root cause rather than silently degrading quality.

### `warn`

The content is truncated to fit (same as `truncate`), but the `onOverflow` callback is invoked with an `OverflowEvent` describing the overflow. This is appropriate for sections where truncation is acceptable but the developer wants visibility into when it happens (e.g., tool definitions being truncated may indicate that the application has too many tools for the model).

### `summarize`

The content is not truncated. Instead, the allocation result marks the section with `status: 'overflow'` and `overflowTokens` indicating how many tokens over budget the content is. The caller is expected to invoke a summarization pipeline to compress the content. This integrates with `sliding-context`: when `context-budget` reports that the conversation section overflows, the caller triggers `sliding-context`'s summarization to compress older messages.

```typescript
const result = budget.fit(contents);
for (const [name, section] of Object.entries(result.allocation.sections)) {
  if (section.status === 'overflow' && budget.getSection(name)?.overflow === 'summarize') {
    // Trigger summarization for this section
    await slidingContext.summarize(section.overflowTokens);
    // Re-fit after summarization
    contents[name] = await slidingContext.getMessages();
  }
}
const finalResult = budget.fit(contents);
```

---

## 11. Model Presets

`context-budget` ships with built-in context window sizes for common LLM models. These are used when `createBudget({ model: 'gpt-4o' })` is called instead of specifying `contextWindow` directly.

### OpenAI Models

| Model | Context Window | Notes |
|---|---|---|
| `gpt-4o` | 128,000 | |
| `gpt-4o-mini` | 128,000 | |
| `gpt-4-turbo` | 128,000 | |
| `gpt-4` | 8,192 | Original GPT-4 |
| `gpt-4-32k` | 32,768 | |
| `gpt-3.5-turbo` | 16,385 | |
| `gpt-3.5-turbo-16k` | 16,385 | |
| `gpt-4.1` | 1,047,576 | |
| `gpt-4.1-mini` | 1,047,576 | |
| `gpt-4.1-nano` | 1,047,576 | |
| `gpt-5` | 400,000 | |
| `o1` | 200,000 | |
| `o1-mini` | 128,000 | |
| `o3` | 200,000 | |
| `o3-mini` | 200,000 | |
| `o4-mini` | 200,000 | |

### Anthropic Models

| Model | Context Window | Notes |
|---|---|---|
| `claude-sonnet-4-20250514` | 200,000 | Standard; 1M via extended thinking |
| `claude-opus-4-20250514` | 200,000 | Standard; 1M via extended thinking |
| `claude-3-5-sonnet-20241022` | 200,000 | |
| `claude-3-5-haiku-20241022` | 200,000 | |
| `claude-3-haiku-20240307` | 200,000 | |

Aliases are supported for convenience: `claude-sonnet-4` resolves to `claude-sonnet-4-20250514`, `claude-opus-4` resolves to `claude-opus-4-20250514`.

### Google Models

| Model | Context Window | Notes |
|---|---|---|
| `gemini-2.5-pro` | 1,048,576 | |
| `gemini-2.5-flash` | 1,048,576 | |
| `gemini-2.0-flash` | 1,048,576 | |
| `gemini-1.5-pro` | 2,097,152 | |
| `gemini-1.5-flash` | 1,048,576 | |

### Meta Models

| Model | Context Window | Notes |
|---|---|---|
| `llama-4-scout` | 10,000,000 | |
| `llama-4-maverick` | 1,048,576 | |
| `llama-3.3-70b` | 131,072 | |
| `llama-3.1-405b` | 131,072 | |

### Custom Models

Applications can register custom models at runtime:

```typescript
import { registerModel, createBudget } from 'context-budget';

registerModel('my-fine-tuned-llama', 8192);

const budget = createBudget({
  model: 'my-fine-tuned-llama',
  sections: { /* ... */ },
});
```

### Practical Budget vs. Stated Context Window

A model advertising 200K tokens does not perform well at 200K tokens. Research consistently shows performance degradation well before the stated limit -- models claiming 200K tokens typically become unreliable around 130K tokens. `context-budget` uses the stated context window as the hard limit (the API will reject larger inputs), but callers should configure their `contextWindow` to a practical limit below the stated maximum if response quality is important:

```typescript
// Conservative: use 80% of stated limit for production quality
const budget = createBudget({
  contextWindow: Math.floor(128000 * 0.8), // 102,400 tokens
  sections: { /* ... */ },
});
```

---

## 12. Token Counting

### Built-in Approximate Counter

The default token counter estimates tokens as `Math.ceil(text.length / 4)`. This approximation is based on the empirical observation that common BPE tokenizers (GPT's cl100k_base and o200k_base, Anthropic's tokenizer) produce roughly one token per 4 characters for English text.

| Content Type | Actual Chars/Token | Approximate Accuracy |
|---|---|---|
| English prose | ~4.0 | ~95% |
| Code (JavaScript/Python) | ~3.5 | ~85% (overestimates slightly) |
| JSON data | ~3.0 | ~75% (overestimates more) |
| CJK text (Chinese, Japanese, Korean) | ~1.5 | ~35% (severely underestimates) |
| URLs and technical strings | ~2.5 | ~60% (overestimates) |

The approximate counter consistently overestimates for English text, which is safe -- the context will fit within the budget, but some capacity is wasted. For CJK text, the counter severely underestimates, which is unsafe. Callers working with non-Latin text must provide an exact token counter.

### Pluggable Exact Counter

The caller provides a `tokenCounter` function for exact counting:

```typescript
// Using gpt-tokenizer (pure JS, fast, no WASM)
import { encode } from 'gpt-tokenizer';
const budget = createBudget({
  model: 'gpt-4o',
  tokenCounter: (text) => encode(text).length,
  sections: { /* ... */ },
});

// Using js-tiktoken
import { getEncoding } from 'js-tiktoken';
const enc = getEncoding('o200k_base');
const budget = createBudget({
  model: 'gpt-4o',
  tokenCounter: (text) => enc.encode(text).length,
  sections: { /* ... */ },
});

// Using Anthropic's token counting API
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();
// Note: Anthropic's count_tokens is async; wrap in a sync approximation
// or use the approximate counter and validate with the API periodically.
const budget = createBudget({
  model: 'claude-sonnet-4',
  tokenCounter: (text) => Math.ceil(text.length / 3.5), // Anthropic approximation
  sections: { /* ... */ },
});
```

### Message Token Counting

When counting tokens for conversation messages, each message incurs an overhead beyond its content tokens. For OpenAI models, each message adds approximately 3-4 tokens for role prefixes and formatting delimiters. For Anthropic models, the overhead differs.

The `messageOverhead` option (default: 4) specifies this per-message overhead. When the `fit()` method counts tokens for a `Message[]` section, it adds `messageOverhead` to each message's content token count.

```
messageTokens = tokenCounter(message.content) + messageOverhead
                + (message.name ? tokenCounter(message.name) + 1 : 0)
                + (message.tool_calls ? tokenCounter(JSON.stringify(message.tool_calls)) : 0)
```

---

## 13. Configuration

### Full Configuration with All Defaults

```typescript
const budget = createBudget({
  // Context window (one of contextWindow or model is required)
  contextWindow: 128000,        // Total context window in tokens
  // model: 'gpt-4o',           // Alternative: resolve from model preset

  // Output reservation
  outputReservation: 4096,      // Tokens reserved for model response (default: 4096)

  // Token counting
  tokenCounter: (text) => Math.ceil(text.length / 4),  // Default: approximate
  messageOverhead: 4,           // Per-message overhead (default: 4)

  // Event callbacks
  onOverflow: (event) => {},    // Called on 'warn' overflow (default: undefined)
  onAllocate: (report) => {},   // Called after each allocation (default: undefined)

  // Section definitions
  sections: {
    system: {
      basis: 'auto',            // Default: 'auto'
      grow: 0,                  // Default: 0
      shrink: 0,                // Default: 0
      min: 0,                   // Default: 0
      max: Infinity,            // Default: Infinity
      priority: 100,            // Default: 100 (for system)
      overflow: 'error',        // Default: 'error' (for system)
      truncation: 'head',       // Default: 'head'
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
  },
});
```

### Preset Configurations

Presets pre-populate section definitions for common use cases. The caller's `sections` config overrides preset values (shallow merge per section).

**`chatbot` preset**: System prompt + conversation + current message.

```typescript
const budget = createBudget({
  model: 'gpt-4o-mini',
  preset: 'chatbot',
  outputReservation: 2048,
});
// Sections: system, conversation, currentMessage
```

**`rag` preset**: System prompt + RAG context + current message.

```typescript
const budget = createBudget({
  model: 'gpt-4o',
  preset: 'rag',
  outputReservation: 4096,
});
// Sections: system, rag, currentMessage
```

**`agent` preset**: System prompt + tools + memory + conversation + current message.

```typescript
const budget = createBudget({
  model: 'claude-sonnet-4',
  preset: 'agent',
  outputReservation: 4096,
});
// Sections: system, tools, memory, conversation, currentMessage
```

**`full` preset**: All built-in sections.

```typescript
const budget = createBudget({
  model: 'gpt-4o',
  preset: 'full',
  outputReservation: 4096,
});
// Sections: system, tools, memory, rag, conversation, currentMessage
```

### Configuration Validation

When `createBudget()` is called, the configuration is validated:

- Exactly one of `contextWindow` or `model` must be specified.
- `contextWindow` must be a positive integer.
- `outputReservation` must be non-negative and less than `contextWindow`.
- At least one section must be defined (either via `sections` or `preset`).
- For each section:
  - `grow` must be non-negative.
  - `shrink` must be non-negative.
  - `min` must be non-negative.
  - `max` must be positive and >= `min`.
  - `priority` must be non-negative.
  - `overflow` must be one of `'truncate'`, `'error'`, `'warn'`, `'summarize'`.
  - `truncation` must be one of `'head'`, `'tail'`, `'middle-out'`, `'messages'`.
  - `basis` must be a non-negative number, a percentage string (e.g., `'10%'`), or `'auto'`.

Validation errors are collected and thrown as a `BudgetConfigError` with a `validationErrors` array.

---

## 14. Visualization and Reporting

### Text Report

The `reportText()` method returns a human-readable string showing the budget allocation:

```
Context Budget Report
═════════════════════════════════════════════════════════
Model:              gpt-4o
Context Window:     128,000 tokens
Output Reservation: 4,096 tokens
Available Budget:   123,904 tokens
Total Allocated:    123,904 tokens (100.0%)
═════════════════════════════════════════════════════════

Section           Allocated    Used   Remaining   Util%   Share%
─────────────────────────────────────────────────────────────────
system                  450     450           0  100.0%     0.4%
tools                 2,800   2,800           0  100.0%     2.3%
memory                3,200   2,100       1,100   65.6%     2.6%
rag                  12,454  12,454           0  100.0%    10.1%
conversation        104,650  98,200       6,450   93.8%    84.5%
currentMessage          350     350           0  100.0%     0.3%
─────────────────────────────────────────────────────────────────
TOTAL               123,904 116,354       7,550   93.9%   100.0%

Omitted sections: (none)
Triage triggered: no
Shrink applied: no
```

### Structured Report

The `report()` method returns a `BudgetReport` object (defined in the type definitions above) that can be serialized to JSON, piped to `context-lens` for visualization, or sent to a monitoring system.

### Bar Visualization

The `reportText()` method includes an optional ASCII bar chart when the terminal supports it:

```
system          ██ 0.4%
tools           █████ 2.3%
memory          ██████ 2.6%
rag             ████████████████████ 10.1%
conversation    ████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████ 84.5%
currentMessage  █ 0.3%
```

---

## 15. Integration with Sibling Packages

### sliding-context

`context-budget` allocates the budget; `sliding-context` manages conversation history within that budget. The integration pattern:

```typescript
import { createBudget } from 'context-budget';
import { createContext } from 'sliding-context';

const budget = createBudget({
  model: 'gpt-4o',
  preset: 'agent',
  outputReservation: 4096,
});

// Allocate budgets based on current content
const allocation = budget.allocate({
  system: 450,
  tools: 2800,
  memory: 600,
  conversation: 25000,  // Current conversation size
  currentMessage: 300,
});

// Create sliding-context with the allocated conversation budget
const ctx = createContext({
  tokenBudget: allocation.sections.conversation.allocation,
  systemPrompt: systemPromptText,
  summarizer: mySummarizer,
});
```

When the conversation grows and the budget shifts, update the sliding context:

```typescript
// On each turn, re-allocate and update the conversation budget
const newAllocation = budget.allocate({
  system: 450,
  tools: 2800,
  memory: 800,       // More memory retrieved
  conversation: 30000, // Conversation grew
  currentMessage: 500,
});

await ctx.setTokenBudget(newAllocation.sections.conversation.allocation);
const messages = await ctx.getMessages();
```

### context-packer

`context-budget` allocates the RAG budget; `context-packer` packs retrieved chunks within that budget.

```typescript
import { createBudget } from 'context-budget';
import { packChunks } from 'context-packer';

const budget = createBudget({ model: 'gpt-4o', preset: 'rag' });
const allocation = budget.allocate({
  system: 300,
  rag: 15000,       // Lots of chunks retrieved
  currentMessage: 200,
});

// Pack chunks within the allocated RAG budget
const packed = packChunks(retrievedChunks, {
  maxTokens: allocation.sections.rag.allocation,
  tokenCounter: myTokenCounter,
});
```

### prompt-optimize

`context-budget` can work with `prompt-optimize` to compress prompts that exceed their allocation.

```typescript
import { createBudget } from 'context-budget';
import { optimize } from 'prompt-optimize';

const budget = createBudget({ model: 'gpt-4o', preset: 'agent' });
const allocation = budget.allocate({ system: 800, /* ... */ });

if (allocation.sections.system.status === 'overflow') {
  // System prompt exceeds allocation -- compress it
  const optimized = await optimize(systemPrompt, {
    maxTokens: allocation.sections.system.allocation,
  });
  // Re-allocate with compressed prompt
  budget.allocate({ system: optimized.tokenCount, /* ... */ });
}
```

### llm-info and model-price-registry

`context-budget` includes a built-in model preset registry for convenience, but callers can use `llm-info` for authoritative model metadata:

```typescript
import { getModel } from 'llm-info';
import { createBudget } from 'context-budget';

const modelInfo = getModel('gpt-4o');
const budget = createBudget({
  contextWindow: modelInfo.contextWindow,
  outputReservation: modelInfo.maxOutputTokens,
  sections: { /* ... */ },
});
```

---

## 16. Testing Strategy

### Unit Tests

Unit tests cover the core allocation algorithm with deterministic inputs and expected outputs.

**Basis resolution tests**: Verify that numeric basis, percentage basis, and `'auto'` basis resolve correctly.

**Grow phase tests**:
- Surplus distributes proportionally to grow factors.
- Sections with `grow: 0` do not absorb surplus.
- Max caps are respected, with freed tokens redistributed.
- Multiple redistribution passes converge.
- All surplus is distributed (no tokens lost).

**Shrink phase tests**:
- Deficit reduces sections proportionally to `shrink * allocation` (weighted shrink).
- Sections with `shrink: 0` are not shrunk.
- Min floors are respected, with unsatisfied deficit redistributed.
- Sections are never shrunk below min.

**Triage tests**:
- When sum of minimums exceeds budget, lowest-priority sections are omitted.
- Omitted sections have allocation 0 and are listed in `result.omitted`.
- Priority 100 sections are never omitted.
- When protected sections alone exceed budget, `BudgetExceededError` is thrown.

**Edge case tests**:
- Single section absorbs entire budget.
- All sections have `grow: 0` and `shrink: 0` (static allocation).
- All sections have `basis: 0` (everything grows from zero).
- Zero surplus, zero deficit (perfect fit).
- Empty sections map (throws `BudgetConfigError`).
- Negative values (throws `BudgetConfigError`).

### Fit Tests

Tests for the `fit()` method covering content truncation:

- String content truncated with `head`, `tail`, and `middle-out` strategies.
- Message array truncated with `messages` strategy preserving tool call pairs.
- Overflow strategies: `truncate` silently truncates, `error` throws, `warn` invokes callback.
- `summarize` overflow marks section as overflowing without truncation.
- Token counting accuracy with the approximate counter.
- Token counting accuracy with a provided exact counter.

### Model Preset Tests

- All built-in model names resolve to positive integer context window sizes.
- Aliases resolve correctly.
- Unknown models throw `UnknownModelError`.
- Custom models can be registered and resolved.

### Report Tests

- `report()` returns correct structure after allocation.
- `reportText()` produces correctly formatted output.
- Utilization percentages are calculated correctly.

### Integration Tests

- Budget allocation followed by `sliding-context` usage: the conversation fits within the allocated budget.
- Re-allocation after conversation growth: `sliding-context`'s budget is updated correctly.
- Full pipeline: create budget, allocate, fit content, verify all sections fit.

---

## 17. Performance

### Allocation Speed

The allocation algorithm runs in O(n * k) time, where n is the number of sections and k is the maximum number of redistribution passes (capped at n for max/min constraints). For typical configurations with 3-8 sections, allocation completes in microseconds. The algorithm is pure arithmetic with no I/O, no async operations, and no heavy computation.

### Token Counting

Token counting is the dominant cost when using `fit()`. The approximate counter is O(1) (string length). Exact counters (tiktoken, gpt-tokenizer) are O(n) in the length of the text. For a 100K-token conversation, exact counting may take 10-50ms depending on the tokenizer. The `fit()` method counts each section's content once.

### Memory

The `ContextBudget` instance stores section configurations (a few hundred bytes per section) and the last allocation result. No content is stored -- content is passed to `allocate()` and `fit()` and not retained. Memory usage is constant regardless of content size.

### Recommendations

- For prototyping and development, the approximate counter is sufficient.
- For production with cost-sensitive token counting, use an exact counter.
- Call `allocate()` once per LLM request. Do not call it in tight loops.
- The `fit()` method counts tokens and allocates in a single call. If you only need allocation (no truncation), use `allocate()` to avoid the token counting cost.

---

## 18. Dependencies

### Runtime Dependencies

None. `context-budget` uses only built-in JavaScript APIs. The approximate token counter uses `String.prototype.length` and `Math.ceil`. The allocation algorithm uses arithmetic operations on arrays. No external packages are required.

### Peer Dependencies

None. Integration with `sliding-context`, `context-packer`, `prompt-optimize`, and token counting libraries is through documented interfaces, not package dependencies. The caller imports those packages separately and passes values between them.

### Development Dependencies

- `typescript` >= 5.0 for compilation.
- `vitest` for testing.
- `eslint` for linting.

---

## 19. File Structure

```
context-budget/
├── package.json
├── tsconfig.json
├── SPEC.md
├── README.md
├── src/
│   ├── index.ts                 # Public API exports
│   ├── budget.ts                # ContextBudget class implementation
│   ├── allocator.ts             # Core allocation algorithm (grow, shrink, triage)
│   ├── sections.ts              # Built-in section presets and SectionConfig defaults
│   ├── models.ts                # Model preset registry (name → context window size)
│   ├── fitter.ts                # Content fitting and truncation logic
│   ├── counter.ts               # Built-in approximate token counter
│   ├── report.ts                # Budget report generation (structured and text)
│   ├── types.ts                 # All TypeScript type definitions
│   ├── errors.ts                # Error classes
│   └── __tests__/
│       ├── allocator.test.ts    # Allocation algorithm unit tests
│       ├── budget.test.ts       # ContextBudget integration tests
│       ├── fitter.test.ts       # Content fitting and truncation tests
│       ├── models.test.ts       # Model preset resolution tests
│       ├── sections.test.ts     # Section preset tests
│       ├── report.test.ts       # Report generation tests
│       └── counter.test.ts      # Approximate counter accuracy tests
└── dist/                        # Compiled output (gitignored)
```

---

## 20. Implementation Roadmap

### Phase 1: Core Allocator

- Implement `SectionConfig` type and defaults.
- Implement the multi-pass allocation algorithm: basis resolution, grow distribution, shrink distribution, triage.
- Implement `createBudget()` and `budget.allocate()`.
- Write comprehensive unit tests for the algorithm.
- Verify: all grow/shrink/triage test cases pass.

### Phase 2: Model Presets and Configuration

- Implement model preset registry with all built-in models.
- Implement `registerModel()` and `getModelContextWindow()`.
- Implement preset configurations (`chatbot`, `rag`, `agent`, `full`).
- Implement configuration validation.
- Write tests for model resolution, presets, and validation.

### Phase 3: Content Fitting

- Implement the approximate token counter.
- Implement `budget.fit()` with string truncation strategies (`head`, `tail`, `middle-out`).
- Implement `messages` truncation strategy for `Message[]` content.
- Implement overflow strategies (`truncate`, `error`, `warn`, `summarize`).
- Write tests for fitting and truncation.

### Phase 4: Reporting and Visualization

- Implement `budget.report()` returning structured `BudgetReport`.
- Implement `budget.reportText()` with formatted text output and ASCII bar chart.
- Write tests for report accuracy and formatting.

### Phase 5: Section Management and Dynamic Updates

- Implement `addSection()`, `removeSection()`, `updateSection()`.
- Implement `setContextWindow()`, `setModel()`, `setOutputReservation()`.
- Write tests for dynamic reconfiguration.

### Phase 6: Integration Testing

- Write integration tests with `sliding-context` (mock or real).
- Write integration tests with `context-packer` (mock or real).
- End-to-end test: create budget, allocate across all sections, fit content, verify everything fits.
- Performance benchmarking: measure allocation time for various section counts.

---

## 21. Example Use Cases

### Chatbot with Token-Limited Model

A simple chatbot using GPT-4o-mini with a modest context budget:

```typescript
import { createBudget } from 'context-budget';

const budget = createBudget({
  model: 'gpt-4o-mini',
  preset: 'chatbot',
  outputReservation: 2048,
});

// On each turn:
const systemPrompt = 'You are a friendly customer support agent for ACME Corp.';
const conversationMessages = getConversationHistory(); // Message[]

const result = budget.fit({
  system: systemPrompt,
  conversation: conversationMessages,
  currentMessage: userMessage,
});

// result.sections.conversation.fitted → truncated conversation that fits
// result.sections.system.fitted → system prompt (unchanged, protected)
// result.sections.currentMessage.fitted → user message (unchanged, protected)

const messages = [
  { role: 'system', content: result.sections.system.fitted },
  ...result.sections.conversation.fitted,
  { role: 'user', content: result.sections.currentMessage.fitted },
];

const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  max_tokens: 2048,
});
```

### RAG Pipeline with Dynamic Chunk Allocation

A RAG pipeline where the number and size of retrieved chunks varies per query:

```typescript
import { createBudget } from 'context-budget';

const budget = createBudget({
  model: 'gpt-4o',
  outputReservation: 4096,
  sections: {
    system: {
      basis: 'auto',
      shrink: 0,
      priority: 100,
      overflow: 'error',
    },
    rag: {
      basis: 0,
      grow: 1,           // Absorbs all available space
      shrink: 0,          // Do not shrink; the query needs all the context it can get
      min: 1000,          // At least some chunks
      priority: 80,
    },
    currentMessage: {
      basis: 'auto',
      shrink: 0,
      priority: 100,
      overflow: 'error',
    },
  },
});

const systemPrompt = 'Answer the user question using only the provided context. Cite sources.';
const chunks = await retrieveChunks(userQuery); // Retrieved chunks sorted by relevance
const chunksText = chunks.map(c => c.text).join('\n\n---\n\n');

const result = budget.fit({
  system: systemPrompt,
  rag: chunksText,
  currentMessage: userQuery,
});

// If chunks were truncated, only the most relevant chunks (at the start) are kept
console.log(`RAG: ${result.sections.rag.fittedTokens} tokens, ` +
            `${result.sections.rag.wasTruncated ? 'truncated' : 'full'}`);
```

### Agent with Tools and Memory

An autonomous agent with many tools, memory retrieval, and long conversation history:

```typescript
import { createBudget } from 'context-budget';
import { createContext } from 'sliding-context';

const budget = createBudget({
  model: 'claude-sonnet-4',
  outputReservation: 8192,
  sections: {
    system: { basis: 'auto', shrink: 0, priority: 100 },
    tools: { basis: 'auto', shrink: 1, min: 500, priority: 70, overflow: 'warn' },
    memory: { grow: 1, shrink: 2, max: 4000, priority: 50 },
    conversation: { grow: 1, shrink: 1, min: 4000, priority: 80 },
    currentMessage: { basis: 'auto', shrink: 0, priority: 100 },
  },
  onOverflow: (event) => {
    console.warn(`Section "${event.section}" overflowed by ${event.overflow} tokens`);
  },
});

// Count actual content sizes
const systemTokens = countTokens(systemPrompt);
const toolTokens = countTokens(JSON.stringify(toolDefinitions));
const memoryTokens = countTokens(memoryEntries.join('\n'));
const conversationTokens = countTokens(conversationMessages);
const currentMsgTokens = countTokens(currentMessage);

// Allocate budgets
const allocation = budget.allocate({
  system: systemTokens,
  tools: toolTokens,
  memory: memoryTokens,
  conversation: conversationTokens,
  currentMessage: currentMsgTokens,
});

// Use allocation to manage each section
const ctx = createContext({
  tokenBudget: allocation.sections.conversation.allocation,
  summarizer: mySummarizer,
});

// Select tools that fit within the tools budget
const selectedTools = selectToolsByBudget(toolDefinitions, allocation.sections.tools.allocation);

// Select memory entries that fit
const selectedMemory = selectMemoryByBudget(memoryEntries, allocation.sections.memory.allocation);

// Log the budget report
console.log(budget.reportText());
```

### Multi-Model Switching

An application that switches models based on query complexity:

```typescript
import { createBudget } from 'context-budget';

const budget = createBudget({
  model: 'gpt-4o-mini',  // Start with cheap model
  preset: 'agent',
  outputReservation: 2048,
});

async function handleQuery(query: string, complexity: 'simple' | 'complex') {
  if (complexity === 'complex') {
    budget.setModel('gpt-4o');
    budget.setOutputReservation(4096);
  } else {
    budget.setModel('gpt-4o-mini');
    budget.setOutputReservation(2048);
  }

  const allocation = budget.allocate({
    system: countTokens(systemPrompt),
    tools: countTokens(toolSchemas),
    conversation: countTokens(history),
    currentMessage: countTokens(query),
  });

  // Allocations automatically adjust to the model's context window
  console.log(`Conversation budget: ${allocation.sections.conversation.allocation} tokens`);
}
```

### Budget Report for Monitoring

Using budget reports to monitor context utilization in production:

```typescript
import { createBudget } from 'context-budget';

const budget = createBudget({
  model: 'gpt-4o',
  preset: 'full',
  outputReservation: 4096,
  onAllocate: (report) => {
    // Send utilization metrics to monitoring
    metrics.gauge('context.utilization', report.utilization);
    for (const [name, section] of Object.entries(report.sections)) {
      metrics.gauge(`context.section.${name}.utilization`, section.utilization ?? 0);
      metrics.gauge(`context.section.${name}.share`, section.budgetShare);
    }
    if (report.utilization > 0.9) {
      alerts.warn('Context utilization above 90%');
    }
  },
});
```
