import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

const OWNER = '111';
const WATCHED = '-100222';
const STRANGER = '-100999';

async function boot() {
  const sent: Array<{ chat_id: string; text: string }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('api.telegram.org') && url.includes('/getUpdates')) {
      const msg = (id: number, chatId: string, title: string, text: string) => ({
        update_id: id,
        message: { date: 1764000000 + id, text, chat: { id: Number(chatId), type: chatId.startsWith('-') ? 'supergroup' : 'private', title }, from: { first_name: title } },
      });
      return new Response(
        JSON.stringify({
          ok: true,
          result: [msg(1, OWNER, 'Owner', 'note to self'), msg(2, WATCHED, 'Team', 'Can you share the deck?'), msg(3, STRANGER, 'Random', 'buy crypto now')],
        }),
        { status: 200 },
      );
    }
    if (url.includes('api.telegram.org') && url.includes('/sendMessage')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { chat_id: string; text: string };
      sent.push({ chat_id: String(body.chat_id), text: body.text });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), { status: 200 });
    }
    if (url.includes('api.telegram.org')) {
      return new Response(JSON.stringify({ ok: true, result: { username: 'onq_test_bot', first_name: 'OnQ' } }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-tg-rw-'));
  const srv = await createOnQServer({ port: 0, dataDir, disableProactiveTimer: true, fetchImpl });
  closers.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
  const h = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
  await fetch(`${srv.url}/api/connectors/connect`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ provider: 'telegram', telegramBotToken: '123456:TEST', telegramChatId: OWNER }),
  });
  const post = (p: string, body: unknown) => fetch(`${srv.url}${p}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  return { srv, h, post, sent };
}

describe('Telegram read and write (chats you pick, AI draft, one-tap send)', () => {
  it('digest shows only the owner chat and chats you picked', async () => {
    const { srv, h, post } = await boot();
    const before = (await (await fetch(`${srv.url}/api/telegram/digest`, { headers: h })).json()) as { messages: Array<{ chatId: string }> };
    expect(before.messages.map((m) => m.chatId)).toEqual([OWNER].filter((c) => before.messages.some((m) => m.chatId === c)));

    const watch = (await (await post('/api/telegram/watch', { chatIds: [WATCHED, 'not-an-id'] })).json()) as { watchedChats: string[] };
    expect(watch.watchedChats).toEqual([WATCHED]);

    const after = (await (await fetch(`${srv.url}/api/telegram/digest`, { headers: h })).json()) as { messages: Array<{ chatId: string }> };
    const chats = after.messages.map((m) => m.chatId);
    expect(chats).toContain(WATCHED);
    expect(chats).not.toContain(STRANGER);
  });

  it('refuses to stage a reply into a chat you did not pick', async () => {
    const { post } = await boot();
    const res = await post('/api/telegram/stage-reply', { chatId: STRANGER, text: 'hi' });
    expect(res.status).toBe(403);
  });

  it('AI-drafts a reply, stages it Default-NO, and sends it into the picked chat only after commit', async () => {
    const { post, sent } = await boot();
    await post('/api/telegram/watch', { chatIds: [WATCHED] });

    const draftRes = await post('/api/telegram/draft-reply', { chatId: WATCHED, messageText: 'Can you share the deck?', fromName: 'Team' });
    expect(draftRes.status).toBe(200);
    const draft = (await draftRes.json()) as {
      draft: string;
      providerLabel: string;
      preview: { previewToken: string; idempotencyKey: string; defaultSelection: string; operations: Array<{ op: string; targetLabel: string }> };
    };
    expect(draft.draft.length).toBeGreaterThan(5);
    expect(draft.preview.defaultSelection).toBe('NO');
    expect(draft.preview.operations[0]).toMatchObject({ op: 'SEND_TELEGRAM', targetLabel: WATCHED });
    expect(sent).toEqual([]); // nothing sent before the yes

    const commit = await post('/api/actions/commit', { previewToken: draft.preview.previewToken, idempotencyKey: draft.preview.idempotencyKey });
    expect(commit.status).toBe(200);
    expect(sent).toEqual([{ chat_id: WATCHED, text: draft.draft }]);
  });
});
