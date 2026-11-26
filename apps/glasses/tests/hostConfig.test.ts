import { describe, expect, it } from 'vitest';
import { authHeaders, normalizeDeviceToken, normalizeHostUrl, resolveHostConfig } from '../src/hostConfig';

const DEFAULT = 'http://127.0.0.1:8787';
const none = { host: null, device: null };

describe('glasses host config', () => {
  it('default path is loopback with no device token (simulator unchanged)', () => {
    expect(resolveHostConfig({ search: '', stored: none, defaultBase: DEFAULT })).toMatchObject({ base: DEFAULT, deviceToken: null, fromQuery: false });
    expect(authHeaders(null, 'oc_demo')).toEqual({ Authorization: 'Bearer oc_demo' });
  });

  it('?host and ?device pair the build and ask the caller to remember them', () => {
    const cfg = resolveHostConfig({ search: '?host=http://192.168.0.5:8787/&device=odv_abc-DEF_123', stored: none, defaultBase: DEFAULT });
    expect(cfg).toMatchObject({ base: 'http://192.168.0.5:8787', deviceToken: 'odv_abc-DEF_123', fromQuery: true });
    expect(authHeaders(cfg.deviceToken, 'odv_abc-DEF_123')).toEqual({ 'x-onq-device': 'odv_abc-DEF_123' });
  });

  it('falls back to what was stored, and the query wins over storage', () => {
    const stored = { host: 'https://tunnel.example.dev', device: 'odv_stored' };
    expect(resolveHostConfig({ search: '', stored, defaultBase: DEFAULT })).toMatchObject({ base: 'https://tunnel.example.dev', deviceToken: 'odv_stored', fromQuery: false });
    expect(resolveHostConfig({ search: '?device=odv_new', stored, defaultBase: DEFAULT })).toMatchObject({ base: 'https://tunnel.example.dev', deviceToken: 'odv_new', fromQuery: true });
    expect(resolveHostConfig({ search: '?host=http://10.0.0.2:1', stored, defaultBase: DEFAULT }).base).toBe('http://10.0.0.2:1');
  });

  it('rejects hostile or malformed values and keeps the default', () => {
    expect(normalizeHostUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeHostUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeHostUrl('http://user:pw@evil.example')).toBeNull();
    expect(normalizeHostUrl('not a url')).toBeNull();
    expect(normalizeHostUrl('http://192.168.0.5:8787/some/path?x=1#y')).toBe('http://192.168.0.5:8787');
    expect(normalizeDeviceToken('oc_session_token')).toBeNull();
    expect(normalizeDeviceToken('odv_has space')).toBeNull();
    expect(normalizeDeviceToken(`odv_${'a'.repeat(300)}`)).toBeNull();
    expect(resolveHostConfig({ search: '?host=javascript:x&device=bad', stored: none, defaultBase: DEFAULT })).toMatchObject({ base: DEFAULT, deviceToken: null, fromQuery: false });
  });
});
