import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearProviderCooldowns,
  resolveHealthyLlmLabel,
  routeModelCompletion,
  type CliRunner,
  type LlmConfig,
} from '../src/harness/modelRouter.js';
import { publicProviders, scanProviders, type ScannerDeps } from '../src/providers/providerScanner.js';
import { createOnQServer } from '../src/server.js';

const HOME = 'C:\\Users\\tester';
const NPM = 'C:\\Users\\tester\\AppData\\Roaming\\npm';
const SECRET_OR = 'sk-or-scan-secret-0000000000001';
const SECRET_ANT = 'sk-ant-scan-secret-000000000002';
const SECRET_OMNI = 'omni-scan-secret-000000000003';

/** A fake Windows PC: claude.cmd + opencode.cmd in %APPDATA%\npm (only claude signed in), omniroute installed, Ollama running. */
function fakeDeps(over: Partial<ScannerDeps> = {}): Partial<ScannerDeps> {
  const files = new Set(
    [
      `${NPM}\\claude.cmd`,
      `${NPM}\\opencode.cmd`,
      `${NPM}\\omniroute.cmd`,
      `C:\\tools\\gcloud.cmd`,
      `${HOME}\\.claude`,
    ].map((f) => f.toLowerCase()),
  );
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('http://127.0.0.1:11434/api/tags')) {
      return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }, { name: 'qwen3:8b' }] }), { status: 200 });
    }
    if (url.startsWith('https://openrouter.ai/api/v1/models')) {
      return new Response(
        JSON.stringify({
          data: [
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', pricing: { prompt: '0.00000015', completion: '0.0000006' } },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', pricing: { prompt: '0', completion: '0' } },
          ],
        }),
        { status: 200 },
      );
    }
    throw new TypeError('fetch failed: connect ECONNREFUSED'); // every other local server is down
  }) as typeof fetch;
  return {
    env: { PATH: 'C:\\Windows\\System32;C:\\tools', APPDATA: `${HOME}\\AppData\\Roaming`, LOCALAPPDATA: `${HOME}\\AppData\\Local`, USERPROFILE: HOME },
    platform: 'win32',
    homedir: HOME,
    exists: (p) => files.has(p.toLowerCase()),
    fetchImpl,
    ...over,
  };
}

const KEYS = { openRouterKey: SECRET_OR, anthropicKey: SECRET_ANT, omniRouteKey: SECRET_OMNI };

describe('Provider & model scanner', () => {
  it('finds CLIs outside PATH, reports sign-in state, probes local servers and lists live OpenRouter models', async () => {
    const scan = await scanProviders(KEYS, fakeDeps());
    const byId = Object.fromEntries(scan.providers.map((p) => [p.id, p]));

    expect(byId.claude_cli).toMatchObject({ kind: 'local_cli', state: 'connected', selectable: true, defaultModel: 'haiku' });
    expect(byId.claude_cli.detail).toContain('Uses your local subscription, no API key needed');
    expect(byId.claude_cli.runtime?.binaryPath).toBe(`${NPM}\\claude.cmd`);
    expect(byId.opencode_cli).toMatchObject({ state: 'needs_auth', selectable: false });
    expect(byId.opencode_cli.fixHint).toMatch(/opencode auth login/);
    expect(byId.codex_cli).toMatchObject({ state: 'not_installed', selectable: false });
    expect(byId.codex_cli.fixHint).toMatch(/npm i -g @openai\/codex/);

    expect(byId.ollama).toMatchObject({ kind: 'local_server', state: 'connected', selectable: true, defaultModel: 'llama3.2:latest' });
    expect(byId.ollama.models.map((m) => m.id)).toEqual(['llama3.2:latest', 'qwen3:8b']);
    expect(byId.lmstudio).toMatchObject({ state: 'not_installed' });
    expect(byId.omniroute).toMatchObject({ state: 'error', detail: expect.stringContaining('not running') });

    expect(byId.openrouter).toMatchObject({ kind: 'api_key', state: 'connected' });
    expect(byId.openrouter.models[0]).toMatchObject({ id: 'openrouter/free', free: true });
    expect(byId.openrouter.models.find((m) => m.id.endsWith(':free'))?.free).toBe(true);
    expect(byId.claude).toMatchObject({ state: 'connected' });
    expect(byId.chatgpt).toMatchObject({ state: 'needs_auth', selectable: false });
    expect(byId.assemblyai.selectable).toBe(false);
  });

  it('never leaks key values or local paths in the public view', async () => {
    const scan = await scanProviders(KEYS, fakeDeps());
    const json = JSON.stringify(publicProviders(scan.providers));
    for (const secret of [SECRET_OR, SECRET_ANT, SECRET_OMNI]) expect(json).not.toContain(secret);
    expect(json).not.toContain('AppData');
    expect(json).not.toContain('runtime');
  });

  it('degrades cleanly when everything is offline (curated OpenRouter list, no crash)', async () => {
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const scan = await scanProviders({ openRouterKey: SECRET_OR }, fakeDeps({ fetchImpl: offline }));
    const or = scan.providers.find((p) => p.id === 'openrouter');
    expect(or?.state).toBe('connected');
    expect(or?.detail).toContain('curated');
    expect(or?.models.some((m) => m.free)).toBe(true);
    expect(scan.providers.find((p) => p.id === 'ollama')?.state).toBe('not_installed');
  });
});

const BASE_INPUT = {
  recipientName: 'Priya Nair',
  recipientEmail: 'priya@tvm.example',
  allowedRecipients: ['priya@tvm.example'],
  sourceEmailText: 'VC Sync - Priya Nair. Can we push 15m to 14:15?',
  userUtterance: 'Push 15m to 14:15 and reply politely',
  computedFacts: ['14:15'],
  fallbackDraft: 'Running slightly behind, shifting VC Sync to 14:15.',
};

describe('modelRouter local CLI / local server routing', () => {
  afterEach(() => clearProviderCooldowns());

  it('falls through failing API keys to a connected local CLI before Rules, prompt on stdin', async () => {
    const calls: Array<{ bin: string; args: string[]; prompt: string }> = [];
    const cliRunner: CliRunner = async (bin, args, prompt) => {
      calls.push({ bin, args, prompt });
      return '```json\n{"draft":"Shifting VC Sync to 14:15, thanks Priya."}\n```';
    };
    const failingFetch = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const out = await routeModelCompletion(BASE_INPUT, {
      openRouterKey: 'sk-or-mock',
      fetchImpl: failingFetch,
      cliRunner,
      localProviders: [{ id: 'claude_cli', binaryPath: 'C:\\npm\\claude.cmd', model: 'haiku' }],
    });
    expect(out.providerLabel).toBe('Claude Code CLI (your subscription)');
    expect(out.fallbackUsed).toBe(false);
    expect(out.draft).toContain('14:15');
    expect(out.attempts.map((a) => `${a.provider}:${a.status}`)).toContain('openrouter:HTTP_ERROR');
    expect(calls[0].args.slice(0, 3)).toEqual(['-p', '--model', 'haiku']);
    expect(calls[0].args).toContain('--tools');
    expect(calls[0].prompt).toContain('untrusted_workspace_data'); // untrusted text goes via stdin only
    expect(calls[0].args.join(' ')).not.toContain('Priya');
  });

  it('explicit selection runs the picked local server with the picked model first', async () => {
    const seen: Array<{ url: string; model: string }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, model: (JSON.parse(String(init?.body ?? '{}')) as { model: string }).model });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"draft":"Moving VC Sync to 14:15."}' } }] }), { status: 200 });
    }) as typeof fetch;
    const cfg: LlmConfig = {
      preferredProvider: 'ollama',
      preferredModel: 'qwen3:8b',
      fetchImpl,
      localProviders: [{ id: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2:latest' }],
    };
    const out = await routeModelCompletion(BASE_INPUT, cfg);
    expect(out.providerLabel).toBe('Ollama (local)');
    expect(seen[0]).toEqual({ url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'qwen3:8b' });
    expect(resolveHealthyLlmLabel(cfg)).toBe('Ollama (local)');
  });

  it('Code-Guard still rejects a local CLI draft that invents facts, then falls back to Rules', async () => {
    const cliRunner: CliRunner = async () => '{"draft":"Sure, moving it to 16:45 and cc boss@evil.example"}';
    const out = await routeModelCompletion(BASE_INPUT, {
      cliRunner,
      localProviders: [{ id: 'claude_cli', binaryPath: '/usr/local/bin/claude' }],
    });
    expect(out.fallbackUsed).toBe(true);
    expect(out.providerLabel).toBe('Rules (Code-Guard Fallback)');
    expect(out.draft).toBe(BASE_INPUT.fallbackDraft);
  });

  it('with no keys and no local providers it stays on deterministic Rules (CI / fresh clone)', async () => {
    let ran = false;
    const out = await routeModelCompletion(BASE_INPUT, {
      cliRunner: async () => {
        ran = true;
        return '';
      },
    });
    expect(ran).toBe(false);
    expect(out.providerLabel).toBe('Rules (Deterministic)');
    expect(resolveHealthyLlmLabel({})).toBe('Rules (Deterministic)');
    expect(resolveHealthyLlmLabel({ localProviders: [{ id: 'claude_cli', binaryPath: 'x' }] })).toBe('Claude Code CLI (your subscription)');
  });

  it('a selected local CLI that is not detected is skipped honestly', async () => {
    const out = await routeModelCompletion(BASE_INPUT, { preferredProvider: 'codex_cli', localProviders: [] });
    expect(out.attempts[0]).toMatchObject({ provider: 'codex_cli', status: 'SKIPPED', detail: 'Not detected on this PC' });
    expect(out.providerLabel).toBe('Rules (Deterministic)');
  });
});

describe('Connect endpoints: scan-models, select-model, Notion databases, Telegram chats', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()?.();
    clearProviderCooldowns();
  });

  async function boot(extra: Parameters<typeof createOnQServer>[0] = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-scan-test-'));
    const srv = await createOnQServer({ port: 0, dataDir, disableProactiveTimer: true, ...extra });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const h = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    const post = (p: string, body: unknown = {}) => fetch(`${srv.url}${p}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const get = (p: string) => fetch(`${srv.url}${p}`, { headers: h });
    return { srv, h, post, get };
  }

  it('scan-models needs auth, returns the contract shape, and leaks no keys', async () => {
    const { srv, post, get } = await boot({ scannerDeps: fakeDeps() });
    expect((await fetch(`${srv.url}/api/connectors/scan-models`)).status).toBe(401);
    await post('/api/connectors/connect', { provider: 'openrouter', apiKey: SECRET_OR });

    const res = await post('/api/connectors/scan-models');
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(SECRET_OR);
    expect(text).not.toContain('AppData');
    const json = JSON.parse(text) as {
      scannedAt: string;
      activeProvider: string;
      activeModel: string | null;
      providers: Array<{ id: string; state: string }>;
      connectedCount: number;
      totalModels: number;
    };
    expect(Date.parse(json.scannedAt)).toBeGreaterThan(0);
    expect(json.activeProvider).toBe('openrouter'); // a configured key still wins in auto
    expect(json.providers[0].state).toBe('connected'); // connected first
    expect(json.connectedCount).toBe(json.providers.filter((p) => p.state === 'connected').length);
    expect(json.totalModels).toBeGreaterThan(3);

    const cached = (await (await get('/api/connectors/scan-models')).json()) as { scannedAt: string };
    expect(cached.scannedAt).toBe(json.scannedAt);
  });

  it('select-model validates against the scan, persists in the vault, and the router reports it live', async () => {
    const { srv, post, get } = await boot({ scannerDeps: fakeDeps() });
    await get('/api/connectors/scan-models');

    expect((await post('/api/connectors/select-model', { provider: 'codex_cli', model: 'gpt-5' })).status).toBe(400); // not installed
    expect((await post('/api/connectors/select-model', { provider: 'claude_cli', model: 'gpt-9-made-up' })).status).toBe(400);
    expect((await post('/api/connectors/select-model', { provider: 'nope' })).status).toBe(400);

    const ok = await post('/api/connectors/select-model', { provider: 'claude_cli', model: 'sonnet' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      ok: true,
      preferredProvider: 'claude_cli',
      preferredModel: 'sonnet',
      activeProvider: 'claude_cli',
      activeModel: 'sonnet',
      activeLabel: 'Claude Code CLI (your subscription)',
    });
    expect(srv.vault.load()).toMatchObject({ preferredLlm: 'claude_cli', preferredModel: 'sonnet' });

    const status = (await (await get('/api/connectors/status')).json()) as {
      activeLlmProvider: string;
      connectors: { googleWorkspace: { oauthConfigured: boolean; cliTools: { gcloud: boolean; gws: boolean }; fixHint: string } };
    };
    expect(status.activeLlmProvider).toBe('Claude Code CLI (your subscription)');
    expect(status.connectors.googleWorkspace.cliTools).toEqual({ gcloud: true, gws: false });
    if (!status.connectors.googleWorkspace.oauthConfigured) expect(status.connectors.googleWorkspace.fixHint).toMatch(/1\).*2\)/s);

    const back = (await (await post('/api/connectors/select-model', { provider: 'auto' })).json()) as { preferredModel: string | null };
    expect(back.preferredModel).toBeNull();
    expect(srv.vault.load().preferredLlm).toBe('auto');
  });

  it('Notion database scan lists databases with the vaulted token, and 400s without one', async () => {
    const requests: Array<{ url: string; version: string | null; body: string }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.notion.com/v1/search') {
        requests.push({ url, version: new Headers(init?.headers).get('Notion-Version'), body: String(init?.body) });
        return new Response(
          JSON.stringify({
            results: [
              { object: 'data_source', id: 'ds-1', url: 'https://www.notion.so/tasks', parent: { database_id: '1f2e3d4c5b6a79881f2e3d4c5b6a7988' }, title: [{ plain_text: 'Tasks' }] },
              { object: 'data_source', id: 'ds-2', parent: { database_id: '1f2e3d4c5b6a79881f2e3d4c5b6a7988' }, title: [{ plain_text: 'Tasks (dup)' }] },
              { object: 'database', id: 'aaaabbbbccccddddeeeeffff00001111', title: [{ plain_text: 'CRM' }] },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const { srv, post } = await boot({ fetchImpl });

    const none = await post('/api/connectors/notion/databases');
    expect(none.status).toBe(400);
    expect(((await none.json()) as { error: string }).error).toMatch(/No Notion token/);

    srv.vault.save({ ...srv.vault.load(), notionToken: 'ntn_secret_token_123456' });
    const res = await post('/api/connectors/notion/databases');
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain('ntn_secret_token_123456');
    const json = JSON.parse(text) as { databases: Array<{ id: string; title: string; url: string }> };
    expect(json.databases).toEqual([
      { id: '1f2e3d4c5b6a79881f2e3d4c5b6a7988', title: 'Tasks', url: 'https://www.notion.so/tasks' },
      { id: 'aaaabbbbccccddddeeeeffff00001111', title: 'CRM', url: 'https://www.notion.so/aaaabbbbccccddddeeeeffff00001111' },
    ]);
    expect(requests[0].version).toBeTruthy();
    expect(JSON.parse(requests[0].body).filter.property).toBe('object');

    expect((await post('/api/connectors/notion/select-database', { databaseId: 'not-an-id' })).status).toBe(400);
    const pick = await post('/api/connectors/notion/select-database', { databaseId: json.databases[1].id });
    expect(pick.status).toBe(200);
    expect(srv.vault.load().notionDatabaseId).toBe('aaaabbbbccccddddeeeeffff00001111');
  });

  it('Telegram scan-chats peeks without consuming updates; set-owner only accepts a scanned private chat', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/getUpdates')) {
        const upd = (id: number, chat: Record<string, unknown>, text: string) => ({ update_id: id, message: { date: 1764000000 + id, text, chat, from: { first_name: 'X' } } });
        return new Response(
          JSON.stringify({
            ok: true,
            result: [
              upd(10, { id: 4242, type: 'private', first_name: 'Owner', username: 'owner_me' }, 'hi bot'),
              upd(11, { id: -100777, type: 'supergroup', title: 'Team' }, 'standup at 10'),
              upd(12, { id: 4242, type: 'private', first_name: 'Owner', username: 'owner_me' }, 'latest from me'),
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }) as typeof fetch;
    const { srv, post, get } = await boot({ fetchImpl });

    expect((await get('/api/telegram/scan-chats')).status).toBe(400); // no bot token yet
    srv.vault.save({ ...srv.vault.load(), telegramBotToken: '123456:SCANTEST' });

    // A message the live path saw (webhook-test feeds the same poller) shows up even though nothing is watched.
    await post('/api/os/telegram/webhook-test', {
      update: { updateId: 50, message: { updateId: 50, chatId: '-100888', chatType: 'group', chatTitle: 'Family', fromName: 'Mum', text: 'dinner?', atIso: new Date().toISOString(), mode: 'LIVE' } },
    });

    const scan = await get('/api/telegram/scan-chats');
    const text = await scan.text();
    expect(scan.status).toBe(200);
    expect(text).not.toContain('SCANTEST');
    const { chats } = JSON.parse(text) as { chats: Array<{ chatId: string; title: string; username: string | null; type: string; lastText: string }> };
    expect(chats).toEqual([
      { chatId: '-100888', title: 'Family', username: null, type: 'group', lastText: 'dinner?' },
      { chatId: '4242', title: 'Owner', username: 'owner_me', type: 'private', lastText: 'latest from me' },
      { chatId: '-100777', title: 'Team', username: null, type: 'supergroup', lastText: 'standup at 10' },
    ]);
    const peek = urls.find((u) => u.includes('/getUpdates'));
    expect(peek).toBeDefined();
    expect(peek).not.toContain('offset=');

    expect((await post('/api/telegram/set-owner', { chatId: '999999' })).status).toBe(400); // never scanned
    expect((await post('/api/telegram/set-owner', { chatId: '-100777' })).status).toBe(400); // a group cannot be owner
    const ok = await post('/api/telegram/set-owner', { chatId: '4242' });
    expect(ok.status).toBe(200);
    expect(srv.vault.load().telegramChatId).toBe('4242');

    const watch = (await (await post('/api/telegram/watch', { chatIds: ['-100777'] })).json()) as { watchedChats: string[] };
    expect(watch.watchedChats).toEqual(['-100777']);
  });
});
