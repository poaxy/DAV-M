import { streamText, stepCountIs } from 'ai';
import type { ModelMessage } from 'ai';
import { getModel } from '../ai/providers.js';
import { classifyProviderError } from '../utils/errors.js';
import { buildTools } from '../tools/registry.js';
import type { AgentEvent, ConfirmFn } from '../tools/types.js';
import type { PolicyContext } from '../policy/types.js';
import type { DavConfig } from '../config/types.js';
import type { CoreMessage } from '../ai/backend.js';

const MAX_STEPS = 20;

export interface AgentLoopParams {
  messages: CoreMessage[];
  config: DavConfig;
  systemPrompt: string;
  policyCtx: PolicyContext;
  confirmFn: ConfirmFn;
  /** Called for each event from the loop. UI state is driven by these callbacks. */
  onEvent: (event: AgentEvent) => void;
  /**
   * Additional tools to merge with the built-in tool set.
   * Intended for MCP tools returned by `connectMCPServers().tools`.
   * MCP tools take precedence over built-ins on name collision.
   */
  extraTools?: Record<string, unknown>;
}

/**
 * Run the multi-step agentic loop.
 *
 * Uses Vercel AI SDK v6 `streamText` with `fullStream` to get granular events
 * (text deltas, tool-call, tool-result, errors) and maps them to `AgentEvent`s
 * for the UI layer.
 *
 * Tools are built with closures over `confirmFn` and `policyCtx` so each
 * execution can pause for user confirmation before mutations.
 *
 * @throws DavError on unrecoverable provider failures
 */
export async function runAgentLoop(params: AgentLoopParams): Promise<void> {
  const { messages, config, systemPrompt, policyCtx, confirmFn, onEvent, extraTools } = params;

  const builtinTools = buildTools(confirmFn, policyCtx);
  // MCP tools override built-ins on name collision (MCP is user-configured intent)
  const tools = extraTools
    ? { ...builtinTools, ...(extraTools as typeof builtinTools) }
    : builtinTools;

  const model = getModel(config);

  let result;
  try {
    result = streamText({
      model,
      system: systemPrompt,
      messages: messages as ModelMessage[],
      tools,
      toolChoice: 'auto',
      stopWhen: stepCountIs(MAX_STEPS),
    });
  } catch (err) {
    throw classifyProviderError(err, config.provider);
  }

  let totalTokens = 0;

  try {
    for await (const chunk of result.fullStream) {
      switch (chunk.type) {
        case 'text-delta': {
          const text = (chunk as { type: 'text-delta'; text: string }).text;
          if (text) {
            onEvent({ type: 'text-delta', delta: text });
          }
          break;
        }

        case 'tool-call': {
          onEvent({
            type: 'tool-start',
            id: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input as Record<string, unknown>,
          });
          break;
        }

        case 'tool-result': {
          const rawOutput = chunk.output;
          const outputStr =
            typeof rawOutput === 'string'
              ? rawOutput
              : JSON.stringify(rawOutput, null, 2);

          const success =
            typeof rawOutput !== 'object' ||
            rawOutput === null ||
            !('error' in (rawOutput as object));

          onEvent({
            type: 'tool-result',
            id: chunk.toolCallId,
            toolName: chunk.toolName,
            result: {
              success,
              output: outputStr,
            },
          });
          break;
        }

        case 'tool-error': {
          const errMsg =
            chunk.error instanceof Error ? chunk.error.message : String(chunk.error);
          onEvent({
            type: 'tool-result',
            id: chunk.toolCallId,
            toolName: chunk.toolName,
            result: { success: false, output: `Error: ${errMsg}` },
          });
          break;
        }

        case 'finish-step': {
          if (chunk.usage) {
            totalTokens = chunk.usage.totalTokens ?? totalTokens;
          }
          onEvent({ type: 'step-done' });
          break;
        }

        case 'finish': {
          if (chunk.totalUsage) {
            totalTokens = chunk.totalUsage.totalTokens ?? totalTokens;
          }
          break;
        }

        case 'error': {
          const err = chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error));
          throw classifyProviderError(err, config.provider);
        }

        default:
          break;
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name !== 'DavError' && err.name !== 'APIError') {
      throw classifyProviderError(err, config.provider);
    }
    throw err;
  }

  onEvent({ type: 'done', totalTokens });
}
