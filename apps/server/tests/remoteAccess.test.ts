import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnQServer } from '../src/server.js';
import type { SpawnFn } from '../src/host/tunnel.js';
import { FakeProc } from './helpers/fakeProc.js';

const HERMETIC_ENV = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'NOTION_TOKEN', 'NOTION_DATABASE_ID', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'ONQ_LAN', 'ONQ_PUBLIC_URL'];
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

const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (closers.length) await (closers.pop() as () => Promise<void> | void)();
});

const TUNNEL_HDRS = { 'X-Forwarded-For': '203.0.113.9', Host: 'calm-river-cat.trycloudflare.com' };
const TUNNEL_URL = 'https://calm-river-cat.trycloudflare.com';

interface Raw {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  buf: Buffer;
}
/** http.request lets a test set Host and send odd paths untouched (fetch normalises both). */
function raw(base: string, p: string, o: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request({ host: u.hostname, port: u.port, path: p, method: o.method ?? 'GET', headers: o.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text: buf.toString('utf8'), buf });
      });
    });
    req.on('error', reject);
    req.end(o.body);
  });
}
const json = (r: Raw) => JSON.parse(r.text) as Record<string, any>;

interface Rig {
  calls: Array<{ cmd: string; args: string[]; env?: NodeJS.ProcessEnv; proc: FakeProc }>;
  tunnelUrl: string | null;
  packExit: number;
  tailscale: boolean;
}

function mkRepo(withDist = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-repo-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'pack-ehpk.mjs'), '// fake');
  if (withDist) {
    fs.mkdirSync(path.join(root, 'apps', 'glasses', 'dist', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps', 'glasses', 'dist', 'index.html'), '<!doctype html><title>OnQ client</title><script type="module" src="./assets/app.js"></script>');
    fs.writeFileSync(path.join(root, 'apps', 'glasses', 'dist', 'assets', 'app.js'), 'console.log("client")');
  }
  fs.writeFileSync(path.join(root, 'secret.txt'), 'TOP-SECRET');
  closers.push(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

async function boot(o: { dist?: boolean; rig?: Partial<Rig>; extra?: Parameters<typeof createOnQServer>[0]; dataDir?: string; repoRoot?: string } = {}) {
  const dir = o.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'onq-remote-'));
  const repoRoot = o.repoRoot ?? mkRepo(o.dist !== false);
  const rig: Rig = { calls: [], tunnelUrl: TUNNEL_URL, packExit: 0, tailscale: false, ...o.rig };
  const spawn: SpawnFn = (cmd, args, opts) => {
    const proc = new FakeProc();
    rig.calls.push({ cmd, args, env: opts.env, proc });
    setImmediate(() => {
      if (args.includes('--version')) {
        proc.stdout.emit('data', 'cloudflared version 2025.9.1\n');
        proc.emit('close', 0);
      } else if (args[0] === 'status') {
        proc.stdout.emit('data', JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'pc.tail9.ts.net.' } }));
        proc.emit('close', 0);
      } else if (cmd === 'taskkill') proc.emit('close', 0);
      else if (args[0] === 'tunnel') {
        if (rig.tunnelUrl) proc.stderr.emit('data', `INF |  ${rig.tunnelUrl}  |\n`);
      } else if (cmd === '/fake/node') {
        if (rig.packExit === 0) {
          const out = opts.env!.ONQ_PACK_OUT!;
          fs.writeFileSync(out, `EHPK:${opts.env!.ONQ_RELAY_URL}`);
          fs.writeFileSync(`${out}.manifest.json`, JSON.stringify({ permissions: [{ name: 'network', whitelist: ['http://127.0.0.1:8787', opts.env!.ONQ_RELAY_URL] }] }));
        } else proc.stderr.emit('data', 'evenhub-cli exploded');
        proc.emit('close', rig.packExit);
      }
    });
    return proc as never;
  };
  const srv = await createOnQServer({
    port: 0,
    host: '127.0.0.1',
    dataDir: dir,
    allowTestFaultControls: true,
    remoteDeps: {
      spawn,
      platform: 'linux',
      env: { PATH: '/usr/bin', OPENROUTER_API_KEY: 'sk-or-should-not-leak-0000000000', ...(o.rig?.tailscale ? {} : {}) },
      exists: (p) => p === '/usr/bin/cloudflared' || (rig.tailscale && p === '/usr/bin/tailscale'),
      repoRoot,
      nodeBin: '/fake/node',
      tunnelStartTimeoutMs: 400,
    },
    ...o.extra,
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await srv.close();
  };
  closers.push(async () => {
    await close();
    if (!o.dataDir) fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = srv.url;
  const get = (p: string, headers: Record<string, string> = {}) => raw(base, p, { headers });
  const post = (p: string, body: unknown = {}, headers: Record<string, string> = {}) =>
    raw(base, p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const until = async (pred: () => Promise<boolean>, ms = 3000) => {
    const t0 = Date.now();
    while (!(await pred())) {
      if (Date.now() - t0 > ms) throw new Error('timed out waiting');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const status = async () => json(await get('/api/remote/status'));
  const startTunnel = async () => {
    const r = await post('/api/remote/start', { provider: 'cloudflared', confirm: true });
    expect(r.status).toBe(202);
    await until(async () => (await status()).tunnel.state !== 'starting');
    return r;
  };
  /** Pairs a device the way glasses do: owner gets a code locally, the device claims it (here through the tunnel's headers). */
  const pairViaTunnel = async (label = 'Even G2') => {
    const issued = json(await post('/api/pair/code'));
    const claim = await post('/api/pair/claim', { code: issued.code, label }, TUNNEL_HDRS);
    return { issued, claim, token: (json(claim).deviceToken as string | undefined) ?? '' };
  };
  return { srv, dir, repoRoot, rig, base, get, post, status, startTunnel, pairViaTunnel, until, close };
}

describe('GET /api/remote/status', () => {
  it('reports cloudflared, tailscale guidance, tunnel state, LAN and the exposure warning', async () => {
    const h = await boot({ rig: { tailscale: true } });
    const r = await h.get('/api/remote/status');
    expect(r.status).toBe(200);
    const s = json(r);
    expect(s.cloudflared).toEqual({ available: true, version: '2025.9.1' });
    expect(s.tailscale).toMatchObject({ available: true, running: true, dnsName: 'pc.tail9.ts.net' });
    expect(s.tailscale.steps.join('\n')).toContain(`tailscale serve --bg ${h.srv.port}`);
    expect(s.tunnel).toEqual({ state: 'off', url: null, startedAt: null, error: null });
    expect(s.lanEnabled).toBe(false);
    expect(s.exposureWarning).toMatch(/reachable from the internet/);
    expect(s.glassesClient.built).toBe(true);
    // it only looked: no tunnel, no tailscale up/serve
    expect(h.rig.calls.some((c) => c.args[0] === 'tunnel')).toBe(false);
    expect(h.rig.calls.filter((c) => c.args[0] === 'status').every((c) => c.args.join(' ') === 'status --json')).toBe(true);
  });

  it('is owner-only: a browser without a session gets 401, a paired device 403, a tunnel request without a token 401', async () => {
    const h = await boot();
    expect((await h.get('/api/remote/status', { Origin: 'http://127.0.0.1:5173' })).status).toBe(401);
    const p = await h.pairViaTunnel();
    expect(p.claim.status).toBe(200);
    expect((await h.get('/api/remote/status', { 'x-onq-device': p.token })).status).toBe(403);
    expect((await h.get('/api/remote/status', TUNNEL_HDRS)).status).toBe(401);
  });
});

describe('start / stop', () => {
  it('start needs the right provider and confirm:true, and always carries the plain exposure notice', async () => {
    const h = await boot();
    const wrong = await h.post('/api/remote/start', { provider: 'ngrok', confirm: true });
    expect(wrong.status).toBe(400);
    expect(json(wrong).notice).toMatch(/reachable from the internet/);
    const noConfirm = await h.post('/api/remote/start', { provider: 'cloudflared' });
    expect(noConfirm.status).toBe(400);
    expect(json(noConfirm).notice).toMatch(/device token/);
    const falsy = await h.post('/api/remote/start', { provider: 'cloudflared', confirm: 'true' });
    expect(falsy.status).toBe(400);
    expect(h.rig.calls.some((c) => c.args[0] === 'tunnel')).toBe(false);
  });

  it('start -> on with the address, pairing uses it, the revision moves, stop returns to loopback', async () => {
    const h = await boot();
    const prof0 = (await fetch(`${h.base}/api/host/profile`, { headers: await ownerHeaders(h.base) }).then((r) => r.json())) as { revision: number };

    const started = await h.post('/api/remote/start', { provider: 'cloudflared', confirm: true });
    expect(started.status).toBe(202);
    expect(json(started).notice).toMatch(/reachable from the internet/);
    expect(json(started).tunnel.state).toBe('starting');
    await h.until(async () => (await h.status()).tunnel.state === 'on');
    const st = await h.status();
    expect(st.tunnel.url).toBe(TUNNEL_URL);
    expect(h.rig.calls.find((c) => c.args[0] === 'tunnel')!.args).toEqual(['tunnel', '--url', `http://127.0.0.1:${h.srv.port}`, '--no-autoupdate']);

    const code = json(await h.post('/api/pair/code'));
    expect(code.url).toBe(TUNNEL_URL);
    expect(code.link).toBe(`${TUNNEL_URL}/g/?pair=${code.code}`);
    const prof1 = (await fetch(`${h.base}/api/host/profile`, { headers: await ownerHeaders(h.base) }).then((r) => r.json())) as { revision: number };
    expect(prof1.revision).toBeGreaterThan(prof0.revision);

    // only one tunnel
    expect((await h.post('/api/remote/start', { provider: 'cloudflared', confirm: true })).status).toBe(409);

    const stopped = await h.post('/api/remote/stop');
    expect(stopped.status).toBe(200);
    expect(json(stopped).tunnel).toEqual({ state: 'off', url: null, startedAt: null, error: null });
    expect(h.rig.calls.find((c) => c.args[0] === 'tunnel')!.proc.killed).toBe(true);
    const after = json(await h.post('/api/pair/code'));
    expect(after.url).toBe(`http://127.0.0.1:${h.srv.port}`);
    expect(after.link).toBe(`http://127.0.0.1:${h.srv.port}/g/?pair=${after.code}`);
  });

  it('missing cloudflared is a 409 with the install hint and nothing is spawned', async () => {
    const h = await boot();
    h.rig.calls.length = 0;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-nocf-'));
    closers.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const srv = await createOnQServer({ port: 0, host: '127.0.0.1', dataDir: dir, remoteDeps: { spawn: (() => { throw new Error('must not spawn'); }) as never, platform: 'linux', env: { PATH: '/nope' }, exists: () => false } });
    closers.push(() => srv.close());
    const r = await raw(srv.url, '/api/remote/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'cloudflared', confirm: true }) });
    expect(r.status).toBe(409);
    expect(json(r).error).toMatch(/not found/);
    expect(json(r).notice).toBeTruthy();
  });

  it('a failed tunnel shows state error with the reason, and pairing does not use a dead address', async () => {
    const h = await boot({ rig: { tunnelUrl: null } });
    await h.post('/api/remote/start', { provider: 'cloudflared', confirm: true });
    await h.until(async () => (await h.status()).tunnel.state === 'error');
    const st = await h.status();
    expect(st.tunnel.error).toMatch(/Timed out/);
    expect(st.tunnel.url).toBeNull();
    expect(json(await h.post('/api/pair/code')).url).toBe(`http://127.0.0.1:${h.srv.port}`);
  });

  it('closing the server stops the tunnel', async () => {
    const h = await boot();
    await h.startTunnel();
    await h.close();
    expect(h.rig.calls.find((c) => c.args[0] === 'tunnel')!.proc.killed).toBe(true);
  });
});

async function ownerHeaders(base: string): Promise<Record<string, string>> {
  const { sessionToken } = (await (await fetch(`${base}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
  return { Authorization: `Bearer ${sessionToken}` };
}

describe('through the tunnel: the token gate holds', () => {
  it('an unauthenticated tunnel request is refused; a claimed device token works; owner endpoints stay closed to it', async () => {
    const h = await boot();
    await h.startTunnel();

    // no token: refused everywhere except the public doors
    expect((await h.get('/api/corridor', TUNNEL_HDRS)).status).toBe(401);
    expect((await h.post('/api/pair/code', {}, TUNNEL_HDRS)).status).toBe(401);
    expect((await h.get('/api/remote/status', TUNNEL_HDRS)).status).toBe(401);
    expect((await h.post('/api/remote/start', { provider: 'cloudflared', confirm: true }, TUNNEL_HDRS)).status).toBe(401);
    expect((await h.post('/api/remote/pack', {}, TUNNEL_HDRS)).status).toBe(401);
    expect((await h.get('/api/poll?wait=0', TUNNEL_HDRS)).status).toBe(401);
    // a forged token too
    expect((await h.get('/api/corridor', { ...TUNNEL_HDRS, 'x-onq-device': 'odv_forged' })).status).toBe(401);

    // public doors: bare health, the static client, and claiming a code
    const health = await h.get('/api/health', TUNNEL_HDRS);
    expect(health.status).toBe(200);
    expect(json(health)).toEqual({ ok: true, brand: 'OnQ' });
    expect((await h.get('/g/', TUNNEL_HDRS)).status).toBe(200);
    expect((await h.get('/g/assets/app.js', TUNNEL_HDRS)).status).toBe(200);
    expect((await h.post('/api/pair/claim', { code: '000000' }, TUNNEL_HDRS)).status).toBe(401); // reachable, wrong code

    // claim with the real code through the tunnel, then the token works on allowed routes only
    const p = await h.pairViaTunnel('Meta glasses');
    expect(p.claim.status).toBe(200);
    expect(p.token).toMatch(/^odv_/);
    const dev = { ...TUNNEL_HDRS, 'x-onq-device': p.token };
    expect((await h.get('/api/corridor', dev)).status).toBe(200);
    expect((await h.get('/api/host/profile', dev)).status).toBe(200);
    expect((await h.get('/api/remote/status', dev)).status).toBe(403);
    expect((await h.post('/api/remote/start', { provider: 'cloudflared', confirm: true }, dev)).status).toBe(403);
    expect((await h.post('/api/remote/stop', {}, dev)).status).toBe(403);
    expect((await h.post('/api/remote/pack', {}, dev)).status).toBe(403);
    expect((await h.post('/api/pair/code', {}, dev)).status).toBe(403);
    // full health only for the owner machine or a paired device
    expect(json(await h.get('/api/health', dev)).version).toBeTruthy();
  });

  it('the kill switch locks a paired device even through the tunnel', async () => {
    const h = await boot();
    await h.startTunnel();
    const p = await h.pairViaTunnel();
    const dev = { ...TUNNEL_HDRS, 'x-onq-device': p.token };
    expect((await h.get('/api/corridor', dev)).status).toBe(200);
    const ks = await h.post('/api/os/killswitch', { paused: true }, await ownerHeaders(h.base));
    expect(ks.status).toBe(200);
    expect((await h.get('/api/corridor', dev)).status).toBe(423);
    expect((await h.get('/api/poll?wait=0', dev)).status).toBe(423);
  });
});

describe('one link pairs: ?pair= auto-claim is single use, short lived, never logged', () => {
  it('the link code claims once; replay and stale codes are refused; the code never reaches logs or access output', async () => {
    const clock = { t: Date.parse('2026-06-01T12:00:00Z') };
    const h = await boot({ extra: { nowFn: () => clock.t } });
    await h.startTunnel();
    const out: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
    vi.spyOn(process.stdout, 'write').mockImplementation(((c: unknown) => (out.push(String(c)), true)) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(((c: unknown) => (out.push(String(c)), true)) as never);

    const issued = json(await h.post('/api/pair/code'));
    const link = new URL(issued.link);
    const code = link.searchParams.get('pair')!;
    expect(code).toMatch(/^\d{6}$/);
    // the device opens the link: the page is served (no secrets in it), no caching, no Referer
    const page = await h.get(`/g/?pair=${code}`, TUNNEL_HDRS);
    expect(page.status).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.text).not.toContain(code);
    // ... then claims it from a script (body, not URL)
    const first = await h.post('/api/pair/claim', { code, label: 'Browser' }, TUNNEL_HDRS);
    expect(first.status).toBe(200);
    // replay: burned
    const replay = await h.post('/api/pair/claim', { code, label: 'Thief' }, TUNNEL_HDRS);
    expect(replay.status).toBe(401);
    expect(json(replay).deviceToken).toBeUndefined();

    // a fresh code that is not used within 5 minutes expires
    const stale = json(await h.post('/api/pair/code'));
    clock.t += 5 * 60_000 + 1000;
    const late = await h.post('/api/pair/claim', { code: stale.code, label: 'Late' }, TUNNEL_HDRS);
    expect(late.status).toBe(401);
    expect(json(late).error).toMatch(/expired/i);

    expect(out.join('\n')).not.toContain(code);
    expect(out.join('\n')).not.toContain(stale.code);
    expect(out.join('\n')).not.toContain(first.text.match(/odv_[\w-]+/)![0]);
  });
});

describe('GET /g/ (the host serves the client)', () => {
  it('serves index and assets under any Host header with safe headers, and redirects /g keeping the query', async () => {
    const h = await boot();
    for (const host of ['onq.example.net', 'calm-river-cat.trycloudflare.com', '192.168.1.20:8787']) {
      const r = await h.get('/g/', { Host: host });
      expect(r.status, host).toBe(200);
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.text).toContain('OnQ client');
      expect(r.headers['content-security-policy']).toContain("connect-src 'self'");
      expect(r.headers['x-content-type-options']).toBe('nosniff');
    }
    const js = await h.get('/g/assets/app.js', { Host: 'onq.example.net' });
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toContain('text/javascript');
    expect(js.text).toBe('console.log("client")');
    const redirect = await h.get('/g?pair=123456', { Host: 'onq.example.net' });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.location).toBe('/g/?pair=123456');
    expect((await h.get('/g/', { Host: 'onq.example.net', Origin: 'https://evil.example' })).status).toBe(200);
    expect((await h.get('/g/nope.js')).status).toBe(404);
    expect((await raw(h.base, '/g/', { method: 'POST', headers: TUNNEL_HDRS })).status).toBe(401); // static is GET/HEAD only
  });

  it('path traversal is refused', async () => {
    const h = await boot();
    for (const p of ['/g/../secret.txt', '/g/%2e%2e/secret.txt', '/g/..%2fsecret.txt', '/g/assets/..%2f..%2f..%2f..%2fsecret.txt', '/g/..%5csecret.txt', '/g/assets/%00.js', '/g//etc/passwd', '/g/assets/../../../../../../secret.txt']) {
      const r = await raw(h.base, p, { headers: TUNNEL_HDRS });
      // either normalised away from /g/ (then the token gate answers 401) or rejected by the static handler (404): never served
      expect([401, 404], p).toContain(r.status);
      expect(r.text, p).not.toContain('TOP-SECRET');
    }
  });

  it('says plainly when the client is not built', async () => {
    const h = await boot({ dist: false });
    const r = await h.get('/g/');
    expect(r.status).toBe(404);
    expect(r.text).toMatch(/npm run build/);
  });
});

describe('POST /api/remote/pack and the package download', () => {
  it('validates the address, refuses without a build, and never builds silently', async () => {
    const h = await boot();
    for (const bad of ['ftp://x.example', 'javascript:alert(1)', 'https://u:p@x.example', 'https://x.example/a/b', 'https://x.example/?q=1', 'not a url']) {
      expect((await h.post('/api/remote/pack', { relayUrl: bad })).status, bad).toBe(400);
    }
    expect((await h.post('/api/remote/pack', {})).status).toBe(400); // no tunnel, no relayUrl
    expect(h.rig.calls.some((c) => c.cmd === '/fake/node')).toBe(false);

    const noDist = await boot({ dist: false });
    const r = await noDist.post('/api/remote/pack', { relayUrl: 'https://my-relay.example.com' });
    expect(r.status).toBe(409);
    expect(json(r).error).toMatch(/npm run build first/);
    expect(noDist.rig.calls.some((c) => c.cmd === '/fake/node')).toBe(false);
  });

  it('only works from the repo checkout', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-norepo-'));
    closers.push(() => fs.rmSync(root, { recursive: true, force: true }));
    const h = await boot({ repoRoot: root });
    const r = await h.post('/api/remote/pack', { relayUrl: 'https://my-relay.example.com' });
    expect(r.status).toBe(409);
    expect(json(r).error).toMatch(/repo/);
  });

  it('builds with constant args and env only, stores under dataDir/packages, returns hash and whitelist, and streams the download', async () => {
    const h = await boot();
    const r = await h.post('/api/remote/pack', { relayUrl: 'https://my-relay.example.com/' });
    expect(r.status).toBe(200);
    const out = json(r);
    expect(out.relayOrigin).toBe('https://my-relay.example.com');
    expect(out.file).toMatch(/^onq-[0-9a-f]{16}\.ehpk$/);
    expect(out.path).toBe(path.join(h.dir, 'packages', out.file));
    const disk = fs.readFileSync(out.path);
    expect(out.bytes).toBe(disk.byteLength);
    expect(out.sha256).toBe(crypto.createHash('sha256').update(disk).digest('hex'));
    expect(out.file).toBe(`onq-${out.sha256.slice(0, 16)}.ehpk`);
    expect(out.whitelist).toEqual(['http://127.0.0.1:8787', 'https://my-relay.example.com']);
    expect(out.downloadUrl).toBe(`/api/remote/package/${out.file}`);

    const call = h.rig.calls.find((c) => c.cmd === '/fake/node')!;
    expect(call.args).toEqual([path.join(h.repoRoot, 'scripts', 'pack-ehpk.mjs')]); // constant args
    expect(call.env!.ONQ_RELAY_URL).toBe('https://my-relay.example.com');
    expect(call.env!.OPENROUTER_API_KEY).toBeUndefined(); // no secrets handed to the child
    expect(fs.readdirSync(path.join(h.dir, 'packages')).filter((f) => f.startsWith('.pending'))).toEqual([]);

    const dl = await h.get(out.downloadUrl);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain(`filename="${out.file}"`);
    expect(dl.buf.equals(disk)).toBe(true);
    // a tunnel caller without a token cannot download it; neither can a paired device
    expect((await h.get(out.downloadUrl, TUNNEL_HDRS)).status).toBe(401);
    const p = await h.pairViaTunnel();
    expect((await h.get(out.downloadUrl, { 'x-onq-device': p.token })).status).toBe(403);
  });

  it('uses the live tunnel address when no relayUrl is given', async () => {
    const h = await boot();
    await h.startTunnel();
    const r = json(await h.post('/api/remote/pack', {}));
    expect(r.relayOrigin).toBe(TUNNEL_URL);
    expect(r.whitelist).toContain(TUNNEL_URL);
  });

  it('a failing pack script is a 500 with the tail of its output, and leaves no half-written package', async () => {
    const h = await boot({ rig: { packExit: 1 } });
    const r = await h.post('/api/remote/pack', { relayUrl: 'https://my-relay.example.com' });
    expect(r.status).toBe(500);
    expect(json(r).error).toContain('evenhub-cli exploded');
    expect(fs.readdirSync(path.join(h.dir, 'packages'))).toEqual([]);
  });

  it('download refuses traversal, odd names and unknown files', async () => {
    const h = await boot();
    const made = json(await h.post('/api/remote/pack', { relayUrl: 'https://my-relay.example.com' }));
    fs.writeFileSync(path.join(h.dir, 'host-copy.json'), 'x');
    const bad = [
      '/api/remote/package/..%2fhost.json',
      '/api/remote/package/..%5chost.json',
      '/api/remote/package/../host.json',
      '/api/remote/package/%2e%2e%2f%2e%2e%2fsecret.txt',
      `/api/remote/package/${made.file}%00.txt`,
      '/api/remote/package/onq-0000000000000000.ehpk',
      `/api/remote/package/${made.file.toUpperCase()}`,
      `/api/remote/package/${made.file}/x`,
      '/api/remote/package/onq-../../host.ehpk',
      '/api/remote/package/',
    ];
    for (const p of bad) {
      const r = await h.get(p);
      expect([400, 404], p).toContain(r.status);
      expect(r.text, p).not.toContain('"revision"');
    }
    expect((await h.get(`/api/remote/package/${made.file}`)).status).toBe(200);
  });
});

describe('Allow my Wi-Fi (saved, applies at the next start)', () => {
  it('needs confirm, is saved, reported as pending, and read at boot', async () => {
    const h = await boot();
    expect((await h.post('/api/remote/lan', { enabled: true })).status).toBe(400);
    expect((await h.post('/api/remote/lan', { enabled: 'yes' })).status).toBe(400);
    const r = json(await h.post('/api/remote/lan', { enabled: true, confirm: true }));
    expect(r).toMatchObject({ lanEnabled: false, lanPending: true, restartRequired: true });
    expect(json(await h.get('/api/remote/status'))).toMatchObject({ lanEnabled: false, lanPending: true });
    const h2 = await boot({ dataDir: h.dir, repoRoot: h.repoRoot });
    expect(json(await h2.get('/api/remote/status'))).toMatchObject({ lanEnabled: true, lanPending: true });
    const off = json(await h2.post('/api/remote/lan', { enabled: false }));
    expect(off).toMatchObject({ lanEnabled: true, lanPending: false, restartRequired: true });
  });
});

describe('GET /api/poll (long-poll fallback)', () => {
  it('returns at once when the revision moved, times out when nothing happens, wakes on a change', async () => {
    const h = await boot();
    const auth = await ownerHeaders(h.base);
    const rev = ((await (await fetch(`${h.base}/api/host/profile`, { headers: auth })).json()) as { revision: number }).revision;

    const behind = await h.get(`/api/poll?since=${rev - 1}&wait=5`, auth);
    expect(json(behind)).toMatchObject({ revision: rev, changed: true, timedOut: false });

    const t0 = Date.now();
    const quiet = await h.get(`/api/poll?since=${rev}&wait=0.3`, auth);
    expect(json(quiet)).toMatchObject({ revision: rev, changed: false, timedOut: true, event: null });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);

    const waiting = h.get(`/api/poll?since=${rev}&wait=10`, auth);
    await new Promise((r) => setTimeout(r, 80));
    await h.pairViaTunnel('second device'); // pairing changes the device list -> host revision moves
    const woke = json(await waiting);
    expect(woke.changed).toBe(true);
    // the very next poll from the old revision answers at once with the new one
    const next = json(await h.get(`/api/poll?since=${rev}&wait=5`, auth));
    expect(next).toMatchObject({ changed: true, timedOut: false });
    expect(next.revision).toBeGreaterThan(rev);
  });

  it('a paired device can poll through the tunnel; no token is refused; wait is capped; server close releases waiters', async () => {
    const h = await boot();
    await h.startTunnel();
    const p = await h.pairViaTunnel();
    const dev = { ...TUNNEL_HDRS, 'x-onq-device': p.token };
    const r = await h.get('/api/poll?wait=0', dev);
    expect(r.status).toBe(200);
    expect(json(r).timedOut).toBe(true);
    expect((await h.get('/api/poll?wait=0', TUNNEL_HDRS)).status).toBe(401);

    const pending = h.get('/api/poll?wait=999', dev); // capped at 25 s, released by close
    await new Promise((res) => setTimeout(res, 50));
    const t0 = Date.now();
    await h.close();
    const done = await pending;
    expect(done.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
