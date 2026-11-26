import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearProviderCooldowns,
  resolveActiveProvider,
  routeModelCompletion,
  type CliRunner,
} from '../src/harness/modelRouter.js';
import type { ScannerDeps } from '../src/providers/providerScanner.js';
import { createOnQServer } from '../src/server.js';

const HERMETIC_ENV = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'];
const savedEnv = new Map(HERMETIC_ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of HERMETIC_ENV) delete process.env[k];
});
afterAll(() => {
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const HOME = 'C:\\Users\\tester';
const NPM = 'C:\\Users\\tester\\AppData\\Roaming\\npm';

function fakeScanner(): Partial<ScannerDeps> {
  const files = new Set([`${NPM}\\claude.cmd`.toLowerCase(), `${HOME}\\.claude`.toLowerCase()]);
  return {
    env: { PATH: 'C:\\nowhere', APPDATA: `${HOME}\\AppData\\Roaming`, USERPROFILE: HOME },
    platform: 'win32',
    homedir: HOME,
    exists: (p) => files.has(p.toLowerCase()),
    fetchImpl: (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('http://127.0.0.1:11434/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }), { status: 200 });
      }
      if (url.startsWith('https://openrouter.ai/api/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'openrouter/free', name: 'OpenRouter Free', pricing: { prompt: '0', completion: '0' } }] }), { status: 200 });
      }
      throw new TypeError('fetch failed: ECONNREFUSED');
    }) as typeof fetch,
    probeCli: async () => ({ ok: true, ms: 420 }),
    cliProbeTimeoutMs: 50,
  };
}

const BASE_INPUT = {
  recipientName: 'Investor',
  recipientEmail: 'investor@vc.example',
  allowedRecipients: ['investor@vc.example'],
  sourceEmailText: 'Can we move today sync to 14:15?',
  userUtterance: 'Reply moving it to 14:15',
  computedFacts: ['Verified free slot 14:15-14:45'],
  fallbackDraft: 'Moving our sync to 14:15 today.',
};

describe('Dual inference mode (computer host vs optional API)', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()?.();
    clearProviderCooldowns();
  });

  it('modelRouter honors inferenceMode=computer and inferenceMode=api cleanly', async () => {
    let remoteHits = 0;
    let localHits = 0;
    const fetchImpl = (async () => {
      remoteHits += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"draft":"Moving sync to 14:15."}' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const cliRunner: CliRunner = async () => {
      localHits += 1;
      return '{"draft":"Moving sync to 14:15."}';
    };

    // Computer-hosted mode never hits remote API keys even when configured
    const pcOnly = await routeModelCompletion(BASE_INPUT, {
      inferenceMode: 'computer',
      openRouterKey: 'sk-or-test-0001',
      fetchImpl,
      cliRunner,
      localProviders: [{ id: 'claude_cli', binaryPath: 'claude', model: 'haiku' }],
    });
    expect(remoteHits).toBe(0);
    expect(localHits).toBe(1);
    expect(pcOnly.providerLabel).toBe('Claude Code CLI (your subscription)');

    // Computer-hosted mode with no local providers falls back deterministically to Rules (no API leak)
    const pcRules = await routeModelCompletion(BASE_INPUT, {
      inferenceMode: 'computer',
      openRouterKey: 'sk-or-test-0001',
      fetchImpl,
      localProviders: [],
    });
    expect(remoteHits).toBe(0);
    expect(pcRules.providerLabel).toBe('Rules (Deterministic)');

    // API mode never runs local providers
    const apiOnly = await routeModelCompletion(BASE_INPUT, {
      inferenceMode: 'api',
      openRouterKey: 'sk-or-test-0001',
      fetchImpl,
      cliRunner,
      localProviders: [{ id: 'claude_cli', binaryPath: 'claude', model: 'haiku' }],
    });
    expect(remoteHits).toBe(1);
    expect(localHits).toBe(1);
    expect(apiOnly.providerLabel).toBe('OpenRouter');
    expect(resolveActiveProvider({ inferenceMode: 'api', localProviders: [{ id: 'claude_cli', binaryPath: 'claude' }] }).id).toBe('rules');
  });

  it('owner select-model + paired glasses /api/os/command mirror and switch computer apps, inference route, and corridor cards', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-inf-'));
    const srv = await createOnQServer({ port: 0, dataDir: dir, disableProactiveTimer: true, scannerDeps: fakeScanner() });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const owner = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ provider: 'openrouter', apiKey: 'sk-or-live-0001' }),
    });
    const scan1 = (await (await fetch(`${srv.url}/api/connectors/scan-models`, { method: 'POST', headers: owner })).json()) as {
      inferenceMode: string;
      activeProvider: string;
    };
    expect(scan1.inferenceMode).toBe('auto');

    // Pair glasses device
    const pairCode = (await (await fetch(`${srv.url}/api/pair/code`, { method: 'POST' })).json()) as { code: string };
    const claimed = (await (await fetch(`${srv.url}/api/pair/claim`, {
      method: 'POST',
      body: JSON.stringify({ code: pairCode.code, label: 'Even G2' }),
    })).json()) as { deviceToken: string };
    const dev = { 'x-onq-device': claimed.deviceToken, 'Content-Type': 'application/json' };

    // Paired device cannot hit owner-only /api/connectors/select-model directly
    expect((await fetch(`${srv.url}/api/connectors/select-model`, { method: 'POST', headers: dev, body: JSON.stringify({ inferenceMode: 'computer' }) })).status).toBe(403);

    // Paired glasses inspect mirrored computer AI apps via /apps
    const appsRes = (await (await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: dev,
      body: JSON.stringify({ text: '/apps', surface: 'glasses' }),
    })).json()) as { ok: boolean; g2Lines: string[]; reply: string };
    expect(appsRes.ok).toBe(true);
    expect(appsRes.g2Lines.every((l) => l.length <= 42)).toBe(true);
    expect(appsRes.g2Lines.join(' ')).toContain('PC APPS');
    expect(appsRes.reply).toContain('Claude Code CLI');

    // Switch to computer-hosted inference from glasses
    const infPc = (await (await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: dev,
      body: JSON.stringify({ text: '/inference computer', surface: 'glasses' }),
    })).json()) as { ok: boolean; g2Lines: string[] };
    expect(infPc.ok).toBe(true);
    expect(infPc.g2Lines[0]).toContain('COMPUTER (HOSTED)');

    // Check corridor reflects PC HOST · LOCAL + mirrored APPS + quickActions <= 6
    const corrPc = (await (await fetch(`${srv.url}/api/corridor`, { headers: dev })).json()) as {
      cards: Array<{ id: string; provenanceLabel: string; timeMeta: string; contextLine1: string; quickActions: Array<{ commandText: string }> }>;
    };
    const pcCard = corrPc.cards.find((c) => c.id === 'card-computer-proactive');
    expect(pcCard?.timeMeta).toBe('PC AI');
    expect(pcCard?.contextLine1).toContain('APPS:');
    expect(pcCard?.quickActions.length).toBeLessThanOrEqual(6);
    expect(pcCard?.quickActions.some((q) => q.commandText === '__OS_COMPUTER_APPS__')).toBe(true);
    expect(pcCard?.quickActions.some((q) => q.commandText === '__OS_TOGGLE_INFERENCE__')).toBe(true);

    // Switch active AI app to Ollama from glasses
    const useOllama = (await (await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: dev,
      body: JSON.stringify({ text: '/use ollama', surface: 'glasses' }),
    })).json()) as { ok: boolean; g2Lines: string[] };
    expect(useOllama.ok).toBe(true);
    expect(useOllama.g2Lines[0]).toContain('Ollama');

    // Switch to optional API mode from glasses
    const infApi = (await (await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: dev,
      body: JSON.stringify({ text: '/inference api', surface: 'glasses' }),
    })).json()) as { ok: boolean; g2Lines: string[] };
    expect(infApi.ok).toBe(true);
    expect(infApi.g2Lines[0]).toContain('API (OPTIONAL)');

    const profile = (await (await fetch(`${srv.url}/api/host/profile`, { headers: dev })).json()) as {
      routing: { inferenceMode: string; active: { id: string } };
    };
    expect(profile.routing.inferenceMode).toBe('api');
    expect(profile.routing.active.id).toBe('openrouter');

    // Uninstalled app rejected cleanly
    const badUse = (await (await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: dev,
      body: JSON.stringify({ text: '/use codex', surface: 'glasses' }),
    })).json()) as { ok: boolean };
    expect(badUse.ok).toBe(false);

    // Kill switch blocks glasses device control with 423
    await fetch(`${srv.url}/api/os/killswitch`, { method: 'POST', headers: owner, body: JSON.stringify({ paused: true }) });
    expect((await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: dev,
      body: JSON.stringify({ text: '/inference computer', surface: 'glasses' }),
    })).status).toBe(423);
  });
});
