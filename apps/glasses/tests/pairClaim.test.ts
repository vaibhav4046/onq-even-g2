import { describe, expect, it } from 'vitest';
import { floatToPcm16 } from '../src/browserVoice';
import { resolveHostConfig } from '../src/hostConfig';
import { claimPairing, deviceLabel } from '../src/pairClaim';

describe('claimPairing', () => {
  it('posts the code in the body (never the URL) and returns a valid device token', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ deviceId: 'dev_1', deviceToken: 'odv_abc-123_X' }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await claimPairing(f, 'https://h.example', '123456', 'Even G2 glasses');
    expect(r).toEqual({ ok: true, deviceToken: 'odv_abc-123_X' });
    expect(seen[0].url).toBe('https://h.example/api/pair/claim');
    expect(seen[0].url).not.toContain('123456');
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ code: '123456', label: 'Even G2 glasses' });
    expect(seen[0].init.referrerPolicy).toBe('no-referrer');
  });

  it('a burned, expired or unreachable claim is a clean failure', async () => {
    const burned = (async () => new Response(JSON.stringify({ error: 'Invalid or expired pairing code' }), { status: 401 })) as unknown as typeof fetch;
    expect(await claimPairing(burned, 'https://h.example', '123456', 'x')).toEqual({ ok: false, status: 401, error: 'Invalid or expired pairing code' });
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await claimPairing(down, 'https://h.example', '123456', 'x')).toMatchObject({ ok: false, status: 0 });
    const junk = (async () => new Response(JSON.stringify({ deviceToken: 'not-a-token' }), { status: 200 })) as unknown as typeof fetch;
    expect((await claimPairing(junk, 'https://h.example', '123456', 'x')).ok).toBe(false);
  });

  it('labels the device for the owner list', () => {
    expect(deviceLabel(true, '')).toBe('Even G2 glasses');
    expect(deviceLabel(false, 'Mozilla/5.0 (Linux; Android 14; Quest 3) OculusBrowser')).toBe('Meta glasses');
    expect(deviceLabel(false, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17)')).toBe('iPhone');
    expect(deviceLabel(false, 'Mozilla/5.0 (Windows NT 10.0) Chrome')).toBe('Browser');
  });
});

describe('browser microphone encoding', () => {
  it('converts floats to little-endian 16-bit PCM and clamps', () => {
    const out = floatToPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]), 16000);
    const v = new DataView(out.buffer);
    expect([0, 1, 2, 3, 4, 5].map((i) => v.getInt16(i * 2, true))).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });

  it('downsamples 48 kHz to 16 kHz by averaging (3 to 1)', () => {
    const out = floatToPcm16(new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]), 48000);
    expect(out.byteLength).toBe(4);
    const v = new DataView(out.buffer);
    expect(v.getInt16(0, true)).toBe(Math.round(0.3 * 0x7fff));
    expect(v.getInt16(2, true)).toBe(Math.round(-0.6 * 0x8000));
  });
});

describe('served by the host at /g/ (any phone or glasses)', () => {
  const DEFAULT = 'http://127.0.0.1:8787';
  const none = { host: null, device: null };
  const page = { origin: 'https://calm.trycloudflare.com', pathname: '/g/' };

  it("uses the page's own origin as the API base, ignoring a stored host from an old packaged build", () => {
    const cfg = resolveHostConfig({ search: '', stored: { host: 'https://old.example.dev', device: 'odv_kept' }, defaultBase: DEFAULT, page });
    expect(cfg).toEqual({ base: 'https://calm.trycloudflare.com', deviceToken: 'odv_kept', fromQuery: false, pairCode: null, servedByHost: true });
  });

  it('?host= still overrides; a page that is not under /g/ keeps the old behaviour', () => {
    expect(resolveHostConfig({ search: '?host=http://10.0.0.2:8787', stored: none, defaultBase: DEFAULT, page }).base).toBe('http://10.0.0.2:8787');
    const other = resolveHostConfig({ search: '', stored: none, defaultBase: DEFAULT, page: { origin: 'http://localhost:5174', pathname: '/' } });
    expect(other).toMatchObject({ base: DEFAULT, servedByHost: false });
  });

  it('reads ?pair= (six digits only) and asks the caller to clean the address bar', () => {
    expect(resolveHostConfig({ search: '?pair=123456', stored: none, defaultBase: DEFAULT, page })).toMatchObject({ pairCode: '123456', fromQuery: true });
    for (const bad of ['12345', '1234567', 'abcdef', '12 456', '']) {
      expect(resolveHostConfig({ search: `?pair=${bad}`, stored: none, defaultBase: DEFAULT, page }).pairCode, bad).toBeNull();
    }
  });

  it('a new tunnel address with a stored pairing keeps the token (only the origin changes)', () => {
    const next = { origin: 'https://new-name.trycloudflare.com', pathname: '/g/' };
    const cfg = resolveHostConfig({ search: '', stored: { host: null, device: 'odv_kept' }, defaultBase: DEFAULT, page: next });
    expect(cfg).toMatchObject({ base: 'https://new-name.trycloudflare.com', deviceToken: 'odv_kept' });
  });
});
