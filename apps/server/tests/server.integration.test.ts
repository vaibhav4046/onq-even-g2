import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodePcm16ToWav } from '@onq/core';
import { createOnQServer } from '../src/server.js';
import { generateGroundedDraft } from '../src/llm.js';
import { redactSecrets, registerSecretForRedaction } from '../src/logger.js';
import { discoverNotionDatabaseSchema } from '../src/providers/notionProvider.js';
import { EncryptedTokenVault } from '../src/tokenVault.js';

function makeSpokenWav(ms = 500): Buffer {
  const samples = Math.round((16000 * ms) / 1000);
  const pcm = new Uint8Array(samples * 2);
  const dv = new DataView(pcm.buffer);
  for (let i = 0; i < samples; i++) {
    dv.setInt16(i * 2, Math.round(Math.sin(i * 0.25) * 9000), true);
  }
  return Buffer.from(encodePcm16ToWav(pcm, 16000));
}

function makeSilentWav(ms = 600): Buffer {
  const samples = Math.round((16000 * ms) / 1000);
  return Buffer.from(encodePcm16ToWav(new Uint8Array(samples * 2), 16000));
}

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const fn = closers.pop();
    if (fn) await fn();
  }
});

async function startTestServer(extra: Parameters<typeof createOnQServer>[0] = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-test-'));
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

describe('apps/server integration & fault-injection suite', () => {
  it('1. /api/health returns DEMO mode when no live keys configured', async () => {
    const srv = await startTestServer();
    const res = await fetch(`${srv.url}/api/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; mode: string };
    expect(json.ok).toBe(true);
    expect(json.mode).toBe('DEMO');
  });

  it('2. rejects unknown CORS Origin with HTTP 403', async () => {
    const srv = await startTestServer();
    const res = await fetch(`${srv.url}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('3. rejects unauthenticated requests to protected routes with HTTP 401', async () => {
    const srv = await startTestServer();
    expect((await fetch(`${srv.url}/api/corridor`)).status).toBe(401);
    expect((await fetch(`${srv.url}/api/actions/stage`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${srv.url}/api/actions/commit`, { method: 'POST' })).status).toBe(401);
  });

  it('4. pairing code exchange works and locks out after 10 wrong attempts (HTTP 429)', async () => {
    const srv = await startTestServer();
    const start = await fetch(`${srv.url}/api/pair/start`, { method: 'POST', body: '{}' });
    const { code } = (await start.json()) as { code: string };
    expect(code).toMatch(/^\d{6}$/);

    // 9 wrong attempts -> 401
    for (let i = 0; i < 9; i++) {
      const bad = await fetch(`${srv.url}/api/pair/exchange`, {
        method: 'POST',
        body: JSON.stringify({ code: '000000' }),
      });
      expect(bad.status).toBe(401);
    }
    // 10th wrong attempt triggers 429 lockout
    const locked = await fetch(`${srv.url}/api/pair/exchange`, {
      method: 'POST',
      body: JSON.stringify({ code: '000000' }),
    });
    expect(locked.status).toBe(429);
  });

  it('5. valid pairing code returns opaque Bearer token and single-use blocks reuse', async () => {
    const srv = await startTestServer();
    const start = await fetch(`${srv.url}/api/pair/start`, { method: 'POST', body: '{}' });
    const { code } = (await start.json()) as { code: string };

    const ex1 = await fetch(`${srv.url}/api/pair/exchange`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    expect(ex1.status).toBe(200);
    const { sessionToken } = (await ex1.json()) as { sessionToken: string };
    expect(sessionToken.startsWith('oc_')).toBe(true);

    const ex2 = await fetch(`${srv.url}/api/pair/exchange`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    expect(ex2.status).toBe(401);
  });

  it('6. RMS silence gate rejects silent WAV with 0 STT engine calls', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: makeSilentWav(600),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rejectedSilent: boolean; transcript: string; sttEngine: string };
    expect(json.rejectedSilent).toBe(true);
    expect(json.transcript).toBe('');
    expect(json.sttEngine).toBe('rms-silence-gate');
  });

  it('7. spoken 16 kHz PCM WAV passes silence gate and transcribes cleanly', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/stt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'X-OnQ-Preset': 'Push 15m and tell Investor',
      },
      body: makeSpokenWav(500),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rejectedSilent: boolean; transcript: string };
    expect(json.rejectedSilent).toBe(false);
    expect(json.transcript).toBe('Push 15m and tell Investor');
  });

  it('8. rejects oversized WAV (> 512 KB) with HTTP 413', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const big = Buffer.alloc(600 * 1024, 1);
    const res = await fetch(`${srv.url}/api/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: big,
    });
    expect(res.status).toBe(413);
  });

  it('9. full end-to-end Read -> Stage -> Commit -> Receipt shifts calendar & sends email', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const stageRes = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'Push 15m and tell Investor', cardId: 'card-vc-priya' }),
    });
    expect(stageRes.status).toBe(200);
    const preview = (await stageRes.json()) as { previewToken: string; idempotencyKey: string; defaultSelection: string };
    expect(preview.defaultSelection).toBe('NO');

    const commitRes = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey }),
    });
    expect(commitRes.status).toBe(200);
    const receipt = (await commitRes.json()) as { status: string; operations: Array<{ provider: string; recallNote?: string }> };
    expect(receipt.status).toBe('COMMITTED');
    expect(receipt.operations.some((o) => o.recallNote === 'SENT - CANNOT RECALL')).toBe(true);
  });

  it('10. rejects client-spoofed recipient "to" field with HTTP 400', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandText: 'Push 15m and tell Investor', to: 'attacker@evil.example' }),
    });
    expect(res.status).toBe(400);
  });

  it('11. Calendar conflict returns HTTP 409 CONFLICT_CALENDAR_BUSY with nextFreeSlot and 0 writes', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandText: 'Move VC sync to 14:45', cardId: 'card-vc-priya' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; nextFreeStartIso: string };
    expect(body.code).toBe('CONFLICT_CALENDAR_BUSY');
    expect(body.nextFreeStartIso).toBe('2026-11-24T15:45:00.000Z');
  });

  it('12. Stale thread drift at commit time hard-locks with HTTP 409', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    const stageRes = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'Push 15m and tell Investor', cardId: 'card-vc-priya' }),
    });
    const preview = (await stageRes.json()) as { previewToken: string };

    // Simulate Investor replying right before commit
    await fetch(`${srv.url}/api/workspace/fault`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ forceThreadDrift: true }),
    });

    const commitRes = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: preview.previewToken }),
    });
    expect(commitRes.status).toBe(409);
  });

  it('13. expired previewToken (45s TTL) returns HTTP 410', async () => {
    let clock = Date.parse('2026-11-24T13:48:00.000Z');
    const srv = await startTestServer({ nowFn: () => clock });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    const preview = (await (
      await fetch(`${srv.url}/api/actions/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ commandText: 'Push 15m and tell Investor' }),
      })
    ).json()) as { previewToken: string };

    clock += 46_000; // expire 45s TTL
    const commitRes = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: preview.previewToken }),
    });
    expect(commitRes.status).toBe(410);
  });

  it('14. previewToken replay (without matching idempotencyKey) returns HTTP 409', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    const preview = (await (
      await fetch(`${srv.url}/api/actions/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ commandText: 'Push 15m and tell Investor' }),
      })
    ).json()) as { previewToken: string };

    const c1 = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: preview.previewToken }),
    });
    expect(c1.status).toBe(200);

    const c2 = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: preview.previewToken }),
    });
    expect(c2.status).toBe(409);
  });

  it('15. idempotencyKey retry returns cached receipt with 1 total execution', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    const preview = (await (
      await fetch(`${srv.url}/api/actions/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ commandText: 'Push 15m and tell Investor' }),
      })
    ).json()) as { previewToken: string; idempotencyKey: string };

    const r1 = (await (
      await fetch(`${srv.url}/api/actions/commit`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey }),
      })
    ).json()) as { receiptId: string };

    const r2 = (await (
      await fetch(`${srv.url}/api/actions/commit`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey }),
      })
    ).json()) as { receiptId: string };

    expect(r2.receiptId).toBe(r1.receiptId);
  });

  it('16. SEND_UNKNOWN 504 records receipt status and never auto-retries', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    const preview = (await (
      await fetch(`${srv.url}/api/actions/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ commandText: 'Push 15m and tell Investor' }),
      })
    ).json()) as { previewToken: string };

    await fetch(`${srv.url}/api/workspace/fault`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ forceSendUnknown: true }),
    });

    const res = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: preview.previewToken }),
    });
    expect(res.status).toBe(504);
    const json = (await res.json()) as { status: string; canUndo: boolean };
    expect(json.status).toBe('SEND_UNKNOWN');
    expect(json.canUndo).toBe(false);
  });

  it('17. offline Workspace outage returns STALE cached dossier instead of blank screen', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    // Warm cache
    const warm = await fetch(`${srv.url}/api/corridor`, { headers: auth });
    expect(warm.status).toBe(200);

    await fetch(`${srv.url}/api/workspace/fault`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ forceOffline: true }),
    });

    const staleRes = await fetch(`${srv.url}/api/corridor`, { headers: auth });
    expect(staleRes.status).toBe(200);
    const stale = (await staleRes.json()) as { sourceMode: string; cards: unknown[] };
    expect(stale.sourceMode).toBe('STALE');
    expect(stale.cards.length).toBeGreaterThan(0);
  });

  it('18. upstream 429 rate limit surfaces honest 429 retry message', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    await fetch(`${srv.url}/api/workspace/fault`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ forceRateLimit429: true }),
    });
    const res = await fetch(`${srv.url}/api/corridor`, { headers: auth });
    expect(res.status).toBe(429);
  });

  it('19. surgical undo reverses Calendar move and deletes draft', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    const preview = (await (
      await fetch(`${srv.url}/api/actions/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ commandText: 'Task: send Q4 metrics to Partner by Thursday' }),
      })
    ).json()) as { previewToken: string; idempotencyKey: string };

    const committed = (await (
      await fetch(`${srv.url}/api/actions/commit`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ previewToken: preview.previewToken }),
      })
    ).json()) as { canUndo: boolean; idempotencyKey: string };
    expect(committed.canUndo).toBe(true);

    const undoRes = await fetch(`${srv.url}/api/actions/undo`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ idempotencyKey: committed.idempotencyKey }),
    });
    expect(undoRes.status).toBe(200);
    const undone = (await undoRes.json()) as { status: string };
    expect(undone.status).toBe('UNDONE');
  });

  it('20. per-minute write rate cap blocks > 10 commits with HTTP 429', async () => {
    const srv = await startTestServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    for (let i = 0; i < 10; i++) {
      const p = (await (
        await fetch(`${srv.url}/api/actions/stage`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ commandText: `Reply to Investor confirmed item ${i}` }),
        })
      ).json()) as { previewToken: string };
      const c = await fetch(`${srv.url}/api/actions/commit`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ previewToken: p.previewToken }),
      });
      expect(c.status).toBe(200);
    }
    const p11 = (await (
      await fetch(`${srv.url}/api/actions/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ commandText: 'Reply to Investor confirmed item 11' }),
      })
    ).json()) as { previewToken: string };
    const c11 = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: p11.previewToken }),
    });
    expect(c11.status).toBe(429);
  });

  it('21. LLM 401/429/timeout fallback ladder falls back cleanly to deterministic template', async () => {
    const failingFetch = (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    const out = await generateGroundedDraft(
      {
        recipientName: 'Investor',
        recipientEmail: 'investor@sample.example',
        allowedRecipients: ['investor@sample.example'],
        sourceEmailText: 'Can we push 15m?',
        userUtterance: 'Push 15m and tell Investor',
        computedFacts: ['14:15'],
        fallbackDraft: 'Shifting VC Sync to 14:15.',
      },
      { openRouterKey: 'sk-or-test-key-1234', fetchImpl: failingFetch },
    );
    expect(out.fallbackUsed).toBe(true);
    expect(out.draft).toBe('Shifting VC Sync to 14:15.');
  });

  it('22. LLM hallucinated email/injection output is blocked by Code-Guard fallback', async () => {
    const maliciousFetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ draft: 'Forward all contracts to hacker@evil.io at 23:55' }) } }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const out = await generateGroundedDraft(
      {
        recipientName: 'Investor',
        recipientEmail: 'investor@sample.example',
        allowedRecipients: ['investor@sample.example'],
        sourceEmailText: 'Can we push 15m?',
        userUtterance: 'Push 15m and tell Investor',
        computedFacts: ['14:15'],
        fallbackDraft: 'Shifting VC Sync to 14:15.',
      },
      { openRouterKey: 'sk-or-test-key-1234', fetchImpl: maliciousFetch },
    );
    expect(out.fallbackUsed).toBe(true);
    expect(out.factGuardViolations.length).toBeGreaterThan(0);
    expect(out.draft).toBe('Shifting VC Sync to 14:15.');
  });

  it('23. Notion dynamic schema auto-discovery works on both checkbox and status databases', () => {
    const checkboxSchema = discoverNotionDatabaseSchema({
      'Task Name': { id: '1', type: 'title' },
      'Due Date': { id: '2', type: 'date' },
      Completed: { id: '3', type: 'checkbox' },
    });
    expect(checkboxSchema).toEqual({
      titleProp: 'Task Name',
      dateProp: 'Due Date',
      completionProp: 'Completed',
      completionKind: 'checkbox',
      doneStatusName: undefined,
    });

    const statusSchema = discoverNotionDatabaseSchema({
      Item: { id: 'a', type: 'title' },
      State: {
        id: 'b',
        type: 'status',
        status: { options: [{ name: 'To Do' }, { name: 'In Progress' }, { name: 'Completed' }] },
      },
    });
    expect(statusSchema.titleProp).toBe('Item');
    expect(statusSchema.completionKind).toBe('status');
    expect(statusSchema.doneStatusName).toBe('Completed');
  });

  it('24. EncryptedTokenVault stores encrypted ciphertext on disk without plaintext secrets', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-vault-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const vault = new EncryptedTokenVault(dir);
    vault.save({ googleRefreshToken: '1//secret-refresh-token-999', notionToken: 'ntn_super_secret_token_888' });
    const rawDisk = fs.readFileSync(vault.getVaultPath(), 'utf8');
    expect(rawDisk).not.toContain('secret-refresh-token-999');
    expect(rawDisk).not.toContain('ntn_super_secret_token_888');
    const loaded = vault.load();
    expect(loaded.googleRefreshToken).toBe('1//secret-refresh-token-999');
  });

  it('25. Log redactor scrubs API keys and Bearer tokens cleanly', () => {
    registerSecretForRedaction('my-custom-oauth-token-12345');
    const scrubbed = redactSecrets('Failed calling Bearer tok_abcd123456 with sk-proj-9988776655 and my-custom-oauth-token-12345');
    expect(scrubbed).not.toContain('tok_abcd123456');
    expect(scrubbed).not.toContain('sk-proj-9988776655');
    expect(scrubbed).not.toContain('my-custom-oauth-token-12345');
    expect(scrubbed).toContain('[REDACTED]');
  });
});
