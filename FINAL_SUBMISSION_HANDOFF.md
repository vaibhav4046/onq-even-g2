# OnQ - Final Hackathon & Product Hunt Submission Handoff

**Project Root:** `C:\Users\lalwa\.gemini\antigravity\scratch\oncue-even-g2`
**Public Repository:** https://github.com/vaibhav4046/onq-even-g2
**Live Docs & Privacy Policy:** https://vaibhav4046.github.io/onq-even-g2/ · https://vaibhav4046.github.io/onq-even-g2/privacy.html
**Hard Safety Stop Enforced:** Full local run on 2026-11-25, every command exit 0: `npm test` (`251` tests across `28` files), `npm run eval:harness` (`32/32` intents, `5/5` injections blocked, `3/3` 409 locks, `5/5` RMS silence rejections, `4` failover scenarios), `npm run pack` (`dist/onq.ehpk`, `51,344` bytes, SDK `0.0.16`), `npm run verify:geometry` (`11/11` plus the Check 11 negative control), `npm run verify:sim` (`13` real EvenHub Simulator `0.9.5` captures, `sim-01..sim-13`), and `npm run verify:security` (`10/10` PASS, `0` vulnerabilities, `112` files at last run). The web entry chunk is `292 kB` raw / `76 kB` gzip, and the `modern-web-guidance` legacy scan found `0` issues across `25` files. **Not done:** physical Even G2 glasses and R1 ring testing (simulator, Chromium geometry gate and automated suites only), and a fresh live-connector run for Google, Notion and Telegram this session (see the connector status below). The pixel-anime film (`2:36`) and the technical walkthrough (`2:05`) are rendered. External DoraHacks / Product Hunt submission and any paid hosting remain unsubmitted for your manual review and final click.

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
| **Monorepo Source** | `packages/core`, `apps/server`, `apps/glasses`, `apps/web` | `npm ci && npm test && npm run build` passed cold (**251 tests** across **28 files**, all passing) |
| **Orchestration & Safety Eval** | `docs/HARNESS_EVAL.json` (`npm run eval:harness`) | **32/32 intents**, **5/5 prompt injections blocked**, **3/3 409 locks**, **5/5 RMS silence rejections**, **4 failover scenarios** |
| **EvenHub G2 Package** | `dist/onq.ehpk` | Packed via `@evenrealities/evenhub-cli@0.2.0` (`51,344` bytes, SDK `0.0.16`, `min_app_version 2.2.10`) |
| **Official Simulator Captures** | `docs/screenshots/sim-01..13.png` | **13 real 576x288 captures** from `@evenrealities/evenhub-simulator@0.9.5`. `sim-12` is the Unified OS card and `sim-13` is the L4 crew pipeline (crew title plus Chief, Developer and Auditor lines; it showed only 1 of 4 lines before this pass) |
| **11-Check Geometry Gate** | `scripts/verify-geometry.mjs` + `docs/screenshots/geometry-*.png` | `11/11` PASS across all lens states (`97.2%` to `97.9%` dark pixels, `<= 260` UTF-8 bytes) plus the Check 11 negative control |
| **Security Audit Report** | `SECURITY_AUDIT.md` (`scripts/security-scan.mjs`) | `10/10` domains PASS (`0` High/Critical findings, `npm audit --omit=dev`: `0` vulnerabilities, `112` files scanned at last run) |
| **Web Bundle & Modern Web Guidance** | `apps/web` (`npm run build`), `legacy-scan` on `apps/web/src` | Entry JS chunk `292 kB` raw / `76 kB` gzip (was `1,756 kB` / `498 kB`); Three.js and the 3D glasses load lazily. Legacy scan: `0` findings across `25` files |
| **Hackathon Rubric Audit** | `docs/HACKATHON_RUBRIC_AUDIT.md` | Full rubric-to-implementation & evidence map for Even Realities × TVM Ventures × Daos Hub (DoraHacks) |
| **Live GitHub Pages & Privacy** | `docs/index.html`, `docs/privacy.html`, `docs/terms.html` | Hosted at `https://vaibhav4046.github.io/onq-even-g2/` and `https://vaibhav4046.github.io/onq-even-g2/privacy.html` |
| **TVM Ventures Pitch Deck** | `docs/TVM_PITCH_DECK.md` | 10-slide Demo Day pitch deck mapped to judging weights + Dual-Track Track 04 / Telegram live script |
| **Clean-Room Verification Log** | `docs/VERIFICATION_LOG.txt` | Fresh-clone verification transcript with zero env vars |
| **Pixel-Anime Launch Film** | `media/out/onq-anime-film.mp4` | `1920x1080`, `30 fps`, `2:36` (<= 2:45), AssemblyAI TTS-1 narration. Pixel-art "A day with OnQ" (07:30 to 22:00). Every glasses HUD in it is a real EvenHub Simulator 0.9.5 capture and one scene is a real screen recording of the web app (demo sandbox). Rebuild: `python scripts/make-anime-film.py`. |
| **Technical Walkthrough** | `media/out/onq-launch-demo.mp4` | `1920x1080`, `60 fps`, `2:05`, TTS-1 narration over screen recordings. A few seconds show the first-load "syncing" screen; prefer the anime film for submission. |
| **Product Hunt Launch Kit** | `media/product-hunt/` | `gallery-01-hero.png` .. `gallery-04-architecture.png` (`1270x760`), `thumbnail-240x240.gif`, `PRODUCT_HUNT_LAUNCH_COPY.md` |
| **API Feedback Deliverable** | `API_FEEDBACK.md` | 5 concrete Even Hub SDK `0.0.16`, Simulator `0.9.5`, and WebView OAuth PKCE feature requests |
| **Competitive Audit Matrix** | `docs/COMPETITIVE_ANALYSIS.md` | Track 04 Read-and-Write rubric & head-to-head comparison against field entries |

---

## 1b. What Changed in the Final Pass

1. **Studio:** 8 tabs became 3 workspaces (Glasses Live, Personal OS, Meeting Scribe). The off-track panels (glass apps, agent fleet, market watch, video explainer, PC tools) were removed from the web app; the music curator and market research stay as optional crews inside Personal OS.
2. **60-second guided tour** in the hero: Confirm and undo, Double-booking lock, Morning crew.
3. **Copy cut:** hero and page text cut sharply; jargon moved into one closed "Engineering & audit" block per section.
4. **Period glyph fix:** the pixel font Doto drew "." as a plus-shaped cluster, so "$0.001" read as "+". Periods now come from a clean bold system sans (unicode-range font-face), and the heading scramble no longer uses "+".
5. **Music curator fix:** a bare mood such as `coding` was used as the literal search term and returned off-mood pop. It now uses tuned queries (`lofi beats` for coding, `ambient study` for deep_focus); a live check returned lofi and study tracks.
6. **Telegram 409:** `getUpdates` against an active webhook now reports "Webhook active on Telegram bot. Clear the webhook (deleteWebhook) or use the webhook endpoint instead of polling. HTTP 409" and backs off 5 minutes.
7. **Local computer bridge on Windows:** npm `.cmd` shims (such as `claude.cmd`) failed with `spawn EINVAL`. Shims are now skipped and a failing CLI falls back to the built-in planner with a note.
8. **sim-13 fix:** the crew block rendered 1 of 4 lines; it is now one multi-line text block and shows the crew title plus 3 lines. `sim-12` (Unified OS card) and `sim-13` (L4 crew pipeline) bring the total to 13 captures.
9. **Web bundle:** entry JS chunk cut from `1,756 kB` / `498 kB` gzip to `292 kB` / `76 kB`; Three.js and the 3D glasses load lazily.
10. **Modern web guidance:** `tabs` guide applied (`role=tablist` / `tab`, `aria-selected`, underline for the selected tab; the guide says "Do not indicate the selected tab with color alone"); `visually-stable-mixed-fonts` reviewed and not needed. Legacy scan: `0` findings across `25` files.
11. **Track 04 positioning:** hero, default corridor cards, walkthrough and README lead with Google Workspace, Notion, Telegram, Claude / ChatGPT / OpenRouter and AssemblyAI voice. Music, market signals, PC tools and YouTube scouting are optional local skills. Grok and OmniRoute are optional model routes and are not pitched.
12. **Tests:** 5 new tests (multi-line live UI, Telegram 409 x2, music mood x2).

**Still open:** physical Even G2 + R1 ring testing, the launch video re-render, and replacing `fd285b6` with the final hash. Nothing has been submitted to DoraHacks or Product Hunt.

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

Open http://127.0.0.1:5173 for a 60-second guided tour (Confirm and undo, Double-booking lock, Morning crew), the interactive 3D Even G2 stage, the 576x288 Browser Optical Simulator, and the Connectors Hub with the AI Orchestrator (`Claude / ChatGPT / OpenRouter`, Rules fallback). The studio has 3 workspaces: Glasses Live, Personal OS and Meeting Scribe. Or sideload dist/onq.ehpk in Even Hub.

## Verified, Not Claimed
- npm test: 251 tests passing across 28 files (core, PKCE OAuth, 4-bit Pixel Avatar, Proactive Agent, AI Orchestrator, Local Computer Bridge, Telegram Bot API including the 409 webhook case, music mood queries, multi-line live UI, 4-tier failover, 25x concurrency races, WS/AssemblyAI, Postgres, fault-injection tests, 0 keys required)
- Reproducible Harness Eval (npm run eval:harness -> docs/HARNESS_EVAL.json): 32/32 intents, 5/5 prompt injections blocked, 3/3 HTTP 409 conflict locks, 5/5 RMS silence rejections, 4 failover scenarios
- Geometry Gate (npm run verify:geometry): 11/11 PASS across all lens states plus the Check 11 negative control (97.2% to 97.9% dark pixels, <= 260 UTF-8 bytes)
- 13 real 576x288 captures in @evenrealities/evenhub-simulator@0.9.5 (sim-01..sim-13.png), including the Unified OS card (sim-12) and the L4 crew pipeline (sim-13, now shows the crew title plus Chief, Developer and Auditor lines)
- Package: dist/onq.ehpk, 51,344 bytes, SDK 0.0.16
- Security (npm run verify:security): 10/10 PASS, npm audit --omit=dev reports 0 vulnerabilities (112 files scanned at last run)
- Web bundle: entry JS chunk 292 kB raw / 76 kB gzip (was 1,756 kB / 498 kB); modern-web-guidance legacy scan: 0 findings across 25 files
- Live connectors, exact: in the 2026-11-25 run with the demo session, AssemblyAI STT-3.7 + TTS-1 was LIVE (660 ms, 45 audio chunks, 6 words); Google Workspace, Notion and Telegram were SANDBOX; Claude, OpenRouter and ChatGPT fell back to Rules (Deterministic). An earlier session at commit 230dd35 with the owner's connected accounts recorded Google OAuth LIVE 116 ms, Notion LIVE 623 ms, Telegram LIVE 27 ms (earlier session, not re-run this session)

## Honest Limits & Pre-Nov 23 Disclosure
- Verified in Even Hub Simulator 0.9.5, our Chromium Geometry Gate, and automated HTTP suites. Physical Even G2 + R1 ring hardware testing is NOT done.
- 100% of OnQ application code, tests, UI, and launch media were built during the Nov 23-29, 2026 hackathon window using standard OSS packages (@evenrealities/even_hub_sdk@0.0.16, three, @react-three/fiber, chrono-node, React, Tailwind CSS, Vite, Vitest, Playwright).

## Business Potential
Target $7/month Work-Pro tier (~$0.001/brief unit cost because deterministic rules handle triage, date parsing, and conflict locking before optional LLM compression).
```

---

## 3. Manual Pre-Publish Checklist
1. Push `onq-even-g2` to `https://github.com/vaibhav4046/onq-even-g2` (`git push -u origin master`) and confirm GitHub Pages (`https://vaibhav4046.github.io/onq-even-g2/`) & Privacy Policy (`https://vaibhav4046.github.io/onq-even-g2/privacy.html`) are live.
2. Upload `media/out/onq-anime-film.mp4` (`2:36`, the main film; `media/out/onq-launch-demo.mp4` is the technical walkthrough) to YouTube/DoraHacks and attach `dist/onq.ehpk` (`51,344` bytes). Code commit: `fd285b6`.
3. Paste the Track 04 description above + the 5 requests from `API_FEEDBACK.md` (and reference `docs/HACKATHON_RUBRIC_AUDIT.md`) into DoraHacks and submit.
4. For Product Hunt: upload `media/product-hunt/gallery-01..04.png`, `thumbnail-240x240.gif`, and paste `media/product-hunt/PRODUCT_HUNT_LAUNCH_COPY.md`.
