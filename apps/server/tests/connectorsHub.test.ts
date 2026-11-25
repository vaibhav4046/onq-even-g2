import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';
import { probeLlmProvider } from '../src/llm.js';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const fn = closers.pop();
    if (fn) await fn();
  }
});

async function startCleanServer(extra: Parameters<typeof createOnQServer>[0] = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-conn-test-'));
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

describe('Connector Hub & Multi-Model Inference Harness', () => {
  it('1. GET /api/connectors/status requires Bearer auth and returns sanitized flags only', async () => {
    const srv = await startCleanServer();
    const unauth = await fetch(`${srv.url}/api/connectors/status`);
    expect(unauth.status).toBe(401);

    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/connectors/status`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { vaultEncrypted: boolean; connectors: Record<string, unknown> };
    expect(json.vaultEncrypted).toBe(true);
    expect(Object.keys(json.connectors)).toEqual([
      'googleWorkspace',
      'notion',
      'telegram',
      'claude',
      'openrouter',
      'grok',
      'omniroute',
      'chatgpt',
      'assemblyai',
    ]);
  });

  it('2. /api/connectors/connect encrypts Claude, OpenRouter, and ChatGPT keys without plaintext leaks', async () => {
    const srv = await startCleanServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const synthClaude = 'sk-ant-test-secret-000000000001';
    const synthOr = 'sk-or-test-secret-000000000002';
    const synthOai = 'sk-proj-test-secret-000000000003';

    const cRes = await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'claude', apiKey: synthClaude, accountName: 'Alex' }),
    });
    const cText = await cRes.text();
    expect(cRes.status).toBe(200);
    expect(cText).not.toContain(synthClaude);

    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: 'openrouter',
        apiKey: synthOr,
        model: 'google/gemini-2.0-flash-exp:free',
      }),
    });
    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'chatgpt', apiKey: synthOai }),
    });

    const vaultDisk = fs.readFileSync(srv.vault.getVaultPath(), 'utf8');
    expect(vaultDisk).not.toContain(synthClaude);
    expect(vaultDisk).not.toContain(synthOr);
    expect(vaultDisk).not.toContain(synthOai);

    const status = (await (
      await fetch(`${srv.url}/api/connectors/status`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
    ).json()) as {
      accountName: string;
      connectors: {
        claude: { connected: boolean };
        openrouter: { connected: boolean; detail: string };
        chatgpt: { connected: boolean };
      };
    };
    expect(status.accountName).toBe('Alex');
    expect(status.connectors.claude.connected).toBe(true);
    expect(status.connectors.openrouter.connected).toBe(true);
    expect(status.connectors.openrouter.detail).toContain('gemini-2.0-flash-exp:free');
    expect(status.connectors.chatgpt.connected).toBe(true);
  });

  it('3. probeLlmProvider routes explicitly to Claude, OpenRouter, and ChatGPT under Code-Guard', async () => {
    const fakeFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('anthropic')) {
        return new Response(JSON.stringify({ content: [{ text: '{"draft":"Shifting VC Sync to 14:15 via Claude."}' }] }), { status: 200 });
      }
      if (u.includes('openrouter')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"draft":"Shifting VC Sync to 14:15 via OpenRouter."}' } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"draft":"Shifting VC Sync to 14:15 via ChatGPT."}' } }] }), { status: 200 });
    };

    const claudeOut = await probeLlmProvider({
      anthropicKey: 'sk-ant-mock-1',
      openRouterKey: 'sk-or-mock-2',
      openAiKey: 'sk-mock-3',
      preferredProvider: 'claude',
      fetchImpl: fakeFetch,
    });
    expect(claudeOut.providerLabel).toBe('Claude');
    expect(claudeOut.factGuardPassed).toBe(true);

    const orOut = await probeLlmProvider({
      anthropicKey: 'sk-ant-mock-1',
      openRouterKey: 'sk-or-mock-2',
      openAiKey: 'sk-mock-3',
      preferredProvider: 'openrouter',
      fetchImpl: fakeFetch,
    });
    expect(orOut.providerLabel).toBe('OpenRouter');

    const gptOut = await probeLlmProvider({
      anthropicKey: 'sk-ant-mock-1',
      openRouterKey: 'sk-or-mock-2',
      openAiKey: 'sk-mock-3',
      preferredProvider: 'chatgpt',
      fetchImpl: fakeFetch,
    });
    expect(gptOut.providerLabel).toBe('ChatGPT');
  });

  it('4. POST /api/connectors/test-llm verifies live inference via Rules fallback cleanly when offline', async () => {
    const srv = await startCleanServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/connectors/test-llm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredProvider: 'rules' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; providerLabel: string; factGuardPassed: boolean };
    expect(json.ok).toBe(true);
    expect(json.providerLabel).toContain('Rules');
    expect(json.factGuardPassed).toBe(true);
  });

  it('5. POST /api/connectors/disconnect clears requested connector from encrypted vault', async () => {
    const srv = await startCleanServer();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'chatgpt', apiKey: 'sk-proj-disconnect-test-0001' }),
    });
    await fetch(`${srv.url}/api/connectors/disconnect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'chatgpt' }),
    });

    const status = (await (
      await fetch(`${srv.url}/api/connectors/status`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
    ).json()) as { connectors: { chatgpt: { connected: boolean } } };
    expect(status.connectors.chatgpt.connected).toBe(false);
  });

  it('6. POST /api/connectors/connect discovers Notion schema and upgrades session to LIVE', async () => {
    const mockFetch: typeof fetch = async (url) => {
      if (String(url).includes('/databases/')) {
        return new Response(
          JSON.stringify({
            id: 'db-live-1',
            properties: {
              Task: { id: 'title', name: 'Task', type: 'title' },
              Done: { id: 'chk', name: 'Done', type: 'checkbox' },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    };
    const srv = await startCleanServer({ fetchImpl: mockFetch });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'notion',
        notionToken: 'ntn_test_live_1234567890',
        notionDatabaseId: 'db-live-1',
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: { connectors: { notion: { connected: boolean; mode: string } } } };
    expect(json.status.connectors.notion.connected).toBe(true);
    expect(json.status.connectors.notion.mode).toBe('LIVE');
  });
});
