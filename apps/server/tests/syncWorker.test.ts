import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricsLedger } from '../src/harness/metricsLedger.js';
import { SnapshotStore, SNAPSHOT_TTL_MS } from '../src/harness/snapshotStore.js';
import type { SnapshotSource } from '../src/harness/snapshotStore.js';
import { BREAKER_OPEN_MS, FetchTimeoutError, SyncWorker, withTimeout } from '../src/harness/syncWorker.js';
import type { EffectiveRoute, Fetcher } from '../src/harness/syncWorker.js';
import { asOfHhmm, normalizeBrowserAnswer, tagProvenance } from '../src/harness/sourceSnapshots.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-sync-'));
  dirs.push(d);
  return d;
};

/** Fake clock + fake fetchers: no real network, no real browser, no real waiting. */
function rig(opts: { route?: EffectiveRoute; fetcher?: Fetcher; timeoutMs?: number; dataDir?: string } = {}) {
  const clock = { t: 1_000_000 };
  const now = () => clock.t;
  const store = new SnapshotStore({ now, dataDir: opts.dataDir });
  const ledger = new MetricsLedger({ now });
  const route = { effective: opts.route ?? ('api' as EffectiveRoute) };
  const sleeps: number[] = [];
  const calls = { n: 0 };
  const fetcher: Fetcher =
    opts.fetcher ??
    (async () => {
      calls.n++;
      return { cards: [calls.n] };
    });
  const changed: string[] = [];
  const worker = new SyncWorker({
    store,
    ledger,
    now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.t += ms;
    },
    timeoutMs: { api: opts.timeoutMs ?? 50, browser: opts.timeoutMs ?? 50, sample: 50 },
    resolveRoute: () => ({ effective: route.effective, reason: route.effective === 'off' ? 'pinned and unavailable' : undefined }),
    fetcherFor: () => fetcher,
    onChanged: (s) => changed.push(s),
  });
  return { clock, store, ledger, route, worker, sleeps, calls, changed };
}

describe('snapshot store', () => {
  it('returns instantly with ageMs and stale per the per-source ttl (calendar 2m, gmail 2m, notion 5m, telegram 30s)', () => {
    expect(SNAPSHOT_TTL_MS).toEqual({ calendar: 120_000, gmail: 120_000, notion: 300_000, telegram: 30_000 });
    const clock = { t: 5_000_000 };
    const store = new SnapshotStore({ now: () => clock.t });
    expect(store.get('calendar')).toBeNull();
    for (const s of ['calendar', 'gmail', 'notion', 'telegram'] as SnapshotSource[]) store.put(s, { s }, 'api', 123);
    clock.t += 31_000;
    expect(store.get('telegram')).toMatchObject({ stale: true, ageMs: 31_000, route: 'api', durationMs: 123 });
    expect(store.get('calendar')?.stale).toBe(false);
    clock.t += 90_000; // 121s
    expect(store.get('calendar')?.stale).toBe(true);
    expect(store.get('gmail')?.stale).toBe(true);
    expect(store.get('notion')?.stale).toBe(false);
    clock.t += 180_000; // 301s
    expect(store.get('notion')?.stale).toBe(true);
  });

  it('persists to dataDir, survives a reload, and reports changed only when the payload differs', () => {
    const dir = tmp();
    const clock = { t: 10_000 };
    const a = new SnapshotStore({ dataDir: dir, now: () => clock.t });
    expect(a.put('notion', { cards: [1] }, 'browser', 900).changed).toBe(true);
    expect(a.put('notion', { cards: [1] }, 'browser', 800).changed).toBe(false);
    expect(a.put('notion', { cards: [2] }, 'browser', 800).changed).toBe(true);
    const b = new SnapshotStore({ dataDir: dir, now: () => clock.t + 5_000 });
    expect(b.get('notion')).toMatchObject({ payload: { cards: [2] }, route: 'browser', durationMs: 800, ageMs: 5_000 });
    expect(b.meta('notion')).not.toHaveProperty('payload');
  });

  it('invalidate keeps the data but marks it stale; a corrupt file only means an empty store', () => {
    const dir = tmp();
    const s = new SnapshotStore({ dataDir: dir });
    s.put('gmail', { threads: [] }, 'api', 5);
    expect(s.get('gmail')?.stale).toBe(false);
    s.invalidate('gmail');
    expect(s.get('gmail')).toMatchObject({ stale: true, payload: { threads: [] } });
    fs.writeFileSync(path.join(dir, 'snapshots.json'), '{not json');
    expect(new SnapshotStore({ dataDir: dir }).get('gmail')).toBeNull();
  });
});

describe('sync worker', () => {
  it('stale-while-revalidate: read returns the old snapshot at once and kicks one refresh', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const slow = rig({
      fetcher: async () => {
        await gate;
        return { cards: ['new'] };
      },
      timeoutMs: 5_000,
    });
    slow.store.put('calendar', { cards: ['old'] }, 'api', 10);
    slow.clock.t += 130_000;
    const read = slow.worker.read('calendar');
    expect(read.snapshot?.payload).toEqual({ cards: ['old'] }); // instant, not waiting on the fetch
    expect(read.snapshot?.stale).toBe(true);
    expect(read.refreshing).toBe(true);
    release();
    await slow.worker.refresh('calendar'); // joins the same flight
    expect(slow.store.get('calendar')?.payload).toEqual({ cards: ['new'] });
    expect(slow.changed).toEqual(['calendar']);
  });

  it('single flight: concurrent refreshes share one fetch', async () => {
    let n = 0;
    const r = rig({
      fetcher: async () => {
        n++;
        await new Promise((res) => setTimeout(res, 5));
        return { n };
      },
    });
    const [a, b, c] = await Promise.all([r.worker.refresh('gmail'), r.worker.refresh('gmail'), r.worker.refresh('gmail')]);
    expect(n).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a.status).toBe('ok');
  });

  it('a fresh snapshot is not refetched by read or prefetch', async () => {
    const r = rig();
    await r.worker.refresh('notion');
    expect(r.calls.n).toBe(1);
    r.worker.read('notion');
    r.worker.prefetch(['notion']);
    await new Promise((res) => setTimeout(res, 5));
    expect(r.calls.n).toBe(1);
  });

  it('hard timeout: a hung fetch is cut off, the old snapshot stays, and the failure is recorded', async () => {
    const r = rig({ fetcher: () => new Promise(() => undefined), timeoutMs: 15 });
    r.store.put('calendar', { cards: ['kept'] }, 'api', 1);
    const res = await r.worker.refresh('calendar');
    expect(res.status).toBe('breaker_open'); // 3 attempts, all timed out
    expect(res.reason).toContain('Timed out');
    expect(r.store.get('calendar')?.payload).toEqual({ cards: ['kept'] });
    await expect(withTimeout(() => new Promise(() => undefined), 5)).rejects.toBeInstanceOf(FetchTimeoutError);
  });

  it('retries with backoff, max 3 attempts, and recovers on the third', async () => {
    let n = 0;
    const r = rig({
      fetcher: async () => {
        n++;
        if (n < 3) throw new Error(`boom ${n}`);
        return { ok: true };
      },
    });
    const res = await r.worker.refresh('telegram');
    expect(res.status).toBe('ok');
    expect(n).toBe(3);
    expect(r.sleeps).toEqual([500, 1000]); // exponential backoff between attempts
    expect(r.worker.breakerView('telegram', 'api').state).toBe('closed');
  });

  it('circuit breaker: opens after 3 consecutive failures for 60 s, serves the last snapshot stale with a reason, then half-open probes once', async () => {
    let healthy = false;
    let calls = 0;
    const r = rig({
      fetcher: async () => {
        calls++;
        if (!healthy) throw new Error('503 from upstream');
        return { cards: ['back'] };
      },
    });
    r.store.put('calendar', { cards: ['last good'] }, 'api', 1);
    const first = await r.worker.refresh('calendar');
    expect(first.status).toBe('breaker_open');
    expect(calls).toBe(3);
    expect(r.worker.breakerView('calendar', 'api')).toMatchObject({ state: 'open', failures: 3 });

    // while open: no fetch at all, the last snapshot is served, marked stale with a reason
    r.clock.t += 30_000; // still inside the 60 s open window
    const callsBefore = calls;
    const view = r.worker.read('calendar');
    expect(view.snapshot?.payload).toEqual({ cards: ['last good'] });
    expect(view.snapshot?.stale).toBe(true);
    expect(view.staleReason).toContain('503 from upstream');
    expect((await r.worker.refresh('calendar')).status).toBe('breaker_open');
    expect(calls).toBe(callsBefore);

    // after 60 s: half-open lets exactly one probe through; a failed probe re-opens
    r.clock.t += BREAKER_OPEN_MS;
    expect(r.worker.breakerView('calendar', 'api').state).toBe('half_open');
    expect((await r.worker.refresh('calendar')).status).toBe('breaker_open');
    expect(calls).toBe(callsBefore + 1);
    expect(r.worker.breakerView('calendar', 'api').state).toBe('open');

    // a successful probe closes it
    r.clock.t += BREAKER_OPEN_MS;
    healthy = true;
    const ok = await r.worker.refresh('calendar');
    expect(ok.status).toBe('ok');
    expect(calls).toBe(callsBefore + 2);
    expect(r.worker.breakerView('calendar', 'api')).toMatchObject({ state: 'closed', failures: 0 });
    expect(r.store.get('calendar')?.payload).toEqual({ cards: ['back'] });
  });

  it('breakers are per source and route', async () => {
    const r = rig({ fetcher: async () => Promise.reject(new Error('down')) });
    await r.worker.refresh('gmail');
    expect(r.worker.breakerView('gmail', 'api').state).toBe('open');
    expect(r.worker.breakerView('gmail', 'browser').state).toBe('closed');
    expect(r.worker.breakerView('notion', 'api').state).toBe('closed');
  });

  it('records every fetch in the metrics ledger as a tool step, ok or failed', async () => {
    let n = 0;
    const r = rig({
      fetcher: async () => {
        if (++n === 1) throw new Error('first fails');
        return { ok: 1 };
      },
    });
    await r.worker.refresh('notion');
    const steps = r.ledger.getSteps().filter((s) => s.provider === 'sync:notion:api');
    expect(steps.map((s) => [s.kind, s.ok])).toEqual([
      ['tool', false],
      ['tool', true],
    ]);
    expect(steps[0].error).toContain('first fails');
  });

  it('never fetches for an off source, never serves data from a route the owner switched away from', async () => {
    const r = rig({ route: 'off' });
    expect((await r.worker.refresh('telegram')).status).toBe('off');
    expect(r.calls.n).toBe(0);

    const s = rig({ route: 'api' });
    await s.worker.refresh('calendar');
    s.route.effective = 'browser'; // owner pinned computer: the api snapshot must not be served
    const read = s.worker.read('calendar');
    expect(read.snapshot).toBeNull();
    await s.worker.refresh('calendar');
    expect(s.store.get('calendar')?.route).toBe('browser');
  });

  it('timer is optional: start/stop are idempotent and tick only warms recently read sources', async () => {
    const r = rig();
    r.worker.start(60_000);
    r.worker.start(60_000);
    r.worker.stop();
    r.worker.stop();
    r.worker.tick(); // nothing was read, so nothing is fetched
    await new Promise((res) => setTimeout(res, 5));
    expect(r.calls.n).toBe(0);
    r.worker.read('calendar'); // starts a fetch because there is no snapshot
    await r.worker.refresh('calendar');
    const n = r.calls.n;
    r.clock.t += 130_000;
    r.worker.tick();
    await r.worker.refresh('calendar');
    expect(r.calls.n).toBe(n + 1);
  });
});

describe('browser answers and freshness tag', () => {
  it('normalizes the browser agent answer into the same payload shapes; unparsable answers throw', () => {
    const now = '2026-11-24T09:41:00.000Z';
    const cal = normalizeBrowserAnswer('calendar', '9:30 | Standup\n14:00 | Investor call', now) as { cards: Array<{ title: string; timeMeta: string; startIso: string }> };
    expect(cal.cards.map((c) => [c.timeMeta, c.title])).toEqual([['09:30', 'Standup'], ['14:00', 'Investor call']]);
    expect(cal.cards[0].startIso).toBe('2026-11-24T09:30:00.000Z');
    expect(() => normalizeBrowserAnswer('calendar', 'I could not find anything', now)).toThrow();
    expect((normalizeBrowserAnswer('notion', 'Ship outbox\nWrite docs', now) as { cards: unknown[] }).cards).toHaveLength(2);
    expect((normalizeBrowserAnswer('gmail', 'Priya | Q4 deck', now) as { threads: Array<{ subject: string }> }).threads[0].subject).toBe('Q4 deck');
    expect(normalizeBrowserAnswer('telegram', 'Priya\nCall me', now)).toEqual({ title: 'TG · Priya', detail: 'Call me' });
  });

  it('the freshness tag shows the fetch time and always fits the header budget', () => {
    const at = Date.parse('2026-11-24T09:41:30.000Z');
    expect(asOfHhmm(at)).toBe('09:41');
    const tagged = tagProvenance('GCAL+GMAIL+NOTION', at);
    expect(tagged).toContain('as of 09:41');
    expect(`LIVE | ${tagged}`.length + ' 12:00 1/5'.length).toBeLessThanOrEqual(42);
  });
});
