import { describe, expect, it } from 'vitest';
import {
  detectCloudflared,
  detectTailscale,
  findBinary,
  parseTunnelUrl,
  RemoteError,
  TunnelManager,
  type SpawnFn,
  type TunnelDeps,
} from '../src/host/tunnel.js';
import { FakeProc } from './helpers/fakeProc.js';
import { silentDeviceNote, validateRelayUrl } from '../src/host/remote.js';

interface Call {
  cmd: string;
  args: string[];
  opts: Record<string, unknown>;
  proc: FakeProc;
}
function fakeDeps(over: Partial<TunnelDeps> = {}, onSpawn?: (c: Call) => void): { deps: TunnelDeps; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: SpawnFn = (cmd, args, opts) => {
    const proc = new FakeProc();
    const call = { cmd, args, opts: opts as Record<string, unknown>, proc };
    calls.push(call);
    setImmediate(() => {
      if (args.includes('--version') || cmd.endsWith(' --version')) {
        proc.stdout.emit('data', 'cloudflared version 2025.9.1 (built 2025-09-01)\n');
        proc.emit('close', 0);
      } else if (cmd === 'taskkill') proc.emit('close', 0);
      else onSpawn?.(call);
    });
    return proc as never;
  };
  return {
    calls,
    deps: { spawn, platform: 'linux', env: { PATH: '/usr/bin:/bin' }, exists: (p) => p === '/usr/bin/cloudflared', ...over },
  };
}
const isTunnel = (c: Call) => c.args[0] === 'tunnel' || c.cmd.includes(' tunnel --url ');
const tunnelCalls = (calls: Call[]) => calls.filter(isTunnel);

describe('parseTunnelUrl', () => {
  it('finds the quick-tunnel address and ignores api.trycloudflare.com', () => {
    expect(parseTunnelUrl('INF |  https://random-words-here.trycloudflare.com  |')).toBe('https://random-words-here.trycloudflare.com');
    expect(parseTunnelUrl('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": EOF')).toBeNull();
    expect(parseTunnelUrl('https://api.trycloudflare.com/x then https://abc-def.trycloudflare.com')).toBe('https://abc-def.trycloudflare.com');
    expect(parseTunnelUrl('http://abc.trycloudflare.com')).toBeNull();
  });
});

describe('detection (nothing real is run)', () => {
  it('finds cloudflared on PATH and reads its version', async () => {
    const { deps, calls } = fakeDeps();
    expect(await detectCloudflared(deps)).toEqual({ available: true, version: '2025.9.1', bin: '/usr/bin/cloudflared' });
    expect(calls[0].cmd).toBe('/usr/bin/cloudflared');
    expect(calls[0].args).toEqual(['--version']);
  });

  it('reports missing when it is nowhere', async () => {
    const { deps, calls } = fakeDeps({ exists: () => false });
    expect(await detectCloudflared(deps)).toEqual({ available: false, version: null, bin: null });
    expect(calls).toHaveLength(0);
  });

  it('Windows: finds the npm global shim and runs it through a constant, quoted command line', async () => {
    const shim = 'C:\\Users\\me\\AppData\\Roaming\\npm\\cloudflared.cmd';
    const { deps, calls } = fakeDeps({ platform: 'win32', env: { PATH: 'C:\\Windows', APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, exists: (p) => p === shim });
    const info = await detectCloudflared(deps);
    expect(info.bin).toBe(shim);
    expect(calls[0].cmd).toBe(`"${shim}" --version`);
    expect(calls[0].args).toEqual([]);
    expect(calls[0].opts.shell).toBe(true);
  });

  it('Windows: a shim path with shell metacharacters is refused, never run', async () => {
    const evil = 'C:\\bin & calc\\cloudflared.cmd';
    const { deps, calls } = fakeDeps({ platform: 'win32', env: { PATH: 'C:\\bin & calc' }, exists: (p) => p === evil });
    const info = await detectCloudflared(deps);
    expect(info.available).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('findBinary honours PATH order and Windows extensions', () => {
    const exists = (p: string) => p === 'D:\\tools\\tailscale.exe';
    expect(findBinary(['tailscale'], [], { platform: 'win32', env: { Path: 'C:\\x;D:\\tools' }, exists })).toBe('D:\\tools\\tailscale.exe');
  });

  it('Tailscale: reads running state and DNS name from status --json, guidance only', async () => {
    const calls: string[][] = [];
    const spawn: SpawnFn = (_c, args) => {
      calls.push(args);
      const p = new FakeProc();
      setImmediate(() => {
        p.stdout.emit('data', JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'my-pc.tail1234.ts.net.' } }));
        p.emit('close', 0);
      });
      return p as never;
    };
    const info = await detectTailscale({ spawn, platform: 'win32', env: { PATH: '' }, exists: (p) => p === 'C:\\Program Files\\Tailscale\\tailscale.exe' });
    expect(info).toEqual({ available: true, running: true, dnsName: 'my-pc.tail1234.ts.net' });
    expect(calls).toEqual([['status', '--json']]); // never "up", "serve" or "funnel"
  });
});

describe('TunnelManager', () => {
  const startWith = (output: string[], over: Partial<TunnelDeps> = {}, startTimeoutMs = 5000) => {
    const f = fakeDeps(over, (c) => {
      if (isTunnel(c)) for (const line of output) c.proc.stderr.emit('data', line);
    });
    const changes: string[] = [];
    const mgr = new TunnelManager({ deps: f.deps, getPort: () => 8787, onChange: () => changes.push(mgr.status().state), startTimeoutMs });
    return { ...f, mgr, changes };
  };

  it('starts with the exact command, parses the address from stderr and reports on', async () => {
    const { mgr, calls, changes } = startWith(['INF Requesting new quick Tunnel\n', 'INF +--------+\n|  https://calm-river-cat.trycloudflare.com |\n']);
    const st = await mgr.start();
    expect(st).toMatchObject({ state: 'on', url: 'https://calm-river-cat.trycloudflare.com', error: null });
    expect(st.startedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(tunnelCalls(calls)[0].args).toEqual(['tunnel', '--url', 'http://127.0.0.1:8787', '--no-autoupdate']);
    expect(changes).toEqual(['starting', 'on']);
  });

  it('only one tunnel: a second start is refused while one is starting or on', async () => {
    const { mgr, calls } = startWith(['https://one-two.trycloudflare.com']);
    const first = mgr.start();
    await expect(mgr.start()).rejects.toMatchObject({ status: 409 });
    await first;
    await expect(mgr.start()).rejects.toBeInstanceOf(RemoteError);
    expect(tunnelCalls(calls)).toHaveLength(1);
  });

  it('stop kills the process, clears the address and allows a fresh start', async () => {
    const { mgr, calls } = startWith(['https://aa-bb.trycloudflare.com']);
    await mgr.start();
    const st = await mgr.stop();
    expect(st).toEqual({ state: 'off', url: null, startedAt: null, error: null });
    expect(tunnelCalls(calls)[0].proc.killed).toBe(true);
    // late output or exit from the dead process changes nothing
    tunnelCalls(calls)[0].proc.emit('close', 1);
    expect(mgr.status().state).toBe('off');
  });

  it('Windows stop kills the whole process tree with taskkill', async () => {
    const shim = 'C:\\n\\cloudflared.cmd';
    const { mgr, calls } = startWith(['https://aa-bb.trycloudflare.com'], { platform: 'win32', env: { PATH: 'C:\\n' }, exists: (p) => p === shim });
    await mgr.start();
    expect(tunnelCalls(calls)[0].cmd).toBe(`"${shim}" tunnel --url http://127.0.0.1:8787 --no-autoupdate`);
    await mgr.stop();
    expect(calls.some((c) => c.cmd === 'taskkill' && c.args.join(' ') === '/pid 4242 /T /F')).toBe(true);
  });

  it('dispose (server close) stops it', async () => {
    const { mgr, calls } = startWith(['https://aa-bb.trycloudflare.com']);
    await mgr.start();
    mgr.dispose();
    expect(mgr.status().state).toBe('off');
    expect(tunnelCalls(calls)[0].proc.killed).toBe(true);
  });

  it('times out when no address appears, kills the process and says so', async () => {
    const { mgr, calls } = startWith(['INF still thinking\n'], {}, 40);
    const st = await mgr.start();
    expect(st.state).toBe('error');
    expect(st.error).toMatch(/Timed out/);
    expect(tunnelCalls(calls)[0].proc.killed).toBe(true);
  });

  it('an unexpected exit becomes an error with the last output', async () => {
    const f = fakeDeps({}, (c) => {
      if (isTunnel(c)) {
        c.proc.stderr.emit('data', 'ERR cannot be used with a config file\n');
        c.proc.emit('close', 1);
      }
    });
    const mgr = new TunnelManager({ deps: f.deps, getPort: () => 8787 });
    const st = await mgr.start();
    expect(st).toMatchObject({ state: 'error', url: null });
    expect(st.error).toContain('exit 1');
    expect(st.error).toContain('config file');
  });

  it('missing cloudflared refuses to start and leaves the state off', async () => {
    const f = fakeDeps({ exists: () => false });
    const mgr = new TunnelManager({ deps: f.deps, getPort: () => 8787 });
    await expect(mgr.start()).rejects.toMatchObject({ status: 409 });
    expect(mgr.status().state).toBe('off');
  });

  it('a later error after "on" clears the address (so pairing stops using it)', async () => {
    const { mgr, calls } = startWith(['https://aa-bb.trycloudflare.com']);
    await mgr.start();
    tunnelCalls(calls)[0].proc.emit('close', 137);
    expect(mgr.status()).toMatchObject({ state: 'error', url: null });
  });
});

describe('remote helpers', () => {
  it('validateRelayUrl accepts an http(s) origin only', () => {
    expect(validateRelayUrl('https://a-b.trycloudflare.com/')).toBe('https://a-b.trycloudflare.com');
    expect(validateRelayUrl('http://192.168.1.5:8787')).toBe('http://192.168.1.5:8787');
    for (const bad of ['ftp://x.example', 'javascript:alert(1)', 'https://u:p@x.example', 'https://x.example/path', 'https://x.example/?a=1', 'https://x.example/#h', 'nope', 42, undefined]) {
      expect(() => validateRelayUrl(bad as never), String(bad)).toThrow(RemoteError);
    }
  });

  it('silentDeviceNote speaks only when every paired device looks cut off', () => {
    const now = Date.parse('2026-01-01T00:10:00Z');
    const old = '2026-01-01T00:00:00Z';
    const fresh = '2026-01-01T00:09:30Z';
    const devs = [{ id: 'dev_a', label: 'Even G2', lastSeen: old }];
    expect(silentDeviceNote([], new Set(), new Map(), now)).toBeNull();
    expect(silentDeviceNote(devs, new Set(), new Map(), now)).toContain('Even G2');
    expect(silentDeviceNote(devs, new Set(['dev_a']), new Map(), now)).toBeNull(); // open stream
    expect(silentDeviceNote(devs, new Set(), new Map([['dev_a', now - 5_000]]), now)).toBeNull(); // recent poll
    expect(silentDeviceNote([{ ...devs[0], lastSeen: fresh }], new Set(), new Map(), now)).toBeNull();
    expect(silentDeviceNote([...devs, { id: 'dev_b', label: 'Phone', lastSeen: fresh }], new Set(), new Map(), now)).toBeNull();
  });
});
