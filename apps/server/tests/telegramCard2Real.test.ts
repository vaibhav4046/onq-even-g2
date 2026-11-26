import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';

const OWNER = '111';
const STRANGER = '-100999';
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

interface Card {
  id: string;
  title: string;
  contextLine1: string;
  provenanceLabel: string;
  sourceMode: string;
  timeMeta: string;
}

async function boot(opts: { connectTelegram: boolean }) {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    // If the corridor ever asked Telegram again while the poller owns getUpdates, this would be a visible 409.
    if (url.includes('/getUpdates')) return new Response('{}', { status: 409 });
    if (url.includes('/sendMessage')) return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    if (url.includes('api.telegram.org')) return new Response(JSON.stringify({ ok: true, result: { username: 'onq_test_bot' } }), { status: 200 });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-tg-card2-'));
  const srv = await createOnQServer({ port: 0, dataDir, disableProactiveTimer: true, fetchImpl });
  closers.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
  const h = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
  if (opts.connectTelegram) {
    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ provider: 'telegram', telegramBotToken: '123456:TEST', telegramChatId: OWNER }),
    });
  }
  const feed = (updateId: number, chatId: string, fromName: string, text: string) =>
    fetch(`${srv.url}/api/os/telegram/webhook-test`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        update: {
          updateId,
          message: { updateId, chatId, chatTitle: fromName, fromName, text, atIso: '2026-11-24T13:50:00.000Z', mode: 'LIVE', chatType: chatId.startsWith('-') ? 'supergroup' : 'private' },
        },
      }),
    });
  const corridor = async (): Promise<Card[]> => ((await (await fetch(`${srv.url}/api/corridor`, { headers: h })).json()) as { cards: Card[] }).cards;
  return { feed, corridor };
}

describe('corridor Card 2 (Telegram) uses real owner-chat messages', () => {
  it('shows the newest message the poller saw from the owner chat, never the sample text', async () => {
    const { feed, corridor } = await boot({ connectTelegram: true });
    expect((await feed(501, OWNER, 'Real Owner Chat', 'Landing page copy is approved, ship it')).status).toBe(200);
    expect((await feed(502, STRANGER, 'Random Group', 'buy crypto now')).status).toBe(200); // not owner, not watched: ignored
    expect((await feed(503, OWNER, 'Real Owner Chat', 'Actually hold the launch until 15:00')).status).toBe(200);

    const cards = await corridor();
    expect(cards[2].id).toBe('card-telegram-bridge');
    expect(cards[2]).toMatchObject({
      title: 'TG | Real Owner Chat',
      contextLine1: 'Actually hold the launch until 15:00',
      provenanceLabel: 'TELEGRAM LIVE',
      sourceMode: 'LIVE',
      timeMeta: 'TG LIVE',
    });
    const text = JSON.stringify(cards[2]);
    expect(text).not.toContain('crypto');
    expect(text).not.toContain('Q4 metrics');
    expect(text).not.toContain('Investor contact');
  });

  it('connected but quiet: honest empty state instead of sample text', async () => {
    const { corridor } = await boot({ connectTelegram: true });
    const card = (await corridor())[2];
    expect(card.title).toBe('TG | No new messages');
    expect(card.timeMeta).toBe('TG LIVE');
    expect(JSON.stringify(card)).not.toContain('Q4 metrics');
  });

  it('not connected: the card is clearly labelled SAMPLE and shows the sample digest', async () => {
    const { corridor } = await boot({ connectTelegram: false });
    const card = (await corridor())[2];
    expect(card.provenanceLabel).toBe('SAMPLE');
    expect(card.timeMeta).toBe('TELEGRAM');
    expect(card.contextLine1).toContain('Q4 metrics');
  });
});
