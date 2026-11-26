import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricsLedger } from '../src/harness/metricsLedger.js';
import { Outbox, OutboxConflictError, OutboxRetryableError, toPublicItem } from '../src/harness/outbox.js';
import type { OutboxExecutor, OutboxItem, OutboxStatus } from '../src/harness/outbox.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-outbox-'));
  dirs.push(d);
  return d;
};

const ok: OutboxExecutor = async () => ({ receiptId: 'R-1', summaryLines: ['OK GCAL: moved'], canUndo: true });
const input = (key: string, over: Partial<Parameters<Outbox['enqueue']>[0]> = {}) => ({
  idempotencyKey: key,
  source: 'calendar' as const,
  route: 'browser' as const,
  title: 'Move VC sync',
  summaryLines: ['1) GCAL: 14:00 -> 14:15'],
  payload: { preview: { secret: 'never sent to clients' } },
  ...over,
});
const settle = () => new Promise((r) => setTimeout(r, 15));

function make(execute: OutboxExecutor, extra: Partial<ConstructorParameters<typeof Outbox>[0]> = {}) {
  const clock = { t: 1_000_000 };
  const seen: Array<[string, OutboxStatus]> = [];
  const ledger = new MetricsLedger({ now: () => clock.t });
  const box = new Outbox({ execute, now: () => clock.t, ledger, backoffBaseMs: 1_000, onChange: (i) => seen.push([i.id, i.status]), ...extra });
  return { box, clock, seen, ledger };
}

describe('write outbox', () => {
  it('walks queued -> running -> done, emits every transition, and keeps the payload private', async () => {
    const { box, seen, ledger } = make(ok);
    const { item, created } = await box.enqueue(input('k1'));
    expect(created).toBe(true);
    expect(['queued', 'running']).toContain(item.status); // not awaited: the caller is not held
    await settle();
    const done = box.get(item.id) as OutboxItem;
    expect(done).toMatchObject({ status: 'done', attempts: 1, result: { receiptId: 'R-1', canUndo: true }, reason: null });
    expect(seen.map((s) => s[1])).toEqual(['queued', 'running', 'done']);
    expect(JSON.stringify(toPublicItem(done))).not.toContain('never sent to clients');
    expect(ledger.getSteps().find((s) => s.provider === 'outbox:calendar:browser')).toMatchObject({ kind: 'tool', ok: true });
  });

  it('answers inline when the work finishes inside the inline budget, otherwise hands back the running item', async () => {
    const fast = make(ok);
    const quick = await fast.box.enqueue(input('fast', { route: 'api' }), { inlineMs: 500 });
    expect(quick.item.status).toBe('done');

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = make(async () => {
      await gate;
      return { receiptId: 'R-2', summaryLines: ['late'], canUndo: false };
    });
    const t0 = Date.now();
    const late = await slow.box.enqueue(input('slow', { route: 'api' }), { inlineMs: 40 });
    expect(Date.now() - t0).toBeLessThan(400);
    expect(late.item.status).toBe('running'); // past the budget: the request is released, the write continues
    release();
    await settle();
    expect(slow.box.get(late.item.id)?.status).toBe('done');
  });

  it('is idempotent: the same key never creates or runs a second item', async () => {
    let runs = 0;
    const { box } = make(async () => {
      runs++;
      return { receiptId: 'R', summaryLines: [], canUndo: false };
    });
    const a = await box.enqueue(input('same'));
    const b = await box.enqueue(input('same'));
    expect(b.created).toBe(false);
    expect(b.item.id).toBe(a.item.id);
    await settle();
    await box.enqueue(input('same'));
    expect(runs).toBe(1);
    expect(box.list()).toHaveLength(1);
  });

  it('a fresh approval of an action that failed or was cancelled starts a fresh item; live or finished ones are never duplicated', async () => {
    let fail = true;
    let runs = 0;
    const { box } = make(async () => {
      runs++;
      if (fail) throw new Error('first try fails');
      return { receiptId: 'R', summaryLines: ['OK'], canUndo: false };
    });
    const a = (await box.enqueue(input('again'))).item;
    await settle();
    expect(box.get(a.id)?.status).toBe('failed');
    fail = false;
    const b = await box.enqueue(input('again')); // same action, approved again
    expect(b.created).toBe(true);
    expect(b.item.id).not.toBe(a.id);
    await settle();
    expect(box.getByKey('again')).toMatchObject({ id: b.item.id, status: 'done' });
    expect(box.list()).toHaveLength(1);
    expect((await box.enqueue(input('again'))).created).toBe(false); // finished: never a second write
    expect(runs).toBe(2);
  });

  it('retryable failures back off and run again with an injected clock; three attempts max, then failed', async () => {
    let n = 0;
    const { box, clock } = make(async () => {
      n++;
      throw new OutboxRetryableError(`busy ${n}`);
    });
    const { item } = await box.enqueue(input('r1'));
    await settle();
    let cur = box.get(item.id) as OutboxItem;
    expect(cur).toMatchObject({ status: 'queued', attempts: 1 });
    expect(cur.nextAttemptAt).toBe(clock.t + 1_000);
    box.kick();
    await settle();
    expect(n).toBe(1); // not due yet: backoff is honored
    clock.t += 1_000;
    box.kick();
    await settle();
    cur = box.get(item.id) as OutboxItem;
    expect(cur).toMatchObject({ status: 'queued', attempts: 2 });
    expect(cur.nextAttemptAt).toBe(clock.t + 2_000);
    clock.t += 2_000;
    box.kick();
    await settle();
    expect(box.get(item.id)).toMatchObject({ status: 'failed', attempts: 3, reason: 'busy 3' });
    expect(n).toBe(3);
  });

  it('a plain error fails at once (no blind retry of a write that may have landed); manual retry re-queues it', async () => {
    let n = 0;
    const { box } = make(async () => {
      n++;
      if (n === 1) throw new Error('Google 500');
      return { receiptId: 'R-ok', summaryLines: ['OK'], canUndo: false };
    });
    const { item } = await box.enqueue(input('f1'));
    await settle();
    expect(box.get(item.id)).toMatchObject({ status: 'failed', attempts: 1, reason: 'Google 500' });
    expect(box.retry('nope')).toBeNull();
    expect(box.retry(item.id)?.status).toBe('queued');
    await settle();
    expect(box.get(item.id)).toMatchObject({ status: 'done', attempts: 1, reason: null }); // attempts restart on a manual retry
    expect(box.retry(item.id)).toBeNull(); // only failed items can be retried
  });

  it('per-item timeout fails the item and warns it may have partly gone through', async () => {
    const { box } = make(() => new Promise(() => undefined), { timeoutMs: { browser: 20, api: 20, sample: 20 } });
    const { item } = await box.enqueue(input('t1'));
    await new Promise((r) => setTimeout(r, 80));
    const cur = box.get(item.id) as OutboxItem;
    expect(cur.status).toBe('failed');
    expect(cur.reason).toContain('Timed out');
    expect(cur.reason).toContain('Check before retrying');
  });

  it('an execution-time 409 marks the item failed with the conflict and is never retried', async () => {
    let n = 0;
    const detail = { code: 'CONFLICT_CALENDAR_BUSY', message: 'Busy with Investor call' };
    const { box } = make(async () => {
      n++;
      throw new OutboxConflictError(detail.message, detail);
    });
    const { item } = await box.enqueue(input('c1'));
    await settle();
    box.kick();
    await settle();
    expect(n).toBe(1);
    expect(box.get(item.id)).toMatchObject({ status: 'failed', reason: 'Busy with Investor call', conflict: detail });
  });

  it('cancel only works while queued; a running write cannot be cancelled; done can be marked undone', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { box } = make(async (item) => {
      if (item.idempotencyKey === 'hold') await gate;
      return { receiptId: `R-${item.idempotencyKey}`, summaryLines: [], canUndo: true };
    });
    const running = (await box.enqueue(input('hold'))).item; // calendar lane is now busy
    await settle();
    const queued = (await box.enqueue(input('second'))).item; // same source lane: waits behind the running write
    expect(box.get(queued.id)?.status).toBe('queued');
    expect(box.cancel(running.id)).toBeNull(); // running: refused
    expect(box.cancel(queued.id)).toMatchObject({ status: 'undone', reason: 'Cancelled before it ran' });
    release();
    await settle();
    expect(box.get(running.id)?.status).toBe('done');
    box.markUndone(running.id);
    expect(box.get(running.id)?.status).toBe('undone');
    expect(box.get(queued.id)?.attempts).toBe(0); // the cancelled write never ran
  });

  it('writes to one source never overlap; different sources run in parallel', async () => {
    const active = new Set<string>();
    let overlapSameSource = false;
    let sawParallel = false;
    const { box } = make(async (item) => {
      if (active.has(item.source)) overlapSameSource = true;
      active.add(item.source);
      if (active.size > 1) sawParallel = true;
      await new Promise((r) => setTimeout(r, 10));
      active.delete(item.source);
      return { receiptId: 'R', summaryLines: [], canUndo: false };
    });
    await box.enqueue(input('a', { source: 'calendar' }));
    await box.enqueue(input('b', { source: 'calendar' }));
    await box.enqueue(input('c', { source: 'notion' }));
    await new Promise((r) => setTimeout(r, 60));
    expect(overlapSameSource).toBe(false);
    expect(sawParallel).toBe(true);
    expect(box.list().every((i) => i.status === 'done')).toBe(true);
  });

  it('persists in dataDir: queued survives a restart, a write that was mid-flight is failed (never silently re-run)', async () => {
    const dir = tmp();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = make(
      async () => {
        await gate;
        return { receiptId: 'R', summaryLines: [], canUndo: false };
      },
      { dataDir: dir },
    );
    const midFlight = (await first.box.enqueue(input('mid'))).item;
    await settle();
    const waiting = (await first.box.enqueue(input('wait'))).item; // queued behind it
    expect(first.box.get(midFlight.id)?.status).toBe('running');

    let reran = 0;
    const second = make(
      async () => {
        reran++;
        return { receiptId: 'R2', summaryLines: ['resumed'], canUndo: false };
      },
      { dataDir: dir },
    );
    expect(second.box.get(midFlight.id)).toMatchObject({ status: 'failed', reason: expect.stringContaining('Server restarted') });
    expect(second.box.get(waiting.id)?.status).toBe('queued');
    second.box.kick();
    await settle();
    expect(second.box.get(waiting.id)?.status).toBe('done');
    expect(reran).toBe(1); // only the queued one; the mid-flight one was not re-run
    release();
    expect(fs.statSync(path.join(dir, 'outbox.json')).isFile()).toBe(true);
  });

  it('start/stop are idempotent (the retry timer is never started by tests)', () => {
    const { box } = make(ok);
    box.start(10_000);
    box.start(10_000);
    box.stop();
    box.stop();
  });
});
