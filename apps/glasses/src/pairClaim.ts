import { normalizeDeviceToken } from './hostConfig';

export type ClaimResult = { ok: true; deviceToken: string } | { ok: false; status: number; error: string };

/**
 * Claims the pairing code that came in the link (?pair=123456). The code goes in the request BODY, never a URL.
 * The caller has already removed it from the address bar and history before calling this.
 */
export async function claimPairing(f: typeof fetch, base: string, code: string, label: string): Promise<ClaimResult> {
  try {
    const res = await f(`${base}/api/pair/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, label }),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const body = (await res.json().catch(() => ({}))) as { deviceToken?: string; error?: string };
    const token = normalizeDeviceToken(body.deviceToken);
    if (res.ok && token) return { ok: true, deviceToken: token };
    return { ok: false, status: res.status, error: body.error ?? `HTTP ${res.status}` };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the computer' };
  }
}

/** Short device name shown in the owner's paired list. */
export function deviceLabel(isEven: boolean, userAgent: string): string {
  if (isEven) return 'Even G2 glasses';
  const ua = userAgent.toLowerCase();
  const kind = /oculus|quest|meta/.test(ua) ? 'Meta glasses' : /iphone|ipad/.test(ua) ? 'iPhone' : /android/.test(ua) ? 'Android' : 'Browser';
  return kind;
}
