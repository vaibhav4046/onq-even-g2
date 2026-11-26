import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Owner-started tunnel (cloudflared quick tunnel). Nothing here runs by itself: the owner presses Start, and the
 * process dies on Stop or when the server closes. Only ONE tunnel at a time. All process I/O goes through
 * `TunnelDeps`, so tests inject a fake spawn and never start a real tunnel.
 */

export interface ProcLike {
  pid?: number;
  stdout: { on(ev: 'data', cb: (d: Buffer | string) => void): unknown } | null;
  stderr: { on(ev: 'data', cb: (d: Buffer | string) => void): unknown } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(ev: string, cb: (...a: any[]) => void): unknown;
  kill(sig?: NodeJS.Signals): boolean;
}
export interface SpawnOpts {
  shell?: boolean;
  windowsHide?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}
export type SpawnFn = (command: string, args: string[], opts: SpawnOpts) => ProcLike;

export interface TunnelDeps {
  spawn: SpawnFn;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  exists: (p: string) => boolean;
}

export const realTunnelDeps = (): TunnelDeps => ({
  spawn: (c, a, o) => nodeSpawn(c, a, { ...o, stdio: ['ignore', 'pipe', 'pipe'] }) as unknown as ProcLike,
  platform: process.platform,
  env: process.env,
  exists: (p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  },
});

export const TUNNEL_START_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;
const DETECT_TTL_MS = 60_000;
const ARG_SAFE = /^[A-Za-z0-9_:/.=-]+$/;
/** A .cmd shim runs through cmd.exe, so its own path must not carry shell metacharacters. */
const SHIM_PATH_SAFE = /^[A-Za-z0-9_:\\/. ()-]+$/;

export type TunnelState = 'off' | 'starting' | 'on' | 'error';
export interface TunnelStatus {
  state: TunnelState;
  url: string | null;
  startedAt: string | null;
  error: string | null;
}

export class RemoteError extends Error {
  constructor(
    readonly status: 400 | 409 | 429 | 500,
    message: string,
  ) {
    super(message);
  }
}

const clean = (s: string, max = 300): string => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(-max);

/** Looks a program up in PATH plus fixed install spots. Presence only; nothing is run. */
export function findBinary(names: string[], extraPaths: string[], deps: Pick<TunnelDeps, 'platform' | 'env' | 'exists'>): string | null {
  const win = deps.platform === 'win32';
  const sep = win ? ';' : ':';
  const joinP = win ? path.win32.join : path.posix.join;
  const exts = win ? ['.exe', '.cmd', '.bat'] : [''];
  const pathVar = deps.env.PATH ?? deps.env.Path ?? '';
  const dirs = pathVar.split(sep).map((d) => d.trim().replace(/^"|"$/g, '')).filter(Boolean);
  for (const p of extraPaths) if (deps.exists(p)) return p;
  for (const d of dirs) {
    for (const n of names) for (const e of exts) {
      const full = joinP(d, n + e);
      if (deps.exists(full)) return full;
    }
  }
  return null;
}

function launch(deps: TunnelDeps, bin: string, args: string[], extra: SpawnOpts = {}): ProcLike {
  if (!args.every((a) => ARG_SAFE.test(a))) throw new RemoteError(500, 'Refusing an unsafe command argument.');
  const shim = deps.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  if (shim) {
    if (!SHIM_PATH_SAFE.test(bin)) throw new RemoteError(500, 'Refusing an unsafe program path.');
    // Constant command line, nothing user-typed in it.
    return deps.spawn(`"${bin}" ${args.join(' ')}`, [], { ...extra, shell: true, windowsHide: true });
  }
  return deps.spawn(bin, args, { ...extra, windowsHide: true });
}

function probe(deps: TunnelDeps, bin: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    let child: ProcLike;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, out });
    };
    const timer = setTimeout(() => {
      try {
        child?.kill();
      } catch {
        // already gone
      }
      finish(null);
    }, PROBE_TIMEOUT_MS);
    try {
      child = launch(deps, bin, args);
    } catch {
      finish(null);
      return;
    }
    child.stdout?.on('data', (d) => (out += String(d)));
    child.stderr?.on('data', (d) => (out += String(d)));
    child.on('error', () => finish(null));
    child.on('close', (code: number | null) => finish(code));
  });
}

export interface CloudflaredInfo {
  available: boolean;
  version: string | null;
  bin: string | null;
}

export async function detectCloudflared(deps: TunnelDeps): Promise<CloudflaredInfo> {
  const win = deps.platform === 'win32';
  const extra = win
    ? [
        deps.env.APPDATA ? path.win32.join(deps.env.APPDATA, 'npm', 'cloudflared.cmd') : '',
        deps.env.ProgramFiles ? path.win32.join(deps.env.ProgramFiles, 'cloudflared', 'cloudflared.exe') : '',
        deps.env['ProgramFiles(x86)'] ? path.win32.join(deps.env['ProgramFiles(x86)'], 'cloudflared', 'cloudflared.exe') : '',
      ].filter(Boolean)
    : [];
  const bin = findBinary(['cloudflared'], extra, deps);
  if (!bin) return { available: false, version: null, bin: null };
  const r = await probe(deps, bin, ['--version']);
  const version = /cloudflared version\s+(\S+)/i.exec(r.out)?.[1] ?? null;
  if (r.code !== 0 && !version) return { available: false, version: null, bin };
  return { available: true, version, bin };
}

export interface TailscaleInfo {
  available: boolean;
  running: boolean;
  dnsName: string | null;
}

export async function detectTailscale(deps: TunnelDeps): Promise<TailscaleInfo> {
  const extra = deps.platform === 'win32' ? ['C:\\Program Files\\Tailscale\\tailscale.exe'] : [];
  const bin = findBinary(['tailscale'], extra, deps);
  if (!bin) return { available: false, running: false, dnsName: null };
  const r = await probe(deps, bin, ['status', '--json']);
  try {
    const j = JSON.parse(r.out) as { BackendState?: string; Self?: { DNSName?: string } };
    const dns = typeof j.Self?.DNSName === 'string' ? j.Self.DNSName.replace(/\.$/, '') : '';
    return { available: true, running: j.BackendState === 'Running', dnsName: /^[a-z0-9.-]+$/i.test(dns) ? dns : null };
  } catch {
    return { available: true, running: false, dnsName: null };
  }
}

/** Guidance only. OnQ never starts Tailscale. */
export function tailscaleSteps(port: number, dnsName: string | null): string[] {
  return [
    'Install Tailscale on this computer and on your phone. Sign in to the same account on both.',
    `In a terminal on this computer run: tailscale serve --bg ${port}`,
    dnsName
      ? `Your private address is https://${dnsName} (only devices on your Tailscale network can open it).`
      : 'Run "tailscale serve status" to see your private https address.',
    'Use that address in the Advanced section below, then build or open the link from there.',
    'To switch it off: tailscale serve reset',
  ];
}

/** The quick-tunnel URL. api.trycloudflare.com shows up in error text and is not a tunnel. */
export function parseTunnelUrl(text: string): string | null {
  for (const m of text.matchAll(/https:\/\/([a-z0-9][a-z0-9-]*)\.trycloudflare\.com/gi)) {
    if (m[1].toLowerCase() !== 'api') return `https://${m[1].toLowerCase()}.trycloudflare.com`;
  }
  return null;
}

export class TunnelManager {
  private st: TunnelStatus = { state: 'off', url: null, startedAt: null, error: null };
  private child: ProcLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waiters: Array<(s: TunnelStatus) => void> = [];
  private detected: { at: number; info: CloudflaredInfo } | null = null;
  private readonly timeoutMs: number;

  constructor(
    private readonly o: { deps: TunnelDeps; getPort: () => number; onChange?: () => void; startTimeoutMs?: number; now?: () => number },
  ) {
    this.timeoutMs = o.startTimeoutMs ?? TUNNEL_START_TIMEOUT_MS;
  }

  status(): TunnelStatus {
    return { ...this.st };
  }

  async detect(force = false): Promise<CloudflaredInfo> {
    const now = (this.o.now ?? Date.now)();
    if (!force && this.detected && now - this.detected.at < DETECT_TTL_MS) return this.detected.info;
    const info = await detectCloudflared(this.o.deps);
    this.detected = { at: now, info };
    return info;
  }

  /** Starts the tunnel. Resolves once it is on, failed or stopped. Throws RemoteError for refusals. */
  async start(): Promise<TunnelStatus> {
    if (this.st.state === 'starting' || this.st.state === 'on') throw new RemoteError(409, 'A tunnel is already running. Stop it first.');
    // Claim the slot before awaiting, so two quick Start presses can never start two tunnels.
    this.set({ state: 'starting', url: null, startedAt: null, error: null });
    const info = await this.detect();
    if (!info.available || !info.bin) {
      this.set({ state: 'off', url: null, startedAt: null, error: null });
      throw new RemoteError(409, 'cloudflared was not found on this computer. Install it first (winget install Cloudflare.cloudflared), then try again.');
    }
    if ((this.st as TunnelStatus).state !== 'starting') return this.status(); // stopped while we were checking for cloudflared
    const port = this.o.getPort();
    let child: ProcLike;
    try {
      child = launch(this.o.deps, info.bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate']);
    } catch (e) {
      this.set({ state: 'error', url: null, startedAt: null, error: clean(e instanceof Error ? e.message : 'Could not start cloudflared') });
      return this.status();
    }
    this.child = child;
    let seen = '';
    const onData = (d: Buffer | string) => {
      if (this.child !== child) return;
      seen = (seen + String(d)).slice(-4000);
      if (this.st.state !== 'starting') return;
      const url = parseTunnelUrl(seen);
      if (url) {
        this.clearTimer();
        this.set({ state: 'on', url, startedAt: new Date((this.o.now ?? Date.now)()).toISOString(), error: null });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (e: Error) => {
      if (this.child === child) this.fail(`Could not run cloudflared: ${clean(e.message)}`);
    });
    child.on('close', (code: number | null) => {
      if (this.child !== child) return;
      this.fail(`The tunnel stopped (exit ${code ?? 'unknown'}). ${clean(seen, 200)}`.trim());
    });
    this.timer = setTimeout(() => {
      if (this.child === child && this.st.state === 'starting') this.fail('Timed out after 30 seconds waiting for the tunnel address.');
    }, this.timeoutMs);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async stop(): Promise<TunnelStatus> {
    const child = this.child;
    this.child = null; // later events from this process are ignored
    this.clearTimer();
    if (child) this.killTree(child);
    if (this.st.state !== 'off') this.set({ state: 'off', url: null, startedAt: null, error: null });
    return this.status();
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    this.clearTimer();
    if (child) this.killTree(child);
    this.st = { state: 'off', url: null, startedAt: null, error: null };
    this.flush();
  }

  private fail(message: string): void {
    const child = this.child;
    this.child = null;
    this.clearTimer();
    if (child) this.killTree(child);
    this.set({ state: 'error', url: null, startedAt: null, error: clean(message) });
  }

  private killTree(child: ProcLike): void {
    try {
      if (this.o.deps.platform === 'win32' && Number.isInteger(child.pid)) {
        // cloudflared.cmd runs cloudflared under cmd.exe: kill the whole tree.
        this.o.deps.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      }
      child.kill();
    } catch {
      // already gone
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(next: TunnelStatus): void {
    this.st = next;
    if (next.state !== 'starting') this.flush();
    try {
      this.o.onChange?.();
    } catch {
      // a listener must not break the tunnel
    }
  }

  private flush(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r(this.status());
  }
}
