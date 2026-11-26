import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The computer is the host. Phones and glasses pair once, get a device token, and are then "just clients".
 * This file owns: paired devices (token hashes only), the single active pairing code, the host revision counter,
 * and the pure request gate used by the server (loopback / LAN / device allowlist).
 */

export const DEVICE_TOKEN_PREFIX = 'odv_';
export const PAIR_CODE_TTL_MS = 5 * 60_000;
export const MAX_WRONG_CLAIMS = 5;
const MAX_DEVICES = 16;
const CODE_ISSUE_LIMIT = { max: 5, windowMs: 60_000 };
const CLAIM_LIMIT = { max: 20, windowMs: 60_000 };
const LAST_SEEN_PERSIST_MS = 30_000;
const MAX_LABEL = 40;

export interface DeviceRecord {
  id: string;
  label: string;
  createdAt: string;
  lastSeen: string | null;
  /** SHA-256 hex of the device token. The token itself is shown once at claim time and never stored. */
  tokenHash: string;
}
export type PublicDevice = Omit<DeviceRecord, 'tokenHash'>;

interface HostFile {
  revision: number;
  devices: DeviceRecord[];
  /** Hash per profile section, so a change made while the server was down still bumps the revision at boot. */
  sections: Record<string, string>;
}

const sha256Hex = (v: string): string => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

/** Fixed-length digests compared in constant time, so neither the length nor the content leaks through timing. */
function safeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
}

function slidingLimit(hits: number[], now: number, cfg: { max: number; windowMs: number }): boolean {
  while (hits.length && now - hits[0] >= cfg.windowMs) hits.shift();
  if (hits.length >= cfg.max) return false;
  hits.push(now);
  return true;
}

export type ClaimResult =
  | { ok: true; deviceId: string; deviceToken: string }
  | { ok: false; status: 400 | 401 | 409 | 429; error: string };

export class HostRegistry {
  private revisionNo = 1;
  private devices: DeviceRecord[] = [];
  private sections: Record<string, string> | null = null;
  private active: { code: string; expiresAtMs: number; wrong: number } | null = null;
  private readonly issueHits: number[] = [];
  private readonly claimHits: number[] = [];
  private lastPersistMs = 0;
  private readonly file: string;
  private readonly now: () => number;

  constructor(opts: { dataDir: string; nowFn?: () => number }) {
    this.now = opts.nowFn ?? (() => Date.now());
    fs.mkdirSync(opts.dataDir, { recursive: true, mode: 0o700 });
    this.file = path.join(opts.dataDir, 'host.json');
    this.load();
  }

  get revision(): number {
    return this.revisionNo;
  }

  listDevices(): PublicDevice[] {
    return this.devices.map(({ tokenHash: _h, ...rest }) => rest);
  }

  /**
   * Compares the current profile sections with the last known ones. Any difference bumps the revision once and
   * returns the changed keys. The very first call on a fresh install only records the baseline.
   */
  reconcile(next: Record<string, string>): string[] {
    const prev = this.sections;
    this.sections = next;
    if (!prev) {
      this.persist();
      return [];
    }
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const changed = [...keys].filter((k) => prev[k] !== next[k]).sort();
    if (changed.length) this.revisionNo += 1;
    if (changed.length) this.persist();
    return changed;
  }

  /** One active code at a time; issuing a new one burns the previous. Returns null when rate limited. */
  issueCode(): { code: string; expiresAt: string } | null {
    const t = this.now();
    if (!slidingLimit(this.issueHits, t, CODE_ISSUE_LIMIT)) return null;
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    this.active = { code, expiresAtMs: t + PAIR_CODE_TTL_MS, wrong: 0 };
    return { code, expiresAt: new Date(this.active.expiresAtMs).toISOString() };
  }

  claim(codeRaw: unknown, labelRaw: unknown): ClaimResult {
    const t = this.now();
    if (!slidingLimit(this.claimHits, t, CLAIM_LIMIT)) return { ok: false, status: 429, error: 'Too many pairing attempts. Wait a minute.' };
    const code = typeof codeRaw === 'string' ? codeRaw.trim() : '';
    if (!/^\d{6}$/.test(code)) return { ok: false, status: 400, error: 'code must be the 6 digits shown on the computer' };
    const active = this.active && this.active.expiresAtMs > t ? this.active : null;
    if (!active) this.active = null;
    // Always run one comparison, even with no active code, so the response time does not reveal whether one exists.
    const match = safeEqual(code, active?.code ?? '------');
    if (!active || !match) {
      if (active) {
        active.wrong += 1;
        if (active.wrong >= MAX_WRONG_CLAIMS) {
          this.active = null;
          return { ok: false, status: 429, error: 'Too many wrong codes. That code is burned. Ask the computer for a new one.' };
        }
      }
      return { ok: false, status: 401, error: 'Invalid or expired pairing code' };
    }
    if (this.devices.length >= MAX_DEVICES) {
      return { ok: false, status: 409, error: `This computer already has ${MAX_DEVICES} paired devices. Revoke one first.` };
    }
    this.active = null; // single use
    const label = (typeof labelRaw === 'string' ? labelRaw : '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_LABEL) || 'device';
    const deviceToken = `${DEVICE_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
    const device: DeviceRecord = {
      id: `dev_${crypto.randomBytes(6).toString('hex')}`,
      label,
      createdAt: new Date(t).toISOString(),
      lastSeen: null,
      tokenHash: sha256Hex(deviceToken),
    };
    this.devices = [...this.devices, device];
    this.persist();
    return { ok: true, deviceId: device.id, deviceToken };
  }

  authenticate(token: string | undefined): DeviceRecord | null {
    if (!token || !token.startsWith(DEVICE_TOKEN_PREFIX) || token.length > 200) return null;
    const hash = Buffer.from(sha256Hex(token), 'hex');
    let found: DeviceRecord | null = null;
    for (const d of this.devices) {
      // no early exit: every stored hash is compared
      if (crypto.timingSafeEqual(hash, Buffer.from(d.tokenHash, 'hex'))) found = d;
    }
    if (!found) return null;
    const t = this.now();
    const seen = this.devices.map((d) => (d.id === found!.id ? { ...d, lastSeen: new Date(t).toISOString() } : d));
    this.devices = seen;
    if (t - this.lastPersistMs > LAST_SEEN_PERSIST_MS) this.persist();
    return seen.find((d) => d.id === found!.id) ?? null;
  }

  revoke(id: string): boolean {
    const next = this.devices.filter((d) => d.id !== id);
    if (next.length === this.devices.length) return false;
    this.devices = next;
    this.persist();
    return true;
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<HostFile>;
      if (Number.isInteger(raw.revision) && (raw.revision as number) >= 1) this.revisionNo = raw.revision as number;
      if (Array.isArray(raw.devices)) {
        this.devices = raw.devices.filter(
          (d): d is DeviceRecord => Boolean(d) && typeof d.id === 'string' && typeof d.tokenHash === 'string' && /^[0-9a-f]{64}$/.test(d.tokenHash),
        );
      }
      if (raw.sections && typeof raw.sections === 'object') this.sections = raw.sections;
    } catch {
      // A corrupt host.json must not stop the server. Devices would have to pair again.
      this.devices = [];
    }
  }

  private persist(): void {
    this.lastPersistMs = this.now();
    const body: HostFile = { revision: this.revisionNo, devices: this.devices, sections: this.sections ?? {} };
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch {
      // best-effort; in memory state stays correct for this run
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Request gate (pure, unit-tested)
// ---------------------------------------------------------------------------------------------------------------

export function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.toLowerCase();
  return a === '::1' || a === '127.0.0.1' || /^127\.\d+\.\d+\.\d+$/.test(a) || /^::ffff:127\.\d+\.\d+\.\d+$/.test(a);
}

const LOOPBACK_HOST = /^(127\.\d+\.\d+\.\d+|localhost|\[::1\])(:\d+)?$/i;
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'true-client-ip'];

/**
 * True only for a request that really comes from a program on this computer. A tunnel (cloudflared, ngrok, tailscale
 * funnel) connects from 127.0.0.1 too, so a loopback socket alone is not enough: forwarding headers or a non-local
 * Host header mean the request came from somewhere else and must carry a device token.
 */
export function isOwnerMachineRequest(remoteAddress: string | undefined, headers: Record<string, string | string[] | undefined>): boolean {
  if (!isLoopbackAddress(remoteAddress)) return false;
  if (PROXY_HEADERS.some((h) => headers[h] !== undefined)) return false;
  const host = headers.host;
  return typeof host !== 'string' || LOOPBACK_HOST.test(host);
}

/**
 * ALLOWLIST for paired devices (phone / glasses). Anything not listed is refused with 403.
 * Allowed: read endpoints, voice (stt, tts, voice stream), corridor, the SSE stream, staging and committing actions
 * (still Default-NO on the host), the unified OS commands the glasses use, and approval decisions.
 * NOT allowed (owner only): pairing admin (/api/pair/*), connector save / disconnect / model select / orchestrator,
 * vault credential writes (/api/pair/credentials), OAuth (/api/auth/*), session revoke, workspace reset / fault.
 * The kill switch may be engaged from a device but never released (see the route), and devices are locked while it is on.
 */
const DEVICE_ALLOW: ReadonlyArray<readonly [string, RegExp]> = [
  ['GET', /^\/api\/(health|host\/profile|sources|outbox|corridor|stream|workspace\/state|connectors\/status|connectors\/scan-models|computer\/tools|computer\/power-source|os\/state|harness\/metrics|liveui|kanban|memory|proactive\/status|browser\/runs|tts\/voices|poll)$/],
  ['GET', /^\/api\/voice\/stream$/], // WebSocket upgrade
  ['POST', /^\/api\/(stt|tts\/speak|actions\/(stage|commit|undo)|meeting\/(start|turn|ask|wrapup|wipe)|proactive\/synthesize|os\/(command|pipeline\/run|music\/curate|routines\/run|killswitch)|liveui\/interact|browser\/run)$/],
  ['POST', /^\/api\/os\/approvals\/[a-zA-Z0-9_-]+\/decide$/],
  ['POST', /^\/api\/browser\/runs\/brw_[a-f0-9]+\/stop$/],
];

export function deviceAllowed(method: string, pathname: string): boolean {
  return DEVICE_ALLOW.some(([m, re]) => m === method && re.test(pathname));
}

export type GateInput = {
  method: string;
  pathname: string;
  /** True when isOwnerMachineRequest() held. */
  onOwnerMachine: boolean;
  /** A device credential was presented (header, bearer with the device prefix, or ?token= on the SSE stream). */
  deviceTokenPresented: boolean;
  /** Result of registry.authenticate(). */
  device: DeviceRecord | null;
  /** Global kill switch is engaged. */
  locked: boolean;
};
export type GateResult = { ok: true } | { ok: false; status: 401 | 403 | 423; error: string };

/** Public, secret-free doors that need no token from anywhere: the static glasses client and the bare health check. */
export function isPublicDoor(method: string, pathname: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return pathname === '/g' || pathname.startsWith('/g/') || (method === 'GET' && pathname === '/api/health');
}

export function gateRequest(i: GateInput): GateResult {
  if (isPublicDoor(i.method, i.pathname)) return { ok: true };
  if (i.deviceTokenPresented && !i.device) return { ok: false, status: 401, error: 'Unknown or revoked device token. Pair again.' };
  if (i.device) {
    if (i.locked) {
      return i.method === 'GET' && i.pathname === '/api/host/profile'
        ? { ok: true }
        : { ok: false, status: 423, error: 'Locked: the kill switch is on. Release it on the computer.' };
    }
    return deviceAllowed(i.method, i.pathname) ? { ok: true } : { ok: false, status: 403, error: 'Not available to paired devices. Use the computer.' };
  }
  if (i.onOwnerMachine) return { ok: true };
  // Not on this computer and no device token: the only open door is claiming a pairing code.
  if (i.method === 'POST' && i.pathname === '/api/pair/claim') return { ok: true };
  return { ok: false, status: 401, error: 'Pair this device with the computer first (POST /api/pair/claim).' };
}

/** Pulls a device credential from the request: x-onq-device, Bearer with the device prefix, or ?token= on the stream. */
export function extractDeviceToken(
  headers: Record<string, string | string[] | undefined>,
  pathname: string,
  searchToken: string | null,
): string | undefined {
  const h = headers['x-onq-device'];
  const header = Array.isArray(h) ? h[0] : h;
  if (header?.trim()) return header.trim();
  const auth = headers.authorization;
  const m = typeof auth === 'string' ? auth.match(/^Bearer\s+(.+)$/i) : null;
  if (m && m[1].trim().startsWith(DEVICE_TOKEN_PREFIX)) return m[1].trim();
  if ((pathname === '/api/stream' || pathname === '/api/voice/stream') && searchToken?.startsWith(DEVICE_TOKEN_PREFIX)) return searchToken;
  return undefined;
}

export function lanIPv4(): string | null {
  const candidates: string[] = [];
  for (const [iface, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VMnet|WSL|Docker|VirtualBox|Loopback/i.test(iface)) continue;
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) {
        candidates.push(ni.address);
      }
    }
  }
  return candidates[0] ?? null;
}

/** URL a client should pair against: tunnel URL if configured, else the LAN address when LAN is on, else loopback. */
export function pairingBaseUrl(o: { publicUrl?: string; lan: boolean; port: number }): string {
  const pub = o.publicUrl?.trim().replace(/\/+$/, '');
  if (pub && /^https?:\/\//i.test(pub)) return pub;
  if (o.lan) {
    const ip = lanIPv4();
    if (ip) return `http://${ip}:${o.port}`;
  }
  return `http://127.0.0.1:${o.port}`;
}

/** Loopback unless the owner opted in to LAN (ONQ_LAN=1). An explicit host option always wins. */
export function resolveListenHost(explicit: string | undefined, lan: boolean): string {
  return explicit ?? (lan ? '0.0.0.0' : '127.0.0.1');
}
