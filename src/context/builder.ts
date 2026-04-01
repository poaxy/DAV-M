import type { CoreMessage } from '../ai/backend.js';

const MAX_STDIN_CHARS = 40_000;

export interface BuiltContext {
  /** The full user message to send as the first human turn. */
  userMessage: string;
}

/**
 * Build the user message.
 *
 * Environment context (OS, shell, cwd, git) lives in the system prompt, not here.
 * This function handles only: optional piped stdin + the user's query.
 */
export function buildUserMessage(query: string, stdinContent: string | null): BuiltContext {
  if (!stdinContent) {
    return { userMessage: query };
  }

  const truncated =
    stdinContent.length > MAX_STDIN_CHARS
      ? stdinContent.slice(0, MAX_STDIN_CHARS) +
        `\n... [truncated — ${stdinContent.length - MAX_STDIN_CHARS} chars omitted]`
      : stdinContent;

  const userMessage = `<piped_input>\n${truncated}\n</piped_input>\n\n${query}`;
  return { userMessage };
}

/** Read stdin content if stdin is not a TTY (i.e. something was piped in). */
export async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').trim() || null));
    process.stdin.on('error', () => resolve(null));
    // Timeout: if stdin hangs for 10s, give up
    setTimeout(() => resolve(null), 10_000);
  });
}

/**
 * Convert a query + optional stdin into the initial messages array
 * to send to the AI backend.
 */
export function buildInitialMessages(query: string, stdinContent: string | null): CoreMessage[] {
  const { userMessage } = buildUserMessage(query, stdinContent);
  return [{ role: 'user', content: userMessage }];
}
