import { streamText, stepCountIs } from 'ai';
import type { ModelMessage } from 'ai';
import { getModel } from './providers.js';
import { classifyProviderError } from '../utils/errors.js';
import type { DavConfig } from '../config/types.js';

export type { ModelMessage };
// Alias for ergonomic usage across the codebase
export type CoreMessage = ModelMessage;

/**
 * Stream a response from the configured AI provider.
 * Yields text delta strings as they arrive.
 *
 * @throws DavError (classified) on provider failure
 */
export async function* streamResponse(
  messages: CoreMessage[],
  config: DavConfig,
  systemPrompt: string,
): AsyncGenerator<string> {
  const model = getModel(config);

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages: messages as ModelMessage[],
      stopWhen: stepCountIs(1),
    });

    for await (const delta of result.textStream) {
      yield delta;
    }
  } catch (err) {
    throw classifyProviderError(err, config.provider);
  }
}

/**
 * Generate a full response (non-streaming) from the configured AI provider.
 * Used for short one-shot operations like setup suggestions.
 */
export async function generateResponse(
  messages: CoreMessage[],
  config: DavConfig,
  systemPrompt: string,
): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of streamResponse(messages, config, systemPrompt)) {
    chunks.push(chunk);
  }
  return chunks.join('');
}
