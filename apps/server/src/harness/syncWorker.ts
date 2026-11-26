import type { MetricsLedger } from './metricsLedger.js';
import type { SnapshotRoute, SnapshotSource, SnapshotStore, SnapshotView } from './snapshotStore.js';
import { SNAPSHOT_SOURCES } from './snapshotStore.js';

/**
 * Stale-while-revalidate sync for the data sources. Readers get the last snapshot immediately; a refresh is
 * kicked in the background when it is stale. One refresh per source at a time (single flight), a hard timeout
 * per fetch, retries with backoff, and a circuit breaker per source + route.
 */

export const FETCH_TIMEOUT_MS: Readonly<Record<SnapshotRoute, number>> = { api: 8_000, browser: 25_000, sample: 8_000 };
export const MAX_ATTEMPTS = 3;
export const BREAKER_FAILURES = 3;
export const BREAKER_OPEN_MS = 60_000;
const BACKOFF_BASE_MS = 500;
const WARM_WINDOW_MS = 10 * 60_000; // keep refreshing on a timer only for sources somebody read recently

export type EffectiveRoute = SnapshotRoute | 'off';
export type BreakerState = 'closed' | 'open' | 'half_open';

export type Fetcher = (signal: AbortSignal) => Promise<unknown>;

export interface SyncWorkerDeps {
  store: SnapshotStore;
  /** Current effective route for a source (settings + availability). 'off' = never fetch. */
  resolveRoute: (source: SnapshotSource) => { effective: EffectiveRoute; reason?: string };
  /** The fetch for a source on a route; undefined = nothing to fetch with. */
  fetcherFor: (source: SnapshotSource, route: SnapshotRoute) => Fetcher | undefined;
  ledger?: MetricsLedger;
  now?: () => number;
  /** Injected in tests so backoff never waits on a real clock. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: Partial<Record<SnapshotRoute, number>>;
  backoffBaseMs?: number;
  /** Called after a refresh stored a payload that differs from the previous one. */
  onChanged?: (source: SnapshotSource, view: SnapshotView) => void;
}

export interface BreakerView {
  state: BreakerState;
  failures: number;
  /** Epoch ms when the open breaker lets one probe through; null when closed. */
  retryAt: number | null;
}

export type RefreshStatus = 'ok' | 'failed' | 'breaker_open' | 'off' | 'no_fetcher';
export interface RefreshResult {
  status: RefreshStatus;
  source: SnapshotSource;
  route: EffectiveRoute;
  reason?: string;
  snapshot: SnapshotView | null;
}

interface Breaker {
  failures: number;
  openedAt: number | null;
  probing: boolean;
}

export class FetchTimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'FetchTimeoutError';
  }
}

/** Runs fn with an AbortSignal that fires at the deadline; the timer is always cleared. */
export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new FetchTimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([fn(ac.signal), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class SyncWorker {
  private readonly flights = new Map<SnapshotSource, Promise<RefreshResult>>();
  private readonly breakers = new Map<string, Breaker>();
  private readonly lastReadAt = new Map<SnapshotSource, number>();
  private readonly lastError = new Map<SnapshotSource, string>();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: SyncWorkerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private timeoutFor(route: SnapshotRoute): number {
    return this.deps.timeoutMs?.[route] ?? FETCH_TIMEOUT_MS[route];
  }

  private breaker(source: SnapshotSource, route: SnapshotRoute): Breaker {
    const k = `${source}:${route}`;
    let b = this.breakers.get(k);
    if (!b) {
      b = { failures: 0, openedAt: null, probing: false };
      this.breakers.set(k, b);
    }
    return b;
  }

  breakerView(source: SnapshotSource, route: SnapshotRoute): BreakerView {
    const b = this.breaker(source, route);
    if (b.openedAt === null) return { state: 'closed', failures: b.failures, retryAt: null };
    const retryAt = b.openedAt + BREAKER_OPEN_MS;
    return { state: this.now() >= retryAt ? 'half_open' : 'open', failures: b.failures, retryAt };
  }

  isRefreshing(source: SnapshotSource): boolean {
    return this.flights.has(source);
  }

  /**
   * Instant read for the glasses path. Returns what we have; when it is stale (or missing) and the source has a
   * real route, a background refresh is started. Never awaits the network.
   */
  read(source: SnapshotSource): { snapshot: SnapshotView | null; staleReason: string | null; refreshing: boolean } {
    this.lastReadAt.set(source, this.now());
    const stored = this.deps.store.get(source);
    const { effective } = this.deps.resolveRoute(source);
    // Data fetched through a route the owner has since switched away from is never served.
    const routeMismatch = stored !== null && effective !== 'off' && stored.route !== effective;
    let snapshot = routeMismatch || effective === 'off' ? null : stored;
    const live = effective === 'api' || effective === 'browser';
    // A failing source serves its last snapshot marked stale, however young it is.
    if (snapshot && live && this.breakerView(source, effective).state !== 'closed') snapshot = { ...snapshot, stale: true };
    if (live && (!snapshot || snapshot.stale)) void this.refresh(source).catch(() => undefined);
    return { snapshot, staleReason: this.staleReason(source), refreshing: this.isRefreshing(source) };
  }

  /** Why the served data is stale, or null when it is fresh. No side effects. */
  staleReason(source: SnapshotSource): string | null {
    const snap = this.deps.store.get(source);
    const { effective } = this.deps.resolveRoute(source);
    if (effective === 'api' || effective === 'browser') {
      const bv = this.breakerView(source, effective);
      if (bv.state !== 'closed') return `Source failing, retry after ${new Date(bv.retryAt as number).toISOString().slice(11, 19)}Z. ${this.lastError.get(source) ?? ''}`.trim();
    }
    if (!snap?.stale) return null;
    return snap.invalidated ? 'Changed since the last sync' : 'Older than its freshness window';
  }

  /** Kicks a refresh for sources that are missing or stale (the "next cards" the glasses will need). */
  prefetch(sources: readonly SnapshotSource[]): void {
    for (const s of sources) {
      const { effective } = this.deps.resolveRoute(s);
      if (effective !== 'api' && effective !== 'browser') continue;
      const snap = this.deps.store.get(s);
      if (!snap || snap.stale || snap.route !== effective) void this.refresh(s).catch(() => undefined);
    }
  }

  /** Single flight: concurrent callers share one fetch. `force` ignores an open breaker. */
  refresh(source: SnapshotSource, opts: { force?: boolean } = {}): Promise<RefreshResult> {
    const existing = this.flights.get(source);
    if (existing) return existing;
    const p = this.doRefresh(source, Boolean(opts.force)).finally(() => this.flights.delete(source));
    this.flights.set(source, p);
    return p;
  }

  private async doRefresh(source: SnapshotSource, force: boolean): Promise<RefreshResult> {
    const { effective, reason } = this.deps.resolveRoute(source);
    const snap = () => this.deps.store.get(source);
    if (effective === 'off') return { status: 'off', source, route: effective, reason, snapshot: snap() };
    const route = effective;
    const fetcher = this.deps.fetcherFor(source, route);
    if (!fetcher) return { status: 'no_fetcher', source, route, reason: `No ${route} fetcher for ${source}`, snapshot: snap() };

    const br = this.breaker(source, route);
    const view = this.breakerView(source, route);
    if (view.state === 'open' && !force) {
      return { status: 'breaker_open', source, route, reason: this.lastError.get(source) ?? 'Circuit open', snapshot: snap() };
    }
    // half-open (or forced): exactly one probe, no retries
    const probe = view.state !== 'closed';
    if (probe) br.probing = true;

    const attempts = probe ? 1 : MAX_ATTEMPTS;
    let lastMsg = 'unknown error';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const t0 = this.now();
      const span = this.deps.ledger?.begin({ kind: 'tool', provider: `sync:${source}:${route}`, model: null });
      try {
        const payload = await withTimeout(fetcher, this.timeoutFor(route));
        span?.end({ ok: true });
        const { changed } = this.deps.store.put(source, payload, route, this.now() - t0);
        br.failures = 0;
        br.openedAt = null;
        br.probing = false;
        this.lastError.delete(source);
        const stored = snap();
        if (changed && stored) this.deps.onChanged?.(source, stored);
        return { status: 'ok', source, route, snapshot: stored };
      } catch (err) {
        lastMsg = err instanceof Error ? err.message : String(err);
        span?.end({ ok: false, error: lastMsg });
        br.failures += 1;
        this.lastError.set(source, lastMsg.slice(0, 160));
        if (br.failures >= BREAKER_FAILURES || probe) {
          br.openedAt = this.now(); // (re)open for another BREAKER_OPEN_MS
          br.probing = false;
          break;
        }
        if (attempt < attempts) await this.sleep((this.deps.backoffBaseMs ?? BACKOFF_BASE_MS) * 2 ** (attempt - 1));
      }
    }
    br.probing = false;
    const open = this.breakerView(source, route).state !== 'closed';
    return {
      status: open ? 'breaker_open' : 'failed',
      source,
      route,
      reason: open ? `Circuit open for ${BREAKER_OPEN_MS / 1000}s after repeated failures: ${lastMsg}` : lastMsg,
      snapshot: snap(),
    };
  }

  /** Keeps recently-read sources warm. Not started in tests; stopped by server.close(). */
  start(intervalMs = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One warm-up pass; exposed so tests can drive it without timers. */
  tick(): void {
    const t = this.now();
    for (const s of SNAPSHOT_SOURCES) {
      if (t - (this.lastReadAt.get(s) ?? -Infinity) > WARM_WINDOW_MS) continue;
      this.prefetch([s]);
    }
  }
}
