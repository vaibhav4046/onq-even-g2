import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { InferenceMode } from './modelRouter.js';
import {
  findCliBinary,
  publicProviders,
  type ProviderScanResult,
  type ScannerDeps,
} from '../providers/providerScanner.js';

export type PowerSourceTier = 'HOSTED_READY' | 'HOSTED_STANDBY' | 'CLOUD_OPTIONAL';

export interface PowerSourceApp {
  id: string;
  name: string;
  kind: 'local_cli' | 'local_server' | 'api_key';
  tier: PowerSourceTier;
  status: string;
  selectable: boolean;
  wakeable: boolean;
  models: string[];
  defaultModel: string | null;
  detail: string;
  fixHint: string;
}

export interface LocalMcpServerRef {
  source: 'antigravity' | 'claude' | 'codex' | 'hermes';
  name: string;
}

export interface PcPowerSourceSnapshot {
  scannedAt: string | null;
  hostname: string;
  platform: string;
  inferenceMode: InferenceMode;
  active: { id: string; label: string; model: string | null };
  counts: {
    hostedReady: number;
    hostedStandby: number;
    cloudOptional: number;
    mcpServers: number;
    openBotAgents: number;
  };
  hostedReady: PowerSourceApp[];
  hostedStandby: PowerSourceApp[];
  cloudOptional: PowerSourceApp[];
  mcpServers: LocalMcpServerRef[];
  openBotAgents: Array<{ id: string; name: string }>;
  honestBoundary: string;
}

export const HONEST_HARDWARE_BOUNDARY =
  'OnQ connects to real local servers, CLIs, OpenBot agents, and MCP tools on your PC plus optional cloud APIs. It never scrapes private closed GUI windows (ChatGPT Desktop or Claude Desktop Store apps).';

const WAKEABLE_IDS = new Set(['ollama', 'omniroute']);

export interface McpDiscoveryDeps {
  homedir: string;
  exists: (p: string) => boolean;
  readText: (p: string) => string;
}

const defaultMcpDeps = (): McpDiscoveryDeps => ({
  homedir: os.homedir(),
  exists: (p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  },
  readText: (p) => fs.readFileSync(p, 'utf8'),
});

/**
 * Reads ONLY MCP server names from local developer tool configs (never keys, env vars, commands, or URLs).
 */
export function discoverLocalMcpServers(partial?: Partial<McpDiscoveryDeps>): LocalMcpServerRef[] {
  const deps: McpDiscoveryDeps = { ...defaultMcpDeps(), ...partial };
  const found: LocalMcpServerRef[] = [];
  const seen = new Set<string>();
  const add = (source: LocalMcpServerRef['source'], rawName: string) => {
    const name = rawName.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 48);
    if (!name) return;
    const key = `${source}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ source, name });
  };

  const jsonConfigs: Array<{ source: 'antigravity' | 'claude'; file: string }> = [
    { source: 'antigravity', file: path.join(deps.homedir, '.gemini', 'antigravity', 'mcp_config.json') },
    { source: 'claude', file: path.join(deps.homedir, '.claude.json') },
    { source: 'claude', file: path.join(deps.homedir, '.claude', 'settings.json') },
  ];
  for (const cfg of jsonConfigs) {
    if (!deps.exists(cfg.file)) continue;
    try {
      const parsed = JSON.parse(deps.readText(cfg.file)) as { mcpServers?: Record<string, unknown> };
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        for (const k of Object.keys(parsed.mcpServers)) add(cfg.source, k);
      }
    } catch {
      // ignore malformed user JSON
    }
  }

  const codexToml = path.join(deps.homedir, '.codex', 'config.toml');
  if (deps.exists(codexToml)) {
    try {
      const raw = deps.readText(codexToml);
      for (const m of raw.matchAll(/^\s*\[mcp_servers\.([A-Za-z0-9_.-]+)\]/gm)) {
        const top = m[1].split('.')[0];
        if (top) add('codex', top);
      }
    } catch {
      // ignore unreadable codex config
    }
  }

  const hermesCfg = path.join(deps.homedir, '.hermes', 'config.yaml');
  if (deps.exists(hermesCfg)) {
    add('hermes', 'hermes-local');
  }

  return found.slice(0, 24);
}

/**
 * Categorizes every scanned local AI server, subscription CLI, OpenBot agent, and optional cloud API key
 * into the flagship "Computer as AI Power Source" model.
 */
export function buildPcPowerSourceSnapshot(input: {
  hostname: string;
  platform: string;
  inferenceMode: InferenceMode;
  active: { id: string; label: string; model: string | null };
  scan: ProviderScanResult | null;
  mcpServers?: LocalMcpServerRef[];
}): PcPowerSourceSnapshot {
  const providers = input.scan ? publicProviders(input.scan.providers) : [];
  const hostedReady: PowerSourceApp[] = [];
  const hostedStandby: PowerSourceApp[] = [];
  const cloudOptional: PowerSourceApp[] = [];

  for (const p of providers) {
    const isCloud = p.kind === 'api_key';
    const isWakeable =
      !isCloud && WAKEABLE_IDS.has(p.id) && p.state === 'error' && /not running/i.test(p.detail);
    const tier: PowerSourceTier = isCloud
      ? 'CLOUD_OPTIONAL'
      : p.state === 'connected'
        ? 'HOSTED_READY'
        : 'HOSTED_STANDBY';
    const row: PowerSourceApp = {
      id: p.id,
      name: p.name,
      kind: p.kind,
      tier,
      status: p.state,
      selectable: p.selectable,
      wakeable: isWakeable,
      models: p.models.slice(0, 12).map((m) => m.id),
      defaultModel: p.defaultModel,
      detail: p.detail,
      fixHint: p.fixHint,
    };
    if (tier === 'HOSTED_READY') hostedReady.push(row);
    else if (tier === 'CLOUD_OPTIONAL') cloudOptional.push(row);
    else if (p.state !== 'not_installed' || p.id === 'ollama' || p.id === 'openbot') hostedStandby.push(row);
  }

  const openBotRow = providers.find((p) => p.id === 'openbot' && p.state === 'connected');
  const openBotAgents = openBotRow ? openBotRow.models.map((m) => ({ id: m.id, name: m.name })) : [];
  const mcpServers = input.mcpServers ?? [];

  return {
    scannedAt: input.scan?.scannedAt ?? null,
    hostname: input.hostname,
    platform: input.platform,
    inferenceMode: input.inferenceMode,
    active: input.active,
    counts: {
      hostedReady: hostedReady.length,
      hostedStandby: hostedStandby.length,
      cloudOptional: cloudOptional.filter((c) => c.status === 'connected').length,
      mcpServers: mcpServers.length,
      openBotAgents: openBotAgents.length,
    },
    hostedReady,
    hostedStandby,
    cloudOptional,
    mcpServers,
    openBotAgents,
    honestBoundary: HONEST_HARDWARE_BOUNDARY,
  };
}

export type WakeableLocalService = 'ollama' | 'omniroute';

export interface WakeServiceDeps {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  homedir: string;
  exists: (p: string) => boolean;
  spawnDetached: (bin: string, args: string[], shell: boolean) => void;
}

const defaultWakeDeps = (): WakeServiceDeps => ({
  env: process.env,
  platform: process.platform,
  homedir: os.homedir(),
  exists: (p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  },
  spawnDetached: (bin, args, shell) => {
    const child = shell
      ? nodeSpawn(`"${bin}" ${args.join(' ')}`, [], { shell: true, detached: true, stdio: 'ignore', windowsHide: true })
      : nodeSpawn(bin, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  },
});

/**
 * Owner-only allowlisted wake helper for installed local inference servers (`ollama`, `omniroute`).
 * Constant commands only — zero user text ever reaches process arguments.
 */
export function wakeLocalService(
  service: WakeableLocalService,
  partial?: Partial<WakeServiceDeps>,
): { ok: boolean; service: WakeableLocalService; detail: string } {
  const deps: WakeServiceDeps = { ...defaultWakeDeps(), ...partial };
  const binDeps: Pick<ScannerDeps, 'env' | 'platform' | 'homedir' | 'exists'> = {
    env: deps.env,
    platform: deps.platform,
    homedir: deps.homedir,
    exists: deps.exists,
  };
  if (service === 'ollama') {
    const bin = findCliBinary(['ollama'], binDeps);
    if (!bin) return { ok: false, service, detail: 'Ollama binary not found on this computer. Install from ollama.com.' };
    deps.spawnDetached(bin, ['serve'], false);
    return { ok: true, service, detail: 'Started local Ollama server (127.0.0.1:11434). Auto-sync picks it up in seconds.' };
  }
  const bin = findCliBinary(['omniroute'], binDeps);
  if (!bin) return { ok: false, service, detail: 'OmniRoute CLI not found on this computer. Run: npm i -g omniroute.' };
  const isShim = deps.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  deps.spawnDetached(bin, [], isShim);
  return { ok: true, service, detail: 'Started local OmniRoute server (127.0.0.1:20128). Auto-sync picks it up in seconds.' };
}

/**
 * Invokes an OpenBot local agent via its documented CLI (`openbot-cli.mjs run <agent> - --wait --json`).
 * Maps OpenBot exit code 3 (`needs-person`) cleanly onto OnQ's human-approval boundary.
 */
export async function invokeOpenBotAgent(
  agentRef: string,
  prompt: string,
  opts: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    homedir?: string;
    exists?: (p: string) => boolean;
    timeoutSec?: number;
  } = {},
): Promise<{ ok: boolean; status: 'done' | 'needs_person' | 'unreachable' | 'failed'; reply: string }> {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const home = env.USERPROFILE ?? env.HOME ?? opts.homedir ?? os.homedir();
  const localApp = env.LOCALAPPDATA ?? (platform === 'win32' ? path.win32.join(home, 'AppData', 'Local') : '');
  const cliPath = localApp
    ? path.join(localApp, 'Programs', 'OpenBot', 'resources', 'cli', 'openbot-cli.mjs')
    : '';
  const exists = opts.exists ?? ((p) => fs.existsSync(p));
  if (!cliPath || !exists(cliPath)) {
    return { ok: false, status: 'unreachable', reply: 'OpenBot desktop is not installed on this computer.' };
  }
  const safeAgent = agentRef.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 64);
  if (!safeAgent) return { ok: false, status: 'failed', reply: 'OpenBot agent name required.' };
  const timeoutSec = Math.max(5, Math.min(90, opts.timeoutSec ?? 45));

  return new Promise((resolve) => {
    const child = nodeSpawn(
      process.execPath,
      [cliPath, 'run', safeAgent, '-', '--wait', '--timeout', `${timeoutSec}s`, '--json'],
      { windowsHide: true },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, status: 'failed', reply: 'OpenBot agent timed out.' });
    }, (timeoutSec + 3) * 1000);
    child.stdout.on('data', (d) => (out += String(d)));
    child.stderr.on('data', (d) => (err += String(d)));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, status: 'unreachable', reply: 'Could not launch openbot-cli.mjs.' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const raw = (out || err).trim();
      if (code === 0) {
        try {
          const parsed = JSON.parse(raw) as { result?: { reply?: string; text?: string; output?: string }; text?: string };
          const text = parsed.result?.reply ?? parsed.result?.text ?? parsed.result?.output ?? parsed.text ?? raw;
          resolve({ ok: true, status: 'done', reply: String(text).slice(0, 260) });
          return;
        } catch {
          resolve({ ok: true, status: 'done', reply: raw.slice(0, 260) || 'OpenBot agent finished.' });
          return;
        }
      }
      if (code === 3) {
        resolve({ ok: false, status: 'needs_person', reply: 'OpenBot agent is waiting for human approval on your computer.' });
        return;
      }
      if (code === 5) {
        resolve({ ok: false, status: 'unreachable', reply: 'OpenBot is closed or Local scripts is off for that agent.' });
        return;
      }
      resolve({ ok: false, status: 'failed', reply: raw.slice(0, 200) || `OpenBot exited ${code}.` });
    });
    child.stdin.end(prompt);
  });
}
