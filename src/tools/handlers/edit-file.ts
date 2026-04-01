import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { structuredPatch } from 'diff';
import type { StructuredPatch } from 'diff';
import type { ToolResult } from '../types.js';

export interface EditFileResult extends ToolResult {
  /** The structured diff for display in the UI. */
  patch?: StructuredPatch;
}

export interface PreviewEditResult {
  ok: boolean;
  /** Set when ok is false. */
  error?: string;
  /** Set when ok is true. */
  patch?: StructuredPatch;
  /** New content, ready to write. Set when ok is true. */
  newContent?: string;
}

/**
 * Validate an edit and compute its diff without writing to disk.
 *
 * Checks that `oldString` appears exactly once; if so, returns the diff
 * and the new content ready to apply.
 */
export function previewEdit(path: string, oldString: string, newString: string): PreviewEditResult {
  const absPath = resolve(process.cwd(), path);

  if (!existsSync(absPath)) {
    return { ok: false, error: `File not found: ${path}` };
  }

  let content: string;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch (err) {
    return { ok: false, error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const occurrences = countOccurrences(content, oldString);
  if (occurrences === 0) {
    return {
      ok: false,
      error: `String not found in ${path}. The file may have changed since it was read.`,
    };
  }
  if (occurrences > 1) {
    return {
      ok: false,
      error: `Found ${occurrences} occurrences of the search string in ${path}. Provide more context to make it unique.`,
    };
  }

  const newContent = content.replace(oldString, newString);
  const patch = structuredPatch(path, path, content, newContent, '', '', { context: 3 });

  return { ok: true, patch, newContent };
}

/**
 * Apply a str_replace edit to a file.
 *
 * Finds `oldString` (must appear exactly once) and replaces it with `newString`.
 * Always read the file first to get the exact string to replace.
 */
export function editFile(path: string, oldString: string, newString: string): EditFileResult {
  const preview = previewEdit(path, oldString, newString);

  if (!preview.ok) {
    return { success: false, output: preview.error! };
  }

  try {
    writeFileSync(resolve(process.cwd(), path), preview.newContent!, 'utf8');
    return { success: true, patch: preview.patch, output: `Edited ${path}` };
  } catch (err) {
    return {
      success: false,
      output: `Could not write file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}
