import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearProviderCooldowns,
  getProviderHealthStatus,
  orchestrateStructuredJson,
  resolveHealthyLlmLabel,
} from '../src/harness/modelRouter.js';
import { ProactiveAgenticHarness } from '../src/proactiveHarness.js';
import { DemoWorkspaceProvider } from '../src/providers/demoProvider.js';
import { createOnQServer } from '../src/server.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  clearProviderCooldowns();
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

async function startServer(extra: Parameters<typeof createOnQServer>[0] = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-self-harness-'));
  const srv = await createOnQServer({
    dataDir,
    port: 0,
    disableProactiveTimer: true,
    allowTestFaultControls: true,
    ...extra,
  });
  cleanups.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return srv;
}

describe('Self-Generating Proactive Agentic Harness & Orchestrator Router', () => {
  it('orchestrateStructuredJson handles failover, fenced JSON, cooldowns, and validator rejection', async () => {
    const claudeKey = 'sk-ant-cooldown-test-111';
    const openRouterKey = 'sk-or-cooldown-test-222';
    const openAiKey = 'sk-oa-cooldown-test-333';

    expect(getProviderHealthStatus('claude', undefined)).toBe('UNCONFIGURED');
    expect(getProviderHealthStatus('claude', claudeKey)).toBe('READY');

    let claudeCalls = 0;
    const out1 = await orchestrateStructuredJson(
      {
        systemPrompt: 'Return JSON',
        userPrompt: 'Plan brief',
        fallbackJson: { goal: 'fallback', ok: true },
        validate: (raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const o = raw as Record<string, unknown>;
          return typeof o.goal === 'string' && o.ok === true
            ? { goal: o.goal, ok: true }
            : null;
        },
      },
      {
        anthropicKey: claudeKey,
        openRouterKey,
        openAiKey,
        preferredProvider: 'auto',
        trackCooldowns: true,
        fetchImpl: async (url) => {
          const u = String(url);
          if (u.includes('anthropic')) {
            claudeCalls += 1;
            return new Response('quota exceeded', { status: 429 });
          }
          if (u.includes('openrouter')) {
            return new Response(
              JSON.stringify({
                choices: [
                  { message: { content: '```json\n{"goal":"Prepare VC Sync","ok":true}\n```' } },
                ],
              }),
              { status: 200 },
            );
          }
          return new Response('{}', { status: 500 });
        },
      },
    );

    expect(claudeCalls).toBe(1);
    expect(out1.fallbackUsed).toBe(false);
    expect(out1.providerLabel).toBe('OpenRouter');
    expect(out1.data).toEqual({ goal: 'Prepare VC Sync', ok: true });
    expect(getProviderHealthStatus('claude', claudeKey)).toBe('COOLDOWN');
    expect(
      resolveHealthyLlmLabel({
        anthropicKey: claudeKey,
        openRouterKey,
        openAiKey,
        preferredProvider: 'auto',
      }),
    ).toBe('OpenRouter');

    // Second call in auto mode skips cooled-down Claude without hitting fetch
    const out2 = await orchestrateStructuredJson(
      {
        systemPrompt: 'Return JSON',
        userPrompt: 'Plan brief 2',
        fallbackJson: { goal: 'fallback', ok: true },
      },
      {
        anthropicKey: claudeKey,
        openRouterKey,
        openAiKey,
        preferredProvider: 'auto',
        trackCooldowns: true,
        fetchImpl: async (url) => {
          if (String(url).includes('anthropic')) {
            claudeCalls += 1;
          }
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"goal":"Second pass","ok":true}' } }],
            }),
            { status: 200 },
          );
        },
      },
    );
    expect(claudeCalls).toBe(1);
    expect(out2.attempts[0]).toMatchObject({ provider: 'openrouter', status: 'OK' });
    expect(out2.providerLabel).toBe('OpenRouter');

    clearProviderCooldowns();
    expect(getProviderHealthStatus('claude', claudeKey)).toBe('READY');
    expect(
      resolveHealthyLlmLabel({
        anthropicKey: claudeKey,
        openRouterKey,
        preferredProvider: 'auto',
      }),
    ).toBe('Claude');

    // Validator rejection on Claude cascades cleanly to ChatGPT
    const out3 = await orchestrateStructuredJson(
      {
        systemPrompt: 'Return JSON',
        userPrompt: 'Plan brief 3',
        fallbackJson: { goal: 'fallback', ok: true },
        validate: (raw) => {
          const obj = raw as { goal?: string; ok?: boolean };
          if (!obj.goal || obj.goal.includes('INJECT')) return null;
          return { goal: obj.goal, ok: Boolean(obj.ok) };
        },
      },
      {
        anthropicKey: claudeKey,
        openAiKey,
        preferredProvider: 'auto',
        fetchImpl: async (url) => {
          if (String(url).includes('anthropic')) {
            return new Response(
              JSON.stringify({ content: [{ text: '{"goal":"INJECT payload","ok":true}' }] }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({ choices: [{ message: { content: '{"goal":"Safe Plan","ok":true}' } }] }),
            { status: 200 },
          );
        },
      },
    );
    expect(out3.providerLabel).toBe('ChatGPT');
    expect(out3.attempts[0]).toMatchObject({ provider: 'claude', status: 'CODE_GUARD_REJECTED' });
    expect(out3.data.goal).toBe('Safe Plan');
  });

  it('ProactiveAgenticHarness.synthesizeHarness enforces <=42-col lines, Default-NO, and 90s auto-synthesis', async () => {
    let nowMs = 1_700_000_000_000;
    const demo = new DemoWorkspaceProvider();
    const pulses: number[] = [];

    const harness = new ProactiveAgenticHarness({
      getSnapshot: () => ({ snapshot: demo.getSnapshot(), sourceMode: 'DEMO' }),
      getSummary: () => ({
        activeLlmProvider: 'OpenRouter',
        voiceConnected: false,
        connectedCount: 3,
      }),
      synthesizeHarnessPlan: async ({ focusHint }) => ({
        triggerCategory: 'MEETING',
        goal: focusHint ?? 'Prepare VC Sync shift',
        rationale: 'Imminent calendar overlap requires 15m shift with Default-NO guard.',
        orchestratorUsed: 'OpenRouter',
        fallbackUsed: false,
        suggestedCommand: 'Push 15m and tell Priya',
        opticalCardLines: [
          'This optical card line is way longer than forty-two columns and must be clipped cleanly',
          'Second very long optical card line exceeding 42 columns for Even G2 lens display safety',
        ],
        steps: [
          { id: 's1', phase: 'OBSERVE', tool: 'Corridor', detail: 'Read VC Sync', status: 'DONE' },
          { id: 's2', phase: 'GUARD', tool: 'DefaultNO', detail: 'Hold YES', status: 'LOCKED' },
        ],
        codeGuardPassed: true,
      }),
      onPulse: (st) => pulses.push(st.harnessCount),
      nowFn: () => nowMs,
    });

    const st1 = await harness.synthesizeHarness('Shift VC Sync safely');
    expect(st1.harnessCount).toBe(1);
    expect(st1.activeHarness).not.toBeNull();
    expect(st1.activeHarness?.defaultNoRequired).toBe(true);
    expect(st1.activeHarness?.codeGuardPassed).toBe(true);
    expect(st1.activeHarness?.goal).toBe('Shift VC Sync safely');
    expect(st1.activeHarness?.opticalCardLines.every((l) => l.length <= 42)).toBe(true);
    expect(pulses.length).toBeGreaterThanOrEqual(2);

    // Within 90s: runAsyncPulse does not re-synthesize
    nowMs += 30_000;
    const st2 = await harness.runAsyncPulse();
    expect(st2.harnessCount).toBe(1);

    // At >=90s with action/warn insight: runAsyncPulse auto-synthesizes
    nowMs += 65_000;
    const st3 = await harness.runAsyncPulse();
    expect(st3.harnessCount).toBe(2);

    // Without synthesizeHarnessPlan dep: deterministic Code-Guard-verified fallback works
    const fallbackHarness = new ProactiveAgenticHarness({
      getSnapshot: () => ({ snapshot: demo.getSnapshot(), sourceMode: 'DEMO' }),
      getSummary: () => ({
        activeLlmProvider: 'Rules (Deterministic)',
        voiceConnected: false,
        connectedCount: 0,
      }),
    });
    const fbStatus = await fallbackHarness.synthesizeHarness();
    expect(fbStatus.activeHarness?.defaultNoRequired).toBe(true);
    expect(fbStatus.activeHarness?.codeGuardPassed).toBe(true);
    expect(fbStatus.activeHarness?.fallbackUsed).toBe(true);
    expect(fbStatus.activeHarness?.opticalCardLines.every((l) => l.length <= 42)).toBe(true);
  });

  it('POST /api/connectors/orchestrator, /api/proactive/synthesize, and /api/proactive/stage-harness (200 + 409)', async () => {
    const srv = await startServer({
      fetchImpl: async (url) => {
        if (String(url).includes('openrouter')) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      goal: 'Shift VC Sync 15m and update Priya',
                      rationale: 'Priya awaits reply ahead of VC Sync.',
                      suggestedCommand: 'Push 15m and tell Priya',
                      opticalCardLines: [
                        'VC SYNC: PUSH 15M + REPLY PRIYA',
                        'CODE-GUARD OK · DEFAULT-NO LOCKED',
                      ],
                      steps: [
                        { id: 's1', phase: 'OBSERVE', tool: 'Corridor', detail: 'VC Sync', status: 'DONE' },
                        { id: 's2', phase: 'VERIFY', tool: 'CodeGuard', detail: 'Verified', status: 'DONE' },
                        { id: 's3', phase: 'STAGE', tool: 'ActionPreview', detail: 'Push 15m', status: 'READY' },
                        { id: 's4', phase: 'GUARD', tool: 'DefaultNO', detail: 'Hold YES', status: 'LOCKED' },
                      ],
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"draft":"Pushing VC Sync 15m to 14:15."}' } }] }),
          { status: 200 },
        );
      },
    });

    // Unauthenticated requests are rejected
    expect((await fetch(`${srv.url}/api/connectors/orchestrator`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${srv.url}/api/proactive/synthesize`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${srv.url}/api/proactive/stage-harness`, { method: 'POST' })).status).toBe(401);

    const sessRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
    const { sessionToken } = (await sessRes.json()) as { sessionToken: string };
    const headers = {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    };

    // Configure OpenRouter key
    await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'openrouter', apiKey: 'sk-or-test-orch-123' }),
    });

    // Invalid preferredLlm returns 400
    const badOrch = await fetch(`${srv.url}/api/connectors/orchestrator`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ preferredLlm: 'invalid_provider' }),
    });
    expect(badOrch.status).toBe(400);

    // Valid orchestrator switch saves into vault, clears cooldowns, updates status
    const orchRes = await fetch(`${srv.url}/api/connectors/orchestrator`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        preferredLlm: 'openrouter',
        openRouterModel: 'openai/gpt-4o-mini',
      }),
    });
    expect(orchRes.status).toBe(200);
    const orchJson = (await orchRes.json()) as {
      preferredLlm: string;
      openRouterModel: string;
      activeLlmProvider: string;
    };
    expect(orchJson.preferredLlm).toBe('openrouter');
    expect(orchJson.openRouterModel).toBe('openai/gpt-4o-mini');
    expect(orchJson.activeLlmProvider).toBe('OpenRouter');

    // Synthesize proactive harness via OpenRouter
    const synthRes = await fetch(`${srv.url}/api/proactive/synthesize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ focusHint: 'Prepare VC Sync brief' }),
    });
    expect(synthRes.status).toBe(200);
    const synthJson = (await synthRes.json()) as {
      harnessCount: number;
      activeHarness: {
        orchestratorUsed: string;
        defaultNoRequired: boolean;
        codeGuardPassed: boolean;
        suggestedCommand: string;
        opticalCardLines: string[];
      };
    };
    expect(synthJson.harnessCount).toBeGreaterThanOrEqual(1);
    expect(synthJson.activeHarness.orchestratorUsed).toBe('OpenRouter');
    expect(synthJson.activeHarness.defaultNoRequired).toBe(true);
    expect(synthJson.activeHarness.codeGuardPassed).toBe(true);
    expect(synthJson.activeHarness.opticalCardLines.every((l) => l.length <= 42)).toBe(true);

    // Stage proactive harness -> 200 { harness, preview } with Default-NO
    const stageOkRes = await fetch(`${srv.url}/api/proactive/stage-harness`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    expect(stageOkRes.status).toBe(200);
    const stageOk = (await stageOkRes.json()) as {
      harness: { suggestedCommand: string };
      preview: { defaultSelection: string; previewToken: string; operations: unknown[] };
    };
    expect(stageOk.harness.suggestedCommand).toBe('Push 15m and tell Priya');
    expect(stageOk.preview.defaultSelection).toBe('NO');
    expect(stageOk.preview.previewToken).toMatch(/^pt_/);
    expect(stageOk.preview.operations.length).toBeGreaterThanOrEqual(1);

    // Inject calendar conflict -> POST /api/proactive/stage-harness returns 409 { harness, conflict }
    const faultRes = await fetch(`${srv.url}/api/workspace/fault`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ forceConflictBusy: true }),
    });
    expect(faultRes.status).toBe(200);
    const stageConflictRes = await fetch(`${srv.url}/api/proactive/stage-harness`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    expect(stageConflictRes.status).toBe(409);
    const stageConflict = (await stageConflictRes.json()) as {
      harness: { suggestedCommand: string };
      conflict: { code: string };
    };
    expect(stageConflict.harness.suggestedCommand).toBe('Push 15m and tell Priya');
    expect(stageConflict.conflict.code).toBe('CONFLICT_CALENDAR_BUSY');
  });
});
