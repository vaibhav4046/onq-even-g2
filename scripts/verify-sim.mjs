import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createOnCueServer } from '../apps/server/dist/server.js';

const ROOT = process.cwd();
const GLASSES_DIST = path.join(ROOT, 'apps', 'glasses', 'dist');
const SCREENSHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

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

async function sendInput(autoBase, action) {
  const res = await fetch(`${autoBase}/api/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`POST /api/input ${action} failed: ${res.status}`);
  await new Promise((r) => setTimeout(r, 450));
}

async function captureGlasses(autoBase, filename) {
  const res = await fetch(`${autoBase}/api/screenshot/glasses`);
  if (!res.ok) throw new Error(`GET /api/screenshot/glasses failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(out, buf);
  console.log(`[sim] Captured ${out} (${buf.byteLength} bytes)`);
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-sim-'));
  const relay = await createOnCueServer({ port: 8787, dataDir, allowTestFaultControls: true });
  const staticSrv = await startStaticGlassesServer();

  const simBin = path.join(ROOT, 'node_modules', '@evenrealities', 'evenhub-simulator', 'bin', 'index.js');
  const simPort = 9898;
  const autoBase = `http://127.0.0.1:${simPort}`;
  const simProc = spawn(process.execPath, [simBin, staticSrv.url, '--automation-port', String(simPort), '--no-glow'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  try {
    await waitForPing(autoBase, 25000);
    // Poll until initial EvenHub CreateStartUpPageContainer has rendered non-blank pixels
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${autoBase}/api/screenshot/glasses`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > 4500) break;
      await new Promise((r) => setTimeout(r, 350));
    }

    // 1. Corridor Dossier (READ - Card 1: VC Sync - Priya Nair)
    await captureGlasses(autoBase, 'sim-01-dossier.png');

    // 2. Scroll to Card 2 & back to Card 1
    await sendInput(autoBase, 'down');
    await captureGlasses(autoBase, 'sim-02-card2.png');
    await sendInput(autoBase, 'up');

    // 3. Open Card 1 Actions -> Stage Default-NO Preview ("Push 15m + Reply Priya")
    await sendInput(autoBase, 'click');
    await captureGlasses(autoBase, 'sim-03-detail.png');
    await sendInput(autoBase, 'click');
    await captureGlasses(autoBase, 'sim-04-preview-no.png');

    // 4. Swipe to YES -> Arm 2.0s Countdown Ring -> Capture Ring + Commit Receipt
    await sendInput(autoBase, 'down');
    await sendInput(autoBase, 'click');
    await new Promise((r) => setTimeout(r, 600));
    await captureGlasses(autoBase, 'sim-05-armed-ring.png');
    await new Promise((r) => setTimeout(r, 2200));
    await captureGlasses(autoBase, 'sim-06-receipt-done.png');

    // 5. Return to dossier, open Card 1 Actions, select "Move 14:45 (Test 409 Lock)"
    await sendInput(autoBase, 'double_click');
    await sendInput(autoBase, 'click');
    await sendInput(autoBase, 'down');
    await sendInput(autoBase, 'click');
    await captureGlasses(autoBase, 'sim-07-conflict-409.png');

    // 6. Check simulator console logs for unexpected errors (allow the intentional 409 Conflict test fetch)
    const conRes = await fetch(`${autoBase}/api/console`);
    const conJson = await conRes.json();
    const entries = Array.isArray(conJson) ? conJson : conJson.entries ?? [];
    const errors = entries.filter((e) => {
      const msg = String(e.message ?? '');
      if (msg.includes('[fetch] 409 Conflict') && msg.includes('/api/actions/stage')) {
        return false; // expected from Step 5 Conflict Hard-Lock trigger
      }
      return (
        String(e.level ?? '').toLowerCase() === 'error' ||
        msg.includes('[uncaught]') ||
        msg.includes('[unhandledrejection]')
      );
    });
    if (errors.length > 0) {
      throw new Error(`Simulator console errors detected:\n${JSON.stringify(errors, null, 2)}`);
    }
    console.log(`[sim:PASS] Captured 7 real simulator screenshots with 0 console/uncaught errors.`);
  } finally {
    try {
      if (process.platform === 'win32' && simProc.pid) {
        spawn('taskkill', ['/pid', String(simProc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        simProc.kill();
      }
    } catch {
      // ignore
    }
    await staticSrv.close();
    await relay.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[sim:FAIL]', err);
  process.exit(1);
});
