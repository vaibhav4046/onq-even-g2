import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';

describe('Dual-Track Telegram Bot Integration (Track 01 + Best Telegram Prize)', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function mkDir() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-tg-test-'));
    dirs.push(d);
    return d;
  }

  it('connects Telegram bot token securely in 0600 vault, probes /getMe live, fetches digest, and stages Default-NO reply', async () => {
    const sentPayloads: Array<{ chat_id?: string; text?: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const u = String(input);
      if (u.includes('/getMe')) {
        return new Response(
          JSON.stringify({ ok: true, result: { username: 'onq_g2_bot', first_name: 'OnQ G2' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (u.includes('/getUpdates')) {
        return new Response(
          JSON.stringify({
            ok: true,
            result: [
              {
                update_id: 9901,
                message: {
                  date: 1764000000,
                  text: 'Need Q4 deck + .ehpk before Demo Day',
                  chat: { id: '-100777888', title: 'Even G2 Builders' },
                  from: { first_name: 'Investor' },
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (u.includes('/sendMessage')) {
        sentPayloads.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    };

    const srv = await createOnQServer({
      dataDir: mkDir(),
      fetchImpl: fetchMock,
      disableProactiveTimer: true,
    });

    try {
      const sessRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
      const { sessionToken } = (await sessRes.json()) as { sessionToken: string };
      const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

      const connRes = await fetch(`${srv.url}/api/connectors/connect`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          provider: 'telegram',
          telegramBotToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
          telegramChatId: '-100777888',
        }),
      });
      expect(connRes.status).toBe(200);
      const connJson = (await connRes.json()) as {
        ok: boolean;
        status: { connectors: { telegram: { connected: boolean; mode: string } } };
      };
      expect(connJson.ok).toBe(true);
      expect(connJson.status.connectors.telegram.connected).toBe(true);
      expect(connJson.status.connectors.telegram.mode).toBe('LIVE');
      expect(JSON.stringify(connJson)).not.toContain('ABC-DEF1234ghIkl');

      const testRes = await fetch(`${srv.url}/api/connectors/telegram/test`, {
        method: 'POST',
        headers: auth,
      });
      const testJson = (await testRes.json()) as { ok: boolean; mode: string; detail: string };
      expect(testJson.ok).toBe(true);
      expect(testJson.mode).toBe('LIVE');
      expect(testJson.detail).toContain('@onq_g2_bot');

      const digRes = await fetch(`${srv.url}/api/telegram/digest`, { headers: auth });
      const digJson = (await digRes.json()) as {
        mode: string;
        messages: Array<{ chatTitle: string; text: string }>;
      };
      expect(digJson.mode).toBe('LIVE');
      expect(digJson.messages[0].chatTitle).toBe('Even G2 Builders');

      // Stage under Default-NO: staging alone sends ZERO messages!
      const stageRes = await fetch(`${srv.url}/api/telegram/stage-reply`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ text: 'Uploading OnQ .ehpk now.' }),
      });
      expect(stageRes.status).toBe(200);
      const stageJson = (await stageRes.json()) as {
        preview: { defaultSelection: string; summaryLines: string[] };
      };
      expect(stageJson.preview.defaultSelection).toBe('NO');
      expect(sentPayloads.length).toBe(0);

      // Automate + Commit: verify exact (chat_id, text) argument order on Bot API!
      const autoRes = await fetch(`${srv.url}/api/telegram/automate`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ action: 'voice_reply', text: 'Build is live on Even G2!' }),
      });
      expect(autoRes.status).toBe(200);
      const autoJson = (await autoRes.json()) as {
        preview: { previewToken: string; idempotencyKey: string };
      };
      expect(sentPayloads.length).toBe(0);

      const commitRes = await fetch(`${srv.url}/api/actions/commit`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          previewToken: autoJson.preview.previewToken,
          idempotencyKey: autoJson.preview.idempotencyKey,
        }),
      });
      expect(commitRes.status).toBe(200);
      expect(sentPayloads.length).toBe(1);
      expect(sentPayloads[0]).toEqual({
        chat_id: '-100777888',
        text: 'Build is live on Even G2!',
        disable_notification: false,
      });
    } finally {
      await srv.close();
    }
  });
});
