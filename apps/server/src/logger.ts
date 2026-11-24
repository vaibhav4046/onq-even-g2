const SECRET_PREFIX_RE = /\b(sk-[A-Za-z0-9_-]{8,}|gsk_[A-Za-z0-9_-]{8,}|ntn_[A-Za-z0-9_-]{8,}|secret_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{12,}|ya29\.[A-Za-z0-9._-]{10,}|GOCSPX-[A-Za-z0-9_-]{8,})/g;
const BEARER_RE = /(Bearer\s+)[A-Za-z0-9._-]{8,}/gi;

const registeredSecrets = new Set<string>();

export function registerSecretForRedaction(secret: string | undefined): void {
  if (secret && secret.length >= 8) {
    registeredSecrets.add(secret);
  }
}

export function redactSecrets(input: string): string {
  let out = input.replace(SECRET_PREFIX_RE, '[REDACTED]').replace(BEARER_RE, '$1[REDACTED]');
  for (const sec of registeredSecrets) {
    if (out.includes(sec)) {
      out = out.split(sec).join('[REDACTED]');
    }
  }
  return out;
}

export function logInfo(scope: string, message: string): void {
  console.log(`[oncue:${scope}] ${redactSecrets(message)}`);
}

export function logError(scope: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[oncue:${scope}:error] ${redactSecrets(msg)}`);
}
