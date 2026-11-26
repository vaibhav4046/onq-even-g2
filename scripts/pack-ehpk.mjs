import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const baseManifestPath = path.join(root, 'apps', 'glasses', 'app.json');
const buildDir = path.join(root, 'apps', 'glasses', 'dist');
// ONQ_PACK_OUT (used by the host's package builder) writes the package and its manifest outside dist/,
// so a user-specific build never overwrites the committed dist/onq.ehpk.
const customOut = process.env.ONQ_PACK_OUT?.trim();
const outEhpk = customOut ? path.resolve(customOut) : path.join(distDir, 'onq.ehpk');

// Optional: ONQ_RELAY_URL adds the user's own relay (https tunnel or LAN address) to the network whitelist
// for a paired physical-glasses build. The committed app.json stays loopback-only.
let manifestPath = baseManifestPath;
const relayRaw = process.env.ONQ_RELAY_URL?.trim();
if (relayRaw) {
  let origin;
  try {
    const u = new URL(relayRaw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
    origin = u.origin;
  } catch {
    console.error(`[pack] ONQ_RELAY_URL is not a valid http(s) URL: ${relayRaw}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(baseManifestPath, 'utf8'));
  const net = manifest.permissions.find((p) => p.name === 'network');
  if (!net.whitelist.includes(origin)) net.whitelist.push(origin);
  manifestPath = customOut ? `${outEhpk}.manifest.json` : path.join(distDir, 'app.relay.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[pack] Relay origin added to whitelist: ${origin}`);
}

if (customOut) fs.mkdirSync(path.dirname(outEhpk), { recursive: true });
const cliBin = path.join(root, 'node_modules', '@evenrealities', 'evenhub-cli', 'main.js');
execFileSync(process.execPath, [cliBin, 'pack', manifestPath, buildDir, '-o', outEhpk, '--sdk-ver', '0.0.16'], {
  stdio: 'inherit',
});

const stat = fs.statSync(outEhpk);
console.log(`[pack] Built ${outEhpk} (${stat.size} bytes)`);
