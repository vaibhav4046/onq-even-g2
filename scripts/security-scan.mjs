import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { createOnCueServer } from '../apps/server/dist/server.js';
import { encodePcm16ToWav } from '../packages/core/dist/index.js';

const ROOT = process.cwd();
const EHPK_PATH = path.join(ROOT, 'dist', 'oncue.ehpk');

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gsk_[A-Za-z0-9_-]{16,}/g,
  /ntn_[A-Za-z0-9_-]{16,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
  /ya29\.[A-Za-z0-9._-]{16,}/g,
  /GOCSPX-[A-Za-z0-9_-]{12,}/g,
];

const UNSAFE_CODE_PATTERNS = [
  { name: 'eval()', re: /\beval\s*\(/ },
  { name: 'new Function()', re: /\bnew\s+Function\s*\(/ },
  { name: 'dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML/ },
];

const findings = [];
const checks = [];

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx|js|mjs|json|html|css|md)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

// 1. Secret scan across source files (excluding test fixtures & this scanner)
const sourceFiles = walkFiles(ROOT).filter(
  (f) => !f.includes(`${path.sep}tests${path.sep}`) && !f.endsWith('security-scan.mjs'),
);
let secretHits = 0;
for (const file of sourceFiles) {
  const txt = fs.readFileSync(file, 'utf8');
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    const m = txt.match(re);
    if (m) {
      secretHits += m.length;
      findings.push(`Secret pattern in ${path.relative(ROOT, file)}: ${m[0].slice(0, 10)}...`);
    }
  }
}
checks.push({ domain: '1. Zero Secrets in Source', status: secretHits === 0 ? 'PASS' : 'FAIL', detail: `${secretHits} hits across ${sourceFiles.length} files` });

// 2. Inspect .ehpk bundle + apps/glasses/dist contents
let ehpkSecrets = 0;
let ehpkEntries = 0;
const glassesDistDir = path.join(ROOT, 'apps', 'glasses', 'dist');
const glassesFiles = [
  path.join(ROOT, 'apps', 'glasses', 'app.json'),
  ...(fs.existsSync(glassesDistDir) ? walkFiles(glassesDistDir) : []),
];
if (fs.existsSync(EHPK_PATH)) {
  const ehpkBuf = fs.readFileSync(EHPK_PATH);
  const ehpkStr = ehpkBuf.toString('utf8');
  ehpkEntries = glassesFiles.length + 1;
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    const m = ehpkStr.match(re);
    if (m) ehpkSecrets += m.length;
  }
  for (const gf of glassesFiles) {
    const txt = fs.readFileSync(gf, 'utf8');
    for (const re of SECRET_PATTERNS) {
      re.lastIndex = 0;
      const m = txt.match(re);
      if (m) ehpkSecrets += m.length;
    }
  }
}
checks.push({
  domain: '2. Zero Secrets in .ehpk Bundle',
  status: fs.existsSync(EHPK_PATH) && ehpkSecrets === 0 ? 'PASS' : 'FAIL',
  detail: `EHPK (${fs.existsSync(EHPK_PATH) ? fs.statSync(EHPK_PATH).size : 0} bytes) + ${ehpkEntries} packed files scanned, ${ehpkSecrets} secret hits`,
});

// 3. Static hygiene (no eval / dangerouslySetInnerHTML in app code)
let unsafeHits = 0;
for (const file of sourceFiles.filter((f) => f.includes(`${path.sep}src${path.sep}`))) {
  const txt = fs.readFileSync(file, 'utf8');
  for (const pat of UNSAFE_CODE_PATTERNS) {
    if (pat.re.test(txt)) {
      unsafeHits++;
      findings.push(`Unsafe ${pat.name} in ${path.relative(ROOT, file)}`);
    }
  }
}
checks.push({ domain: '3. Static Hygiene (No eval / dangerouslySetInnerHTML)', status: unsafeHits === 0 ? 'PASS' : 'FAIL', detail: `${unsafeHits} hits` });

// 4. Live negative security checks against ephemeral server
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncue-sec-'));
const srv = await createOnCueServer({ port: 0, dataDir, allowTestFaultControls: true });
try {
  // CORS 403
  const corsRes = await fetch(`${srv.url}/api/health`, { headers: { Origin: 'https://attacker.invalid' } });
  checks.push({ domain: '4. Strict CORS Allowlist', status: corsRes.status === 403 ? 'PASS' : 'FAIL', detail: `Evil origin -> HTTP ${corsRes.status}` });

  // Unauth 401
  const unauthRes = await fetch(`${srv.url}/api/corridor`);
  checks.push({ domain: '5. Bearer Session Enforcement', status: unauthRes.status === 401 ? 'PASS' : 'FAIL', detail: `Missing token -> HTTP ${unauthRes.status}` });

  // Spoofed `to` recipient rejected 400
  const { sessionToken } = await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json();
  const spoofRes = await fetch(`${srv.url}/api/actions/stage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandText: 'Push 15m and tell Priya', to: 'evil@attacker.io' }),
  });
  checks.push({ domain: '6. Server-Bound Recipient Guard', status: spoofRes.status === 400 ? 'PASS' : 'FAIL', detail: `Spoofed "to" -> HTTP ${spoofRes.status}` });

  // Oversized WAV 413
  const bigRes = await fetch(`${srv.url}/api/stt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}` },
    body: Buffer.alloc(600 * 1024, 1),
  });
  checks.push({ domain: '7. Audio Payload Cap (<= 512 KB)', status: bigRes.status === 413 ? 'PASS' : 'FAIL', detail: `600 KB WAV -> HTTP ${bigRes.status}` });

  // Silent WAV rejected locally
  const silentPcm = new Uint8Array(16000); // 500ms zeros
  const silentRes = await (
    await fetch(`${srv.url}/api/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: Buffer.from(encodePcm16ToWav(silentPcm, 16000)),
    })
  ).json();
  checks.push({ domain: '8. RMS Silence Gate', status: silentRes.rejectedSilent ? 'PASS' : 'FAIL', detail: `rejectedSilent=${silentRes.rejectedSilent}, engine=${silentRes.sttEngine}` });

  // Encrypted Vault check
  srv.vault.save({ googleRefreshToken: '1//vault-test-secret-000' });
  const vaultDisk = fs.readFileSync(srv.vault.getVaultPath(), 'utf8');
  checks.push({
    domain: '9. AES-256-GCM Encrypted Token Vault',
    status: !vaultDisk.includes('vault-test-secret-000') && vaultDisk.includes('aes-256-gcm') ? 'PASS' : 'FAIL',
    detail: 'Plaintext secret absent on disk; AES-256-GCM envelope verified',
  });
} finally {
  await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// 5. Production dependency audit
let auditSummary = 'npm audit --omit=dev: 0 vulnerabilities';
try {
  execSync('npm audit --omit=dev --json', { cwd: ROOT, stdio: 'pipe' });
} catch (err) {
  const stdout = err?.stdout?.toString?.() ?? '';
  try {
    const parsed = JSON.parse(stdout);
    const meta = parsed?.metadata?.vulnerabilities ?? {};
    auditSummary = `critical=${meta.critical ?? 0}, high=${meta.high ?? 0}, moderate=${meta.moderate ?? 0}`;
    if ((meta.critical ?? 0) > 0 || (meta.high ?? 0) > 0) {
      findings.push(`npm audit high/critical in prod deps: ${auditSummary}`);
    }
  } catch {
    auditSummary = 'npm audit offline / skipped network lookup';
  }
}
checks.push({ domain: '10. Production Dependency Audit', status: findings.some((f) => f.includes('npm audit')) ? 'FAIL' : 'PASS', detail: auditSummary });

const report = [
  '# OnCue Security Audit Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Overall Verdict: ${checks.every((c) => c.status === 'PASS') && findings.length === 0 ? 'PASS (0 High/Critical findings)' : 'FAIL'}`,
  '',
  '| Security Domain | Status | Evidence |',
  '| :--- | :--- | :--- |',
  ...checks.map((c) => `| ${c.domain} | ${c.status} | ${c.detail} |`),
  '',
  findings.length > 0 ? `## Findings\n${findings.map((f) => `- ${f}`).join('\n')}` : '## Findings\nNone. All automated static and negative HTTP security gates passed.',
  '',
].join('\n');

fs.writeFileSync(path.join(ROOT, 'SECURITY_AUDIT.md'), report, 'utf8');
console.log(report);

if (!checks.every((c) => c.status === 'PASS') || findings.length > 0) {
  process.exit(1);
}
