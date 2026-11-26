import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deviceAllowed,
  extractDeviceToken,
  gateRequest,
  HostRegistry,
  isLoopbackAddress,
  isOwnerMachineRequest,
  pairingBaseUrl,
  PAIR_CODE_TTL_MS,
  resolveListenHost,
  type DeviceRecord,
} from '../src/host/hostRegistry.js';
import { detectChrome, resolveDataSources, tokensPerTask } from '../src/host/hostProfile.js';
import type { MetricStep } from '../src/harness/metricsLedger.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-hostreg-'));
  dirs.push(d);
  return d;
}

describe('HostRegistry pairing', () => {
  it('issues one 6-digit code with a 5 minute expiry and a new code burns the old one', () => {
    let now = 1_000_000;
    const reg = new HostRegistry({ dataDir: tmp(), nowFn: () => now });
    const a = reg.issueCode()!;
    expect(a.code).toMatch(/^\d{6}$/);
    expect(Date.parse(a.expiresAt) - now).toBe(PAIR_CODE_TTL_MS);
    const b = reg.issueCode()!;
    if (a.code !== b.code) expect(reg.claim(a.code, 'x')).toMatchObject({ ok: false, status: 401 });
    expect(reg.claim(b.code, 'phone')).toMatchObject({ ok: true });
  });

  it('code is single use and expires', () => {
    let now = 5_000;
    const reg = new HostRegistry({ dataDir: tmp(), nowFn: () => now });
    const { code } = reg.issueCode()!;
    expect(reg.claim(code, 'glasses').ok).toBe(true);
    expect(reg.claim(code, 'glasses')).toMatchObject({ ok: false, status: 401 });
    const second = reg.issueCode()!;
    now += PAIR_CODE_TTL_MS + 1;
    expect(reg.claim(second.code, 'late')).toMatchObject({ ok: false, status: 401 });
  });

  it('burns the code after 5 wrong tries even if the 6th is right', () => {
    const reg = new HostRegistry({ dataDir: tmp() });
    const { code } = reg.issueCode()!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect(reg.claim(wrong, 'a')).toMatchObject({ ok: false, status: 401 });
    expect(reg.claim(wrong, 'a')).toMatchObject({ ok: false, status: 429 });
    expect(reg.claim(code, 'a')).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects malformed codes with 400 and rate limits code issuing', () => {
    const reg = new HostRegistry({ dataDir: tmp() });
    expect(reg.claim('12ab56', 'x')).toMatchObject({ ok: false, status: 400 });
    expect(reg.claim(123456, 'x')).toMatchObject({ ok: false, status: 400 });
    for (let i = 0; i < 5; i++) expect(reg.issueCode()).not.toBeNull();
    expect(reg.issueCode()).toBeNull();
  });

  it('stores only a SHA-256 hash of the token and persists devices and revision', () => {
    const dir = tmp();
    const reg = new HostRegistry({ dataDir: dir });
    const { code } = reg.issueCode()!;
    const claimed = reg.claim(code, '  Even G2 \u0007 glasses  ');
    if (!claimed.ok) throw new Error('claim failed');
    const raw = fs.readFileSync(path.join(dir, 'host.json'), 'utf8');
    expect(raw).not.toContain(claimed.deviceToken);
    expect(raw).toMatch(/"tokenHash":"[0-9a-f]{64}"/);
    expect(reg.listDevices()[0]).not.toHaveProperty('tokenHash');
    expect(reg.listDevices()[0].label).toBe('Even G2   glasses');

    reg.reconcile({ routing: 'a' });
    expect(reg.reconcile({ routing: 'b' })).toEqual(['routing']);
    const rev = reg.revision;
    expect(rev).toBeGreaterThan(1);

    const reopened = new HostRegistry({ dataDir: dir });
    expect(reopened.revision).toBe(rev);
    expect(reopened.authenticate(claimed.deviceToken)?.id).toBe(claimed.deviceId);
    expect(reopened.authenticate('odv_not-a-real-token')).toBeNull();
    expect(reopened.authenticate(undefined)).toBeNull();
    expect(reopened.reconcile({ routing: 'b' })).toEqual([]); // no change, no bump
    expect(reopened.revision).toBe(rev);
    expect(reopened.reconcile({ routing: 'b', devices: 'x' })).toEqual(['devices']);
    expect(reopened.revision).toBe(rev + 1);
  });

  it('revokes a device and survives a corrupt host.json', () => {
    const dir = tmp();
    const reg = new HostRegistry({ dataDir: dir });
    const { code } = reg.issueCode()!;
    const c = reg.claim(code, 'p');
    if (!c.ok) throw new Error('claim failed');
    expect(reg.revoke(c.deviceId)).toBe(true);
    expect(reg.revoke(c.deviceId)).toBe(false);
    expect(reg.authenticate(c.deviceToken)).toBeNull();
    fs.writeFileSync(path.join(dir, 'host.json'), '{not json');
    expect(new HostRegistry({ dataDir: dir }).listDevices()).toEqual([]);
  });

  it('caps paired devices at 16', () => {
    const reg = new HostRegistry({ dataDir: tmp() });
    let now = 0;
    const timed = new HostRegistry({ dataDir: tmp(), nowFn: () => now });
    for (let i = 0; i < 16; i++) {
      now += 61_000; // stay under the issue / claim rate limits
      const c = timed.claim(timed.issueCode()!.code, `d${i}`);
      expect(c.ok).toBe(true);
    }
    now += 61_000;
    expect(timed.claim(timed.issueCode()!.code, 'one-too-many')).toMatchObject({ ok: false, status: 409 });
    expect(reg.listDevices()).toHaveLength(0);
  });
});

describe('request gate', () => {
  const dev: DeviceRecord = { id: 'dev_1', label: 'g2', createdAt: '', lastSeen: null, tokenHash: '' };
  const base = { method: 'GET', pathname: '/api/corridor', onOwnerMachine: false, deviceTokenPresented: false, device: null, locked: false };

  it('loopback owner is unchanged; remote needs a device or the claim route', () => {
    expect(gateRequest({ ...base, onOwnerMachine: true }).ok).toBe(true);
    expect(gateRequest({ ...base })).toMatchObject({ ok: false, status: 401 });
    expect(gateRequest({ ...base, method: 'POST', pathname: '/api/demo/session' })).toMatchObject({ ok: false, status: 401 });
    expect(gateRequest({ ...base, method: 'POST', pathname: '/api/pair/claim' }).ok).toBe(true);
    expect(gateRequest({ ...base, method: 'POST', pathname: '/api/pair/code' })).toMatchObject({ ok: false, status: 401 });
    // Public, secret-free doors: the static client and the bare health check.
    expect(gateRequest({ ...base, method: 'GET', pathname: '/api/health' }).ok).toBe(true);
    expect(gateRequest({ ...base, method: 'GET', pathname: '/g/' }).ok).toBe(true);
    expect(gateRequest({ ...base, method: 'GET', pathname: '/g/assets/index-x.js', deviceTokenPresented: true }).ok).toBe(true);
    expect(gateRequest({ ...base, method: 'POST', pathname: '/g/' })).toMatchObject({ ok: false, status: 401 });
    expect(gateRequest({ ...base, method: 'GET', pathname: '/api/poll' })).toMatchObject({ ok: false, status: 401 });
    expect(gateRequest({ ...base, method: 'GET', pathname: '/api/remote/status' })).toMatchObject({ ok: false, status: 401 });
  });

  it('a presented but unknown device token is 401 even on the owner machine', () => {
    expect(gateRequest({ ...base, onOwnerMachine: true, deviceTokenPresented: true })).toMatchObject({ ok: false, status: 401 });
  });

  it('device allowlist: reads, voice, corridor, SSE, approvals yes; pairing admin, connectors, vault, disconnect no', () => {
    const d = { ...base, device: dev, deviceTokenPresented: true };
    const yes: Array<[string, string]> = [
      ['GET', '/api/host/profile'],
      ['GET', '/api/corridor'],
      ['GET', '/api/stream'],
      ['GET', '/api/voice/stream'],
      ['POST', '/api/stt'],
      ['POST', '/api/actions/stage'],
      ['POST', '/api/os/approvals/appr_1/decide'],
      ['POST', '/api/os/killswitch'],
    ];
    const no: Array<[string, string]> = [
      ['POST', '/api/pair/code'],
      ['GET', '/api/pair/devices'],
      ['DELETE', '/api/pair/devices/dev_1'],
      ['POST', '/api/pair/claim'],
      ['POST', '/api/pair/credentials'],
      ['POST', '/api/connectors/connect'],
      ['POST', '/api/connectors/disconnect'],
      ['POST', '/api/connectors/select-model'],
      ['POST', '/api/connectors/scan-models'],
      ['POST', '/api/connectors/orchestrator'],
      ['GET', '/api/auth/google/start'],
      ['POST', '/api/session/revoke'],
      ['POST', '/api/workspace/reset'],
      ['POST', '/api/workspace/fault'],
      ['POST', '/api/memory'],
      ['GET', '/api/os/approvals/appr_1/decide'],
    ];
    for (const [m, p] of yes) expect(gateRequest({ ...d, method: m, pathname: p }).ok, `${m} ${p}`).toBe(true);
    for (const [m, p] of no) {
      expect(deviceAllowed(m, p), `${m} ${p}`).toBe(false);
      expect(gateRequest({ ...d, method: m, pathname: p }), `${m} ${p}`).toMatchObject({ ok: false, status: 403 });
    }
  });

  it('kill switch locks a device: only the profile read stays open', () => {
    const d = { ...base, device: dev, deviceTokenPresented: true, locked: true };
    expect(gateRequest({ ...d, pathname: '/api/host/profile' }).ok).toBe(true);
    expect(gateRequest({ ...d, pathname: '/api/corridor' })).toMatchObject({ ok: false, status: 423 });
    expect(gateRequest({ ...d, method: 'POST', pathname: '/api/os/killswitch' })).toMatchObject({ ok: false, status: 423 });
  });

  it('owner-machine detection: loopback socket alone is not enough behind a tunnel', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.5')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isOwnerMachineRequest('127.0.0.1', { host: '127.0.0.1:8787' })).toBe(true);
    expect(isOwnerMachineRequest('127.0.0.1', { host: 'localhost:8787' })).toBe(true);
    expect(isOwnerMachineRequest('127.0.0.1', {})).toBe(true);
    expect(isOwnerMachineRequest('192.168.1.5', { host: '127.0.0.1:8787' })).toBe(false);
    expect(isOwnerMachineRequest('127.0.0.1', { host: 'x.trycloudflare.com' })).toBe(false);
    expect(isOwnerMachineRequest('127.0.0.1', { host: '127.0.0.1:8787', 'x-forwarded-for': '1.2.3.4' })).toBe(false);
    expect(isOwnerMachineRequest('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4' })).toBe(false);
  });

  it('extracts device tokens from header, bearer prefix, and the stream query only', () => {
    expect(extractDeviceToken({ 'x-onq-device': ' odv_a ' }, '/api/corridor', null)).toBe('odv_a');
    expect(extractDeviceToken({ authorization: 'Bearer odv_b' }, '/api/corridor', null)).toBe('odv_b');
    expect(extractDeviceToken({ authorization: 'Bearer oc_session' }, '/api/corridor', null)).toBeUndefined();
    expect(extractDeviceToken({}, '/api/stream', 'odv_c')).toBe('odv_c');
    expect(extractDeviceToken({}, '/api/corridor', 'odv_c')).toBeUndefined();
    expect(extractDeviceToken({}, '/api/stream', 'oc_session')).toBeUndefined();
  });

  it('listen host: loopback by default, 0.0.0.0 only with the LAN opt-in, explicit host wins', () => {
    expect(resolveListenHost(undefined, false)).toBe('127.0.0.1');
    expect(resolveListenHost(undefined, true)).toBe('0.0.0.0');
    expect(resolveListenHost('127.0.0.1', true)).toBe('127.0.0.1');
  });

  it('pairing url: tunnel url wins, then LAN, else loopback', () => {
    expect(pairingBaseUrl({ publicUrl: 'https://onq.example.dev/', lan: false, port: 8787 })).toBe('https://onq.example.dev');
    expect(pairingBaseUrl({ publicUrl: 'javascript:alert(1)', lan: false, port: 8787 })).toBe('http://127.0.0.1:8787');
    expect(pairingBaseUrl({ lan: false, port: 8787 })).toBe('http://127.0.0.1:8787');
    expect(pairingBaseUrl({ lan: true, port: 9 })).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:9$/);
  });
});

describe('data sources and chrome probe', () => {
  const allSample = { calendar: true, gmail: true, notion: true, telegram: true };
  const none = { calendar: false, gmail: false, notion: false, telegram: false };

  it('prefers api, then browser, then sample, then off, and never fakes a probe', () => {
    const rows = resolveDataSources({
      connected: { ...none, notion: true },
      sample: { ...allSample, telegram: false },
      browser: { wired: true, driver: 'chrome', hasCompletedRun: false },
    });
    expect(rows.map((r) => [r.source, r.mode])).toEqual([
      ['calendar', 'browser'],
      ['gmail', 'browser'],
      ['notion', 'api'],
      ['telegram', 'browser'],
    ]);
    expect(rows.every((r) => r.probed === false)).toBe(true);
    expect(rows[0].evidence).toContain('not verified');

    const proven = resolveDataSources({ connected: none, sample: allSample, browser: { wired: true, driver: 'chrome', hasCompletedRun: true } });
    expect(proven[0].probed).toBe(true);

    const noBrowser = resolveDataSources({ connected: none, sample: { ...allSample, gmail: false }, browser: { wired: false, driver: 'none', hasCompletedRun: false } });
    expect(noBrowser.map((r) => r.mode)).toEqual(['sample', 'off', 'sample', 'sample']);
    const unwired = resolveDataSources({ connected: none, sample: allSample, browser: { wired: false, driver: 'chrome', hasCompletedRun: false } });
    expect(unwired[0].mode).toBe('sample');
  });

  it('detects Chrome by file presence only', () => {
    const win = { env: { PROGRAMFILES: 'C:\\Program Files' }, platform: 'win32' as const };
    expect(detectChrome({ ...win, exists: (p) => p === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' })).toBe(true);
    expect(detectChrome({ ...win, exists: () => false })).toBe(false);
    expect(detectChrome({ env: {}, platform: 'linux', exists: (p) => p === '/usr/bin/google-chrome' })).toBe(true);
    expect(detectChrome({ env: {}, platform: 'win32', exists: () => true })).toBe(false); // no base dirs known
    expect(detectChrome({ ...win, exists: () => { throw new Error('denied'); } })).toBe(false);
  });

  it('tokens per task is null without task ids and an average with them', () => {
    const step = (taskId: string | null, i: number, o: number, kind: 'llm' | 'tool' = 'llm'): MetricStep => ({
      id: 'm', atIso: '', kind, provider: 'rules', model: null, runId: 'r', taskId, ttftMs: null, totalMs: 1,
      inputTokens: i, outputTokens: o, estimated: false, cacheHit: null, queueDepth: 0, ok: true,
    });
    expect(tokensPerTask([step(null, 10, 10)])).toBeNull();
    expect(tokensPerTask([])).toBeNull();
    expect(tokensPerTask([step('a', 10, 10), step('a', 5, 5), step('b', 20, 0), step('b', 1, 1, 'tool')])).toBe(25);
  });
});
