import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/** A single MCP server entry — mirrors the Claude Desktop / Claude Code schema. */
export interface MCPServerConfig {
  /** Transport type. Defaults to "stdio" if omitted. */
  type?: 'stdio' | 'http' | 'sse';
  /** (stdio) Executable to spawn. */
  command?: string;
  /** (stdio) Arguments passed to the executable. */
  args?: string[];
  /** (stdio) Extra environment variables for the subprocess. */
  env?: Record<string, string>;
  /** (http | sse) Server URL. */
  url?: string;
  /** (http | sse) Additional HTTP headers (e.g. Authorization). */
  headers?: Record<string, string>;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Load MCP server configuration.
 *
 * Search order (first file that exists wins):
 *  1. `.mcp.json`  in the current working directory  (project-scoped)
 *  2. `~/.config/dav/mcp.json`                       (user-global)
 *
 * Returns an empty config if neither file is found.
 */
export function loadMCPConfig(): MCPConfig {
  const candidates = [
    join(process.cwd(), '.mcp.json'),
    join(homedir(), '.config', 'dav', 'mcp.json'),
  ];

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const raw = readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw) as MCPConfig;
      return expandEnvVars(parsed);
    } catch (err) {
      process.stderr.write(`[dav] Warning: could not parse MCP config at ${p}: ${err}\n`);
    }
  }

  return { mcpServers: {} };
}

/**
 * Expand `${VAR}` and `${VAR:-default}` patterns in string values
 * within the MCP config, matching the Claude Code convention.
 */
function expandEnvVars(config: MCPConfig): MCPConfig {
  const expand = (s: string): string =>
    s.replace(/\$\{(\w+)(?::-(.*?))?\}/g, (_, name, fallback) =>
      process.env[name] ?? fallback ?? '',
    );

  const servers: MCPConfig['mcpServers'] = {};
  for (const [name, cfg] of Object.entries(config.mcpServers)) {
    servers[name] = {
      ...cfg,
      command: cfg.command ? expand(cfg.command) : undefined,
      args: cfg.args?.map(expand),
      url: cfg.url ? expand(cfg.url) : undefined,
      env: cfg.env
        ? Object.fromEntries(
            Object.entries(cfg.env).map(([k, v]) => [k, expand(v)]),
          )
        : undefined,
      headers: cfg.headers
        ? Object.fromEntries(
            Object.entries(cfg.headers).map(([k, v]) => [k, expand(v)]),
          )
        : undefined,
    };
  }

  return { mcpServers: servers };
}
