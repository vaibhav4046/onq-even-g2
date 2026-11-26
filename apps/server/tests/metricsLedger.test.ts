import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aggregateSteps,
  estimateStepCostUsd,
  estimateTokens,
  MetricsLedger,
  parseUsage,
  percentile,
  type MetricStep,
} from '../src/harness/metricsLedger.js';
import { clearProviderCooldowns, orchestrateStructuredJson, routeModelCompletion, type CliRunner } from '../src/harness/modelRouter.js';
import { createOnQServer } from '../src/server.js';

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

function step(over: Partial<MetricStep>): MetricStep {
  return {
    id: 'ms_x',
    atIso: new Date(0).toISOString(),
    kind: 'llm',
    provider: 'claude',
    model: 'claude-3-5-haiku-latest',
    runId: 'r1',
    taskId: null,
    ttftMs: null,
    totalMs: 100,
    inputTokens: 1000,
    outputTokens: 100,
    estimated: false,
    cacheHit: null,
    queueDepth: 0,
    ok: true,
    ...over,
  };
}

describe('metrics ledger math', () => {
  it('percentile is nearest-rank and null for no data', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([100, 10, 40, 20, 30], 50)).toBe(30);
    expect(percentile([100, 10, 40, 20, 30], 95)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
  });

  it('parses real usage from Anthropic and OpenAI-compatible bodies, and says nothing when absent', () => {
    expect(parseUsage({ usage: { input_tokens: 120, output_tokens: 15, cache_read_input_tokens: 100 } })).toEqual({ inputTokens: 120, outputTokens: 15, cacheHit: true });
    expect(parseUsage({ usage: { prompt_tokens: 50, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 0 } } })).toEqual({ inputTokens: 50, outputTokens: 9, cacheHit: false });
    expect(parseUsage({ usage: { prompt_tokens: 50, completion_tokens: 9 } })).toEqual({ inputTokens: 50, outputTokens: 9 }); // cache unknown, not false
    expect(parseUsage({ choices: [] })).toBeUndefined();
    expect(estimateTokens(401)).toBe(101);
  });

  it('records real vs estimated tokens, ttft, cache and queue depth per step', () => {
    const clock = fakeClock();
    const ledger = new MetricsLedger({ now: clock.now });

    const a = ledger.begin({ kind: 'llm', provider: 'claude', model: 'claude-3-5-haiku-latest' });
    clock.tick(40);
    a.firstToken();
    clock.tick(60);
    const sa = a.end({ usage: { inputTokens: 500, outputTokens: 50, cacheHit: true } });
    expect(sa).toMatchObject({ totalMs: 100, ttftMs: 40, inputTokens: 500, outputTokens: 50, estimated: false, cacheHit: true, queueDepth: 0, ok: true });

    const b = ledger.begin({ kind: 'llm', provider: 'openrouter', model: 'x/y:free' });
    clock.tick(30);
    const sb = b.end({ inputChars: 400, outputChars: 81 });
    expect(sb).toMatchObject({ totalMs: 30, ttftMs: null, inputTokens: 100, outputTokens: 21, estimated: true, cacheHit: null });

    const t = ledger.begin({ kind: 'tool', provider: 'os_command' });
    clock.tick(5);
    expect(t.end()).toMatchObject({ kind: 'tool', inputTokens: null, outputTokens: null, estimated: false });
  });

  it('tracks queue depth and max concurrent in-flight, and groups steps by run via runWith', async () => {
    const clock = fakeClock();
    const ledger = new MetricsLedger({ now: clock.now });
    const spans = await ledger.runWith({ runId: 'run-A', taskId: 'task-1' }, () => [
      ledger.begin({ kind: 'subagent', provider: 'developer' }),
      ledger.begin({ kind: 'subagent', provider: 'auditor' }),
      ledger.begin({ kind: 'subagent', provider: 'researcher' }),
    ]);
    clock.tick(10);
    const ended = spans.map((s) => s.end());
    expect(ended.map((s) => s.queueDepth)).toEqual([0, 1, 2]);
    expect(ended.every((s) => s.runId === 'run-A' && s.taskId === 'task-1')).toBe(true);

    ledger.begin({ kind: 'tool', provider: 'solo', runId: 'run-B' }).end();
    const sum = ledger.summary();
    expect(sum.inFlightNow).toBe(0);
    expect(sum.maxConcurrentInFlight).toBe(3);
    const runA = sum.runs.find((r) => r.runId === 'run-A');
    expect(runA).toMatchObject({ steps: 3, maxConcurrentInFlight: 3, taskIds: ['task-1'] });
    expect(sum.runs.find((r) => r.runId === 'run-B')?.maxConcurrentInFlight).toBe(1);
  });

  it('aggregates tokens, p50/p95, ttft, cache rate and cost without inventing unknowns', () => {
    const steps = [
      step({ totalMs: 10, ttftMs: 4, cacheHit: true, inputTokens: 1_000_000, outputTokens: 0 }),
      step({ totalMs: 20, ttftMs: null, cacheHit: false, inputTokens: 0, outputTokens: 1_000_000, estimated: true }),
      step({ totalMs: 30, cacheHit: null, provider: 'claude_cli', model: 'haiku', inputTokens: 500, outputTokens: 50 }),
      step({ totalMs: 40, provider: 'rules', model: null, inputTokens: 0, outputTokens: 0 }),
      step({ totalMs: 100, provider: 'openrouter', model: 'some/unlisted-model', inputTokens: 10, outputTokens: 10 }),
    ];
    const agg = aggregateSteps('r1', steps);
    expect(agg).toMatchObject({
      steps: 5,
      inputTokens: 1_000_510,
      outputTokens: 1_000_060,
      tokensEstimated: true,
      totalMs: 200,
      p50Ms: 30,
      p95Ms: 100,
      avgTtftMs: 4,
      ttftMeasuredSteps: 1,
      cacheKnownSteps: 2,
      cacheHitRate: 0.5,
      unpricedSteps: 1,
    });
    // claude haiku: 1M input at $0.80 + 1M output at $4.00; CLI subscription and rules are $0 marginal
    expect(agg.estimatedCostUsd).toBeCloseTo(4.8, 6);
    expect(estimateStepCostUsd(step({ provider: 'claude_cli', model: 'haiku' }))).toBe(0);
    expect(estimateStepCostUsd(step({ provider: 'rules', model: null }))).toBe(0);
    expect(estimateStepCostUsd(step({ provider: 'openrouter', model: 'a/b:free' }))).toBe(0);
    expect(estimateStepCostUsd(step({ provider: 'openrouter', model: 'a/unlisted' }))).toBeNull();
    // no cache or ttft data at all -> null, not 0
    const bare = aggregateSteps('r2', [step({}), step({})]);
    expect(bare.cacheHitRate).toBeNull();
    expect(bare.avgTtftMs).toBeNull();
  });

  it('persists to dataDir json and reloads; keeps only the most recent steps', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-metrics-'));
    try {
      const one = new MetricsLedger({ dataDir });
      one.begin({ kind: 'tool', provider: 'persisted', runId: 'r' }).end();
      const two = new MetricsLedger({ dataDir });
      expect(two.getSteps().map((s) => s.provider)).toEqual(['persisted']);
      for (let i = 0; i < 520; i++) two.begin({ kind: 'tool', provider: `p${i}` }).end();
      expect(new MetricsLedger({ dataDir }).getSteps(1000).length).toBe(500);
      expect(two.summary().steps.length).toBe(200);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

const BASE_INPUT = {
  recipientName: 'Investor contact',
  recipientEmail: 'investor@sample.example',
  allowedRecipients: ['investor@sample.example'],
  sourceEmailText: 'Investor call. Can we push 15m to 14:15?',
  userUtterance: 'Push 15m to 14:15 and reply politely',
  computedFacts: ['14:15'],
  fallbackDraft: 'Running slightly behind, shifting the investor call to 14:15.',
};
const DRAFT = '{"draft":"Moving the investor call to 14:15."}';

describe('metrics wired into the model router', () => {
  afterEach(() => clearProviderCooldowns());

  it('records provider-reported usage as real (not estimated) and cache hit from the API', async () => {
    const ledger = new MetricsLedger();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ content: [{ text: DRAFT }], usage: { input_tokens: 321, output_tokens: 17, cache_read_input_tokens: 300 } }), { status: 200 })) as unknown as typeof fetch;
    const out = await routeModelCompletion(BASE_INPUT, { anthropicKey: 'sk-ant-test', fetchImpl, metrics: ledger });
    expect(out.fallbackUsed).toBe(false);
    const [s] = ledger.getSteps();
    expect(s).toMatchObject({ kind: 'llm', provider: 'claude', model: 'claude-3-5-haiku-latest', inputTokens: 321, outputTokens: 17, estimated: false, cacheHit: true, ttftMs: null, ok: true });
  });

  it('falls back to chars/4 with estimated:true when the provider returns no usage, and flags failures', async () => {
    const ledger = new MetricsLedger();
    const bad = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    await routeModelCompletion(BASE_INPUT, { anthropicKey: 'sk-ant-test', fetchImpl: bad, metrics: ledger });
    const failed = ledger.getSteps().find((s) => s.provider === 'claude');
    expect(failed).toMatchObject({ ok: false, estimated: true, outputTokens: 0, cacheHit: null });
    expect(failed?.error).toContain('HTTP 500');
    expect(failed?.inputTokens).toBeGreaterThan(20);

    const noUsage = (async () => new Response(JSON.stringify({ choices: [{ message: { content: DRAFT } }] }), { status: 200 })) as unknown as typeof fetch;
    const ledger2 = new MetricsLedger();
    await routeModelCompletion(BASE_INPUT, { openRouterKey: 'sk-or-test', fetchImpl: noUsage, metrics: ledger2 });
    const est = ledger2.getSteps().find((s) => s.provider === 'openrouter');
    expect(est).toMatchObject({ estimated: true, outputTokens: estimateTokens(DRAFT.length), cacheHit: null });
  });

  it('measures real ttft for a CLI that streams, $0 cost, and records the Rules fallback as its own step', async () => {
    const ledger = new MetricsLedger();
    const cliRunner: CliRunner = async (_bin, _args, _prompt, _timeout, opts) => {
      await new Promise((r) => setTimeout(r, 15));
      opts?.onFirstByte?.();
      await new Promise((r) => setTimeout(r, 10));
      return DRAFT;
    };
    await routeModelCompletion(BASE_INPUT, { cliRunner, metrics: ledger, localProviders: [{ id: 'claude_cli', binaryPath: 'claude', model: 'haiku' }] });
    const cli = ledger.getSteps().find((s) => s.provider === 'claude_cli');
    expect(cli?.ttftMs).not.toBeNull();
    expect(cli?.ttftMs as number).toBeGreaterThanOrEqual(10);
    expect(cli?.ttftMs as number).toBeLessThan(cli?.totalMs as number);
    expect(estimateStepCostUsd(cli as MetricStep)).toBe(0);

    const rules = new MetricsLedger();
    await routeModelCompletion(BASE_INPUT, { metrics: rules }); // no keys, no CLIs
    expect(rules.getSteps()).toHaveLength(1);
    expect(rules.getSteps()[0]).toMatchObject({ provider: 'rules', inputTokens: 0, outputTokens: 0, estimated: false });
  });

  it('orchestrateStructuredJson is metered too and inherits the run id from runWith', async () => {
    const ledger = new MetricsLedger();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 40, completion_tokens: 5 } }), { status: 200 })) as unknown as typeof fetch;
    await ledger.runWith({ runId: 'task-77', taskId: 'task-77' }, () =>
      orchestrateStructuredJson({ systemPrompt: 'sys', userPrompt: 'user', fallbackJson: { ok: false } }, { openAiKey: 'sk-test', fetchImpl, metrics: ledger }),
    );
    expect(ledger.getSteps()[0]).toMatchObject({ provider: 'chatgpt', runId: 'task-77', taskId: 'task-77', inputTokens: 40, outputTokens: 5, estimated: false });
  });
});

describe('GET /api/harness/metrics', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()?.();
    clearProviderCooldowns();
  });

  it('needs auth, and reports steps + per-run aggregates with honest notes (isolated dataDir)', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-metrics-http-'));
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: DRAFT } }], usage: { prompt_tokens: 222, completion_tokens: 11 } }), { status: 200 })) as unknown as typeof fetch;
    const srv = await createOnQServer({ port: 0, dataDir, disableProactiveTimer: true, fetchImpl, llmConfig: { openRouterKey: 'sk-or-metrics', fetchImpl } });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    });
    expect((await fetch(`${srv.url}/api/harness/metrics`)).status).toBe(401);

    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const h = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const stage = await fetch(`${srv.url}/api/actions/stage`, { method: 'POST', headers: h, body: JSON.stringify({ commandText: 'Push 15m and tell Investor', cardId: 'card-vc-priya' }) });
    expect(stage.status).toBe(200);
    const pipe = await (await fetch(`${srv.url}/api/os/pipeline/run`, { method: 'POST', headers: h, body: JSON.stringify({ preset: 'software_delivery', goal: 'metrics check' }) })).json() as { run: { runId: string } };

    const res = await fetch(`${srv.url}/api/harness/metrics`, { headers: h });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      steps: MetricStep[];
      runs: Array<ReturnType<typeof aggregateSteps>>;
      overall: ReturnType<typeof aggregateSteps>;
      maxConcurrentInFlight: number;
      notes: { estimated: boolean; kvCache: unknown; batchSize: unknown; cost: { estimated: boolean } };
    };
    expect(json.ok).toBe(true);
    expect(json.steps.length).toBeLessThanOrEqual(200);

    const llm = json.steps.find((s) => s.kind === 'llm' && s.provider === 'openrouter');
    expect(llm).toMatchObject({ inputTokens: 222, outputTokens: 11, estimated: false, ttftMs: null, cacheHit: null });

    // pipeline specialists are sub-agent steps under the pipeline run id
    const subs = json.steps.filter((s) => s.kind === 'subagent' && s.runId === pipe.run.runId);
    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(json.runs.find((r) => r.runId === pipe.run.runId)?.steps).toBe(subs.length);
    expect(json.maxConcurrentInFlight).toBeGreaterThanOrEqual(1);

    expect(json.overall.totalTokens).toBeGreaterThanOrEqual(233);
    expect(json.overall.cacheHitRate).toBeNull(); // provider never reported cache, so null, not 0
    expect(json.notes).toMatchObject({ estimated: true, kvCache: null, batchSize: null, cost: { estimated: true } });
    expect(fs.existsSync(path.join(dataDir, 'harness-metrics.json'))).toBe(true);
  });
});
