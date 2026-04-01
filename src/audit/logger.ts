import { appendFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { AuditLogEntry } from './types.js';

/** CLI version embedded at build time via the VERSION constant in cli.ts. */
let _cliVersion = '1.0.0';
export function setCliVersion(v: string): void { _cliVersion = v; }

/** Compute today's log file path: `~/.dav/logs/audit-YYYY-MM-DD.jsonl` */
export function getLogPath(logsDir: string): string {
  const date = new Date().toISOString().slice(0, 10); // "2025-04-01"
  return join(logsDir, `audit-${date}.jsonl`);
}

/**
 * Append one entry to the audit log.
 * Errors are swallowed — audit failures must never crash the CLI.
 */
export function writeAuditEntry(
  logPath: string,
  partial: Omit<AuditLogEntry, 'ts' | 'entry_id' | 'cli_version' | 'cwd'>,
): void {
  try {
    const dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const entry: AuditLogEntry = {
      ts: new Date().toISOString(),
      entry_id: crypto.randomUUID(),
      cli_version: _cliVersion,
      cwd: process.cwd(),
      ...partial,
    };

    appendFileSync(logPath, JSON.stringify(entry) + '\n', { encoding: 'utf8', flag: 'a' });
  } catch {
    // Silently swallow — audit must never affect the user experience
  }
}

/**
 * Delete log files older than `keepDays` days.
 * Called once at session start. Errors are swallowed.
 */
export function pruneOldLogs(logsDir: string, keepDays = 30): void {
  try {
    if (!existsSync(logsDir)) return;
    const cutoff = Date.now() - keepDays * 86_400_000;
    const files = readdirSync(logsDir).filter(
      (f) => f.startsWith('audit-') && f.endsWith('.jsonl'),
    );
    for (const file of files) {
      const dateStr = file.slice(6, 16); // "YYYY-MM-DD"
      if (new Date(dateStr).getTime() < cutoff) {
        try { unlinkSync(join(logsDir, file)); } catch {}
      }
    }
  } catch {}
}

/** Truncate a value for safe storage in the audit log (avoids huge entries). */
export function truncateForAudit(value: unknown, maxChars = 500): unknown {
  if (typeof value === 'string') {
    return value.length > maxChars ? value.slice(0, maxChars) + '…' : value;
  }
  if (value === null || value === undefined) return value;
  const str = JSON.stringify(value);
  if (str.length > maxChars) return str.slice(0, maxChars) + '…';
  return value;
}

/**
 * A thin stateful wrapper that holds the session_id so callers don't
 * have to pass it on every entry.
 */
export class AuditLogger {
  readonly sessionId: string;
  private readonly logPath: string;
  private readonly provider: string;
  private readonly model: string;
  private readonly startMs: number;

  constructor(opts: { logsDir: string; provider: string; model: string }) {
    this.sessionId = crypto.randomUUID();
    this.logPath = getLogPath(opts.logsDir);
    this.provider = opts.provider;
    this.model = opts.model;
    this.startMs = Date.now();
  }

  write(partial: Omit<AuditLogEntry, 'ts' | 'entry_id' | 'cli_version' | 'cwd' | 'session_id' | 'provider' | 'model'>): void {
    writeAuditEntry(this.logPath, {
      session_id: this.sessionId,
      provider: this.provider,
      model: this.model,
      ...partial,
    });
  }

  sessionStart(mode: string): void {
    this.write({ type: 'session_start', mode });
  }

  sessionEnd(totalTokens: number): void {
    this.write({
      type: 'session_end',
      session_tokens: totalTokens,
      session_ms: Date.now() - this.startMs,
    });
  }

  toolCall(toolName: string, input: unknown): void {
    this.write({
      type: 'tool_call',
      tool_name: toolName,
      tool_input: truncateForAudit(input),
    });
  }

  toolResult(toolName: string, success: boolean, output: string): void {
    this.write({
      type: 'tool_result',
      tool_name: toolName,
      tool_success: success,
      tool_output: output.length > 500 ? output.slice(0, 500) + '…' : output,
    });
  }

  providerSwitch(from: string, to: string): void {
    this.write({ type: 'provider_switch', failover_from: from, failover_to: to });
  }

  error(code: string, message: string): void {
    this.write({ type: 'error', error_code: code, error_message: message });
  }
}
