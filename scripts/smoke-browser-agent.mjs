// Live smoke test of the browser agent: real Chrome on this PC + real planner (API key models or your Claude/Codex CLI).
// Usage: npm run build -w @onq/server, then node scripts/smoke-browser-agent.mjs "Open https://example.com and tell me the heading"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadLocalEnvFile } from '../apps/server/dist/env.js';
import { BrowserAgentEngine } from '../apps/server/dist/harness/browserAgent.js';
import { createBrowserPlanner, createLocalChromeDriver } from '../apps/server/dist/harness/browserRuntime.js';

loadLocalEnvFile();
const goal = process.argv[2] ?? 'Open https://example.com and tell me the main heading on the page.';
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-smoke-'));
const cfg = {
  openRouterKey: process.env.OPENROUTER_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  openAiKey: process.env.OPENAI_API_KEY,
};
const engine = new BrowserAgentEngine({
  driverFactory: () => createLocalChromeDriver({ profileDir, headless: process.env.ONQ_BROWSER_HEADLESS !== '0' }),
  planner: createBrowserPlanner(() => cfg),
  requestApproval: async (i) => {
    console.log(`[approval needed] ${i.payloadPreview}`);
    return { id: 'apr_smoke' };
  },
  getApprovalStatus: () => 'PENDING',
  isPaused: () => false,
  maxSteps: 6,
  onUpdate: (r) => {
    const last = r.steps.at(-1);
    console.log(`[${r.status}] ${r.providerLabel ?? ''} ${last ? `#${last.n} ${last.action} -> ${last.outcome}` : ''}`);
  },
});
const { run } = engine.start(goal, 'web');
for (let i = 0; i < 600; i++) {
  const r = engine.getRun(run.id);
  if (r && r.status !== 'RUNNING') {
    console.log(`RESULT ${r.status}: ${r.answer ?? ''}`);
    break;
  }
  await new Promise((res) => setTimeout(res, 500));
}
await new Promise((res) => setTimeout(res, 1500)); // let Chrome release the profile
try {
  fs.rmSync(profileDir, { recursive: true, force: true });
} catch {
  console.log(`(temp profile left at ${profileDir}; Chrome still had it open)`);
}
process.exit(0);
