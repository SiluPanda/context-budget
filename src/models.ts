const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4',
  'claude-opus-4-20250514': 'claude-opus-4',
};

const MODEL_REGISTRY: Map<string, number> = new Map([
  // OpenAI
  ['gpt-4o', 128000],
  ['gpt-4o-mini', 128000],
  ['gpt-4-turbo', 128000],
  ['gpt-4', 8192],
  ['gpt-4-32k', 32768],
  ['gpt-3.5-turbo', 16385],
  ['gpt-3.5-turbo-16k', 16385],
  ['gpt-4.1', 1047576],
  ['gpt-4.1-mini', 1047576],
  ['gpt-4.1-nano', 1047576],
  ['o1', 200000],
  ['o1-mini', 128000],
  ['o3', 200000],
  ['o3-mini', 200000],
  ['o4-mini', 200000],
  // Anthropic
  ['claude-opus-4', 200000],
  ['claude-sonnet-4', 200000],
  ['claude-3-5-sonnet-20241022', 200000],
  ['claude-3-5-haiku-20241022', 200000],
  ['claude-3-haiku-20240307', 200000],
  // Google
  ['gemini-2.5-pro', 1048576],
  ['gemini-2.5-flash', 1048576],
  ['gemini-2.0-flash', 1048576],
  ['gemini-1.5-pro', 2097152],
  ['gemini-1.5-flash', 1048576],
  // Meta
  ['llama-4-scout', 10000000],
  ['llama-4-maverick', 1048576],
  ['llama-3.3-70b', 131072],
  ['llama-3.1-405b', 131072],
]);

export function getModelContextWindow(model: string): number | undefined {
  const resolved = MODEL_ALIASES[model] ?? model;
  return MODEL_REGISTRY.get(resolved);
}

export function registerModel(name: string, contextWindow: number): void {
  if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
    throw new Error(
      `contextWindow must be a positive integer, got: ${contextWindow}`,
    );
  }
  MODEL_REGISTRY.set(name, contextWindow);
}
