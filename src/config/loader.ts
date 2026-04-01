import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { config as loadDotenv } from 'dotenv';
import { ConfigError } from '../utils/errors.js';
import type { DavConfig, Provider } from './types.js';
import { DEFAULT_MODELS } from './types.js';

const CONFIG_DIR = join(homedir(), '.dav');
const CONFIG_ENV = join(CONFIG_DIR, '.env');

/** Load config from environment, ~/.dav/.env, and local .env. */
export function loadConfig(): DavConfig {
  // Load ~/.dav/.env first, then local .env (local takes priority)
  if (existsSync(CONFIG_ENV)) {
    loadDotenv({ path: CONFIG_ENV, override: false });
  }
  loadDotenv({ override: false }); // local .env

  const provider = resolveProvider();

  const sessionDir = join(CONFIG_DIR, 'sessions');
  const auditLogDir = join(CONFIG_DIR, 'logs');

  return {
    provider,
    model: process.env.DAV_MODEL || undefined,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    allowExecute: process.env.DAV_ALLOW_EXECUTE === '1' || process.env.DAV_ALLOW_EXECUTE === 'true',
    autoConfirm: process.env.DAV_AUTO_CONFIRM === '1' || process.env.DAV_AUTO_CONFIRM === 'true',
    sessionDir,
    auditLogDir,
    configDir: CONFIG_DIR,
  };
}

/** Resolve which provider to use based on env vars and available API keys. */
function resolveProvider(): Provider {
  const explicit = process.env.DAV_PROVIDER || process.env.DAV_BACKEND;
  if (explicit) {
    const p = explicit.toLowerCase();
    if (p === 'anthropic' || p === 'openai' || p === 'google') return p;
    throw new ConfigError(`Unknown provider "${explicit}". Valid options: anthropic, openai, google`);
  }

  // Auto-detect from available keys
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'google';

  // No keys found at all
  throw new ConfigError(
    'No API key found. Run "dav --setup" to configure, or set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.',
  );
}

/** Override the provider (e.g. from --backend CLI flag). */
export function overrideProvider(config: DavConfig, provider: string): DavConfig {
  const p = provider.toLowerCase();
  if (p !== 'anthropic' && p !== 'openai' && p !== 'google') {
    throw new ConfigError(`Unknown provider "${provider}". Valid options: anthropic, openai, google`);
  }
  return { ...config, provider: p as Provider };
}

/** Override the model (e.g. from --model CLI flag). */
export function overrideModel(config: DavConfig, model: string): DavConfig {
  return { ...config, model };
}

/** Return the effective model for the current config. */
export function getEffectiveModel(config: DavConfig): string {
  return config.model ?? DEFAULT_MODELS[config.provider];
}

/** Validate that the active provider has an API key configured. */
export function validateApiKey(config: DavConfig): void {
  const keys: Record<Provider, string | undefined> = {
    anthropic: config.anthropicApiKey,
    openai: config.openaiApiKey,
    google: config.googleApiKey,
  };
  if (!keys[config.provider]) {
    const envVar: Record<Provider, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    };
    throw new ConfigError(
      `No API key for provider "${config.provider}". Set ${envVar[config.provider]} or run "dav --setup".`,
    );
  }
}

/** Ensure ~/.dav/ directories exist. */
export function ensureConfigDirs(config: DavConfig): void {
  for (const dir of [config.configDir, config.sessionDir, config.auditLogDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/** Interactive first-time setup wizard (writes to ~/.dav/.env). */
export async function runSetupWizard(): Promise<void> {
  const { default: readline } = await import('readline');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

  console.log('\n  DAV Setup\n  ─────────\n');
  console.log('  Configure your AI provider API key.\n');

  console.log('  Providers:');
  console.log('    1) Anthropic  (claude-sonnet-4-6)');
  console.log('    2) OpenAI     (gpt-4o)');
  console.log('    3) Google     (gemini-2.5-flash)\n');

  const choice = await ask('  Choose provider [1]: ');
  const providerMap: Record<string, string> = { '1': 'anthropic', '2': 'openai', '3': 'google' };
  const provider = providerMap[choice.trim() || '1'] ?? 'anthropic';

  const envVarMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  const envVar = envVarMap[provider];
  const apiKey = await ask(`  ${envVar}: `);

  if (!apiKey.trim()) {
    rl.close();
    console.log('\n  Cancelled — no API key provided.\n');
    return;
  }

  rl.close();

  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

  // Read existing .env if any
  let existing = '';
  if (existsSync(CONFIG_ENV)) {
    existing = readFileSync(CONFIG_ENV, 'utf8');
    // Remove old key lines
    existing = existing
      .split('\n')
      .filter((l) => !l.startsWith(`${envVar}=`) && !l.startsWith('DAV_PROVIDER='))
      .join('\n');
  }

  const newContent = [
    existing.trim(),
    `DAV_PROVIDER=${provider}`,
    `${envVar}=${apiKey.trim()}`,
    '',
  ]
    .filter((l, i) => i === 0 || l !== '')
    .join('\n');

  writeFileSync(CONFIG_ENV, newContent, { mode: 0o600 });

  console.log(`\n  Saved to ${CONFIG_ENV}\n`);
  console.log(`  You're all set! Try: dav "hello"\n`);
}
