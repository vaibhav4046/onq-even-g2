import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { callApi, labelClass, smallBtnClass } from './api';
import { ageLabel, formatCountdown, groupCode, type DeviceRow } from './hostModel';
import { encodeQr, qrPath } from './qr';
import {
  CLIENT_HINTS,
  classifyLink,
  fitsQr,
  FALLBACK_NOTICE,
  LINK_HINTS,
  normalizeRemoteStatus,
  primaryAction,
  TUNNEL_POLL_MAX,
  TUNNEL_POLL_MS,
  type RemoteStatusView,
} from './remoteModel';
import type { Loaded } from './useHostData';

const RemoteAdvanced = lazy(() => import('./RemoteAdvanced').then((m) => ({ default: m.RemoteAdvanced })));

interface IssuedCode {
  code: string;
  expiresAtMs: number;
  /** The one link that does everything: <base>/g/?pair=123456 */
  link: string;
}

const QUIET = 4;
const DEVICE_POLL_MS = 4000;

export function QrSvg({ text }: { text: string }) {
  const qr = useMemo(() => {
    if (!fitsQr(text)) return null;
    try {
      return encodeQr(text);
    } catch {
      return null;
    }
  }, [text]);
  if (!qr) return <p className="text-[11px] text-[var(--lightgray)]">The link is too long for a QR code. Open the link below instead.</p>;
  const n = qr.size + QUIET * 2;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={168} height={168} shapeRendering="crispEdges" role="img" aria-label="QR code that connects your glasses" className="shrink-0">
      <rect width={n} height={n} fill="#fff" />
      <path d={qrPath(qr.modules)} transform={`translate(${QUIET} ${QUIET})`} fill="#000" />
    </svg>
  );
}

interface PairCardProps {
  sessionToken: string | null;
  devices: Loaded<DeviceRow[]>;
  onDevicesChanged: () => void;
}

/**
 * Connect glasses, in two steps. 1) Reach it from anywhere (optional, owner-started tunnel).
 * 2) Scan one QR (or open one link). The code is inside the link, so nobody types anything.
 */
export function PairCard({ sessionToken, devices, onDevicesChanged }: PairCardProps) {
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [remote, setRemote] = useState<RemoteStatusView | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadRemote = useCallback(async (): Promise<RemoteStatusView | null> => {
    const out = await callApi<unknown>('/api/remote/status', sessionToken);
    const view = out.ok ? normalizeRemoteStatus(out.data) : null;
    if (alive.current) setRemote(view);
    return view;
  }, [sessionToken]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  useEffect(() => {
    if (!issued) return;
    setNow(Date.now());
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    // A device claiming the code shows up in the list without a page reload.
    const poll = window.setInterval(onDevicesChanged, DEVICE_POLL_MS);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [issued, onDevicesChanged]);

  const makeCode = useCallback(async (): Promise<boolean> => {
    const out = await callApi<{ code?: string; expiresAt?: string; ttlSeconds?: number; link?: string; url?: string }>('/api/pair/code', sessionToken, 'POST');
    if (!out.ok || !out.data.code) {
      setNote(out.ok ? 'The computer sent no code.' : `QR code: ${out.error}`);
      return false;
    }
    const parsed = out.data.expiresAt ? Date.parse(out.data.expiresAt) : Number.NaN;
    const expiresAtMs = Number.isNaN(parsed) ? Date.now() + (out.data.ttlSeconds ?? 300) * 1000 : parsed;
    const link = out.data.link ?? (out.data.url ? `${out.data.url}/g/?pair=${out.data.code}` : '');
    setIssued({ code: out.data.code, expiresAtMs, link });
    setNow(Date.now());
    return true;
  }, [sessionToken]);

  const showQr = async () => {
    setBusy(true);
    setNote('');
    await makeCode();
    setBusy(false);
  };

  const startTunnel = async () => {
    setBusy(true);
    setNote('');
    const out = await callApi<unknown>('/api/remote/start', sessionToken, 'POST', { provider: 'cloudflared', confirm: true });
    if (!out.ok) {
      setBusy(false);
      setNote(`Remote: ${out.error}`);
      void loadRemote();
      return;
    }
    // Wait for the address (a few seconds). The server gives up after 30 s by itself.
    let view: RemoteStatusView | null = null;
    for (let i = 0; i < TUNNEL_POLL_MAX && alive.current; i++) {
      await new Promise((r) => window.setTimeout(r, TUNNEL_POLL_MS));
      view = await loadRemote();
      if (view && view.tunnel.state !== 'starting') break;
    }
    if (view?.tunnel.state === 'on') {
      await makeCode(); // fresh QR with the new address, no extra click
      setNote('Remote is on. Give the address about 10 seconds to start working.');
    } else {
      setNote(view?.tunnel.error ? `Remote: ${view.tunnel.error}` : 'Remote did not start. Check that cloudflared is installed.');
    }
    setUnderstood(false);
    setBusy(false);
  };

  const stopTunnel = async () => {
    setBusy(true);
    const out = await callApi('/api/remote/stop', sessionToken, 'POST');
    await loadRemote();
    setNote(out.ok ? 'Remote is off. The old address no longer works.' : `Stop: ${out.error}`);
    if (out.ok) await makeCode(); // the old QR pointed at a dead address
    setBusy(false);
  };

  const allowWifi = async () => {
    setBusy(true);
    const out = await callApi<{ restartRequired?: boolean }>('/api/remote/lan', sessionToken, 'POST', { enabled: true, confirm: true });
    setNote(
      out.ok
        ? 'Saved. Close OnQ and start it again, then your Wi-Fi works with no other setup. Until then only this computer can open the link.'
        : `Wi-Fi: ${out.error}`,
    );
    await loadRemote();
    setBusy(false);
  };

  const revoke = async (id: string) => {
    const out = await callApi(`/api/pair/devices/${encodeURIComponent(id)}`, sessionToken, 'DELETE');
    setNote(out.ok ? 'Device revoked. It must pair again.' : `Revoke: ${out.error}`);
    onDevicesChanged();
  };

  const tunnel = remote?.tunnel.state ?? 'off';
  const msLeft = issued ? issued.expiresAtMs - now : 0;
  const expired = issued !== null && msLeft <= 0;
  const kind = issued ? classifyLink(issued.link, remote?.tunnel.url ?? null) : null;
  const primary = primaryAction({ busy, tunnel, hasCode: issued !== null, expired });
  const canStartRemote = remote !== null && remote.cloudflared.available;

  return (
    <section aria-labelledby="pair-heading" className="retro-glass-panel p-4 sm:p-5 space-y-4 text-xs min-w-0">
      <div>
        <h3 id="pair-heading" className={labelClass}>
          Connect glasses
        </h3>
        <p className="text-[12px] text-[var(--bright)]/90 mt-0.5">Two steps. No accounts on the glasses, and nothing to type.</p>
      </div>

      <div className="space-y-2 border border-[var(--hairline)] bg-black/40 p-3">
        <h4 className="font-semibold text-[var(--bright)]">1. Reach it from anywhere (optional)</h4>
        {tunnel === 'on' ? (
          <div className="space-y-2">
            <p className="text-[11px] text-[var(--verified)]" role="status">
              Remote is on: <code className="text-[var(--bright)] break-all">{remote?.tunnel.url}</code>
            </p>
            <button type="button" disabled={busy} onClick={() => void stopTunnel()} className={`${smallBtnClass} hover:text-[var(--danger)]`}>
              Stop tunnel
            </button>
          </div>
        ) : tunnel === 'starting' ? (
          <p className="text-[11px] text-[var(--lightgray)]" role="status">
            Starting your tunnel. This takes a few seconds.
          </p>
        ) : !remote ? (
          <p className="text-[11px] text-[var(--lightgray)]">Remote status is not available yet. Same Wi-Fi still works below.</p>
        ) : !canStartRemote ? (
          <p className="text-[11px] text-[var(--lightgray)]">
            To use your glasses away from home, install cloudflared once (winget install Cloudflare.cloudflared), then reload. Same Wi-Fi works without it.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-[var(--lightgray)]">{remote.exposureWarning || FALLBACK_NOTICE}</p>
            <label className="flex items-start gap-2 text-[11px] text-[var(--bright)] cursor-pointer">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
              <span>I understand this makes OnQ reachable from the internet, guarded by pairing codes and device tokens.</span>
            </label>
            <button
              type="button"
              disabled={!understood || busy || !sessionToken}
              onClick={() => void startTunnel()}
              className={`${smallBtnClass} hover:text-[var(--lime)]`}
            >
              Start my tunnel
            </button>
            {remote.tunnel.state === 'error' && remote.tunnel.error && <p className="text-[11px] text-[var(--warning)]">Last try failed: {remote.tunnel.error}</p>}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-[var(--bright)]">2. Scan the code</h4>
          {primary !== 'none' && (
            <button
              type="button"
              disabled={primary === 'busy' || !sessionToken}
              onClick={() => void showQr()}
              className="retro-btn-primary px-3.5 py-1.5 text-[11px] cursor-pointer disabled:opacity-50"
            >
              {primary === 'busy' ? 'Working...' : primary === 'refresh' ? 'Make a new QR' : 'Show QR'}
            </button>
          )}
        </div>

        {issued && (
          <div className="flex flex-wrap items-center gap-4 border border-dashed border-[var(--hairline)] bg-black/40 p-4">
            {!expired && issued.link && <QrSvg text={issued.link} />}
            <div className="space-y-1.5 min-w-0">
              <p className="font-pixel text-[10px] uppercase tracking-[0.14em] text-[var(--lightgray)]" role="timer">
                {expired ? 'Expired. Make a new QR.' : `Works once. Expires in ${formatCountdown(msLeft)}.`}
              </p>
              {!expired && (
                <>
                  <p className="text-[11px] text-[var(--bright)]">{CLIENT_HINTS.even}</p>
                  <p className="text-[11px] text-[var(--bright)]">{CLIENT_HINTS.other}</p>
                  <p className="text-[11px] text-[var(--lightgray)] break-all">
                    <code className="text-[var(--bright)]">{issued.link}</code>
                  </p>
                  {kind && <p className={`text-[11px] ${kind === 'this-computer' ? 'text-[var(--warning)]' : 'text-[var(--lightgray)]'}`}>{LINK_HINTS[kind]}</p>}
                  <p className="text-[11px] text-[var(--lightgray)]">
                    Or type the code by hand:{' '}
                    <span className={`font-dots font-black tracking-[0.12em] text-[var(--lime)]`} aria-label={`Pairing code ${issued.code.split('').join(' ')}`}>
                      {groupCode(issued.code)}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {kind === 'this-computer' && tunnel === 'off' && remote && !remote.lanEnabled && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--lightgray)]">
            {remote.lanPending ? (
              <span>Wi-Fi is saved. Restart OnQ to apply it.</span>
            ) : (
              <>
                <span>Same Wi-Fi? Allow it once. It needs a restart.</span>
                <button type="button" disabled={busy} onClick={() => void allowWifi()} className={smallBtnClass}>
                  Allow my Wi-Fi
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {note && (
        <p className="text-[11px] text-[var(--verified)]" role="status">
          {note}
        </p>
      )}

      <div className="space-y-1.5">
        <span className={labelClass}>Paired devices</span>
        {!devices.available && !devices.loading ? (
          <p className="text-[11px] text-[var(--lightgray)]">Device list: {devices.error || 'Not available yet.'}</p>
        ) : devices.data.length === 0 ? (
          <p className="text-[11px] text-[var(--lightgray)]">No device is paired yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {devices.data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-[var(--hairline)] bg-black/50 px-3 py-2">
                <span className="font-semibold text-[var(--bright)] truncate min-w-0">{d.label}</span>
                <span className="text-[10.5px] text-[var(--lightgray)]">last seen {ageLabel(d.lastSeen, Date.now(), 'never')}</span>
                <button type="button" onClick={() => void revoke(d.id)} className={`${smallBtnClass} ml-auto hover:text-[var(--danger)]`} aria-label={`Revoke ${d.label}`}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="border-t border-dashed border-white/10 pt-3" onToggle={(e) => setShowAdvanced((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-[11px] text-[var(--lightgray)] hover:text-[var(--bright)]">Advanced: install as a packaged app</summary>
        {showAdvanced && (
          <Suspense fallback={<p className="text-[11px] text-[var(--lightgray)] mt-2">Loading...</p>}>
            <RemoteAdvanced sessionToken={sessionToken} remote={remote} />
          </Suspense>
        )}
      </details>

      <p className="text-[11px] text-[var(--lightgray)] border-t border-dashed border-white/10 pt-3">
        Untested on physical glasses. Tested in the simulator. Telegram also works with any glasses that run it: approve or reject there.
      </p>
    </section>
  );
}
