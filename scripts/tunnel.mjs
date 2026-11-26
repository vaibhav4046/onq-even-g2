import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.PORT ?? 8787);
const targetUrl = `http://127.0.0.1:${port}`;
const QUICK_TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function findCloudflared() {
  const win = process.platform === 'win32';
  const extras = win
    ? [
        process.env.APPDATA ? path.win32.join(process.env.APPDATA, 'npm', 'cloudflared.cmd') : '',
        process.env.ProgramFiles ? path.win32.join(process.env.ProgramFiles, 'cloudflared', 'cloudflared.exe') : '',
        process.env['ProgramFiles(x86)'] ? path.win32.join(process.env['ProgramFiles(x86)'], 'cloudflared', 'cloudflared.exe') : '',
      ].filter(Boolean)
    : ['/usr/local/bin/cloudflared', '/opt/homebrew/bin/cloudflared', '/usr/bin/cloudflared'];
  for (const p of extras) {
    if (fs.existsSync(p)) return p;
  }
  const exts = win ? ['.exe', '.cmd', '.bat'] : [''];
  const dirs = (process.env.PATH ?? process.env.Path ?? '').split(win ? ';' : ':').filter(Boolean);
  for (const d of dirs) {
    for (const ext of exts) {
      const candidate = path.join(d.replace(/^"|"$/g, ''), `cloudflared${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function main() {
  try {
    const res = await fetch(`${targetUrl}/api/health`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[onq:tunnel] Local OnQ relay reachable at ${targetUrl}`);
  } catch {
    console.error(`[onq:tunnel] Start OnQ first (npm run dev) so ${targetUrl} is listening.`);
    process.exit(1);
  }

  const preset = process.env.ONQ_PUBLIC_URL?.trim();
  if (preset) {
    console.log(`[onq:tunnel] ONQ_PUBLIC_URL configured: ${preset}`);
    console.log(`[onq:tunnel] Build remote glasses package: ONQ_RELAY_ORIGIN=${preset} npm run pack`);
    console.log('[onq:tunnel] Zero-trust active: paired device tokens + Kill Switch (HTTP 423) + Default-NO.');
    return;
  }

  const bin = findCloudflared();
  if (!bin) {
    console.error('[onq:tunnel] cloudflared not found on PATH.');
    console.error('  Option A (Cloudflare Quick Tunnel): winget install Cloudflare.cloudflared');
    console.error(`  Option B (Tailscale Funnel):        tailscale funnel ${port}`);
    console.error('  Option C (Custom HTTPS URL):        $env:ONQ_PUBLIC_URL="https://onq.example.com"; npm run dev');
    process.exit(1);
  }

  console.log(`[onq:tunnel] Starting Cloudflare Quick Tunnel -> ${targetUrl} (Ctrl+C to stop)...`);
  const isShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  const args = ['tunnel', '--url', targetUrl, '--no-autoupdate'];
  const child = isShim
    ? spawn(`"${bin}" ${args.join(' ')}`, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let announced = false;
  const onData = (chunk) => {
    const text = String(chunk);
    const match = QUICK_TUNNEL_RE.exec(text);
    if (match && !announced) {
      announced = true;
      const url = match[0];
      console.log('');
      console.log('================================================================');
      console.log(`  ONQ REMOTE PC TUNNEL LIVE: ${url}`);
      console.log(`  Pair glasses/phone:        ${url}/g/?pair=<6-digit-code>`);
      console.log(`  Optional remote .ehpk:     ONQ_RELAY_ORIGIN=${url} npm run pack`);
      console.log('  Zero-Trust: Device Token + Kill Switch (423) + Default-NO ON');
      console.log('================================================================');
      console.log('');
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[onq:tunnel] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
