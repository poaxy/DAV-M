import type { CoreMessage } from '../ai/backend.js';

/** A persisted conversation session. */
export interface Session {
  /** Unique session identifier (user-supplied or auto-generated). */
  id: string;
  /** ISO timestamp of session creation. */
  createdAt: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
  /** Provider active when the session was created. */
  provider: string;
  /** Model override, if any. */
  model?: string;
  /** Full message history — sent verbatim to the AI on resume. */
  messages: CoreMessage[];
  /** Cumulative token count across all turns. */
  totalTokens: number;
}
