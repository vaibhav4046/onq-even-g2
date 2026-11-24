import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB_DIST = path.join(ROOT, 'apps', 'web', 'dist');
const SCREENSHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startWebDistServer() {
  const srv = http.createServer((req, res) => {
    const reqPath = (req.url ?? '/').split('?')[0];
    const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    let full = path.join(WEB_DIST, rel);
    if (!full.startsWith(WEB_DIST) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      full = path.join(WEB_DIST, 'index.html');
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => srv.close(() => r())),
      });
    });
  });
}

const STATES = [
  'DOSSIER',
  'DETAIL',
  'VOICE_LISTENING',
  'PREVIEW_DEFAULT_NO',
  'ARMED_RING',
  'CONFLICT_409',
  'RECEIPT_DONE',
  'STALE_OFFLINE',
  'EMPTY_ALL_CLEAR',
];

const FORBIDDEN_LEAKS = ['undefined', 'NaN', '[object', 'sk-', 'Bearer ', 'GOCSPX-', 'ntn_'];

function decodePngBlackRatio(pngBuf) {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idats = [];

  while (offset < pngBuf.length) {
    const len = pngBuf.readUInt32BE(offset);
    const type = pngBuf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = pngBuf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idats));
  const bpp = 4; // RGBA from Playwright screenshot
  const stride = width * bpp;
  const recon = Buffer.alloc(height * stride);
  let darkPixels = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (1 + stride)];
    const rowIn = y * (1 + stride) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[rowIn + x];
      const a = x >= bpp ? recon[rowOut + x - bpp] : 0;
      const b = y > 0 ? recon[rowOut - stride + x] : 0;
      const c = x >= bpp && y > 0 ? recon[rowOut - stride + x - bpp] : 0;
      let out = val;
      if (filter === 1) out = (val + a) & 0xff;
      else if (filter === 2) out = (val + b) & 0xff;
      else if (filter === 3) out = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        out = (val + pr) & 0xff;
      }
      recon[rowOut + x] = out;
    }
    for (let px = 0; px < width; px++) {
      const i = rowOut + px * 4;
      // Pure black or near-black waveguide background
      if (recon[i] < 16 && recon[i + 1] < 16 && recon[i + 2] < 16) {
        darkPixels++;
      }
    }
  }
  return darkPixels / (width * height);
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function inspectLensFrame(page) {
  const lens = page.getByTestId('g2-lens');
  await lens.waitFor({ state: 'visible' });
  const metrics = await lens.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const lines = Array.from(el.querySelectorAll('[data-testid^="g2-line-"]')).map(
      (n) => n.textContent ?? '',
    );
    const lineOverflow = Array.from(el.querySelectorAll('[data-testid^="g2-line-"]')).some(
      (n) => n.scrollWidth > n.clientWidth + 1,
    );
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      lineOverflow,
      lines,
      provenance: el.getAttribute('data-provenance') ?? '',
      utf8BytesAttr: Number(el.getAttribute('data-utf8-bytes') ?? '0'),
    };
  });

  const failures = [];
  if (metrics.width !== 576 || metrics.height !== 288) {
    failures.push(`Check 1 (exact 576x288): got ${metrics.width}x${metrics.height}`);
  }
  if (metrics.scrollWidth > metrics.clientWidth || metrics.lineOverflow) {
    failures.push(`Check 2 (horizontal overflow): scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`);
  }
  if (metrics.scrollHeight > metrics.clientHeight) {
    failures.push(`Check 3 (vertical overflow): scrollHeight=${metrics.scrollHeight} > clientHeight=${metrics.clientHeight}`);
  }
  if (metrics.lines.length === 0 || metrics.lines.length > 7) {
    failures.push(`Check 4 (line count 1..7): got ${metrics.lines.length}`);
  }
  for (let i = 0; i < metrics.lines.length; i++) {
    if (metrics.lines[i].length > 42) {
      failures.push(`Check 5 (<= 42 cols): line ${i} length=${metrics.lines[i].length}`);
    }
    if (!/^[\x20-\x7E]*$/.test(metrics.lines[i])) {
      failures.push(`Check 7 (LVGL ASCII): line ${i} contains unsafe glyph`);
    }
  }
  const joined = metrics.lines.join('\n');
  const bytes = Buffer.byteLength(joined, 'utf8');
  if (bytes > 999 || metrics.utf8BytesAttr > 999) {
    failures.push(`Check 6 (<= 999 UTF-8 bytes): got ${bytes}`);
  }

  const png = await lens.screenshot();
  const darkRatio = decodePngBlackRatio(png);
  if (darkRatio < 0.7) {
    failures.push(`Check 8 (>= 70% dark transparent pixels): got ${(darkRatio * 100).toFixed(1)}%`);
  }

  for (const leak of FORBIDDEN_LEAKS) {
    if (joined.includes(leak)) {
      failures.push(`Check 9 (no leaked strings): found "${leak}"`);
    }
  }
  if (!['LIVE', 'DEMO', 'STALE'].includes(metrics.provenance)) {
    failures.push(`Check 10 (provenance tag): invalid "${metrics.provenance}"`);
  }

  return { failures, darkRatio, bytes, lineCount: metrics.lines.length, png };
}

async function main() {
  const webSrv = await startWebDistServer();

  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(err.message));

      for (const stateName of STATES) {
        await page.goto(`${webSrv.url}/?geometry=1&state=${stateName}`, {
          waitUntil: 'networkidle',
        });
        const res = await inspectLensFrame(page);
        if (res.failures.length > 0) {
          throw new Error(`Geometry gate failed on ${stateName}:\n${res.failures.join('\n')}`);
        }
        fs.writeFileSync(path.join(SCREENSHOT_DIR, `geometry-${stateName.toLowerCase()}.png`), res.png);
        console.log(
          `[geometry:PASS] ${stateName.padEnd(18)} | lines=${res.lineCount} | bytes=${res.bytes} | dark=${(res.darkRatio * 100).toFixed(1)}%`,
        );
      }

      // Check 11: Mandatory Negative Control (must FAIL checks 1-5)
      await page.goto(`${webSrv.url}/?geometry=1&state=NEGATIVE_CONTROL_OVERFLOW`, {
        waitUntil: 'networkidle',
      });
      const neg = await inspectLensFrame(page);
      if (neg.failures.length === 0) {
        throw new Error('Check 11 NEGATIVE CONTROL FAILED: checker did not catch intentional overflow!');
      }
      console.log(`[geometry:PASS] CHECK 11 NEGATIVE CONTROL caught ${neg.failures.length} injected defects`);

      // Also check full companion page desktop & mobile responsiveness
      await page.goto(`${webSrv.url}/`, { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'web-companion-desktop.png'), fullPage: false });
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      if (mobileOverflow) {
        throw new Error('Mobile 390x844 horizontal overflow detected on Companion Web UI');
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'web-companion-mobile.png'), fullPage: false });

      if (consoleErrors.length > 0) {
        throw new Error(`Browser console errors detected:\n${consoleErrors.join('\n')}`);
      }
      console.log('[geometry:PASS] All 11 checks + desktop/mobile UI checks passed with 0 console errors.');
    } finally {
      await browser.close();
    }
  } finally {
    await webSrv.close();
  }
}

main().catch((err) => {
  console.error('[geometry:FAIL]', err);
  process.exit(1);
});
