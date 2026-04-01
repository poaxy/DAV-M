import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, relative } from 'path';
import type { ToolResult } from '../types.js';

const MAX_FILE_BYTES = 500_000; // 500 KB
const MAX_LINES_DEFAULT = 2000;

/**
 * Read a file, optionally slicing to a line range.
 *
 * @param path   File path (relative to CWD or absolute)
 * @param startLine  1-indexed first line to read (0 = from beginning)
 * @param endLine    Inclusive last line to read (0 = read to end)
 */
export function readFile(path: string, startLine: number, endLine: number): ToolResult {
  const absPath = resolve(process.cwd(), path);

  if (!existsSync(absPath)) {
    return { success: false, output: `File not found: ${path}` };
  }

  const stat = statSync(absPath);
  if (stat.isDirectory()) {
    return { success: false, output: `Path is a directory, not a file: ${path}` };
  }
  if (stat.size > MAX_FILE_BYTES) {
    return {
      success: false,
      output: `File too large to read (${Math.round(stat.size / 1024)} KB). Use start_line/end_line to read a specific range.`,
    };
  }

  try {
    const content = readFileSync(absPath, 'utf8');
    const lines = content.split('\n');

    // Resolve line range (convert from 1-indexed to 0-indexed)
    const start = startLine > 0 ? startLine - 1 : 0;
    const end = endLine > 0 ? endLine : lines.length;

    const slice = lines.slice(start, end);
    const lineCount = slice.length;
    const totalLines = lines.length;

    // Add line numbers to output
    const numbered = slice
      .map((line, i) => `${String(start + i + 1).padStart(4, ' ')} │ ${line}`)
      .join('\n');

    const header =
      startLine > 0 || endLine > 0
        ? `${path} (lines ${start + 1}–${Math.min(end, totalLines)} of ${totalLines})\n`
        : `${path} (${totalLines} lines)\n`;

    return { success: true, output: header + numbered };
  } catch (err) {
    return {
      success: false,
      output: `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
