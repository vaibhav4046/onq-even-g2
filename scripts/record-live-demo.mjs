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

async function recordClip(browser, url, outName, runnerFn) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const video = page.video();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await runnerFn(page);
  await context.close();
  const srcPath = await video.path();
  const destPath = path.join(RAW_DIR, outName);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  fs.renameSync(srcPath, destPath);
  console.log(`[record] Saved ${outName}`);
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-rec-'));
  const relay = await createOnQServer({ port: 8787, dataDir, allowTestFaultControls: true });
  const webSrv = await startStaticWebWithApiProxy(8787);

  try {
    // Clean stale webm clips
    for (const f of fs.readdirSync(RAW_DIR)) {
      if (f.endsWith('.webm')) fs.unlinkSync(path.join(RAW_DIR, f));
    }

    await captureRealSimulatorSequence();

    // Reset relay sandbox before web video captures
    await relay.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    const dataDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-rec2-'));
    const relay2 = await createOnQServer({ port: 8787, dataDir: dataDir2, allowTestFaultControls: true });

    const browser = await chromium.launch({ headless: true });
    try {
      // Clip 1: Hero + Interactive 3D G2 + Sticky Safety Story
      await recordClip(browser, webSrv.url, 'clip1_hero_story.webm', async (page) => {
        await page.waitForTimeout(1600);
        // Gentle pointer sweep over 3D glasses
        await page.mouse.move(1440, 260, { steps: 18 });
        await page.waitForTimeout(700);
        await page.locator('#simulator').getByRole('button', { name: 'Exploded', exact: true }).click();
        await page.waitForTimeout(2100);
        await page.locator('#simulator').getByRole('button', { name: 'R1 Ring', exact: true }).click();
        await page.waitForTimeout(2100);
        await page.locator('#simulator').getByRole('button', { name: '3D Optics', exact: true }).click();
        await page.waitForTimeout(1200);

        // Smooth scroll into Sticky Safety Story & step through 01..04
        await page.locator('#safety').scrollIntoViewIfNeeded();
        await page.waitForTimeout(1400);
        await page.getByRole('tab', { name: '02' }).click();
        await page.waitForTimeout(1500);
        await page.getByRole('tab', { name: '03' }).click();
        await page.waitForTimeout(2100);
        await page.getByRole('tab', { name: '04' }).click();
        await page.waitForTimeout(1800);
      });

      // Clip 2: Continuous Live Walkthrough (Read -> Stage -> Ring -> Live Write Receipt)
      await recordClip(browser, webSrv.url, 'clip2_live_walkthrough.webm', async (page) => {
        await page.locator('[data-testid="g2-lens"]').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -140));
        await page.waitForTimeout(2000);
        await page.getByRole('button', { name: 'Voice: Push 15m + Tell Priya' }).click();
        await page.waitForTimeout(2600);
        await page.getByRole('button', { name: 'Swipe Down (Down)' }).click();
        await page.waitForTimeout(1500);
        await page.getByRole('button', { name: 'Tap R1 / Temple (Enter)' }).click();
        // Watch real 2.0s ring sweep and SSE writeback
        await page.waitForTimeout(4200);
      });

      // Clip 3: During & After Meeting (STT-3.7 Live Diarization + Ask OnQ + Wrap-Up + 409 Lock)
      await recordClip(browser, webSrv.url, 'clip3_conflict_and_notion.webm', async (page) => {
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page.waitForTimeout(700);
        await page.locator('[data-testid="g2-lens"]').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -140));
        await page.waitForTimeout(800);

        await page.getByRole('button', { name: 'Run Live Meeting Demo' }).click();
        await page.waitForTimeout(2100);
        await page.getByRole('button', { name: 'Ask "OnQ, Q4?" (TTS-1)' }).click();
        await page.waitForTimeout(2400);
        await page.getByRole('button', { name: 'Wrap Up & Save' }).click();
        await page.waitForTimeout(2100);
        await page.getByRole('button', { name: 'Swipe Down (Down)' }).click();
        await page.waitForTimeout(900);
        await page.getByRole('button', { name: 'Tap R1 / Temple (Enter)' }).click();
        await page.waitForTimeout(3200);

        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page.waitForTimeout(700);
        await page.getByRole('button', { name: 'Trigger 409 Conflict' }).click();
        await page.waitForTimeout(2600);
      });

      // Clip 4: RMS Silence Gate + STALE Offline + Evidence Table + 189 Tests Hardware Band
      await recordClip(browser, webSrv.url, 'clip4_failures_and_proof.webm', async (page) => {
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page.waitForTimeout(700);
        await page.locator('[data-testid="g2-lens"]').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -140));
        await page.waitForTimeout(700);

        await page.getByRole('button', { name: 'Test Silent WAV' }).click();
        await page.waitForTimeout(2400);
        await page.getByRole('button', { name: 'Toggle STALE Offline' }).click();
        await page.waitForTimeout(2200);
        await page.getByRole('button', { name: 'Toggle STALE Offline' }).click();
        await page.waitForTimeout(900);
        await page.getByRole('button', { name: 'Action Pack (Notion + Hold)' }).click();
        await page.waitForTimeout(2200);

        await page.locator('#evidence').scrollIntoViewIfNeeded();
        await page.waitForTimeout(3000);
        await page.locator('#hardware').scrollIntoViewIfNeeded();
        await page.waitForTimeout(2600);
      });

      // Refresh Product Hunt 1270x760 gallery captures from upgraded UI
      const phCtx = await browser.newContext({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 1 });
      const phPage = await phCtx.newPage();
      await phPage.goto(webSrv.url, { waitUntil: 'networkidle' });
      await phPage.waitForTimeout(1000);
      await phPage.screenshot({ path: path.join(PH_DIR, 'gallery-01-hero.png') });

      await phPage.getByRole('button', { name: 'Trigger 409 Conflict' }).click();
      await phPage.waitForTimeout(700);
      await phPage.locator('[data-testid="g2-lens"]').scrollIntoViewIfNeeded();
      await phPage.evaluate(() => window.scrollBy(0, -80));
      await phPage.waitForTimeout(600);
      await phPage.screenshot({ path: path.join(PH_DIR, 'gallery-02-conflict-lock.png') });

      await phPage.locator('#safety').scrollIntoViewIfNeeded();
      await phPage.getByRole('tab', { name: '03' }).click();
      await phPage.waitForTimeout(700);
      await phPage.screenshot({ path: path.join(PH_DIR, 'gallery-03-voice-pack.png') });

      await phPage.locator('#hardware').scrollIntoViewIfNeeded();
      await phPage.waitForTimeout(800);
      await phPage.screenshot({ path: path.join(PH_DIR, 'gallery-04-architecture.png') });
      await phCtx.close();
      console.log('[record] Refreshed media/product-hunt/gallery-01..04.png (1270x760)');
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
