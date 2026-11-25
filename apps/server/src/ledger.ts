import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ActionPreview, CommitReceipt, SourceMode } from '@onq/core';

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

export interface MemoryRecord {
  id: string;
  kind: 'task' | 'voice' | 'meeting' | 'telegram' | 'note';
  title: string;
  summary: string;
  source: string;
  createdAtIso: string;
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
  saveEncryptedConnectorEnvelope?(userKey: string, envelopeJson: string): Promise<void>;
  loadEncryptedConnectorEnvelope?(userKey: string): Promise<string | null>;
  saveMemory?(item: MemoryRecord): Promise<void>;
  listMemories?(limit?: number, query?: string): Promise<MemoryRecord[]>;
  deleteMemory?(id: string): Promise<boolean>;
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
      CREATE TABLE IF NOT EXISTS user_connectors (
        user_key TEXT PRIMARY KEY,
        encrypted_envelope TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
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

  async saveEncryptedConnectorEnvelope(userKey: string, envelopeJson: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO user_connectors (user_key, encrypted_envelope, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_key) DO UPDATE SET encrypted_envelope = excluded.encrypted_envelope, updated_at = excluded.updated_at`,
      )
      .run(userKey, envelopeJson, this.nowFn());
  }

  async loadEncryptedConnectorEnvelope(userKey: string): Promise<string | null> {
    const row = this.db
      .prepare(`SELECT encrypted_envelope FROM user_connectors WHERE user_key = ?`)
      .get(userKey) as { encrypted_envelope: string } | undefined;
    return row?.encrypted_envelope ?? null;
  }

  async saveMemory(item: MemoryRecord): Promise<void> {
    const ms = Date.parse(item.createdAtIso) || this.nowFn();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO memories (id, kind, title, summary, source, created_at, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(item.id, item.kind, item.title, item.summary, item.source, item.createdAtIso, ms);
  }

  async listMemories(limit = 30, query?: string): Promise<MemoryRecord[]> {
    const cleanQ = query?.trim().toLowerCase();
    const rows = cleanQ
      ? (this.db
          .prepare(
            `SELECT id, kind, title, summary, source, created_at FROM memories WHERE lower(title) LIKE ? OR lower(summary) LIKE ? ORDER BY created_at_ms DESC LIMIT ?`,
          )
          .all(`%${cleanQ}%`, `%${cleanQ}%`, limit) as Array<{
          id: string;
          kind: MemoryRecord['kind'];
          title: string;
          summary: string;
          source: string;
          created_at: string;
        }>)
      : (this.db
          .prepare(`SELECT id, kind, title, summary, source, created_at FROM memories ORDER BY created_at_ms DESC LIMIT ?`)
          .all(limit) as Array<{
          id: string;
          kind: MemoryRecord['kind'];
          title: string;
          summary: string;
          source: string;
          created_at: string;
        }>);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      summary: r.summary,
      source: r.source,
      createdAtIso: r.created_at,
    }));
  }

  async deleteMemory(id: string): Promise<boolean> {
    const res = this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
    return Number(res.changes ?? 0) > 0;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export interface PgPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
  end?(): Promise<void>;
}

/**
 * Full Neon PostgreSQL LedgerStore implementation using parameterized SQL ($1, $2).
 */
export class PostgresLedgerStore implements LedgerStore {
  private initialized = false;

  constructor(
    private readonly pool: PgPoolLike,
    private readonly nowFn: () => number = () => Date.now(),
  ) {}

  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pairing_codes (
        code TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        consumed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS previews (
        preview_token TEXT PRIMARY KEY,
        session_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS receipts (
        receipt_id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rate_counters (
        bucket_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS user_connectors (
        user_key TEXT PRIMARY KEY,
        encrypted_envelope TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_ms BIGINT NOT NULL
      );
    `);
    this.initialized = true;
  }

  async createPairingCode(code: string, mode: SourceMode, ttlMs = 15 * 60_000): Promise<void> {
    await this.ensureSchema();
    const expiresAt = this.nowFn() + ttlMs;
    await this.pool.query(
      `INSERT INTO pairing_codes (code, mode, expires_at, attempts, locked, consumed)
       VALUES ($1, $2, $3, 0, 0, 0)
       ON CONFLICT (code) DO UPDATE SET mode = $2, expires_at = $3, attempts = 0, locked = 0, consumed = 0`,
      [code, mode, expiresAt],
    );
  }

  async exchangePairingCode(
    code: string,
  ): Promise<{ ok: true; sessionToken: string; mode: SourceMode } | { ok: false; status: 401 | 410 | 429; reason: string }> {
    await this.ensureSchema();
    const failRes = await this.pool.query(`SELECT count FROM rate_counters WHERE bucket_key = 'pair_failures'`);
    const failCount = Number(failRes.rows[0]?.count ?? 0);
    if (failCount >= 10) {
      return { ok: false, status: 429, reason: 'LOCKED: Too many failed pairing attempts' };
    }

    const res = await this.pool.query(
      `SELECT code, mode, expires_at, attempts, locked, consumed FROM pairing_codes WHERE code = $1`,
      [code],
    );
    const row = res.rows[0] as
      | { code: string; mode: SourceMode; expires_at: number | string; attempts: number; locked: number; consumed: number }
      | undefined;

    if (!row) {
      const up = await this.pool.query(
        `INSERT INTO rate_counters (bucket_key, count) VALUES ('pair_failures', 1)
         ON CONFLICT (bucket_key) DO UPDATE SET count = rate_counters.count + 1 RETURNING count`,
      );
      if (Number(up.rows[0]?.count ?? 0) >= 10) {
        return { ok: false, status: 429, reason: 'LOCKED: Too many failed pairing attempts' };
      }
      return { ok: false, status: 401, reason: 'Invalid pairing code' };
    }

    if (Number(row.locked) === 1 || Number(row.attempts) >= 10) {
      return { ok: false, status: 429, reason: 'LOCKED: Pairing code locked' };
    }
    if (Number(row.consumed) === 1) {
      return { ok: false, status: 401, reason: 'Pairing code already consumed' };
    }
    if (this.nowFn() > Number(row.expires_at)) {
      return { ok: false, status: 410, reason: 'Pairing code expired' };
    }

    await this.pool.query(`UPDATE pairing_codes SET consumed = 1 WHERE code = $1`, [code]);
    await this.pool.query(`DELETE FROM rate_counters WHERE bucket_key = 'pair_failures'`);
    const sessionToken = await this.mintSession(row.mode);
    return { ok: true, sessionToken, mode: row.mode };
  }

  async mintSession(mode: SourceMode): Promise<string> {
    await this.ensureSchema();
    const token = `oc_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(token);
    const now = this.nowFn();
    await this.pool.query(
      `INSERT INTO sessions (token_hash, mode, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
      [tokenHash, mode, now, now + 7 * 24 * 3600_000],
    );
    return token;
  }

  async validateSession(bearerToken: string | undefined): Promise<SessionRecord | null> {
    if (!bearerToken) return null;
    await this.ensureSchema();
    const candidateHash = hashToken(bearerToken);
    const res = await this.pool.query(
      `SELECT token_hash, mode, created_at, expires_at FROM sessions WHERE token_hash = $1`,
      [candidateHash],
    );
    const row = res.rows[0] as
      | { token_hash: string; mode: SourceMode; created_at: number | string; expires_at: number | string }
      | undefined;
    if (!row || !constantTimeHexEqual(row.token_hash, candidateHash)) return null;
    if (this.nowFn() > Number(row.expires_at)) return null;
    return {
      tokenHash: row.token_hash,
      mode: row.mode,
      createdAtMs: Number(row.created_at),
      expiresAtMs: Number(row.expires_at),
    };
  }

  async revokeSession(bearerToken: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(bearerToken)]);
  }

  async savePreview(preview: ActionPreview, sessionHash: string): Promise<void> {
    await this.ensureSchema();
    const exp = Date.parse(preview.expiresAtIso);
    await this.pool.query(
      `INSERT INTO previews (preview_token, session_hash, payload_json, expires_at, consumed)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (preview_token) DO UPDATE SET session_hash = $2, payload_json = $3, expires_at = $4, consumed = 0`,
      [preview.previewToken, sessionHash, JSON.stringify(preview), exp],
    );
  }

  async consumePreview(
    previewToken: string,
    sessionHash: string,
  ): Promise<{ ok: true; preview: ActionPreview } | { ok: false; status: 404 | 409 | 410; reason: string }> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `SELECT session_hash, payload_json, expires_at, consumed FROM previews WHERE preview_token = $1`,
      [previewToken],
    );
    const row = res.rows[0] as
      | { session_hash: string; payload_json: string; expires_at: number | string; consumed: number }
      | undefined;

    if (!row || !constantTimeHexEqual(row.session_hash, sessionHash)) {
      return { ok: false, status: 404, reason: 'Preview token not found' };
    }
    if (Number(row.consumed) === 1) {
      return { ok: false, status: 409, reason: 'Preview token already consumed (replay blocked)' };
    }
    if (this.nowFn() > Number(row.expires_at)) {
      return { ok: false, status: 410, reason: 'Preview token expired (45s TTL)' };
    }
    const upd = await this.pool.query(
      `UPDATE previews SET consumed = 1 WHERE preview_token = $1 AND consumed = 0`,
      [previewToken],
    );
    if ((upd.rowCount ?? 0) === 0) {
      return { ok: false, status: 409, reason: 'Preview token already consumed' };
    }
    return { ok: true, preview: JSON.parse(row.payload_json) as ActionPreview };
  }

  async getByIdempotency(idempotencyKey: string): Promise<CommitReceipt | null> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `SELECT payload_json FROM receipts WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    const row = res.rows[0] as { payload_json: string } | undefined;
    return row ? (JSON.parse(row.payload_json) as CommitReceipt) : null;
  }

  async saveReceipt(receipt: CommitReceipt): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO receipts (receipt_id, idempotency_key, status, payload_json, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (receipt_id) DO UPDATE SET status = $3, payload_json = $4`,
      [
        receipt.receiptId,
        receipt.idempotencyKey,
        receipt.status,
        JSON.stringify(receipt),
        Date.parse(receipt.committedAtIso) || this.nowFn(),
      ],
    );
  }

  async listReceipts(limit = 20): Promise<CommitReceipt[]> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `SELECT payload_json FROM receipts ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => JSON.parse(String(r.payload_json)) as CommitReceipt);
  }

  async checkAndConsumeRateLimit(
    dayKey: string,
    minuteKey: string,
    maxPerDay = 20,
    maxPerMin = 10,
  ): Promise<{ allowed: boolean; reason?: string }> {
    await this.ensureSchema();
    const dRes = await this.pool.query(`SELECT count FROM rate_counters WHERE bucket_key = $1`, [dayKey]);
    if (Number(dRes.rows[0]?.count ?? 0) >= maxPerDay) {
      return { allowed: false, reason: `Daily write cap (${maxPerDay}/day) reached` };
    }
    const mRes = await this.pool.query(`SELECT count FROM rate_counters WHERE bucket_key = $1`, [minuteKey]);
    if (Number(mRes.rows[0]?.count ?? 0) >= maxPerMin) {
      return { allowed: false, reason: `Per-minute write cap (${maxPerMin}/min) reached` };
    }
    await this.pool.query(
      `INSERT INTO rate_counters (bucket_key, count) VALUES ($1, 1)
       ON CONFLICT (bucket_key) DO UPDATE SET count = rate_counters.count + 1`,
      [dayKey],
    );
    await this.pool.query(
      `INSERT INTO rate_counters (bucket_key, count) VALUES ($1, 1)
       ON CONFLICT (bucket_key) DO UPDATE SET count = rate_counters.count + 1`,
      [minuteKey],
    );
    return { allowed: true };
  }

  async saveEncryptedConnectorEnvelope(userKey: string, envelopeJson: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO user_connectors (user_key, encrypted_envelope, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_key) DO UPDATE SET encrypted_envelope = $2, updated_at = $3`,
      [userKey, envelopeJson, this.nowFn()],
    );
  }

  async loadEncryptedConnectorEnvelope(userKey: string): Promise<string | null> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `SELECT encrypted_envelope FROM user_connectors WHERE user_key = $1`,
      [userKey],
    );
    const row = res.rows[0] as { encrypted_envelope: string } | undefined;
    return row?.encrypted_envelope ?? null;
  }

  async saveMemory(item: MemoryRecord): Promise<void> {
    await this.ensureSchema();
    const ms = Date.parse(item.createdAtIso) || this.nowFn();
    await this.pool.query(
      `INSERT INTO memories (id, kind, title, summary, source, created_at, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET kind = $2, title = $3, summary = $4, source = $5, created_at = $6, created_at_ms = $7`,
      [item.id, item.kind, item.title, item.summary, item.source, item.createdAtIso, ms],
    );
  }

  async listMemories(limit = 30, query?: string): Promise<MemoryRecord[]> {
    await this.ensureSchema();
    const cleanQ = query?.trim().toLowerCase();
    const res = cleanQ
      ? await this.pool.query(
          `SELECT id, kind, title, summary, source, created_at FROM memories WHERE lower(title) LIKE $1 OR lower(summary) LIKE $1 ORDER BY created_at_ms DESC LIMIT $2`,
          [`%${cleanQ}%`, limit],
        )
      : await this.pool.query(
          `SELECT id, kind, title, summary, source, created_at FROM memories ORDER BY created_at_ms DESC LIMIT $1`,
          [limit],
        );
    return res.rows.map((r) => ({
      id: String(r.id),
      kind: String(r.kind) as MemoryRecord['kind'],
      title: String(r.title),
      summary: String(r.summary),
      source: String(r.source),
      createdAtIso: String(r.created_at),
    }));
  }

  async deleteMemory(id: string): Promise<boolean> {
    await this.ensureSchema();
    const res = await this.pool.query(`DELETE FROM memories WHERE id = $1`, [id]);
    return Number(res.rowCount ?? 0) > 0;
  }

  async close(): Promise<void> {
    await this.pool.end?.();
  }
}

/**
 * Neon PostgreSQL adapter used automatically when DATABASE_URL is configured and `pg` is installed;
 * falls back cleanly to zero-config node:sqlite locally.
 */
export async function createConfiguredLedgerStore(
  dataDir: string,
  nowFn: () => number = () => Date.now(),
): Promise<LedgerStore> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return new SqliteLedgerStore(path.join(dataDir, 'onq.sqlite'), nowFn);
  }
  try {
    const pgModule = 'pg';
    const pg = (await import(pgModule)) as { Pool: new (opts: { connectionString: string }) => PgPoolLike };
    const pool = new pg.Pool({ connectionString: dbUrl });
    return new PostgresLedgerStore(pool, nowFn);
  } catch {
    return new SqliteLedgerStore(path.join(dataDir, 'onq.sqlite'), nowFn);
  }
}
