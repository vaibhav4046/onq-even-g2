/**
 * Pure helpers for the "Connect glasses" card: tolerant parsing of /api/remote/status, which kind of address a
 * pairing link has, the wording for it, and which single primary button to show. No React, no fetch, no clock.
 */

export type TunnelState = 'off' | 'starting' | 'on' | 'error';

export interface RemoteStatusView {
  cloudflared: { available: boolean; version: string | null };
  tailscale: { available: boolean; running: boolean; dnsName: string | null; steps: string[] };
  tunnel: { state: TunnelState; url: string | null; startedAt: string | null; error: string | null };
  lanEnabled: boolean;
  lanPending: boolean;
  exposureWarning: string;
  clientBuilt: boolean;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export const FALLBACK_NOTICE =
  'This makes OnQ reachable from the internet through a temporary public address. Only devices with a device token from a pairing code can use it. Stop it any time.';

export function normalizeRemoteStatus(raw: unknown): RemoteStatusView | null {
  if (!isRec(raw) || !isRec(raw.tunnel)) return null;
  const t = raw.tunnel;
  const state: TunnelState = t.state === 'starting' || t.state === 'on' || t.state === 'error' ? t.state : 'off';
  const cf = isRec(raw.cloudflared) ? raw.cloudflared : {};
  const ts = isRec(raw.tailscale) ? raw.tailscale : {};
  const gc = isRec(raw.glassesClient) ? raw.glassesClient : {};
  return {
    cloudflared: { available: cf.available === true, version: str(cf.version) },
    tailscale: {
      available: ts.available === true,
      running: ts.running === true,
      dnsName: str(ts.dnsName),
      steps: Array.isArray(ts.steps) ? ts.steps.filter((s): s is string => typeof s === 'string') : [],
    },
    tunnel: { state, url: state === 'on' ? str(t.url) : null, startedAt: str(t.startedAt), error: str(t.error) },
    lanEnabled: raw.lanEnabled === true,
    lanPending: raw.lanPending === true,
    exposureWarning: str(raw.exposureWarning) ?? FALLBACK_NOTICE,
    clientBuilt: gc.built === true,
  };
}

export type LinkKind = 'anywhere' | 'wifi' | 'this-computer';

const isLoopbackHost = (h: string): boolean => h === 'localhost' || h === '[::1]' || h === '::1' || /^127\./.test(h);

export function classifyLink(link: string, tunnelUrl: string | null): LinkKind {
  try {
    const u = new URL(link);
    if (tunnelUrl && u.origin === new URL(tunnelUrl).origin) return 'anywhere';
    if (u.protocol === 'https:') return 'anywhere'; // a configured public address (ONQ_PUBLIC_URL)
    return isLoopbackHost(u.hostname) ? 'this-computer' : 'wifi';
  } catch {
    return 'this-computer';
  }
}

export const LINK_HINTS: Record<LinkKind, string> = {
  anywhere: 'Works from anywhere. The address changes each time you turn remote on.',
  wifi: 'Works on the same Wi-Fi as this computer.',
  'this-computer': 'This address only works on this computer (or the simulator). Turn on remote, or allow your Wi-Fi.',
};

export const CLIENT_HINTS = {
  even: 'Even G2: open Even Hub and scan this QR.',
  other: 'Other glasses or phone: open this link.',
};

export type PrimaryAction = 'busy' | 'show' | 'refresh' | 'none';

/** ONE primary button at a time: wait, make the first QR, make a new one after it expired, or nothing. */
export function primaryAction(i: { busy: boolean; tunnel: TunnelState; hasCode: boolean; expired: boolean }): PrimaryAction {
  if (i.busy || i.tunnel === 'starting') return 'busy';
  if (!i.hasCode) return 'show';
  return i.expired ? 'refresh' : 'none';
}

/** The browser can only show a QR for short text (106 bytes). Longer links are shown as text only. */
export const QR_MAX_BYTES = 106;
export const fitsQr = (text: string): boolean => new TextEncoder().encode(text).length <= QR_MAX_BYTES;

export const TUNNEL_POLL_MS = 1000;
export const TUNNEL_POLL_MAX = 40;
