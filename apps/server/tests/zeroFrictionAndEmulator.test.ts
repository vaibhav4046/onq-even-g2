import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildGoogleAuthUrl } from '../src/providers/googleProvider.js';
import { discoverFirstNotionDatabase } from '../src/providers/notionProvider.js';
import { TelegramWorkspaceClient } from '../src/providers/telegramProvider.js';
import { createOnQServer } from '../src/server.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

async function startServer(extra: Parameters<typeof createOnQServer>[0] = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-zero-friction-'));
  const srv = await createOnQServer({
    dataDir,
    port: 0,
    disableProactiveTimer: true,
    allowTestFaultControls: true,
    ...extra,
  });
  cleanups.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return srv;
}

describe('Zero-Warning OAuth, Auto-Discovery Connectors, 4-Card G2 Corridor & Emulator Proxy', () => {
  it('defaults Google OAuth to zero-warning identity scopes and supports workspace scope upgrade', async () => {
    const defaultUrl = new URL(
      buildGoogleAuthUrl({
        clientId: 'cid-123',
        redirectUri: 'http://127.0.0.1:8787/api/auth/google/callback',
        state: 'st-1',
      }),
    );
    expect(defaultUrl.searchParams.get('scope')).toBe('openid email profile');

    const wsUrl = new URL(
      buildGoogleAuthUrl({
        clientId: 'cid-123',
        redirectUri: 'http://127.0.0.1:8787/api/auth/google/callback',
        state: 'st-2',
        scopeMode: 'workspace',
      }),
    );
    expect(wsUrl.searchParams.get('scope')).toContain('calendar.events');
    expect(wsUrl.searchParams.get('scope')).toContain('gmail.modify');
    expect(wsUrl.searchParams.get('include_granted_scopes')).toBe('true');

    const srv = await startServer();
    const sRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
    const { sessionToken } = (await sRes.json()) as { sessionToken: string };
    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'google_oauth',
        googleClientId: 'cid-live-1',
        googleClientSecret: 'sec-live-1',
      }),
    });

    const startDef = await fetch(`${srv.url}/api/auth/google/start?format=json`);
    const defJson = (await startDef.json()) as { scopeMode: string; authUrl: string };
    expect(defJson.scopeMode).toBe('identity');
    expect(new URL(defJson.authUrl).searchParams.get('scope')).toBe('openid email profile');

    const startWs = await fetch(`${srv.url}/api/auth/google/start?scope=workspace&format=json`);
    const wsJson = (await startWs.json()) as { scopeMode: string; authUrl: string };
    expect(wsJson.scopeMode).toBe('workspace');
    expect(new URL(wsJson.authUrl).searchParams.get('scope')).toContain('gmail.modify');
  });

  it('auto-discovers Notion Database ID and Telegram Chat ID with zero manual IDs', async () => {
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('api.notion.com/v1/search')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'ds-111',
                object: 'data_source',
                parent: { type: 'database_id', database_id: 'db-auto-999' },
                title: [{ plain_text: 'Tasks' }],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (u.includes('api.notion.com/v1/databases/db-auto-999')) {
        return new Response(
          JSON.stringify({
            properties: {
              Name: { id: 'title', type: 'title' },
              Done: { id: 'chk', type: 'checkbox' },
            },
          }),
          { status: 200 },
        );
      }
      if (u.includes('api.telegram.org') && u.includes('/getUpdates')) {
        return new Response(
          JSON.stringify({
            ok: true,
            result: [
              {
                update_id: 901,
                message: {
                  date: 1732530000,
                  text: '/start',
                  chat: { id: 555777, first_name: 'Vaibhav' },
                  from: { first_name: 'Vaibhav' },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const discovered = await discoverFirstNotionDatabase('ntn_test_token', mockFetch);
    expect(discovered).toEqual({ databaseId: 'db-auto-999', title: 'Tasks' });

    const tg = new TelegramWorkspaceClient('123:abc', undefined, mockFetch);
    const chat = await tg.discoverLatestChat();
    expect(chat?.chatId).toBe('555777');

    const srv = await startServer({ fetchImpl: mockFetch });
    const sRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
    const { sessionToken } = (await sRes.json()) as { sessionToken: string };
    const hdrs = {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    };

    const notionConn = await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ provider: 'notion', notionToken: 'ntn_test_token' }),
    });
    expect(notionConn.status).toBe(200);
    const notionJson = (await notionConn.json()) as { status: { connectors: { notion: { connected: boolean } } } };
    expect(notionJson.status.connectors.notion.connected).toBe(true);

    const tgConn = await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ provider: 'telegram', telegramBotToken: '123:abc' }),
    });
    expect(tgConn.status).toBe(200);
    const tgJson = (await tgConn.json()) as { status: { connectors: { telegram: { detail: string } } } };
    expect(tgJson.status.connectors.telegram.detail).toContain('5777');
  });

  it('returns all 4 G2 corridor cards and guards /api/emulator endpoints safely', async () => {
    const srv = await startServer();
    const sRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
    const { sessionToken } = (await sRes.json()) as { sessionToken: string };

    const corRes = await fetch(`${srv.url}/api/corridor`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(corRes.status).toBe(200);
    const corJson = (await corRes.json()) as {
      cards: Array<{ id: string; quickActions: Array<{ commandText: string }> }>;
    };
    expect(corJson.cards.length).toBeGreaterThanOrEqual(4);
    expect(corJson.cards.some((c) => c.id === 'card-telegram-bridge')).toBe(true);
    expect(corJson.cards.some((c) => c.id === 'card-computer-proactive')).toBe(true);
    expect(corJson.cards[0].quickActions.some((qa) => qa.commandText === '__START_LIVE_SCRIBE__')).toBe(true);

    const emuStatus = await fetch(`${srv.url}/api/emulator/status`);
    expect(emuStatus.status).toBe(200);

    const unauthInput = await fetch(`${srv.url}/api/emulator/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'down' }),
    });
    expect(unauthInput.status).toBe(401);

    const badInput = await fetch(`${srv.url}/api/emulator/input`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'rm -rf' }),
    });
    expect(badInput.status).toBe(400);
  });
});
