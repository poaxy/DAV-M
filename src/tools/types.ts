import type { StructuredPatch } from 'diff';

/** Result returned by a tool handler to both the model and the UI. */
export interface ToolResult {
  /** True if the tool succeeded (even partial success). */
  success: boolean;
  /** Content sent back to the model for context. */
  output: string;
  /** Exit code for shell commands; undefined for file ops. */
  exitCode?: number;
}

/** Options passed to the user confirmation callback. */
export interface ConfirmOptions {
  /** The tool requesting confirmation, e.g. "exec_shell". */
  toolName: string;
  /** Human-readable description of the action about to be performed. */
  description: string;
  /** Whether the action is flagged as potentially dangerous. */
  isDangerous: boolean;
  /** Optional diff to show before the y/n prompt (for write/edit operations). */
  patch?: StructuredPatch;
}

/** Discriminated union of events emitted by the agent loop to the UI. */
export type AgentEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-start'; id: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool-result'; id: string; toolName: string; result: ToolResult }
  | { type: 'step-done' }
  | { type: 'done'; totalTokens: number }
  | { type: 'error'; error: Error }
  | { type: 'provider-switch'; from: string; to: string; reason: string };

/** Function signature for the user confirmation callback. */
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
