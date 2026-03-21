export type OverflowStrategy = 'truncate' | 'error' | 'warn' | 'summarize';

export type TruncationStrategy = 'head' | 'tail' | 'middle-out' | 'messages';

export type TokenCounter = (text: string) => number;

export interface SectionConfig {
  basis?: number | string;
  grow?: number;
  shrink?: number;
  min?: number;
  max?: number;
  priority?: number;
  overflow?: OverflowStrategy;
  truncation?: TruncationStrategy;
}

export interface BudgetConfig {
  contextWindow?: number;
  model?: string;
  outputReservation?: number;
  preset?: 'chatbot' | 'rag' | 'agent' | 'full';
  sections?: Record<string, SectionConfig>;
  tokenCounter?: TokenCounter;
}

export interface SectionAllocation {
  name: string;
  basis: number;
  allocated: number;
  min: number;
  max: number;
  priority: number;
  overflow: OverflowStrategy;
  truncation: TruncationStrategy;
}

export interface AllocationResult {
  totalBudget: number;
  outputReservation: number;
  availableBudget: number;
  sections: SectionAllocation[];
  overflowed: boolean;
}

export interface FittedSection {
  name: string;
  content: string;
  tokens: number;
  truncated: boolean;
}

export interface FittedContent {
  sections: FittedSection[];
  totalTokens: number;
  overflowed: boolean;
}

export interface SectionReport {
  name: string;
  allocated: number;
  used: number;
  remaining: number;
  utilizationPct: number;
}

export interface BudgetReport {
  totalBudget: number;
  used: number;
  remaining: number;
  utilizationPct: number;
  sections: SectionReport[];
}

export interface Message {
  role: string;
  content: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

export interface ContextBudget {
  readonly config: BudgetConfig;
  allocate(sections?: Record<string, number>): AllocationResult;
  fit(sections: Record<string, string>): FittedContent;
  report(sections: Record<string, string>): BudgetReport;
}
