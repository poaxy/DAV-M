import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import type { ToolResult } from '../types.js';

const MAX_MATCHES = 100;
const MAX_FILE_BYTES = 1_000_000; // 1 MB — skip binary/huge files

/**
 * Search file contents for a regex or literal pattern.
 * Returns matching lines in `path:line:content` format.
 */
export function grepSearch(
  pattern: string,
  searchPath: string,
  filePattern: string,
): ToolResult {
  const root = resolve(process.cwd(), searchPath || '.');

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch {
    return { success: false, output: `Invalid regex pattern: ${pattern}` };
  }

  const fileGlob = filePattern || '*';
  const matches: string[] = [];

  try {
    walkAndSearch(root, root, regex, fileGlob, matches);
  } catch (err) {
    return {
      success: false,
      output: `Search error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (matches.length === 0) {
    return { success: true, output: `No matches found for: ${pattern}` };
  }

  const truncated = matches.length > MAX_MATCHES;
  const display = matches.slice(0, MAX_MATCHES);

  return {
    success: true,
    output:
      display.join('\n') +
      (truncated ? `\n\n... (${matches.length - MAX_MATCHES} more matches omitted)` : ''),
  };
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'coverage', '.cache',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.bin', '.so', '.dylib', '.dll',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.mp3', '.wav', '.avi', '.mov',
  '.db', '.sqlite',
]);

function walkAndSearch(
  root: string,
  dir: string,
  regex: RegExp,
  filePattern: string,
  results: string[],
): void {
  if (results.length >= MAX_MATCHES * 2) return;

  let entries: { name: string; isDir: boolean }[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
    }));
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_MATCHES * 2) break;

    if (entry.isDir) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkAndSearch(root, join(dir, entry.name), regex, filePattern, results);
      continue;
    }

    // Check extension
    const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    // Check file name against filePattern (simple glob)
    if (!matchSimple(entry.name, filePattern)) continue;

    const fullPath = join(dir, entry.name);
    try {
      const stat = statSync(fullPath);
      if (stat.size > MAX_FILE_BYTES) continue;

      const content = readFileSync(fullPath, 'utf8');
      const relPath = relative(process.cwd(), fullPath);

      content.split('\n').forEach((line, i) => {
        if (results.length >= MAX_MATCHES * 2) return;
        if (regex.test(line)) {
          results.push(`${relPath}:${i + 1}: ${line.trim()}`);
        }
      });
    } catch {
      // Skip unreadable files
    }
  }
}

/** Very simple glob — only supports `*` as wildcard. */
function matchSimple(filename: string, pattern: string): boolean {
  if (pattern === '*') return true;
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    'i',
  );
  return regex.test(filename);
}
