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

  // Hide typed input for secret fields
  const { default: tty } = await import('tty');
  const hiddenAsk = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      if (process.stdout.isTTY) process.stdout.write(prompt);
      let value = '';
      const stdin = process.stdin as NodeJS.ReadStream;
      const wasPaused = stdin.isPaused();
      if (wasPaused) stdin.resume();
      stdin.setRawMode?.(true);
      stdin.setEncoding('utf8');
      const onData = (ch: string) => {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          process.stdout.write('\n');
          stdin.removeListener('data', onData);
          resolve(value);
        } else if (ch === '\u0003') {
          process.exit(130); // Ctrl-C
        } else if (ch === '\u007f') {
          if (value.length > 0) value = value.slice(0, -1);
        } else {
          value += ch;
        }
      };
      stdin.on('data', onData);
    });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, fallback = ''): Promise<string> =>
    new Promise((res) => rl.question(q, (a) => res(a.trim() || fallback)));

  const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;

  process.stdout.write('\n' + bold('  DAV-M Setup') + '\n');
  process.stdout.write(dim('  ─────────────────────────────────────────\n'));
  process.stdout.write(dim('  Configuration is saved to ~/.dav/.env\n\n'));

  // ── 1. Provider ────────────────────────────────────────────────────────────
  process.stdout.write('  ' + bold('Step 1: Choose your AI provider') + '\n\n');
  process.stdout.write(`    ${bold('1)')} Anthropic  ${dim('claude-sonnet-4-6  (recommended)')}\n`);
  process.stdout.write(`    ${bold('2)')} OpenAI     ${dim('gpt-4o')}\n`);
  process.stdout.write(`    ${bold('3)')} Google     ${dim('gemini-2.5-flash')}\n\n`);

  const providerChoice = await ask(`  Choice ${dim('[1]')}: `, '1');
  const providerMap: Record<string, Provider> = { '1': 'anthropic', '2': 'openai', '3': 'google' };
  const provider: Provider = providerMap[providerChoice] ?? 'anthropic';
  const defaultModel = DEFAULT_MODELS[provider];

  process.stdout.write('\n');

  // ── 2. API key ─────────────────────────────────────────────────────────────
  const envVarMap: Record<Provider, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };
  const keyUrlMap: Record<Provider, string> = {
    anthropic: 'https://console.anthropic.com/',
    openai: 'https://platform.openai.com/api-keys',
    google: 'https://ai.google.dev/',
  };

  const envVar = envVarMap[provider];
  process.stdout.write('  ' + bold('Step 2: API Key') + '\n');
  process.stdout.write(`  ${dim('Get yours at: ' + keyUrlMap[provider])}\n\n`);

  rl.close(); // close before raw mode
  const apiKey = await hiddenAsk(`  ${cyan(envVar)}: `);

  if (!apiKey.trim()) {
    process.stdout.write('\n  Cancelled — no API key provided.\n\n');
    return;
  }

  // ── 3. Model override ──────────────────────────────────────────────────────
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask2 = (q: string, fallback = ''): Promise<string> =>
    new Promise((res) => rl2.question(q, (a) => res(a.trim() || fallback)));

  process.stdout.write('\n  ' + bold('Step 3: Default model') + '\n');
  process.stdout.write(`  ${dim('Press Enter to use the default.')}\n\n`);

  const modelInput = await ask2(`  Model ${dim(`[${defaultModel}]`)}: `, '');
  const modelLine = modelInput ? `DAV_MODEL=${modelInput}` : '';

  // ── 4. Execute mode ────────────────────────────────────────────────────────
  process.stdout.write('\n  ' + bold('Step 4: Execution mode') + '\n');
  process.stdout.write(`  ${dim('When enabled, dav can run shell commands (always with your confirmation).')}\n\n`);

  const execChoice = await ask2(`  Enable execute mode? ${dim('[y/N]')}: `, 'n');
  const allowExecute = execChoice.toLowerCase() === 'y';

  // ── 5. Auto-confirm ────────────────────────────────────────────────────────
  let autoConfirm = false;
  if (allowExecute) {
    process.stdout.write('\n  ' + bold('Step 5: Auto-confirm') + '\n');
    process.stdout.write(`  ${dim('Skip confirmation prompts for every tool call (not recommended).')}\n\n`);
    const autoChoice = await ask2(`  Enable auto-confirm? ${dim('[y/N]')}: `, 'n');
    autoConfirm = autoChoice.toLowerCase() === 'y';
  }

  rl2.close();

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
    `${envVar}=${apiKey.trim()}`,
    modelLine,
    allowExecute ? 'DAV_ALLOW_EXECUTE=1' : '',
    autoConfirm  ? 'DAV_AUTO_CONFIRM=1'  : '',
    '',
  ].filter((l, i) => i === 0 || l !== '');

  writeFileSync(CONFIG_ENV, lines.join('\n'), { mode: 0o600 });

  // ── Done ───────────────────────────────────────────────────────────────────
  process.stdout.write('\n' + dim('  ─────────────────────────────────────────\n'));
  process.stdout.write('  ' + green('✓') + ' ' + bold(`Saved to ${CONFIG_ENV}`) + '\n\n');
  process.stdout.write(`  ${bold('Provider:')}      ${provider}\n`);
  process.stdout.write(`  ${bold('Model:')}         ${modelInput || defaultModel}\n`);
  process.stdout.write(`  ${bold('Execute mode:')}  ${allowExecute ? 'enabled' : 'disabled'}\n`);
  if (allowExecute) {
    process.stdout.write(`  ${bold('Auto-confirm:')} ${autoConfirm ? 'enabled' : 'disabled'}\n`);
  }
  process.stdout.write('\n  Run ' + bold('dav') + ' to get started.\n\n');
}
