/** Every line written to the JSONL audit log has this shape. */
export interface AuditLogEntry {
  // ── Identity ───────────────────────────────────────────────────────────────
  /** ISO 8601 timestamp with ms precision. */
  ts: string;
  /** UUID v4 — stable for the entire CLI invocation / interactive session. */
  session_id: string;
  /** UUID v4 — unique per log line. */
  entry_id: string;

  // ── Event classification ───────────────────────────────────────────────────
  type:
    | 'session_start'
    | 'session_end'
    | 'request'
    | 'response'
    | 'tool_call'
    | 'tool_result'
    | 'provider_switch'
    | 'error';

  // ── Provider context ───────────────────────────────────────────────────────
  provider: string;
  model: string;

  // ── Token usage ────────────────────────────────────────────────────────────
  /** Cumulative total tokens reported by the AI SDK. */
  total_tokens?: number;

  // ── Tool use ───────────────────────────────────────────────────────────────
  tool_name?: string;
  /** Sanitized input — large content is truncated. */
  tool_input?: unknown;
  tool_success?: boolean;
  /** Abbreviated output — first 500 chars only. */
  tool_output?: string;

  // ── Provider failover ─────────────────────────────────────────────────────
  failover_from?: string;
  failover_to?: string;

  // ── Error ─────────────────────────────────────────────────────────────────
  error_code?: string;
  error_message?: string;

  // ── Session metadata (session_start / session_end only) ───────────────────
  /** `dav --execute`, `dav -i`, etc. */
  mode?: string;
  /** Cumulative total tokens for the entire session (session_end only). */
  session_tokens?: number;
  /** Wall-clock session duration in ms (session_end only). */
  session_ms?: number;

  // ── Environment ───────────────────────────────────────────────────────────
  cli_version: string;
  cwd: string;
}
