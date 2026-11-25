import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createOnQServer } from '../apps/server/dist/server.js';

const ROOT = process.cwd();
const WEB_DIST = path.join(ROOT, 'apps', 'web', 'dist');
const GLASSES_DIST = path.join(ROOT, 'apps', 'glasses', 'dist');
const RAW_DIR = path.join(ROOT, 'media', 'raw');
const SIM_DIR = path.join(RAW_DIR, 'sim');
const PH_DIR = path.join(ROOT, 'media', 'product-hunt');

fs.mkdirSync(SIM_DIR, { recursive: true });
fs.mkdirSync(PH_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startStaticWebWithApiProxy(relayPort) {
  const srv = http.createServer((req, res) => {
    const reqUrl = req.url ?? '/';
    if (reqUrl.startsWith('/api/')) {
      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port: relayPort,
          path: reqUrl,
          method: req.method,
          headers: req.headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', () => {
        res.writeHead(502);
        res.end('Relay proxy error');
      });
      req.pipe(proxyReq);
      return;
    }

    const reqPath = reqUrl.split('?')[0];
    const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const full = path.join(WEB_DIST, rel);
    if (!full.startsWith(WEB_DIST) || !fs.existsSync(full)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });

  return new Promise((resolve) => {
    srv.listen(4173, '127.0.0.1', () => {
      resolve({
        url: 'http://127.0.0.1:4173',
        close: () => new Promise((r) => srv.close(() => r())),
      });
    });
  });
}

function startStaticGlassesServer() {
  const srv = http.createServer((req, res) => {
    const reqPath = (req.url ?? '/').split('?')[0];
    const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const full = path.join(GLASSES_DIST, rel);
    if (!full.startsWith(GLASSES_DIST) || !fs.existsSync(full)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise((resolve) => {
    srv.listen(5174, '127.0.0.1', () => {
      resolve({
        url: 'http://127.0.0.1:5174',
        close: () => new Promise((r) => srv.close(() => r())),
      });
    });
  });
}

async function waitForPing(baseUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/ping`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Simulator automation port did not respond at ${baseUrl}`);
}

async function sendSimInput(autoBase, action, waitMs = 450) {
  const res = await fetch(`${autoBase}/api/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`POST /api/input ${action} failed: ${res.status}`);
  await new Promise((r) => setTimeout(r, waitMs));
}

async function captureSimPng(autoBase, name) {
  const res = await fetch(`${autoBase}/api/screenshot/glasses`);
  if (!res.ok) throw new Error(`GET /api/screenshot/glasses failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = path.join(SIM_DIR, name);
  fs.writeFileSync(out, buf);
}

async function captureRealSimulatorSequence() {
  const glassesSrv = await startStaticGlassesServer();
  const simBin = path.join(ROOT, 'node_modules', '@evenrealities', 'evenhub-simulator', 'bin', 'index.js');
  const autoBase = 'http://127.0.0.1:9898';
  const simProc = spawn(process.execPath, [simBin, glassesSrv.url, '--automation-port', '9898', '--no-glow'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  try {
    await waitForPing(autoBase, 25000);
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${autoBase}/api/screenshot/glasses`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > 4500) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    await captureSimPng(autoBase, 'sim-live-dossier.png');
    await sendSimInput(autoBase, 'click');
    await captureSimPng(autoBase, 'sim-live-detail.png');
    await sendSimInput(autoBase, 'click');
    await captureSimPng(autoBase, 'sim-live-preview-no.png');

    await sendSimInput(autoBase, 'down', 300);
    await sendSimInput(autoBase, 'click', 250);
    await captureSimPng(autoBase, 'sim-live-ring-1.png');
    await new Promise((r) => setTimeout(r, 550));
    await captureSimPng(autoBase, 'sim-live-ring-2.png');
    await new Promise((r) => setTimeout(r, 550));
    await captureSimPng(autoBase, 'sim-live-ring-3.png');
    await new Promise((r) => setTimeout(r, 1400));
    await captureSimPng(autoBase, 'sim-live-receipt.png');

    await sendSimInput(autoBase, 'double_click');
    await sendSimInput(autoBase, 'click');
    await sendSimInput(autoBase, 'down');
    await sendSimInput(autoBase, 'click');
    await captureSimPng(autoBase, 'sim-live-409.png');

    const sessRes = await fetch('http://127.0.0.1:8787/api/demo/session', { method: 'POST' });
    if (sessRes.ok) {
      const { sessionToken } = await sessRes.json();
      const hdrs = { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` };
      await fetch('http://127.0.0.1:8787/api/meeting/start', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ attendees: ['Priya Nair', 'Alex Chen'] }),
      });
      await fetch('http://127.0.0.1:8787/api/meeting/turn', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          speakerLabel: 'Speaker A',
          text: 'Ship OnQ G2 with 4-bit pixel avatar and Notion sync.',
          isFinal: true,
        }),
      });
      await new Promise((r) => setTimeout(r, 900));
      await captureSimPng(autoBase, 'sim-live-avatar.png');
      await fetch('http://127.0.0.1:8787/api/meeting/wipe', {
        method: 'POST',
        headers: hdrs,
        body: '{}',
      });
      await new Promise((r) => setTimeout(r, 350));
      await fetch('http://127.0.0.1:8787/api/proactive/synthesize', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ focusHint: 'Prepare next VC meeting brief and reply' }),
      });
      await new Promise((r) => setTimeout(r, 900));
      await captureSimPng(autoBase, 'sim-live-proactive.png');
    }
    console.log('[record] Captured real EvenHub Simulator 0.9.5 PNG sequence in media/raw/sim/');
  } finally {
    try {
      simProc.kill();
    } catch {
      // ignore
    }
    await glassesSrv.close();
  }
}

async function scrollToLens(page) {
  await page.waitForTimeout(400);
  // First workspace sync can take 25s+ on a loaded machine (antivirus scans, software WebGL), so wait generously.
  await page.locator('[data-testid="g2-lens"]').last().waitFor({ state: 'visible', timeout: 60000 });
  await page.evaluate(() => {
    const els = document.querySelectorAll('[data-testid="g2-lens"]');
    const el = els[els.length - 1];
    if (el) el.scrollIntoView({ block: 'center' });
  });
}

// ONQ_REC_GALLERY_ONLY=1 re-captures just the Product Hunt gallery and keeps the existing clips.
const GALLERY_ONLY = process.env.ONQ_REC_GALLERY_ONLY === '1';
// ONQ_REC_ONLY=clip2,clip3 re-records just those clips (keeps the rest, skips simulator sequence and gallery).
const ONLY = (process.env.ONQ_REC_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);

async function recordClip(browser, url, outName, runnerFn) {
  if (GALLERY_ONLY) return;
  if (ONLY.length > 0 && !ONLY.some((n) => outName.includes(n))) return;
  const startedAt = Date.now();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const video = page.video();
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('#experience').waitFor({ state: 'visible', timeout: 15000 });
  try {
    await page.waitForFunction(
      () => {
        const els = document.querySelectorAll('[data-testid="g2-lens"]');
        const el = els[els.length - 1];
        return Boolean(el && !el.textContent?.includes('SYNCING WORKSPACE'));
      },
      null,
      { timeout: 45000 },
    );
  } catch {
    // non-fatal fallback if sandbox takes longer
  }
  await page.waitForTimeout(900);
  // Sidecar: how many ms of the recording are page load / first sync, so edits can trim the loading screen.
  const readyMs = Date.now() - startedAt;
  await runnerFn(page);
  await context.close();
  const srcPath = await video.path();
  const destPath = path.join(RAW_DIR, outName);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  fs.renameSync(srcPath, destPath);
  fs.writeFileSync(`${destPath}.ready.json`, JSON.stringify({ readyMs }));
  console.log(`[record] Saved ${outName}`);
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-rec-'));
  const relay = await createOnQServer({ port: 8787, dataDir, allowTestFaultControls: true });
  const webSrv = await startStaticWebWithApiProxy(8787);

  try {
    // Clean stale webm clips
    if (!GALLERY_ONLY && ONLY.length === 0) {
      for (const f of fs.readdirSync(RAW_DIR)) {
        if (f.endsWith('.webm')) fs.unlinkSync(path.join(RAW_DIR, f));
      }
      await captureRealSimulatorSequence();
    }

    // Reset relay sandbox before web video captures
    await relay.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    const dataDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-rec2-'));
    const relay2 = await createOnQServer({ port: 8787, dataDir: dataDir2, allowTestFaultControls: true });

    const browser = await chromium.launch({ headless: true });
    try {
      // Clip 1: Hero 360 3D G2 + Inside-Lens POV Modal + Sticky Safety Story
      await recordClip(browser, webSrv.url, 'clip1_hero_story.webm', async (page) => {
        await page.waitForTimeout(1400);
        await page.mouse.move(1440, 260, { steps: 18 });
        await page.waitForTimeout(600);
        await page.locator('#experience').getByRole('button', { name: 'Wearer POV', exact: true }).click();
        await page.waitForTimeout(1600);
        await page.locator('#experience').getByRole('button', { name: 'Exploded', exact: true }).click();
        await page.waitForTimeout(1800);
        await page.locator('#experience').getByRole('button', { name: 'R1 Ring', exact: true }).click();
        await page.waitForTimeout(1800);
        await page.locator('#experience').getByRole('button', { name: '3D Optics', exact: true }).click();
        await page.waitForTimeout(900);
        await page.locator('#experience').getByRole('button', { name: 'POV', exact: true }).first().click();
        await page.waitForTimeout(1800);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(700);

        await page.locator('#safety').scrollIntoViewIfNeeded();
        await page.waitForTimeout(1200);
        await page.locator('#safety').getByRole('tab', { name: '02', exact: true }).click();
        await page.waitForTimeout(1300);
        await page.locator('#safety').getByRole('tab', { name: '03', exact: true }).click();
        await page.waitForTimeout(1800);
        await page.locator('#safety').getByRole('tab', { name: '04', exact: true }).click();
        await page.waitForTimeout(1500);
      });

      // Clip 2: Continuous Live Walkthrough (Talk Now -> Confirm & Arm 2.0s Ring -> Live Receipt)
      await recordClip(browser, webSrv.url, 'clip2_live_walkthrough.webm', async (page) => {
        await scrollToLens(page);
        await page.waitForTimeout(1600);
        await page.getByRole('button', { name: 'Talk Now' }).first().click();
        await page.waitForTimeout(2400);
        await page.getByRole('button', { name: 'Confirm & Arm 2.0s Ring' }).click();
        await page.waitForTimeout(4200);
      });

      // Clip 3: Live Meeting Notes -> Ask -> Wrap-Up -> 409 Conflict Lock -> Autonomous AI Video Scout
      await recordClip(browser, webSrv.url, 'clip3_conflict_and_notion.webm', async (page) => {
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page.waitForTimeout(700);
        await page.locator('#use-cases').scrollIntoViewIfNeeded();
        await page.waitForTimeout(700);

        await page.getByRole('button', { name: /Start Live Meeting Scribe/ }).first().click();
        await scrollToLens(page);
        await page.waitForTimeout(1800);

        await page.getByRole('tab', { name: 'Meeting Scribe', exact: true }).first().click();
        await page.waitForTimeout(600);
        await page.getByRole('button', { name: /Wrap Up/ }).first().click();
        await scrollToLens(page);
        await page.waitForTimeout(1800);
        await page.getByRole('button', { name: 'Confirm & Arm 2.0s Ring' }).first().click();
        await page.waitForTimeout(3000);

        await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
        await page.waitForTimeout(600);
        await page.getByRole('button', { name: /Test Conflict Lock/ }).first().click();
        await scrollToLens(page);
        await page.waitForTimeout(2400);
      });

      // Clip 4: Architecture Showcase, Research Graphs, Harness Eval & 1-Click Connectors Hub
      await recordClip(browser, webSrv.url, 'clip4_failures_and_proof.webm', async (page) => {
        // Personal OS: run the morning crew, then show the kill switch pausing and resuming everything.
        await scrollToLens(page);
        await page.getByRole('tab', { name: 'Personal OS', exact: true }).first().click();
        await page.waitForTimeout(1800);
        await page.getByRole('button', { name: 'Run Morning crew', exact: true }).click();
        await page.waitForTimeout(2600);
        await page.getByRole('button', { name: /Kill switch: pause all/ }).click();
        await page.waitForTimeout(1600);
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await page.waitForTimeout(1400);

        await page.locator('#architecture').scrollIntoViewIfNeeded();
        await page.waitForTimeout(2400);
        await page.locator('#research').scrollIntoViewIfNeeded();
        await page.waitForTimeout(2600);
        await page.locator('#connectors').scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        await page.locator('#connectors').getByRole('button', { name: 'Test Connection', exact: true }).first().click();
        await page.waitForTimeout(2200);
      });

      // Refresh Product Hunt 1270x760 gallery captures from upgraded UI
      if (ONLY.length === 0) {
      const phCtx = await browser.newContext({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 1 });
      const phPage = await phCtx.newPage();
      await phPage.goto(webSrv.url, { waitUntil: 'load' });
      await phPage.locator('#experience').waitFor({ state: 'visible', timeout: 60000 });
      await phPage.locator('[data-testid="g2-lens"]').last().getByText(/VC Sync/i).first().waitFor({ state: 'visible', timeout: 60000 });
      await phPage.waitForTimeout(900);
      await phPage.screenshot({ path: path.join(PH_DIR, 'gallery-01-hero.png') });

      await phPage.getByRole('button', { name: /Test Conflict Lock/ }).first().click();
      await phPage.waitForTimeout(900);
      await phPage.locator('[data-testid="g2-lens"]').last().waitFor({ state: 'visible' });
      await phPage.evaluate(() => {
        const els = document.querySelectorAll('[data-testid="g2-lens"]');
        const el = els[els.length - 1];
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await phPage.waitForTimeout(500);
      await phPage.screenshot({ path: path.join(PH_DIR, 'gallery-02-conflict-lock.png') });

      await phPage.locator('#safety').scrollIntoViewIfNeeded();
      await phPage.locator('#safety').getByRole('tab', { name: '03', exact: true }).click();
      await phPage.waitForTimeout(700);
      await phPage.screenshot({ path: path.join(PH_DIR, 'gallery-03-voice-pack.png') });

      await phPage.locator('#research').scrollIntoViewIfNeeded();
      await phPage.waitForTimeout(1000);
      await phPage.screenshot({ path: path.join(PH_DIR, 'gallery-04-architecture.png') });
      await phCtx.close();
      console.log('[record] Refreshed media/product-hunt/gallery-01..04.png (1270x760)');
      }
    } finally {
      await browser.close();
      await relay2.close();
      fs.rmSync(dataDir2, { recursive: true, force: true });
    }
  } finally {
    await webSrv.close();
  }
}

main().catch((err) => {
  console.error('[record:FAIL]', err);
  process.exit(1);
});
