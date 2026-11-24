# OnCue - Final Hackathon & Product Hunt Submission Handoff

**Clean-Room Verified Code Commit:** `1954a99` (verified in `docs/VERIFICATION_LOG.txt`)
**Project Root:** `C:\Users\lalwa\.gemini\antigravity\scratch\oncue-even-g2`
**Hard Safety Stop Enforced:** All local building, testing, `.ehpk` packaging, simulator capture, security auditing, UI overhaul, and launch film rendering are complete. External DoraHacks / Product Hunt submission and any paid hosting remain unsubmitted for your manual review and final click.

---

## 0. 60-Second Live Google OAuth + Notion `2026-03-11` Plug-In Checklist (Safe Test Isolation)

OnCue boots cleanly offline in labeled `DEMO` mode with zero env vars. To connect a **real Google Workspace + Notion** sandbox account in 60 seconds without risking personal contacts or primary calendars:
1. Create a dedicated **Google Cloud OAuth Desktop/Web Client** with scopes `calendar.events`, `gmail.readonly`, `gmail.compose`, `drive.readonly` and redirect URI `http://127.0.0.1:8787/api/pair/google-callback`.
2. Export `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` before running `npm run dev` (use a secondary test calendar or self-addressed test Gmail thread).
3. In Notion (`2026-03-11` `data_sources` API enabled cleanly), share ONE disposable test task database with your internal integration (`ntn_...`).
4. Open `http://127.0.0.1:5173/#pair`: click `Mint 6-Digit Pairing Code` -> `Exchange Code` -> click `Open Google OAuth` + click `Test Notion Auto-Schema` -> `Save to 0600 Vault`. Refresh tokens stay encrypted at mode `0600` (AES-256-GCM), and lens badge switches from `DEMO` to `LIVE`.
5. Zero OAuth shortcut: paste any exported `.ics` calendar directly into `03. ZERO-CONFIG .ICS CALENDAR IMPORT` on `/#pair` for immediate `LIVE` schedule triage.

---

## 1. Verified Artifact Inventory

| Artifact | Path | Observed Verification |
| :--- | :--- | :--- |
| **Monorepo Source** | `packages/core`, `apps/server`, `apps/glasses`, `apps/web` | `npm ci && npm test && npm run build` passed cold (`163 / 163` tests: 113 core + 50 server/live-provider/Postgres/fault tests) |
| **EvenHub G2 Package** | `dist/oncue.ehpk` | Packed via `@evenrealities/evenhub-cli@0.2.0` (`44,730` bytes, SDK `0.0.16`, `min_app_version 2.2.10`, 0 warnings, 0 secrets) |
| **Official Simulator Captures** | `docs/screenshots/sim-01..07.png` | 7 real 576x288 RGBA captures from `@evenrealities/evenhub-simulator@0.9.5` (including native `ListContainer`) with 0 uncaught/unhandled errors |
| **11-Check Geometry Gate** | `scripts/verify-geometry.mjs` + `docs/screenshots/geometry-*.png` | `11 / 11` PASS across all 9 lens states (`97.3%-98.0%` dark pixels, `<= 257` UTF-8 bytes) + Check 11 Negative Control caught 3 injected defects |
| **Security Audit Report** | `SECURITY_AUDIT.md` (`scripts/security-scan.mjs`) | `10 / 10` domains PASS (`0` High/Critical findings, `0` secrets in source/EHPK, `npm audit --omit=dev: 0 vulnerabilities`) |
| **Clean-Room Verification Log** | `docs/VERIFICATION_LOG.txt` | Full fresh-clone terminal transcript with zero API keys set (`=== ALL CLEAN ROOM GATES PASSED ===`) |
| **Product Launch Film** | `media/out/oncue-launch-demo.mp4` | `1920x1080`, `60 fps`, `113.17s` (`1:53 <= 2:45`), `8.82 MB` H.264 + 48 kHz AAC stereo (`-14 LUFS`, calm editorial VO + minimal ambient pad + continuous live desktop & EvenHub Simulator 0.9.5 footage) |
| **Product Hunt Launch Kit** | `media/product-hunt/` | `gallery-01-hero.png` .. `gallery-04-architecture.png` (`1270x760`), `thumbnail-240x240.gif`, `PRODUCT_HUNT_LAUNCH_COPY.md` |
| **API Feedback Deliverable** | `API_FEEDBACK.md` | 5 concrete Even Hub SDK `0.0.16`, Simulator `0.9.5`, and WebView OAuth PKCE feature requests |

---

## 2. Ready-to-Paste DoraHacks Submission Copy

### Project Name
`OnCue`

### Track
`04. AI Assistants & Work (Google Workspace: Gmail, Calendar, Drive · Notion · Claude / OpenRouter / ChatGPT)`

### One-Liner (118 chars)
`Own the 90 seconds between meetings on Even G2: Calendar+Gmail+Drive brief, voice shift, 409 conflict lock & 2s undo.`

### Full Description (Copy-Paste Ready)
```markdown
## The 90-Second Corridor Problem
Every workday, founders, engineers, and investors lose the 90 seconds between back-to-back meetings juggling Google Calendar, Gmail, Google Drive, and Notion on their phone while walking into a room.

OnCue turns Even Realities G2 into a private, hands-free corridor copilot: one 42-column card tells you who you are meeting, what they just asked in Gmail, and the linked Drive/Notion snippet. One voice phrase or two R1 ring gestures shifts the meeting, sends a grounded reply, or captures a Notion + Calendar action pack behind four deterministic safety locks.

## Try It in 10 Seconds (Zero API Keys Required)
git clone <YOUR_PUBLIC_REPO_URL>
cd oncue-even-g2
npm ci && npm test && npm run build && npm run pack
npm run dev

Open http://127.0.0.1:5173 for the interactive 576x288 Browser Optical Simulator (labeled DEMO sandbox) and Phone OAuth Pairing Console, or sideload dist/oncue.ehpk in Even Hub.

## How OnCue Works (Read -> Stage -> Arm 2.0s Ring -> Receipt)
1. Corridor Dossier (READ): Aggregates upcoming Calendar events, recent attendee Gmail threads, linked Drive doc snippets, and Notion tasks into <= 7 lines, <= 42 columns, <= 999 UTF-8 bytes, and >= 70% pure black transparent pixels.
2. Voice Capture & RMS Silence Gate (16 kHz PCM): Defensive frame.slice() audio buffering rejects accidental silent taps (< 350ms or RMS < 0.012) locally with 0 STT calls, then transcribes valid speech locally via Whisper + deterministic chrono-node date parsing.
3. Default-NO Confirm Gate: Voice NEVER executes directly. It stages a single-use ActionPreview (45s TTL) defaulting strictly to [NO - CANCEL].
4. Commit-Locked 2.0s 4-Bit PNG Undo Ring: Swiping to YES and tapping sweeps a 76x76 4-bit grayscale PNG ring (updateImageRawData at <= 4 Hz). Any tap or FOREGROUND_EXIT cancels with zero writes. At 0.0s, the state machine locks inputs synchronously before network I/O.
5. HTTP 409 Conflict Hard-Lock & Code-Guard: Re-queries Calendar Free/Busy, Gmail historyId, and Notion last_edited_time synchronously before committing. Overlaps or stale threads abort with HTTP 409 and suggest the next verified free slot. Gmail recipients bind strictly server-side from thread metadata, and Code-Guard blocks LLM-invented emails, times, or prompt injections.

## Verified, Not Claimed
- 163 / 163 automated tests passing via npm test (113 pure core + 50 HTTP/live-provider/Postgres/fault-injection tests, 0 keys required)
- 11 / 11 Chromium 576x288 Geometry Gate passing across all 9 states + Check 11 Negative Control
- 7 real 576x288 captures in @evenrealities/evenhub-simulator@0.9.5 with 0 uncaught/unhandled errors
- 10 / 10 Security Audit domains PASS (SECURITY_AUDIT.md, 0 secrets in repo or dist/oncue.ehpk)
- Clean-room fresh-clone verified in docs/VERIFICATION_LOG.txt

## Honest Limits & Pre-Nov 23 Disclosure
- Verified end-to-end in Even Hub Simulator 0.9.5, our Chromium Geometry Gate, and automated HTTP suites. Physical Even G2 + R1 ring hardware testing is pending.
- 100% of OnCue application code, tests, UI, and launch media were built during the Nov 23-29, 2026 hackathon window using standard OSS packages (@evenrealities/even_hub_sdk@0.0.16, chrono-node, React, Tailwind CSS, Vite, Vitest, Playwright).

## Business Potential
Target $7/month Work-Pro tier (~$0.001/brief unit cost because deterministic rules handle triage, date parsing, and conflict locking before optional LLM compression).
```

---

## 3. Manual Pre-Publish Checklist for Vaibhav
1. Push `oncue-even-g2` to a public GitHub repository (`git remote add origin ... && git push -u origin master`).
2. Upload `media/out/oncue-launch-demo.mp4` (`1:53`, 1080p60, `8.82 MB`) to YouTube/DoraHacks and attach `dist/oncue.ehpk`.
3. Paste the Track 04 description above + the 5 requests from `API_FEEDBACK.md` into DoraHacks and click Submit.
4. For Product Hunt: upload `media/product-hunt/gallery-01..04.png`, `thumbnail-240x240.gif`, and paste `media/product-hunt/PRODUCT_HUNT_LAUNCH_COPY.md`.
