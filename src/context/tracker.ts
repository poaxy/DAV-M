import type { Provider } from '../config/types.js';

/**
 * Conservative context limits (tokens) per provider.
 * Leave ~20% headroom for the system prompt and the model's response.
 */
const CONTEXT_LIMITS: Record<Provider, number> = {
  anthropic: 160_000, // model max: 200K
  openai:    100_000, // model max: 128K
  google:    800_000, // model max: 1M
};

/**
 * Rough chars-per-token estimate. Real ratios vary by language/content
 * but 4 chars/token is a reasonable conservative estimate for English prose
 * and typical code.
 */
const CHARS_PER_TOKEN = 4;

export class ContextTracker {
  private _totalTokens = 0;

  /** Update the running token total from AI SDK usage reports. */
  update(totalTokens: number): void {
    this._totalTokens = totalTokens;
  }

  get total(): number {
    return this._totalTokens;
  }

  /** The configured limit for the given provider. */
  limit(provider: Provider): number {
    return CONTEXT_LIMITS[provider];
  }

  /** True if we're within 10% of the context limit. */
  isNearLimit(provider: Provider): boolean {
    return this._totalTokens > CONTEXT_LIMITS[provider] * 0.9;
  }

  /**
   * Trim a messages array so it fits within the context limit.
   *
   * Strategy: keep the first message (user's initial context block) and the
   * most recent messages; drop the oldest middle messages when over budget.
   * This preserves the workspace context and the latest conversation state.
   */
  trimMessages<T extends { role: string; content: unknown }>(
    messages: T[],
    provider: Provider,
  ): T[] {
    if (messages.length <= 2) return messages;

    const limit = CONTEXT_LIMITS[provider];

    // Estimate token usage for the full array
    const estimate = (msgs: T[]): number =>
      msgs.reduce((sum, m) => {
        const chars =
          typeof m.content === 'string'
            ? m.content.length
            : JSON.stringify(m.content).length;
        return sum + Math.ceil(chars / CHARS_PER_TOKEN);
      }, 0);

    if (estimate(messages) <= limit) return messages;

    // Binary-search for how many recent messages to keep (always keep first)
    let lo = 1;
    let hi = messages.length - 1;
    let best = messages;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const candidate = [messages[0], ...messages.slice(messages.length - mid)];
      if (estimate(candidate) <= limit) {
        best = candidate;
        lo = mid + 1; // try keeping more
      } else {
        hi = mid - 1; // keep fewer
      }
    }

    return best;
  }
}
