export type Provider = 'anthropic' | 'openai' | 'google';

export interface DavConfig {
  /** Active AI provider. */
  provider: Provider;
  /** Model override — if not set, each provider uses its default. */
  model?: string;
  /** API keys, loaded from env. */
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  /** Whether `--execute` mode is enabled (allows tool-based shell execution). */
  allowExecute: boolean;
  /** Auto-confirm all execution prompts without asking. */
  autoConfirm: boolean;
  /** Directory for session JSON files. Default: ~/.dav/sessions */
  sessionDir: string;
  /** Directory for audit JSONL. Default: ~/.dav/logs */
  auditLogDir: string;
  /** Config base dir, typically ~/.dav */
  configDir: string;
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  google: 'gemini-2.5-flash',
};
