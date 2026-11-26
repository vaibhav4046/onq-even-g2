import { useCallback, useEffect, useState } from 'react';
import { callApi, inputClass, labelClass, smallBtnClass } from './api';

type ProviderKind = 'local_cli' | 'local_server' | 'api_key';
type ProviderState = 'connected' | 'needs_auth' | 'not_installed' | 'error';

interface ScannedModel {
  id: string;
  name: string;
  free?: boolean;
  local?: boolean;
  reasoning?: boolean;
}

interface ScannedProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  state: ProviderState;
  selectable: boolean;
  defaultModel: string | null;
  models: ScannedModel[];
  detail: string;
  fixHint: string;
}

interface ScanResponse {
  scannedAt: string;
  activeProvider: string | null;
  activeModel: string | null;
  activeLabel?: string;
  connectedCount: number;
  totalModels: number;
  providers: ScannedProvider[];
}

const KIND_LABEL: Record<ProviderKind, string> = {
  local_cli: 'Your subscription',
  local_server: 'Local',
  api_key: 'API key',
};

const STATE_DOT: Record<ProviderState, string> = {
  connected: 'bg-[var(--g2-phosphor)]',
  needs_auth: 'bg-[var(--warning)]',
  error: 'bg-[var(--danger)]',
  not_installed: 'bg-white/20',
};

const STATE_LABEL: Record<ProviderState, string> = {
  connected: 'Connected',
  needs_auth: 'Needs sign-in',
  error: 'Error',
  not_installed: 'Not installed',
};

interface ProviderScannerProps {
  sessionToken: string | null;
  /** Fallback label from /api/connectors/status when the scan endpoint is missing. */
  fallbackAiLabel: string;
  fallbackConnected: { connected: number; total: number };
  onTestAll: () => Promise<string>;
  onModelChanged: (message: string) => void;
}

function modelLabel(m: ScannedModel) {
  const tags = [m.free && 'free', m.local && 'local', m.reasoning && 'reasoning'].filter(Boolean);
  return tags.length ? `${m.name} (${tags.join(', ')})` : m.name;
}

function ProviderRow({
  p,
  isActive,
  activeModel,
  busy,
  onUse,
}: {
  p: ScannedProvider;
  isActive: boolean;
  activeModel: string | null;
  busy: boolean;
  onUse: (model: string) => void;
}) {
  const [model, setModel] = useState((isActive && activeModel) || p.defaultModel || p.models[0]?.id || '');
  return (
    <li className="border border-[var(--hairline)] bg-black/50 px-3 py-2.5 space-y-1.5 min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATE_DOT[p.state]}`} aria-hidden="true" />
        <span className="font-semibold text-[var(--bright)] truncate min-w-0">{p.name}</span>
        <span className="font-pixel text-[8px] uppercase px-1.5 py-0.5 border border-white/15 text-[var(--lightgray)] shrink-0">
          {KIND_LABEL[p.kind]}
        </span>
        {isActive && (
          <span className="font-pixel text-[8px] uppercase px-1.5 py-0.5 bg-[var(--lime)]/15 text-[var(--lime)] shrink-0">
            In use
          </span>
        )}
        <span className="sr-only">{STATE_LABEL[p.state]}</span>
      </div>
      {p.detail && (
        <p className={`text-[10.5px] break-words ${p.kind === 'local_cli' ? 'text-[var(--g2-phosphor)]' : 'text-[var(--lightgray)]'}`}>
          {p.detail}
        </p>
      )}
      {p.selectable && p.models.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <select
            aria-label={`${p.name} model`}
            value={model}
            disabled={busy}
            onChange={(e) => setModel(e.target.value)}
            className={`${inputClass} flex-1 basis-40`}
          >
            {p.models.map((m) => (
              <option key={m.id} value={m.id}>
                {modelLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !model || (isActive && model === activeModel)}
            onClick={() => onUse(model)}
            className={smallBtnClass}
          >
            {isActive && model === activeModel ? 'In use' : 'Use'}
          </button>
        </div>
      )}
    </li>
  );
}

/** OpenBot-style "Settings -> Providers": scan this machine, pick a model, test what is connected. */
export function ProviderScanner({
  sessionToken,
  fallbackAiLabel,
  fallbackConnected,
  onTestAll,
  onModelChanged,
}: ProviderScannerProps) {
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSummary, setTestSummary] = useState('');

  const runScan = useCallback(
    async (fresh: boolean) => {
      if (!sessionToken) return;
      setScanning(true);
      const out = await callApi<ScanResponse>('/api/connectors/scan-models', sessionToken, fresh ? 'POST' : 'GET');
      if (out.ok && Array.isArray(out.data.providers)) {
        setScan(out.data);
        setScanError('');
      } else {
        setScanError(out.ok ? 'The scan came back empty.' : `Model scan: ${out.error}`);
      }
      setScanning(false);
    },
    [sessionToken],
  );

  useEffect(() => {
    void runScan(false);
  }, [runScan]);

  const selectModel = async (provider: string, model = '') => {
    setSelecting(true);
    const out = await callApi<{ activeProvider: string; activeModel: string | null; activeLabel: string }>(
      '/api/connectors/select-model',
      sessionToken,
      'POST',
      { provider, model },
    );
    setSelecting(false);
    if (!out.ok) {
      onModelChanged(`Could not switch model: ${out.error}`);
      return;
    }
    const { activeProvider, activeModel, activeLabel } = out.data;
    setScan((prev) => (prev ? { ...prev, activeProvider, activeModel, activeLabel } : prev));
    onModelChanged(`Now using ${activeLabel}${activeModel ? ` / ${activeModel}` : ''}.`);
  };

  const testAll = async () => {
    setTesting(true);
    setTestSummary('Testing...');
    setTestSummary(await onTestAll());
    setTesting(false);
  };

  const providers = scan?.providers ?? [];
  const connected = providers.filter((p) => p.state === 'connected');
  const others = providers.filter((p) => p.state !== 'connected');
  const activeName = providers.find((p) => p.id === scan?.activeProvider)?.name ?? scan?.activeLabel ?? 'fixed rules';
  const aiLabel = scan
    ? scan.activeModel
      ? `${activeName} / ${scan.activeModel}`
      : activeName
    : fallbackAiLabel;
  const count = scan
    ? { connected: scan.connectedCount ?? connected.length, total: providers.length }
    : fallbackConnected;

  return (
    <div className="retro-glass-panel p-4 sm:p-5 space-y-4 text-xs min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-pixel text-[9px] uppercase px-2.5 py-1 rounded-full border border-[var(--lime)]/50 bg-[var(--lime)]/10 text-[var(--lime)] break-all">
          AI: {aiLabel}
        </span>
        <span className="font-pixel text-[9px] uppercase px-2.5 py-1 rounded-full border border-white/15 text-[var(--bright)]">
          {count.connected} of {count.total} connected
        </span>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button
            type="button"
            disabled={scanning || !sessionToken}
            onClick={() => void runScan(true)}
            className="retro-btn-primary px-3 py-1.5 text-[11px] cursor-pointer disabled:opacity-50"
          >
            {scanning ? 'Scanning...' : 'Scan machine and models'}
          </button>
          <button type="button" disabled={testing} onClick={() => void testAll()} className={smallBtnClass}>
            {testing ? 'Testing...' : 'Test all connected'}
          </button>
          <button type="button" disabled={selecting || !sessionToken} onClick={() => void selectModel('auto')} className={smallBtnClass}>
            Auto
          </button>
          <button type="button" disabled={selecting || !sessionToken} onClick={() => void selectModel('rules')} className={smallBtnClass}>
            Fixed rules
          </button>
        </div>
      </div>

      {testSummary && (
        <p className="text-[11px] text-[var(--verified)] break-words" role="status">
          {testSummary}
        </p>
      )}
      {scanError && !scan && <p className="text-[11px] text-[var(--lightgray)]">{scanError}</p>}

      {scan && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={labelClass}>AI PROVIDERS ON THIS MACHINE</span>
            <span className="text-[10px] text-[var(--lightgray)]">
              {scan.totalModels} models · scanned {new Date(scan.scannedAt).toLocaleTimeString()}
            </span>
          </div>
          {connected.length === 0 ? (
            <p className="text-[11px] text-[var(--lightgray)]">
              No AI provider is connected yet, so OnQ uses fixed rules. See More providers for a one-line fix.
            </p>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {connected.map((p) => (
                <ProviderRow
                  key={p.id}
                  p={p}
                  isActive={p.id === scan.activeProvider}
                  activeModel={scan.activeModel}
                  busy={selecting}
                  onUse={(m) => void selectModel(p.id, m)}
                />
              ))}
            </ul>
          )}
          {others.length > 0 && (
            <details className="border border-dashed border-[var(--hairline)] px-3 py-2">
              <summary className="cursor-pointer text-[11px] text-[var(--bright)]">More providers ({others.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {others.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 self-center ${STATE_DOT[p.state]}`} aria-hidden="true" />
                    <span className="text-[var(--bright)]">{p.name}</span>
                    <span className="text-[10px] text-[var(--lightgray)]">
                      {KIND_LABEL[p.kind]} · {STATE_LABEL[p.state]}
                    </span>
                    {p.fixHint && (
                      <span className="basis-full text-[10.5px] text-[var(--lightgray)] break-words pl-3.5">{p.fixHint}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
