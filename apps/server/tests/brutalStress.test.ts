import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { assertLensBudget, createInitialHudState, formatLensFrame } from '@onq/core';
import { GoogleWorkspaceClient, LiveWorkspaceProvider, createOnQServer } from '../src/server.js';
import { EncryptedTokenVault } from '../src/tokenVault.js';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const fn = closers.pop();
    if (fn) await fn();
  }
});

async function startStressServer(extra: Parameters<typeof createOnQServer>[0] = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-stress-'));
  const srv = await createOnQServer({
    port: 0,
    dataDir,
    allowTestFaultControls: true,
    ...extra,
  });
  closers.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return { ...srv, dataDir };
}

function makeSpokenPcm(frames = 1600, amplitude = 5500): Buffer {
  const arr = new Int16Array(frames);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.round(Math.sin(i * 0.14) * amplitude);
  }
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

describe('Brutal Concurrency, Live-Provider & Adversarial Stress Suite', () => {
  it('1. LiveWorkspaceProvider 15m self-shift passes while overlapping sibling event hard-locks 409', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-live-self-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({
      googleClientId: 'cid',
      googleClientSecret: 'csec',
      googleRefreshToken: 'ref-tok',
      googleAccessToken: 'acc-tok',
      googleAccessExpiresAt: Date.now() + 3600_000,
    });

    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('/calendar/v3/calendars/primary/events')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'evt-1',
                summary: 'Investor call',
                etag: 'etag-1',
                start: { dateTime: '2026-11-24T14:00:00.000Z' },
                end: { dateTime: '2026-11-24T14:30:00.000Z' },
                attendees: [{ email: 'investor@sample.example', displayName: 'Investor contact' }],
              },
              {
                id: 'evt-2',
                summary: 'Design Review',
                etag: 'etag-2',
                start: { dateTime: '2026-11-24T14:45:00.000Z' },
                end: { dateTime: '2026-11-24T15:15:00.000Z' },
                attendees: [{ email: 'design@sample.example', displayName: 'Design lead' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (u.includes('/gmail/v1/users/me/threads')) {
        return new Response(JSON.stringify({ threads: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const gClient = new GoogleWorkspaceClient(vault, mockFetch);
    const live = new LiveWorkspaceProvider({ google: gClient });
    const corridor = await live.fetchCorridor('2026-11-24T13:48:00.000Z');
    expect(corridor.cards.length).toBeGreaterThanOrEqual(2);
    const vcCard = corridor.cards.find((c) => c.calendarEventId === 'evt-1')!;

    // 14:15 -> 14:45 overlaps ONLY evt-1 itself (must NOT self-collide)
    const noSelfCollision = await live.checkLiveConflicts({
      previewToken: 'pt_self_ok',
      idempotencyKey: 'idemp_self_ok',
      expiresAtIso: '2026-11-24T14:00:00.000Z',
      intent: 'RESCHEDULE_AND_NOTIFY',
      defaultSelection: 'NO',
      cardId: vcCard.id,
      summaryLines: ['GCAL: 14:00 -> 14:15'],
      operations: [
        {
          provider: 'GCAL',
          op: 'MOVE_EVENT',
          targetLabel: vcCard.title,
          beforeValue: '2026-11-24T14:00:00.000Z|2026-11-24T14:30:00.000Z',
          afterValue: '2026-11-24T14:15:00.000Z|2026-11-24T14:45:00.000Z',
        },
      ],
      safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
    });
    expect(noSelfCollision).toBeNull();

    // 14:45 -> 15:15 collides with sibling evt-2 (MUST return CONFLICT_CALENDAR_BUSY)
    const realConflict = await live.checkLiveConflicts({
      previewToken: 'pt_sibling_conflict',
      idempotencyKey: 'idemp_sibling_conflict',
      expiresAtIso: '2026-11-24T14:00:00.000Z',
      intent: 'RESCHEDULE_AND_NOTIFY',
      defaultSelection: 'NO',
      cardId: vcCard.id,
      summaryLines: ['GCAL: 14:00 -> 14:45'],
      operations: [
        {
          provider: 'GCAL',
          op: 'MOVE_EVENT',
          targetLabel: vcCard.title,
          beforeValue: '2026-11-24T14:00:00.000Z|2026-11-24T14:30:00.000Z',
          afterValue: '2026-11-24T14:45:00.000Z|2026-11-24T15:15:00.000Z',
        },
      ],
      safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
    });
    expect(realConflict?.code).toBe('CONFLICT_CALENDAR_BUSY');
  });

  it('2. Vault-stored Claude & AssemblyAI keys immediately activate /api/health without restarting server', async () => {
    const srv = await startStressServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };

    const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'claude', apiKey: 'sk-ant-vault-health-check-123' }),
    });
    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'assemblyai', apiKey: 'aai-vault-health-check-456' }),
    });

    const health = (await (await fetch(`${srv.url}/api/health`)).json()) as {
      llmProvider: string;
      voiceEngine: string;
      sttEngine: string;
      ttsEngine: string;
    };
    expect(health.llmProvider).toBe('Claude');
    expect(health.voiceEngine).toBe('LIVE · ASSEMBLYAI');
    expect(health.sttEngine).toBe('assemblyai-stt-3-7');
    expect(health.ttsEngine).toBe('assemblyai-tts-1');
  });

  it('3. 25x parallel commit storm on same idempotencyKey & replay storm on consumed previewToken never double-write', async () => {
    const srv = await startStressServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const stageRes = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'Push 15m and tell Investor' }),
    });
    expect(stageRes.status).toBe(200);
    const preview = (await stageRes.json()) as { previewToken: string; idempotencyKey: string };

    // 3a: 25 parallel identical commits -> at most 1 external write executed
    const storm = await Promise.all(
      Array.from({ length: 25 }, () =>
        fetch(`${srv.url}/api/actions/commit`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey }),
        }),
      ),
    );
    expect(storm.every((r) => r.status === 200)).toBe(true);
    const snap = srv.demoProvider.getSnapshot();
    expect(snap.calendarEvents[0].startIso).toBe('2026-11-24T14:15:00.000Z');
    expect(snap.gmailThreads[0].sentMessages.length).toBe(1);

    // 3b: Fresh previewToken attacked with 25 parallel distinct idempotencyKeys -> 1x 200, 24x 409
    srv.demoProvider.resetSandbox();
    const stage2 = (await (
      await fetch(`${srv.url}/api/actions/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ commandText: 'Push 15m and tell Investor' }),
      })
    ).json()) as { previewToken: string };

    const replayStorm = await Promise.all(
      Array.from({ length: 25 }, (_, idx) =>
        fetch(`${srv.url}/api/actions/commit`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ previewToken: stage2.previewToken, idempotencyKey: `race_${idx}` }),
        }),
      ),
    );
    const codes = replayStorm.map((r) => r.status);
    expect(codes.filter((c) => c === 200).length).toBe(1);
    expect(codes.filter((c) => c === 409).length).toBe(24);
  });

  it('4. Adversarial XSS/SQL/malformed JSON/tampered cookie payloads sanitize cleanly without crashing relay', async () => {
    const srv = await startStressServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    // Malformed JSON body -> HTTP 500 clean JSON error, server remains healthy
    const badJson = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: '{"broken',
    });
    expect(badJson.status).toBeGreaterThanOrEqual(400);

    // Inject XSS + SQLi into Notion task & format frame -> LVGL sanitizer enforces <=42 cols & ASCII
    const xssTitle = `<script>alert(1)</script> '; DROP TABLE receipts;-- Q4 🔥`;
    const addTask = await fetch(`${srv.url}/api/workspace/notion/add`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ title: xssTitle }),
    });
    expect(addTask.status).toBe(200);

    const corridor = (await (
      await fetch(`${srv.url}/api/corridor`, { headers: { Authorization: `Bearer ${sessionToken}` } })
    ).json()) as { cards: Parameters<typeof createInitialHudState>[0] };
    const frame = formatLensFrame(createInitialHudState(corridor.cards, 'DEMO'));
    assertLensBudget(frame.lines);

    // Receipts + workspace state remain intact after SQLi string
    const stateRes = await fetch(`${srv.url}/api/workspace/state`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(stateRes.status).toBe(200);
    const stateJson = (await stateRes.json()) as { receipts: unknown[]; snapshot: { notionTasks: unknown[] } };
    expect(Array.isArray(stateJson.receipts)).toBe(true);
    expect(stateJson.snapshot.notionTasks.length).toBeGreaterThanOrEqual(1);

    // Tampered HttpOnly cookie denied with 401
    const forgedCookie = await fetch(`${srv.url}/api/connectors/status`, {
      headers: { Cookie: `onq_session=${sessionToken}.deadbeef0000` },
    });
    expect(forgedCookie.status).toBe(401);
  });

  it('5. WebSocket /api/voice/stream survives 50-frame PCM storm, handles barge_in, and wipes RAM on close', async () => {
    const srv = await startStressServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const wsUrl = srv.url.replace('http://', 'ws://') + `/api/voice/stream?token=${sessionToken}`;
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const receivedTypes: string[] = [];
    ws.on('message', (d) => {
      try {
        const parsed = JSON.parse(d.toString()) as { type?: string };
        if (parsed.type) receivedTypes.push(parsed.type);
      } catch {
        // ignore
      }
    });

    ws.send(JSON.stringify({ type: 'mode', mode: 'meeting' }));
    const frame = makeSpokenPcm(800, 4800);
    for (let i = 0; i < 50; i++) {
      ws.send(frame);
    }
    ws.send(JSON.stringify({ type: 'barge_in' }));
    // Wait for the messages instead of a fixed 150 ms, which raced on a loaded machine.
    for (let i = 0; i < 60 && !(receivedTypes.includes('orb_rms') && receivedTypes.includes('tts_cancelled')); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(receivedTypes).toContain('orb_rms');
    expect(receivedTypes).toContain('tts_cancelled');

    ws.close();
    await new Promise((r) => setTimeout(r, 150));
    const stRes = await fetch(`${srv.url}/api/workspace/state`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(stRes.status).toBe(200);
    const stJson = (await stRes.json()) as { auditLog: Array<{ kind: string }> };
    expect(stJson.auditLog.some((e) => e.kind === 'MEETING_WIPE')).toBe(true);
    expect(stJson.auditLog.some((e) => e.kind === 'TTS_BARGE_IN')).toBe(true);
  });

  it('6. Connect live RFC 5545 .ics calendar -> upgrades session to LIVE & passes /api/connectors/googleWorkspace/test', async () => {
    const srv = await startStressServer({
      nowFn: () => Date.parse('2026-11-25T15:30:00Z'),
    });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:ics-stress-1',
      'SUMMARY:Stress Sync - Live ICS',
      'DTSTART:20261125T160000Z',
      'DTEND:20261125T163000Z',
      'ATTENDEE;CN="Elena Vance":mailto:elena@acme.example',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const conn = await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ provider: 'ics', icsText: ics }),
    });
    expect(conn.status).toBe(200);
    const connJson = (await conn.json()) as { sessionToken: string; mode: string };
    expect(connJson.mode).toBe('LIVE');

    const testRes = await fetch(`${srv.url}/api/connectors/googleWorkspace/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${connJson.sessionToken}` },
    });
    const testJson = (await testRes.json()) as { ok: boolean; mode: string; detail: string };
    expect(testJson.ok).toBe(true);
    expect(testJson.mode).toBe('ICS');

    const corridor = (await (
      await fetch(`${srv.url}/api/corridor`, { headers: { Authorization: `Bearer ${connJson.sessionToken}` } })
    ).json()) as { cards: Array<{ title: string }>; sourceMode: string };
    expect(corridor.sourceMode).toBe('LIVE');
    expect(corridor.cards.some((c) => c.title.includes('Stress Sync'))).toBe(true);
  });
});
