import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB_URL = 'http://127.0.0.1:5173/';
const API_BASE = 'http://127.0.0.1:8787';
const OUT_SHOT = path.join(
  'C:/Users/lalwa/.gemini/antigravity/brain/f82af792-3aed-459b-bb40-db20e5d16eaf/scratch',
  'brutal-live-check.png',
);

async function main() {
  const report = { api: {}, connectors: {}, tts: {}, harness: {}, browser: {} };

  // 1. Live /api/health & demo session
  const health = await (await fetch(`${API_BASE}/api/health`)).json();
  report.api.health = health;
  const { sessionToken } = await (await fetch(`${API_BASE}/api/demo/session`, { method: 'POST' })).json();
  const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

  // 2. Test ALL 7 connectors live via HTTP (including real upstream AssemblyAI & Telegram!)
  for (const pid of ['googleWorkspace', 'notion', 'telegram', 'claude', 'openrouter', 'chatgpt', 'assemblyai']) {
    const r = await fetch(`${API_BASE}/api/connectors/${pid}/test`, { method: 'POST', headers: auth });
    const j = await r.json();
    report.connectors[pid] = { status: r.status, ok: j.ok, mode: j.mode, latencyMs: j.latencyMs, detail: j.detail };
    if (r.status !== 200 || !j.ok) {
      throw new Error(`Connector test failed for ${pid}: ${JSON.stringify(j)}`);
    }
  }

  // 3. Real upstream AssemblyAI TTS-1 speech synthesis
  const ttsRes = await fetch(`${API_BASE}/api/tts/speak`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ text: 'Sync moved to 14:15. Investor notified.', voiceId: 'aai-kyla' }),
  });
  const ttsJson = await ttsRes.json();
  report.tts = {
    status: ttsRes.status,
    engine: ttsJson.engine,
    chunks: ttsJson.audioChunksBase64?.length ?? 0,
    words: ttsJson.wordBoundaries?.length ?? 0,
    durationMs: ttsJson.durationMs,
  };
  if (ttsRes.status !== 200 || report.tts.words === 0) {
    throw new Error(`Live TTS speak failed: ${JSON.stringify(ttsJson)}`);
  }

  // 4. Live 6-step orchestration harness run + reset
  const hRun = await (
    await fetch(`${API_BASE}/api/harness/run`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ utterance: 'Push 15m and tell Investor' }),
    })
  ).json();
  report.harness = { outcome: hRun.outcome, steps: hRun.steps?.length, providerUsed: hRun.providerUsed };
  if (hRun.outcome !== 'COMMITTED' || hRun.steps?.length !== 6) {
    throw new Error(`Harness run failed: ${JSON.stringify(hRun)}`);
  }
  await fetch(`${API_BASE}/api/workspace/reset`, { method: 'POST', headers: auth, body: '{}' });

  // 5. Brutal Chromium Playwright UI stress click-through on live http://127.0.0.1:5173/
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(12000);
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    console.log('[live-check] goto', WEB_URL);
    await page.goto(WEB_URL, { waitUntil: 'commit', timeout: 30000 });
    await page.locator('#experience canvas').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1000);
    console.log('[live-check] hero canvas ready');

    // Check navbar height / single-line alignment
    const navRect = await page.locator('header nav a').evaluateAll((els) =>
      els.map((el) => ({ text: el.textContent, h: el.getBoundingClientRect().height })),
    );
    report.browser.navHeights = navRect;
    await page.screenshot({ path: OUT_SHOT, animations: 'disabled', timeout: 10000 }).catch((e) => console.warn('[live-check] screenshot skipped:', e.message));

    console.log('[live-check] 3D modes');
    await page.locator('#experience').getByRole('button', { name: 'Exploded', exact: true }).click({ noWaitAfter: true });
    await page.locator('#experience').getByRole('button', { name: 'R1 Ring', exact: true }).click({ noWaitAfter: true });
    await page.locator('#experience').getByRole('button', { name: '3D Optics', exact: true }).click({ noWaitAfter: true });
    await page.locator('#experience').getByRole('button', { name: 'POV', exact: true }).first().click({ noWaitAfter: true });
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    console.log('[live-check] Talk Now');
    await page.getByRole('button', { name: 'Talk Now' }).first().click({ noWaitAfter: true });
    await page.getByRole('button', { name: 'Confirm & Arm 2.0s Ring' }).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Confirm & Arm 2.0s Ring' }).click({ noWaitAfter: true });
    await page.waitForTimeout(3200);
    await page.getByRole('button', { name: 'Reset', exact: true }).click({ noWaitAfter: true });
    await page.waitForTimeout(500);

    console.log('[live-check] Meeting Scribe');
    await page.getByRole('tab', { name: 'Meeting Scribe', exact: true }).first().click({ noWaitAfter: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Start Live Meeting Scribe/ }).click({ noWaitAfter: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Wrap Up/ }).first().click({ noWaitAfter: true });
    await page.getByRole('button', { name: 'Confirm & Arm 2.0s Ring' }).waitFor({ state: 'visible', timeout: 10000 });

    console.log('[live-check] 409 conflict lock');
    await page.getByRole('button', { name: 'Reset', exact: true }).click({ noWaitAfter: true });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Test Conflict Lock/ }).first().click({ noWaitAfter: true });
    await page.locator('[data-testid="g2-lens"]').getByText(/409|LOCKED|14:45/i).first().waitFor({ state: 'visible', timeout: 8000 });
    const lensText409 = await page.locator('[data-testid="g2-lens"]').innerText();
    report.browser.conflict409Shown = lensText409.includes('409') || lensText409.includes('14:45');

    console.log('[live-check] Connectors');
    await page.locator('#connectors').scrollIntoViewIfNeeded();
    const testButtons = page.locator('#connectors').getByRole('button', { name: 'Test Connection', exact: true });
    const btnCount = await testButtons.count();
    for (let i = 0; i < btnCount; i++) {
      await testButtons.nth(i).click({ noWaitAfter: true });
    }
    await page.waitForFunction(
      () => document.querySelectorAll('#connectors').length > 0 &&
        Array.from(document.querySelectorAll('#connectors *')).filter((el) => /^VERIFIED\b/.test(el.textContent?.trim() ?? '')).length >= 6,
      null,
      { timeout: 12000 },
    );
    const verifiedBadges = await page.locator('#connectors').getByText(/^VERIFIED\b/).count();

    // Unified PairCard QR / link generation
    const qrBtn = page.getByRole('button', { name: /Show QR|Make a new QR/i }).first();
    await qrBtn.click({ noWaitAfter: true });
    await page.waitForTimeout(500);

    console.log('[live-check] Overflow');
    const desktopOverflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));

    // Laptop 1024px overflow + single-line nav check
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);
    const laptopOverflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));

    const unexpectedErrors = consoleErrors.filter((msg) => !msg.includes('status of 409'));
    report.browser = {
      ...report.browser,
      connectorsTestedButtons: btnCount,
      verifiedBadges,
      desktopOverflow,
      laptopOverflow,
      consoleErrors: unexpectedErrors,
      intentional409ConsoleCount: consoleErrors.length - unexpectedErrors.length,
      pageErrors,
    };

    if (!report.browser.conflict409Shown || verifiedBadges < 6 || unexpectedErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(`Brutal live UI checks failed: ${JSON.stringify(report.browser)}`);
    }
  } finally {
    await Promise.race([browser.close().catch(() => undefined), new Promise((r) => setTimeout(r, 8000))]);
  }

  console.log('BRUTAL_LIVE_CHECK_PASS:', JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('BRUTAL_LIVE_CHECK_FAIL:', err);
  process.exit(1);
});
