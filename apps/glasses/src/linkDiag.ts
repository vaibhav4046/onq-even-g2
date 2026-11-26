/**
 * Self-diagnosing connection for the glasses / browser client.
 * Staged check: (host) can we reach it, (net) blocked by the app or just offline, (auth) is the pairing valid,
 * (stream) is the live stream up. Each failure maps to ONE short HUD line (<= 42 ASCII columns) plus a longer
 * sentence for the browser view. Retries use a capped exponential backoff (never a tight loop).
 * Everything with I/O or time is injected, so the logic is unit-tested without a network.
 */

export const BACKOFF_STEPS_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000];
export const HEALTH_TIMEOUT_MS = 4000;
export const MIN_POLL_GAP_MS = 300;

export function backoffMs(attempt: number): number {
  const i = Math.min(Math.max(0, Math.floor(attempt)), BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[i];
}

export type DiagCode = 'OK' | 'NO_INTERNET' | 'HOST_OFFLINE' | 'NET_BLOCKED' | 'PAIR_EXPIRED' | 'NOT_PAIRED' | 'LOCKED' | 'STREAM_DOWN' | 'ALL_BLOCKED';
export type DiagStage = 'host' | 'net' | 'auth' | 'stream';
export type StreamState = 'open' | 'connecting' | 'closed' | 'unsupported';

export interface Diag {
  ok: boolean;
  code: DiagCode;
  stage: DiagStage;
  /** One line for the 7x42 HUD. */
  hud: string;
  /** The same thing in a full sentence (browser view). */
  detail: string;
  /** False when waiting will not help (the user has to scan a new code). */
  retry: boolean;
  transport: 'sse' | 'poll';
}

const D = (code: DiagCode, stage: DiagStage, ok: boolean, retry: boolean, hud: string, detail: string, transport: 'sse' | 'poll' = 'sse'): Diag => ({
  ok,
  code,
  stage,
  hud,
  detail,
  retry,
  transport,
});

export const DIAG: Record<DiagCode, Diag> = {
  OK: D('OK', 'stream', true, false, 'LINK OK', 'Connected to your computer.'),
  NO_INTERNET: D('NO_INTERNET', 'net', false, true, 'NO INTERNET - RETRYING', 'No internet on this device. Retrying.'),
  HOST_OFFLINE: D('HOST_OFFLINE', 'host', false, true, 'HOST OFFLINE - RETRYING', 'Your computer did not answer. Is OnQ running, and is the tunnel on? Retrying.'),
  NET_BLOCKED: D(
    'NET_BLOCKED',
    'net',
    false,
    true,
    'NET BLOCKED BY APP - USE BROWSER LINK',
    'NET BLOCKED by app permissions - open the link in browser mode.',
  ),
  PAIR_EXPIRED: D('PAIR_EXPIRED', 'auth', false, false, 'PAIR EXPIRED - RESCAN', 'This device is no longer paired. Show a new code on your computer and scan it again.'),
  NOT_PAIRED: D('NOT_PAIRED', 'auth', false, false, 'NOT PAIRED - SCAN THE QR', 'This device is not paired yet. Scan the code on your computer.'),
  LOCKED: D('LOCKED', 'auth', false, true, 'HOST LOCKED - KILL SWITCH ON', 'The kill switch is on. Release it on your computer.'),
  STREAM_DOWN: D('STREAM_DOWN', 'stream', true, false, 'LIVE STREAM DOWN - POLLING', 'The live stream is blocked. Using slower polling instead.', 'poll'),
  ALL_BLOCKED: D('ALL_BLOCKED', 'stream', false, true, 'ALL LINKS BLOCKED - USE TELEGRAM', 'Neither the live stream nor polling works here. Your computer can still send approvals to your Telegram chat.'),
};

export interface DiagInput {
  fetchImpl: typeof fetch;
  base: string;
  deviceToken: string | null;
  /** location.origin of the page, or null when unknown (file:, packaged app). */
  pageOrigin: string | null;
  /** navigator.onLine when known. */
  onLine?: boolean;
  stream?: StreamState | null;
  timeoutMs?: number;
}

interface Timed {
  res?: Response;
  err?: unknown;
  timedOut: boolean;
}

async function timedFetch(f: typeof fetch, url: string, init: RequestInit, ms: number): Promise<Timed> {
  const ctl = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, ms);
  try {
    const res = await f(url, { ...init, signal: ctl.signal });
    return { res, timedOut: false };
  } catch (err) {
    return { err, timedOut };
  } finally {
    clearTimeout(t);
  }
}

const isLoopbackBase = (base: string): boolean => {
  try {
    const h = new URL(base).hostname;
    return h === 'localhost' || h === '[::1]' || h === '::1' || /^127\./.test(h);
  } catch {
    return false;
  }
};

const originOf = (u: string): string | null => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};

export async function runDiagnosis(i: DiagInput): Promise<Diag> {
  const ms = i.timeoutMs ?? HEALTH_TIMEOUT_MS;
  // (a) host reachable? Plain GET /api/health, 4 s.
  const h = await timedFetch(i.fetchImpl, `${i.base}/api/health`, { cache: 'no-store' }, ms);
  if (h.res) {
    if (!h.res.ok) return DIAG.HOST_OFFLINE; // tunnel up but nothing behind it (502/530), or not an OnQ host
  } else {
    // (b) blocked by the app, or just offline?
    if (i.onLine === false) return DIAG.NO_INTERNET;
    if (h.timedOut) return DIAG.HOST_OFFLINE;
    const cross = i.pageOrigin === null || originOf(i.base) !== i.pageOrigin;
    // A no-cors request succeeds (opaque) when the host is reachable but CORS refuses us.
    const opaque = await timedFetch(i.fetchImpl, `${i.base}/api/health`, { mode: 'no-cors', cache: 'no-store' }, ms);
    if (opaque.res) return DIAG.NET_BLOCKED;
    return cross ? DIAG.NET_BLOCKED : DIAG.HOST_OFFLINE;
  }
  // (c) auth: is the pairing valid?
  if (i.deviceToken) {
    const a = await timedFetch(i.fetchImpl, `${i.base}/api/host/profile`, { headers: { 'x-onq-device': i.deviceToken }, cache: 'no-store' }, ms);
    if (!a.res) return a.timedOut ? DIAG.HOST_OFFLINE : DIAG.NET_BLOCKED;
    if (a.res.status === 401 || a.res.status === 403) return DIAG.PAIR_EXPIRED;
    if (a.res.status === 423) return DIAG.LOCKED;
    if (!a.res.ok) return DIAG.HOST_OFFLINE;
    try {
      const body = (await a.res.json()) as { locked?: unknown };
      if (body?.locked === true) return DIAG.LOCKED;
    } catch {
      // Ignore parse failure; profile reachability succeeded.
    }
  } else if (!isLoopbackBase(i.base)) {
    return DIAG.NOT_PAIRED;
  }
  // (d) live stream
  if (i.stream === 'closed' || i.stream === 'unsupported') return DIAG.STREAM_DOWN;
  return DIAG.OK;
}

export interface Clock {
  schedule: (fn: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
}

/**
 * Runs the diagnosis, shows the result, and retries with backoff until the link is up or the user must act.
 * At most ONE retry is ever pending: failures reported while one is waiting do not stack up.
 */
export class LinkSupervisor {
  private attempt = 0;
  private pending: unknown = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly d: {
      diagnose: () => Promise<Diag>;
      onStatus: (diag: Diag) => void;
      onUp: (diag: Diag) => void | Promise<void>;
      clock: Clock;
    },
  ) {}

  get retries(): number {
    return this.attempt;
  }

  async check(): Promise<Diag | null> {
    if (this.stopped || this.running) return null;
    this.running = true;
    if (this.pending !== null) {
      this.d.clock.clear(this.pending);
      this.pending = null;
    }
    let diag: Diag;
    try {
      diag = await this.d.diagnose();
    } catch {
      diag = DIAG.HOST_OFFLINE;
    } finally {
      this.running = false;
    }
    this.d.onStatus(diag);
    if (diag.ok) {
      this.attempt = 0;
      await this.d.onUp(diag);
    } else if (diag.retry && !this.stopped) {
      const wait = backoffMs(this.attempt);
      this.attempt += 1;
      this.pending = this.d.clock.schedule(() => {
        this.pending = null;
        void this.check();
      }, wait);
    }
    return diag;
  }

  /** A transport reports trouble: run a fresh diagnosis unless one is already running or queued. */
  reportFailure(): void {
    if (this.pending !== null || this.running) return;
    void this.check();
  }

  stop(): void {
    this.stopped = true;
    if (this.pending !== null) this.d.clock.clear(this.pending);
    this.pending = null;
  }
}

export interface PollReply {
  revision: number;
  changed: boolean;
  event: string | null;
}

/**
 * Long-poll transport: GET /api/poll?since=<rev>&wait=20. Used when the live stream is blocked.
 * A minimum gap and a capped backoff on errors keep it from ever spinning.
 */
export class PollTransport {
  private since: number | null = null;
  private failures = 0;
  private timer: unknown = null;
  private active = false;
  private lastStart = 0;

  constructor(
    private readonly d: {
      poll: (since: number | null) => Promise<PollReply | null>;
      onChange: (event: string | null) => void;
      onFailure: (consecutive: number) => void;
      onRecovered: () => void;
      clock: Clock;
      now: () => number;
    },
  ) {}

  get consecutiveFailures(): number {
    return this.failures;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    void this.cycle();
  }

  stop(): void {
    this.active = false;
    if (this.timer !== null) this.d.clock.clear(this.timer);
    this.timer = null;
  }

  private later(ms: number): void {
    if (!this.active) return;
    this.timer = this.d.clock.schedule(() => {
      this.timer = null;
      void this.cycle();
    }, ms);
  }

  private async cycle(): Promise<void> {
    if (!this.active) return;
    this.lastStart = this.d.now();
    const reply = await this.d.poll(this.since).catch(() => null);
    if (!this.active) return;
    if (!reply) {
      this.failures += 1;
      this.d.onFailure(this.failures);
      this.later(backoffMs(this.failures - 1));
      return;
    }
    if (this.failures > 0) {
      this.failures = 0;
      this.d.onRecovered();
    }
    this.since = reply.revision;
    if (reply.changed) this.d.onChange(reply.event);
    const elapsed = this.d.now() - this.lastStart;
    this.later(Math.max(0, MIN_POLL_GAP_MS - elapsed));
  }
}
