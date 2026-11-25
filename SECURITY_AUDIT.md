# OnQ Security Audit Report

Generated: 2026-11-25T04:14:42.545Z
Overall Verdict: PASS (0 High/Critical findings)

| Security Domain | Status | Evidence |
| :--- | :--- | :--- |
| 1. Zero Secrets in Source | PASS | 0 hits across 86 files |
| 2. Zero Secrets in .ehpk Bundle | PASS | EHPK (45135 bytes) + 4 packed files scanned, 0 secret hits |
| 3. Static Hygiene (No eval / dangerouslySetInnerHTML) | PASS | 0 hits |
| 4. Strict CORS Allowlist | PASS | Evil origin -> HTTP 403 |
| 5. Bearer Session Enforcement | PASS | Missing token -> HTTP 401 |
| 6. Server-Bound Recipient Guard | PASS | Spoofed "to" -> HTTP 400 |
| 7. Audio Payload Cap (<= 512 KB) | PASS | 600 KB WAV -> HTTP 413 |
| 8. RMS Silence Gate | PASS | rejectedSilent=true, engine=rms-silence-gate |
| 9. AES-256-GCM Encrypted Token Vault | PASS | Plaintext secret absent on disk; AES-256-GCM envelope verified |
| 10. Production Dependency Audit | PASS | npm audit --omit=dev: 0 vulnerabilities |

## Findings
None. All automated static and negative HTTP security gates passed.
