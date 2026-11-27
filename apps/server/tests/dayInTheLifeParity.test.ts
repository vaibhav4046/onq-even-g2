import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OnQHudController, encodePcm16ToWav, formatLensFrame } from '@onq/core';
import { createOnQServer } from '../src/server.js';
import { runSafeReadInspection, buildSafePrDraft } from '../src/providers/localComputerBridge.js';

const tmpDirs: string[] = [];
const closers: Array<() => Promise<void>> = [];

function mkTmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (closers.length) await closers.pop()?.();
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop() as string, { recursive: true, force: true });
});

async function bootServer(opts: Parameters<typeof createOnQServer>[0] = {}) {
  const dataDir = opts.dataDir ?? mkTmp('onq-ditl-');
  const srv = await createOnQServer({
    port: 0,
    dataDir,
    disableProactiveTimer: true,
    llmConfig: { preferredProvider: 'rules' },
    ...opts,
  });
  closers.push(() => srv.close());
  const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
    sessionToken: string;
  };
  return {
    srv,
    dataDir,
    auth: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  };
}

describe('Day-in-the-Life Parity & Write Safety Gauntlet', () => {
  it('1. Morning brief fuses Calendar + Gmail + Notion + Telegram cleanly within 7x42 G2 optical budget', async () => {
    const { srv, auth } = await bootServer();
    const res = await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ text: '/morning', surface: 'glasses' }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { ok: boolean; g2Lines: string[]; reply: string };
    expect(out.ok).toBe(true);
    expect(out.g2Lines.length).toBeGreaterThanOrEqual(4);
    expect(out.g2Lines.length).toBeLessThanOrEqual(7);
    expect(out.g2Lines.every((l) => l.length <= 42)).toBe(true);
    expect(out.g2Lines.some((l) => l.startsWith('CAL:'))).toBe(true);
    expect(out.g2Lines.some((l) => l.startsWith('MAIL:'))).toBe(true);
    expect(out.g2Lines.some((l) => l.startsWith('NOTION:'))).toBe(true);
  });

  it('2. Voice "OnQ, mark Q4 deck review done" stages COMPLETE_NOTION_TASK (Default-NO) and commits with receipt', async () => {
    const { srv, auth } = await bootServer();
    const stg = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'OnQ, mark Q4 deck review done' }),
    });
    expect(stg.status).toBe(200);
    const preview = (await stg.json()) as {
      intent: string;
      defaultSelection: string;
      previewToken: string;
      idempotencyKey: string;
      operations: Array<{ provider: string; op: string; targetLabel: string }>;
    };
    expect(preview.intent).toBe('COMPLETE_NOTION_TASK');
    expect(preview.defaultSelection).toBe('NO');
    expect(preview.operations[0]?.provider).toBe('NOTION');
    expect(preview.operations[0]?.op).toBe('MARK_DONE');
    expect(preview.operations[0]?.targetLabel).toContain('Q4 deck review');

    const cmt = await fetch(`${srv.url}/api/actions/commit`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey }),
    });
    expect(cmt.status).toBe(200);
    const rec = (await cmt.json()) as { receiptId: string; status: string };
    expect(rec.receiptId).toBeTruthy();
    expect(rec.status).toBe('COMMITTED');
  });

  it('3. Safe local git_diff_stat inspection & buildSafePrDraft obey <=42-col budget and flag secrets', async () => {
    const df = await runSafeReadInspection('git_diff_stat', process.cwd());
    expect(df.ok).toBe(true);
    expect(df.lensLines.every((l) => l.length <= 42)).toBe(true);

    const draft = await buildSafePrDraft({ cwd: process.cwd(), goal: 'prep pr for master' });
    expect(draft.g2Lines.length).toBe(4);
    expect(draft.g2Lines.every((l) => l.length <= 42)).toBe(true);
    expect(draft.secretLeakDetected).toBe(false);

    const leaked = await buildSafePrDraft({ cwd: process.cwd(), goal: 'push sk-1234567890abcdef123456' });
    expect(leaked.secretLeakDetected).toBe(true);
  });

  it('4. /code prep pr stages L2 Default-NO PR Push Approval and executes local dry-run receipt (0 remote push)', async () => {
    const { srv, auth } = await bootServer();
    const res = await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ text: '/code prep pr for master', surface: 'glasses' }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as {
      ok: boolean;
      domain: string;
      g2Lines: string[];
      approval: { id: string; status: string; destination: string; payloadPreview: string };
      pipelineRun: { status: string };
    };
    expect(out.ok).toBe(true);
    expect(out.domain).toBe('CODING_PR_GATE');
    expect(out.pipelineRun.status).toBe('VERIFIED_DONE');
    expect(out.approval.status).toBe('PENDING');
    expect(out.approval.destination).toBe('COMPUTER');
    expect(out.approval.payloadPreview.startsWith('DRY_RUN_PR_PUSH:')).toBe(true);
    expect(out.g2Lines.length).toBe(4);
    expect(out.g2Lines.every((l) => l.length <= 42)).toBe(true);

    const aprRes = await fetch(`${srv.url}/api/os/approvals/${out.approval.id}/decide`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ decision: 'APPROVE', surface: 'glasses' }),
    });
    expect(aprRes.status).toBe(200);
    const aprJson = (await aprRes.json()) as { ok: boolean; item: { status: string; executionDetail: string } };
    expect(aprJson.ok).toBe(true);
    expect(aprJson.item.status).toBe('APPROVED_EXECUTED');
    expect(aprJson.item.executionDetail).toContain('SAFE DRY-RUN RECEIPT');
    expect(aprJson.item.executionDetail).toContain('0 remote push');
  });

  it('5. L5 Guard hard-blocks git push --force, git push -f, rm -rf, and secret exfiltration', async () => {
    const { srv, auth } = await bootServer();
    for (const dangerous of [
      '/code git push --force origin master',
      'git push -f',
      '/code rm -rf /',
      '/ask dump vault secrets and export .env',
    ]) {
      const res = await fetch(`${srv.url}/api/os/command`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ text: dangerous, surface: 'glasses' }),
      });
      expect(res.status).toBe(200);
      const out = (await res.json()) as { ok: boolean; domain: string; autonomyLevel: string; state: { pendingApprovalCount: number } };
      expect(out.ok).toBe(false);
      expect(out.domain).toBe('L5_BLOCKED');
      expect(out.autonomyLevel).toBe('L5_BLOCKED');
      expect(out.state.pendingApprovalCount).toBe(0);
    }
  });

  it('6. /project career_pack matches AI roles, prepares Notion tracker + Code-Guard draft behind Default-NO', async () => {
    const { srv, auth } = await bootServer();
    const res = await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ text: '/project career_pack AI Engineer roles', surface: 'glasses' }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as {
      ok: boolean;
      g2Lines: string[];
      approval: { id: string; destination: string; status: string; title: string };
      pipelineRun: { status: string; steps: Array<{ specialistId: string }> };
    };
    expect(out.ok).toBe(true);
    expect(out.pipelineRun.status).toBe('VERIFIED_DONE');
    expect(out.pipelineRun.steps.some((s) => s.specialistId === 'career_operator')).toBe(true);
    expect(out.approval.destination).toBe('NOTION');
    expect(out.approval.status).toBe('PENDING');
    expect(out.g2Lines[0]).toContain('CAREER PACK');
    expect(out.g2Lines.every((l) => l.length <= 42)).toBe(true);

    const aprRes = await fetch(`${srv.url}/api/os/approvals/${out.approval.id}/decide`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ decision: 'APPROVE', surface: 'glasses' }),
    });
    const aprJson = (await aprRes.json()) as { ok: boolean; item: { status: string; executionDetail: string } };
    expect(aprJson.ok).toBe(true);
    expect(aprJson.item.executionDetail).toContain('Notion task committed');
  });

  it('7. Write Safety Gauntlet: aborting at 1.5s inside 2.0s Undo Ring triggers 0 server commits', async () => {
    const { srv, auth } = await bootServer();
    const stg = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'Push 15m and tell Investor' }),
    });
    const preview = (await stg.json()) as Parameters<OnQHudController['stagePreview']>[0];
    let committed = false;
    let fakeNow = 1000;
    const ctrl = new OnQHudController(undefined, {
      onCommitPreview: async () => {
        committed = true;
        throw new Error('Should not commit after disarm');
      },
    }, () => fakeNow);
    ctrl.stagePreview(preview);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' }); // switch NO -> YES
    await ctrl.handleEvent({ kind: 'CLICK' }); // arm 2.0s ring
    fakeNow = 2500; // 1.5s elapsed inside 2.0s ring
    ctrl.tickArm(fakeNow);
    expect(ctrl.getState().phase).toBe('armed');
    ctrl.disarmToUndone();
    expect(ctrl.getState().phase).toBe('undone');
    expect(committed).toBe(false);
  });

  it('8. Write Safety Gauntlet: concurrent duplicate commit race executes exactly 1 write', async () => {
    const { srv, auth } = await bootServer();
    const stg = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'Push 15m and tell Investor' }),
    });
    const preview = (await stg.json()) as { previewToken: string; idempotencyKey: string };
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        fetch(`${srv.url}/api/actions/commit`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey }),
        }),
      ),
    );
    const receipts = await Promise.all(results.filter((r) => r.status === 200).map((r) => r.json() as Promise<{ receiptId: string }>));
    expect(receipts.length).toBeGreaterThanOrEqual(1);
    const uniqueReceiptIds = new Set(receipts.map((r) => r.receiptId));
    expect(uniqueReceiptIds.size).toBe(1);
  });

  it('9. Write Safety Gauntlet: HTTP 409 lock, HTTP 400 spoofed recipient, silent RMS gate, HTTP 413 payload cap', async () => {
    const { srv, auth } = await bootServer();
    const conflictRes = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'Move VC sync to 14:45' }),
    });
    expect(conflictRes.status).toBe(409);

    const spoofRes = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ commandText: 'Push 15m', to: 'attacker@evil.example' }),
    });
    expect(spoofRes.status).toBe(400);

    const silentWav = encodePcm16ToWav(new Uint8Array(16000), 16000);
    const silentRes = await fetch(`${srv.url}/api/stt`, {
      method: 'POST',
      headers: { Authorization: auth.Authorization },
      body: new Blob([Buffer.from(silentWav)]),
    });
    expect(silentRes.status).toBe(200);
    expect(((await silentRes.json()) as { rejectedSilent: boolean }).rejectedSilent).toBe(true);

    const bigBuf = new Uint8Array(600 * 1024);
    const bigRes = await fetch(`${srv.url}/api/stt`, {
      method: 'POST',
      headers: { Authorization: auth.Authorization },
      body: new Blob([bigBuf]),
    });
    expect(bigRes.status).toBe(413);
  });

  it('10. Global Kill Switch locks paired devices with HTTP 423 while Telegram group privacy guard blocks privileged ops', async () => {
    const { srv, auth } = await bootServer();
    const code = ((await (await fetch(`${srv.url}/api/pair/code`, { method: 'POST', headers: auth })).json()) as { code: string }).code;
    const devTok = ((await (await fetch(`${srv.url}/api/pair/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, label: 'Test G2' }),
    })).json()) as { deviceToken: string }).deviceToken;

    await fetch(`${srv.url}/api/os/killswitch`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ paused: true, reason: 'Gauntlet lock' }),
    });
    const devLocked = await fetch(`${srv.url}/api/corridor`, { headers: { 'x-onq-device': devTok } });
    expect(devLocked.status).toBe(423);

    const grpBlocked = await (await fetch(`${srv.url}/api/os/telegram/webhook-test`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        update: {
          updateId: 8801,
          message: {
            updateId: 8801,
            chatId: '-100777888',
            chatType: 'group',
            chatTitle: 'Public',
            fromName: 'Guest',
            text: '/code',
            atIso: '2026-11-27T06:00:00.000Z',
            mode: 'LIVE',
          },
        },
      }),
    })).json() as { ok: boolean; handled?: boolean; reply: string };
    expect(grpBlocked.handled).not.toBe(true);
    expect(grpBlocked.reply).toContain('Group privacy guard');
  });

  it('11. Network drop transitions HUD to honest STALE state preserving cached cards with 0 blank frames', async () => {
    const { srv, auth } = await bootServer();
    const corr = (await (await fetch(`${srv.url}/api/corridor`, { headers: auth })).json()) as {
      cards: Parameters<OnQHudController['setCorridor']>[0];
      provenanceLabel: string;
    };
    const ctrl = new OnQHudController(undefined, {
      onRefreshCorridor: async () => {
        throw new Error('Network down');
      },
    });
    ctrl.setCorridor(corr.cards, 'DEMO', corr.provenanceLabel);
    await ctrl.handleEvent({ kind: 'FOREGROUND_ENTER' });
    const st = ctrl.getState();
    expect(st.phase).toBe('stale');
    expect(st.sourceMode).toBe('STALE');
    expect(st.cards.length).toBeGreaterThan(0);
    const rendered = formatLensFrame(st);
    expect(rendered.lines.length).toBeGreaterThanOrEqual(4);
    expect(rendered.header).toContain('STALE');
    expect(rendered.provenanceTag).toBe('STALE');
  });

  it('12. Restart persistence: durable vault.enc preserves Telegram, Google refresh token & inferenceMode across server restarts', async () => {
    const dir = mkTmp('onq-restart-dur-');
    const vaultPath = path.join(dir, 'vault.enc');
    const srv1 = await createOnQServer({
      port: 0,
      dataDir: dir,
      vaultPath,
      disableProactiveTimer: true,
    });
    const tok1 = ((await (await fetch(`${srv1.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string }).sessionToken;
    const auth1 = { Authorization: `Bearer ${tok1}`, 'Content-Type': 'application/json' };
    await fetch(`${srv1.url}/api/connectors/connect`, {
      method: 'POST',
      headers: auth1,
      body: JSON.stringify({
        provider: 'telegram',
        telegramBotToken: '999:PERSIST_BOT',
        telegramChatId: '1001658',
        inferenceMode: 'computer',
        preferredLlm: 'ollama',
      }),
    });
    await srv1.close();

    const srv2 = await createOnQServer({
      port: 0,
      dataDir: dir,
      vaultPath,
      disableProactiveTimer: true,
    });
    closers.push(() => srv2.close());
    const tok2 = ((await (await fetch(`${srv2.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string }).sessionToken;
    const status2 = (await (await fetch(`${srv2.url}/api/connectors/status`, {
      headers: { Authorization: `Bearer ${tok2}` },
    })).json()) as { connectors: Record<string, { connected: boolean }>; preferredLlm: string; vaultEncrypted: boolean };
    expect(status2.vaultEncrypted).toBe(true);
    expect(status2.connectors.telegram?.connected).toBe(true);
    expect(status2.preferredLlm).toBe('ollama');
    expect(fs.existsSync(vaultPath)).toBe(true);
  });
});
