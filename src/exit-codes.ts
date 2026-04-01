/**
 * Standard exit codes for DAV-M CLI.
 *
 * Convention:
 *   0       — success
 *   1       — general / unhandled runtime error
 *   2       — user cancelled (Ctrl+C or /exit)
 *   3       — bad arguments / usage error
 *   4       — auth / API key not configured
 *   5       — request timed out
 *   130     — SIGINT (Ctrl+C) — 128 + SIGINT(2), POSIX standard
 */
export const EXIT = {
  SUCCESS:   0,
  ERROR:     1,
  CANCELLED: 2,
  USAGE:     3,
  AUTH:      4,
  TIMEOUT:   5,
  SIGINT:    130,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
