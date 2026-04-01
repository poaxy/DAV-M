#!/usr/bin/env node

// ── Color suppression — MUST happen before any chalk / Ink imports ──────────
// ESM import declarations are hoisted; dynamic import() loads modules lazily,
// so setting FORCE_COLOR=0 here is respected by chalk when the CLI module loads.
if (process.argv.includes('--no-color') || 'NO_COLOR' in process.env) {
  process.env.FORCE_COLOR = '0';
}

// ── SIGINT → exit 130 (standard Ctrl+C exit code) ───────────────────────────
process.on('SIGINT', () => process.exit(130));

// ── Lazy-load the CLI after env flags are set ────────────────────────────────
// The empty export makes this file a module so top-level await is valid.
export {};
const { runCLI } = await import('./cli.js');

runCLI().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\nError: ${message}\n`);
  process.exit(1);
});
