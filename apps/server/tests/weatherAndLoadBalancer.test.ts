import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveWeatherService, decodeWmoCondition, formatWeatherCompact } from '../src/providers/weatherProvider.js';
import { HarnessLoadBalancer } from '../src/harness/loadBalancer.js';
import { discoverLocalAgentsAndCrons } from '../src/harness/pcPowerSource.js';
import { createOnQServer } from '../src/server.js';
import { TelegramCommandCentre } from '../src/harness/telegramCommandCentre.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-phase2-'));
  tempDirs.push(d);
  return d;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('LiveWeatherService (Open-Meteo zero-key)', () => {
  it('decodes WMO codes and formats LVGL ASCII + web labels', () => {
    expect(decodeWmoCondition(0)).toBe('Clear');
    expect(decodeWmoCondition(2)).toBe('Partly Cloudy');
    expect(decodeWmoCondition(61)).toBe('Rain');
    expect(decodeWmoCondition(95)).toBe('Storm');
    expect(formatWeatherCompact(26.7, 'Partly Cloudy')).toEqual({
      g2Label: '27C Cloudy',
      webLabel: '27°C Cloudy',
    });
  });

  it('fetches Open-Meteo once and serves from 15m TTL cache without redundant calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ current: { temperature_2m: 28.4, weather_code: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const svc = new LiveWeatherService(fetchMock as unknown as typeof fetch);
    const first = await svc.getWeather({ city: 'Dubai', lat: 25.2, lon: 55.27 });
    const second = await svc.getWeather({ city: 'Dubai', lat: 25.2, lon: 55.27 });
    expect(first.source).toBe('open-meteo');
    expect(first.g2Label).toBe('28C Clear');
    expect(first.webLabel).toBe('28°C Clear');
    expect(second.g2Label).toBe('28C Clear');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns clean deterministic fallback when upstream fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    const svc = new LiveWeatherService(fetchMock as unknown as typeof fetch);
    const snap = await svc.getWeather({ city: 'London', lat: 51.5, lon: -0.12 });
    expect(snap.source).toBe('fallback');
    expect(snap.g2Label).toBe('24C Clear');
  });
});

describe('HarnessLoadBalancer (weighted least-latency + circuit breaker + failover)', () => {
  it('routes to fastest healthy hosted node, fails over cleanly, opens circuit after 3 failures, and recovers via HALF_OPEN', async () => {
    let now = 1_000_000;
    const lb = new HarnessLoadBalancer(() => now);
    lb.registerNode({ id: 'ollama', label: 'Ollama', tier: 'hosted_pc', weight: 1.8, initialLatencyMs: 120 });
    lb.registerNode({ id: 'openrouter', label: 'OpenRouter', tier: 'cloud_api', weight: 1.0, initialLatencyMs: 420 });
    lb.registerNode({ id: 'rules', label: 'Rules', tier: 'deterministic', weight: 0.6, initialLatencyMs: 10 });

    // Dispatch fails on primary (ollama) and automatically fails over to next healthy candidate
    const out1 = await lb.dispatch(
      async (node) => {
        if (node.id === 'ollama') throw new Error('ECONNREFUSED');
        now += 25;
        return `served:${node.id}`;
      },
      { preferTier: 'hosted_pc' },
    );
    expect(out1.ok).toBe(true);
    expect(out1.nodeId).not.toBe('ollama');
    expect(out1.failovers).toBe(1);

    // Trigger 2 more consecutive failures on ollama -> circuit opens (3 total consecutive failures)
    lb.recordFailure('ollama', 'timeout 2');
    lb.recordFailure('ollama', 'timeout 3');
    const openSnap = lb.snapshot();
    const ollamaNode = openSnap.nodes.find((n) => n.id === 'ollama');
    expect(ollamaNode?.circuit).toBe('OPEN');
    expect(lb.selectCandidates().map((n) => n.id)).not.toContain('ollama');

    // Advance past 45s cooldown -> transitions to HALF_OPEN and closes again on success
    now += 46_000;
    expect(lb.snapshot().nodes.find((n) => n.id === 'ollama')?.circuit).toBe('HALF_OPEN');
    lb.recordSuccess('ollama', 90);
    expect(lb.snapshot().nodes.find((n) => n.id === 'ollama')?.circuit).toBe('CLOSED');
  });
});

describe('discoverLocalAgentsAndCrons (names & counts only)', () => {
  it('detects installed agent directories and cron counts without reading payloads', () => {
    const fakeHome = makeTempDir();
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'antigravity'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.claude', 'jobs'), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, '.claude', 'jobs', 'morning.json'), '{}');
    fs.mkdirSync(path.join(fakeHome, '.hermes', 'crons'), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, '.hermes', 'crons', 'digest.yaml'), 'name: digest');

    const res = discoverLocalAgentsAndCrons(fakeHome);
    expect(res.antigravityPresent).toBe(true);
    expect(res.hermesPresent).toBe(true);
    expect(res.agentsDetected).toContain('Antigravity');
    expect(res.agentsDetected).toContain('Claude');
    expect(res.agentsDetected).toContain('Hermes');
    expect(res.cronCount).toBe(2);
  });
});

describe('Server Phase 2 endpoints: /api/weather, /api/harness/pool, /api/os/scheduler, /api/os/bots & Telegram /menu', () => {
  it('exposes live corridor weather + agentGrid, editable Morning Brief Scheduler, Bot Studio with L5 & Kill Switch gates, and Telegram Control Center menu', async () => {
    const dataDir = makeTempDir();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('open-meteo.com')) {
        return new Response(JSON.stringify({ current: { temperature_2m: 26, weather_code: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const srv = await createOnQServer({
      port: 0,
      dataDir,
      disableProactiveTimer: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    try {
      const base = `http://127.0.0.1:${srv.port}`;
      const sessRes = await fetch(`${base}/api/demo/session`, { method: 'POST' });
      const { sessionToken } = (await sessRes.json()) as { sessionToken: string };
      const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

      // 1. /api/corridor carries weatherLabel + 4-cell agentGrid
      const corrRes = await fetch(`${base}/api/corridor`, { headers });
      expect(corrRes.status).toBe(200);
      const corr = (await corrRes.json()) as {
        weatherLabel?: string;
        agentGrid?: Array<{ label: string; value: string }>;
      };
      expect(corr.weatherLabel).toBe('26C Clear');
      expect(corr.agentGrid).toHaveLength(4);
      expect(corr.agentGrid?.map((g) => g.label)).toEqual(['AGENTS', 'CRONS', 'BOTS', 'BRIEF']);

      // 2. /api/harness/pool returns adaptive load balancer snapshot
      const poolRes = await fetch(`${base}/api/harness/pool`, { headers });
      expect(poolRes.status).toBe(200);
      const poolJson = (await poolRes.json()) as { ok: boolean; pool: { strategy: string; nodes: unknown[] } };
      expect(poolJson.ok).toBe(true);
      expect(poolJson.pool.strategy).toBe('weighted_least_latency_circuit_breaker');
      expect(poolJson.pool.nodes.length).toBeGreaterThanOrEqual(1);

      // 3. Editable Morning Brief Scheduler via REST and /schedule command
      const schedUpdate = await fetch(`${base}/api/os/scheduler`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ timeHhmm: '07:30', weatherCity: 'San Francisco' }),
      });
      expect(schedUpdate.status).toBe(200);
      const schedJson = (await schedUpdate.json()) as { scheduler: { timeHhmm: string; weatherCity: string } };
      expect(schedJson.scheduler.timeHhmm).toBe('07:30');
      expect(schedJson.scheduler.weatherCity).toBe('San Francisco');

      // 4. Bot Studio create + L5 hard block + toggle + Kill Switch 423 guard
      const botBad = await fetch(`${base}/api/os/bots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ op: 'create', name: 'Bad Bot', action: 'git push --force origin master' }),
      });
      expect(botBad.status).toBe(403);

      const botGood = await fetch(`${base}/api/os/bots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ op: 'create', name: 'Morning Digest', trigger: '07:30', action: '/morning' }),
      });
      expect(botGood.status).toBe(200);
      const botCreated = (await botGood.json()) as { bot: { id: string; name: string } };
      expect(botCreated.bot.name).toBe('Morning Digest');

      // Engage Kill Switch -> bot run must return 423
      await fetch(`${base}/api/os/killswitch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ paused: true }),
      });
      const botBlocked = await fetch(`${base}/api/os/bots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ op: 'run', id: botCreated.bot.id }),
      });
      expect(botBlocked.status).toBe(423);

      // Resume Kill Switch -> bot run succeeds
      await fetch(`${base}/api/os/killswitch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ paused: false }),
      });
      const botRan = await fetch(`${base}/api/os/bots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ op: 'run', id: botCreated.bot.id }),
      });
      expect(botRan.status).toBe(200);

      // 5. Telegram /menu inline control center + menu:bots callback query
      const tgSent: Array<{ url: string; body: string }> = [];
      const tgFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        tgSent.push({ url: String(input), body: String(init?.body ?? '') });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      const centre = new TelegramCommandCentre({
        osHarness: srv.osHarness,
        getCredentials: () => ({ botToken: '123:test', chatId: '424242' }),
        fetchImpl: tgFetch as unknown as typeof fetch,
      });
      const menuRes = await centre.processUpdate({
        updateId: 10,
        message: {
          messageId: 1,
          chatId: '424242',
          chatTitle: 'Owner',
          chatType: 'private',
          fromName: 'Owner',
          text: '/menu',
          dateSec: 1700000000,
        },
      });
      expect(menuRes.handled).toBe(true);
      expect(menuRes.reply).toContain('Control Center');
      expect(tgSent.some((s) => s.body.includes('menu:bots') && s.body.includes('menu:morning'))).toBe(true);

      const cbRes = await centre.processUpdate({
        updateId: 11,
        callbackQuery: {
          id: 'cb-1',
          chatId: '424242',
          messageId: 99,
          fromName: 'Owner',
          data: 'menu:bots',
        },
      });
      expect(cbRes.handled).toBe(true);
      expect(cbRes.reply).toContain('Bot Studio');
    } finally {
      await srv.close();
    }
  });
});
