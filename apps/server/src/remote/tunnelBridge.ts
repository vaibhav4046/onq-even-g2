import { EXPOSURE_NOTICE, validateRelayUrl, type RemoteService, type RemoteStatus } from '../host/remote.js';

export type RemoteBridgeMode =
  | 'LOCAL_LOOPBACK'
  | 'LOCAL_LAN'
  | 'REMOTE_CLOUDFLARED'
  | 'REMOTE_PUBLIC_URL';

export interface RemoteBridgeState {
  mode: RemoteBridgeMode;
  publicUrl: string | null;
  vacationReady: boolean;
  zeroTrustGuards: readonly string[];
  exposureWarning: string;
  commands: {
    tunnel: string;
    tailscaleFunnel: string;
    packForRemote: string;
  };
  status: RemoteStatus;
}

export const ZERO_TRUST_REMOTE_GUARDS: readonly string[] = [
  'Cryptographic Bearer / Device Token required on every remote route',
  'Strict Origin & Host header gate (no unauthenticated tunnel bypass)',
  'Global Kill Switch locks every paired remote device with HTTP 423',
  'L5 hard-blocks rm -rf, DROP TABLE, secret export, bulk blasts & real money',
  'Default-NO + 2.0s Undo Ring required before any mutating write commits',
];

/**
 * Unified zero-trust view over OnQ's RemoteService (Cloudflare Quick Tunnel, Tailscale Funnel,
 * `ONQ_PUBLIC_URL`, or local LAN/loopback) so glasses and phone can safely reach the home PC from anywhere.
 */
export async function buildRemoteBridgeState(
  remote: RemoteService,
  configuredPublicUrl: string | undefined,
  port: number,
): Promise<RemoteBridgeState> {
  const status = await remote.status();
  let safeConfigured: string | null = null;
  if (configuredPublicUrl?.trim()) {
    try {
      safeConfigured = validateRelayUrl(configuredPublicUrl);
    } catch {
      safeConfigured = null;
    }
  }
  const tunnelUrl = status.tunnel.state === 'on' ? status.tunnel.url : null;
  const publicUrl = tunnelUrl ?? safeConfigured;
  const mode: RemoteBridgeMode = tunnelUrl
    ? 'REMOTE_CLOUDFLARED'
    : safeConfigured
      ? 'REMOTE_PUBLIC_URL'
      : status.lanEnabled
        ? 'LOCAL_LAN'
        : 'LOCAL_LOOPBACK';
  const vacationReady = Boolean(publicUrl && publicUrl.startsWith('https://'));

  return {
    mode,
    publicUrl,
    vacationReady,
    zeroTrustGuards: ZERO_TRUST_REMOTE_GUARDS,
    exposureWarning: EXPOSURE_NOTICE,
    commands: {
      tunnel: 'npm run tunnel',
      tailscaleFunnel: `tailscale funnel ${port}`,
      packForRemote: publicUrl
        ? `ONQ_RELAY_ORIGIN=${publicUrl} npm run pack`
        : 'ONQ_RELAY_ORIGIN=https://<your-tunnel> npm run pack',
    },
    status,
  };
}
