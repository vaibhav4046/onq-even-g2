import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectTailscale,
  realTunnelDeps,
  RemoteError,
  tailscaleSteps,
  TunnelManager,
  type TunnelDeps,
  type TunnelStatus,
} from './tunnel.js';

/**
 * Remote access for the owner's own glasses / phone: tunnel manager, guidance for Tailscale, the saved "allow my
 * Wi-Fi" choice, and the optional .ehpk package builder. Everything is user-initiated; nothing starts by itself.
 */

export const EXPOSURE_NOTICE =
  'Starting a tunnel makes OnQ reachable from the internet through a temporary public address. ' +
  'Anyone who finds the address can reach the sign-in door, but nothing else: every request needs a device token you gave out with a one-use pairing code. ' +
  'Stop the tunnel (or close OnQ) and the address stops working. The kill switch also locks every paired device.';

export const LAN_NOTICE =
  'Allow my Wi-Fi lets other devices on your Wi-Fi reach OnQ. They still need a pairing code and device token. This takes effect the next time OnQ starts.';

const PACK_TIMEOUT_MS = 90_000;
const KEEP_PACKAGES = 10;
export const PACKAGE_FILE = /^onq-[0-9a-f]{16}\.ehpk$/;

export interface RemoteStatus {
  cloudflared: { available: boolean; version: string | null };
  tailscale: { available: boolean; running: boolean; dnsName: string | null; steps: string[] };
  tunnel: TunnelStatus;
  lanEnabled: boolean;
  lanPending: boolean;
  exposureWarning: string;
  glassesClient: { built: boolean; path: string };
}

export interface PackResult {
  file: string;
  path: string;
  bytes: number;
  sha256: string;
  relayOrigin: string;
  whitelist: string[];
  downloadUrl: string;
}

/** Repo root when running from a checkout (src/host or dist/host, four levels below apps/server). */
export function defaultRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
}

export function readLanSetting(dataDir: string): boolean {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir, 'remote.json'), 'utf8')) as { lan?: unknown };
    return j.lan === true;
  } catch {
    return false;
  }
}

function writeLanSetting(dataDir: string, lan: boolean): void {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dataDir, 'remote.json'), JSON.stringify({ lan }), { mode: 0o600 });
}

/** http(s) origin only: no credentials, path, query or fragment. Returns the origin or throws a 400. */
export function validateRelayUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 300) throw new RemoteError(400, 'relayUrl must be a web address like https://my-tunnel.example.com');
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new RemoteError(400, 'relayUrl is not a valid web address');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new RemoteError(400, 'relayUrl must start with https:// or http://');
  if (u.username || u.password) throw new RemoteError(400, 'relayUrl must not contain a user name or password');
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) throw new RemoteError(400, 'relayUrl must be the address only, with no path or query');
  return u.origin;
}

export interface RemoteDeps extends Partial<TunnelDeps> {
  /** Repo checkout root (holds scripts/pack-ehpk.mjs and apps/glasses/dist). */
  repoRoot?: string;
  /** Node binary used to run the pack script. */
  nodeBin?: string;
  packTimeoutMs?: number;
  tunnelStartTimeoutMs?: number;
}

export class RemoteService {
  readonly tunnel: TunnelManager;
  private readonly deps: TunnelDeps;
  private readonly repoRoot: string;
  private packing = false;

  constructor(
    private readonly o: {
      dataDir: string;
      lanEnabled: boolean;
      getPort: () => number;
      onChange: () => void;
      /** False under tests unless deps were injected: the real PC is not inspected. */
      inspect: boolean;
      deps?: RemoteDeps;
    },
  ) {
    const d = o.deps ?? {};
    this.deps = { ...realTunnelDeps(), ...d } as TunnelDeps;
    if (!o.inspect) this.deps = { ...this.deps, exists: () => false };
    this.repoRoot = d.repoRoot ?? defaultRepoRoot();
    this.tunnel = new TunnelManager({ deps: this.deps, getPort: o.getPort, onChange: o.onChange, startTimeoutMs: d.tunnelStartTimeoutMs });
  }

  get clientDir(): string {
    return path.join(this.repoRoot, 'apps', 'glasses', 'dist');
  }

  async status(): Promise<RemoteStatus> {
    const [cf, ts] = await Promise.all([this.tunnel.detect(), detectTailscale(this.deps)]);
    const pending = readLanSetting(this.o.dataDir);
    return {
      cloudflared: { available: cf.available, version: cf.version },
      tailscale: { available: ts.available, running: ts.running, dnsName: ts.dnsName, steps: tailscaleSteps(this.o.getPort(), ts.dnsName) },
      tunnel: this.tunnel.status(),
      lanEnabled: this.o.lanEnabled,
      lanPending: pending,
      exposureWarning: EXPOSURE_NOTICE,
      glassesClient: { built: fs.existsSync(path.join(this.clientDir, 'index.html')), path: '/g/' },
    };
  }

  setLan(enabled: boolean): { lanEnabled: boolean; lanPending: boolean; restartRequired: boolean; notice: string } {
    writeLanSetting(this.o.dataDir, enabled);
    return { lanEnabled: this.o.lanEnabled, lanPending: enabled, restartRequired: enabled !== this.o.lanEnabled, notice: LAN_NOTICE };
  }

  packagesDir(): string {
    return path.join(this.o.dataDir, 'packages');
  }

  /** Builds an .ehpk for this user via the repo's own pack script. Never builds the web bundle silently. */
  async buildPackage(relayUrl: unknown): Promise<PackResult> {
    const fallback = this.tunnel.status().url;
    const relayOrigin = relayUrl === undefined || relayUrl === null || relayUrl === '' ? (fallback ? validateRelayUrl(fallback) : null) : validateRelayUrl(relayUrl);
    if (!relayOrigin) throw new RemoteError(400, 'No tunnel is running and no relayUrl was given. Start the tunnel first, or pass relayUrl.');
    const script = path.join(this.repoRoot, 'scripts', 'pack-ehpk.mjs');
    if (!fs.existsSync(script)) throw new RemoteError(409, 'The package builder only works from the OnQ repo (scripts/pack-ehpk.mjs was not found).');
    if (!fs.existsSync(path.join(this.clientDir, 'index.html'))) throw new RemoteError(409, 'The glasses build is missing. Run npm run build first.');
    if (this.packing) throw new RemoteError(429, 'A package is already being built. Wait for it to finish.');
    this.packing = true;
    const dir = this.packagesDir();
    const tmpOut = path.join(dir, `.pending-${crypto.randomBytes(6).toString('hex')}.ehpk`);
    const tmpManifest = `${tmpOut}.manifest.json`;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      await this.runPack(script, relayOrigin, tmpOut);
      if (!fs.existsSync(tmpOut)) throw new RemoteError(500, 'The pack script finished but wrote no package.');
      const buf = fs.readFileSync(tmpOut);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const file = `onq-${sha256.slice(0, 16)}.ehpk`;
      const finalPath = path.join(dir, file);
      fs.renameSync(tmpOut, finalPath);
      let whitelist: string[] = [];
      try {
        const m = JSON.parse(fs.readFileSync(tmpManifest, 'utf8')) as { permissions?: Array<{ name: string; whitelist?: string[] }> };
        whitelist = m.permissions?.find((p) => p.name === 'network')?.whitelist ?? [];
      } catch {
        whitelist = [];
      }
      this.prune(dir, file);
      return { file, path: finalPath, bytes: buf.byteLength, sha256, relayOrigin, whitelist, downloadUrl: `/api/remote/package/${file}` };
    } finally {
      this.packing = false;
      for (const f of [tmpOut, tmpManifest]) {
        try {
          fs.rmSync(f, { force: true });
        } catch {
          // best effort
        }
      }
    }
  }

  private runPack(script: string, relayOrigin: string, out: string): Promise<void> {
    const e = this.deps.env;
    // Minimal environment: the pack script needs no secrets.
    const env: NodeJS.ProcessEnv = { ONQ_RELAY_URL: relayOrigin, ONQ_PACK_OUT: out };
    for (const k of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'HOME']) if (e[k]) env[k] = e[k];
    return new Promise<void>((resolve, reject) => {
      let tail = '';
      let done = false;
      const finish = (err?: RemoteError) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      let child: ReturnType<TunnelDeps['spawn']>;
      const timer = setTimeout(() => {
        try {
          child?.kill();
        } catch {
          // gone
        }
        finish(new RemoteError(500, 'The pack script took too long and was stopped.'));
      }, this.o.deps?.packTimeoutMs ?? PACK_TIMEOUT_MS);
      try {
        // Constant arguments: node <script>. The address travels in the environment only.
        child = this.deps.spawn((this.o.deps?.nodeBin ?? process.execPath), [script], { cwd: this.repoRoot, env, windowsHide: true });
      } catch (err) {
        finish(new RemoteError(500, `Could not start the pack script: ${err instanceof Error ? err.message : 'unknown'}`));
        return;
      }
      const grab = (d: Buffer | string) => (tail = (tail + String(d)).slice(-400));
      child.stdout?.on('data', grab);
      child.stderr?.on('data', grab);
      child.on('error', (err: Error) => finish(new RemoteError(500, `Pack script failed to start: ${err.message}`)));
      child.on('close', (code: number | null) =>
        code === 0 ? finish() : finish(new RemoteError(500, `Pack script failed (exit ${code ?? 'unknown'}): ${tail.replace(/\s+/g, ' ').trim().slice(-200)}`)),
      );
    });
  }

  private prune(dir: string, keep: string): void {
    try {
      const files = fs
        .readdirSync(dir)
        .filter((f) => PACKAGE_FILE.test(f))
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const x of files.slice(KEEP_PACKAGES)) if (x.f !== keep) fs.rmSync(path.join(dir, x.f), { force: true });
    } catch {
      // best effort
    }
  }

  /** Resolves a package for download. The name must match the strict pattern: no separators, no traversal. */
  packageFile(name: string): { path: string; size: number } | null {
    if (!PACKAGE_FILE.test(name)) return null;
    const dir = path.resolve(this.packagesDir());
    const full = path.resolve(dir, name);
    if (path.dirname(full) !== dir) return null;
    try {
      const st = fs.statSync(full);
      return st.isFile() ? { path: full, size: st.size } : null;
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.tunnel.dispose();
  }
}

export const SILENT_DEVICE_MS = 90_000;

/**
 * Text for the owner's Telegram chat when approvals are waiting but every paired device looks cut off (no open stream,
 * no request lately). A blocked client cannot tell the host it is blocked, so silence is the only signal the host has.
 * Returns null when there is no device, or at least one is live.
 */
export function silentDeviceNote(
  devices: Array<{ id: string; label: string; lastSeen: string | null }>,
  liveDeviceIds: ReadonlySet<string>,
  polledAt: ReadonlyMap<string, number>,
  nowMs: number,
  thresholdMs: number = SILENT_DEVICE_MS,
): string | null {
  if (devices.length === 0) return null;
  const silent = devices.filter((d) => {
    if (liveDeviceIds.has(d.id)) return false;
    const seen = Math.max(d.lastSeen ? Date.parse(d.lastSeen) || 0 : 0, polledAt.get(d.id) ?? 0);
    return nowMs - seen > thresholdMs;
  });
  if (silent.length < devices.length) return null;
  const names = silent.map((d) => d.label).slice(0, 3).join(', ');
  return `Your paired device (${names}) has not reached OnQ for a while, so it may be blocked from the network. You can approve or reject here instead.`;
}
