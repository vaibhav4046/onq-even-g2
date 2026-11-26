import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { runCliPrompt } from '../harness/cliRunner.js';

const execFileAsync = promisify(execFile);
import {
  cliArgs,
  OPENROUTER_FREE_FALLBACK_MODELS,
  type LocalProviderId,
  type LocalProviderRuntime,
} from '../harness/modelRouter.js';

export type ProviderKind = 'local_cli' | 'local_server' | 'api_key';
/**
 * connected    = proven: a local CLI answered a real test prompt, a server listed models, or a key is saved.
 * needs_check  = files found but nothing proved it works (probe timed out, or OnQ cannot test it).
 */
export type ProviderState = 'connected' | 'needs_auth' | 'needs_check' | 'not_installed' | 'error';

export interface ScannedModel {
  id: string;
  name: string;
  free?: boolean;
  local?: boolean;
  reasoning?: boolean;
}

export interface ScannedProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  state: ProviderState;
  /** True when OnQ can route drafts through it (select-model accepts it). */
  selectable: boolean;
  defaultModel: string | null;
  models: ScannedModel[];
  detail: string;
  fixHint: string;
  /** Duration of the real health probe (CLI test prompt or server model list) in ms. Absent when nothing was probed. */
  probeMs?: number;
  /** Server-side only (binary path / local URL). Stripped by publicProviders() before anything reaches the browser. */
  runtime?: { binaryPath?: string; baseUrl?: string };
}

export interface ProviderScanResult {
  scannedAt: string;
  providers: ScannedProvider[];
}

/** Presence-only inputs: values are used for the OpenRouter/OmniRoute probes and never copied into the result. */
export interface ScanKeys {
  openRouterKey?: string;
  anthropicKey?: string;
  openAiKey?: string;
  xaiKey?: string;
  omniRouteUrl?: string;
  omniRouteKey?: string;
  assemblyAiKey?: string;
}

export interface ScannerDeps {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  homedir: string;
  exists: (p: string) => boolean;
  fetchImpl: typeof fetch;
  serverTimeoutMs: number;
  openRouterTimeoutMs: number;
  /** Asks a signed-in CLI a trivial question. Injected in tests; the default really runs the CLI. */
  probeCli: CliProbe;
  cliProbeTimeoutMs: number;
}

export type CliProbeResult = { ok: true; ms: number } | { ok: false; timedOut: boolean; reason: string };
export type CliProbe = (id: LocalProviderId, binaryPath: string, timeoutMs: number) => Promise<CliProbeResult>;

/** Real health check: send "reply OK" through the same arguments the router uses, bounded by a timeout. */
export const probeCliWithPrompt: CliProbe = async (id, binaryPath, timeoutMs) => {
  const t0 = Date.now();
  try {
    const out = await runCliPrompt(binaryPath, cliArgs(id, 'default'), 'Reply with the single word OK.', timeoutMs);
    // eslint-disable-next-line no-control-regex
    if (!out.replace(/\x1b\[[0-9;]*m/g, '').trim()) return { ok: false, timedOut: false, reason: 'It exited cleanly but returned no answer' };
    return { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed';
    return { ok: false, timedOut: /timed out/i.test(msg), reason: msg.replace(/\s+/g, ' ').slice(0, 140) };
  }
};

const SUBSCRIPTION_NOTE = 'Uses your local subscription, no API key needed';

interface CliSpec {
  id: string;
  name: string;
  binaries: string[];
  /** Created by the CLI on first sign-in. ponytail: dir presence is a sign-in heuristic; running the CLI to check costs ~10s. */
  configDirs: string[];
  install: string;
  login: string;
  routable: boolean;
  defaultModel: string;
  models: ScannedModel[];
}

const DEFAULT_MODEL: ScannedModel = { id: 'default', name: 'Your CLI default model' };

const CLI_SPECS: CliSpec[] = [
  {
    id: 'claude_cli',
    name: 'Claude Code CLI',
    binaries: ['claude'],
    configDirs: ['.claude'],
    install: 'Install: npm i -g @anthropic-ai/claude-code',
    login: 'Run `claude` once and sign in with your Claude account',
    routable: true,
    defaultModel: 'haiku',
    models: [
      { id: 'haiku', name: 'Claude Haiku (fastest)' },
      { id: 'sonnet', name: 'Claude Sonnet', reasoning: true },
      { id: 'opus', name: 'Claude Opus', reasoning: true },
    ],
  },
  {
    id: 'opencode_cli',
    name: 'OpenCode CLI',
    binaries: ['opencode'],
    configDirs: ['.local/share/opencode', '.config/opencode'],
    install: 'Install: npm i -g opencode-ai',
    login: 'Run: opencode auth login',
    routable: true,
    defaultModel: 'default',
    models: [DEFAULT_MODEL, { id: 'opencode/grok-code', name: 'Grok Code (OpenCode Zen, free)', free: true }],
  },
  {
    id: 'codex_cli',
    name: 'OpenAI Codex CLI',
    binaries: ['codex'],
    configDirs: ['.codex'],
    install: 'Install: npm i -g @openai/codex',
    login: 'Run: codex login',
    routable: true,
    defaultModel: 'default',
    models: [DEFAULT_MODEL, { id: 'gpt-5-codex', name: 'GPT-5 Codex', reasoning: true }, { id: 'gpt-5', name: 'GPT-5', reasoning: true }],
  },
  {
    id: 'gemini_cli',
    name: 'Gemini CLI',
    binaries: ['gemini'],
    configDirs: ['.gemini'],
    install: 'Install: npm i -g @google/gemini-cli',
    login: 'Run `gemini` once and sign in with Google',
    routable: true,
    defaultModel: 'gemini-2.5-flash',
    models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }, { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', reasoning: true }],
  },
  {
    id: 'cursor_cli',
    name: 'Cursor Agent CLI',
    binaries: ['cursor-agent'],
    configDirs: ['.cursor'],
    install: 'Install the Cursor Agent CLI from cursor.com/cli',
    login: 'Run: cursor-agent login',
    routable: false,
    defaultModel: 'auto',
    models: [{ id: 'auto', name: 'Cursor auto' }],
  },
  {
    id: 'cline_cli',
    name: 'Cline CLI',
    binaries: ['cline'],
    configDirs: ['.cline'],
    install: 'Install: npm i -g cline',
    login: 'Run `cline` once and sign in',
    routable: false,
    defaultModel: 'default',
    models: [DEFAULT_MODEL],
  },
  {
    id: 'hermes_cli',
    name: 'Hermes CLI',
    binaries: ['hermes'],
    configDirs: ['.hermes'],
    install: 'Install the Hermes agent CLI',
    login: 'Run `hermes` once and finish setup',
    routable: false,
    defaultModel: 'default',
    models: [DEFAULT_MODEL],
  },
  {
    id: 'openclaw_cli',
    name: 'OpenClaw CLI',
    binaries: ['openclaw'],
    configDirs: ['.openclaw'],
    install: 'Install: npm i -g openclaw',
    login: 'Run `openclaw` once to complete setup',
    routable: false,
    defaultModel: 'default',
    models: [DEFAULT_MODEL],
  },
];

function pathApi(platform: NodeJS.Platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

/** PATH plus the standard per-user / Homebrew / Windows desktop AI install dirs, so CLIs are found even outside PATH. */
export function binarySearchDirs(deps: Pick<ScannerDeps, 'env' | 'platform' | 'homedir'>): string[] {
  const p = pathApi(deps.platform);
  const envPath = deps.env.PATH ?? deps.env.Path ?? '';
  const home = deps.env.USERPROFILE ?? deps.env.HOME ?? deps.homedir;
  const localApp = deps.env.LOCALAPPDATA ?? (deps.platform === 'win32' ? p.join(home, 'AppData', 'Local') : undefined);
  const extra =
    deps.platform === 'win32'
      ? [
          deps.env.APPDATA && p.join(deps.env.APPDATA, 'npm'),
          localApp && p.join(localApp, 'Programs'),
          localApp && p.join(localApp, 'Programs', 'Ollama'),
          localApp && p.join(localApp, 'OpenAI', 'Codex', 'bin'),
          localApp && p.join(localApp, 'cursor-agent'),
          p.join(home, '.cursor', 'bin'),
          p.join(home, '.local', 'bin'),
          p.join(home, '.claude', 'local'),
          p.join(home, '.opencode', 'bin'),
        ]
      : [p.join(home, '.local', 'bin'), p.join(home, '.claude', 'local'), p.join(home, '.opencode', 'bin'), '/usr/local/bin', '/opt/homebrew/bin'];
  const dirs = [...envPath.split(deps.platform === 'win32' ? ';' : ':'), ...extra].filter((d): d is string => Boolean(d));
  return [...new Set(dirs)];
}

export function findCliBinary(names: string[], deps: Pick<ScannerDeps, 'env' | 'platform' | 'homedir' | 'exists'>): string | null {
  const p = pathApi(deps.platform);
  const exts = deps.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
  const dirs = binarySearchDirs(deps);
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = p.join(dir, `${name}${ext}`);
        if (deps.exists(candidate)) return candidate;
      }
    }
  }
  return null;
}

async function scanCli(spec: CliSpec, deps: ScannerDeps): Promise<ScannedProvider> {
  const base = { id: spec.id, name: spec.name, kind: 'local_cli' as const, defaultModel: spec.defaultModel, models: spec.models };
  const binaryPath = findCliBinary(spec.binaries, deps);
  if (!binaryPath) {
    return { ...base, state: 'not_installed', selectable: false, detail: 'Not found on this PC', fixHint: spec.install };
  }
  const home = deps.env.USERPROFILE ?? deps.env.HOME ?? deps.homedir;
  const signedIn = spec.configDirs.some((d) => deps.exists(pathApi(deps.platform).join(home, d)));
  if (!signedIn) {
    return { ...base, state: 'needs_auth', selectable: false, detail: 'Installed, not signed in yet', fixHint: spec.login, runtime: { binaryPath } };
  }
  if (!spec.routable) {
    // Files exist, but OnQ has no safe way to ask this CLI a question, so there is no proof it works.
    return {
      ...base,
      state: 'needs_check',
      selectable: false,
      detail: 'Detected on this PC, but OnQ cannot test it or route drafts through it yet',
      fixHint: 'Pick Claude Code, OpenCode, Codex or Gemini CLI to route drafts locally',
      runtime: { binaryPath },
    };
  }
  const probe = await deps.probeCli(spec.id as LocalProviderId, binaryPath, deps.cliProbeTimeoutMs);
  if (probe.ok) {
    return {
      ...base,
      state: 'connected',
      selectable: true,
      detail: `${SUBSCRIPTION_NOTE}. Answered a test prompt in ${(probe.ms / 1000).toFixed(1)}s`,
      fixHint: '',
      probeMs: probe.ms,
      runtime: { binaryPath },
    };
  }
  const secs = Math.round(deps.cliProbeTimeoutMs / 1000);
  return probe.timedOut
    ? {
        ...base,
        state: 'needs_check',
        selectable: false,
        detail: `Installed and signed in, but it did not answer a test prompt within ${secs}s`,
        fixHint: `Run \`${spec.binaries[0]}\` once in a terminal to see what it needs, then Rescan`,
        runtime: { binaryPath },
      }
    : {
        ...base,
        state: 'error',
        selectable: false,
        detail: `Installed and signed in, but the test prompt failed: ${probe.reason}`,
        fixHint: `Run \`${spec.binaries[0]}\` once in a terminal to see the error, fix it, then Rescan`,
        runtime: { binaryPath },
      };
}

async function getJson(
  deps: ScannerDeps,
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<{ ok: true; json: unknown } | { ok: false; status?: number }> {
  try {
    const res = await deps.fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false };
  }
}

interface ServerSpec {
  id: 'ollama' | 'lmstudio' | 'omniroute';
  name: string;
  baseUrl: string;
  listUrl: string;
  binary: string;
  install: string;
  start: string;
  headers?: Record<string, string>;
  parse: (json: unknown) => string[];
}

const parseOpenAiModels = (json: unknown) =>
  ((json as { data?: Array<{ id?: string }> })?.data ?? []).map((m) => m.id ?? '').filter(Boolean);

async function scanServer(spec: ServerSpec, deps: ScannerDeps): Promise<ScannedProvider> {
  const base = { id: spec.id, name: spec.name, kind: 'local_server' as const };
  const t0 = Date.now();
  const probe = await getJson(deps, spec.listUrl, deps.serverTimeoutMs, spec.headers);
  const probeMs = Date.now() - t0;
  if (!probe.ok) {
    if (probe.status === 401 || probe.status === 403) {
      return { ...base, state: 'needs_auth', selectable: false, defaultModel: null, models: [], detail: 'Running, but it wants an API key', fixHint: 'Add your OmniRoute API key in Connect' };
    }
    const installed = Boolean(findCliBinary([spec.binary], deps));
    return installed
      ? { ...base, state: 'error', selectable: false, defaultModel: null, models: [], detail: `Installed but not running (${spec.baseUrl})`, fixHint: spec.start }
      : { ...base, state: 'not_installed', selectable: false, defaultModel: null, models: [], detail: `Not running on ${spec.baseUrl}`, fixHint: spec.install };
  }
  const ids = spec.parse(probe.json);
  const models = ids.map((id) => ({ id, name: id, local: true }));
  if (models.length === 0) {
    return { ...base, state: 'error', selectable: false, defaultModel: null, models, detail: 'Running, but no models are loaded', fixHint: spec.id === 'ollama' ? 'Run: ollama pull llama3.2' : 'Load a model, then rescan' };
  }
  return {
    ...base,
    state: 'connected',
    selectable: true,
    defaultModel: models[0].id,
    models,
    detail: `Running on ${spec.baseUrl} with ${models.length} model(s), no cloud key needed`,
    fixHint: '',
    probeMs,
    runtime: { baseUrl: spec.baseUrl },
  };
}

function omniRouteBase(keys: ScanKeys, env: NodeJS.ProcessEnv): string {
  const raw = (keys.omniRouteUrl ?? env.OMNIROUTE_URL ?? env.OMNIROUTE_BASE_URL ?? 'http://127.0.0.1:20128/v1').replace(/\/+$/, '');
  return /\/v1$/.test(raw) ? raw : `${raw}/v1`;
}

const CURATED_OPENROUTER: ScannedModel[] = [
  ...OPENROUTER_FREE_FALLBACK_MODELS.map((id) => ({ id, name: id === 'openrouter/free' ? 'OpenRouter free router' : id, free: true })),
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' },
];
// ponytail: cap the live OpenRouter list (free first); the full catalog is ~350 models, search UI can come later.
const OPENROUTER_LIST_CAP = 80;

async function openRouterModels(deps: ScannerDeps): Promise<{ models: ScannedModel[]; live: boolean }> {
  // Public endpoint: the key is never sent here.
  const probe = await getJson(deps, 'https://openrouter.ai/api/v1/models', deps.openRouterTimeoutMs);
  if (!probe.ok) return { models: CURATED_OPENROUTER, live: false };
  const data = (probe.json as { data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }> })?.data ?? [];
  const live = data
    .filter((m) => m.id)
    .map((m) => ({
      id: m.id as string,
      name: m.name ?? (m.id as string),
      free: (m.id as string).endsWith(':free') || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0),
      reasoning: m.supported_parameters?.includes('reasoning') || undefined,
    }))
    .sort((a, b) => Number(b.free) - Number(a.free));
  if (live.length === 0) return { models: CURATED_OPENROUTER, live: false };
  const withRouter = live.some((m) => m.id === 'openrouter/free') ? live : [CURATED_OPENROUTER[0], ...live];
  return { models: withRouter.slice(0, OPENROUTER_LIST_CAP), live: true };
}

function apiProvider(
  id: string,
  name: string,
  hasKey: boolean,
  defaultModel: string,
  models: ScannedModel[],
  keyHint: string,
  selectable = true,
): ScannedProvider {
  return {
    id,
    name,
    kind: 'api_key',
    state: hasKey ? 'connected' : 'needs_auth',
    selectable: hasKey && selectable,
    defaultModel,
    models,
    detail: hasKey ? 'API key saved in the encrypted vault' : 'No API key saved',
    fixHint: hasKey ? '' : keyHint,
  };
}

function resolveDeps(partial: Partial<ScannerDeps>): ScannerDeps {
  return {
    env: partial.env ?? process.env,
    platform: partial.platform ?? process.platform,
    homedir: partial.homedir ?? os.homedir(),
    exists: partial.exists ?? ((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }),
    fetchImpl: partial.fetchImpl ?? fetch,
    serverTimeoutMs: partial.serverTimeoutMs ?? 800,
    openRouterTimeoutMs: partial.openRouterTimeoutMs ?? 2500,
    probeCli: partial.probeCli ?? probeCliWithPrompt,
    cliProbeTimeoutMs: partial.cliProbeTimeoutMs ?? 25_000,
  };
}

function buildLocalServerSpecs(keys: ScanKeys, env: NodeJS.ProcessEnv): ServerSpec[] {
  const omniBase = omniRouteBase(keys, env);
  return [
    {
      id: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      listUrl: 'http://127.0.0.1:11434/api/tags',
      binary: 'ollama',
      install: 'Install Ollama from ollama.com, then: ollama pull llama3.2',
      start: 'Start Ollama (open the app or run: ollama serve)',
      parse: (json) => ((json as { models?: Array<{ name?: string }> })?.models ?? []).map((m) => m.name ?? '').filter(Boolean),
    },
    {
      id: 'lmstudio',
      name: 'LM Studio',
      baseUrl: 'http://127.0.0.1:1234/v1',
      listUrl: 'http://127.0.0.1:1234/v1/models',
      binary: 'lms',
      install: 'Install LM Studio, load a model, and start its local server (port 1234)',
      start: 'Run: lms server start',
      parse: parseOpenAiModels,
    },
    {
      id: 'omniroute',
      name: 'OmniRoute',
      baseUrl: omniBase,
      listUrl: `${omniBase}/models`,
      binary: 'omniroute',
      install: 'Install: npm i -g omniroute, then run: omniroute',
      start: 'Run: omniroute',
      headers: keys.omniRouteKey ? { Authorization: `Bearer ${keys.omniRouteKey}` } : {},
      parse: parseOpenAiModels,
    },
  ];
}

async function scanOpenBot(deps: ScannerDeps): Promise<ScannedProvider> {
  const base = { id: 'openbot', name: 'OpenBot Desktop', kind: 'local_server' as const };
  const p = pathApi(deps.platform);
  const home = deps.env.USERPROFILE ?? deps.env.HOME ?? deps.homedir;
  const localApp = deps.env.LOCALAPPDATA ?? (deps.platform === 'win32' ? p.join(home, 'AppData', 'Local') : undefined);
  const cliPath = localApp ? p.join(localApp, 'Programs', 'OpenBot', 'resources', 'cli', 'openbot-cli.mjs') : '';
  if (!cliPath || !deps.exists(cliPath)) {
    return {
      ...base,
      state: 'not_installed',
      selectable: false,
      defaultModel: null,
      models: [],
      detail: 'OpenBot desktop not installed',
      fixHint: 'Install OpenBot desktop and turn on Local scripts for your agent',
    };
  }
  const t0 = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, 'list', '--json'], {
      timeout: Math.max(1500, deps.serverTimeoutMs),
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    const probeMs = Date.now() - t0;
    const raw = (stdout || stderr || '').trim();
    const parsed = JSON.parse(raw) as { ok?: boolean; agents?: Array<{ id?: string; name?: string }>; error?: string };
    const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
    if (parsed.ok && agents.length > 0) {
      const models = agents.map((a) => ({ id: a.id ?? a.name ?? 'agent', name: a.name ?? a.id ?? 'OpenBot agent', local: true }));
      return {
        ...base,
        state: 'connected',
        selectable: false,
        defaultModel: models[0].id,
        models,
        detail: `OpenBot running locally with ${models.length} agent(s)`,
        fixHint: '',
        probeMs,
      };
    }
    return {
      ...base,
      state: 'error',
      selectable: false,
      defaultModel: null,
      models: [],
      detail: 'Installed, but OpenBot is closed or no agent has Local scripts on',
      fixHint: 'Open OpenBot desktop and enable Local scripts for an agent, then Rescan',
      probeMs,
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    const raw = `${e.stdout ?? ''} ${e.stderr ?? ''}`;
    const notRunning = /not running|local scripts|exitCode":5/i.test(raw);
    return {
      ...base,
      state: 'error',
      selectable: false,
      defaultModel: null,
      models: [],
      detail: notRunning ? 'Installed, not running (or Local scripts off)' : 'Installed, local status check failed',
      fixHint: 'Open OpenBot desktop and turn on Local scripts for at least one agent',
      probeMs: Date.now() - t0,
    };
  }
}

/** One full scan of local CLIs, local model servers and saved API keys. All I/O comes from deps. */
export async function scanProviders(keys: ScanKeys, partialDeps: Partial<ScannerDeps> = {}): Promise<ProviderScanResult> {
  const deps = resolveDeps(partialDeps);
  const servers = buildLocalServerSpecs(keys, deps.env);

  const [cliResults, serverResults, openBotResult, orModels] = await Promise.all([
    Promise.all(CLI_SPECS.map((spec) => scanCli(spec, deps))),
    Promise.all(servers.map((s) => scanServer(s, deps))),
    scanOpenBot(deps),
    keys.openRouterKey ? openRouterModels(deps) : Promise.resolve({ models: CURATED_OPENROUTER, live: false }),
  ]);

  const openrouter = apiProvider('openrouter', 'OpenRouter', Boolean(keys.openRouterKey), 'openrouter/free', orModels.models, 'Add an OpenRouter key in Connect (free models available)');
  if (keys.openRouterKey) openrouter.detail += orModels.live ? `, ${orModels.models.length} live models` : ', curated model list (live list unreachable)';

  const providers: ScannedProvider[] = [
    ...cliResults,
    ...serverResults,
    openBotResult,
    openrouter,
    apiProvider('claude', 'Claude API', Boolean(keys.anthropicKey), 'claude-3-5-haiku-latest', [
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', reasoning: true },
    ], 'Add an Anthropic API key in Connect'),
    apiProvider('chatgpt', 'ChatGPT API', Boolean(keys.openAiKey), 'gpt-4o-mini', [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' },
      { id: 'gpt-5-mini', name: 'GPT-5 mini', reasoning: true },
    ], 'Add an OpenAI API key in Connect'),
    apiProvider('grok', 'Grok (xAI)', Boolean(keys.xaiKey), 'grok-3-mini', [
      { id: 'grok-3-mini', name: 'Grok 3 mini', reasoning: true },
      { id: 'grok-4', name: 'Grok 4', reasoning: true },
    ], 'Add an xAI key in Connect'),
    apiProvider('assemblyai', 'AssemblyAI (voice)', Boolean(keys.assemblyAiKey), 'universal-streaming', [
      { id: 'universal-streaming', name: 'Universal Streaming speech-to-text' },
    ], 'Add an AssemblyAI key in Connect for live voice', false),
  ];

  return { scannedAt: new Date().toISOString(), providers };
}

/** What the browser may see: no binary paths, no URLs from runtime, never any key. */
export function publicProviders(providers: ScannedProvider[]): Omit<ScannedProvider, 'runtime'>[] {
  return providers.map(({ runtime: _runtime, ...rest }) => rest);
}

const LOCAL_ROUTABLE = new Set<string>(['claude_cli', 'opencode_cli', 'codex_cli', 'gemini_cli', 'ollama', 'lmstudio']);
const SCAN_TTL_MS = 10 * 60_000;
const PROBE_OK_TTL_MS = 60 * 60_000;
const PROBE_FAIL_TTL_MS = 5 * 60_000;

/** Cached scanner shared by the server: endpoints read/refresh it, the router reads routable() synchronously. */
export class ProviderScanner {
  private last: ProviderScanResult | null = null;
  private lastAtMs = 0;
  private inflight: Promise<ProviderScanResult> | null = null;
  private forceProbe = false;
  private readonly probeCache = new Map<string, { atMs: number; result: CliProbeResult }>();

  constructor(
    private readonly getKeys: () => ScanKeys,
    private readonly deps: Partial<ScannerDeps> = {},
    /** Called after every finished scan (including background refreshes) so the host can bump its revision. */
    private readonly onScanned?: () => void,
  ) {}

  async scan(force = false): Promise<ProviderScanResult> {
    if (!force && this.last && Date.now() - this.lastAtMs < SCAN_TTL_MS) return this.last;
    if (this.inflight) return this.inflight;
    this.forceProbe = force;
    this.inflight = scanProviders(this.getKeys(), { ...this.deps, probeCli: this.cachedProbe })
      .then((result) => {
        this.last = result;
        this.lastAtMs = Date.now();
        try {
          this.onScanned?.();
        } catch {
          // a listener must never break a scan
        }
        return result;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /**
   * Each probe is a real (tiny) request on the owner's subscription, so a passing answer is reused for an hour and a
   * failure for 5 minutes. An explicit rescan (force) always asks again.
   */
  private readonly cachedProbe: CliProbe = async (id, binaryPath, timeoutMs) => {
    const key = `${id}|${binaryPath}`;
    const hit = this.probeCache.get(key);
    if (hit && !this.forceProbe && Date.now() - hit.atMs < (hit.result.ok ? PROBE_OK_TTL_MS : PROBE_FAIL_TTL_MS)) return hit.result;
    const result = await (this.deps.probeCli ?? probeCliWithPrompt)(id, binaryPath, timeoutMs);
    this.probeCache.set(key, { atMs: Date.now(), result });
    return result;
  };

  /** Last scan without ever starting one (no I/O). */
  peek(): ProviderScanResult | null {
    return this.last;
  }

  /** Last scan, or null before the first one finishes. Starts a background refresh when stale. */
  cached(): ProviderScanResult | null {
    if (!this.inflight && (!this.last || Date.now() - this.lastAtMs >= SCAN_TTL_MS)) void this.scan().catch(() => undefined);
    return this.last;
  }

  /** Fast auto-sync pass for local HTTP servers + OpenBot desktop (zero paid CLI quota used). */
  async refreshLocalServers(): Promise<boolean> {
    if (this.inflight || !this.last) return false;
    const deps = resolveDeps(this.deps);
    const keys = this.getKeys();
    const servers = buildLocalServerSpecs(keys, deps.env);
    const [serverResults, openBotResult] = await Promise.all([
      Promise.all(servers.map((s) => scanServer(s, deps))),
      scanOpenBot(deps),
    ]);
    const updates = new Map([...serverResults, openBotResult].map((p) => [p.id, p]));
    let changed = false;
    const nextProviders = this.last.providers.map((prev) => {
      const next = updates.get(prev.id);
      if (!next) return prev;
      const same =
        prev.state === next.state &&
        prev.selectable === next.selectable &&
        prev.models.map((m) => m.id).join(',') === next.models.map((m) => m.id).join(',');
      if (!same) changed = true;
      return next;
    });
    if (!changed) return false;
    this.last = { scannedAt: new Date().toISOString(), providers: nextProviders };
    this.lastAtMs = Date.now();
    try {
      this.onScanned?.();
    } catch {
      // listener errors never break refresh
    }
    return true;
  }

  /** Connected local CLIs / servers the router can run, with the model picked per provider. */
  routable(): LocalProviderRuntime[] {
    return (this.cached()?.providers ?? [])
      .filter((p) => p.state === 'connected' && LOCAL_ROUTABLE.has(p.id) && p.runtime)
      .map((p) => ({
        id: p.id as LocalProviderId,
        binaryPath: p.runtime?.binaryPath,
        baseUrl: p.runtime?.baseUrl,
        model: p.defaultModel ?? undefined,
      }));
  }

  /** OmniRoute base URL when it was found running (used only if none is configured). */
  detectedOmniRouteUrl(): string | undefined {
    const om = this.last?.providers.find((p) => p.id === 'omniroute' && p.state === 'connected');
    return om?.runtime?.baseUrl;
  }
}
