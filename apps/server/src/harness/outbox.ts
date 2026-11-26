import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MetricsLedger } from './metricsLedger.js';
import type { SnapshotRoute, SnapshotSource } from './snapshotStore.js';
import { withTimeout } from './syncWorker.js';

/**
 * Write outbox. An already-approved action (Default-NO confirm, arm ring and single-use token all happened before
 * this) that would block on a slow route is run here in the background instead of holding the request open.
 * The outbox never approves anything and never skips a check: it only executes and reports status.
 *
 * States: queued -> running -> done | failed | undone. Persisted in dataDir/outbox.json.
 */

export type OutboxStatus = 'queued' | 'running' | 'done' | 'failed' | 'undone';
export type OutboxSource = SnapshotSource | 'computer';

export const INLINE_BUDGET_MS = 1_500;
export const OUTBOX_MAX_ATTEMPTS = 3;
export const OUTBOX_TIMEOUT_MS: Readonly<Record<SnapshotRoute, number>> = { api: 15_000, browser: 60_000, sample: 15_000 };
const BACKOFF_BASE_MS = 1_000;
const MAX_ITEMS = 100;
const TERMINAL: readonly OutboxStatus[] = ['done', 'failed', 'undone'];

export interface OutboxItem {
  id: string;
  /** The commit idempotency key. One item per key, ever. */
  idempotencyKey: string;
  source: OutboxSource;
  route: SnapshotRoute;
  title: string;
  summaryLines: string[];
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  /** Earliest time the next attempt may start (backoff); null when not waiting. */
  nextAttemptAt: number | null;
  reason: string | null;
  /** The structured 409 (ConflictLockDetail) when the failure was a double-booking found at execution time. */
  conflict: unknown | null;
  /** Opaque job data for the executor (the approved preview). Never sent to clients. */
  payload: unknown;
  result: { receiptId: string; summaryLines: string[]; canUndo: boolean } | null;
}

export type PublicOutboxItem = Omit<OutboxItem, 'payload' | 'createdAt' | 'updatedAt' | 'nextAttemptAt'> & {
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
};

/** Execution-time 409: marks the item failed with the conflict message, never retried. */
export class OutboxConflictError extends Error {
  readonly kind = 'conflict';
  constructor(
    message: string,
    readonly detail: unknown = null,
  ) {
    super(message);
  }
}
/** A failure that is safe to retry automatically (nothing was applied). Anything else fails the item. */
export class OutboxRetryableError extends Error {
  readonly kind = 'retryable';
}

export interface OutboxExecResult {
  receiptId: string;
  summaryLines: string[];
  canUndo: boolean;
}
export type OutboxExecutor = (item: OutboxItem, signal: AbortSignal) => Promise<OutboxExecResult>;

export interface OutboxDeps {
  execute: OutboxExecutor;
  dataDir?: string;
  ledger?: MetricsLedger;
  now?: () => number;
  timeoutMs?: Partial<Record<SnapshotRoute, number>>;
  backoffBaseMs?: number;
  /** Fired on every status change (the server turns it into the `outbox` SSE event). */
  onChange?: (item: OutboxItem) => void;
}

export function toPublicItem(i: OutboxItem): PublicOutboxItem {
  const { payload: _payload, createdAt, updatedAt, nextAttemptAt, ...rest } = i;
  return {
    ...rest,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    nextAttemptAt: nextAttemptAt === null ? null : new Date(nextAttemptAt).toISOString(),
  };
}

export class Outbox {
  private items: OutboxItem[] = [];
  private readonly lanes = new Set<OutboxSource>();
  private readonly waiters = new Map<string, Array<() => void>>();
  private readonly file: string | null;
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: OutboxDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.file = deps.dataDir ? path.join(deps.dataDir, 'outbox.json') : null;
    if (this.file) this.load();
  }

  list(): OutboxItem[] {
    return [...this.items].sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): OutboxItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  getByKey(key: string): OutboxItem | undefined {
    return this.items.find((i) => i.idempotencyKey === key);
  }

  /**
   * Queues an approved action and starts it. Waits up to `inlineMs` for it to finish so a fast call still answers
   * the request inline; past that the caller gets the queued/running item back and the work continues here.
   * Idempotent: the same key never creates a second live item.
   */
  async enqueue(
    input: { idempotencyKey: string; source: OutboxSource; route: SnapshotRoute; title: string; summaryLines: string[]; payload: unknown },
    opts: { inlineMs?: number } = {},
  ): Promise<{ item: OutboxItem; created: boolean }> {
    const existing = this.getByKey(input.idempotencyKey);
    // In flight or finished: never a second write. A failed or cancelled item was never completed, so a fresh
    // approval of the same action starts a fresh item instead of replaying the old failure.
    if (existing && existing.status !== 'failed' && existing.status !== 'undone') return { item: existing, created: false };
    if (existing) this.items = this.items.filter((i) => i.id !== existing.id);
    const t = this.now();
    const item: OutboxItem = {
      id: `ob_${crypto.randomBytes(5).toString('hex')}`,
      idempotencyKey: input.idempotencyKey,
      source: input.source,
      route: input.route,
      title: input.title.slice(0, 80),
      summaryLines: input.summaryLines.slice(0, 3),
      status: 'queued',
      attempts: 0,
      maxAttempts: OUTBOX_MAX_ATTEMPTS,
      createdAt: t,
      updatedAt: t,
      nextAttemptAt: null,
      reason: null,
      conflict: null,
      payload: input.payload,
      result: null,
    };
    this.items = [item, ...this.items].slice(0, MAX_ITEMS);
    this.changed(item);
    this.kick();
    const inlineMs = opts.inlineMs ?? 0;
    if (inlineMs > 0) await this.settled(item.id, inlineMs);
    return { item: this.get(item.id) ?? item, created: true };
  }

  /** Resolves when the item is terminal or the wait elapses, whichever comes first. The timer is always cleared. */
  private settled(id: string, ms: number): Promise<void> {
    const cur = this.get(id);
    if (!cur || TERMINAL.includes(cur.status)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.waiters.set(id, [...(this.waiters.get(id) ?? []), done]);
    });
  }

  /** failed -> queued again. Never touches an item that is not failed. */
  retry(id: string): OutboxItem | null {
    const item = this.get(id);
    if (!item || item.status !== 'failed') return null;
    const next = this.update(item, { status: 'queued', attempts: 0, nextAttemptAt: null, reason: null, conflict: null });
    this.kick();
    return next;
  }

  /** Cancels an item that has not started. A running item cannot be cancelled (its write may already be landing). */
  cancel(id: string, reason = 'Cancelled before it ran'): OutboxItem | null {
    const item = this.get(id);
    if (!item || item.status !== 'queued') return null;
    return this.update(item, { status: 'undone', nextAttemptAt: null, reason });
  }

  /** The finished write was reversed through the normal undo path. */
  markUndone(id: string): void {
    const item = this.get(id);
    if (item && item.status === 'done') this.update(item, { status: 'undone', reason: 'Undone' });
  }

  /** Picks up due queued items. Lanes are per source, so two writes to one source never overlap. */
  kick(): void {
    const t = this.now();
    for (const item of this.items) {
      if (item.status !== 'queued' || (item.nextAttemptAt !== null && item.nextAttemptAt > t) || this.lanes.has(item.source)) continue;
      this.lanes.add(item.source);
      void this.run(item).finally(() => {
        this.lanes.delete(item.source);
        this.kick();
      });
    }
  }

  private async run(item: OutboxItem): Promise<void> {
    let cur = this.update(item, { status: 'running', attempts: item.attempts + 1, nextAttemptAt: null });
    const span = this.deps.ledger?.begin({ kind: 'tool', provider: `outbox:${cur.source}:${cur.route}`, model: null });
    try {
      const result = await withTimeout((signal) => this.deps.execute(cur, signal), this.deps.timeoutMs?.[cur.route] ?? OUTBOX_TIMEOUT_MS[cur.route]);
      span?.end({ ok: true });
      cur = this.update(cur, { status: 'done', reason: null, result, summaryLines: result.summaryLines.slice(0, 3) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      span?.end({ ok: false, error: msg });
      if (err instanceof OutboxRetryableError && cur.attempts < cur.maxAttempts) {
        const wait = (this.deps.backoffBaseMs ?? BACKOFF_BASE_MS) * 2 ** (cur.attempts - 1);
        cur = this.update(cur, { status: 'queued', nextAttemptAt: this.now() + wait, reason: `Retrying: ${msg}`.slice(0, 160) });
        return;
      }
      const timedOut = err instanceof Error && err.name === 'FetchTimeoutError';
      const reason = timedOut ? `${msg}. It may have partly gone through. Check before retrying.` : msg;
      const conflict = err instanceof OutboxConflictError ? err.detail : null;
      cur = this.update(cur, { status: 'failed', nextAttemptAt: null, reason: reason.slice(0, 200), conflict });
    }
  }

  private update(item: OutboxItem, patch: Partial<OutboxItem>): OutboxItem {
    const next: OutboxItem = { ...item, ...patch, updatedAt: this.now() };
    this.items = this.items.map((i) => (i.id === item.id ? next : i));
    this.changed(next);
    return next;
  }

  private changed(item: OutboxItem): void {
    this.persist();
    try {
      this.deps.onChange?.(item);
    } catch {
      // a listener must never break the queue
    }
    if (TERMINAL.includes(item.status)) {
      for (const done of this.waiters.get(item.id) ?? []) done();
      this.waiters.delete(item.id);
    }
  }

  /** Retry timer for backoff. Not started in tests (they call kick() with an injected clock); stopped by close(). */
  start(intervalMs = 2_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.kick(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private load(): void {
    try {
      if (!this.file || !fs.existsSync(this.file)) return;
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { items?: OutboxItem[] };
      this.items = (raw.items ?? [])
        .filter((i) => i && typeof i.id === 'string' && typeof i.idempotencyKey === 'string')
        .map((i) => ({ ...i, conflict: i.conflict ?? null }))
        // A write that was mid-flight when the server stopped may or may not have landed. Never re-run it silently.
        .map((i) => (i.status === 'running' ? { ...i, status: 'failed' as const, reason: 'Server restarted while sending. Check before you retry.' } : i))
        .slice(0, MAX_ITEMS);
    } catch {
      this.items = [];
    }
  }

  private persist(): void {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ items: this.items }), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch {
      // best effort
    }
  }
}
