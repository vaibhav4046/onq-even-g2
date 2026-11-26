import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createOnQServer } from '../src/server.js';
import type { ScannerDeps } from '../src/providers/providerScanner.js';

const HERMETIC_ENV = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'NOTION_TOKEN', 'NOTION_DATABASE_ID', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'];
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

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await (closers.pop() as () => Promise<void>)();
});

const SECRET_OR = 'sk-or-host-secret-00000000000001';
const SECRET_TG = '123456789:AAHostSecretTelegramTokenXYZ0123456789';

/** A PC with Ollama running and nothing else: no real CLI, key or Chrome is ever touched. */
function fakeScanner(over: Partial<ScannerDeps> = {}): Partial<ScannerDeps> {
  return {
    env: { PATH: 'C:\\nowhere', USERPROFILE: 'C:\\Users\\tester' },
    platform: 'win32',
    homedir: 'C:\\Users\\tester',
    exists: () => false,
    fetchImpl: (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('http://127.0.0.1:11434/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }, { name: 'qwen3:8b' }] }), { status: 200 });
      }
      throw new TypeError('fetch failed: ECONNREFUSED');
    }) as typeof fetch,
    probeCli: async () => ({ ok: true, ms: 900 }),
    cliProbeTimeoutMs: 50,
    ...over,
  };
}

async function boot(extra: Parameters<typeof createOnQServer>[0] = {}, dataDir?: string) {
  const dir = dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'onq-host-'));
  const fake: { remote?: string } = {};
  const srv = await createOnQServer({
    port: 0,
    dataDir: dir,
    allowTestFaultControls: true,
    scannerDeps: fakeScanner(),
    getRemoteAddress: () => fake.remote,
    ...extra,
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await srv.close();
  };
  closers.push(async () => {
    await close();
    if (!dataDir) fs.rmSync(dir, { recursive: true, force: true });
  });
  const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
  const owner = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
  const ownerPost = (p: string, body: unknown = {}) => fetch(`${srv.url}${p}`, { method: 'POST', headers: owner, body: JSON.stringify(body) });
  const ownerGet = (p: string) => fetch(`${srv.url}${p}`, { headers: owner });
  const profile = async (headers: Record<string, string> = owner, qs = '') =>
    (await (await fetch(`${srv.url}/api/host/profile${qs}`, { headers })).json()) as Record<string, any>;
  /** Pairs a device the way a phone would: owner asks for a code, the device claims it. */
  const pair = async (label = 'Even G2') => {
    const code = (await (await fetch(`${srv.url}/api/pair/code`, { method: 'POST' })).json()) as { code: string };
    const res = await fetch(`${srv.url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code: code.code, label }) });
    const body = (await res.json()) as { deviceId: string; deviceToken: string };
    return { ...body, dev: { 'x-onq-device': body.deviceToken, 'Content-Type': 'application/json' } as Record<string, string> };
  };
  return { srv, dir, fake, close, owner, ownerPost, ownerGet, profile, pair };
}

interface SseHandle {
  events: Array<{ event: string; data: any }>;
  ended: () => boolean;
  close: () => void;
}
function openSse(url: string, headers: Record<string, string> = {}): Promise<SseHandle> {
  return new Promise((resolve, reject) => {
    const events: SseHandle['events'] = [];
    let ended = false;
    const req = http.get(url, { headers }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SSE HTTP ${res.statusCode}`));
        return;
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1] ?? 'message';
          const raw = /^data: (.*)$/m.exec(block)?.[1] ?? 'null';
          events.push({ event: ev, data: JSON.parse(raw) });
        }
      });
      res.on('end', () => {
        ended = true;
      });
      res.on('close', () => {
        ended = true;
      });
      const handle: SseHandle = { events, ended: () => ended, close: () => req.destroy() };
      closers.push(async () => handle.close());
      resolve(handle);
    });
    req.on('error', (e) => {
      if (!ended) reject(e);
    });
  });
}

async function until(pred: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 15));
  }
}

function rawRequest(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

describe('host profile', () => {
  it('needs auth and returns the whole host in one JSON without any secret', async () => {
    const h = await boot();
    expect((await fetch(`${h.srv.url}/api/host/profile`)).status).toBe(401);
    await h.ownerPost('/api/connectors/connect', { provider: 'openrouter', apiKey: SECRET_OR });
    await h.ownerPost('/api/connectors/scan-models'); // the profile reports the last scan, so rescan after connecting
    const res = await fetch(`${h.srv.url}/api/host/profile`, { headers: h.owner });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(SECRET_OR);
    expect(text).not.toContain('tokenHash');
    expect(text).not.toContain('AppData');
    const p = JSON.parse(text);
    expect(p.host).toMatchObject({ name: os.hostname(), platform: process.platform });
    expect(p.host.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(p.revision)).toBe(true);
    expect(p.locked).toBe(false);

    const ollama = p.harnesses.items.find((x: any) => x.id === 'ollama');
    expect(ollama).toMatchObject({ kind: 'server', status: 'connected', modelCount: 2 });
    expect(ollama.models).toContain('llama3.2:latest');
    expect(typeof ollama.lastProbeMs).toBe('number');
    expect(p.harnesses.items.find((x: any) => x.id === 'claude_cli')).toMatchObject({ kind: 'cli', status: 'not_installed', lastProbeMs: null });
    expect(p.harnesses.items.find((x: any) => x.id === 'openrouter')).toMatchObject({ kind: 'api', status: 'connected' });

    expect(p.routing).toMatchObject({ preferredLlm: 'openrouter', preferredModel: null }); // connecting a key makes it the preferred router
    expect(typeof p.routing.active.id).toBe('string');
    expect(p.tools.commands.map((c: any) => c.command)).toEqual(expect.arrayContaining(['/status', '/browse', '/approve']));
    expect(p.tools.agents.length).toBeGreaterThanOrEqual(10);
    expect(p.tools.agents[0]).toHaveProperty('maxAutonomy');
    expect(p.tools.browserAgent).toEqual({ available: false, driver: 'none' });
    expect(p.skills.length).toBeGreaterThan(0);
    expect(p.skills[0]).toHaveProperty('triggerCommand');
    expect(p.connectors).toMatchObject({ telegram: false, notion: false, google: false, openrouter: true });
    expect(typeof p.connectors.assemblyai).toBe('boolean'); // the repo .env may hold an AssemblyAI key
    expect(Object.keys(p.metrics).sort()).toEqual(['inFlight', 'p50Ms', 'p95Ms', 'tokensEstimated', 'tokensPerTask']);
    expect(p.devices).toEqual([]);
    expect(p.dataSources.map((d: any) => d.source)).toEqual(['calendar', 'gmail', 'notion', 'telegram']);
  });

  it('?since returns {unchanged:true} when equal and the full profile after a change; revision is monotonic', async () => {
    const h = await boot();
    const first = await h.profile();
    const same = await h.profile(h.owner, `?since=${first.revision}`);
    expect(same).toEqual({ unchanged: true, revision: first.revision });
    expect(await h.profile(h.owner, '?since=')).toHaveProperty('host');
    expect(await h.profile(h.owner, '?since=abc')).toHaveProperty('host');

    await h.ownerPost('/api/connectors/select-model', { provider: 'rules' });
    const next = await h.profile(h.owner, `?since=${first.revision}`);
    expect(next.revision).toBeGreaterThan(first.revision);
    expect(next.routing.preferredLlm).toBe('rules');
    const again = await h.profile(h.owner, `?since=${next.revision}`);
    expect(again.unchanged).toBe(true);
  });

  it('data sources are honest: sample by default, browser only with a driver and never claimed as proven', async () => {
    const h = await boot();
    const p = await h.profile();
    expect(p.dataSources.map((d: any) => d.effective)).toEqual(['sample', 'sample', 'sample', 'sample']);
    expect(p.dataSources.map((d: any) => d.mode)).toEqual(['auto', 'auto', 'auto', 'auto']);

    const b = await boot({ browserDriverFactory: () => ({ goto: async () => undefined, snapshot: async () => ({ url: '', title: '', text: '', elements: [] }), click: async () => undefined, type: async () => undefined, scroll: async () => undefined, close: async () => undefined }) });
    const pb = await b.profile();
    expect(pb.tools.browserAgent).toEqual({ available: true, driver: 'injected' });
    for (const d of pb.dataSources) {
      expect(d.effective).toBe('browser');
      expect(d.probed).toBe(false);
      expect(d.evidence).toContain('not verified');
    }
  });

  it('connected sources report api, from the vault or the environment, with booleans only', async () => {
    const prevTg = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = SECRET_TG;
    try {
      const h = await boot();
      const text = await (await fetch(`${h.srv.url}/api/host/profile`, { headers: h.owner })).text();
      expect(text).not.toContain(SECRET_TG);
      const p = JSON.parse(text);
      expect(p.connectors.telegram).toBe(true);
      expect(p.dataSources.find((d: any) => d.source === 'telegram')).toMatchObject({ mode: 'auto', effective: 'api', probed: false });
      expect(p.dataSources.find((d: any) => d.source === 'calendar').effective).toBe('sample');
    } finally {
      if (prevTg === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = prevTg;
    }
  });
});

describe('pairing over HTTP', () => {
  it('issues a code, claims it once, and the device token works as header or bearer but is never stored', async () => {
    const h = await boot();
    const codeRes = await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST' });
    expect(codeRes.status).toBe(200);
    const issued = (await codeRes.json()) as { code: string; expiresAt: string; url: string };
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(Date.parse(issued.expiresAt) - Date.now()).toBeGreaterThan(4 * 60_000);
    expect(Date.parse(issued.expiresAt) - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    expect(issued.url).toBe(h.srv.url);

    const claim = await fetch(`${h.srv.url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code: issued.code, label: 'Pixel' }) });
    expect(claim.status).toBe(200);
    const { deviceId, deviceToken } = (await claim.json()) as { deviceId: string; deviceToken: string };
    expect(deviceId).toMatch(/^dev_[0-9a-f]{12}$/);
    expect(deviceToken.startsWith('odv_')).toBe(true);

    const reuse = await fetch(`${h.srv.url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code: issued.code, label: 'again' }) });
    expect(reuse.status).toBe(401);

    expect((await fetch(`${h.srv.url}/api/host/profile`, { headers: { 'x-onq-device': deviceToken } })).status).toBe(200);
    expect((await fetch(`${h.srv.url}/api/host/profile`, { headers: { Authorization: `Bearer ${deviceToken}` } })).status).toBe(200);
    expect((await fetch(`${h.srv.url}/api/host/profile`, { headers: { 'x-onq-device': `${deviceToken}x` } })).status).toBe(401);

    const hostJson = fs.readFileSync(path.join(h.dir, 'host.json'), 'utf8');
    expect(hostJson).not.toContain(deviceToken);
    expect(hostJson).toMatch(/"tokenHash":"[0-9a-f]{64}"/);

    const devices = (await (await fetch(`${h.srv.url}/api/pair/devices`)).json()) as { devices: Array<Record<string, unknown>> };
    expect(devices.devices).toHaveLength(1);
    expect(devices.devices[0]).toMatchObject({ id: deviceId, label: 'Pixel' });
    expect(Object.keys(devices.devices[0]).sort()).toEqual(['createdAt', 'id', 'label', 'lastSeen']);
    expect(JSON.stringify(devices)).not.toContain(deviceToken);

    const p = await h.profile();
    expect(p.devices.map((d: any) => d.id)).toEqual([deviceId]);
    expect(p.devices[0].lastSeen).not.toBeNull();
    expect(JSON.stringify(p)).not.toContain(deviceToken);
  });

  it('five wrong tries burn the code; a malformed body is 400; pair code from a browser origin needs a session', async () => {
    const h = await boot();
    const { code } = (await (await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST' })).json()) as { code: string };
    const wrong = code === '000000' ? '111111' : '000000';
    const claim = (c: string) => fetch(`${h.srv.url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code: c, label: 'x' }) });
    for (let i = 0; i < 4; i++) expect((await claim(wrong)).status).toBe(401);
    expect((await claim(wrong)).status).toBe(429);
    expect((await claim(code)).status).toBe(401); // burned, even though it is the right code
    expect((await fetch(`${h.srv.url}/api/pair/claim`, { method: 'POST', body: '{nope' })).status).toBe(400);

    const asBrowser = await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST', headers: { Origin: 'http://localhost:5173' } });
    expect(asBrowser.status).toBe(401);
    const withSession = await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST', headers: { ...h.owner, Origin: 'http://localhost:5173' } });
    expect(withSession.status).toBe(200);
    // sixth code inside a minute is rate limited
    for (let i = 0; i < 3; i++) expect((await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST' })).status).toBe(200);
    expect((await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST' })).status).toBe(429);
  });

  it('revoke ends access, cuts the live stream, and bumps the revision', async () => {
    const h = await boot();
    const d = await h.pair('Watch');
    const sse = await openSse(`${h.srv.url}/api/stream?token=${encodeURIComponent(d.deviceToken)}`);
    await until(() => sse.events.some((e) => e.event === 'connected'));
    const before = (await h.profile()).revision;

    const del = await fetch(`${h.srv.url}/api/pair/devices/${d.deviceId}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await fetch(`${h.srv.url}/api/pair/devices/${d.deviceId}`, { method: 'DELETE' })).status).toBe(404);
    await until(() => sse.ended());
    expect(sse.events.some((e) => e.event === 'revoked')).toBe(true);
    expect((await fetch(`${h.srv.url}/api/host/profile`, { headers: d.dev })).status).toBe(401);
    const after = await h.profile();
    expect(after.devices).toEqual([]);
    expect(after.revision).toBeGreaterThan(before);
  });

  it('devices survive a restart (hash on disk) and the revision never goes backwards', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-host-persist-'));
    closers.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const a = await boot({}, dir);
    const d = await a.pair('Phone');
    const rev = (await a.profile()).revision;
    await a.close();

    const b = await boot({}, dir);
    const res = await fetch(`${b.srv.url}/api/host/profile`, { headers: d.dev });
    expect(res.status).toBe(200);
    const p = (await res.json()) as { revision: number; devices: Array<{ id: string }> };
    expect(p.devices.map((x) => x.id)).toEqual([d.deviceId]);
    expect(p.revision).toBeGreaterThanOrEqual(rev);
  });
});

describe('device allowlist on the real server', () => {
  it('device reads corridor and profile but cannot touch pairing admin, connectors, vault or disconnect', async () => {
    const h = await boot();
    const d = await h.pair();
    const call = (m: string, p: string, body?: unknown) => fetch(`${h.srv.url}${p}`, { method: m, headers: d.dev, body: body === undefined || m === 'GET' ? undefined : JSON.stringify(body) });
    expect((await call('GET', '/api/corridor')).status).toBe(200);
    expect((await call('GET', '/api/host/profile')).status).toBe(200);
    expect((await call('GET', '/api/os/state')).status).toBe(200);
    for (const [m, p] of [
      ['POST', '/api/pair/code'],
      ['GET', '/api/pair/devices'],
      ['DELETE', `/api/pair/devices/${d.deviceId}`],
      ['POST', '/api/pair/credentials'],
      ['POST', '/api/connectors/connect'],
      ['POST', '/api/connectors/disconnect'],
      ['POST', '/api/connectors/select-model'],
      ['POST', '/api/session/revoke'],
    ]) {
      expect((await call(m, p, {})).status, `${m} ${p}`).toBe(403);
    }
    // the device is still valid afterwards and approvals decisions reach the real handler (404/409 is fine, 403 is not)
    const decide = await call('POST', '/api/os/approvals/appr_missing/decide', { decision: 'reject' });
    expect(decide.status).not.toBe(403);
    expect(decide.status).not.toBe(401);
  });

  it('a device sends the staged-action flow through (stage works, Default-NO preview comes back)', async () => {
    const h = await boot();
    const d = await h.pair();
    const res = await fetch(`${h.srv.url}/api/actions/stage`, { method: 'POST', headers: d.dev, body: JSON.stringify({ commandText: 'Push my next meeting 15 minutes' }) });
    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('kill switch locks devices (423), cuts their stream, can be engaged but not released by a device, and the owner can release', async () => {
    const h = await boot();
    const d = await h.pair();
    const sse = await openSse(`${h.srv.url}/api/stream`, { 'x-onq-device': d.deviceToken });
    await until(() => sse.events.some((e) => e.event === 'connected'));

    const noRelease = await fetch(`${h.srv.url}/api/os/killswitch`, { method: 'POST', headers: d.dev, body: JSON.stringify({ paused: false }) });
    expect(noRelease.status).toBe(403);
    const engage = await fetch(`${h.srv.url}/api/os/killswitch`, { method: 'POST', headers: d.dev, body: JSON.stringify({ paused: true }) });
    expect(engage.status).toBe(200);

    await until(() => sse.ended());
    expect(sse.events.some((e) => e.event === 'locked')).toBe(true);
    expect((await fetch(`${h.srv.url}/api/corridor`, { headers: d.dev })).status).toBe(423);
    expect((await fetch(`${h.srv.url}/api/os/killswitch`, { method: 'POST', headers: d.dev, body: JSON.stringify({ paused: false }) })).status).toBe(423);
    const lockedProfile = await fetch(`${h.srv.url}/api/host/profile`, { headers: d.dev });
    expect(lockedProfile.status).toBe(200);
    expect(((await lockedProfile.json()) as { locked: boolean }).locked).toBe(true);

    expect((await h.ownerPost('/api/os/killswitch', { paused: false })).status).toBe(200);
    expect((await fetch(`${h.srv.url}/api/corridor`, { headers: d.dev })).status).toBe(200);
  });
});

describe('sync: host SSE event', () => {
  it('fires on model select, scan, pair and revoke with the changed keys and a rising revision', async () => {
    const h = await boot();
    const token = h.owner.Authorization.replace('Bearer ', '');
    const sse = await openSse(`${h.srv.url}/api/stream?token=${encodeURIComponent(token)}`);
    await until(() => sse.events.some((e) => e.event === 'connected'));
    const hosts = () => sse.events.filter((e) => e.event === 'host').map((e) => e.data as { revision: number; changed: string[] });

    await h.ownerPost('/api/connectors/select-model', { provider: 'rules' });
    await until(() => hosts().some((x) => x.changed.includes('routing')));

    await h.ownerPost('/api/connectors/scan-models');
    await until(() => hosts().some((x) => x.changed.includes('harnesses')));

    const d = await h.pair('Lens');
    await until(() => hosts().some((x) => x.changed.includes('devices')));

    await fetch(`${h.srv.url}/api/pair/devices/${d.deviceId}`, { method: 'DELETE' });
    await until(() => hosts().filter((x) => x.changed.includes('devices')).length >= 2);

    await h.ownerPost('/api/connectors/connect', { provider: 'openrouter', apiKey: SECRET_OR });
    await until(() => hosts().some((x) => x.changed.includes('connectors')));

    const revs = hosts().map((x) => x.revision);
    expect(revs.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < revs.length; i++) expect(revs[i]).toBeGreaterThan(revs[i - 1]);
    expect(JSON.stringify(sse.events)).not.toContain(SECRET_OR);
  });

  it('a paired device receives host events on its own stream and can refetch the profile', async () => {
    const h = await boot();
    const d = await h.pair();
    const sse = await openSse(`${h.srv.url}/api/stream?token=${encodeURIComponent(d.deviceToken)}`);
    await until(() => sse.events.some((e) => e.event === 'connected'));
    await h.ownerPost('/api/connectors/select-model', { provider: 'rules' });
    await until(() => sse.events.some((e) => e.event === 'host'));
    const ev = sse.events.find((e) => e.event === 'host')!.data as { revision: number };
    const p = await h.profile(d.dev, `?since=${ev.revision - 1}`);
    expect(p.revision).toBe(ev.revision);
    expect(p.routing.preferredLlm).toBe('rules');
  });
});

describe('LAN safety', () => {
  it('default: loopback only, no pairing url on the LAN, behaviour unchanged for local callers', async () => {
    const h = await boot();
    expect((h.srv.server.address() as { address: string }).address).toBe('127.0.0.1');
    expect((await fetch(`${h.srv.url}/api/health`)).status).toBe(200);
    expect((await fetch(`${h.srv.url}/api/corridor`, { headers: h.owner })).status).toBe(200);
  });

  it('LAN opt-in changes the pairing url; ONQ_PUBLIC_URL wins; tests stay on loopback (no firewall prompt)', async () => {
    const h = await boot({ lan: true, host: '127.0.0.1', publicUrl: 'https://onq-tunnel.example.dev/' });
    const issued = (await (await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST' })).json()) as { url: string };
    expect(issued.url).toBe('https://onq-tunnel.example.dev');

    const lan = await boot({ lan: true, host: '127.0.0.1' });
    const u = (await (await fetch(`${lan.srv.url}/api/pair/code`, { method: 'POST' })).json()) as { url: string };
    expect(u.url).toMatch(new RegExp(`^http://\\d+\\.\\d+\\.\\d+\\.\\d+:${lan.srv.port}$|^http://127\\.0\\.0\\.1:${lan.srv.port}$`));
  });

  it('a non-loopback caller gets 401 everywhere except pair/claim, even with a valid owner session', async () => {
    const h = await boot({ lan: true, host: '127.0.0.1' });
    h.fake.remote = '192.168.1.50';
    const anonHealth = await fetch(`${h.srv.url}/api/health`);
    expect(anonHealth.status).toBe(200);
    expect(await anonHealth.json()).toEqual({ ok: true, brand: 'OnQ' }); // nothing about this computer leaks
    expect((await fetch(`${h.srv.url}/api/demo/session`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${h.srv.url}/api/corridor`, { headers: h.owner })).status).toBe(401);
    expect((await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${h.srv.url}/api/pair/devices`)).status).toBe(401);
    expect((await fetch(`${h.srv.url}/api/stream?token=${encodeURIComponent(h.owner.Authorization.replace('Bearer ', ''))}`)).status).toBe(401);

    // claim is the one open door: wrong code is a plain 401 from the claim handler, not from the gate
    const bad = await fetch(`${h.srv.url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code: '123456', label: 'x' }) });
    expect(bad.status).toBe(401);
    expect(((await bad.json()) as { error: string }).error).toContain('Invalid or expired');
  });

  it('a device paired on the LAN reaches allowed routes from a remote address, and nothing else', async () => {
    const h = await boot({ lan: true, host: '127.0.0.1' });
    const d = await h.pair();
    h.fake.remote = '10.0.0.7';
    expect((await fetch(`${h.srv.url}/api/host/profile`, { headers: d.dev })).status).toBe(200);
    expect((await fetch(`${h.srv.url}/api/corridor`, { headers: d.dev })).status).toBe(200);
    expect((await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST', headers: d.dev })).status).toBe(403);
    expect((await fetch(`${h.srv.url}/api/host/profile`, { headers: { 'x-onq-device': 'odv_forged' } })).status).toBe(401);

    // pairing from the remote side works end to end (code issued locally, claimed remotely)
    h.fake.remote = undefined;
    const { code } = (await (await fetch(`${h.srv.url}/api/pair/code`, { method: 'POST' })).json()) as { code: string };
    h.fake.remote = '10.0.0.8';
    const claimed = await fetch(`${h.srv.url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code, label: 'remote phone' }) });
    expect(claimed.status).toBe(200);
  });

  it('CORS: a paired device from any origin is served; preflight from another machine is answered; unknown browsers are not', async () => {
    const h = await boot({ lan: true, host: '127.0.0.1' });
    const d = await h.pair();
    const foreign = 'https://glasses.example';
    const ok = await fetch(`${h.srv.url}/api/host/profile`, { headers: { ...d.dev, Origin: foreign } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe(foreign);
    expect(ok.headers.get('access-control-allow-credentials')).toBeNull();
    expect(ok.headers.get('access-control-allow-origin')).not.toBe('*');

    h.fake.remote = '192.168.1.60';
    const pre = await fetch(`${h.srv.url}/api/host/profile`, { method: 'OPTIONS', headers: { Origin: foreign, 'Access-Control-Request-Headers': 'x-onq-device' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-onq-device');
    h.fake.remote = undefined;
    expect((await fetch(`${h.srv.url}/api/health`, { headers: { Origin: foreign } })).status).toBe(403);
  });

  it('a tunnel on 127.0.0.1 is not the owner: forwarding headers or a foreign Host demand a device token', async () => {
    const h = await boot({ publicUrl: 'https://onq-tunnel.example.dev' });
    const viaProxy = await rawRequest(`${h.srv.url}/api/corridor`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    expect(viaProxy.status).toBe(401);
    const viaHost = await rawRequest(`${h.srv.url}/api/corridor`, { headers: { Host: 'abc.trycloudflare.com' } });
    expect(viaHost.status).toBe(401);
    const claimViaProxy = await rawRequest(`${h.srv.url}/api/pair/claim`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.9', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000', label: 'x' }),
    });
    expect(claimViaProxy.status).toBe(401);
    expect(claimViaProxy.text).toContain('Invalid or expired');
    const d = await h.pair();
    const withDevice = await rawRequest(`${h.srv.url}/api/host/profile`, { headers: { 'X-Forwarded-For': '203.0.113.9', 'x-onq-device': d.deviceToken } });
    expect(withDevice.status).toBe(200);
  });
});

describe('voice stream for devices', () => {
  const wsUrl = (base: string) => `${base.replace('http', 'ws')}/api/voice/stream`;
  const connect = (url: string, headers: Record<string, string> = {}) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url, { headers });
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
      ws.once('unexpected-response', () => reject(new Error('rejected')));
    });

  it('a paired device can open the voice socket, a remote caller without a token cannot, and revoke closes it', async () => {
    const h = await boot({ lan: true, host: '127.0.0.1' });
    const d = await h.pair();
    const ws = await connect(wsUrl(h.srv.url), { 'x-onq-device': d.deviceToken });
    const closed = new Promise<void>((r) => ws.once('close', () => r()));

    h.fake.remote = '192.168.1.77';
    await expect(connect(wsUrl(h.srv.url))).rejects.toBeTruthy();
    await expect(connect(`${wsUrl(h.srv.url)}?token=${encodeURIComponent(h.owner.Authorization.replace('Bearer ', ''))}`)).rejects.toBeTruthy();
    h.fake.remote = undefined;

    await fetch(`${h.srv.url}/api/pair/devices/${d.deviceId}`, { method: 'DELETE' });
    await closed;
    await expect(connect(wsUrl(h.srv.url), { 'x-onq-device': d.deviceToken })).rejects.toBeTruthy();
  });
});
