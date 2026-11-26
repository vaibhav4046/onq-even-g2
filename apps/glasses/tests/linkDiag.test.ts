import { describe, expect, it } from 'vitest';
import { backoffMs, DIAG, LinkSupervisor, PollTransport, runDiagnosis, type Clock, type Diag, type PollReply } from '../src/linkDiag';

const BASE = 'https://calm.trycloudflare.com';
const res = (status: number) => new Response('{}', { status });

/** Fake fetch routed by URL + init. Hanging requests honour the abort signal, like a real fetch. */
function fakeFetch(route: (url: string, init: RequestInit) => Response | Error | 'hang'): typeof fetch {
  return ((url: string, init: RequestInit = {}) =>
    new Promise((resolve, reject) => {
      const out = route(String(url), init);
      if (out === 'hang') {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        return;
      }
      if (out instanceof Error) reject(out);
      else resolve(out);
    })) as typeof fetch;
}
const input = (f: typeof fetch, over: Partial<Parameters<typeof runDiagnosis>[0]> = {}) => ({
  fetchImpl: f,
  base: BASE,
  deviceToken: 'odv_tok' as string | null,
  pageOrigin: BASE as string | null,
  onLine: true,
  stream: 'open' as const,
  timeoutMs: 30,
  ...over,
});

describe('backoff', () => {
  it('1, 2, 4, 8 then 15 seconds forever', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000]);
    expect(backoffMs(-3)).toBe(1000);
  });
});

describe('every HUD line fits the glasses', () => {
  it('is ASCII and at most 42 columns', () => {
    for (const d of Object.values(DIAG)) {
      expect(d.hud.length, d.code).toBeLessThanOrEqual(42);
      expect(/^[ -~]+$/.test(d.hud), d.code).toBe(true);
    }
    expect(DIAG.NET_BLOCKED.detail).toBe('NET BLOCKED by app permissions - open the link in browser mode.');
  });
});

describe('runDiagnosis (staged)', () => {
  const healthy = (url: string) => (url.endsWith('/api/health') || url.endsWith('/api/host/profile') ? res(200) : res(404));

  it('everything fine: OK', async () => {
    expect(await runDiagnosis(input(fakeFetch(healthy)))).toBe(DIAG.OK);
  });

  it('(a) offline device -> NO INTERNET; no answer within the timeout -> HOST OFFLINE', async () => {
    expect(await runDiagnosis(input(fakeFetch(() => new TypeError('Failed to fetch')), { onLine: false }))).toBe(DIAG.NO_INTERNET);
    expect(await runDiagnosis(input(fakeFetch(() => 'hang')))).toBe(DIAG.HOST_OFFLINE);
  });

  it('(a) tunnel up but nothing behind it (502 / 530) -> HOST OFFLINE', async () => {
    for (const s of [502, 503, 530]) expect(await runDiagnosis(input(fakeFetch(() => res(s))))).toBe(DIAG.HOST_OFFLINE);
  });

  it('(b) cross-origin failure with the network up -> NET BLOCKED by app permissions', async () => {
    const f = fakeFetch(() => new TypeError('Failed to fetch'));
    expect(await runDiagnosis(input(f, { pageOrigin: 'http://localhost:5174' }))).toBe(DIAG.NET_BLOCKED);
    expect(await runDiagnosis(input(f, { pageOrigin: null }))).toBe(DIAG.NET_BLOCKED);
  });

  it('(b) host reachable only without CORS (opaque response) -> NET BLOCKED', async () => {
    const f = fakeFetch((_u, init) => (init.mode === 'no-cors' ? res(200) : new TypeError('CORS')));
    expect(await runDiagnosis(input(f, { pageOrigin: 'http://localhost:5174' }))).toBe(DIAG.NET_BLOCKED);
  });

  it('(b) same-origin failure is simply the host being down', async () => {
    expect(await runDiagnosis(input(fakeFetch(() => new TypeError('Failed to fetch'))))).toBe(DIAG.HOST_OFFLINE);
  });

  it('(c) dead pairing -> PAIR EXPIRED (no retry); kill switch -> LOCKED (retry)', async () => {
    const dead = await runDiagnosis(input(fakeFetch((u) => (u.endsWith('/api/health') ? res(200) : res(401)))));
    expect(dead).toBe(DIAG.PAIR_EXPIRED);
    expect(dead.retry).toBe(false);
    const locked = await runDiagnosis(input(fakeFetch((u) => (u.endsWith('/api/health') ? res(200) : res(423)))));
    expect(locked).toBe(DIAG.LOCKED);
    expect(locked.retry).toBe(true);
  });

  it('(c) no token on a remote host -> NOT PAIRED; on loopback the demo path is fine', async () => {
    expect(await runDiagnosis(input(fakeFetch(healthy), { deviceToken: null }))).toBe(DIAG.NOT_PAIRED);
    expect(await runDiagnosis(input(fakeFetch(healthy), { deviceToken: null, base: 'http://127.0.0.1:8787', pageOrigin: 'http://localhost:5174' }))).toBe(DIAG.OK);
  });

  it('(d) a closed stream is degraded, not fatal: ok with the poll transport', async () => {
    const d: Diag = await runDiagnosis(input(fakeFetch(healthy), { stream: 'closed' }));
    expect(d).toMatchObject({ code: 'STREAM_DOWN', ok: true, transport: 'poll' });
    expect((await runDiagnosis(input(fakeFetch(healthy), { stream: 'unsupported' }))).transport).toBe('poll');
    expect((await runDiagnosis(input(fakeFetch(healthy), { stream: 'connecting' }))).transport).toBe('sse');
  });
});

function fakeClock() {
  const timers: Array<{ id: number; fn: () => void; ms: number }> = [];
  let n = 0;
  const clock: Clock = {
    schedule: (fn, ms) => {
      const id = ++n;
      timers.push({ id, fn, ms });
      return id;
    },
    clear: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  return {
    clock,
    timers,
    fire: async () => {
      const t = timers.shift();
      t?.fn();
      await Promise.resolve();
      await Promise.resolve();
      return t?.ms;
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('LinkSupervisor', () => {
  it('retries with 1, 2, 4, 8, 15, 15 s and never has more than one retry queued', async () => {
    const c = fakeClock();
    let calls = 0;
    const statuses: string[] = [];
    const sup = new LinkSupervisor({ diagnose: async () => (calls++, DIAG.HOST_OFFLINE), onStatus: (d) => statuses.push(d.code), onUp: () => undefined, clock: c.clock });
    await sup.check();
    sup.reportFailure(); // a transport complaining while a retry is queued changes nothing
    sup.reportFailure();
    await tick();
    expect(c.timers).toHaveLength(1);
    expect(calls).toBe(1);
    const waits: Array<number | undefined> = [c.timers[0].ms];
    for (let i = 0; i < 5; i++) {
      await c.fire();
      await tick();
      waits.push(c.timers[0]?.ms);
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
    expect(statuses.every((s) => s === 'HOST_OFFLINE')).toBe(true);
    expect(calls).toBe(6);
  });

  it('success resets the backoff and brings the link up; a later failure starts from 1 s again', async () => {
    const c = fakeClock();
    const seq: Diag[] = [DIAG.HOST_OFFLINE, DIAG.HOST_OFFLINE, DIAG.OK, DIAG.HOST_OFFLINE];
    let up = 0;
    const sup = new LinkSupervisor({ diagnose: async () => seq.shift() as Diag, onStatus: () => undefined, onUp: () => void up++, clock: c.clock });
    await sup.check();
    await c.fire();
    await tick();
    await c.fire();
    await tick();
    expect(up).toBe(1);
    expect(sup.retries).toBe(0);
    expect(c.timers).toHaveLength(0);
    sup.reportFailure();
    await tick();
    expect(c.timers[0].ms).toBe(1000);
  });

  it('stops retrying when only the user can fix it (pair expired)', async () => {
    const c = fakeClock();
    const sup = new LinkSupervisor({ diagnose: async () => DIAG.PAIR_EXPIRED, onStatus: () => undefined, onUp: () => undefined, clock: c.clock });
    await sup.check();
    expect(c.timers).toHaveLength(0);
  });

  it('a throwing diagnosis is treated as host offline, and stop() cancels the retry', async () => {
    const c = fakeClock();
    const sup = new LinkSupervisor({
      diagnose: async () => {
        throw new Error('boom');
      },
      onStatus: () => undefined,
      onUp: () => undefined,
      clock: c.clock,
    });
    expect((await sup.check())?.code).toBe('HOST_OFFLINE');
    expect(c.timers).toHaveLength(1);
    sup.stop();
    expect(c.timers).toHaveLength(0);
  });
});

describe('PollTransport', () => {
  const mk = (replies: Array<PollReply | null>) => {
    const c = fakeClock();
    const sinces: Array<number | null> = [];
    const events: Array<string | null> = [];
    const failures: number[] = [];
    let recovered = 0;
    const t = 1000;
    const p = new PollTransport({
      poll: async (since) => (sinces.push(since), replies.shift() ?? null),
      onChange: (e) => events.push(e),
      onFailure: (n) => failures.push(n),
      onRecovered: () => void recovered++,
      clock: c.clock,
      now: () => t,
    });
    return { c, p, sinces, events, failures, recovered: () => recovered };
  };

  it('carries the revision forward, reports changes, and never spins (minimum gap between polls)', async () => {
    const h = mk([
      { revision: 3, changed: true, event: 'corridor' },
      { revision: 3, changed: false, event: null },
    ]);
    h.p.start();
    await tick();
    expect(h.sinces).toEqual([null]);
    expect(h.events).toEqual(['corridor']);
    expect(h.c.timers[0].ms).toBe(300); // instant answer: wait at least 300 ms
    await h.c.fire();
    await tick();
    expect(h.sinces).toEqual([null, 3]);
    h.p.stop();
    expect(h.c.timers).toHaveLength(0);
  });

  it('failures back off 1, 2, 4 s, are counted, and recovery is announced once', async () => {
    const h = mk([null, null, null, { revision: 1, changed: false, event: null }]);
    h.p.start();
    await tick();
    const waits = [h.c.timers[0].ms];
    await h.c.fire();
    await tick();
    waits.push(h.c.timers[0].ms);
    await h.c.fire();
    await tick();
    waits.push(h.c.timers[0].ms);
    expect(waits).toEqual([1000, 2000, 4000]);
    expect(h.failures).toEqual([1, 2, 3]);
    await h.c.fire();
    await tick();
    expect(h.recovered()).toBe(1);
    expect(h.p.consecutiveFailures).toBe(0);
    h.p.stop();
  });

  it('runDiagnosis returns LOCKED when /api/host/profile reports locked: true on HTTP 200', async () => {
    const { runDiagnosis, DIAG } = await import('../src/linkDiag');
    const res = await runDiagnosis({
      base: 'https://demo.trycloudflare.com',
      pageOrigin: 'https://demo.trycloudflare.com',
      deviceToken: 'dev_tok_123',
      onLine: true,
      stream: 'open',
      fetchImpl: (async (url: string) => {
        if (String(url).includes('/api/host/profile')) {
          return new Response(JSON.stringify({ locked: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch,
    });
    expect(res.code).toBe(DIAG.LOCKED.code);
  });
});
