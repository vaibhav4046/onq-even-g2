import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  formatCountdown,
  groupCode,
  harnessName,
  isLoopbackUrl,
  normalizeDevices,
  normalizeOutbox,
  normalizeProfile,
  normalizeSources,
  routeLabel,
  sourceWarnings,
  sourcesFromProfile,
  speedLabel,
} from '../src/components/connect/hostModel';

describe('routeLabel', () => {
  it('names each effective route in plain words', () => {
    expect(routeLabel('api')).toBe('API');
    expect(routeLabel('browser')).toBe('Computer');
    expect(routeLabel('sample')).toBe('Sample');
    expect(routeLabel('off')).toBe('Off');
  });
});

describe('speedLabel', () => {
  it('says "not measured" unless there is a real p50', () => {
    expect(speedLabel(null)).toBe('not measured');
    expect(speedLabel(Number.NaN)).toBe('not measured');
    expect(speedLabel(-5)).toBe('not measured');
  });
  it('turns a real p50 into seconds', () => {
    expect(speedLabel(600)).toBe('about 0.6 s');
    expect(speedLabel(1240)).toBe('about 1.2 s');
    expect(speedLabel(12)).toBe('under 0.1 s');
    expect(speedLabel(90_000)).toBe('about 2 min');
  });
});

describe('ageLabel', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  it('handles missing and bad timestamps honestly', () => {
    expect(ageLabel(null, now)).toBe('never');
    expect(ageLabel(null, now, 'never seen')).toBe('never seen');
    expect(ageLabel('not a date', now)).toBe('unknown');
  });
  it('formats short ages', () => {
    expect(ageLabel('2026-11-26T11:59:58Z', now)).toBe('just now');
    expect(ageLabel('2026-11-26T11:59:30Z', now)).toBe('30 s ago');
    expect(ageLabel('2026-11-26T11:55:00Z', now)).toBe('5 min ago');
    expect(ageLabel('2026-11-26T09:00:00Z', now)).toBe('3 h ago');
    expect(ageLabel('2026-11-24T12:00:00Z', now)).toBe('2 d ago');
  });
});

describe('formatCountdown', () => {
  it('counts a 5 minute code down as m:ss and never goes negative', () => {
    expect(formatCountdown(300_000)).toBe('5:00');
    expect(formatCountdown(299_001)).toBe('5:00');
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(9_000)).toBe('0:09');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-4000)).toBe('0:00');
  });
});

describe('groupCode', () => {
  it('splits six digits into two groups of three', () => {
    expect(groupCode('042917')).toBe('042 917');
    expect(groupCode('12')).toBe('12');
  });
});

describe('normalizeProfile', () => {
  it('reads the real server shape (harnesses.items, dataSources[].source)', () => {
    const view = normalizeProfile({
      host: { name: 'DESKTOP-1', platform: 'win32', uptimeSec: 7200 },
      revision: 4,
      routing: { preferredLlm: 'auto', preferredModel: null },
      harnesses: {
        scannedAt: '2026-11-26T10:00:00Z',
        items: [
          { id: 'claude_cli', kind: 'cli', status: 'connected', models: ['haiku', 'sonnet'], modelCount: 2, lastProbeMs: 340 },
          { id: 'ollama', kind: 'server', status: 'not_installed', models: [], modelCount: 0, lastProbeMs: null },
        ],
      },
      dataSources: [
        { source: 'calendar', mode: 'browser', probed: false, evidence: 'Chrome driver is available.' },
        { source: 'bogus', mode: 'api', evidence: 'x' },
      ],
    });
    expect(view?.name).toBe('DESKTOP-1');
    expect(view?.harnesses).toEqual([
      { id: 'claude_cli', kind: 'cli', status: 'connected', models: ['haiku', 'sonnet'], probeMs: 340 },
      { id: 'ollama', kind: 'server', status: 'not_installed', models: [], probeMs: null },
    ]);
    expect(view?.dataSources).toEqual([{ id: 'calendar', effective: 'browser', reason: 'Chrome driver is available.' }]);
  });

  it('also accepts the flat contract shape and rejects junk', () => {
    const view = normalizeProfile({
      host: {},
      harnesses: [{ id: 'codex_cli', status: 'connected', probeMs: 80 }],
      dataSources: [{ id: 'gmail', mode: 'off', evidence: '' }],
    });
    expect(view?.harnesses[0].probeMs).toBe(80);
    expect(view?.dataSources[0].id).toBe('gmail');
    expect(normalizeProfile(null)).toBeNull();
    expect(normalizeProfile({ unchanged: true, revision: 3 })).toBeNull();
    expect(normalizeProfile('nope')).toBeNull();
  });
});

describe('normalizeSources / sourcesFromProfile', () => {
  it('keeps valid rows and turns breaker into a boolean', () => {
    const rows = normalizeSources([
      { id: 'notion', mode: 'auto', effective: 'api', p50Ms: 620, lastSyncAt: '2026-11-26T11:00:00Z', stale: true, breaker: 'open', reason: 'Token saved.' },
      { id: 'telegram', mode: 'weird', effective: 'off', p50Ms: null, lastSyncAt: null, stale: false, breaker: 'closed' },
      { id: 'nope', effective: 'api' },
      { id: 'gmail', effective: 'cloud' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'notion', mode: 'auto', p50Ms: 620, stale: true, breakerOpen: true, reason: 'Token saved.' });
    expect(rows[1]).toMatchObject({ id: 'telegram', mode: null, p50Ms: null, breakerOpen: false });
  });

  it('reads the real server shape ({ revision, sources: [{ source, evidence, ... }] })', () => {
    const rows = normalizeSources({
      revision: 28,
      sources: [
        { source: 'calendar', mode: 'auto', effective: 'browser', reason: null, evidence: 'Chrome driver is available.', p50Ms: null, lastSyncAt: null, stale: null, breaker: 'closed', staleReason: null, failures: 0 },
        { source: 'notion', mode: 'api', effective: 'api', reason: 'Token saved.', evidence: 'x', p50Ms: 612, lastSyncAt: '2026-11-26T11:00:00Z', stale: true, staleReason: 'last fetch timed out', breaker: 'open' },
      ],
    });
    expect(rows[0]).toMatchObject({ id: 'calendar', reason: 'Chrome driver is available.', stale: false, breakerOpen: false, p50Ms: null });
    expect(rows[1]).toMatchObject({ id: 'notion', reason: 'Token saved.', p50Ms: 612, stale: true, staleReason: 'last fetch timed out', breakerOpen: true });
  });

  it('falls back to profile data with nothing measured', () => {
    const view = normalizeProfile({ dataSources: [{ source: 'notion', mode: 'sample', evidence: 'Built-in sample data.' }] });
    expect(sourcesFromProfile(view)).toEqual([
      { id: 'notion', mode: null, effective: 'sample', reason: 'Built-in sample data.', p50Ms: null, lastSyncAt: null, stale: false, staleReason: '', breakerOpen: false },
    ]);
    expect(sourcesFromProfile(null)).toEqual([]);
  });
});

describe('sourceWarnings', () => {
  it('warns on an open breaker and on stale data', () => {
    const base = { id: 'notion' as const, mode: 'auto' as const, effective: 'api' as const, reason: '', p50Ms: null, lastSyncAt: null, staleReason: '' };
    expect(sourceWarnings({ ...base, stale: false, breakerOpen: false })).toEqual([]);
    expect(sourceWarnings({ ...base, stale: true, breakerOpen: true })).toHaveLength(2);
    expect(sourceWarnings({ ...base, stale: true, staleReason: 'timed out', breakerOpen: false })).toEqual(['Data may be out of date: timed out']);
  });
});

describe('devices and outbox', () => {
  it('parses paired devices from { devices }', () => {
    expect(normalizeDevices({ devices: [{ id: 'dev_ab', label: 'Pixel', createdAt: '2026-11-26T10:00:00Z', lastSeen: null }, { label: 'no id' }] })).toEqual([
      { id: 'dev_ab', label: 'Pixel', createdAt: '2026-11-26T10:00:00Z', lastSeen: null },
    ]);
  });
  it('reads the real outbox shape ({ items: [{ id, title, reason }] })', () => {
    expect(normalizeOutbox({ items: [{ id: 'ob_ab12', title: 'Move 14:00', status: 'failed', attempts: 3, reason: 'Slot taken (409)' }] })).toEqual([
      { id: 'ob_ab12', label: 'Move 14:00', status: 'failed', attempts: 3, error: 'Slot taken (409)' },
    ]);
  });
  it('parses outbox rows and drops unknown statuses', () => {
    expect(normalizeOutbox([{ id: 'o1', label: 'Move 14:00', status: 'failed', attempts: 2, error: 'timeout' }, { id: 'o2', status: 'weird' }])).toEqual([
      { id: 'o1', label: 'Move 14:00', status: 'failed', attempts: 2, error: 'timeout' },
    ]);
  });
});

describe('small helpers', () => {
  it('spots loopback pairing urls', () => {
    expect(isLoopbackUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isLoopbackUrl('http://localhost:8787')).toBe(true);
    expect(isLoopbackUrl('http://192.168.1.20:8787')).toBe(false);
    expect(isLoopbackUrl('https://x.trycloudflare.com')).toBe(false);
    expect(isLoopbackUrl('garbage')).toBe(false);
  });
  it('gives friendly harness names', () => {
    expect(harnessName('claude_cli')).toBe('Claude Code');
    expect(harnessName('some_new_cli')).toBe('Some new');
  });
});
