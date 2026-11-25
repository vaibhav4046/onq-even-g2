import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatLensFrame, createInitialHudState } from '@onq/core';
import type { CorridorCard } from '@onq/core';
import { createOnQServer } from '../src/server.js';
import { MusicCuratorEngine } from '../src/harness/musicCuratorEngine.js';
import { detectL5BlockedRequest, SPECIALIST_ROSTER } from '../src/harness/unifiedOsHarness.js';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const fn = closers.pop();
    if (fn) await fn();
  }
});

function createMockOsFetch(capturedTelegramPayloads: Array<{ method: string; body: Record<string, unknown> }>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.startsWith('https://itunes.apple.com/search')) {
      return new Response(
        JSON.stringify({
          resultCount: 2,
          results: [
            {
              trackId: 1001,
              trackName: 'Weightless Focus',
              artistName: 'Marconi Union',
              collectionName: 'Ambient Studies',
              trackTimeMillis: 480_000,
              previewUrl: 'https://audio-ssl.itunes.apple.com/sample-1.m4a',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/sample-1.jpg',
              trackViewUrl: 'https://music.apple.com/us/album/sample-1',
            },
            {
              trackId: 1002,
              trackName: 'Deep Code Pulse',
              artistName: 'Kiasmos',
              collectionName: 'Circuit Sessions',
              trackTimeMillis: 315_000,
              previewUrl: 'https://audio-ssl.itunes.apple.com/sample-2.m4a',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.startsWith('https://api.coingecko.com/')) {
      return new Response(
        JSON.stringify({
          bitcoin: { usd: 97250, usd_24h_change: 3.1 },
          ethereum: { usd: 3520, usd_24h_change: 2.4 },
          solana: { usd: 242, usd_24h_change: 4.8 },
          bittensor: { usd: 548, usd_24h_change: -1.1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.startsWith('https://api.telegram.org/')) {
      const method = url.split('/').pop()?.split('?')[0] ?? 'unknown';
      const parsedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      capturedTelegramPayloads.push({ method, body: parsedBody });
      return new Response(
        JSON.stringify({
          ok: true,
          result: method === 'sendMessage' ? { message_id: 901 } : true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

async function startCleanServer(
  capturedTg: Array<{ method: string; body: Record<string, unknown> }> = [],
  nowFn?: () => number,
) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-unified-os-'));
  const srv = await createOnQServer({
    port: 0,
    dataDir,
    allowTestFaultControls: true,
    disableProactiveTimer: true,
    fetchImpl: createMockOsFetch(capturedTg),
    nowFn,
  });
  closers.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const sessRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
  const { sessionToken } = (await sessRes.json()) as { sessionToken: string };
  return { ...srv, dataDir, sessionToken };
}

describe('Unified Autonomous Personal OS Harness (Web + G2 Glasses + Telegram + Music)', () => {
  it('1. Enforces L5 hard-blocks and maintains 10 least-privilege specialist agents', () => {
    expect(SPECIALIST_ROSTER).toHaveLength(10);
    expect(SPECIALIST_ROSTER.find((s) => s.id === 'auditor')?.maxAutonomy).toBe('L0_EXPLAIN');
    expect(detectL5BlockedRequest('Buy live btc with real money order now')).toContain('L5 Hard Block');
    expect(detectL5BlockedRequest('Please run rm -rf / on production')).toContain('L5 Hard Block');
    expect(detectL5BlockedRequest('Export api key to external email')).toContain('L5 Hard Block');
    expect(detectL5BlockedRequest('/status')).toBeNull();
  });

  it('2. MusicCuratorEngine fetches live iTunes catalog without silent auto-play and falls back honestly offline', async () => {
    const engine = new MusicCuratorEngine(() => Date.parse('2026-11-25T16:00:00Z'));
    const live = await engine.curateSession({
      mood: 'deep_focus',
      durationMin: 45,
      fetchImpl: createMockOsFetch([]),
    });
    expect(live.catalogStatus).toBe('LIVE_ITUNES');
    expect(live.tracks).toHaveLength(2);
    expect(live.tracks[0].title).toBe('Weightless Focus');
    expect(live.autoPlayBlocked).toBe(true);
    expect(live.confirmedPlayback).toBe(false);
    expect(live.g2Lines.every((l) => l.length <= 42)).toBe(true);

    const offline = await engine.curateSession({
      mood: 'gym',
      durationMin: 30,
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });
    expect(offline.catalogStatus).toBe('OFFLINE_FALLBACK');
    expect(offline.tracks).toHaveLength(0);
    expect(offline.g2Lines[1]).toContain('OFFLINE');
  });

  it('3. Global Kill Switch blocks L3 routines and L4 pipelines until resumed cleanly', async () => {
    const srv = await startCleanServer();
    const auth = { Authorization: `Bearer ${srv.sessionToken}`, 'Content-Type': 'application/json' };

    const pauseRes = await fetch(`${srv.url}/api/os/killswitch`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ paused: true, reason: 'Operator safety check' }),
    });
    expect(pauseRes.status).toBe(200);
    const pausedJson = (await pauseRes.json()) as { state: { killSwitch: { paused: boolean } } };
    expect(pausedJson.state.killSwitch.paused).toBe(true);

    const rtnBlocked = await (
      await fetch(`${srv.url}/api/os/routines/run`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ routineId: 'morning_brief' }),
      })
    ).json() as { ok: boolean; detail: string };
    expect(rtnBlocked.ok).toBe(false);
    expect(rtnBlocked.detail).toContain('PAUSED');

    const pipeBlocked = await (
      await fetch(`${srv.url}/api/os/pipeline/run`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ preset: 'software_delivery' }),
      })
    ).json() as { ok: boolean; run: { status: string } };
    expect(pipeBlocked.ok).toBe(false);
    expect(pipeBlocked.run.status).toBe('BLOCKED_KILL_SWITCH');

    const resumeRes = await (
      await fetch(`${srv.url}/api/os/command`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ text: '/resume all', surface: 'glasses' }),
      })
    ).json() as { ok: boolean; domain: string };
    expect(resumeRes.ok).toBe(true);

    const pipeOk = await (
      await fetch(`${srv.url}/api/os/pipeline/run`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ preset: 'software_delivery', goal: 'Verify repo + cited docs' }),
      })
    ).json() as { ok: boolean; run: { status: string; steps: Array<{ specialistId: string }>; auditorVerdict: string } };
    expect(pipeOk.ok).toBe(true);
    expect(pipeOk.run.status).toBe('VERIFIED_DONE');
    expect(pipeOk.run.steps.some((s) => s.specialistId === 'developer')).toBe(true);
    expect(pipeOk.run.steps.some((s) => s.specialistId === 'auditor')).toBe(true);
    expect(pipeOk.run.auditorVerdict).toContain('VERIFIED');
  });

  it('4. Persists Grok-Bot reusable skills & routines across restarts in dataDir', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-os-persist-'));
    const srv1 = await createOnQServer({
      port: 0,
      dataDir,
      disableProactiveTimer: true,
      fetchImpl: createMockOsFetch([]),
    });
    const tok1 = ((await (await fetch(`${srv1.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string })
      .sessionToken;

    const created = await (
      await fetch(`${srv1.url}/api/os/skills/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok1}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily AI Changelog Digest',
          triggerCommand: '/changelog',
          specialistId: 'content_producer',
        }),
      })
    ).json() as { ok: boolean; skill: { id: string; name: string } };
    expect(created.ok).toBe(true);
    await srv1.close();

    const srv2 = await createOnQServer({
      port: 0,
      dataDir,
      disableProactiveTimer: true,
      fetchImpl: createMockOsFetch([]),
    });
    closers.push(async () => {
      await srv2.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    });
    const tok2 = ((await (await fetch(`${srv2.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string })
      .sessionToken;
    const state2 = await (
      await fetch(`${srv2.url}/api/os/state`, {
        headers: { Authorization: `Bearer ${tok2}` },
      })
    ).json() as { skills: Array<{ name: string }> };
    expect(state2.skills.some((s) => s.name === 'Daily AI Changelog Digest')).toBe(true);
  });

  it('5. Executes ALL Telegram Command Centre commands, group privacy guard, and inline keyboard approvals', async () => {
    const capturedTg: Array<{ method: string; body: Record<string, unknown> }> = [];
    const srv = await startCleanServer(capturedTg);
    const auth = { Authorization: `Bearer ${srv.sessionToken}`, 'Content-Type': 'application/json' };

    // Connect live Telegram credentials in server vault (mocked fetch records outgoing Telegram messages)
    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        provider: 'telegram',
        telegramBotToken: '123456:TEST_BOT_TOKEN',
        telegramChatId: '999000111',
      }),
    });

    // Test complete command matrix over HTTP /api/os/command + Telegram webhook-test
    for (const text of [
      '/help',
      '/status',
      '/calendar',
      '/inbox',
      '/research btc market',
      '/jobs',
      '/code',
      '/music coding 35m',
      '/focus 25m',
      '/settings',
      '/ask What is the OnQ safety rule?',
    ]) {
      const res = await (
        await fetch(`${srv.url}/api/os/command`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ text, surface: 'web' }),
        })
      ).json() as { ok: boolean; g2Lines: string[]; reply: string };
      expect(res.ok).toBe(true);
      expect(res.g2Lines.every((l) => l.length <= 42)).toBe(true);
    }

    // Group chat privacy guard must block privileged commands
    const groupBlocked = await (
      await fetch(`${srv.url}/api/os/telegram/webhook-test`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          update: {
            updateId: 7001,
            message: {
              updateId: 7001,
              chatId: '-100888777',
              chatType: 'supergroup',
              chatTitle: 'Public Group',
              fromName: 'Stranger',
              text: '/inbox',
              atIso: '2026-11-25T16:00:00.000Z',
              mode: 'LIVE',
            },
          },
        }),
      })
    ).json() as { ok: boolean; reply: string };
    expect(groupBlocked.reply).toContain('Group privacy guard');

    // Stage an L2 Telegram send via Telegram owner DM -> verifies inline keyboard + single-use execution
    const taskRes = await (
      await fetch(`${srv.url}/api/os/telegram/webhook-test`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          update: {
            updateId: 7002,
            message: {
              updateId: 7002,
              chatId: '999000111',
              chatType: 'private',
              chatTitle: 'Owner DM',
              fromName: 'Vaibhav',
              text: '/task Confirm demo build shipped cleanly',
              atIso: '2026-11-25T16:01:00.000Z',
              mode: 'LIVE',
            },
          },
        }),
      })
    ).json() as { state: { approvals: Array<{ id: string; status: string }> } };
    const approvalId = taskRes.state.approvals[0].id;
    expect(taskRes.state.approvals[0].status).toBe('PENDING');
    expect(capturedTg.some((c) => c.method === 'sendMessage' && Boolean(c.body.reply_markup))).toBe(true);

    // Unauthorized chat ID cannot approve L2 item via Telegram callback
    const rogueCallback = await (
      await fetch(`${srv.url}/api/os/telegram/webhook-test`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          update: {
            updateId: 7003,
            callbackQuery: {
              id: 'cq_rogue',
              chatId: '7777777',
              fromName: 'Attacker',
              data: `approve:${approvalId}`,
            },
          },
        }),
      })
    ).json() as { reply: string };
    expect(rogueCallback.reply).toContain('Unauthorized Telegram chat ID');

    // Authorized owner inline callback approves + executes ONCE cleanly
    const ownerCallback = await (
      await fetch(`${srv.url}/api/os/telegram/webhook-test`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          update: {
            updateId: 7004,
            callbackQuery: {
              id: 'cq_owner',
              chatId: '999000111',
              fromName: 'Vaibhav',
              data: `approve:${approvalId}`,
            },
          },
        }),
      })
    ).json() as { reply: string; state: { approvals: Array<{ id: string; status: string }> } };
    expect(ownerCallback.reply).toContain('Executed');
    expect(ownerCallback.state.approvals[0].status).toBe('APPROVED_EXECUTED');
    expect(capturedTg.some((c) => c.method === 'answerCallbackQuery')).toBe(true);

    // Replay of already-finalized approval via HTTP must return 409 conflict
    const replayRes = await fetch(`${srv.url}/api/os/approvals/${approvalId}/decide`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ decision: 'approve', surface: 'glasses' }),
    });
    expect(replayRes.status).toBe(409);
  });

  it('6. Corridor preserves cards 0..3 order and Card 4 Unified OS fits G2 7x42 / 999-byte optical cap', async () => {
    const srv = await startCleanServer();
    const res = await fetch(`${srv.url}/api/corridor`, {
      headers: { Authorization: `Bearer ${srv.sessionToken}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cards: CorridorCard[]; sourceMode: 'DEMO' };
    expect(data.cards.length).toBeGreaterThanOrEqual(5);
    expect(data.cards[2].id).toBe('card-telegram-bridge');
    expect(data.cards[3].id).toBe('card-computer-proactive');
    expect(data.cards[4].id).toBe('card-unified-os');

    const hud = createInitialHudState(data.cards, data.sourceMode);
    hud.selectedCardIndex = 4;
    const frame = formatLensFrame(hud);
    expect(frame.utf8Bytes).toBeLessThanOrEqual(999);
    expect(frame.lines.length).toBeLessThanOrEqual(7);
    expect(frame.lines.every((l) => l.length <= 42)).toBe(true);
  });
});
