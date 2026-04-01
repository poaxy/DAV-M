import { execa, ExecaError } from 'execa';
import type { ToolResult } from '../types.js';

const MAX_OUTPUT_CHARS = 20_000;
const COMMAND_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Execute a shell command and return combined stdout+stderr.
 * Non-zero exit codes are treated as soft failures — output is still returned
 * so the model can reason about the error and suggest a fix.
 */
export async function execShell(command: string): Promise<ToolResult> {
  try {
    const result = await execa({ shell: true, timeout: COMMAND_TIMEOUT_MS, reject: false })`${command}`;

    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trimEnd();
    const truncated = truncate(combined);
    const success = result.exitCode === 0;

    return {
      success,
      output: truncated || (success ? '(no output)' : `Command exited with code ${result.exitCode}`),
      exitCode: result.exitCode ?? undefined,
    };
  } catch (err) {
    // Network errors, timeouts, etc.
    const message = err instanceof ExecaError ? err.message : String(err);
    return {
      success: false,
      output: `Execution error: ${message}`,
      exitCode: 1,
    };
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const half = Math.floor(MAX_OUTPUT_CHARS / 2);
  return (
    text.slice(0, half) +
    `\n\n... [${text.length - MAX_OUTPUT_CHARS} chars truncated] ...\n\n` +
    text.slice(-half)
  );
}
