import { describe, expect, it, vi } from 'vitest';
import { TelegramCommandCentre } from '../src/harness/telegramCommandCentre.js';
import type { UnifiedOsHarness } from '../src/harness/unifiedOsHarness.js';

type Sent = { method: string; body: Record<string, unknown> };

function makeOwnerCentre(sent: Sent[], handled: string[]) {
  const osHarness = {
    getLastTelegramUpdateId: () => undefined,
    setLastTelegramUpdateId: () => undefined,
    handleCommand: async (p: { text: string }) => {
      handled.push(p.text);
      return { reply: 'OS reply', approval: undefined };
    },
    decideApproval: async () => ({ ok: true, item: { executionDetail: 'Done' } }),
  } as unknown as UnifiedOsHarness;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = url.split('/').pop() ?? '';
    sent.push({ method, body: init?.body ? JSON.parse(String(init.body)) : {} });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 });
  }) as typeof fetch;
  return new TelegramCommandCentre({
    osHarness,
    getCredentials: () => ({ botToken: '123:test-token', chatId: '111' }),
    fetchImpl,
  });
}

const msg = (chatId: string, text: string) => ({
  updateId: 1,
  message: { updateId: 1, chatId, chatTitle: 'x', fromName: 'x', text, atIso: '2026-11-25T00:00:00Z', mode: 'LIVE' as const },
});

describe('Telegram owner gate, pairing and approval card', () => {
  it('refuses a stranger DM without running any command or leaking data', async () => {
    const sent: Sent[] = [];
    const handled: string[] = [];
    const centre = makeOwnerCentre(sent, handled);
    const out = await centre.processUpdate(msg('999', '/calendar'));
    expect(out.handled).toBe(false);
    expect(handled).toEqual([]);
    expect(sent.at(-1)?.body.text).toBe('This bot is private.');
  });

  it('answers /myid from any chat so pairing is one paste', async () => {
    const sent: Sent[] = [];
    const centre = makeOwnerCentre(sent, []);
    await centre.processUpdate(msg('999', '/myid'));
    expect(String(sent.at(-1)?.body.text)).toContain('999');
  });

  it('still runs commands for the paired owner chat', async () => {
    const sent: Sent[] = [];
    const handled: string[] = [];
    const centre = makeOwnerCentre(sent, handled);
    await centre.processUpdate(msg('111', '/status'));
    expect(handled).toEqual(['/status']);
  });

  it('edits the approval card in place after a tap (buttons removed)', async () => {
    const sent: Sent[] = [];
    const centre = makeOwnerCentre(sent, []);
    await centre.processUpdate({
      updateId: 2,
      callbackQuery: { id: 'cb1', chatId: '111', fromName: 'o', data: 'approve:apr_1', messageId: 42 },
    });
    const edit = sent.find((s) => s.method === 'editMessageText');
    expect(edit?.body.message_id).toBe(42);
    expect(String(edit?.body.text)).toMatch(/^APPROVED/);
    expect(edit?.body.reply_markup).toBeUndefined();
  });
});

function makeCentre(fetchImpl: typeof fetch) {
  const osHarness = { getLastTelegramUpdateId: () => undefined } as unknown as UnifiedOsHarness;
  return new TelegramCommandCentre({
    osHarness,
    getCredentials: () => ({ botToken: '123:test-token', chatId: '1' }),
    fetchImpl,
  });
}

describe('Telegram getUpdates HTTP 409 (webhook conflict)', () => {
  it('reports an actionable webhook message and backs off instead of re-polling every tick', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":false}', { status: 409 })) as unknown as typeof fetch;
    const centre = makeCentre(fetchImpl);

    expect(await centre.pollOnce()).toBe(0);
    expect(centre.getStatus().lastError).toMatch(/Webhook active on Telegram bot/);
    expect(centre.getStatus().lastError).toMatch(/409/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Second tick lands inside the backoff window: no new network call.
    expect(await centre.pollOnce()).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain error path for other HTTP failures (no long backoff)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const centre = makeCentre(fetchImpl);

    await centre.pollOnce();
    expect(centre.getStatus().lastError).toBe('Telegram getUpdates failed: HTTP 500');
    await centre.pollOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
