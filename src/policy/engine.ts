import { assessCommand } from '../utils/dangerous.js';
import type { ActionType, PolicyContext, PolicyDecision } from './types.js';

/**
 * Evaluate a proposed action and return a policy decision.
 *
 * Decision pipeline (first match wins):
 *   1. Execution not enabled → DENY mutating actions
 *   2. Dangerous command pattern → ASK with warning
 *   3. Auto-confirm on → ALLOW everything permitted
 *   4. Mutating actions (exec_shell, write_fs) → ASK
 *   5. Read-only actions → ALLOW
 */
export function evaluate(
  action: ActionType,
  /** For exec_shell: the command string. For write_fs: the file path. Otherwise unused. */
  resource: string,
  ctx: PolicyContext,
): PolicyDecision {
  const isMutating = action === 'exec_shell' || action === 'write_fs';

  // 1. Execute not enabled: block all mutating actions
  if (!ctx.executeEnabled && isMutating) {
    return { decision: 'DENY', reason: 'execute_disabled' };
  }

  // 2. Dangerous command detection (exec_shell only)
  if (action === 'exec_shell') {
    const assessment = assessCommand(resource);
    if (assessment.isDangerous) {
      // Still ASK (not DENY) — user may have a legitimate reason.
      // The ConfirmPrompt shows the danger warning prominently.
      return { decision: 'ASK', reason: 'dangerous_command' };
    }
  }

  // 3. Auto-confirm: allow everything that isn't hard-blocked
  if (ctx.autoConfirm) {
    return { decision: 'ALLOW', reason: 'auto_confirm' };
  }

  // 4. Mutating actions always require user confirmation
  if (isMutating) {
    return { decision: 'ASK', reason: 'mutation_requires_confirm' };
  }

  // 5. Read-only operations (read_fs, glob_search, grep_search) always allowed
  return { decision: 'ALLOW', reason: 'read_allowed' };
}

/** Human-readable denial message for the given policy decision. */
export function denialMessage(decision: PolicyDecision): string {
  switch (decision.reason) {
    case 'execute_disabled':
      return 'Execution is disabled. Run with --execute to allow commands and file writes.';
    default:
      return 'Action denied by policy.';
  }
}
