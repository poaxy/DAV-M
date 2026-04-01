export type ActionType =
  | 'read_fs'      // reading a file or directory
  | 'write_fs'     // writing or creating a file
  | 'exec_shell'   // running a shell command
  | 'glob_search'  // globbing the filesystem
  | 'grep_search'; // searching file contents

/** Outcome of policy evaluation. */
export type Decision = 'ALLOW' | 'ASK' | 'DENY';

/** Reason codes for audit logging and UX messaging. */
export type ReasonCode =
  | 'execute_disabled'    // --execute flag not passed
  | 'dangerous_command'   // matched a dangerous pattern
  | 'auto_confirm'        // auto-confirm is on → allow
  | 'mutation_requires_confirm' // write/exec always asks
  | 'read_allowed';       // reads always pass

export interface PolicyDecision {
  decision: Decision;
  reason: ReasonCode;
}

export interface PolicyContext {
  /** Whether --execute was passed on the CLI. */
  executeEnabled: boolean;
  /** Whether -y/--yes was passed (skip all prompts). */
  autoConfirm: boolean;
}
