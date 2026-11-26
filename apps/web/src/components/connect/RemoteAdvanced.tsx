import { useState } from 'react';
import { callApi, labelClass, smallBtnClass } from './api';
import type { RemoteStatusView } from './remoteModel';

interface PackOut {
  file: string;
  path: string;
  bytes: number;
  sha256: string;
  relayOrigin: string;
  whitelist: string[];
  downloadUrl: string;
}

/**
 * Advanced (collapsed, lazy): build a packaged .ehpk for Even Hub, and the Tailscale steps for a stable address.
 * Not part of the default flow: the QR / link above works without any package.
 */
export function RemoteAdvanced({ sessionToken, remote }: { sessionToken: string | null; remote: RemoteStatusView | null }) {
  const [relay, setRelay] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<PackOut | null>(null);
  const [error, setError] = useState('');

  const build = async () => {
    setBusy(true);
    setError('');
    setOut(null);
    const body = relay.trim() ? { relayUrl: relay.trim() } : {};
    const r = await callApi<PackOut>('/api/remote/pack', sessionToken, 'POST', body);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setOut(r.data);
  };

  // The download needs the owner session, so it is fetched with the header and saved from a blob.
  const download = async () => {
    if (!out) return;
    const res = await fetch(out.downloadUrl, { headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}, credentials: 'include' });
    if (!res.ok) {
      setError(`Download failed (${res.status}).`);
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = out.file;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3 space-y-4 text-[11px] text-[var(--lightgray)]">
      <div className="space-y-2">
        <span className={labelClass}>Packaged app (.ehpk)</span>
        <p>Most people do not need this. Use it only if you want the glasses app installed through Even Hub tools. It is built here, for you, and only from the OnQ repo.</p>
        <input
          value={relay}
          onChange={(e) => setRelay(e.target.value)}
          placeholder={remote?.tunnel.url ?? 'https://your-address.example.com (default: your running tunnel)'}
          aria-label="Address to build into the package"
          className="bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--bright)] w-full max-w-md"
        />
        <div>
          <button type="button" disabled={busy || !sessionToken} onClick={() => void build()} className={smallBtnClass}>
            {busy ? 'Building...' : 'Build my glasses package'}
          </button>
        </div>
        {error && <p className="text-[var(--warning)]">{error}</p>}
        {out && (
          <div className="border border-[var(--hairline)] bg-black/50 p-3 space-y-1">
            <p className="text-[var(--bright)]">
              {out.file} ({out.bytes} bytes)
            </p>
            <p className="break-all">sha256: {out.sha256}</p>
            <p className="break-all">Allowed addresses: {out.whitelist.join(', ')}</p>
            <button type="button" onClick={() => void download()} className={smallBtnClass}>
              Download package
            </button>
            <p>Install: evenhub-cli upload {out.file}, or sideload with its QR tool. A new quick-tunnel address needs a new package.</p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <span className={labelClass}>Stable address with Tailscale</span>
        <p>
          Tailscale: {remote?.tailscale.available ? (remote.tailscale.running ? 'installed and running' : 'installed, not running') : 'not found'}. OnQ never starts it. Steps:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          {(remote?.tailscale.steps ?? []).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
