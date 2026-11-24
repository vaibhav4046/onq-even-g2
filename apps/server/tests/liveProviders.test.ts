import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodePcm16ToWav } from '@oncue/core';
import { PostgresLedgerStore } from '../src/ledger.js';
import type { PgPoolLike } from '../src/ledger.js';
import { GoogleWorkspaceClient } from '../src/providers/googleProvider.js';
import { LiveWorkspaceProvider } from '../src/providers/liveProvider.js';
import { NotionWorkspaceClient } from '../src/providers/notionProvider.js';
import { createOnCueServer } from '../src/server.js';
import { transcribeWavBuffer } from '../src/stt.js';
import { EncryptedTokenVault } from '../src/tokenVault.js';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const fn = closers.pop();
    if (fn) await fn();
  }
});

function createMockPgPool(): PgPoolLike & { executedQueries: string[] } {
  const tables = {
    pairing_codes: new Map<string, Record<string, unknown>>(),
    sessions: new Map<string, Record<string, unknown>>(),
    previews: new Map<string, Record<string, unknown>>(),
    receipts: new Map<string, Record<string, unknown>>(),
    rate_counters: new Map<string, Record<string, unknown>>(),
  };
  const executedQueries: string[] = [];

  return {
    executedQueries,
    async query(sql: string, params: unknown[] = []) {
      const q = sql.trim();
      executedQueries.push(q.split('\n')[0]);
      if (q.startsWith('CREATE TABLE')) return { rows: [], rowCount: 0 };

      if (q.includes('INSERT INTO pairing_codes')) {
        tables.pairing_codes.set(String(params[0]), {
          code: params[0],
          mode: params[1],
          expires_at: params[2],
          attempts: 0,
          locked: 0,
          consumed: 0,
        });
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('FROM pairing_codes WHERE code')) {
        const r = tables.pairing_codes.get(String(params[0]));
        return { rows: r ? [r] : [] };
      }
      if (q.startsWith('UPDATE pairing_codes SET consumed = 1')) {
        const r = tables.pairing_codes.get(String(params[0]));
        if (r) r.consumed = 1;
        return { rows: [], rowCount: r ? 1 : 0 };
      }
      if (q.includes("FROM rate_counters WHERE bucket_key = 'pair_failures'")) {
        const r = tables.rate_counters.get('pair_failures');
        return { rows: r ? [r] : [] };
      }
      if (q.includes("INSERT INTO rate_counters") && q.includes("'pair_failures'")) {
        const cur = Number(tables.rate_counters.get('pair_failures')?.count ?? 0) + 1;
        tables.rate_counters.set('pair_failures', { bucket_key: 'pair_failures', count: cur });
        return { rows: [{ count: cur }], rowCount: 1 };
      }
      if (q.startsWith('DELETE FROM rate_counters')) {
        tables.rate_counters.delete('pair_failures');
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('INSERT INTO sessions')) {
        tables.sessions.set(String(params[0]), {
          token_hash: params[0],
          mode: params[1],
          created_at: params[2],
          expires_at: params[3],
        });
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('FROM sessions WHERE token_hash')) {
        const r = tables.sessions.get(String(params[0]));
        return { rows: r ? [r] : [] };
      }
      if (q.startsWith('DELETE FROM sessions')) {
        tables.sessions.delete(String(params[0]));
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('INSERT INTO previews')) {
        tables.previews.set(String(params[0]), {
          preview_token: params[0],
          session_hash: params[1],
          payload_json: params[2],
          expires_at: params[3],
          consumed: 0,
        });
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('FROM previews WHERE preview_token')) {
        const r = tables.previews.get(String(params[0]));
        return { rows: r ? [r] : [] };
      }
      if (q.startsWith('UPDATE previews SET consumed = 1')) {
        const r = tables.previews.get(String(params[0]));
        if (r && r.consumed === 0) {
          r.consumed = 1;
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('INSERT INTO receipts')) {
        tables.receipts.set(String(params[0]), {
          receipt_id: params[0],
          idempotency_key: params[1],
          status: params[2],
          payload_json: params[3],
          created_at: params[4],
        });
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('FROM receipts WHERE idempotency_key')) {
        const hit = [...tables.receipts.values()].find((r) => r.idempotency_key === params[0]);
        return { rows: hit ? [hit] : [] };
      }
      if (q.includes('FROM receipts ORDER BY')) {
        return { rows: [...tables.receipts.values()] };
      }
      if (q.includes('FROM rate_counters WHERE bucket_key = $1')) {
        const r = tables.rate_counters.get(String(params[0]));
        return { rows: r ? [r] : [] };
      }
      if (q.includes('INSERT INTO rate_counters (bucket_key, count) VALUES ($1, 1)')) {
        const k = String(params[0]);
        const cur = Number(tables.rate_counters.get(k)?.count ?? 0) + 1;
        tables.rate_counters.set(k, { bucket_key: k, count: cur });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

function makeMockFetch() {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const state = {
    busyOnFreeBusy: false,
    threadHistoryId: 'hist-live-1',
    patchedStart: '',
    sentEmails: 0,
    savedDrafts: 0,
    deletedDrafts: 0,
    createdNotionTasks: 0,
    archivedNotionPages: 0,
  };

  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url, method, body });

    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'ya29.mock-access', refresh_token: '1//mock-refresh', expires_in: 3600 }), { status: 200 });
    }
    if (url.includes('/calendar/v3/calendars/primary/events') && method === 'GET') {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'gcal-ev-1',
              summary: 'Board Prep - Priya',
              etag: '"etag-g1"',
              start: { dateTime: '2026-11-24T14:00:00.000Z' },
              end: { dateTime: '2026-11-24T14:30:00.000Z' },
              attendees: [{ email: 'priya@tvm.example', displayName: 'Priya Nair' }],
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes('/calendar/v3/freeBusy')) {
      return new Response(
        JSON.stringify({
          calendars: {
            primary: {
              busy: state.busyOnFreeBusy
                ? [{ start: '2026-11-24T14:15:00.000Z', end: '2026-11-24T14:45:00.000Z' }]
                : [],
            },
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes('/calendar/v3/calendars/primary/events/') && method === 'PATCH') {
      state.patchedStart = body ? JSON.parse(body).start.dateTime : '';
      return new Response(JSON.stringify({ etag: '"etag-g2"' }), { status: 200 });
    }
    if (url.endsWith('/calendar/v3/calendars/primary/events') && method === 'POST') {
      return new Response(JSON.stringify({ id: 'gcal-hold-1', etag: '"etag-h1"' }), { status: 200 });
    }
    if (url.includes('/calendar/v3/calendars/primary/events/') && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (url.includes('/gmail/v1/users/me/threads?')) {
      return new Response(JSON.stringify({ threads: [{ id: 'gthr-1' }] }), { status: 200 });
    }
    if (url.includes('/gmail/v1/users/me/threads/gthr-1')) {
      return new Response(
        JSON.stringify({
          id: 'gthr-1',
          historyId: state.threadHistoryId,
          messages: [
            {
              snippet: 'Can we shift 15m?',
              payload: {
                headers: [
                  { name: 'From', value: 'Priya Nair <priya@tvm.example>' },
                  { name: 'Subject', value: 'Board Prep' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/gmail/v1/users/me/messages/send')) {
      state.sentEmails++;
      return new Response(JSON.stringify({ id: 'gmail-msg-1' }), { status: 200 });
    }
    if (url.endsWith('/gmail/v1/users/me/drafts') && method === 'POST') {
      state.savedDrafts++;
      return new Response(JSON.stringify({ id: 'gmail-draft-1' }), { status: 200 });
    }
    if (url.includes('/gmail/v1/users/me/drafts/') && method === 'DELETE') {
      state.deletedDrafts++;
      return new Response(null, { status: 204 });
    }
    if (url.startsWith('https://api.notion.com/v1/databases/') && method === 'GET') {
      return new Response(
        JSON.stringify({
          properties: {
            Name: { id: 'title', type: 'title' },
            Due: { id: 'due', type: 'date' },
            State: { id: 'st', type: 'status', status: { options: [{ name: 'To Do' }, { name: 'Done' }] } },
          },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/query') && method === 'POST') {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 'nt-page-1',
              last_edited_time: '2026-11-24T12:00:00.000Z',
              properties: {
                Name: { title: [{ plain_text: 'Send metrics deck' }] },
                Due: { date: { start: '2026-11-24' } },
                State: { status: { name: 'To Do' } },
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url === 'https://api.notion.com/v1/pages' && method === 'POST') {
      state.createdNotionTasks++;
      return new Response(JSON.stringify({ id: 'nt-page-created', last_edited_time: '2026-11-24T13:50:00.000Z' }), { status: 200 });
    }
    if (url.startsWith('https://api.notion.com/v1/pages/') && method === 'PATCH') {
      if (body?.includes('"archived":true')) state.archivedNotionPages++;
      return new Response(JSON.stringify({ id: 'nt-page-1' }), { status: 200 });
    }
    if (url.startsWith('https://api.notion.com/v1/pages/') && method === 'GET') {
      return new Response(JSON.stringify({ id: 'nt-page-1', last_edited_time: '2026-11-24T12:00:00.000Z' }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls, state };
}

describe('Live Providers, Neon Postgres Ledger, ICS & Companion Controls', () => {
  it('1. GoogleWorkspaceClient fetches events, authoritative thread metadata, and sends threaded reply', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-g-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({ googleClientId: 'cid', googleClientSecret: 'csec', googleRefreshToken: '1//ref' });

    const { fetchImpl, state } = makeMockFetch();
    const g = new GoogleWorkspaceClient(vault, fetchImpl);
    const events = await g.listUpcomingEvents('2026-11-24T13:00:00Z', '2026-11-24T18:00:00Z');
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('Board Prep - Priya');

    const sent = await g.sendThreadedReply({ threadId: 'gthr-1', bodyText: 'Shifting 15m', draftOnly: false });
    expect(sent.recipient).toBe('priya@tvm.example');
    expect(state.sentEmails).toBe(1);
  });

  it('2. GoogleWorkspaceClient refreshes expired access token automatically', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-g2-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({
      googleClientId: 'cid',
      googleClientSecret: 'csec',
      googleRefreshToken: '1//ref',
      googleAccessToken: 'ya29.expired',
      googleAccessExpiresAt: Date.now() - 10_000,
    });
    const { fetchImpl } = makeMockFetch();
    const g = new GoogleWorkspaceClient(vault, fetchImpl);
    const token = await g.getAccessToken();
    expect(token).toBe('ya29.mock-access');
  });

  it('3. NotionWorkspaceClient inspects status schema, queries tasks, creates, marks done, and archives', async () => {
    const { fetchImpl, state } = makeMockFetch();
    const notion = new NotionWorkspaceClient('ntn_test_secret_1234', 'db-1', fetchImpl);
    const schema = await notion.inspectSchema();
    expect(schema.completionKind).toBe('status');
    expect(schema.doneStatusName).toBe('Done');

    const tasks = await notion.queryOpenTasks();
    expect(tasks[0].title).toBe('Send metrics deck');

    const created = await notion.createTask('Follow up with Priya');
    expect(created.pageId).toBe('nt-page-created');
    expect(state.createdNotionTasks).toBe(1);

    await notion.archivePage(created.pageId);
    expect(state.archivedNotionPages).toBe(1);
  });

  it('4. LiveWorkspaceProvider aggregates Google + Notion with honest LIVE provenance', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-live-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({ googleClientId: 'cid', googleClientSecret: 'csec', googleRefreshToken: '1//ref' });

    const { fetchImpl } = makeMockFetch();
    const live = new LiveWorkspaceProvider({
      google: new GoogleWorkspaceClient(vault, fetchImpl),
      notion: new NotionWorkspaceClient('ntn_test_1234', 'db-1', fetchImpl),
    });

    const corridor = await live.fetchCorridor('2026-11-24T13:50:00.000Z');
    expect(corridor.sourceMode).toBe('LIVE');
    expect(corridor.provenanceLabel).toContain('GCAL');
    expect(corridor.provenanceLabel).toContain('GMAIL');
    expect(corridor.provenanceLabel).toContain('NOTION');
    expect(corridor.cards.length).toBeGreaterThanOrEqual(2);
  });

  it('5. LiveWorkspaceProvider detects FreeBusy conflict and thread historyId drift', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-live-conf-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({ googleClientId: 'cid', googleClientSecret: 'csec', googleRefreshToken: '1//ref' });

    const { fetchImpl, state } = makeMockFetch();
    const live = new LiveWorkspaceProvider({
      google: new GoogleWorkspaceClient(vault, fetchImpl),
      notion: new NotionWorkspaceClient('ntn_test_1234', 'db-1', fetchImpl),
    });
    const corridor = await live.fetchCorridor('2026-11-24T13:50:00.000Z');
    const card = corridor.cards[0];

    state.busyOnFreeBusy = true;
    const calConflict = await live.checkLiveConflicts({
      previewToken: 'p1',
      idempotencyKey: 'k1',
      expiresAtIso: '2026-11-24T14:00:00Z',
      intent: 'RESCHEDULE_AND_NOTIFY',
      defaultSelection: 'NO',
      cardId: card.id,
      summaryLines: [],
      operations: [{ provider: 'GCAL', op: 'MOVE_EVENT', targetLabel: card.title, afterValue: '2026-11-24T14:15:00.000Z|2026-11-24T14:45:00.000Z' }],
      safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
    });
    expect(calConflict?.code).toBe('CONFLICT_CALENDAR_BUSY');

    state.busyOnFreeBusy = false;
    state.threadHistoryId = 'hist-live-2';
    const thrConflict = await live.checkLiveConflicts({
      previewToken: 'p2',
      idempotencyKey: 'k2',
      expiresAtIso: '2026-11-24T14:00:00Z',
      intent: 'REPLY_EMAIL',
      defaultSelection: 'NO',
      cardId: card.id,
      summaryLines: [],
      operations: [{ provider: 'GMAIL', op: 'SEND_REPLY', targetLabel: 'priya@tvm.example', afterValue: 'ok' }],
      safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
    });
    expect(thrConflict?.code).toBe('CONFLICT_THREAD_UPDATED');
  });

  it('6. LiveWorkspaceProvider executes Calendar patch + Draft and supports surgical undo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-live-exec-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({ googleClientId: 'cid', googleClientSecret: 'csec', googleRefreshToken: '1//ref' });

    const { fetchImpl, state } = makeMockFetch();
    const live = new LiveWorkspaceProvider({
      google: new GoogleWorkspaceClient(vault, fetchImpl),
      notion: new NotionWorkspaceClient('ntn_test_1234', 'db-1', fetchImpl),
    });
    const corridor = await live.fetchCorridor('2026-11-24T13:50:00.000Z');
    const card = corridor.cards[0];

    const receipt = await live.executePreview({
      preview: {
        previewToken: 'p3',
        idempotencyKey: 'k3',
        expiresAtIso: '2026-11-24T14:00:00Z',
        intent: 'RESCHEDULE_AND_NOTIFY',
        defaultSelection: 'NO',
        cardId: card.id,
        summaryLines: [],
        operations: [],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      },
      operations: [
        {
          provider: 'GCAL',
          op: 'MOVE_EVENT',
          targetLabel: card.title,
          beforeValue: `${card.startIso}|${card.endIso}`,
          afterValue: '2026-11-24T14:15:00.000Z|2026-11-24T14:45:00.000Z',
        },
        {
          provider: 'GMAIL',
          op: 'SAVE_DRAFT',
          targetLabel: 'priya@tvm.example',
          afterValue: 'Shifting 15m',
        },
      ],
    });
    expect(receipt.status).toBe('COMMITTED');
    expect(receipt.canUndo).toBe(true);
    expect(state.patchedStart).toBe('2026-11-24T14:15:00.000Z');
    expect(state.savedDrafts).toBe(1);

    const undone = await live.undoReceipt(receipt);
    expect(undone.status).toBe('UNDONE');
    expect(state.patchedStart).toBe('2026-11-24T14:00:00.000Z');
    expect(state.deletedDrafts).toBe(1);
  });

  it('7. PostgresLedgerStore supports pairing, sessions, single-use previews, receipts, and rate caps', async () => {
    const pool = createMockPgPool();
    const pg = new PostgresLedgerStore(pool);
    await pg.createPairingCode('654321', 'LIVE');
    const ex = await pg.exchangePairingCode('654321');
    expect(ex.ok).toBe(true);
    if (!ex.ok) throw new Error('expected ok');
    expect(ex.mode).toBe('LIVE');

    const sess = await pg.validateSession(ex.sessionToken);
    expect(sess?.mode).toBe('LIVE');

    await pg.savePreview(
      {
        previewToken: 'pt-pg-1',
        idempotencyKey: 'ik-pg-1',
        expiresAtIso: new Date(Date.now() + 30_000).toISOString(),
        intent: 'REPLY_EMAIL',
        defaultSelection: 'NO',
        summaryLines: ['hi'],
        operations: [],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      },
      sess!.tokenHash,
    );
    const c1 = await pg.consumePreview('pt-pg-1', sess!.tokenHash);
    expect(c1.ok).toBe(true);
    const c2 = await pg.consumePreview('pt-pg-1', sess!.tokenHash);
    expect(c2.ok).toBe(false);
    expect(pool.executedQueries.length).toBeGreaterThan(5);
  });

  it('8. stt.ts throws honest 503 STT_ENGINE_UNAVAILABLE when no preset/whisper/OpenAI engine is present', async () => {
    const samples = 8000;
    const pcm = new Uint8Array(samples * 2);
    const dv = new DataView(pcm.buffer);
    for (let i = 0; i < samples; i++) dv.setInt16(i * 2, 12000, true);
    const wav = encodePcm16ToWav(pcm, 16000);
    await expect(
      transcribeWavBuffer(wav, { enableLocalFasterWhisper: false, openAiKey: '' }),
    ).rejects.toThrow('STT_ENGINE_UNAVAILABLE');
  });

  it('9. /api/pair/ics parses real RFC 5545 calendar events and upgrades session to LIVE mode', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-ics-'));
    const srv = await createOnCueServer({ port: 0, dataDir: dir, allowTestFaultControls: true });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:ics-live-1',
      'DTSTART:20991124T140000Z',
      'DTEND:20991124T143000Z',
      'SUMMARY:Investor Check-in',
      'ATTENDEE;CN=Maya:mailto:maya@fund.example',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const imp = await fetch(`${srv.url}/api/pair/ics`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ icsText: ics }),
    });
    expect(imp.status).toBe(200);
    const impJson = (await imp.json()) as { count: number; mode: string; sessionToken: string };
    expect(impJson.count).toBe(1);
    expect(impJson.mode).toBe('LIVE');

    const cor = await fetch(`${srv.url}/api/corridor`, {
      headers: { Authorization: `Bearer ${impJson.sessionToken}` },
    });
    const corJson = (await cor.json()) as { sourceMode: string; cards: Array<{ title: string }> };
    expect(corJson.sourceMode).toBe('LIVE');
    expect(corJson.cards[0].title).toBe('Investor Check-in');
  });

  it('10. /api/pair/inspect-notion auto-discovers live database schema', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-not-'));
    const { fetchImpl } = makeMockFetch();
    const srv = await createOnCueServer({ port: 0, dataDir: dir, fetchImpl });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/pair/inspect-notion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notionToken: 'ntn_test_1234', notionDatabaseId: 'db-1' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { schema: { titleProp: string; completionKind: string } };
    expect(json.schema.titleProp).toBe('Name');
    expect(json.schema.completionKind).toBe('status');
  });

  it('11. /api/workspace/calendar/add and /gmail/incoming trigger real dynamic 409 locks', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-mut-'));
    const srv = await createOnCueServer({ port: 0, dataDir: dir, allowTestFaultControls: true });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    // Add busy slot at 14:15
    await fetch(`${srv.url}/api/workspace/calendar/add`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        title: 'Urgent Legal Sync',
        startIso: '2026-11-24T14:15:00.000Z',
        endIso: '2026-11-24T14:45:00.000Z',
      }),
    });

    // Now Push 15m (to 14:15) must return 409 CONFLICT_CALENDAR_BUSY!
    const stage1 = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'Push 15m and tell Priya', cardId: 'card-vc-priya' }),
    });
    expect(stage1.status).toBe(409);

    // Reset, stage clean, then inject incoming reply -> commit returns 409 CONFLICT_THREAD_UPDATED!
    await fetch(`${srv.url}/api/workspace/reset`, { method: 'POST', headers: auth, body: '{}' });
    const stage2 = await (
      await fetch(`${srv.url}/api/actions/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ commandText: 'Push 15m and tell Priya', cardId: 'card-vc-priya' }),
      })
    ).json() as { previewToken: string };

    await fetch(`${srv.url}/api/workspace/gmail/incoming`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ snippet: 'Wait, let us do 15:00!' }),
    });

    const commitRes = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: stage2.previewToken }),
    });
    expect(commitRes.status).toBe(409);
  });

  it('12. /api/workspace/notion/add & toggle update workspace state and /api/stream emits SSE', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-sse-'));
    const srv = await createOnCueServer({ port: 0, dataDir: dir, allowTestFaultControls: true });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const sseRes = await fetch(`${srv.url}/api/stream?token=${encodeURIComponent(sessionToken)}`);
    expect(sseRes.status).toBe(200);
    const reader = sseRes.body!.getReader();
    const firstChunk = await reader.read();
    expect(Buffer.from(firstChunk.value).toString('utf8')).toContain('event: connected');

    await fetch(`${srv.url}/api/workspace/notion/add`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ title: 'Ship final .ehpk' }),
    });
    const secondChunk = await reader.read();
    expect(Buffer.from(secondChunk.value).toString('utf8')).toContain('event: corridor');
    await reader.cancel();

    const ws = (await (await fetch(`${srv.url}/api/workspace/state`, { headers: auth })).json()) as {
      snapshot: { notionTasks: Array<{ pageId: string; title: string; completed: boolean }> };
    };
    const added = ws.snapshot.notionTasks.find((t) => t.title === 'Ship final .ehpk');
    expect(added?.completed).toBe(false);
    await fetch(`${srv.url}/api/workspace/notion/toggle`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ pageId: added?.pageId }),
    });
    const ws2 = (await (await fetch(`${srv.url}/api/workspace/state`, { headers: auth })).json()) as {
      snapshot: { notionTasks: Array<{ pageId: string; completed: boolean }> };
    };
    expect(ws2.snapshot.notionTasks.find((t) => t.pageId === added?.pageId)?.completed).toBe(true);
  });

  it('13. /api/pair/google-callback rejects missing OAuth code cleanly with HTTP 400', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-cb-'));
    const srv = await createOnCueServer({ port: 0, dataDir: dir });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const res = await fetch(`${srv.url}/api/pair/google-callback`);
    expect(res.status).toBe(400);
  });

  it('14. LiveWorkspaceProvider handles partial Notion-only configuration cleanly', async () => {
    const { fetchImpl } = makeMockFetch();
    const live = new LiveWorkspaceProvider({
      notion: new NotionWorkspaceClient('ntn_test_1234', 'db-1', fetchImpl),
    });
    const corridor = await live.fetchCorridor('2026-11-24T13:50:00.000Z');
    expect(corridor.sourceMode).toBe('LIVE');
    expect(corridor.provenanceLabel).toBe('NOTION');
    expect(corridor.cards.some((c) => c.kind === 'NOTION_DUE')).toBe(true);
  });

  it('15. LiveWorkspaceProvider handles ICS-only feed cleanly', async () => {
    const live = new LiveWorkspaceProvider({
      getIcsFeed: () =>
        'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:u1\nDTSTART:20991124T160000Z\nSUMMARY:ICS Sync\nEND:VEVENT\nEND:VCALENDAR',
    });
    const corridor = await live.fetchCorridor('2026-11-24T13:50:00.000Z');
    expect(corridor.sourceMode).toBe('LIVE');
    expect(corridor.provenanceLabel).toBe('ICS');
    expect(corridor.cards[0].title).toBe('ICS Sync');
  });

  it('16. LiveWorkspaceProvider executes Notion task creation + surgical archive undo', async () => {
    const { fetchImpl, state } = makeMockFetch();
    const live = new LiveWorkspaceProvider({
      notion: new NotionWorkspaceClient('ntn_test_1234', 'db-1', fetchImpl),
    });
    const receipt = await live.executePreview({
      preview: {
        previewToken: 'pt-n1',
        idempotencyKey: 'ik-n1',
        expiresAtIso: '2026-11-24T14:00:00Z',
        intent: 'CREATE_ACTION_PACK',
        defaultSelection: 'NO',
        summaryLines: [],
        operations: [],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      },
      operations: [{ provider: 'NOTION', op: 'CREATE_TASK', targetLabel: 'Tasks', afterValue: 'Review Q4 numbers' }],
    });
    expect(state.createdNotionTasks).toBe(1);
    expect(receipt.canUndo).toBe(true);
    await live.undoReceipt(receipt);
    expect(state.archivedNotionPages).toBe(1);
  });

  it('17. LiveWorkspaceProvider refuses recall on sent Gmail replies (canUndo = false)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-sent-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({ googleClientId: 'cid', googleClientSecret: 'csec', googleRefreshToken: '1//ref' });
    const { fetchImpl, state } = makeMockFetch();
    const live = new LiveWorkspaceProvider({
      google: new GoogleWorkspaceClient(vault, fetchImpl),
    });
    const corridor = await live.fetchCorridor('2026-11-24T13:50:00.000Z');
    const card = corridor.cards[0];
    const receipt = await live.executePreview({
      preview: {
        previewToken: 'pt-s1',
        idempotencyKey: 'ik-s1',
        expiresAtIso: '2026-11-24T14:00:00Z',
        intent: 'REPLY_EMAIL',
        defaultSelection: 'NO',
        cardId: card.id,
        summaryLines: [],
        operations: [],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      },
      operations: [{ provider: 'GMAIL', op: 'SEND_REPLY', targetLabel: 'priya@tvm.example', afterValue: 'On my way' }],
    });
    expect(state.sentEmails).toBe(1);
    expect(receipt.canUndo).toBe(false);
    expect(receipt.operations[0].recallNote).toBe('SENT - CANNOT RECALL');
  });

  it('18. LiveWorkspaceProvider detects Notion last_edited_time conflict drift', async () => {
    const { fetchImpl } = makeMockFetch();
    const notion = new NotionWorkspaceClient('ntn_test_1234', 'db-1', fetchImpl);
    const live = new LiveWorkspaceProvider({ notion });
    const corridor = await live.fetchCorridor('2026-11-24T13:50:00.000Z');
    const card = corridor.cards[0];
    // Mutate stored baseline lastEdited to simulate external edit before commit
    card.notionLastEdited = '2026-11-24T11:00:00.000Z';
    const conflict = await live.checkLiveConflicts({
      previewToken: 'pt-nc',
      idempotencyKey: 'ik-nc',
      expiresAtIso: '2026-11-24T14:00:00Z',
      intent: 'COMPLETE_NOTION_TASK',
      defaultSelection: 'NO',
      cardId: card.id,
      summaryLines: [],
      operations: [{ provider: 'NOTION', op: 'MARK_DONE', targetLabel: card.title, afterValue: 'Done' }],
      safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
    });
    expect(conflict?.code).toBe('CONFLICT_NOTION_STALE');
  });

  it('19. LiveWorkspaceProvider creates Calendar hold and reverses via deleteEvent undo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-hold-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({ googleClientId: 'cid', googleClientSecret: 'csec', googleRefreshToken: '1//ref' });
    const { fetchImpl, calls } = makeMockFetch();
    const live = new LiveWorkspaceProvider({ google: new GoogleWorkspaceClient(vault, fetchImpl) });

    const receipt = await live.executePreview({
      preview: {
        previewToken: 'pt-h1',
        idempotencyKey: 'ik-h1',
        expiresAtIso: '2026-11-24T14:00:00Z',
        intent: 'CREATE_ACTION_PACK',
        defaultSelection: 'NO',
        summaryLines: [],
        operations: [],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      },
      operations: [
        {
          provider: 'GCAL',
          op: 'CREATE_HOLD',
          targetLabel: 'Hold: Q4 metrics',
          afterValue: '2026-11-24T16:00:00.000Z|2026-11-24T16:30:00.000Z',
        },
      ],
    });
    expect(receipt.canUndo).toBe(true);
    await live.undoReceipt(receipt);
    expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('gcal-hold-1'))).toBe(true);
  });

  it('20. LiveWorkspaceProvider marks Notion task done and reverses via unmarkTaskComplete undo', async () => {
    const { fetchImpl, calls } = makeMockFetch();
    const live = new LiveWorkspaceProvider({
      notion: new NotionWorkspaceClient('ntn_test_1234', 'db-1', fetchImpl),
    });
    const corridor = await live.fetchCorridor('2026-11-24T13:50:00.000Z');
    const card = corridor.cards[0];

    const receipt = await live.executePreview({
      preview: {
        previewToken: 'pt-m1',
        idempotencyKey: 'ik-m1',
        expiresAtIso: '2026-11-24T14:00:00Z',
        intent: 'COMPLETE_NOTION_TASK',
        defaultSelection: 'NO',
        cardId: card.id,
        summaryLines: [],
        operations: [],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      },
      operations: [{ provider: 'NOTION', op: 'MARK_DONE', targetLabel: card.title, afterValue: 'Done' }],
    });
    expect(receipt.canUndo).toBe(true);
    await live.undoReceipt(receipt);
    const patches = calls.filter((c) => c.method === 'PATCH' && c.url.includes('nt-page-1'));
    expect(patches.length).toBe(2);
    expect(patches[1].body).toContain('"To Do"');
  });

  it('21. PostgresLedgerStore locks pairing after 10 wrong attempts and enforces per-minute rate limit', async () => {
    const pool = createMockPgPool();
    const pg = new PostgresLedgerStore(pool);
    await pg.createPairingCode('999888', 'LIVE');
    for (let i = 0; i < 9; i++) {
      const r = await pg.exchangePairingCode('000000');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(401);
    }
    const r10 = await pg.exchangePairingCode('000000');
    expect(r10.ok).toBe(false);
    if (!r10.ok) expect(r10.status).toBe(429);

    for (let i = 0; i < 10; i++) {
      const cap = await pg.checkAndConsumeRateLimit('d1', 'm1', 20, 10);
      expect(cap.allowed).toBe(true);
    }
    const blocked = await pg.checkAndConsumeRateLimit('d1', 'm1', 20, 10);
    expect(blocked.allowed).toBe(false);
  });

  it('22. GoogleWorkspaceClient exports Drive doc snippet cleanly and falls back to empty on 404', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-drv-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({ googleClientId: 'cid', googleClientSecret: 'csec', googleRefreshToken: '1//ref', googleAccessToken: 'ya29.ok', googleAccessExpiresAt: Date.now() + 300_000 });

    const driveFetch = (async (u: string | URL) => {
      if (String(u).includes('file-ok')) return new Response('  Q4 ARR grew +18% QoQ.\nSlide 4 ready.  ', { status: 200 });
      return new Response('missing', { status: 404 });
    }) as unknown as typeof fetch;

    const g = new GoogleWorkspaceClient(vault, driveFetch);
    expect(await g.getDriveDocSnippet('file-ok')).toBe('Q4 ARR grew +18% QoQ. Slide 4 ready.');
    expect(await g.getDriveDocSnippet('file-404')).toBe('');
  });

  it('23. Demo server ASK_NOTES returns cited Drive snippet without staging any write', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-ask-'));
    const srv = await createOnCueServer({ port: 0, dataDir: dir });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandText: 'What did Priya ask?', cardId: 'card-vc-priya' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { readOnlyAnswer: boolean; lines: string[] };
    expect(json.readOnlyAnswer).toBe(true);
    expect(json.lines[1]).toContain('SRC:');
  });

  it('24. Demo server records audit telemetry entries for RMS silence blocks and commits', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-aud-'));
    const srv = await createOnCueServer({ port: 0, dataDir: dir });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}` };
    await fetch(`${srv.url}/api/stt`, {
      method: 'POST',
      headers: auth,
      body: Buffer.from(encodePcm16ToWav(new Uint8Array(16000), 16000)),
    });
    const ws = (await (await fetch(`${srv.url}/api/workspace/state`, { headers: auth })).json()) as {
      auditLog: Array<{ kind: string }>;
    };
    expect(ws.auditLog.some((e) => e.kind === 'RMS_BLOCK')).toBe(true);
  });

  it('25. NotionWorkspaceClient supports 2026-03-11 data_sources schema, query, create, and in_trash undo', async () => {
    const calls: Array<{ url: string; method: string; body?: string; version?: string }> = [];
    const dsFetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method, body: init?.body ? String(init.body) : undefined, version: headers['Notion-Version'] });
      if (url.endsWith('/v1/databases/db-2026')) {
        return new Response(JSON.stringify({ id: 'db-2026', data_sources: [{ id: 'ds-99', name: 'Tasks' }] }), { status: 200 });
      }
      if (url.endsWith('/v1/data_sources/ds-99') && method === 'GET') {
        return new Response(
          JSON.stringify({
            id: 'ds-99',
            properties: {
              TaskName: { id: 'title', type: 'title' },
              TargetDate: { id: 'dt', type: 'date' },
              DoneFlag: { id: 'chk', type: 'checkbox' },
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/v1/data_sources/ds-99/query') && method === 'POST') {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'pg-ds-1',
                last_edited_time: '2026-11-24T12:00:00Z',
                properties: {
                  TaskName: { title: [{ plain_text: 'Send Q4 metrics' }] },
                  TargetDate: { date: { start: '2026-11-26' } },
                  DoneFlag: { checkbox: false },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/v1/pages') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'pg-new-2026', last_edited_time: '2026-11-24T12:01:00Z' }), { status: 200 });
      }
      if (url.endsWith('/v1/pages/pg-new-2026') && method === 'PATCH') {
        return new Response(JSON.stringify({ id: 'pg-new-2026' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const notion = new NotionWorkspaceClient('secret_test_notion_2026', 'db-2026', dsFetch);
    const tasks = await notion.queryOpenTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Send Q4 metrics');
    const created = await notion.createTask('Follow up Priya', '2026-11-27');
    expect(created.pageId).toBe('pg-new-2026');
    await notion.archivePage(created.pageId);

    expect(calls[0].version).toBe('2026-03-11');
    expect(calls.some((c) => c.url.endsWith('/v1/data_sources/ds-99/query'))).toBe(true);
    const createBody = JSON.parse(calls.find((c) => c.url.endsWith('/v1/pages'))?.body ?? '{}');
    expect(createBody.parent).toEqual({ type: 'data_source_id', data_source_id: 'ds-99' });
    const trashBody = JSON.parse(calls.find((c) => c.url.endsWith('/v1/pages/pg-new-2026'))?.body ?? '{}');
    expect(trashBody).toEqual({ in_trash: true });
  });
});
