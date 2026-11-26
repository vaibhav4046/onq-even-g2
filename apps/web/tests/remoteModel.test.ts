import { describe, expect, it } from 'vitest';
import { encodeQr } from '../src/components/connect/qr';
import { classifyLink, fitsQr, normalizeRemoteStatus, primaryAction, QR_MAX_BYTES } from '../src/components/connect/remoteModel';

describe('normalizeRemoteStatus', () => {
  it('reads the server shape and drops the address unless the tunnel is on', () => {
    const v = normalizeRemoteStatus({
      cloudflared: { available: true, version: '2025.9.1' },
      tailscale: { available: true, running: false, dnsName: null, steps: ['a', 3, 'b'] },
      tunnel: { state: 'starting', url: 'https://x.trycloudflare.com', startedAt: null, error: null },
      lanEnabled: false,
      lanPending: true,
      exposureWarning: 'plain notice',
      glassesClient: { built: true, path: '/g/' },
    });
    expect(v).toMatchObject({ cloudflared: { available: true, version: '2025.9.1' }, lanPending: true, exposureWarning: 'plain notice', clientBuilt: true });
    expect(v?.tunnel).toEqual({ state: 'starting', url: null, startedAt: null, error: null });
    expect(v?.tailscale.steps).toEqual(['a', 'b']);
  });

  it('is tolerant of junk and falls back to a safe notice', () => {
    expect(normalizeRemoteStatus(null)).toBeNull();
    expect(normalizeRemoteStatus({})).toBeNull();
    const v = normalizeRemoteStatus({ tunnel: { state: 'weird' } });
    expect(v?.tunnel.state).toBe('off');
    expect(v?.exposureWarning).toMatch(/reachable from the internet/);
    expect(v?.cloudflared.available).toBe(false);
  });
});

describe('classifyLink', () => {
  it('tells tunnel, Wi-Fi and this-computer links apart', () => {
    expect(classifyLink('https://a-b.trycloudflare.com/g/?pair=123456', 'https://a-b.trycloudflare.com')).toBe('anywhere');
    expect(classifyLink('https://my.domain.example/g/?pair=123456', null)).toBe('anywhere');
    expect(classifyLink('http://192.168.1.20:8787/g/?pair=123456', null)).toBe('wifi');
    expect(classifyLink('http://127.0.0.1:8787/g/?pair=123456', null)).toBe('this-computer');
    expect(classifyLink('http://localhost:8787/g/', null)).toBe('this-computer');
    expect(classifyLink('garbage', null)).toBe('this-computer');
  });
});

describe('primaryAction: one primary button at a time', () => {
  it('wait while busy or starting, make a QR when there is none, refresh when expired, else nothing', () => {
    expect(primaryAction({ busy: true, tunnel: 'off', hasCode: false, expired: false })).toBe('busy');
    expect(primaryAction({ busy: false, tunnel: 'starting', hasCode: true, expired: false })).toBe('busy');
    expect(primaryAction({ busy: false, tunnel: 'off', hasCode: false, expired: false })).toBe('show');
    expect(primaryAction({ busy: false, tunnel: 'on', hasCode: true, expired: true })).toBe('refresh');
    expect(primaryAction({ busy: false, tunnel: 'on', hasCode: true, expired: false })).toBe('none');
  });
});

describe('QR limit', () => {
  it('a real quick-tunnel pairing link fits the encoder; a very long one is text only', () => {
    const link = 'https://some-quite-long-random-words-here.trycloudflare.com/g/?pair=123456';
    expect(fitsQr(link)).toBe(true);
    expect(() => encodeQr(link)).not.toThrow();
    const long = `https://${'a'.repeat(120)}.example.com/g/?pair=123456`;
    expect(fitsQr(long)).toBe(false);
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(QR_MAX_BYTES);
    expect(() => encodeQr(long)).toThrow();
  });
});
