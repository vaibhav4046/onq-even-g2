import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Latest normalized payload per data source, so the glasses read a snapshot instantly and never wait on a slow
 * API or the owner's logged-in browser. Persisted in dataDir (snapshots.json, atomic write, owner-only mode).
 */

export type SnapshotSource = 'calendar' | 'gmail' | 'notion' | 'telegram';
export type SnapshotRoute = 'api' | 'browser' | 'sample';

export const SNAPSHOT_SOURCES: readonly SnapshotSource[] = ['calendar', 'gmail', 'notion', 'telegram'];

/** Per-source freshness window. Older than this = stale (still served, refresh kicked). */
export const SNAPSHOT_TTL_MS: Readonly<Record<SnapshotSource, number>> = {
  calendar: 120_000,
  gmail: 120_000,
  notion: 300_000,
  telegram: 30_000,
};

export interface SnapshotRecord<T = unknown> {
  source: SnapshotSource;
  payload: T;
  fetchedAt: number;
  route: SnapshotRoute;
  durationMs: number;
  /** Set by invalidate(): the data may be out of date even though it is young. */
  invalidated?: boolean;
  /** Digest of the payload, to tell "refreshed, nothing changed" from "refreshed, changed". */
  digest: string;
}

export interface SnapshotView<T = unknown> extends SnapshotRecord<T> {
  fetchedAtIso: string;
  ageMs: number;
  ttlMs: number;
  stale: boolean;
}

export type SnapshotMeta = Omit<SnapshotView<never>, 'payload'>;

const digestOf = (v: unknown): string => crypto.createHash('sha1').update(JSON.stringify(v) ?? 'null').digest('hex').slice(0, 16);

export class SnapshotStore {
  private records = new Map<SnapshotSource, SnapshotRecord>();
  private readonly file: string | null;
  private readonly now: () => number;
  private readonly ttl: Record<SnapshotSource, number>;

  constructor(opts: { dataDir?: string; now?: () => number; ttlMs?: Partial<Record<SnapshotSource, number>> } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.ttl = { ...SNAPSHOT_TTL_MS, ...opts.ttlMs };
    this.file = opts.dataDir ? path.join(opts.dataDir, 'snapshots.json') : null;
    if (this.file) this.load();
  }

  ttlMs(source: SnapshotSource): number {
    return this.ttl[source];
  }

  /** Stores a payload and returns whether it differs from the previous one. */
  put(source: SnapshotSource, payload: unknown, route: SnapshotRoute, durationMs: number): { changed: boolean } {
    const prev = this.records.get(source);
    const digest = digestOf(payload);
    this.records.set(source, { source, payload, fetchedAt: this.now(), route, durationMs: Math.max(0, Math.round(durationMs)), digest });
    this.persist();
    return { changed: !prev || prev.digest !== digest || prev.route !== route };
  }

  /** Instant read; never touches the network. */
  get<T = unknown>(source: SnapshotSource): SnapshotView<T> | null {
    const r = this.records.get(source);
    if (!r) return null;
    const ageMs = Math.max(0, this.now() - r.fetchedAt);
    const ttlMs = this.ttl[source];
    return { ...(r as SnapshotRecord<T>), fetchedAtIso: new Date(r.fetchedAt).toISOString(), ageMs, ttlMs, stale: Boolean(r.invalidated) || ageMs > ttlMs };
  }

  meta(source: SnapshotSource): SnapshotMeta | null {
    const v = this.get(source);
    if (!v) return null;
    const { payload: _p, ...rest } = v;
    return rest as SnapshotMeta;
  }

  /** Marks one source (or all) as needing a refresh without dropping what the glasses can still show. */
  invalidate(source?: SnapshotSource): void {
    for (const [s, r] of this.records) if (!source || s === source) this.records.set(s, { ...r, invalidated: true });
    this.persist();
  }

  private load(): void {
    try {
      if (!this.file || !fs.existsSync(this.file)) return;
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { records?: SnapshotRecord[] };
      for (const r of raw.records ?? []) {
        if (r && SNAPSHOT_SOURCES.includes(r.source) && Number.isFinite(r.fetchedAt) && ['api', 'browser', 'sample'].includes(r.route)) {
          this.records.set(r.source, { ...r, digest: r.digest ?? digestOf(r.payload) });
        }
      }
    } catch {
      this.records.clear(); // a corrupt snapshot file only means the next read refetches
    }
  }

  private persist(): void {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ records: [...this.records.values()] }), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch {
      // best effort: memory stays correct for this run
    }
  }
}
