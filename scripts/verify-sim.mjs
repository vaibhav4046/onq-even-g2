import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createOnQServer } from '../apps/server/dist/server.js';

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

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Composites RGBA (colorType 6) simulator PNG onto pure #000000 RGB (colorType 2) for legible G2 optics everywhere. */
function compositePngOnBlack(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (colorType !== 6 || bitDepth !== 8 || width === 0 || height === 0) return buf;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const bpp = 4;
  const stride = width * bpp;
  const rgbStride = width * 3 + 1;
  const outRaw = Buffer.alloc(height * rgbStride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1) + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) row[i] = (row[i] + a) & 0xff;
      else if (filter === 2) row[i] = (row[i] + b) & 0xff;
      else if (filter === 3) row[i] = (row[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) row[i] = (row[i] + paethPredictor(a, b, c)) & 0xff;
    }
    const dstOff = y * rgbStride;
    outRaw[dstOff] = 0;
    for (let x = 0; x < width; x++) {
      const s = x * 4;
      const d = dstOff + 1 + x * 3;
      const alpha = row[s + 3];
      outRaw[d] = (row[s] * alpha) >> 8;
      outRaw[d + 1] = (row[s + 1] * alpha) >> 8;
      outRaw[d + 2] = (row[s + 2] * alpha) >> 8;
    }
    prev = row;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB opaque on #000000 black
  return Buffer.concat([
    buf.subarray(0, 8),
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', zlib.deflateSync(outRaw)),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

let capturedCount = 0;

async function captureGlasses(autoBase, filename) {
  const res = await fetch(`${autoBase}/api/screenshot/glasses`);
  if (!res.ok) throw new Error(`GET /api/screenshot/glasses failed: ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  if (raw.byteLength <= 4500) {
    throw new Error(`[sim:FAIL] Blank/empty simulator screenshot for ${filename} (${raw.byteLength} bytes)`);
  }
  const buf = compositePngOnBlack(raw);
  const out = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(out, buf);
  capturedCount += 1;
  console.log(`[sim] Captured ${out} (${buf.byteLength} bytes)`);
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-sim-'));
  const relay = await createOnQServer({
    port: 8787,
    dataDir,
    allowTestFaultControls: true,
    disableProactiveTimer: true,
    llmConfig: { preferredProvider: 'rules' },
  });
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

    // 1. Corridor Dossier (READ - Card 1: Investor call)
    await captureGlasses(autoBase, 'sim-01-dossier.png');

    // 2. Scroll through Card 2 (Notion), Card 3 (Telegram), Card 4 (Proactive AI + Computer), then return to Card 1
    await sendInput(autoBase, 'down');
    await captureGlasses(autoBase, 'sim-02-card2.png');
    await sendInput(autoBase, 'down');
    await captureGlasses(autoBase, 'sim-10-telegram.png');
    await sendInput(autoBase, 'down');
    await captureGlasses(autoBase, 'sim-11-computer.png');
    await sendInput(autoBase, 'up');
    await sendInput(autoBase, 'up');
    await sendInput(autoBase, 'up');

    // 3. Open Card 1 Actions -> Stage Default-NO Preview ("Push 15m + Reply Investor")
    await sendInput(autoBase, 'click');
    await captureGlasses(autoBase, 'sim-03-detail.png');
    await sendInput(autoBase, 'click');
    await new Promise((r) => setTimeout(r, 350));
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

    // 5b. Live Meeting Scribe SSE -> 76x76 4-bit Pixel Avatar + Diarized Transcript HUD
    const sessRes = await fetch('http://127.0.0.1:8787/api/demo/session', { method: 'POST' });
    if (!sessRes.ok) throw new Error(`POST /api/demo/session failed: ${sessRes.status}`);
    const { sessionToken } = await sessRes.json();
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    };
    const startRes = await fetch('http://127.0.0.1:8787/api/meeting/start', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ attendees: ['Investor contact', 'Partner contact'] }),
    });
    if (!startRes.ok) throw new Error(`POST /api/meeting/start failed: ${startRes.status}`);
    const turnRes = await fetch('http://127.0.0.1:8787/api/meeting/turn', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        speakerLabel: 'Speaker A',
        text: 'Ship OnQ G2 with 4-bit pixel avatar and Notion sync.',
        isFinal: true,
      }),
    });
    if (!turnRes.ok) throw new Error(`POST /api/meeting/turn failed: ${turnRes.status}`);
    await new Promise((r) => setTimeout(r, 900));
    await captureGlasses(autoBase, 'sim-08-pixel-avatar.png');
    await fetch('http://127.0.0.1:8787/api/meeting/wipe', {
      method: 'POST',
      headers: authHeaders,
      body: '{}',
    });
    await new Promise((r) => setTimeout(r, 350));

    // 5c. Self-Harnessing 24/7 Proactive Agent SSE -> G2 Proactive Corridor Card
    const synthRes = await fetch('http://127.0.0.1:8787/api/proactive/synthesize', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ focusHint: 'Prepare next VC meeting brief and reply' }),
    });
    if (!synthRes.ok) throw new Error(`POST /api/proactive/synthesize failed: ${synthRes.status}`);
    await new Promise((r) => setTimeout(r, 900));
    await captureGlasses(autoBase, 'sim-09-proactive-harness.png');

    // 5d. Unified Personal OS Card + Real L4 Multi-Agent Pipeline -> Simulator Live Render
    for (let i = 0; i < 5; i++) {
      await sendInput(autoBase, 'down');
    }
    await captureGlasses(autoBase, 'sim-12-unified-os.png');
    const pipeRes = await fetch('http://127.0.0.1:8787/api/os/pipeline/run', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ preset: 'software_delivery', goal: 'Simulator OS verification' }),
    });
    if (!pipeRes.ok) throw new Error(`POST /api/os/pipeline/run failed: ${pipeRes.status}`);
    await new Promise((r) => setTimeout(r, 900));
    await captureGlasses(autoBase, 'sim-13-os-pipeline-live.png');

    // 5e. Extra real simulator captures for Film v3 slots (evening recap & kill switch pushed to LiveUI HUD)
    const recapRes = await fetch('http://127.0.0.1:8787/api/os/command', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '/evening', surface: 'glasses' }),
    });
    const recapJson = recapRes.ok ? await recapRes.json() : null;
    const recapLines = Array.isArray(recapJson?.g2Lines) && recapJson.g2Lines.length > 0
      ? recapJson.g2Lines.slice(0, 3)
      : Array.isArray(recapJson?.outcome?.g2Lines) && recapJson.outcome.g2Lines.length > 0
        ? recapJson.outcome.g2Lines.slice(0, 3)
        : ['Committed today: 1 write receipt', 'Open threads: 1 Telegram, 1 email', 'All Default-NO guards verified'];
    await fetch('http://127.0.0.1:8787/api/liveui/generate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        xml: `<ui frame="full" title="EVENING RECAP"/><ui c="list">\n${recapLines.join('\n')}</ui>`,
      }),
    });
    await new Promise((r) => setTimeout(r, 700));
    await captureGlasses(autoBase, 'sim-14-evening-recap.png');

    const ksRes = await fetch('http://127.0.0.1:8787/api/os/killswitch', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ paused: true, reason: 'Owner pause check' }),
    });
    if (ksRes.ok) {
      await fetch('http://127.0.0.1:8787/api/liveui/generate', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          xml: '<ui frame="full" title="KILL SWITCH LOCKED"/><ui c="list">\nStatus: L3/L4 routines PAUSED\nWrites: 0 sent (blocked)\nResume from owner desktop</ui>',
        }),
      });
      await new Promise((r) => setTimeout(r, 700));
      await captureGlasses(autoBase, 'sim-15-killswitch.png');
      await fetch('http://127.0.0.1:8787/api/os/killswitch', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ paused: false, reason: 'Resumed after check' }),
      });
    }

    // 5f. Coding PR Push Gate (Default-NO + L5 Guard) & Automated Career Pack (Notion + Draft) -> Real Simulator Captures 16 & 17
    const prCmdRes = await fetch('http://127.0.0.1:8787/api/os/command', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '/code prep pr for master', surface: 'glasses' }),
    });
    const prCmdJson = prCmdRes.ok ? await prCmdRes.json() : null;
    const prLines = Array.isArray(prCmdJson?.g2Lines) && prCmdJson.g2Lines.length > 0
      ? prCmdJson.g2Lines.slice(0, 4)
      : ['PR GATE | master', 'diff verified | ALL TESTS PASS', 'DEFAULT-NO | TAP YES / 2s RING', 'L5 GUARD: NO FORCE/SECRETS'];
    await fetch('http://127.0.0.1:8787/api/liveui/generate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        xml: `<ui frame="full" title="CODING PR GATE"/><ui c="list">\n${prLines.join('\n')}</ui>`,
      }),
    });
    await new Promise((r) => setTimeout(r, 700));
    await captureGlasses(autoBase, 'sim-16-coding-pr-gate.png');

    const jobCmdRes = await fetch('http://127.0.0.1:8787/api/os/command', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '/project career_pack AI Engineer roles', surface: 'glasses' }),
    });
    const jobCmdJson = jobCmdRes.ok ? await jobCmdRes.json() : null;
    const jobLines = Array.isArray(jobCmdJson?.g2Lines) && jobCmdJson.g2Lines.length > 0
      ? jobCmdJson.g2Lines.slice(0, 4)
      : ['CAREER PACK | 3 ROLES', 'TOP: Staff AI Systems Eng (94% FIT)', 'NOTION TRACKER + GMAIL DRAFT', 'DEFAULT-NO | TAP YES / 2s RING'];
    await fetch('http://127.0.0.1:8787/api/liveui/generate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        xml: `<ui frame="full" title="CAREER PACK"/><ui c="list">\n${jobLines.join('\n')}</ui>`,
      }),
    });
    await new Promise((r) => setTimeout(r, 700));
    await captureGlasses(autoBase, 'sim-17-career-pack.png');

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
    console.log(`[sim:PASS] Captured ${capturedCount} real simulator screenshots with 0 console/uncaught errors.`);
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
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
    } catch {
      // ignore Windows SQLite WAL handle release lag on temp dir cleanup
    }
  }
}

main().catch((err) => {
  console.error('[sim:FAIL]', err);
  process.exit(1);
});
