# OnQ - Final Hackathon & Product Hunt Submission Handoff

**Project Root:** `C:\Users\lalwa\.gemini\antigravity\scratch\oncue-even-g2`
**Public Repository:** https://github.com/vaibhav4046/onq-even-g2
**Live Docs & Privacy Policy:** https://vaibhav4046.github.io/onq-even-g2/ · https://vaibhav4046.github.io/onq-even-g2/privacy.html
**Hard Safety Stop Enforced:** All local building, testing (`228/228` across 20 files), harness benchmarking (`npm run eval:harness` `32/32`), `.ehpk` packaging (`46,657` bytes), simulator capture (`EvenHub Simulator 0.9.5`, 9 captures), security auditing (`10/10` across 97 files), dual-sided 3D WebGL crystal-lens optics (`Front` + `Wearer POV`), `76×76` 4-bit Muse/Duet/Dots Pixel Avatar PNG, Universal User AI Orchestrator (`OpenRouter / ChatGPT / Claude / Local CLIs / Rules`), Self-Harnessing 24/7 Proactive Agent, Zero-API-Key Local Computer & Coding Delegation Bridge, Live AssemblyAI Duplex Studio, HydraDB-inspired `#architecture` showcase, Dual-Track Telegram Bot API integration (`/api/telegram/*`), TVM Ventures pitch deck (`docs/TVM_PITCH_DECK.md`), Hackathon Rubric Audit (`docs/HACKATHON_RUBRIC_AUDIT.md`), and launch film rendering are complete. External DoraHacks / Product Hunt submission and any paid hosting remain unsubmitted for your manual review and final click.

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
   - Use the **Universal User AI Orchestrator** (`Auto Smart Failover`, `OpenRouter`, `ChatGPT`, `Claude`, `Local CLIs`, `Rules`) switcher at the top of `#connectors` (`POST /api/connectors/orchestrator`) and **Test Connection** (`POST /api/connectors/:provider/test`) to verify upstream status and `latencyMs`. Missing or quota-cooled keys cascade cleanly (`Claude / OpenRouter / ChatGPT -> Deterministic Rules` and `local faster-whisper` fallback).
   - The **Self-Harnessing 24/7 Proactive Agent** (`POST /api/proactive/synthesize`, `POST /api/proactive/stage-harness`) synthesizes Code-Guard-verified 42-column corridor plans and pushes them over SSE while `idle` strictly behind `Default-NO`.

4. **Physical Even G2 Glasses WebView Pairing:**
   - Because Even Realities blocks Google OAuth sign-in inside the embedded G2 WebView, open **Link Even G2 Glasses** at the bottom of `#connectors` to mint a 15-minute pairing handshake for `dist/onq.ehpk`.

---

## 1. Verified Artifact Inventory

| Artifact | Path | Observed Verification |
| :--- | :--- | :--- |
| **Monorepo Source** | `packages/core`, `apps/server`, `apps/glasses`, `apps/web` | `npm ci && npm test && npm run build` passed cold (**228 / 228 tests** across 20 files) |
| **Orchestration & Safety Eval** | `docs/HARNESS_EVAL.json` (`npm run eval:harness`) | **32/32 intents (100%)**, **5/5 prompt injections blocked**, **3/3 409 locks**, **5/5 RMS silence rejections**, **4-tier failover matrix** |
| **EvenHub G2 Package** | `dist/onq.ehpk` | Packed via `@evenrealities/evenhub-cli@0.2.0` (`46,657` bytes, SDK `0.0.16`, `min_app_version 2.2.10`, 0 warnings, 0 secrets) |
| **Official Simulator Captures** | `docs/screenshots/sim-01..09.png` | **9 real 576x288 RGBA captures** from `@evenrealities/evenhub-simulator@0.9.5` (native `ListContainer`, 76x76 4-bit Gray4 ring, `409` lock, 76x76 4-bit Muse Pixel Avatar, Self-Harnessing Proactive Agent card) with 0 uncaught/unhandled errors |
| **11-Check Geometry Gate** | `scripts/verify-geometry.mjs` + `docs/screenshots/geometry-*.png` | `11 / 11` PASS across all lens states (`97.2%-97.9%` black pixels, `<= 260` UTF-8 bytes) + Check 11 Negative Control |
| **Security Audit Report** | `SECURITY_AUDIT.md` (`scripts/security-scan.mjs`) | `10 / 10` domains PASS (`0` High/Critical findings, `0` secrets across 97 scanned files + `.ehpk`, `npm audit --omit=dev: 0 vulnerabilities`) |
| **Hackathon Rubric Audit** | `docs/HACKATHON_RUBRIC_AUDIT.md` | Full rubric-to-implementation & evidence map for Even Realities × TVM Ventures × Daos Hub (DoraHacks) |
| **Live GitHub Pages & Privacy** | `docs/index.html`, `docs/privacy.html`, `docs/terms.html` | Hosted at `https://vaibhav4046.github.io/onq-even-g2/` and `https://vaibhav4046.github.io/onq-even-g2/privacy.html` |
| **TVM Ventures Pitch Deck** | `docs/TVM_PITCH_DECK.md` | 10-slide Demo Day pitch deck mapped to judging weights + Dual-Track Track 04 / Telegram live script |
| **Clean-Room Verification Log** | `docs/VERIFICATION_LOG.txt` | Fresh-clone verification transcript with zero env vars |
| **Product Launch Film** | `media/out/onq-launch-demo.mp4` | `1920x1080`, `60 fps`, `120.84s` (`2:01 <= 2:45`), H.264 + 48 kHz AAC stereo (`AssemblyAI-TTS-1` VO + unified 3D G2 + EvenHub Simulator 0.9.5 footage) |
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
git clone https://github.com/vaibhav4046/onq-even-g2
cd onq-even-g2
npm ci && npm test && npm run eval:harness && npm run build && npm run pack
npm run dev

Open http://127.0.0.1:5173 for the interactive 3D Even G2 hardware stage, 576x288 Browser Optical Simulator, Harness Eval Telemetry, Self-Harnessing 24/7 Proactive Agent, and 1-Click Connectors Hub + Universal AI Orchestrator (`OpenRouter / ChatGPT / Claude`), or sideload dist/onq.ehpk in Even Hub.

## Verified, Not Claimed
- 228 / 228 automated tests passing across 20 files via npm test (core, 4-bit Muse/Duet/Dots Pixel Avatar, Self-Harnessing 24/7 Proactive Agent, Universal AI Orchestrator, Local Computer Bridge & Task Engine, PKCE OAuth, Telegram Bot API, 4-tier failover, 25x concurrency races, WS/AssemblyAI, Postgres, fault-injection tests, 0 keys required)
- Reproducible Harness Eval (npm run eval:harness -> docs/HARNESS_EVAL.json): 32/32 intents (100%), 5/5 prompt injections blocked, 3/3 HTTP 409 conflict locks, 5/5 RMS silence rejections, 4-tier cascading failover matrix
- 11 / 11 Chromium 576x288 Geometry Gate passing across all lens states + Check 11 Negative Control
- 9 real 576x288 captures in @evenrealities/evenhub-simulator@0.9.5 (sim-01..09.png: native ListContainer, 76x76 4-bit Gray4 ring, 409 lock, Muse Pixel Avatar, and Self-Harnessing Proactive Agent card) with 0 uncaught/unhandled errors
- 10 / 10 Security Audit domains PASS (SECURITY_AUDIT.md, 0 secrets in repo or dist/onq.ehpk)

## Honest Limits & Pre-Nov 23 Disclosure
- Verified end-to-end in Even Hub Simulator 0.9.5, our Chromium Geometry Gate, and automated HTTP suites. Physical Even G2 + R1 ring hardware testing is pending.
- 100% of OnQ application code, tests, UI, and launch media were built during the Nov 23-29, 2026 hackathon window using standard OSS packages (@evenrealities/even_hub_sdk@0.0.16, three, @react-three/fiber, chrono-node, React, Tailwind CSS, Vite, Vitest, Playwright).

## Business Potential
Target $7/month Work-Pro tier (~$0.001/brief unit cost because deterministic rules handle triage, date parsing, and conflict locking before optional LLM compression).
```

---

## 3. Manual Pre-Publish Checklist
1. Push `onq-even-g2` to `https://github.com/vaibhav4046/onq-even-g2` (`git push -u origin master`) and confirm GitHub Pages (`https://vaibhav4046.github.io/onq-even-g2/`) & Privacy Policy (`https://vaibhav4046.github.io/onq-even-g2/privacy.html`) are live.
2. Upload `media/out/onq-launch-demo.mp4` (`2:01`, 1080p60, voiced with `AssemblyAI-TTS-1`) to YouTube/DoraHacks and attach `dist/onq.ehpk`.
3. Paste the Track 04 description above + the 5 requests from `API_FEEDBACK.md` (and reference `docs/HACKATHON_RUBRIC_AUDIT.md`) into DoraHacks and submit.
4. For Product Hunt: upload `media/product-hunt/gallery-01..04.png`, `thumbnail-240x240.gif`, and paste `media/product-hunt/PRODUCT_HUNT_LAUNCH_COPY.md`.
