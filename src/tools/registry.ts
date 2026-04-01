import { tool } from 'ai';
import { z } from 'zod';
import { evaluate, denialMessage } from '../policy/engine.js';
import { assessCommand } from '../utils/dangerous.js';
import { execShell } from './handlers/exec-shell.js';
import { readFile } from './handlers/read-file.js';
import { writeFile, previewWrite } from './handlers/write-file.js';
import { editFile, previewEdit } from './handlers/edit-file.js';
import { globSearch } from './handlers/glob-search.js';
import { grepSearch } from './handlers/grep-search.js';
import type { ConfirmFn } from './types.js';
import type { PolicyContext } from '../policy/types.js';

/**
 * Build the tool set for the agent.
 *
 * Tools are built as closures over `confirmFn` and `policyCtx` so each
 * agent invocation has its own policy/confirmation context.
 *
 * Schemas are intentionally Gemini-compatible:
 *   - No z.optional(), z.nullable(), z.union(), z.record() at the top level
 *   - All fields required; defaults are documented in descriptions
 */
export function buildTools(confirmFn: ConfirmFn, policyCtx: PolicyContext) {
  return {
    exec_shell: tool({
      description:
        'Run a shell command and return its output. ' +
        'Always explain what the command does before calling this tool.',
      inputSchema: z.object({
        command: z.string().describe('The exact shell command to execute'),
        description: z
          .string()
          .describe('One-sentence explanation of what this command does and why'),
      }),
      execute: async ({ command, description }) => {
        const decision = evaluate('exec_shell', command, policyCtx);

        if (decision.decision === 'DENY') {
          return { error: denialMessage(decision) };
        }

        if (decision.decision === 'ASK') {
          const assessment = assessCommand(command);
          const confirmed = await confirmFn({
            toolName: 'exec_shell',
            description: `${description}\n$ ${command}`,
            isDangerous: assessment.isDangerous,
          });
          if (!confirmed) {
            return { error: 'User declined to run this command.' };
          }
        }

        const result = await execShell(command);
        return {
          stdout: result.output,
          exit_code: result.exitCode ?? 0,
          success: result.success,
        };
      },
    }),

    read_file: tool({
      description:
        'Read a file and return its contents with line numbers. ' +
        'Use start_line and end_line to read a specific range (both default to 0 which means read the whole file).',
      inputSchema: z.object({
        path: z.string().describe('File path, relative to current directory or absolute'),
        start_line: z
          .number()
          .int()
          .describe('First line to read, 1-indexed. Use 0 to read from the beginning.'),
        end_line: z
          .number()
          .int()
          .describe('Last line to read, inclusive. Use 0 to read to end of file.'),
      }),
      execute: async ({ path, start_line, end_line }) => {
        const result = readFile(path, start_line, end_line);
        return result.success ? { content: result.output } : { error: result.output };
      },
    }),

    write_file: tool({
      description:
        'Write content to a file. Creates the file (and any parent directories) if it does not exist. ' +
        'Overwrites existing files. Always read the file first if you are unsure of its contents.',
      inputSchema: z.object({
        path: z.string().describe('File path to write to'),
        content: z.string().describe('Full content to write to the file'),
      }),
      execute: async ({ path, content }) => {
        const decision = evaluate('write_fs', path, policyCtx);

        if (decision.decision === 'DENY') {
          return { error: denialMessage(decision) };
        }

        if (decision.decision === 'ASK') {
          // Compute diff before asking — shows what will change
          const patch = previewWrite(path, content) ?? undefined;
          const confirmed = await confirmFn({
            toolName: 'write_file',
            description: `Write to: ${path}`,
            isDangerous: false,
            patch,
          });
          if (!confirmed) {
            return { error: 'User declined to write this file.' };
          }
        }

        const result = writeFile(path, content);
        return result.success ? { message: result.output } : { error: result.output };
      },
    }),

    edit_file: tool({
      description:
        'Apply a targeted str_replace edit to a file. ' +
        'Finds old_string (must appear exactly once) and replaces it with new_string. ' +
        'Always read the file first to get the exact string to replace.',
      inputSchema: z.object({
        path: z.string().describe('File path to edit'),
        old_string: z
          .string()
          .describe(
            'Exact string to find and replace. Must appear exactly once in the file. ' +
            'Include enough surrounding context (multiple lines) to be unique.',
          ),
        new_string: z.string().describe('String to replace old_string with'),
      }),
      execute: async ({ path, old_string, new_string }) => {
        const decision = evaluate('write_fs', path, policyCtx);

        if (decision.decision === 'DENY') {
          return { error: denialMessage(decision) };
        }

        if (decision.decision === 'ASK') {
          // Validate and compute diff before asking — user sees exactly what changes
          const preview = previewEdit(path, old_string, new_string);
          if (!preview.ok) {
            return { error: preview.error };
          }

          const confirmed = await confirmFn({
            toolName: 'edit_file',
            description: `Edit: ${path}`,
            isDangerous: false,
            patch: preview.patch,
          });
          if (!confirmed) {
            return { error: 'User declined to edit this file.' };
          }

          // Write the already-validated content (avoids re-reading the file)
          const { writeFileSync } = await import('fs');
          const { resolve } = await import('path');
          try {
            writeFileSync(resolve(process.cwd(), path), preview.newContent!, 'utf8');
            return { message: `Edited ${path}` };
          } catch (err) {
            return { error: `Could not write file: ${err instanceof Error ? err.message : String(err)}` };
          }
        }

        const result = editFile(path, old_string, new_string);
        return result.success ? { message: result.output } : { error: result.output };
      },
    }),

    glob_search: tool({
      description:
        'Find files matching a glob pattern. Respects .gitignore. ' +
        'Supports * (any chars except /), ** (any path), ? (single char). ' +
        'Example patterns: "**/*.ts", "src/**/*.test.*", "*.json".',
      inputSchema: z.object({
        pattern: z
          .string()
          .describe('Glob pattern to match against file paths relative to search_path'),
        search_path: z
          .string()
          .describe('Directory to search in. Use "." for the current directory.'),
      }),
      execute: async ({ pattern, search_path }) => {
        const result = await globSearch(pattern, search_path);
        return result.success ? { matches: result.output } : { error: result.output };
      },
    }),

    grep_search: tool({
      description:
        'Search file contents for a regex pattern. Returns matching lines with file path and line number. ' +
        'Case-insensitive by default.',
      inputSchema: z.object({
        pattern: z.string().describe('Regex or literal string to search for'),
        search_path: z
          .string()
          .describe('Directory to search in. Use "." for the current directory.'),
        file_pattern: z
          .string()
          .describe('File name pattern to filter which files are searched. Use "*" to search all files.'),
      }),
      execute: async ({ pattern, search_path, file_pattern }) => {
        const result = grepSearch(pattern, search_path, file_pattern);
        return result.success ? { matches: result.output } : { error: result.output };
      },
    }),
  } as const;
}

export type DavTools = ReturnType<typeof buildTools>;
