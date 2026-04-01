import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { structuredPatch } from 'diff';
import type { StructuredPatch } from 'diff';
import type { ToolResult } from '../types.js';

export interface WriteFileResult extends ToolResult {
  /** Whether this was a create (vs overwrite). */
  isNew: boolean;
  /** The structured diff if a file was overwritten, for display in the UI. */
  patch?: StructuredPatch;
}

/**
 * Compute the diff that a write would produce without touching the filesystem.
 * Returns null if the file does not exist (new file — no diff to show).
 */
export function previewWrite(path: string, content: string): StructuredPatch | null {
  const absPath = resolve(process.cwd(), path);
  if (!existsSync(absPath)) return null;
  try {
    const existing = readFileSync(absPath, 'utf8');
    return structuredPatch(path, path, existing, content, '', '', { context: 3 });
  } catch {
    return null;
  }
}

/**
 * Write content to a file, creating parent directories as needed.
 * Returns a diff if the file already existed.
 */
export function writeFile(path: string, content: string): WriteFileResult {
  const absPath = resolve(process.cwd(), path);
  const isNew = !existsSync(absPath);

  const patch = previewWrite(path, content) ?? undefined;

  try {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, 'utf8');

    const action = isNew ? 'Created' : 'Wrote';
    const lineCount = content.split('\n').length;
    return {
      success: true,
      isNew,
      patch,
      output: `${action} ${path} (${lineCount} lines)`,
    };
  } catch (err) {
    return {
      success: false,
      isNew,
      output: `Could not write file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
