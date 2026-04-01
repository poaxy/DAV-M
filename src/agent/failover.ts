import type { DavConfig, Provider } from '../config/types.js';
import { isFailoverError } from '../utils/errors.js';
import type { AgentLoopParams } from './loop.js';
import { runAgentLoop } from './loop.js';

const FAILOVER_ORDER: Provider[] = ['anthropic', 'openai', 'google'];

function hasApiKey(provider: Provider, config: DavConfig): boolean {
  switch (provider) {
    case 'anthropic': return !!config.anthropicApiKey;
    case 'openai':    return !!config.openaiApiKey;
    case 'google':    return !!config.googleApiKey;
  }
}

/**
 * Run the agent loop with automatic provider failover.
 *
 * If `runAgentLoop` throws a failover-eligible error (rate limit, auth, network,
 * server error), automatically switch to the next provider that has an API key
 * configured. Emits a `provider-switch` event before each retry so the UI can
 * inform the user. Throws the last error if all providers are exhausted.
 *
 * MCP `extraTools` are threaded through transparently — they are provider-agnostic.
 */
export async function runWithFailover(params: AgentLoopParams): Promise<void> {
  const failed = new Set<Provider>();
  let currentConfig = params.config;

  while (true) {
    try {
      await runAgentLoop({ ...params, config: currentConfig });
      return;
    } catch (err) {
      if (!isFailoverError(err)) throw err;

      failed.add(currentConfig.provider);

      // Find the next provider with an API key that hasn't failed yet
      const next = FAILOVER_ORDER.find(
        (p) => p !== currentConfig.provider && !failed.has(p) && hasApiKey(p, params.config),
      );

      if (!next) throw err; // All providers exhausted — propagate original error

      params.onEvent({
        type: 'provider-switch',
        from: currentConfig.provider,
        to: next,
        reason: err instanceof Error ? err.message : String(err),
      });

      // Reset model to the provider default when switching; keep extraTools
      currentConfig = { ...params.config, provider: next, model: undefined };
    }
  }
}
