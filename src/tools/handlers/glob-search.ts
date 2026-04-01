import { resolve, relative } from 'path';
import { globby } from 'globby';
import type { ToolResult } from '../types.js';

const MAX_RESULTS = 200;

/**
 * Glob-style file search backed by `globby` (fast-glob + ignore).
 *
 * Automatically respects all `.gitignore` files in the tree.
 * Supports standard glob syntax: `*`, `**`, `?`, `{a,b}`, `[...]`.
 */
export async function globSearch(pattern: string, searchPath: string): Promise<ToolResult> {
  const root = resolve(process.cwd(), searchPath || '.');

  try {
    const matches = await globby(pattern, {
      cwd: root,
      gitignore: true,         // Respects all .gitignore files
      dot: false,              // Skip hidden files unless explicitly matched
      absolute: false,         // Return paths relative to root
      onlyFiles: false,        // Include both files and directories
      followSymbolicLinks: false,
      ignore: [
        'node_modules/**',
        '.git/**',
      ],
    });

    if (matches.length === 0) {
      return { success: true, output: `No files matched pattern: ${pattern}` };
    }

    const limited = matches.slice(0, MAX_RESULTS);
    const truncated = matches.length > MAX_RESULTS;

    // Relativise to CWD so the AI sees consistent paths
    const lines = limited.map((p) => relative(process.cwd(), resolve(root, p)));

    return {
      success: true,
      output:
        lines.join('\n') +
        (truncated ? `\n\n... (${matches.length - MAX_RESULTS} more results omitted)` : ''),
    };
  } catch (err) {
    return {
      success: false,
      output: `Search error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
