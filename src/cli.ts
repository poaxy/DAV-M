import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import updateNotifier from 'update-notifier';
import {
  loadConfig,
  overrideProvider,
  overrideModel,
  validateApiKey,
  ensureConfigDirs,
  runSetupWizard,
  runUninstall,
  getEffectiveModel,
} from './config/loader.js';
import { buildInitialMessages, readStdin } from './context/builder.js';
import { App, type AppProps } from './ui/App.js';
import { ConfigError, AuthError } from './utils/errors.js';
import { EXIT } from './exit-codes.js';
import { loadMCPConfig } from './mcp/config.js';
import { connectMCPServers } from './mcp/client.js';
import { AuditLogger, pruneOldLogs, setCliVersion } from './audit/logger.js';

export const VERSION = '1.0.0';

setCliVersion(VERSION);

export async function runCLI() {
  // ── Update notifier — background check, shown at process exit ──────────────
  // Uses `defer: true` so the notification never interrupts streaming output.
  updateNotifier({
    pkg: { name: 'dav-ai', version: VERSION },
    updateCheckInterval: 1000 * 60 * 60 * 24, // once per day
  }).notify({ defer: true, isGlobal: true });

  const program = new Command();

  program
    .name('dav')
    .description('Intelligent terminal AI assistant')
    .version(VERSION, '-v, --version')
    .argument('[query...]', 'Natural language query')
    .option('-i, --interactive', 'Start an interactive multi-turn session', false)
    .option('-e, --execute', 'Enable tool-based command execution (requires confirmation)', false)
    .option('-y, --yes', 'Auto-confirm all execution prompts', false)
    .option('--backend <provider>', 'Force AI provider: anthropic | openai | google')
    .option('--model <model>', 'Override model (e.g. claude-opus-4-6, gpt-4o, gemini-2.5-pro)')
    .option('--session <id>', 'Named session for conversation persistence')
    .option('--json', 'Output NDJSON — bypasses the TUI (useful for scripting / agents)')
    .option('--no-mcp', 'Disable MCP server connections for this invocation')
    .option('--setup', 'Run the first-time configuration wizard')
    .option('--uninstall', 'Remove all DAV-M data and print the npm uninstall command')
    .option('--no-color', 'Disable color output (for CI / scripting)')
    .allowExcessArguments(false);

  program.addHelpText('after', `
Examples:
  dav "how do I list files sorted by size"
  dav --execute "initialize a git repo with a README"
  dav --interactive
  dav --session myproject "continue where we left off"
  dav --backend openai "explain this code"
  dav --json "summarise this file" | jq .
  cat error.log | dav "what is causing these errors"
  dav --setup

MCP:
  Place .mcp.json in your project root to load MCP servers automatically.
  See: https://github.com/poaxy/dav-m#mcp
`);

  program.action(async (queryParts: string[], options) => {
    // ── Setup wizard ────────────────────────────────────────────────────────
    if (options.setup) {
      await runSetupWizard();
      process.exit(EXIT.SUCCESS);
    }

    // ── Uninstall ────────────────────────────────────────────────────────────
    if (options.uninstall) {
      await runUninstall();
      process.exit(EXIT.SUCCESS);
    }

    const query = queryParts.join(' ').trim();
    const stdinContent = await readStdin();
    const logMode = stdinContent !== null;

    if (!query && !stdinContent && !options.interactive) {
      process.stderr.write(
        'Error: No query provided. Try: dav "your question"\n' +
        '       or start an interactive session: dav -i\n' +
        '       or pipe input: cat file | dav "analyse this"\n',
      );
      process.exit(EXIT.USAGE);
    }

    const effectiveQuery =
      query ||
      (stdinContent
        ? 'Analyse the piped input above and explain any issues or notable findings.'
        : '');

    // ── Config ───────────────────────────────────────────────────────────────
    let config = loadConfig();

    if (options.backend) {
      try { config = overrideProvider(config, options.backend); }
      catch (e) {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
        process.exit(EXIT.USAGE);
      }
    }

    if (options.model) config = overrideModel(config, options.model);
    if (options.yes)   config = { ...config, autoConfirm: true };

    try {
      validateApiKey(config);
    } catch (e) {
      if (e instanceof AuthError || e instanceof ConfigError) {
        process.stderr.write(`Error: ${e.message}\n`);
        process.exit(EXIT.AUTH);
      }
      throw e;
    }

    ensureConfigDirs(config);

    // ── Audit logger ─────────────────────────────────────────────────────────
    pruneOldLogs(config.auditLogDir);
    const audit = new AuditLogger({
      logsDir: config.auditLogDir,
      provider: config.provider,
      model: getEffectiveModel(config),
    });

    const mode = [
      options.execute     ? 'execute'     : null,
      options.interactive ? 'interactive' : null,
      logMode             ? 'log'         : null,
      options.json        ? 'json'        : null,
    ].filter(Boolean).join('+') || 'chat';

    audit.sessionStart(mode);

    // ── MCP servers ──────────────────────────────────────────────────────────
    let mcpSession: Awaited<ReturnType<typeof connectMCPServers>> | null = null;

    if (options.mcp !== false) {
      const mcpConfig = loadMCPConfig();
      const serverCount = Object.keys(mcpConfig.mcpServers).length;
      if (serverCount > 0) {
        mcpSession = await connectMCPServers(mcpConfig);
      }
    }

    const firstQuery = effectiveQuery || "Hello! I'm ready to help.";
    const initialMessages = buildInitialMessages(firstQuery, stdinContent);

    // ── JSON / non-TTY mode ──────────────────────────────────────────────────
    const useJsonMode = options.json || (!process.stdout.isTTY && !options.interactive);

    if (useJsonMode) {
      try {
        await runJsonMode({
          query: firstQuery,
          config,
          stdinContent,
          executeMode: options.execute ?? false,
          initialMessages,
          mcpTools: mcpSession?.tools ?? {},
          audit,
        });
      } finally {
        await mcpSession?.close();
        audit.sessionEnd(0);
      }
      return;
    }

    // ── TUI mode ─────────────────────────────────────────────────────────────
    const props: AppProps = {
      query: firstQuery,
      config,
      stdinContent,
      executeMode: options.execute ?? false,
      interactiveMode: options.interactive ?? false,
      logMode,
      initialMessages,
      sessionId: options.session,
      mcpTools: mcpSession?.tools ?? {},
      audit,
    };

    const { waitUntilExit } = render(React.createElement(App, props));

    try {
      await waitUntilExit();
      await mcpSession?.close();
      audit.sessionEnd(0);
      process.exit(EXIT.SUCCESS);
    } catch {
      await mcpSession?.close();
      audit.sessionEnd(0);
      process.exit(EXIT.ERROR);
    }
  });

  await program.parseAsync(process.argv);
}

// ── JSON / NDJSON mode ────────────────────────────────────────────────────────

interface JsonModeParams {
  query: string;
  config: ReturnType<typeof loadConfig>;
  stdinContent: string | null;
  executeMode: boolean;
  initialMessages: ReturnType<typeof buildInitialMessages>;
  mcpTools: Record<string, unknown>;
  audit: AuditLogger;
}

/**
 * Run without Ink — emit one NDJSON object per event.
 *
 * Schema:
 *   { "type": "text",          "content": "…" }
 *   { "type": "tool_start",    "tool": "…", "input": {…} }
 *   { "type": "tool_result",   "tool": "…", "success": bool, "output": "…" }
 *   { "type": "provider_switch","from": "…", "to": "…" }
 *   { "type": "done",          "tokens": N }
 *   { "type": "error",         "message": "…" }
 */
async function runJsonMode(params: JsonModeParams): Promise<void> {
  const { query, config, stdinContent, executeMode, initialMessages, mcpTools, audit } = params;

  const emit = (obj: Record<string, unknown>) => {
    process.stdout.write(JSON.stringify(obj) + '\n');
  };

  try {
    if (executeMode) {
      const { buildSystemPrompt } = await import('./ai/system-prompt.js');
      const { runWithFailover } = await import('./agent/failover.js');

      const systemPrompt = buildSystemPrompt({ executeMode: true, interactiveMode: false, logMode: stdinContent !== null });
      const policyCtx = { executeEnabled: true, autoConfirm: true };

      await runWithFailover({
        messages: initialMessages,
        config,
        systemPrompt,
        policyCtx,
        confirmFn: async () => true,   // auto-confirm in script mode
        extraTools: mcpTools,
        onEvent: (event) => {
          switch (event.type) {
            case 'text-delta':
              emit({ type: 'text', content: event.delta });
              break;
            case 'tool-start':
              emit({ type: 'tool_start', tool: event.toolName, input: event.input });
              audit.toolCall(event.toolName, event.input);
              break;
            case 'tool-result':
              emit({ type: 'tool_result', tool: event.toolName, success: event.result.success, output: event.result.output });
              audit.toolResult(event.toolName, event.result.success, event.result.output);
              break;
            case 'provider-switch':
              emit({ type: 'provider_switch', from: event.from, to: event.to });
              audit.providerSwitch(event.from, event.to);
              break;
            case 'done':
              emit({ type: 'done', tokens: event.totalTokens });
              break;
            case 'error':
              emit({ type: 'error', message: event.error.message });
              break;
          }
        },
      });
    } else {
      const { buildSystemPrompt } = await import('./ai/system-prompt.js');
      const { streamResponse } = await import('./ai/backend.js');

      const systemPrompt = buildSystemPrompt({ executeMode: false, interactiveMode: false, logMode: stdinContent !== null });

      for await (const delta of streamResponse(initialMessages, config, systemPrompt)) {
        emit({ type: 'text', content: delta });
      }

      emit({ type: 'done', tokens: 0 });
    }

    process.exit(EXIT.SUCCESS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: 'error', message });
    audit.error('CLI_ERROR', message);

    if (err instanceof AuthError) process.exit(EXIT.AUTH);
    process.exit(EXIT.ERROR);
  }
}
