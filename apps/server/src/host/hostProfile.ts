import crypto from 'node:crypto';
import type { MetricStep } from '../harness/metricsLedger.js';
import type { InferenceMode } from '../harness/modelRouter.js';
import type { ProviderScanResult, ScannedProvider } from '../providers/providerScanner.js';
import type { PublicDevice } from './hostRegistry.js';
import type { BreakerState } from '../harness/syncWorker.js';
import type { SourceSetting } from './sourceModes.js';

/**
 * One JSON document describing what the computer offers: harnesses, routing, tools, skills, connector booleans,
 * metrics and paired devices. Clients (phone, glasses) read this instead of signing in to anything themselves.
 * Booleans and ids only: no tokens, keys, URLs or binary paths ever go in here.
 */

export type DataSourceId = 'calendar' | 'gmail' | 'notion' | 'telegram';
export type DataSourceMode = 'api' | 'browser' | 'sample' | 'off';

export interface DataSourceStatus {
  source: DataSourceId;
  mode: DataSourceMode;
  /** True only when something real was exercised on this host (a finished browser run). Never implied. */
  probed: boolean;
  evidence: string;
}

/** What the profile and GET /api/sources report per source. */
export interface SourceRow {
  source: DataSourceId;
  /** The owner's setting: auto, computer (own Chrome) or api. */
  mode: SourceSetting;
  /** The route actually used right now. 'off' = the chosen route is unavailable (see reason); never a silent fallback. */
  effective: DataSourceMode;
  reason: string | null;
  probed: boolean;
  evidence: string;
  /** Median fetch time from the metrics ledger (sync:<source>:* steps); null until measured. */
  p50Ms: number | null;
  lastSyncAt: string | null;
  /** null = nothing synced yet. */
  stale: boolean | null;
  breaker: BreakerState;
}

export interface BrowserAvailability {
  /** The browser agent is constructed on this server. */
  wired: boolean;
  /** 'injected' = a test or embedder supplied the driver; 'chrome' = installed Chrome found on disk; 'none'. */
  driver: 'injected' | 'chrome' | 'none';
  /** At least one browser run finished with status DONE on this host. */
  hasCompletedRun: boolean;
}

const SOURCES: DataSourceId[] = ['calendar', 'gmail', 'notion', 'telegram'];
const BROWSER_SITE: Record<DataSourceId, string> = {
  calendar: 'Google Calendar',
  gmail: 'Gmail',
  notion: 'Notion',
  telegram: 'Telegram Web',
};

/** Best mode per source right now. Order: real API connection, the user's own logged-in Chrome, sample data, off. */
export function resolveDataSources(i: {
  connected: Record<DataSourceId, boolean>;
  sample: Record<DataSourceId, boolean>;
  browser: BrowserAvailability;
}): DataSourceStatus[] {
  const browserUsable = i.browser.wired && i.browser.driver !== 'none';
  return SOURCES.map((source): DataSourceStatus => {
    if (i.connected[source]) {
      return { source, mode: 'api', probed: false, evidence: 'Credentials are saved on this computer. Not live-tested by this profile.' };
    }
    if (browserUsable) {
      return {
        source,
        mode: 'browser',
        probed: i.browser.hasCompletedRun,
        evidence: i.browser.hasCompletedRun
          ? `Browser agent finished a task on this computer. Whether ${BROWSER_SITE[source]} is signed in there is not verified.`
          : `Chrome driver is available (${i.browser.driver}), no browser task has finished yet. ${BROWSER_SITE[source]} sign-in is not verified.`,
      };
    }
    if (i.sample[source]) {
      return { source, mode: 'sample', probed: false, evidence: 'Built-in sample data. Connect it, or let the browser agent use your own Chrome.' };
    }
    return { source, mode: 'off', probed: false, evidence: 'No connection, no browser driver, no sample data.' };
  });
}

/**
 * Applies the owner's per-source setting on top of the automatic resolution.
 * auto = whatever resolveDataSources picked. api = API only. computer = the owner's own Chrome only.
 * A pinned route that is not usable is reported 'off' with a reason; it never falls back to the other route.
 */
export function applySourceModes(
  auto: DataSourceStatus[],
  settings: Record<DataSourceId, SourceSetting>,
  i: { connected: Record<DataSourceId, boolean>; browser: BrowserAvailability },
): Array<Pick<SourceRow, 'source' | 'mode' | 'effective' | 'reason' | 'probed' | 'evidence'>> {
  const browserUsable = i.browser.wired && i.browser.driver !== 'none';
  return auto.map((a) => {
    const mode = settings[a.source];
    if (mode === 'auto') return { source: a.source, mode, effective: a.mode, reason: null, probed: a.probed, evidence: a.evidence };
    if (mode === 'api') {
      return i.connected[a.source]
        ? { source: a.source, mode, effective: 'api' as const, reason: null, probed: false, evidence: 'Pinned to the API. Credentials are saved on this computer. Not live-tested by this profile.' }
        : { source: a.source, mode, effective: 'off' as const, reason: `API not connected for ${a.source}. Connect it or switch to auto or computer. No fallback.`, probed: false, evidence: 'Pinned to the API, which is not connected.' };
    }
    return browserUsable
      ? { source: a.source, mode, effective: 'browser' as const, reason: null, probed: i.browser.hasCompletedRun, evidence: `Pinned to your own Chrome (${i.browser.driver}). ${BROWSER_SITE[a.source]} sign-in is not verified.` }
      : { source: a.source, mode, effective: 'off' as const, reason: 'Browser driver not ready (no Chrome with Playwright, no injected driver). No fallback.', probed: false, evidence: 'Pinned to your own Chrome, which is not ready.' };
  });
}

export interface ChromeProbeDeps {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  exists: (p: string) => boolean;
}

/** Looks for an installed Google Chrome at its standard locations. File presence only, nothing is launched. */
export function detectChrome(deps: ChromeProbeDeps): boolean {
  const e = deps.env;
  const candidates: string[] =
    deps.platform === 'win32'
      ? [e.PROGRAMFILES, e['PROGRAMFILES(X86)'], e.LOCALAPPDATA]
          .filter((b): b is string => Boolean(b))
          .map((b) => `${b}\\Google\\Chrome\\Application\\chrome.exe`)
      : deps.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.some((p) => {
    try {
      return deps.exists(p);
    } catch {
      return false;
    }
  });
}

export const UNIFIED_COMMANDS: ReadonlyArray<{ command: string; usage: string }> = [
  { command: '/status', usage: '/status' },
  { command: '/apps', usage: '/apps' },
  { command: '/inference', usage: '/inference <computer|api|auto>' },
  { command: '/use', usage: '/use <app>' },
  { command: '/calendar', usage: '/calendar' },
  { command: '/inbox', usage: '/inbox' },
  { command: '/browse', usage: '/browse <goal>' },
  { command: '/research', usage: '/research <q>' },
  { command: '/jobs', usage: '/jobs' },
  { command: '/code', usage: '/code' },
  { command: '/project', usage: '/project <goal>' },
  { command: '/music', usage: '/music [mood|query]' },
  { command: '/focus', usage: '/focus [mins]' },
  { command: '/task', usage: '/task <desc>' },
  { command: '/ask', usage: '/ask <q>' },
  { command: '/approve', usage: '/approve <id>' },
  { command: '/reject', usage: '/reject <id>' },
  { command: '/pause', usage: '/pause [routine|all]' },
  { command: '/resume', usage: '/resume [routine|all]' },
  { command: '/settings', usage: '/settings' },
];

export interface HostProfileInput {
  hostname: string;
  platform: string;
  uptimeSec: number;
  revision: number;
  locked: boolean;
  scan: ProviderScanResult | null;
  routing: {
    inferenceMode: InferenceMode;
    preferredLlm: string;
    preferredModel: string | null;
    active: { id: string; model: string | null; label: string };
  };
  agents: Array<{ id: string; name: string; maxAutonomy: string }>;
  skills: Array<{ id: string; name: string; triggerCommand: string; approvalRule: string }>;
  browser: BrowserAvailability;
  connectors: { telegram: boolean; notion: boolean; google: boolean; assemblyai: boolean; openrouter: boolean };
  dataSources: SourceRow[];
  metrics: { p50Ms: number | null; p95Ms: number | null; inFlight: number; steps: MetricStep[]; tokensEstimated: boolean };
  devices: PublicDevice[];
}

const KIND_LABEL: Record<ScannedProvider['kind'], 'cli' | 'server' | 'api'> = {
  local_cli: 'cli',
  local_server: 'server',
  api_key: 'api',
};
const MODEL_LIST_CAP = 12;

/** Average LLM tokens over the distinct task ids seen; null when no step carries a task id (never guessed). */
export function tokensPerTask(steps: MetricStep[]): number | null {
  const byTask = new Map<string, number>();
  for (const s of steps) {
    if (s.kind !== 'llm' || s.taskId === null) continue;
    byTask.set(s.taskId, (byTask.get(s.taskId) ?? 0) + (s.inputTokens ?? 0) + (s.outputTokens ?? 0));
  }
  if (byTask.size === 0) return null;
  return Math.round([...byTask.values()].reduce((a, b) => a + b, 0) / byTask.size);
}

export function buildHostProfile(i: HostProfileInput) {
  return {
    host: { name: i.hostname, platform: i.platform, uptimeSec: i.uptimeSec },
    revision: i.revision,
    locked: i.locked,
    harnesses: {
      scannedAt: i.scan?.scannedAt ?? null,
      items: (i.scan?.providers ?? []).map((p) => ({
        id: p.id,
        kind: KIND_LABEL[p.kind],
        status: p.state,
        models: p.models.slice(0, MODEL_LIST_CAP).map((m) => m.id),
        modelCount: p.models.length,
        lastProbeMs: p.probeMs ?? null,
      })),
    },
    routing: i.routing,
    tools: {
      commands: UNIFIED_COMMANDS,
      agents: i.agents,
      browserAgent: { available: i.browser.wired && i.browser.driver !== 'none', driver: i.browser.driver },
    },
    skills: i.skills,
    connectors: i.connectors,
    dataSources: i.dataSources,
    metrics: {
      p50Ms: i.metrics.p50Ms,
      p95Ms: i.metrics.p95Ms,
      tokensPerTask: tokensPerTask(i.metrics.steps),
      tokensEstimated: i.metrics.tokensEstimated,
      inFlight: i.metrics.inFlight,
    },
    devices: i.devices,
  };
}
export type HostProfile = ReturnType<typeof buildHostProfile>;

/** Stable per-section digests. Volatile fields (uptime, metrics, device lastSeen, revision itself) are left out. */
export function profileSections(p: HostProfile): Record<string, string> {
  const h = (v: unknown) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16);
  return {
    harnesses: h(p.harnesses),
    routing: h(p.routing),
    tools: h(p.tools),
    skills: h(p.skills),
    connectors: h(p.connectors),
    // Volatile fields (p50Ms, lastSyncAt, stale) stay out of the digest; mode, route and breaker state are real changes.
    dataSources: h(p.dataSources.map((d) => [d.source, d.mode, d.effective, d.reason, d.probed, d.evidence, d.breaker])),
    devices: h(p.devices.map((d) => [d.id, d.label])),
    killSwitch: h(p.locked),
  };
}
