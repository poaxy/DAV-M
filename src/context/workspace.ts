import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, relative } from 'path';

export interface WorkspaceContext {
  cwd: string;
  /** Up to 30 entries in the current directory (files + dirs). */
  listing: string[];
  /** Git branch name, or null if not in a git repo. */
  gitBranch: string | null;
  /** Short git status (M, ?, etc.), or null if not in a git repo. */
  gitStatus: string | null;
  /** Git root path, or null if not in a git repo. */
  gitRoot: string | null;
}

/** Gather context about the current working directory. */
export function getWorkspaceContext(): WorkspaceContext {
  const cwd = process.cwd();
  const listing = getDirectoryListing(cwd, 30);
  const { branch, status, root } = getGitInfo(cwd);

  return {
    cwd,
    listing,
    gitBranch: branch,
    gitStatus: status,
    gitRoot: root,
  };
}

function getDirectoryListing(dir: string, limit: number): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries
      .slice(0, limit)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort((a, b) => {
        // Directories first
        const aIsDir = a.endsWith('/');
        const bIsDir = b.endsWith('/');
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.localeCompare(b);
      });
  } catch {
    return [];
  }
}

function getGitInfo(cwd: string): { branch: string | null; status: string | null; root: string | null } {
  try {
    const root = execSync('git rev-parse --show-toplevel 2>/dev/null', {
      cwd,
      encoding: 'utf8',
      timeout: 2000,
    }).trim();

    const branch = execSync('git branch --show-current 2>/dev/null', {
      cwd,
      encoding: 'utf8',
      timeout: 2000,
    }).trim() || null;

    const statusRaw = execSync('git status --short 2>/dev/null', {
      cwd,
      encoding: 'utf8',
      timeout: 2000,
    }).trim();

    // Summarize: "3 modified, 1 untracked" rather than the full list
    const status = summarizeGitStatus(statusRaw);

    return { branch, status, root };
  } catch {
    return { branch: null, status: null, root: null };
  }
}

function summarizeGitStatus(raw: string): string | null {
  if (!raw) return 'clean';
  const lines = raw.split('\n').filter(Boolean);
  if (lines.length === 0) return 'clean';

  const counts: Record<string, number> = {};
  for (const line of lines) {
    const code = line.slice(0, 2).trim();
    const label =
      code === 'M' ? 'modified' :
      code === 'A' ? 'added' :
      code === 'D' ? 'deleted' :
      code === '??' ? 'untracked' :
      code === 'R' ? 'renamed' :
      'changed';
    counts[label] = (counts[label] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([label, n]) => `${n} ${label}`)
    .join(', ');
}

/** Format workspace context as a human-readable string for the prompt. */
export function formatWorkspaceContext(ctx: WorkspaceContext): string {
  const lines: string[] = [];

  lines.push(`Directory: ${ctx.cwd}`);

  if (ctx.gitBranch) {
    const statusPart = ctx.gitStatus ? ` (${ctx.gitStatus})` : '';
    lines.push(`Git: branch "${ctx.gitBranch}"${statusPart}`);
  }

  if (ctx.listing.length > 0) {
    lines.push(`Contents: ${ctx.listing.slice(0, 20).join('  ')}`);
  }

  return lines.join('\n');
}
