# OnQ - Final Hackathon & Product Hunt Submission Handoff

**Project Root:** `C:\Users\lalwa\.gemini\antigravity\scratch\oncue-even-g2`
**Hard Safety Stop Enforced:** All local building, testing (`225/225` across 19 files), harness benchmarking (`npm run eval:harness` `32/32`), `.ehpk` packaging (`45,961` bytes), simulator capture (`EvenHub Simulator 0.9.5`), security auditing (`10/10` across 93 files), dual-sided 3D WebGL crystal-lens optics (`Front` + `Wearer POV`), `76×76` 4-bit Muse/Duet/Dots Pixel Avatar PNG, Zero-API-Key Local Computer & Coding Delegation Bridge, Live AssemblyAI Duplex Studio, HydraDB-inspired `#architecture` showcase, Dual-Track Telegram Bot API integration (`/api/telegram/*`), TVM Ventures pitch deck (`docs/TVM_PITCH_DECK.md`), and launch film rendering are complete. External DoraHacks / Product Hunt submission and any paid hosting remain unsubmitted for your manual review and final click.

---

## 0. 60-Second OAuth Plug-In Guide (Google Cloud + Notion 2026-03-11 + AI / AssemblyAI)

OnQ boots cold in labeled `DEMO` sandbox mode with zero env vars. To plug in real OAuth / API keys cleanly into a disposable sandbox workspace without touching personal contacts or primary calendars:

1. **Google Cloud Console (OAuth 2.0 + PKCE `S256`):**
   - Create one OAuth 2.0 Web Client in Google Cloud Console.
   - Add Authorized Redirect URI: `http://127.0.0.1:8787/api/auth/google/callback` (legacy compatibility URI `/api/pair/google-callback` is also retained).
   - Enable scopes: `openid email profile`, `calendar.events`, `calendar.readonly`, `gmail.modify`, `drive.readonly`.
   - Export `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (in gitignored `.env` or enter inside `#connectors`), start `npm run dev`, and click **Sign in with Google** in `#connectors`. Server issues single-use CSRF state + PKCE verifier, sets a signed `HttpOnly; SameSite=Lax` cookie, and encrypts refresh tokens inside the AES-256-GCM mode `0600` vault.
   - Zero-OAuth shortcut: paste any RFC 5545 `.ics` export inside the Google Workspace card in `#connectors` for instant live schedule triage.

2. **Notion (`2026-03-11` `data_sources` API):**
   - Option A (1-click token): Share ONE disposable task database with your internal integration (`ntn_...`), open **Connect Notion** in `#connectors`, paste token + Database ID, and click **Discover Schema & Connect**.
   - Option B (OAuth): Set `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, and redirect URI `http://127.0.0.1:8787/api/auth/notion/callback`, then click **Authorize Notion OAuth**.

3. **Multi-Model AI & AssemblyAI Voice (`STT-3.7` + `TTS-1`):**
   - Add any combination of `ANTHROPIC_API_KEY` (`Claude`), `OPENROUTER_API_KEY` (`OpenRouter`), `OPENAI_API_KEY` (`ChatGPT`), or `ASSEMBLYAI_API_KEY` (`AssemblyAI`) in gitignored `.env` or inside `#connectors`.
   - Use **Test Connection** on any connector card (`POST /api/connectors/:provider/test`) to verify real upstream status and round-trip `latencyMs`. Missing keys automatically cascade cleanly (`Claude -> OpenRouter -> ChatGPT -> Deterministic Rules` and `local faster-whisper` fallback).

4. **Physical Even G2 Glasses WebView Pairing:**
   - Because Even Realities blocks Google OAuth sign-in inside the embedded G2 WebView, open **Link Even G2 Glasses** at the bottom of `#connectors` to mint a 15-minute pairing handshake for `dist/onq.ehpk`.

---

## 1. Verified Artifact Inventory

| Artifact | Path | Observed Verification |
| :--- | :--- | :--- |
| **Monorepo Source** | `packages/core`, `apps/server`, `apps/glasses`, `apps/web` | `npm ci && npm test && npm run build` passed cold (**225 / 225 tests** across 19 files) |
| **Orchestration & Safety Eval** | `docs/HARNESS_EVAL.json` (`npm run eval:harness`) | **32/32 intents (100%)**, **5/5 prompt injections blocked**, **3/3 409 locks**, **5/5 RMS silence rejections**, **4-tier failover matrix** |
| **EvenHub G2 Package** | `dist/onq.ehpk` | Packed via `@evenrealities/evenhub-cli@0.2.0` (`45,961` bytes, SDK `0.0.16`, `min_app_version 2.2.10`, 0 warnings, 0 secrets) |
| **Official Simulator Captures** | `docs/screenshots/sim-01..07.png` | 7 real 576x288 RGBA captures from `@evenrealities/evenhub-simulator@0.9.5` (including native `ListContainer`) with 0 uncaught/unhandled errors |
| **11-Check Geometry Gate** | `scripts/verify-geometry.mjs` + `docs/screenshots/geometry-*.png` | `11 / 11` PASS across all lens states (`97.2%-97.9%` black pixels, `<= 260` UTF-8 bytes) + Check 11 Negative Control |
| **Security Audit Report** | `SECURITY_AUDIT.md` (`scripts/security-scan.mjs`) | `10 / 10` domains PASS (`0` High/Critical findings, `0` secrets across 93 scanned files + `.ehpk`, `npm audit --omit=dev: 0 vulnerabilities`) |
| **TVM Ventures Pitch Deck** | `docs/TVM_PITCH_DECK.md` | 10-slide Demo Day pitch deck mapped to judging weights + Dual-Track Track 04 / Telegram live script |
| **Clean-Room Verification Log** | `docs/VERIFICATION_LOG.txt` | Fresh-clone verification transcript with zero env vars |
| **Product Launch Film** | `media/out/onq-launch-demo.mp4` | `1920x1080`, `60 fps`, `120.83s` (`2:01 <= 2:45`), `8.73 MB` H.264 + 48 kHz AAC stereo (`-14 LUFS`, `AssemblyAI-TTS-1` VO + unified 3D G2 + EvenHub Simulator 0.9.5 footage) |
| **Product Hunt Launch Kit** | `media/product-hunt/` | `gallery-01-hero.png` .. `gallery-04-architecture.png` (`1270x760`), `thumbnail-240x240.gif`, `PRODUCT_HUNT_LAUNCH_COPY.md` |
| **API Feedback Deliverable** | `API_FEEDBACK.md` | 5 concrete Even Hub SDK `0.0.16`, Simulator `0.9.5`, and WebView OAuth PKCE feature requests |
| **Competitive Audit Matrix** | `docs/COMPETITIVE_ANALYSIS.md` | Track 04 Read-and-Write rubric & head-to-head comparison against field entries |

---

## 2. Ready-to-Paste DoraHacks Submission Copy

### Project Name
`OnQ`

### Track
`04. AI Assistants & Work + Track 01 / Best Telegram Integration (Google Workspace · Notion · Telegram · Claude / OpenRouter / ChatGPT)`

### One-Liner (118 chars)
`Own the 90 seconds between meetings on Even G2: Calendar+Gmail+Drive brief, voice shift, 409 conflict lock & 2s undo.`

### Full Description (Copy-Paste Ready)
```markdown
## The 90-Second Corridor Problem
Every workday, founders, engineers, and investors lose the 90 seconds between back-to-back meetings juggling Google Calendar, Gmail, Google Drive, and Notion on their phone while walking into a room (Microsoft Work Trend Index 2023-2025: 57% of work time spent communicating, up to 275 daily interruptions, 68% lacking uninterrupted focus time; Mark, Gudith & Klocke CHI '08 doi:10.1145/1357054.1357072).

OnQ turns Even Realities G2 into a private, hands-free corridor copilot: one 42-column card tells you who you are meeting, what they just asked in Gmail, and the linked Drive/Notion snippet. One voice phrase or two R1 ring gestures shifts the meeting, sends a grounded reply, captures live RAM-only diarized meeting notes, or builds a Notion + Calendar follow-up pack behind four deterministic safety locks.

## Try It in 10 Seconds (Zero API Keys Required)
git clone <YOUR_PUBLIC_REPO_URL>
cd onq-even-g2
npm ci && npm test && npm run eval:harness && npm run build && npm run pack
npm run dev

Open http://127.0.0.1:5173 for the interactive 3D Even G2 hardware stage, 576x288 Browser Optical Simulator, Harness Eval Telemetry, and 1-Click Connectors Hub, or sideload dist/onq.ehpk in Even Hub.

## Verified, Not Claimed
- 225 / 225 automated tests passing via npm test (core, 4-bit Muse/Duet Pixel Avatar, Local Computer Bridge & Task Engine, PKCE OAuth, Telegram Bot API, 4-tier failover, 25x concurrency races, WS/AssemblyAI, Postgres, fault-injection tests, 0 keys required)
- Reproducible Harness Eval (npm run eval:harness -> docs/HARNESS_EVAL.json): 32/32 intents (100%), 5/5 prompt injections blocked, 3/3 HTTP 409 conflict locks, 5/5 RMS silence rejections, 4-tier cascading failover matrix
- 11 / 11 Chromium 576x288 Geometry Gate passing across all lens states + Check 11 Negative Control
- 7 real 576x288 captures in @evenrealities/evenhub-simulator@0.9.5 with 0 uncaught/unhandled errors
- 10 / 10 Security Audit domains PASS (SECURITY_AUDIT.md, 0 secrets in repo or dist/onq.ehpk)

## Honest Limits & Pre-Nov 23 Disclosure
- Verified end-to-end in Even Hub Simulator 0.9.5, our Chromium Geometry Gate, and automated HTTP suites. Physical Even G2 + R1 ring hardware testing is pending.
- 100% of OnQ application code, tests, UI, and launch media were built during the Nov 23-29, 2026 hackathon window using standard OSS packages (@evenrealities/even_hub_sdk@0.0.16, three, @react-three/fiber, chrono-node, React, Tailwind CSS, Vite, Vitest, Playwright).

## Business Potential
Target $7/month Work-Pro tier (~$0.001/brief unit cost because deterministic rules handle triage, date parsing, and conflict locking before optional LLM compression).
```

---

## 3. Manual Pre-Publish Checklist
1. Push `onq-even-g2` to a public GitHub repository (`git remote add origin ... && git push -u origin master`).
2. Upload `media/out/onq-launch-demo.mp4` (`2:01`, 1080p60, `8.73 MB`, voiced with `AssemblyAI-TTS-1`) to YouTube/DoraHacks and attach `dist/onq.ehpk`.
3. Paste the Track 04 description above + the 5 requests from `API_FEEDBACK.md` into DoraHacks and submit.
4. For Product Hunt: upload `media/product-hunt/gallery-01..04.png`, `thumbnail-240x240.gif`, and paste `media/product-hunt/PRODUCT_HUNT_LAUNCH_COPY.md`.
