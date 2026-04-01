import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { config as loadDotenv } from 'dotenv';
import { intro, outro, select, text, password, confirm, spinner, isCancel, cancel, note } from '@clack/prompts';
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

/** Validate an API key against the provider's API. Returns error string or null if valid. */
async function validateKey(provider: Provider, key: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let url: string;

    if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/models';
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
    } else if (provider === 'openai') {
      url = 'https://api.openai.com/v1/models';
      headers['Authorization'] = `Bearer ${key}`;
    } else {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    }

    const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) return 'Invalid API key — authentication failed.';
    if (!res.ok) return `Unexpected response (${res.status}) — key may still work, continuing.`;
    return null;
  } catch {
    return null; // network error — don't block setup
  }
}

/** Interactive first-time setup wizard (writes to ~/.dav/.env). */
export async function runSetupWizard(): Promise<void> {
  const envVarMap: Record<Provider, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };
  const keyUrlMap: Record<Provider, string> = {
    anthropic: 'https://console.anthropic.com/',
    openai: 'https://platform.openai.com/api-keys',
    google: 'https://aistudio.google.com/app/apikey',
  };

  intro('DAV-M Setup');

  // ── 1. Provider ────────────────────────────────────────────────────────────
  const providerResult = await select<Provider>({
    message: 'Choose your AI provider',
    options: [
      { value: 'anthropic', label: 'Anthropic', hint: `claude-sonnet-4-6  (recommended)` },
      { value: 'openai',    label: 'OpenAI',    hint: 'gpt-4o' },
      { value: 'google',    label: 'Google',    hint: 'gemini-2.5-flash' },
    ],
  });
  if (isCancel(providerResult)) { cancel('Setup cancelled.'); return; }
  const provider = providerResult as Provider;
  const defaultModel = DEFAULT_MODELS[provider];
  const envVar = envVarMap[provider];

  note(`Get your key at: ${keyUrlMap[provider]}`, 'API Key');

  // ── 2. API key ─────────────────────────────────────────────────────────────
  const apiKeyResult = await password({
    message: envVar,
    mask: '▪',
    validate: (v) => !v || v.trim().length < 10 ? 'Key looks too short — paste the full key.' : undefined,
  });
  if (isCancel(apiKeyResult)) { cancel('Setup cancelled.'); return; }
  const apiKey = (apiKeyResult as string).trim();

  // ── Validate key ───────────────────────────────────────────────────────────
  const s = spinner();
  s.start('Validating API key...');
  const keyError = await validateKey(provider, apiKey);
  if (keyError) {
    s.stop(`⚠ ${keyError}`);
  } else {
    s.stop('API key is valid');
  }

  // ── 3. Model override ──────────────────────────────────────────────────────
  const modelResult = await text({
    message: 'Default model',
    placeholder: defaultModel,
    defaultValue: '',
    validate: () => undefined,
  });
  if (isCancel(modelResult)) { cancel('Setup cancelled.'); return; }
  const modelInput = (modelResult as string).trim();

  // ── 4. Execute mode ────────────────────────────────────────────────────────
  const execResult = await confirm({
    message: 'Enable execute mode? (lets dav run shell commands, always with your confirmation)',
    initialValue: false,
  });
  if (isCancel(execResult)) { cancel('Setup cancelled.'); return; }
  const allowExecute = execResult as boolean;

  // ── 5. Auto-confirm ────────────────────────────────────────────────────────
  let autoConfirm = false;
  if (allowExecute) {
    const autoResult = await confirm({
      message: 'Enable auto-confirm? (skips confirmation prompts — not recommended)',
      initialValue: false,
    });
    if (isCancel(autoResult)) { cancel('Setup cancelled.'); return; }
    autoConfirm = autoResult as boolean;
  }

  // ── Write ~/.dav/.env ──────────────────────────────────────────────────────
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

  const keysToStrip = [envVar, 'DAV_PROVIDER', 'DAV_MODEL', 'DAV_ALLOW_EXECUTE', 'DAV_AUTO_CONFIRM'];
  let existing = '';
  if (existsSync(CONFIG_ENV)) {
    existing = readFileSync(CONFIG_ENV, 'utf8')
      .split('\n')
      .filter((l) => !keysToStrip.some((k) => l.startsWith(`${k}=`)))
      .join('\n')
      .trim();
  }

  const lines = [
    existing,
    `DAV_PROVIDER=${provider}`,
    `${envVar}=${apiKey}`,
    modelInput ? `DAV_MODEL=${modelInput}` : '',
    allowExecute ? 'DAV_ALLOW_EXECUTE=1' : '',
    autoConfirm  ? 'DAV_AUTO_CONFIRM=1'  : '',
    '',
  ].filter((l, i) => i === 0 || l !== '');

  writeFileSync(CONFIG_ENV, lines.join('\n'), { mode: 0o600 });

  // ── Done ───────────────────────────────────────────────────────────────────
  note(
    [
      `Provider:      ${provider}`,
      `Model:         ${modelInput || defaultModel}`,
      `Execute mode:  ${allowExecute ? 'enabled' : 'disabled'}`,
      allowExecute ? `Auto-confirm:  ${autoConfirm ? 'enabled' : 'disabled'}` : '',
      '',
      `Config saved to ${CONFIG_ENV}`,
    ].filter(Boolean).join('\n'),
    'Configuration'
  );

  outro('Run dav to get started.');
}

/** Remove all DAV-M local data and print the npm uninstall command. */
export async function runUninstall(): Promise<void> {
  intro('Uninstall DAV-M');

  note(`This will permanently delete:\n  ${CONFIG_DIR}\n  (config, sessions, audit logs)`, 'Warning');

  const confirmed = await confirm({ message: 'Are you sure?', initialValue: false });
  if (isCancel(confirmed) || !confirmed) { cancel('Cancelled.'); return; }

  if (existsSync(CONFIG_DIR)) {
    rmSync(CONFIG_DIR, { recursive: true, force: true });
  }

  outro(`Done. To remove the dav command, run:\n\n  npm uninstall -g dav-ai`);
}
