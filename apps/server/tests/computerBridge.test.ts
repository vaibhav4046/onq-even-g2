import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectLocalComputerTools, runSafeReadInspection } from '../src/providers/localComputerBridge.js';
import { clearProviderCooldowns, routeModelCompletion } from '../src/harness/modelRouter.js';
import { ProactiveAgenticHarness } from '../src/proactiveHarness.js';
import { createOnQServer } from '../src/server.js';
import { DemoWorkspaceProvider } from '../src/providers/demoProvider.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  clearProviderCooldowns();
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

async function startTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-comp-'));
  const srv = await createOnQServer({ dataDir: dir, port: 0, disableProactiveTimer: true });
  cleanups.push(async () => {
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return srv;
}

describe('Zero-API-Key Local Computer Bridge, Agent Task Engine & Enhanced 24/7 Proactive Harness', () => {
  it('detectLocalComputerTools returns structured inventory including Node & Git without spawning shell', () => {
    const tools = detectLocalComputerTools();
    expect(tools.length).toBeGreaterThanOrEqual(8);
    expect(tools.some((t) => t.id === 'node' && t.installed)).toBe(true);
    expect(tools.some((t) => t.id === 'claude_cli' && t.accountMode.includes('Zero API Key'))).toBe(true);
  });

  it('runSafeReadInspection reads workspace summary & git_status safely', async () => {
    const summary = await runSafeReadInspection('workspace_summary', process.cwd());
    expect(summary.ok).toBe(true);
    expect(summary.lensLines.length).toBeGreaterThan(0);
    expect(summary.lensLines.every((l) => l.length <= 42)).toBe(true);
  });

  it('modelRouter falls back cleanly on MALFORMED_JSON without false Code-Guard violation', async () => {
    const out = await routeModelCompletion(
      {
        recipientName: 'Priya Nair',
        recipientEmail: 'priya@tvm.example',
        allowedRecipients: ['priya@tvm.example'],
        sourceEmailText: 'Can we move VC Sync to 14:15?',
        userUtterance: 'Push 15m and tell Priya',
        computedFacts: ['14:15'],
        fallbackDraft: 'Running slightly behind, pushing sync to 14:15. Thanks!',
      },
      {
        preferredProvider: 'openrouter',
        openRouterKey: 'sk-or-test-000',
        fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), { status: 200 }),
      },
    );
    expect(out.fallbackUsed).toBe(true);
    expect(out.factGuardViolations).toEqual([]);
    expect(out.attempts?.some((a) => a.status === 'MALFORMED_JSON')).toBe(true);
  });

  it('ProactiveAgenticHarness surfaces /7 connector count plus TELEGRAM and COMPUTER categories', () => {
    const demo = new DemoWorkspaceProvider();
    const h = new ProactiveAgenticHarness({
      getSnapshot: () => ({ snapshot: demo.getSnapshot(), sourceMode: 'DEMO' }),
      getSummary: () => ({ activeLlmProvider: 'OpenRouter', voiceConnected: true, connectedCount: 5, totalConnectors: 7 }),
      getTelegramInsight: () => ({
        id: 'ins-tg-1',
        atIso: new Date().toISOString(),
        category: 'TELEGRAM',
        severity: 'action',
        title: 'TG @alex',
        detail: 'Need ETA on G2 build',
        sourceMode: 'LIVE',
      }),
      getComputerInsight: () => ({
        id: 'ins-comp-1',
        atIso: new Date().toISOString(),
        category: 'COMPUTER',
        severity: 'info',
        title: 'Computer: Workspace Ready',
        detail: '0 uncommitted edits',
        sourceMode: 'DEMO',
      }),
    });
    const st = h.runPulse();
    expect(st.insights.some((i) => i.category === 'TELEGRAM')).toBe(true);
    expect(st.insights.some((i) => i.category === 'COMPUTER')).toBe(true);
    const health = st.insights.find((i) => i.category === 'HEALTH');
    expect(health?.detail).toContain('5/7 connectors ready');
  });

  it('serves /api/computer/tools, /api/computer/inspect (rejects invalid kind), and Default-NO task stage -> commit', async () => {
    const srv = await startTestServer();
    const sessRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
    const { sessionToken } = (await sessRes.json()) as { sessionToken: string };
    const hdr = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const toolsRes = await fetch(`${srv.url}/api/computer/tools`, { headers: hdr });
    expect(toolsRes.status).toBe(200);
    const toolsJson = (await toolsRes.json()) as { tools: unknown[] };
    expect(toolsJson.tools.length).toBeGreaterThanOrEqual(8);

    const badInspect = await fetch(`${srv.url}/api/computer/inspect`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ kind: 'rm_rf' }),
    });
    expect(badInspect.status).toBe(400);

    const goodInspect = await fetch(`${srv.url}/api/computer/inspect`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ kind: 'workspace_summary' }),
    });
    expect(goodInspect.status).toBe(200);

    const stageRes = await fetch(`${srv.url}/api/agent/tasks/stage`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        kind: 'PLAN_PROJECT',
        title: 'Build G2 Sprint',
        prompt: 'Plan a 3-step launch sprint for OnQ',
        targetTool: 'auto',
      }),
    });
    expect(stageRes.status).toBe(200);
    const { task } = (await stageRes.json()) as { task: { id: string; previewToken: string; status: string } };
    expect(task.status).toBe('STAGED_DEFAULT_NO');

    const commitRes = await fetch(`${srv.url}/api/agent/tasks/commit`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ taskId: task.id, previewToken: task.previewToken }),
    });
    expect(commitRes.status).toBe(200);
    const committed = (await commitRes.json()) as { task: { status: string; outputLines: string[] } };
    expect(committed.task.status).toBe('DONE');
    expect(committed.task.outputLines.length).toBeGreaterThan(0);
  });
});
