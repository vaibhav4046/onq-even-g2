import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  method: 'S256';
}

export function createPkcePair(): PkcePair {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
  return { codeVerifier, codeChallenge, method: 'S256' };
}

export interface PendingOAuthState {
  provider: 'google' | 'notion' | 'openrouter';
  codeVerifier?: string;
  scopeMode?: 'identity' | 'workspace';
  redirectTo: string;
  expiresAtMs: number;
}

/**
 * Single-use CSRF OAuth state store with strict 10-minute TTL.
 * Prevents CSRF, replay, and swapped authorization-code injection.
 */
export class OAuthStateStore {
  private readonly entries = new Map<string, PendingOAuthState>();

  constructor(private readonly nowFn: () => number = () => Date.now()) {}

  issue(params: {
    provider: 'google' | 'notion' | 'openrouter';
    codeVerifier?: string;
    scopeMode?: 'identity' | 'workspace';
    redirectTo?: string;
    ttlMs?: number;
  }): string {
    const state = crypto.randomBytes(24).toString('base64url');
    this.entries.set(state, {
      provider: params.provider,
      codeVerifier: params.codeVerifier,
      scopeMode: params.scopeMode,
      redirectTo: params.redirectTo ?? 'http://127.0.0.1:5173/?signedIn=1#connectors',
      expiresAtMs: this.nowFn() + (params.ttlMs ?? 10 * 60_000),
    });
    return state;
  }

  consume(
    state: string | null | undefined,
    expectedProvider?: 'google' | 'notion' | 'openrouter',
  ): PendingOAuthState | null {
    if (!state) return null;
    const entry = this.entries.get(state);
    this.entries.delete(state);
    if (!entry) return null;
    if (expectedProvider && entry.provider !== expectedProvider) return null;
    if (this.nowFn() > entry.expiresAtMs) return null;
    return entry;
  }

  consumeLatestByProvider(
    provider: 'google' | 'notion' | 'openrouter',
  ): PendingOAuthState | null {
    const now = this.nowFn();
    let matchedKey: string | null = null;
    let matchedEntry: PendingOAuthState | null = null;
    for (const [key, entry] of this.entries.entries()) {
      if (entry.provider === provider && now <= entry.expiresAtMs) {
        matchedKey = key;
        matchedEntry = entry;
      }
    }
    if (matchedKey) this.entries.delete(matchedKey);
    return matchedEntry;
  }
}

export const SESSION_COOKIE_NAME = 'onq_session';

/**
 * HMAC-SHA256 signed HttpOnly cookie serializer & verifier.
 */
export class SignedSessionCookie {
  private readonly secret: Buffer;

  constructor(dataDir: string, explicitSecret?: string) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const raw = explicitSecret ?? process.env.ONQ_SESSION_SECRET;
    if (raw && raw.length >= 16) {
      this.secret = crypto.createHash('sha256').update(raw, 'utf8').digest();
    } else {
      const keyFile = path.join(dataDir, 'session.key');
      if (fs.existsSync(keyFile)) {
        this.secret = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
      } else {
        this.secret = crypto.randomBytes(32);
        fs.writeFileSync(keyFile, this.secret.toString('hex'), { mode: 0o600 });
      }
    }
  }

  signValue(sessionToken: string): string {
    const sig = crypto.createHmac('sha256', this.secret).update(sessionToken, 'utf8').digest('base64url');
    return `${sessionToken}.${sig}`;
  }

  verifyValue(cookieValue: string | null | undefined): string | null {
    if (!cookieValue) return null;
    const dot = cookieValue.lastIndexOf('.');
    if (dot <= 0) return null;
    const token = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);
    const expected = crypto.createHmac('sha256', this.secret).update(token, 'utf8').digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return null;
    return crypto.timingSafeEqual(a, b) ? token : null;
  }

  extractSessionToken(cookieHeader: string | undefined): string | null {
    const raw = parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME);
    return this.verifyValue(raw);
  }

  buildSetCookieHeader(sessionToken: string, opts?: { maxAgeSec?: number; secure?: boolean }): string {
    const signed = this.signValue(sessionToken);
    const maxAge = opts?.maxAgeSec ?? 7 * 24 * 3600;
    const parts = [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAge}`,
    ];
    if (opts?.secure) parts.push('Secure');
    return parts.join('; ');
  }

  buildClearCookieHeader(): string {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
}

export function parseCookieHeader(cookieHeader: string | undefined, name = SESSION_COOKIE_NAME): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    const v = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}
