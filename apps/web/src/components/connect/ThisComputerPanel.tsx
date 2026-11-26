import { formatUptime, harnessName, harnessStatusLabel, type HostView } from './hostModel';
import { labelClass } from './api';
import type { Loaded } from './useHostData';
import { ProviderScanner } from './ProviderScanner';

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
  // API-key providers are not tools on this computer; only local CLIs and local servers are listed here.
  const local = (view?.harnesses ?? []).filter((h) => h.kind !== 'api');
  const found = local.filter((h) => h.status !== 'not_installed').sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const missing = local.length - found.length;
  const meta = [view?.platform, formatUptime(view?.uptimeSec ?? null)].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby="this-computer-heading" className="retro-glass-panel p-4 sm:p-5 space-y-4 text-xs min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 id="this-computer-heading" className={labelClass}>
            This computer
          </h3>
          <p className="font-display text-lg font-bold text-[var(--bright)] leading-tight break-words">
            {view?.name ?? (profile.loading ? 'Reading this computer...' : 'This computer')}
          </p>
        </div>
        {meta && <span className="text-[11px] text-[var(--lightgray)]">{meta}</span>}
      </div>
      <p className="text-[12px] text-[var(--bright)]/90">
        This computer is your main AI host. Every AI app &amp; agent here mirrors to your glasses and can be controlled from your glasses. Cloud API keys are optional.
      </p>

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
        onScanned={onScanned}
      />
    </section>
  );
}
