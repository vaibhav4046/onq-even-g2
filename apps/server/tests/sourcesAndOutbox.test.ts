import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveWorkspaceProvider } from '../src/providers/liveProvider.js';
import type { WorkspaceProvider } from '../src/providers/types.js';
import type { BrowserAction, BrowserDriver, Planner } from '../src/harness/browserAgent.js';
import type { ScannerDeps } from '../src/providers/providerScanner.js';
import { createOnQServer } from '../src/server.js';

const HERMETIC_ENV = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'NOTION_TOKEN', 'NOTION_DATABASE_ID', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'];
const savedEnv = new Map(HERMETIC_ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of HERMETIC_ENV) delete process.env[k];
});
afterAll(() => {
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await (closers.pop() as () => Promise<void>)();
});

const fakeScanner = (): Partial<ScannerDeps> => ({
  env: { PATH: 'C:\\nowhere' },
  platform: 'win32',
  homedir: 'C:\\Users\\tester',
  exists: () => false,
  fetchImpl: (async () => {
    throw new TypeError('fetch failed: ECONNREFUSED');
  }) as typeof fetch,
  probeCli: async () => ({ ok: false, ms: 1 }),
  cliProbeTimeoutMs: 20,
});

/** A fake Chrome: no page, no network. The planner decides the "answer" for each goal. */
function fakeChrome(answerFor: (goal: string) => string | Promise<string>) {
  const goals: string[] = [];
  const driver = (): BrowserDriver => ({
    goto: async () => undefined,
    snapshot: async () => ({ url: 'about:blank', title: 'fake', text: '', elements: [] }),
    click: async () => undefined,
    type: async () => undefined,
    scroll: async () => undefined,
    close: async () => undefined,
  });
  const planner: Planner = async ({ goal }) => {
    goals.push(goal);
    const answer = await answerFor(goal);
    const action: BrowserAction = { type: 'done', answer };
    return { plan: { action, reason: 'test' }, providerLabel: 'Fake planner' };
  };
  return { goals, driver, planner };
}

const READS: Record<string, string> = {
  'calendar.google.com': '09:30 | Standup\n14:00 | Investor call',
  'notion.so': 'Ship the outbox',
  'mail.google.com': 'Priya | Q4 deck',
  'web.telegram.org': 'Priya\nCall me when free',
};
const readAnswer = (goal: string) => Object.entries(READS).find(([host]) => goal.includes(host))?.[1] ?? 'Done.';

const ICS = (extra = '') =>
  [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:ics-live-1',
    'DTSTART:20991124T140000Z',
    'DTEND:20991124T143000Z',
    'SUMMARY:Investor Check-in',
    'ATTENDEE;CN=Fund contact:mailto:fund@sample.example',
    'END:VEVENT',
    extra,
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

interface Boot {
  srv: Awaited<ReturnType<typeof createOnQServer>>;
  clock: { t: number };
  owner: Record<string, string>;
  live: Record<string, string>;
  get: (p: string, h?: Record<string, string>) => Promise<{ status: number; body: any }>;
  post: (p: string, body?: unknown, h?: Record<string, string>) => Promise<{ status: number; body: any }>;
  del: (p: string, h?: Record<string, string>) => Promise<{ status: number; body: any }>;
  pair: () => Promise<Record<string, string>>;
  sse: (headers?: Record<string, string>) => { events: Array<{ event: string; data: any }>; close: () => void };
  goLive: (ics?: string) => Promise<void>;
  dir: string;
  close: () => Promise<void>;
}

async function boot(extra: Parameters<typeof createOnQServer>[0] = {}, dataDir?: string, ics?: { text: string }): Promise<Boot> {
  const dir = dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'onq-src-'));
  const clock = { t: Date.now() };
  const srv = await createOnQServer({ port: 0, dataDir: dir, allowTestFaultControls: true, scannerDeps: fakeScanner(), nowFn: () => clock.t, ...extra });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await srv.close();
  };
  closers.push(async () => {
    await close();
    if (!dataDir) fs.rmSync(dir, { recursive: true, force: true });
  });
  const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
  const owner = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
  const b: Boot = {
    srv,
    clock,
    owner,
    live: owner,
    dir,
    close,
    get: async (p, h = b.live) => {
      const r = await fetch(`${srv.url}${p}`, { headers: h });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    post: async (p, body = {}, h = b.live) => {
      const r = await fetch(`${srv.url}${p}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    del: async (p, h = b.live) => {
      const r = await fetch(`${srv.url}${p}`, { method: 'DELETE', headers: h });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    pair: async () => {
      const code = (await (await fetch(`${srv.url}/api/pair/code`, { method: 'POST' })).json()) as { code: string };
      const res = await fetch(`${srv.url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code: code.code, label: 'Even G2' }) });
      const { deviceToken } = (await res.json()) as { deviceToken: string };
      return { 'x-onq-device': deviceToken, 'Content-Type': 'application/json' };
    },
    sse: (headers = b.live) => {
      const events: Array<{ event: string; data: any }> = [];
      const u = new URL(`${srv.url}/api/stream`);
      const req = http.get({ host: u.hostname, port: u.port, path: u.pathname, headers }, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buf += chunk;
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = /event: (.*)/.exec(frame)?.[1];
            const data = /data: (.*)/.exec(frame)?.[1];
            if (ev && data) events.push({ event: ev, data: JSON.parse(data) });
          }
        });
      });
      req.on('error', () => undefined);
      return { events, close: () => req.destroy() };
    },
    /** Imports an ICS calendar: this upgrades the session to LIVE (calendar becomes a connected source). */
    goLive: async (text = ics?.text ?? ICS()) => {
      const r = await b.post('/api/pair/ics', { icsText: text }, owner);
      expect(r.status).toBe(200);
      b.live = { Authorization: `Bearer ${r.body.sessionToken}`, 'Content-Type': 'application/json' };
    },
  };
  return b;
}

const until = async (fn: () => Promise<boolean> | boolean, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
};

describe('GET /api/sources and per-source modes', () => {
  it('lists the four sources with mode auto and honest defaults, before anything has synced', async () => {
    const b = await boot();
    const r = await b.get('/api/sources');
    expect(r.status).toBe(200);
    expect(r.body.sources.map((s: any) => s.source)).toEqual(['calendar', 'gmail', 'notion', 'telegram']);
    for (const s of r.body.sources) {
      expect(s).toMatchObject({ mode: 'auto', effective: 'sample', reason: null, p50Ms: null, lastSyncAt: null, stale: null, breaker: 'closed', route: null, refreshing: false });
      expect(s.ttlMs).toBeGreaterThan(0);
    }
    expect(r.body.sources.map((s: any) => s.ttlMs)).toEqual([120_000, 120_000, 300_000, 30_000]);
    expect(typeof r.body.revision).toBe('number');
  });

  it('api pinned but not connected is off with a reason and never falls back; computer pinned without a driver is off', async () => {
    const b = await boot();
    const m = await b.post('/api/sources/calendar/mode', { mode: 'api' });
    expect(m.status).toBe(200);
    expect(m.body).toMatchObject({ source: 'calendar', mode: 'api', effective: 'off', changed: true });
    expect(m.body.reason).toMatch(/not connected/i);
    expect(m.body.reason).toMatch(/no fallback/i);
    const c = await b.post('/api/sources/gmail/mode', { mode: 'computer' });
    expect(c.body).toMatchObject({ effective: 'off' });
    expect(c.body.reason).toMatch(/browser driver not ready/i);
    const rows = (await b.get('/api/sources')).body.sources;
    expect(rows.find((s: any) => s.source === 'notion')).toMatchObject({ mode: 'auto', effective: 'sample' });
  });

  it('computer pinned with a ready browser driver is the browser route; api pinned with a connected source is api', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456789:AAFakeTokenForRoutesOnly0123456789ab';
    const chrome = fakeChrome(readAnswer);
    const b = await boot({ browserDriverFactory: chrome.driver, browserPlanner: chrome.planner });
    expect((await b.post('/api/sources/notion/mode', { mode: 'computer' })).body.effective).toBe('browser');
    expect((await b.post('/api/sources/telegram/mode', { mode: 'api' })).body.effective).toBe('api');
    expect((await b.post('/api/sources/telegram/mode', { mode: 'computer' })).body.effective).toBe('browser'); // token saved, but the owner chose Chrome
    const auto = (await b.post('/api/sources/telegram/mode', { mode: 'auto' })).body;
    expect(auto.effective).toBe('api'); // auto prefers the connected api over the browser
  });

  it('a mode change bumps the host revision, emits the host SSE event, shows in the profile and persists across a restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-modes-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const b = await boot({}, dir);
    const before = (await b.get('/api/host/profile')).body;
    const stream = b.sse();
    await until(() => stream.events.some((e) => e.event === 'connected'));
    const m = await b.post('/api/sources/telegram/mode', { mode: 'api' });
    expect(m.body.revision).toBeGreaterThan(before.revision);
    expect(await until(() => stream.events.some((e) => e.event === 'host' && e.data.revision === m.body.revision))).toBe(true);
    stream.close();
    const after = (await b.get('/api/host/profile')).body;
    expect(after.dataSources.find((d: any) => d.source === 'telegram')).toMatchObject({ mode: 'api', effective: 'off' });
    expect(Object.keys(after.dataSources[0]).sort()).toEqual(['breaker', 'effective', 'evidence', 'lastSyncAt', 'mode', 'p50Ms', 'probed', 'reason', 'source', 'stale']);

    const same = await b.post('/api/sources/telegram/mode', { mode: 'api' });
    expect(same.body.changed).toBe(false);
    expect(same.body.revision).toBe(m.body.revision); // no change, no bump
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'source-modes.json'), 'utf8')).telegram).toBe('api');

    await b.close();
    const again = await boot({}, dir);
    expect((await again.get('/api/sources')).body.sources.find((s: any) => s.source === 'telegram').mode).toBe('api');
  });

  it('rejects bad input and unknown sources; paired devices may read but never change anything', async () => {
    const b = await boot();
    expect((await b.post('/api/sources/calendar/mode', { mode: 'turbo' })).status).toBe(400);
    expect((await b.post('/api/sources/slack/mode', { mode: 'api' })).status).toBe(404);
    const dev = await b.pair();
    expect((await b.get('/api/sources', dev)).status).toBe(200);
    expect((await b.get('/api/outbox', dev)).status).toBe(200);
    expect((await b.post('/api/sources/calendar/mode', { mode: 'api' }, dev)).status).toBe(403);
    expect((await b.post('/api/sources/calendar/sync', {}, dev)).status).toBe(403);
    expect((await b.post('/api/outbox/ob_abc123/retry', {}, dev)).status).toBe(403);
    expect((await b.del('/api/outbox/ob_abc123', dev)).status).toBe(403);
    expect((await b.get('/api/sources', {})).status).toBe(401);
  });
});

describe('corridor reads snapshots, never waits on a slow source', () => {
  it('browser route: the corridor answers at once, the sync fills the snapshot, then the cards come from it; card order is kept', async () => {
    const chrome = fakeChrome(readAnswer);
    const b = await boot({ browserDriverFactory: chrome.driver, browserPlanner: chrome.planner });
    await b.goLive();
    await b.post('/api/sources/calendar/mode', { mode: 'computer' });
    await b.post('/api/sources/notion/mode', { mode: 'computer' });
    await b.post('/api/sources/gmail/mode', { mode: 'computer' });

    const t0 = Date.now();
    const first = await b.get('/api/corridor');
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(first.status).toBe(200);
    // no snapshot yet: nothing blocked, the telegram / laptop / OS cards are still there in order
    const ids = first.body.cards.map((c: any) => c.id);
    expect(ids.slice(-3)).toEqual(['card-telegram-bridge', 'card-computer-proactive', expect.stringMatching(/unified|os/i)]);

    expect(await until(async () => (await b.get('/api/sources')).body.sources.filter((s: any) => ['calendar', 'notion', 'gmail'].includes(s.source)).every((s: any) => s.lastSyncAt))).toBe(true);
    const rows = (await b.get('/api/sources')).body.sources;
    expect(rows.find((s: any) => s.source === 'calendar')).toMatchObject({ mode: 'computer', effective: 'browser', route: 'browser', stale: false, breaker: 'closed' });
    expect(typeof rows.find((s: any) => s.source === 'calendar').p50Ms).toBe('number');

    const second = await b.get('/api/corridor');
    const titles = second.body.cards.map((c: any) => c.title);
    expect(titles).toEqual(expect.arrayContaining(['Standup', 'Investor call', 'Ship the outbox']));
    expect(second.body.provenanceLabel).not.toContain('as of'); // young snapshot: wording unchanged
    expect(chrome.goals.some((g) => g.includes('calendar.google.com'))).toBe(true);
  });

  it('api route: first call fetches once, later calls read the snapshot, a stale one is served at once with an "as of" tag and refreshed behind', async () => {
    let fetches = 0;
    let gate: Promise<void> | null = null;
    const real = new LiveWorkspaceProvider({ getIcsFeed: () => ICS() });
    const provider: WorkspaceProvider = {
      mode: 'LIVE',
      fetchCorridor: async (n) => {
        fetches++;
        if (gate) await gate;
        return real.fetchCorridor(n);
      },
      checkLiveConflicts: (p) => real.checkLiveConflicts(p),
      executePreview: (i) => real.executePreview(i),
      undoReceipt: (r) => real.undoReceipt(r),
      getSnapshot: () => real.getSnapshot(),
    };
    const b = await boot({ liveProviderOverride: provider });
    await b.goLive();
    expect((await b.get('/api/sources')).body.sources.find((s: any) => s.source === 'calendar')).toMatchObject({ effective: 'api' });

    const first = await b.get('/api/corridor'); // no snapshot ever: one inline fetch
    expect(first.body.cards[0].title).toBe('Investor Check-in');
    expect(fetches).toBe(1);
    const again = await b.get('/api/corridor');
    expect(again.body.cards[0].title).toBe('Investor Check-in');
    expect(fetches).toBe(1); // served from the snapshot

    b.clock.t += 3 * 60_000; // past the 2 minute calendar ttl
    let release!: () => void;
    gate = new Promise<void>((r) => (release = r));
    const t0 = Date.now();
    const stale = await b.get('/api/corridor'); // the refresh is hanging, the glasses still get an answer
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(stale.body.cards[0].title).toBe('Investor Check-in');
    expect(stale.body.provenanceLabel).toMatch(/as of \d\d:\d\d$/);
    expect(stale.body.provenanceLabel.length + 'LIVE | '.length + ' 12:00 1/5'.length).toBeLessThanOrEqual(42);
    expect(stale.body.cards[0].provenanceLabel).toMatch(/as of \d\d:\d\d$/);
    expect((await b.get('/api/sources')).body.sources.find((s: any) => s.source === 'calendar')).toMatchObject({ stale: true, refreshing: true });
    release();
    expect(await until(async () => !(await b.get('/api/sources')).body.sources.find((s: any) => s.source === 'calendar').refreshing)).toBe(true);
    expect(fetches).toBe(2);
    const fresh = await b.get('/api/corridor');
    expect(fresh.body.provenanceLabel).not.toContain('as of');
  });

  it('a source that keeps failing opens its breaker, keeps serving the last snapshot, and the sync endpoint reports it', async () => {
    let fail = false;
    const real = new LiveWorkspaceProvider({ getIcsFeed: () => ICS() });
    const provider: WorkspaceProvider = {
      mode: 'LIVE',
      fetchCorridor: async (n) => {
        if (fail) throw new Error('upstream 503');
        return real.fetchCorridor(n);
      },
      checkLiveConflicts: (p) => real.checkLiveConflicts(p),
      executePreview: (i) => real.executePreview(i),
      undoReceipt: (r) => real.undoReceipt(r),
      getSnapshot: () => real.getSnapshot(),
    };
    const b = await boot({ liveProviderOverride: provider });
    await b.goLive();
    expect((await b.get('/api/corridor')).body.cards[0].title).toBe('Investor Check-in');
    fail = true;
    const sync = await b.post('/api/sources/calendar/sync?wait=1');
    expect(sync.body).toMatchObject({ source: 'calendar', status: 'breaker_open' });
    expect(sync.body.reason).toContain('upstream 503');
    const row = (await b.get('/api/sources')).body.sources.find((s: any) => s.source === 'calendar');
    expect(row).toMatchObject({ breaker: 'open', failures: 3, stale: false });
    expect(row.staleReason).toContain('upstream 503');
    expect(row.retryAt).toBeTruthy();
    const cor = await b.get('/api/corridor'); // still answers, from the last good snapshot
    expect(cor.body.cards[0].title).toBe('Investor Check-in');
    const profile = (await b.get('/api/host/profile')).body;
    expect(profile.dataSources.find((d: any) => d.source === 'calendar').breaker).toBe('open');
  });

  it('POST /api/sources/:id/sync answers quickly with the snapshot meta; off sources are not fetched', async () => {
    const b = await boot();
    const off = await b.post('/api/sources/gmail/mode', { mode: 'api' });
    expect(off.body.effective).toBe('off');
    const s1 = await b.post('/api/sources/gmail/sync');
    expect(s1.body).toMatchObject({ status: 'off', snapshot: null });
    const s2 = await b.post('/api/sources/telegram/sync?wait=1'); // sample route is instant
    expect(s2.body).toMatchObject({ status: 'ok', route: 'sample' });
    expect(s2.body.snapshot).toMatchObject({ route: 'sample', stale: false });
    expect(s2.body.snapshot).not.toHaveProperty('payload');
  });
});

describe('write outbox over HTTP', () => {
  /** Live ICS session, calendar pinned to the owner's Chrome, a staged "push 15m" ready to commit. */
  async function stagedOnChrome(answerFor: (goal: string) => string | Promise<string>, extra: Parameters<typeof createOnQServer>[0] = {}) {
    const chrome = fakeChrome(answerFor);
    const real = new LiveWorkspaceProvider({ getIcsFeed: () => icsText.value });
    const icsText = { value: ICS() };
    const b = await boot({ browserDriverFactory: chrome.driver, browserPlanner: chrome.planner, liveProviderOverride: real, ...extra });
    await b.goLive();
    await b.post('/api/sources/calendar/mode', { mode: 'computer' });
    await b.post('/api/sources/gmail/mode', { mode: 'computer' });
    await b.post('/api/sources/notion/mode', { mode: 'computer' });
    // The corridor under computer mode has no calendar snapshot yet, so stage against the provider's own card.
    const card = (await real.fetchCorridor(new Date(b.clock.t).toISOString())).cards[0];
    const staged = await b.post('/api/actions/stage', { cardId: card.id, commandText: 'Push 15m' });
    expect(staged.status).toBe(200);
    return { b, chrome, preview: staged.body, icsText, real };
  }

  it('a write on the browser route is queued, answers 202 at once, runs in the background and reports queued -> sending -> done', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { b, chrome, preview } = await stagedOnChrome(async (goal) => {
      if (goal.includes('already approved')) await gate;
      return readAnswer(goal);
    });
    const stream = b.sse();
    await until(() => stream.events.some((e) => e.event === 'connected'));
    const t0 = Date.now();
    const commit = await b.post('/api/actions/commit', { previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(commit.status).toBe(202);
    expect(commit.body).toMatchObject({ status: 'QUEUED', idempotencyKey: preview.idempotencyKey, outbox: { status: expect.stringMatching(/queued|running/) } });
    const id = commit.body.outbox.id as string;

    expect(await until(async () => (await b.get('/api/outbox')).body.items[0]?.status === 'running')).toBe(true);
    // the same commit again while it is in flight never runs twice
    const again = await b.post('/api/actions/commit', { previewToken: 'pt_used', idempotencyKey: preview.idempotencyKey });
    expect(again.status).toBe(202);
    expect(again.body.outbox.id).toBe(id);
    // undo of a write that is already sending is refused
    expect((await b.post('/api/actions/undo', { idempotencyKey: preview.idempotencyKey })).status).toBe(409);

    release();
    expect(await until(async () => (await b.get('/api/outbox')).body.items[0]?.status === 'done')).toBe(true);
    const item = (await b.get('/api/outbox')).body.items[0];
    expect(item).toMatchObject({ id, status: 'done', route: 'browser', source: 'calendar', attempts: 1 });
    expect(item.result.summaryLines.join(' ')).toContain('via your Chrome');
    expect(item.result.canUndo).toBe(false); // a write done in the browser cannot be undone by OnQ
    expect(JSON.stringify(item)).not.toContain('payload');
    expect(chrome.goals.filter((g) => g.includes('already approved')).length).toBe(1);

    // the real receipt is in the ledger, and a repeat commit now returns it
    const done = await b.post('/api/actions/commit', { previewToken: 'pt_used', idempotencyKey: preview.idempotencyKey });
    expect(done.status).toBe(200);
    expect(done.body.operations[0].recallNote).toBe('DONE IN BROWSER - CANNOT UNDO');
    expect(done.body.canUndo).toBe(false);
    const statuses = stream.events.filter((e) => e.event === 'outbox' && e.data.id === id).map((e) => e.data.status);
    expect(statuses).toEqual(['queued', 'running', 'done']);
    stream.close();
  });

  it('a failure is reported with its reason, never retried blindly, and an owner retry works; confirm Default-NO and single-use tokens still hold', async () => {
    let broken = true;
    const { b, preview } = await stagedOnChrome(async (goal) => {
      if (goal.includes('already approved') && broken) throw new Error('Calendar page did not load');
      return readAnswer(goal);
    });
    const commit = await b.post('/api/actions/commit', { previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey });
    expect(commit.status).toBe(202);
    const id = commit.body.outbox.id as string;
    expect(await until(async () => (await b.get('/api/outbox')).body.items[0]?.status === 'failed')).toBe(true);
    const failed = (await b.get('/api/outbox')).body.items[0];
    expect(failed.reason).toContain('Calendar page did not load');
    expect(failed.attempts).toBe(1);

    // the preview token is single use: replaying it with no idempotency key is still refused
    const replay = await b.post('/api/actions/commit', { previewToken: preview.previewToken });
    expect(replay.status).toBeGreaterThanOrEqual(400);

    // a repeat with a spent token cannot run it again either
    const repeat = await b.post('/api/actions/commit', { previewToken: 'x', idempotencyKey: preview.idempotencyKey });
    expect(repeat.status).toBeGreaterThanOrEqual(400);
    expect((await b.get('/api/outbox')).body.items).toHaveLength(1);

    expect((await b.post('/api/outbox/ob_deadbeef/retry')).status).toBe(404);
    broken = false;
    const retry = await b.post(`/api/outbox/${id}/retry`);
    expect(retry.status).toBe(200);
    expect(await until(async () => (await b.get('/api/outbox')).body.items[0]?.status === 'done')).toBe(true);
    expect((await b.post(`/api/outbox/${id}/retry`)).status).toBe(409); // only failed items
    expect((await b.del(`/api/outbox/${id}`)).status).toBe(409); // only queued items
  });

  it('a 409 found at execution time marks the item failed with the conflict and never writes', async () => {
    let broken = true;
    const { b, chrome, preview, icsText, real } = await stagedOnChrome(async (goal) => {
      if (goal.includes('already approved') && broken) throw new Error('Chrome was closed');
      return readAnswer(goal);
    });
    const commit = await b.post('/api/actions/commit', { previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey });
    expect(commit.status).toBe(202);
    const id = commit.body.outbox.id as string;
    expect(await until(async () => (await b.get('/api/outbox')).body.items[0]?.status === 'failed')).toBe(true);
    const writes = () => chrome.goals.filter((g) => g.includes('already approved')).length;
    expect(writes()).toBe(1);

    // Time passes and someone books the target slot before the owner retries.
    b.clock.t += 30_000;
    const target = (preview.operations[0].afterValue as string).split('|')[0];
    const hhmm = target.slice(11, 16).replace(':', '');
    const day = target.slice(0, 10).replace(/-/g, '');
    icsText.value = ICS(['BEGIN:VEVENT', 'UID:blocker', `DTSTART:${day}T${hhmm}00Z`, `DTEND:${day}T${String(Number(hhmm) + 30).padStart(4, '0')}00Z`, 'SUMMARY:Board review', 'END:VEVENT'].join('\r\n'));
    await real.fetchCorridor(new Date(b.clock.t).toISOString());
    broken = false; // Chrome would work now: the only thing stopping the write is the conflict lock

    expect((await b.post(`/api/outbox/${id}/retry`)).status).toBe(200);
    expect(await until(async () => (await b.get('/api/outbox')).body.items[0]?.conflict !== null)).toBe(true);
    const item = (await b.get('/api/outbox')).body.items[0];
    expect(item.status).toBe('failed');
    expect(item.conflict.code).toMatch(/^CONFLICT_/);
    expect(item.reason).toBe(item.conflict.message);
    expect(writes()).toBe(1); // never executed a second time: no double-booking

    // approving the same action again hits the same inline lock at staging time: still 409, still nothing written
    const restage = await b.post('/api/actions/stage', { cardId: preview.cardId, commandText: 'Push 15m' });
    expect(restage.status).toBe(409);
    expect(restage.body.code).toMatch(/^CONFLICT_/);
    expect(writes()).toBe(1);
  });

  it('api route: a fast write answers inline exactly as before; one past 1.5 s is released as queued and finishes in the background', async () => {
    let hold: Promise<void> | null = null;
    const real = new LiveWorkspaceProvider({ getIcsFeed: () => ICS() });
    const provider: WorkspaceProvider = {
      mode: 'LIVE',
      fetchCorridor: (n) => real.fetchCorridor(n),
      checkLiveConflicts: (p) => real.checkLiveConflicts(p),
      executePreview: async (i) => {
        if (hold) await hold;
        return real.executePreview(i);
      },
      undoReceipt: (r) => real.undoReceipt(r),
      getSnapshot: () => real.getSnapshot(),
    };
    const b = await boot({ liveProviderOverride: provider });
    await b.goLive();
    const card = (await b.get('/api/corridor')).body.cards[0];
    expect((await b.get('/api/sources')).body.sources.find((s: any) => s.source === 'calendar').effective).toBe('api');

    const s1 = await b.post('/api/actions/stage', { cardId: card.id, commandText: 'Push 15m' });
    const fast = await b.post('/api/actions/commit', { previewToken: s1.body.previewToken, idempotencyKey: s1.body.idempotencyKey });
    expect(fast.status).toBe(200);
    expect(fast.body.status).toBe('COMMITTED');
    expect(fast.body.outbox).toBeUndefined();
    expect((await b.get('/api/outbox')).body.items[0]).toMatchObject({ status: 'done', route: 'api' });

    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    const s2 = await b.post('/api/actions/stage', { cardId: card.id, commandText: 'Push 30m' });
    expect(s2.status).toBe(200);
    const t0 = Date.now();
    const slow = await b.post('/api/actions/commit', { previewToken: s2.body.previewToken, idempotencyKey: s2.body.idempotencyKey });
    const waited = Date.now() - t0;
    expect(slow.status).toBe(202);
    expect(waited).toBeGreaterThanOrEqual(1400);
    expect(waited).toBeLessThan(3000);
    expect(slow.body).toMatchObject({ status: 'QUEUED', outbox: { status: 'running' } });
    release();
    expect(await until(async () => (await b.get('/api/outbox')).body.items[0]?.status === 'done')).toBe(true);
    const finished = await b.post('/api/actions/commit', { previewToken: 'x', idempotencyKey: s2.body.idempotencyKey });
    expect(finished.status).toBe(200);
    expect(finished.body.status).toBe('COMMITTED');
  });

  it('undo of a queued write cancels it (nothing is sent); the cancelled item never runs', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { b, chrome, preview } = await stagedOnChrome(async (goal) => {
      if (goal.includes('already approved')) await gate;
      return readAnswer(goal);
    });
    const first = await b.post('/api/actions/commit', { previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey });
    expect(first.status).toBe(202);
    expect(await until(async () => (await b.get('/api/outbox')).body.items[0]?.status === 'running')).toBe(true);

    const card = (await b.get('/api/outbox')).body.items[0];
    expect(card.source).toBe('calendar');
    const staged2 = await b.post('/api/actions/stage', { cardId: preview.cardId, commandText: 'Push 30m' });
    expect(staged2.status).toBe(200);
    const second = await b.post('/api/actions/commit', { previewToken: staged2.body.previewToken, idempotencyKey: staged2.body.idempotencyKey });
    expect(second.status).toBe(202);
    expect(second.body.outbox.status).toBe('queued'); // same source: waits behind the running write
    expect(second.body.canUndo).toBe(true);

    const undo = await b.post('/api/actions/undo', { idempotencyKey: staged2.body.idempotencyKey });
    expect(undo.status).toBe(200);
    expect(undo.body).toMatchObject({ status: 'UNDONE', canUndo: false, outbox: { status: 'undone' } });
    release();
    expect(await until(async () => (await b.get('/api/outbox')).body.items.every((i: any) => ['done', 'undone'].includes(i.status)))).toBe(true);
    const items = (await b.get('/api/outbox')).body.items;
    expect(items.map((i: any) => i.status).sort()).toEqual(['done', 'undone']);
    expect(chrome.goals.filter((g) => g.includes('already approved')).length).toBe(1); // only the first write ever ran
  });

  it('the default sample path never touches the outbox and answers exactly as before', async () => {
    const b = await boot();
    const corridor = (await b.get('/api/corridor')).body;
    expect(corridor.cards.slice(0, 4).map((c: any) => c.id)).toEqual(['card-vc-priya', expect.any(String), 'card-telegram-bridge', 'card-computer-proactive']);
    expect(corridor.provenanceLabel).not.toContain('as of');
    const staged = await b.post('/api/actions/stage', { cardId: corridor.cards[0].id, commandText: 'Push 15m and tell Investor' });
    expect(staged.status).toBe(200);
    const commit = await b.post('/api/actions/commit', { previewToken: staged.body.previewToken, idempotencyKey: staged.body.idempotencyKey });
    expect(commit.status).toBe(200);
    expect(commit.body.status).toBe('COMMITTED');
    expect(commit.body).not.toHaveProperty('outbox');
    expect((await b.get('/api/outbox')).body.items).toEqual([]);
    const undo = await b.post('/api/actions/undo', { idempotencyKey: staged.body.idempotencyKey });
    expect(undo.status).toBe(200);
  });
});
