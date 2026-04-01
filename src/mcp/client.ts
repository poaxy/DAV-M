import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import type { MCPConfig } from './config.js';

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;

export interface MCPSession {
  /** Merged AI SDK ToolSet from all connected servers. */
  tools: Record<string, unknown>;
  /** Call after the agent loop completes to cleanly shut down all connections. */
  close: () => Promise<void>;
}

/**
 * Connect to all MCP servers listed in `config` and return a merged tool set.
 *
 * Failures per-server are logged to stderr and skipped so the rest of the
 * session can continue without MCP tools from the failing server.
 *
 * Stdio transport routes the MCP subprocess's stderr to the parent's stderr
 * so server logs never pollute the MCP JSON-RPC channel or Ink's render stream.
 */
export async function connectMCPServers(config: MCPConfig): Promise<MCPSession> {
  const clients: MCPClient[] = [];
  let mergedTools: Record<string, unknown> = {};

  const entries = Object.entries(config.mcpServers);
  if (entries.length === 0) {
    return { tools: {}, close: async () => {} };
  }

  for (const [name, cfg] of entries) {
    try {
      const transport = buildTransport(name, cfg);
      const client = await createMCPClient({ transport });
      clients.push(client);

      const serverTools = await client.tools();
      const toolCount = Object.keys(serverTools).length;
      process.stderr.write(`[mcp] Connected to "${name}" (${toolCount} tool${toolCount !== 1 ? 's' : ''})\n`);

      mergedTools = { ...mergedTools, ...serverTools };
    } catch (err) {
      process.stderr.write(`[mcp] Warning: could not connect to "${name}": ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  return {
    tools: mergedTools,
    close: async () => {
      await Promise.all(
        clients.map((c) => c.close().catch(() => {})),
      );
    },
  };
}

function buildTransport(name: string, cfg: import('./config.js').MCPServerConfig) {
  const type = cfg.type ?? 'stdio';

  if (type === 'stdio') {
    if (!cfg.command) {
      throw new Error(`MCP server "${name}": "command" is required for stdio transport`);
    }
    return new Experimental_StdioMCPTransport({
      command: cfg.command,
      args: cfg.args,
      env: cfg.env,
      // Route MCP server's stderr to parent's stderr — keeps it off the JSON-RPC channel
      stderr: process.stderr,
    });
  }

  if (type === 'http') {
    if (!cfg.url) throw new Error(`MCP server "${name}": "url" is required for http transport`);
    return { type: 'http' as const, url: cfg.url, headers: cfg.headers };
  }

  if (type === 'sse') {
    if (!cfg.url) throw new Error(`MCP server "${name}": "url" is required for sse transport`);
    return { type: 'sse' as const, url: cfg.url, headers: cfg.headers };
  }

  throw new Error(`MCP server "${name}": unknown transport type "${type}"`);
}
