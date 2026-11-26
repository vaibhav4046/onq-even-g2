import { useCallback, useEffect, useState } from 'react';
import { formatUptime, harnessName, harnessStatusLabel, type HostView } from './hostModel';
import { callApi, labelClass, smallBtnClass } from './api';
import type { Loaded } from './useHostData';
import { ProviderScanner } from './ProviderScanner';

interface PowerApp {
  id: string;
  name: string;
  tier: 'HOSTED_READY' | 'HOSTED_STANDBY' | 'CLOUD_OPTIONAL';
  status: string;
  wakeable: boolean;
  detail: string;
  fixHint: string;
}

interface PowerSourceView {
  counts: { hostedReady: number; hostedStandby: number; cloudOptional: number; mcpServers: number; openBotAgents: number };
  hostedReady: PowerApp[];
  hostedStandby: PowerApp[];
  mcpServers: Array<{ source: string; name: string }>;
  honestBoundary: string;
}

interface RemoteBridgeView {
  mode: 'LOCAL_LOOPBACK' | 'LOCAL_LAN' | 'REMOTE_CLOUDFLARED' | 'REMOTE_PUBLIC_URL';
  publicUrl: string | null;
  vacationReady: boolean;
  commands: { tunnel: string; tailscaleFunnel: string; packForRemote: string };
}

const REMOTE_MODE_LABEL: Record<RemoteBridgeView['mode'], string> = {
  LOCAL_LOOPBACK: 'LOCAL LOOPBACK',
  LOCAL_LAN: 'LOCAL LAN',
  REMOTE_CLOUDFLARED: 'REMOTE HTTPS TUNNEL',
  REMOTE_PUBLIC_URL: 'REMOTE HTTPS URL',
};

const STATUS_DOT: Record<string, string> = {
  connected: 'bg-[var(--g2-phosphor)]',
  needs_auth: 'bg-[var(--warning)]',
  needs_check: 'bg-[var(--warning)]',
  error: 'bg-[var(--danger)]',
  not_installed: 'bg-white/20',
};

const STATUS_ORDER = ['connected', 'needs_auth', 'needs_check', 'error'];

interface ThisComputerPanelProps {
  sessionToken: string | null;
  profile: Loaded<HostView | null>;
  fallbackAiLabel: string;
  fallbackConnected: { connected: number; total: number };
  onTestAll: () => Promise<string>;
  onModelChanged: (message: string) => void;
  onScanned: () => void;
}

/** The host: this computer holds every key and does every task. Detected harnesses come from the real scan. */
export function ThisComputerPanel({
  sessionToken,
  profile,
  fallbackAiLabel,
  fallbackConnected,
  onTestAll,
  onModelChanged,
  onScanned,
}: ThisComputerPanelProps) {
  const view = profile.data;
  const [power, setPower] = useState<PowerSourceView | null>(null);
  const [bridge, setBridge] = useState<RemoteBridgeView | null>(null);
  const [wakingId, setWakingId] = useState<string | null>(null);
  const [wakeNote, setWakeNote] = useState('');

  const refreshPower = useCallback(async () => {
    if (!sessionToken) return;
    const [pOut, bOut] = await Promise.all([
      callApi<PowerSourceView>('/api/computer/power-source', sessionToken, 'GET'),
      callApi<RemoteBridgeView>('/api/remote/bridge', sessionToken, 'GET'),
    ]);
    if (pOut.ok) setPower(pOut.data);
    if (bOut.ok) setBridge(bOut.data);
  }, [sessionToken]);

  useEffect(() => {
    void refreshPower();
  }, [refreshPower, view]);

  const wakeService = async (service: string) => {
    if (!sessionToken) return;
    setWakingId(service);
    const out = await callApi<{ ok?: boolean; detail?: string }>('/api/computer/wake', sessionToken, 'POST', { service });
    setWakingId(null);
    setWakeNote(out.ok ? out.data.detail ?? `Started ${service}.` : `Wake ${service}: ${out.error}`);
    if (out.ok) {
      window.setTimeout(() => {
        onScanned();
        void refreshPower();
      }, 2800);
    }
  };

  // API-key providers are not tools on this computer; only local CLIs and local servers are listed here.
  const local = (view?.harnesses ?? []).filter((h) => h.kind !== 'api');
  const found = local.filter((h) => h.status !== 'not_installed').sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const missing = local.length - found.length;
  const meta = [view?.platform, formatUptime(view?.uptimeSec ?? null)].filter(Boolean).join(' · ');
  const wakeableApps = (power?.hostedStandby ?? []).filter((a) => a.wakeable);
  return (
    <section aria-labelledby="this-computer-heading" className="retro-glass-panel p-4 sm:p-5 space-y-4 text-xs min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 id="this-computer-heading" className={labelClass}>
            This computer &middot; AI power source
          </h3>
          <p className="font-display text-lg font-bold text-[var(--bright)] leading-tight break-words">
            {view?.name ?? (profile.loading ? 'Reading this computer...' : 'This computer')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bridge && (
            <span
              className={`font-pixel text-[8px] uppercase tracking-[0.14em] px-2 py-0.5 border whitespace-nowrap ${
                bridge.vacationReady
                  ? 'border-[var(--g2-phosphor)]/60 text-[var(--g2-phosphor)] bg-[var(--g2-phosphor)]/10'
                  : 'border-white/20 text-[var(--lightgray)] bg-black/40'
              }`}
            >
              {REMOTE_MODE_LABEL[bridge.mode]}
            </span>
          )}
          {meta && <span className="text-[11px] text-[var(--lightgray)]">{meta}</span>}
        </div>
      </div>
      <p className="text-[12px] text-[var(--bright)]/90">
        Your computer is the AI power source; Even G2 is the thin optical window. Hosted local apps run at $0 API cost and stay reachable on the go via <code className="text-[11px]">npm run tunnel</code>. Cloud API keys remain optional.
      </p>

      {power && (
        <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
          <span className="px-2 py-0.5 border border-[var(--g2-phosphor)]/45 text-[var(--g2-phosphor)] bg-[var(--g2-phosphor)]/10">
            HOSTED &middot; READY: {power.counts.hostedReady}
          </span>
          <span className="px-2 py-0.5 border border-white/15 text-[var(--lightgray)] bg-black/40">
            HOSTED &middot; STANDBY: {power.counts.hostedStandby}
          </span>
          <span className="px-2 py-0.5 border border-white/15 text-[var(--lightgray)] bg-black/40">
            CLOUD API &middot; OPTIONAL: {power.counts.cloudOptional}
          </span>
          {wakeableApps.map((app) => (
            <button
              key={app.id}
              type="button"
              disabled={wakingId === app.id}
              onClick={() => void wakeService(app.id)}
              className={smallBtnClass}
            >
              {wakingId === app.id ? `Waking ${app.name}...` : `Wake ${app.name}`}
            </button>
          ))}
        </div>
      )}
      {wakeNote && (
        <p className="text-[11px] text-[var(--verified)]" role="status">
          {wakeNote}
        </p>
      )}

      {!profile.available && !profile.loading && (
        <p className="text-[11px] text-[var(--lightgray)]" role="status">
          Host details: {profile.error || 'Not available yet.'}
        </p>
      )}

      {found.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Detected on this computer">
          {found.map((h) => (
            <li key={h.id} className="border border-[var(--hairline)] bg-black/50 px-2.5 py-1.5 flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[h.status] ?? 'bg-white/20'}`} aria-hidden="true" />
              <span className="font-semibold text-[var(--bright)] truncate">{harnessName(h.id)}</span>
              <span className="text-[10px] text-[var(--lightgray)] whitespace-nowrap">
                {harnessStatusLabel(h.status)} · {h.probeMs === null ? 'not probed' : `probe ${h.probeMs} ms`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {view && found.length === 0 && (
        <p className="text-[11px] text-[var(--lightgray)]">No AI tool found on this computer yet. Press Scan this computer.</p>
      )}
      {missing > 0 && <p className="text-[10px] text-[var(--lightgray)]">{missing} more checked, not installed.</p>}
      {view?.routing && (
        <p className="text-[11px] text-[var(--lightgray)]">
          Inference host:{' '}
          <span className="text-[var(--bright)] font-medium">
            {view.routing.inferenceMode === 'computer'
              ? 'Hosted on this computer (main)'
              : view.routing.inferenceMode === 'api'
                ? 'API (optional)'
                : 'Auto (computer + API)'}
          </span>
          {' · '}Routing: {view.routing.preferredLlm}
          {view.routing.preferredModel ? ` / ${view.routing.preferredModel}` : ''}
        </p>
      )}

      <ProviderScanner
        sessionToken={sessionToken}
        fallbackAiLabel={fallbackAiLabel}
        fallbackConnected={fallbackConnected}
        onTestAll={onTestAll}
        onModelChanged={onModelChanged}
        onScanned={() => {
          onScanned();
          void refreshPower();
        }}
      />

      {power && (
        <details className="border border-dashed border-[var(--hairline)] px-3 py-2 text-[11px]">
          <summary className="cursor-pointer text-[var(--bright)]">
            More Local PC Skills &amp; MCP Servers ({power.counts.mcpServers} MCP &middot; {power.counts.openBotAgents} OpenBot)
          </summary>
          <div className="mt-2 space-y-2 text-[var(--lightgray)]">
            {power.mcpServers.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {power.mcpServers.map((m) => (
                  <li key={`${m.source}:${m.name}`} className="border border-white/15 bg-black/45 px-2 py-0.5 text-[10px]">
                    <span className="text-[var(--g2-phosphor)]">{m.source}</span>: {m.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No local MCP server configs detected in ~/.claude, ~/.codex, ~/.hermes, or ~/.gemini.</p>
            )}
            <p className="text-[10.5px] leading-relaxed">{power.honestBoundary}</p>
            {bridge && (
              <p className="text-[10.5px]">
                Remote access when traveling: run <code>{bridge.commands.tunnel}</code> or <code>{bridge.commands.tailscaleFunnel}</code>.
              </p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
