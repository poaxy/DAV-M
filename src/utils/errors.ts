export class DavError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DavError';
  }
}

export class ConfigError extends DavError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class APIError extends DavError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
    code = 'API_ERROR',
  ) {
    super(message, code);
    this.name = 'APIError';
  }
}

export class NetworkError extends APIError {
  constructor(provider: string, cause?: string) {
    super(cause ?? 'Network connection failed', provider, undefined, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends APIError {
  constructor(provider: string) {
    super('Rate limit exceeded', provider, 429, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export class AuthError extends APIError {
  constructor(provider: string) {
    super(
      `Authentication failed — check your ${provider} API key (run: dav --setup)`,
      provider,
      401,
      'AUTH_ERROR',
    );
    this.name = 'AuthError';
  }
}

export class ServerError extends APIError {
  constructor(provider: string, status: number) {
    super(`${provider} server error (${status})`, provider, status, 'SERVER_ERROR');
    this.name = 'ServerError';
  }
}

export class PolicyError extends DavError {
  constructor(message: string) {
    super(message, 'POLICY_DENY');
    this.name = 'PolicyError';
  }
}

/**
 * Classify a raw error from an AI provider SDK into a typed DavError.
 * Returns the original error if it can't be classified.
 */
export function classifyProviderError(err: unknown, provider: string): DavError {
  const message = err instanceof Error ? err.message : String(err);
  const lowerMsg = message.toLowerCase();

  // Auth errors
  if (
    lowerMsg.includes('invalid api key') ||
    lowerMsg.includes('authentication') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('api key') ||
    (err instanceof Error && 'status' in err && (err as { status: number }).status === 401)
  ) {
    return new AuthError(provider);
  }

  // Rate limit
  if (
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('too many requests') ||
    (err instanceof Error && 'status' in err && (err as { status: number }).status === 429)
  ) {
    return new RateLimitError(provider);
  }

  // Network errors
  if (
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('econnreset') ||
    lowerMsg.includes('etimedout') ||
    lowerMsg.includes('network') ||
    lowerMsg.includes('socket')
  ) {
    return new NetworkError(provider, message);
  }

  // Server errors (5xx)
  const statusMatch = message.match(/\b(5\d{2})\b/);
  if (statusMatch) {
    return new ServerError(provider, parseInt(statusMatch[1], 10));
  }
  if (err instanceof Error && 'status' in err) {
    const status = (err as { status: number }).status;
    if (status >= 500) return new ServerError(provider, status);
  }

  return new APIError(message, provider);
}

/** Returns true if this error type should trigger provider failover. */
export function isFailoverError(err: unknown): boolean {
  return (
    err instanceof NetworkError ||
    err instanceof RateLimitError ||
    err instanceof AuthError ||
    err instanceof ServerError
  );
}
