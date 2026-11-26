/**
 * Where the glasses app talks to, and how it proves who it is.
 * Default (simulator / same PC): loopback relay, no device token, exactly as before.
 * Paired build: `?host=<url>&device=<token>` once (then remembered), requests carry `x-onq-device`.
 */

export const DEVICE_TOKEN_PREFIX = 'odv_';
export const STORAGE_HOST_KEY = 'onq_host';
export const STORAGE_DEVICE_KEY = 'onq_device';

export interface HostConfig {
  base: string;
  /** Null on the default loopback path. */
  deviceToken: string | null;
  /** True when host/device/pair came from the page URL (the caller should remember it and clean the address bar). */
  fromQuery: boolean;
  /** One-use pairing code from the link (?pair=123456). Claim it, then forget it. */
  pairCode: string | null;
  /** The page itself is served by the host at /g/: the API is same-origin, no whitelist entry is needed. */
  servedByHost: boolean;
}

/** Origin only (no path, query, or credentials) and only http(s). Anything else is ignored. */
export function normalizeHostUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function normalizeDeviceToken(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  return t && t.startsWith(DEVICE_TOKEN_PREFIX) && t.length <= 200 && /^[A-Za-z0-9_-]+$/.test(t) ? t : null;
}

export function normalizePairCode(raw: string | null | undefined): string | null {
  const c = raw?.trim();
  return c && /^\d{6}$/.test(c) ? c : null;
}

export function resolveHostConfig(i: {
  search: string;
  stored: { host?: string | null; device?: string | null };
  defaultBase: string;
  /** The page's own origin and path. When the path is under /g/ the host serves this page. */
  page?: { origin: string; pathname: string } | null;
}): HostConfig {
  const q = new URLSearchParams(i.search);
  const qHost = normalizeHostUrl(q.get('host'));
  const qDevice = normalizeDeviceToken(q.get('device'));
  const pairCode = normalizePairCode(q.get('pair'));
  const pageOrigin = i.page ? normalizeHostUrl(i.page.origin) : null;
  const servedByHost = Boolean(pageOrigin && i.page && (i.page.pathname === '/g' || i.page.pathname.startsWith('/g/')));
  // Served by the host: its own origin is the API base (a stored host from an older packaged build is ignored).
  const base = (stored: string | null | undefined) => qHost ?? (servedByHost ? pageOrigin : null) ?? normalizeHostUrl(stored) ?? i.defaultBase;
  const fromQuery = Boolean(qHost || qDevice || pairCode);
  return {
    base: base(i.stored.host),
    deviceToken: qDevice ?? normalizeDeviceToken(i.stored.device),
    fromQuery,
    pairCode,
    servedByHost,
  };
}

/** Paired devices send x-onq-device; the default path keeps the demo-session Bearer header. */
export function authHeaders(deviceToken: string | null, token: string): Record<string, string> {
  return deviceToken ? { 'x-onq-device': deviceToken } : { Authorization: `Bearer ${token}` };
}
