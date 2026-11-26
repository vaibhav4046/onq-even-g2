import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPcPowerSourceSnapshot,
  discoverLocalMcpServers,
  HONEST_HARDWARE_BOUNDARY,
  wakeLocalService,
} from '../src/harness/pcPowerSource.js';
import { buildRemoteBridgeState, ZERO_TRUST_REMOTE_GUARDS } from '../src/remote/tunnelBridge.js';
import { RemoteService } from '../src/host/remote.js';
import { EncryptedTokenVault } from '../src/tokenVault.js';
import { GoogleWorkspaceClient } from '../src/providers/googleProvider.js';
import { createOnQServer } from '../src/server.js';
import { TelegramCommandCentre } from '../src/harness/telegramCommandCentre.js';
import type { ScannerDeps } from '../src/providers/providerScanner.js';
import { formatLiveUiForG2, type LiveUiSurface } from '@onq/core';

const KEY_HEX = 'c'.repeat(64);
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

describe('Phase 1-3: Durable vault.enc, PC Power Source, Remote Bridge & Telegram Kill Switch', () => {
  it('EncryptedTokenVault defaults to vault.enc, honors explicit vault path, and migrates legacy tokens.vault.json losslessly', () => {
    const dir = mkTmp('onq-dur-vault-');
    // Seed a legacy tokens.vault.json sealed with KEY_HEX
    const legacyPath = path.join(dir, 'tokens.vault.json');
    const seeder = new EncryptedTokenVault(dir, KEY_HEX, legacyPath);
    seeder.save({ googleRefreshToken: '1//legacy-refresh', notionToken: 'ntn_legacy_123' });
    expect(fs.existsSync(legacyPath)).toBe(true);

    // Default constructor migrates legacy tokens.vault.json -> vault.enc
    const migrated = new EncryptedTokenVault(dir, KEY_HEX);
    expect(path.basename(migrated.getVaultPath())).toBe('vault.enc');
    expect(fs.existsSync(migrated.getVaultPath())).toBe(true);
    expect(migrated.load()).toMatchObject({
      googleRefreshToken: '1//legacy-refresh',
      notionToken: 'ntn_legacy_123',
    });

    // Explicit vault path override stays isolated
    const customPath = path.join(dir, 'ci', 'custom.enc');
    const isolated = new EncryptedTokenVault(dir, KEY_HEX, customPath);
    isolated.save({ telegramBotToken: '999:isolated' });
    expect(isolated.getVaultPath()).toBe(path.resolve(customPath));
    expect(isolated.load().telegramBotToken).toBe('999:isolated');
    expect(migrated.load().telegramBotToken).toBeUndefined();
  });

  it('discoverLocalMcpServers reads server names only without secrets and buildPcPowerSourceSnapshot categorizes all 3 tiers', () => {
    const home = '/fake/home';
    const files: Record<string, string> = {
      [path.join(home, '.claude', 'settings.json')]: JSON.stringify({
        mcpServers: { notion: { env: { SECRET: 'never-returned' } }, github: { command: 'gh' } },
      }),
      [path.join(home, '.codex', 'config.toml')]: '[mcp_servers.kodro]\ncommand = "kodro"\n[mcp_servers.kodro.env]\nTOKEN = "secret"\n',
      [path.join(home, '.hermes', 'config.yaml')]: 'model: local\n',
    };
    const mcps = discoverLocalMcpServers({
      homedir: home,
      exists: (p) => p in files,
      readText: (p) => files[p],
    });
    expect(mcps).toEqual(
      expect.arrayContaining([
        { source: 'claude', name: 'notion' },
        { source: 'claude', name: 'github' },
        { source: 'codex', name: 'kodro' },
        { source: 'hermes', name: 'hermes-local' },
      ]),
    );
    expect(JSON.stringify(mcps)).not.toContain('never-returned');
    expect(JSON.stringify(mcps)).not.toContain('secret');

    const snap = buildPcPowerSourceSnapshot({
      hostname: 'DEV-RIG',
      platform: 'win32',
      inferenceMode: 'computer',
      active: { id: 'ollama', label: 'Ollama (local)', model: 'qwen3:1.7b' },
      mcpServers: mcps,
      scan: {
        scannedAt: '2026-11-26T22:00:00Z',
        providers: [
          { id: 'ollama', name: 'Ollama', kind: 'local_server', state: 'connected', selectable: true, defaultModel: 'qwen3:1.7b', models: [{ id: 'qwen3:1.7b', name: 'qwen3:1.7b', local: true }], detail: 'Running', fixHint: '' },
          { id: 'omniroute', name: 'OmniRoute', kind: 'local_server', state: 'error', selectable: false, defaultModel: null, models: [], detail: 'Installed but not running', fixHint: 'Run omniroute' },
          { id: 'openrouter', name: 'OpenRouter', kind: 'api_key', state: 'needs_auth', selectable: false, defaultModel: 'openrouter/free', models: [], detail: 'No key', fixHint: 'Add key' },
        ],
      },
    });
    expect(snap.counts.hostedReady).toBe(1);
    expect(snap.counts.hostedStandby).toBe(1);
    expect(snap.hostedStandby[0]).toMatchObject({ id: 'omniroute', wakeable: true });
    expect(snap.cloudOptional[0]).toMatchObject({ id: 'openrouter', tier: 'CLOUD_OPTIONAL' });
    expect(snap.honestBoundary).toBe(HONEST_HARDWARE_BOUNDARY);
  });

  it('wakeLocalService spawns constant args only for allowlisted local servers', () => {
    const launched: Array<{ bin: string; args: string[] }> = [];
    const ok = wakeLocalService('ollama', {
      env: { PATH: 'C:\\bin' },
      platform: 'win32',
      homedir: 'C:\\Users\\t',
      exists: (p) => p.toLowerCase().endsWith('ollama.exe'),
      spawnDetached: (bin, args) => launched.push({ bin, args }),
    });
    expect(ok.ok).toBe(true);
    expect(launched[0]?.args).toEqual(['serve']);

    const missing = wakeLocalService('omniroute', {
      env: { PATH: '' },
      platform: 'win32',
      homedir: 'C:\\Users\\t',
      exists: () => false,
      spawnDetached: () => undefined,
    });
    expect(missing.ok).toBe(false);
  });

  it('buildRemoteBridgeState detects vacation-ready HTTPS URL & zero-trust guards', async () => {
    const dir = mkTmp('onq-bridge-');
    const remote = new RemoteService({
      dataDir: dir,
      lanEnabled: false,
      getPort: () => 8787,
      onChange: () => undefined,
      inspect: false,
    });
    const local = await buildRemoteBridgeState(remote, undefined, 8787);
    expect(local.mode).toBe('LOCAL_LOOPBACK');
    expect(local.vacationReady).toBe(false);
    expect(local.zeroTrustGuards).toEqual(ZERO_TRUST_REMOTE_GUARDS);

    const pub = await buildRemoteBridgeState(remote, 'https://onq-home.trycloudflare.com', 8787);
    expect(pub.mode).toBe('REMOTE_PUBLIC_URL');
    expect(pub.vacationReady).toBe(true);
    expect(pub.commands.packForRemote).toContain('ONQ_RELAY_ORIGIN=https://onq-home.trycloudflare.com');
  });

  it('server exposes /api/computer/power-source to paired glasses while keeping /api/computer/wake & /api/remote/bridge owner-only', async () => {
    const dir = mkTmp('onq-ps-srv-');
    const scannerDeps: Partial<ScannerDeps> = {
      env: { PATH: 'C:\\nowhere', USERPROFILE: 'C:\\Users\\t' },
      platform: 'win32',
      homedir: 'C:\\Users\\t',
      exists: () => false,
      fetchImpl: (async (input: string | URL | Request) => {
        const u = String(input instanceof Request ? input.url : input);
        if (u.includes('11434/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'all-minilm:latest' }, { name: 'qwen3:1.7b' }] }), { status: 200 });
        }
        throw new TypeError('offline');
      }) as typeof fetch,
      probeCli: async () => ({ ok: false, timedOut: false, reason: 'none' }),
      cliProbeTimeoutMs: 50,
    };
    let llmCalls = 0;
    const srv = await createOnQServer({
      port: 0,
      dataDir: dir,
      disableProactiveTimer: true,
      scannerDeps,
      publicUrl: 'https://vacation-pc.trycloudflare.com',
      llmConfig: {
        preferredProvider: 'chatgpt',
        openAiKey: 'sk-test-fake',
        fetchImpl: (async () => {
          llmCalls += 1;
          throw new Error('LLM should not be called when calendar slot is already busy');
        }) as typeof fetch,
      },
    });
    closers.push(() => srv.close());

    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const owner = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    await fetch(`${srv.url}/api/connectors/scan-models`, { method: 'POST', headers: owner });

    const code = ((await (await fetch(`${srv.url}/api/pair/code`, { method: 'POST' })).json()) as { code: string }).code;
    const devTok = ((await (await fetch(`${srv.url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code, label: 'G2' }) })).json()) as { deviceToken: string }).deviceToken;
    const dev = { 'x-onq-device': devTok, 'Content-Type': 'application/json' };

    const psRes = await fetch(`${srv.url}/api/computer/power-source`, { headers: dev });
    expect(psRes.status).toBe(200);
    const ps = (await psRes.json()) as { hostedReady: Array<{ id: string; defaultModel: string }> };
    expect(ps.hostedReady[0]).toMatchObject({ id: 'ollama', defaultModel: 'qwen3:1.7b' }); // skipped all-minilm embedding model

    // Corridor card reflects REMOTE TUNNEL when publicUrl is configured
    const corr = (await (await fetch(`${srv.url}/api/corridor`, { headers: dev })).json()) as {
      cards: Array<{ id: string; provenanceLabel: string }>;
    };
    expect(corr.cards.find((c) => c.id === 'card-computer-proactive')?.provenanceLabel).toBe('REMOTE TUNNEL');

    // Owner-only gates hold for paired devices
    expect((await fetch(`${srv.url}/api/computer/wake`, { method: 'POST', headers: dev, body: JSON.stringify({ service: 'ollama' }) })).status).toBe(403);
    expect((await fetch(`${srv.url}/api/remote/bridge`, { headers: dev })).status).toBe(403);
    const ownerBridge = await fetch(`${srv.url}/api/remote/bridge`, { headers: owner });
    expect(ownerBridge.status).toBe(200);
    expect(((await ownerBridge.json()) as { vacationReady: boolean }).vacationReady).toBe(true);

    // Deterministic 409 pre-check aborts busy calendar slots BEFORE calling any LLM (0 wasted tokens)
    const busyRes = await fetch(`${srv.url}/api/actions/stage`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ commandText: 'Move VC sync to 14:45' }),
    });
    expect(busyRes.status).toBe(409);
    expect(llmCalls).toBe(0);
  });

  it('Telegram inline Kill Switch callback pauses OS from owner DM and rejects unpaired chats', async () => {
    let killPaused = false;
    const fakeHarness = {
      getLastTelegramUpdateId: () => 0,
      setLastTelegramUpdateId: () => undefined,
      setKillSwitch: (paused: boolean) => {
        killPaused = paused;
      },
    };
    const centre = new TelegramCommandCentre({
      osHarness: fakeHarness as never,
      getCredentials: () => ({ chatId: '1001658' }),
    });
    const denied = await centre.processUpdate({
      updateId: 10,
      callbackQuery: { id: 'cb1', data: 'killswitch:appr_1', chatId: '9999', messageId: 1 },
    });
    expect(denied.handled).toBe(false);
    expect(killPaused).toBe(false);

    const ok = await centre.processUpdate({
      updateId: 11,
      callbackQuery: { id: 'cb2', data: 'killswitch:appr_1', chatId: '1001658', messageId: 2 },
    });
    expect(ok.handled).toBe(true);
    expect(killPaused).toBe(true);
  });

  it('GoogleWorkspaceClient silently refreshes expired access_token from durable vault refresh_token', async () => {
    const dir = mkTmp('onq-g-refresh-');
    const vault = new EncryptedTokenVault(dir, KEY_HEX);
    vault.save({
      googleClientId: 'cid.apps.googleusercontent.com',
      googleClientSecret: 'csec-test',
      googleRefreshToken: '1//durable-refresh',
      googleAccessToken: 'expired-tok',
      googleAccessExpiresAt: Date.now() - 10_000,
    });
    let calledRefresh = false;
    const gClient = new GoogleWorkspaceClient(vault, (async (url: string | URL | Request) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        calledRefresh = true;
        return new Response(JSON.stringify({ access_token: 'fresh-access-tok', expires_in: 3600 }), { status: 200 });
      }
      throw new Error(`unexpected url ${String(url)}`);
    }) as typeof fetch);

    const tok = await gClient.getAccessToken();
    expect(calledRefresh).toBe(true);
    expect(tok).toBe('fresh-access-tok');
    expect(vault.load().googleAccessToken).toBe('fresh-access-tok');
    expect(vault.load().googleRefreshToken).toBe('1//durable-refresh');
  });

  it('/run openbot returns honest standby G2 lines when OpenBot desktop is closed', async () => {
    const dir = mkTmp('onq-ob-cmd-');
    const srv = await createOnQServer({ port: 0, dataDir: dir, disableProactiveTimer: true });
    closers.push(() => srv.close());
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const out = (await (await fetch(`${srv.url}/api/os/command`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '/run openbot check status', surface: 'glasses' }),
    })).json()) as { ok: boolean; g2Lines: string[] };
    expect(out.ok).toBe(false);
    expect(out.g2Lines[0]).toBe('OPENBOT STANDBY');
    expect(out.g2Lines.every((l) => l.length <= 42)).toBe(true);
  });

  it('formatLiveUiForG2 renders all 3 L4 Crew body rows + header cleanly within 7x42 optical budget', () => {
    const surface: LiveUiSurface = {
      id: 'pipe-test-1',
      title: 'L4 Crew: software_delivery',
      frame: 'stack',
      repairedCodes: [],
      vars: { status: 'VERIFIED_DONE' },
      updatedAtIso: '2026-11-26T22:00:00Z',
      components: [
        {
          id: 'pipe-test-1_body',
          kind: 'text',
          region: 'main',
          text: [
            '1. Chief/Dev: OK git clean + PRs ready',
            '2. Research/QA: OK 515 tests verified',
            '3. AUDITOR: VERIFIED_DONE (L4 safe)',
          ].join('\n'),
        },
      ],
    };
    const formatted = formatLiveUiForG2(surface);
    expect(formatted.lines.length).toBeLessThanOrEqual(7);
    expect(formatted.lines.every((l) => l.length <= 42)).toBe(true);
    expect(formatted.bodyText).toContain('Chief/Dev');
    expect(formatted.bodyText).toContain('Research/QA');
    expect(formatted.bodyText).toContain('AUDITOR: VERIFIED_DONE');
    expect(new TextEncoder().encode(formatted.bodyText).length).toBeLessThanOrEqual(999);
  });

  it('POST /api/computer/wake rejects unallowlisted services cleanly with HTTP 400', async () => {
    const dir = mkTmp('onq-wake-400-');
    const srv = await createOnQServer({ port: 0, dataDir: dir, disableProactiveTimer: true });
    closers.push(() => srv.close());
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const bad = await fetch(`${srv.url}/api/computer/wake`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'calc.exe; rm -rf /' }),
    });
    expect(bad.status).toBe(400);
  });
});
