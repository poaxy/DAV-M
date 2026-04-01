import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Session } from './types.js';
import type { CoreMessage } from '../ai/backend.js';
import type { DavConfig } from '../config/types.js';

/** Load a session from disk. Returns null if it does not exist or is corrupt. */
export function loadSession(id: string, sessionDir: string): Session | null {
  const filePath = join(sessionDir, `${id}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** Persist a session to disk atomically (write-then-rename is overkill for CLI; direct write is fine). */
export function saveSession(session: Session, sessionDir: string): void {
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });
  const filePath = join(sessionDir, `${session.id}.json`);
  writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
}

/** Create a fresh session object (not yet written to disk). */
export function newSession(id: string, config: DavConfig): Session {
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provider: config.provider,
    model: config.model,
    messages: [],
    totalTokens: 0,
  };
}

/** Return an updated session with new messages appended. Does not save to disk. */
export function appendMessages(
  session: Session,
  messages: CoreMessage[],
  tokensDelta: number,
): Session {
  return {
    ...session,
    messages: [...session.messages, ...messages],
    totalTokens: session.totalTokens + tokensDelta,
    updatedAt: new Date().toISOString(),
  };
}
