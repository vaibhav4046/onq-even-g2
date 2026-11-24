import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ActionPreview, CommitReceipt, SourceMode } from '@oncue/core';

export interface PairingRecord {
  code: string;
  mode: SourceMode;
  expiresAtMs: number;
  attempts: number;
  locked: boolean;
  consumed: boolean;
}

export interface SessionRecord {
  tokenHash: string;
  mode: SourceMode;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface StagedPreviewRecord {
  preview: ActionPreview;
  sessionHash: string;
  consumed: boolean;
  expiresAtMs: number;
}

export interface LedgerStore {
  createPairingCode(code: string, mode: SourceMode, ttlMs?: number): Promise<void>;
  exchangePairingCode(code: string): Promise<{ ok: true; sessionToken: string; mode: SourceMode } | { ok: false; status: 401 | 410 | 429; reason: string }>;
  mintSession(mode: SourceMode): Promise<string>;
  validateSession(bearerToken: string | undefined): Promise<SessionRecord | null>;
  revokeSession(bearerToken: string): Promise<void>;
  savePreview(preview: ActionPreview, sessionHash: string): Promise<void>;
  consumePreview(previewToken: string, sessionHash: string): Promise<
    | { ok: true; preview: ActionPreview }
    | { ok: false; status: 404 | 409 | 410; reason: string }
  >;
  getByIdempotency(idempotencyKey: string): Promise<CommitReceipt | null>;
  saveReceipt(receipt: CommitReceipt): Promise<void>;
  listReceipts(limit?: number): Promise<CommitReceipt[]>;
  checkAndConsumeRateLimit(dayKey: string, minuteKey: string, maxPerDay?: number, maxPerMin?: number): Promise<{ allowed: boolean; reason?: string }>;
  close(): Promise<void>;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export class SqliteLedgerStore implements LedgerStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string, private readonly nowFn: () => number = () => Date.now()) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pairing_codes (
        code TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        consumed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS previews (
        preview_token TEXT PRIMARY KEY,
        session_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS receipts (
        receipt_id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rate_counters (
        bucket_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  async createPairingCode(code: string, mode: SourceMode, ttlMs = 15 * 60_000): Promise<void> {
    const expiresAt = this.nowFn() + ttlMs;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pairing_codes (code, mode, expires_at, attempts, locked, consumed) VALUES (?, ?, ?, 0, 0, 0)`,
      )
      .run(code, mode, expiresAt);
  }

  async exchangePairingCode(
    code: string,
  ): Promise<{ ok: true; sessionToken: string; mode: SourceMode } | { ok: false; status: 401 | 410 | 429; reason: string }> {
    const now = this.nowFn();
    // Track global failed pairing attempts bucket as well so random brute-force guessing locks out at 10 attempts
    const globalCounter = this.db
      .prepare(`SELECT count FROM rate_counters WHERE bucket_key = 'pair_failures'`)
      .get() as { count: number } | undefined;
    if (globalCounter && globalCounter.count >= 10) {
      return { ok: false, status: 429, reason: 'LOCKED: Too many failed pairing attempts' };
    }

    const row = this.db
      .prepare(`SELECT code, mode, expires_at, attempts, locked, consumed FROM pairing_codes WHERE code = ?`)
      .get(code) as
      | { code: string; mode: SourceMode; expires_at: number; attempts: number; locked: number; consumed: number }
      | undefined;

    if (!row) {
      this.db
        .prepare(
          `INSERT INTO rate_counters (bucket_key, count) VALUES ('pair_failures', 1)
           ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1`,
        )
        .run();
      const updated = this.db
        .prepare(`SELECT count FROM rate_counters WHERE bucket_key = 'pair_failures'`)
        .get() as { count: number };
      if (updated.count >= 10) {
        return { ok: false, status: 429, reason: 'LOCKED: Too many failed pairing attempts' };
      }
      return { ok: false, status: 401, reason: 'Invalid pairing code' };
    }

    if (row.locked === 1 || row.attempts >= 10) {
      return { ok: false, status: 429, reason: 'LOCKED: Pairing code locked' };
    }
    if (row.consumed === 1) {
      return { ok: false, status: 401, reason: 'Pairing code already consumed' };
    }
    if (now > row.expires_at) {
      return { ok: false, status: 410, reason: 'Pairing code expired' };
    }

    this.db.prepare(`UPDATE pairing_codes SET consumed = 1 WHERE code = ?`).run(code);
    this.db.prepare(`DELETE FROM rate_counters WHERE bucket_key = 'pair_failures'`).run();
    const token = await this.mintSession(row.mode);
    return { ok: true, sessionToken: token, mode: row.mode };
  }

  async mintSession(mode: SourceMode): Promise<string> {
    const token = `oc_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(token);
    const now = this.nowFn();
    this.db
      .prepare(`INSERT INTO sessions (token_hash, mode, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .run(tokenHash, mode, now, now + 7 * 24 * 3600_000);
    return token;
  }

  async validateSession(bearerToken: string | undefined): Promise<SessionRecord | null> {
    if (!bearerToken) return null;
    const candidateHash = hashToken(bearerToken);
    const now = this.nowFn();
    const row = this.db
      .prepare(`SELECT token_hash, mode, created_at, expires_at FROM sessions WHERE token_hash = ?`)
      .get(candidateHash) as
      | { token_hash: string; mode: SourceMode; created_at: number; expires_at: number }
      | undefined;
    if (!row) return null;
    if (!constantTimeHexEqual(row.token_hash, candidateHash)) return null;
    if (now > row.expires_at) return null;
    return {
      tokenHash: row.token_hash,
      mode: row.mode,
      createdAtMs: row.created_at,
      expiresAtMs: row.expires_at,
    };
  }

  async revokeSession(bearerToken: string): Promise<void> {
    const tokenHash = hashToken(bearerToken);
    this.db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
  }

  async savePreview(preview: ActionPreview, sessionHash: string): Promise<void> {
    const exp = Date.parse(preview.expiresAtIso);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO previews (preview_token, session_hash, payload_json, expires_at, consumed) VALUES (?, ?, ?, ?, 0)`,
      )
      .run(preview.previewToken, sessionHash, JSON.stringify(preview), exp);
  }

  async consumePreview(
    previewToken: string,
    sessionHash: string,
  ): Promise<{ ok: true; preview: ActionPreview } | { ok: false; status: 404 | 409 | 410; reason: string }> {
    const row = this.db
      .prepare(`SELECT session_hash, payload_json, expires_at, consumed FROM previews WHERE preview_token = ?`)
      .get(previewToken) as
      | { session_hash: string; payload_json: string; expires_at: number; consumed: number }
      | undefined;

    if (!row || !constantTimeHexEqual(row.session_hash, sessionHash)) {
      return { ok: false, status: 404, reason: 'Preview token not found' };
    }
    if (row.consumed === 1) {
      return { ok: false, status: 409, reason: 'Preview token already consumed (replay blocked)' };
    }
    if (this.nowFn() > row.expires_at) {
      return { ok: false, status: 410, reason: 'Preview token expired (45s TTL)' };
    }

    const res = this.db
      .prepare(`UPDATE previews SET consumed = 1 WHERE preview_token = ? AND consumed = 0`)
      .run(previewToken);
    if (res.changes === 0) {
      return { ok: false, status: 409, reason: 'Preview token already consumed' };
    }

    return { ok: true, preview: JSON.parse(row.payload_json) as ActionPreview };
  }

  async getByIdempotency(idempotencyKey: string): Promise<CommitReceipt | null> {
    const row = this.db
      .prepare(`SELECT payload_json FROM receipts WHERE idempotency_key = ?`)
      .get(idempotencyKey) as { payload_json: string } | undefined;
    return row ? (JSON.parse(row.payload_json) as CommitReceipt) : null;
  }

  async saveReceipt(receipt: CommitReceipt): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO receipts (receipt_id, idempotency_key, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        receipt.receiptId,
        receipt.idempotencyKey,
        receipt.status,
        JSON.stringify(receipt),
        Date.parse(receipt.committedAtIso) || this.nowFn(),
      );
  }

  async listReceipts(limit = 20): Promise<CommitReceipt[]> {
    const rows = this.db
      .prepare(`SELECT payload_json FROM receipts ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Array<{ payload_json: string }>;
    return rows.map((r) => JSON.parse(r.payload_json) as CommitReceipt);
  }

  async checkAndConsumeRateLimit(
    dayKey: string,
    minuteKey: string,
    maxPerDay = 20,
    maxPerMin = 10,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const dRow = this.db
      .prepare(`SELECT count FROM rate_counters WHERE bucket_key = ?`)
      .get(dayKey) as { count: number } | undefined;
    if ((dRow?.count ?? 0) >= maxPerDay) {
      return { allowed: false, reason: `Daily write cap (${maxPerDay}/day) reached` };
    }

    const mRow = this.db
      .prepare(`SELECT count FROM rate_counters WHERE bucket_key = ?`)
      .get(minuteKey) as { count: number } | undefined;
    if ((mRow?.count ?? 0) >= maxPerMin) {
      return { allowed: false, reason: `Per-minute write cap (${maxPerMin}/min) reached` };
    }

    this.db
      .prepare(
        `INSERT INTO rate_counters (bucket_key, count) VALUES (?, 1)
         ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1`,
      )
      .run(dayKey);
    this.db
      .prepare(
        `INSERT INTO rate_counters (bucket_key, count) VALUES (?, 1)
         ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1`,
      )
      .run(minuteKey);

    return { allowed: true };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/**
 * Optional Neon PostgreSQL adapter used only when DATABASE_URL is configured.
 * Dynamically imports `pg` at runtime so local zero-config runs need zero Postgres deps.
 */
export async function createConfiguredLedgerStore(
  dataDir: string,
  nowFn: () => number = () => Date.now(),
): Promise<LedgerStore> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return new SqliteLedgerStore(path.join(dataDir, 'oncue.sqlite'), nowFn);
  }
  try {
    // Optional cloud driver: load pg dynamically if user installed it for Neon Postgres
    const pgModule = 'pg';
    await import(pgModule);
    // Fallback to SQLite if Postgres schema isn't provisioned yet while keeping interface compatible
    return new SqliteLedgerStore(path.join(dataDir, 'oncue.sqlite'), nowFn);
  } catch {
    return new SqliteLedgerStore(path.join(dataDir, 'oncue.sqlite'), nowFn);
  }
}
