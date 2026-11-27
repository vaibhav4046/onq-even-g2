# OnQ — Heads Up: Even Realities Hackathon Rubric Audit

**Event:** Heads Up: Even Realities Hackathon (**Even Realities × TVM Ventures × Daos Hub** on DoraHacks)  
**Project:** OnQ — Proactive Workday, Telegram & Computer Agent Copilot for Even Realities G2 + R1 Ring  
**Public Repository:** [https://github.com/vaibhav4046/onq-even-g2](https://github.com/vaibhav4046/onq-even-g2)  
**Live GitHub Pages & Privacy Policy:** [https://vaibhav4046.github.io/onq-even-g2/](https://vaibhav4046.github.io/onq-even-g2/) · [Privacy Policy](https://vaibhav4046.github.io/onq-even-g2/privacy.html) · [Terms of Service](https://vaibhav4046.github.io/onq-even-g2/terms.html)

---

## 1. Judging Rubric & Track Alignment Matrix

| Rubric Dimension / Track | Weight / Prize | OnQ Implementation & Verified Proof | Code & Artifact Anchors |
| :--- | :--- | :--- | :--- |
| **Usefulness Across Daily Routines** | **30%** | Solves the 90-second corridor gap between meetings (Google Calendar + Gmail + Drive, Notion, Telegram) plus **Self-Harnessing 24/7 Proactive Agent** that continuously synthesizes next-best corridor briefs pushed over SSE (`proactive`) without unconfirmed writes. | `apps/server/src/proactiveHarness.ts`, `apps/server/src/server.ts`, `apps/glasses/src/main.ts` |
| **Complete Read & Write Loop** | **25%** | **Read:** Google Calendar/Gmail/Drive, Notion (`2026-03-11` `data_sources`), Telegram digest, RFC 5545 `.ics`. **Write:** Voice/R1-staged `ActionPreview` (`Default-NO` 45s TTL) → **2.0s 4-bit Gray4 optical countdown ring** → synchronous `committing` lock + SHA-256 `idempotencyKey` → live **`HTTP 409` Conflict Hard-Lock** → **30s surgical Undo** (`POST /api/actions/undo`). | `packages/core/src/stateMachine.ts`, `packages/core/src/conflictEngine.ts`, `apps/server/src/server.ts` |
| **Technical Architecture & Security** | **20%** | Local-first loopback relay (`127.0.0.1:8787`), **AES-256-GCM mode `0600` encrypted vault**, PKCE `S256` OAuth handoff (`Link Even G2 Glasses` bypassing embedded WebView blocks), **Code-Guard** `<untrusted_workspace_data>` fencing & server-bound recipients, **Universal User AI Orchestrator** (`Auto Smart Failover`, `OpenRouter`, `ChatGPT`, `Claude`, `Local CLIs`, `Rules`), **0 secrets** in repo or `.ehpk`. | `apps/server/src/tokenVault.ts`, `apps/server/src/harness/modelRouter.ts`, `packages/core/src/factGuard.ts`, `SECURITY_AUDIT.md` |
| **UX, Display & Voice Craft** | **15%** | Strict **42-column × 7-line (`<= 999` UTF-8 bytes)** LVGL ASCII formatter with `>= 97%` black optical field, native `ListContainer` action picker, **76×76 4-bit Gray4 PNG countdown ring & Muse/Duet/Dots Pixel Avatar** (`<= 4 Hz` BLE-safe paint queue), RMS silence gate (`<= 512 KB` WAV) + AssemblyAI `STT-3.7` / `TTS-1` + WebGL 3D G2/R1 twin. | `packages/core/src/formatter.ts`, `packages/core/src/pngRing.ts`, `packages/core/src/pixelAvatarPng.ts`, `scripts/verify-geometry.mjs`, `scripts/verify-sim.mjs` |
| **Business Model & Unit Economics** | **10%** | Free BYO-Key / Sandbox tier → **$7/mo OnQ Pro** → **$19/seat/mo Team**. Deterministic rules/triage/409 checks execute locally before optional LLM JSON compression, keeping unit cost at **~$0.001/brief** (`>85%` gross margin). | `docs/TVM_PITCH_DECK.md`, `docs/COMPETITIVE_ANALYSIS.md` |
| **Track 04: AI Assistants & Work** | Main Track | End-to-end **Before · During · After** workday loop across Google Workspace OAuth PKCE (Calendar, Gmail, Drive), Notion `2026-03-11`, Telegram, Claude / ChatGPT / OpenRouter routing with a Rules fallback, AssemblyAI voice, `.ics` import, and RAM-only live meeting diarization (`MEETING_LIVE` / `WRAP_UP`). The Local Computer Bridge (`claude`, `codex`, `gemini`, `ollama`, `gh`, `git`), music (iTunes), market signals (CoinGecko) and YouTube scouting are optional local skills and are not Track 04 claims. | `apps/server/src/providers/googleProvider.ts`, `notionProvider.ts`, `localComputerBridge.ts`, `apps/server/src/harness/agentTaskEngine.ts` |
| **Track 01 / Best Telegram Integration** | Partner Track | Zero-dependency `TelegramWorkspaceClient` powering live/sandbox unread digests (`GET /api/telegram/digest`), BotFather verification (`POST /api/connectors/telegram/test` for bots such as `@onq_g2_copilot_bot`), and **Default-NO** reply staging (`POST /api/telegram/stage-reply`) committed only after R1 confirmation. | `apps/server/src/providers/telegramProvider.ts`, `apps/server/src/server.ts` |

---

## 2. Core Read & Write Safety Loop (G2 + R1 Ring)

Every outbound mutation (Calendar shift, Gmail reply, Notion task write, Telegram message, or delegated local task) passes through the 4-stage `OnQHudController` FSM (`packages/core/src/stateMachine.ts`) and server-side guards (`apps/server/src/server.ts`):

1. **Default-NO Stage (`45s` TTL):** Voice (`LONG_PRESS` / `LONG_PRESS_RELEASE` -> `/api/stt` -> `/api/actions/stage`) or R1 `CLICK` on a quick action renders an immutable `ActionPreview` whose cursor defaults strictly to `[NO - CANCEL]`.
2. **2.0s 4-Bit Gray4 Optical Countdown Ring:** Swiping (`SCROLL_UP` / `SCROLL_DOWN`) to `YES` and tapping arms `ARM_DURATION_MS = 2000` at `ARM_TICK_MS = 250` (`<= 4 Hz` BLE-safe cadence via `BlePaintQueue`). Any tap, double-tap, or `FOREGROUND_EXIT` calls `disarmToUndone()` with **0 writes**.
3. **Synchronous `0.0s` Commit Lock & `HTTP 409` Conflict Hard-Lock:** At `0.0s`, `tickArm()` clears the timer and synchronously enters `phase: 'committing'` before awaiting network I/O (`commitId` monotonic guard + SHA-256 `idempotencyKey`). `/api/actions/commit` re-checks live Calendar Free/Busy, Gmail `historyId`, and Notion `last_edited_time`, returning **`HTTP 409`** (`ConflictLockDetail`) with the next verified free slot on collision.
4. **30s Surgical Undo:** Reversible commits expose a **30-second undo window** via `POST /api/actions/undo` (`provider.undoReceipt(receipt)`), emitting `UNDO` audit entries and live `receipt` / `corridor` SSE updates.

---

## 3. Universal User AI Orchestrator & Self-Harnessing 24/7 Proactive Agent

### Universal User AI Orchestrator (`apps/server/src/harness/modelRouter.ts` + `apps/server/src/server.ts`)
- **Supported Routes:** `Auto (Smart Failover)`, `OpenRouter` (configurable model e.g. `openrouter/free`, `anthropic/claude-3.5-haiku`, `openai/gpt-4o-mini`, `google/gemini-2.0-flash-001`), `ChatGPT` (`OPENAI_API_KEY`), `Claude` (`ANTHROPIC_API_KEY`), **Local CLIs** (`claude`, `codex`, `gemini`, `ollama` via `LocalComputerBridge`), and deterministic `Rules` fallback.
- **Health & Cooldown Protection:** `getProviderHealthStatus()`, `resolveHealthyLlmLabel()`, and `orchestrateStructuredJson()` share a single `invokeRemoteProvider` helper with per-provider `AbortController` timeouts and 5-minute cooldown tracking on upstream HTTP `400`/`401`/`402`/`429` errors.
- **Live Switching:** `POST /api/connectors/orchestrator` (`requireAuth`) validates `{ preferredLlm, openRouterModel }`, persists to `EncryptedTokenVault`, clears provider cooldowns (`clearProviderCooldowns()`), triggers a proactive pulse, and broadcasts `corridor` SSE.

### Self-Harnessing 24/7 Proactive Agent (`apps/server/src/proactiveHarness.ts`)
- **Continuous Workspace Pulse:** `ProactiveAgenticHarness` scans Calendar proximity/overlaps, unanswered Gmail threads, open Notion tasks, incoming Telegram pings, Local Computer Bridge status, and connector health.
- **Self-Generated Harness Synthesis:** `ProactiveAgenticHarness.synthesizeHarness(focusHint?)` builds a structured `SelfGeneratedHarness` (`OBSERVE -> VERIFY -> STAGE -> GUARD`) via `orchestrateStructuredJson` (or deterministic Code-Guard fallback), runs `verifyDraftAndPayload` and `clipLine42`, forces `defaultNoRequired: true`, and emits a `'proactive'` SSE event.
- **Endpoints & Glasses Push:**
  - `POST /api/proactive/synthesize` — synthesizes a fresh `SelfGeneratedHarness` and pushes `'proactive'` SSE.
  - `POST /api/proactive/stage-harness` — stages `activeHarness.suggestedCommand` through the exact `/api/actions/stage` `Default-NO` & `409 Conflict` pipeline.
  - `apps/glasses/src/main.ts` — `startSseSync()` listens for `'proactive'` and updates the corridor only while `controller.getState().phase === 'idle'` (never interrupting `armed`, `committing`, `preview`, `meeting_live`, or `listening`).

---

## 4. `.ehpk` & EvenHub SDK `0.0.16` Hardware Discipline

| Hardware Rule | Verified OnQ Implementation |
| :--- | :--- |
| **SDK & Packaging Target** | `@evenrealities/even_hub_sdk@0.0.16` and `@evenrealities/evenhub-cli@0.2.0` (`apps/glasses/app.json`: `min_sdk_version: "0.0.16"`, `min_app_version: "2.2.10"`, `package_id: "com.vaibhav.onq"`). |
| **Foreground-Only Lifecycle** | `normalizeEvenEvent` maps `FOREGROUND_ENTER` (refresh corridor / `STALE` fallback) and `FOREGROUND_EXIT` (persist snapshot + disarm any active `armed` ring with zero writes). |
| **Zero Secrets Inside `.ehpk`** | `apps/glasses/app.json` whitelists only `http://127.0.0.1:8787` / `http://localhost:8787`; `scripts/security-scan.mjs` scans every file inside `dist/onq.ehpk` (`0` secret hits). |
| **LVGL ASCII Only & Optical Budget** | `sanitizeLvglAscii()` strips/transliterates smart quotes, arrows, diacritics, and emojis (`[^\x20-\x7E\n]`); `wrapLine42()` / `clipLine42()` enforce `<= 42` cols, `<= 7` lines, `<= 999` UTF-8 bytes, and `>= 97%` pure-black background in static states (`>= 75%` during 4-bit Gray4 image states). |
| **4-Bit Gray4 PNG Visuals** | `packages/core/src/pngRing.ts` (`encodeGray4Png`, `renderCountdownRing`) and `packages/core/src/pixelAvatarPng.ts` (`renderPixelAvatar` for `muse`, `duet`, `dots`) emit pure-TS 4-bit grayscale (`IHDR` bit depth `4`, color type `0`) `76×76` PNGs delivered over `updateImageRawData` at `<= 4 Hz`. |

---

## 5. Required DoraHacks Submission Assets & Honest Hardware Disclosure

| Required Asset | Status / Location | Notes |
| :--- | :--- | :--- |
| **Public GitHub Repo** | `https://github.com/vaibhav4046/onq-even-g2` | Monorepo (`packages/core`, `apps/server`, `apps/glasses`, `apps/web`) with zero-key cold-start `DEMO` mode. |
| **GitHub Pages Live G2 Studio & Docs** | `https://vaibhav4046.github.io/onq-even-g2/demo/` & `.../index.html` | Zero-key stateful 3D + G2 Lens browser studio (`docs/demo/`), landing page, privacy policy & terms (`docs/.nojekyll`). |
| **Demo Video (`<= 2:45`)** | `media/out/onq-film-v5-day-in-life.mp4` | `2:45` (`165.00 s`, `23.14 MB`, `1920x1080 @ 30fps`, `-16.0 LUFS`) 7-Act "Day in the Life with OnQ" emerald cyber-anime launch film with dual-voice AssemblyAI TTS-1 (`aai-kyla` + `aai-titus`), refreshed 4-bit real-app logo captures (`0` whiteout), and `530` test metrics. Backup: `media/out/onq-film-v4.mp4` (`2:40`, `26.10 MB`). |
| **Packaged EvenHub App** | `dist/onq.ehpk` (`npm run pack`) | `60,341` bytes, SDK `0.0.16` (supports `ONQ_RELAY_ORIGIN` / `ONQ_RELAY_URL` for remote tunnel builds). Scanned inside `npm run verify:security` (`0` secret hits). |
| **EvenHub API Feedback** | `API_FEEDBACK.md` | 5 actionable SDK `0.0.16`, Simulator `0.9.5`, and WebView PKCE requests. |
| **Verification Evidence** | `npm test`, `npm run eval:harness`, `npm run verify:geometry`, `npm run verify:sim`, `npm run verify:security` | Reproducible suites (`docs/HARNESS_EVAL.json`, `SECURITY_AUDIT.md`, `docs/VERIFICATION_LOG.txt`, `docs/JUDGING_ROUND_REPORT.md`, `docs/ADVERSARIAL_JUDGE_VERDICT.md`, `docs/screenshots/sim-01..17.png`). |

> **Honest Physical Hardware Disclosure:** Optical layouts, container rebuilds, 4-bit Gray4 PNG updates, input normalization, safety gates, and flows are verified in `@evenrealities/evenhub-simulator@0.9.5`, our 11-check Chromium `576×288` Geometry Gate, and automated Vitest / HTTP / WebSocket suites. **Physical Even Realities G2 glasses and R1 ring hardware testing is NOT done** because physical hardware is not attached in the build environment. Audio responses route to the companion phone / Bluetooth earbuds (`AssemblyAI-TTS-1`) because Even G2 has no built-in speaker.

---

## 6. Verified Numbers (final run, 2026-11-27, every command exit 0)

| Gate | Command | Result |
| :--- | :--- | :--- |
| Unit, HTTP, WebSocket, OAuth suites | `npm test` | `530` tests passing across `55` files (incl. 4-bit Gray4 real-app icons, `showAnswer()` overlay fix, Morning Brief + Notion check-off, Coding PR Gate + L5 hard-blocks, Career Pack, durable `~/.onq/vault.enc`, PC Power Source, remote bridge, Telegram inline Kill Switch, zero-LLM 409 pre-check) |
| AI and safety harness | `npm run eval:harness` | `32/32` intents, `5/5` injections blocked, `3/3` 409 locks, `5/5` RMS silence rejections, `4` failover scenarios |
| Package | `npm run pack` | `dist/onq.ehpk`, `60,341` bytes, SDK `0.0.16` |
| Geometry | `npm run verify:geometry` | `11/11` PASS plus the Check 11 negative control (`97.2%` to `97.8%` dark pixels, `<= 266` UTF-8 bytes) |
| Simulator | `npm run verify:sim` | `17` real EvenHub Simulator `0.9.5` captures (`sim-01..sim-17.png` with 76x76 4-bit Gray4 real-app logos & native G2 menu goodies; `0` console errors) |
| Security | `npm run verify:security` | `10/10` PASS, `0` vulnerabilities (`npm audit --omit=dev`), `169` source files scanned + `dist/onq.ehpk` |
| Web bundle | `npm run build` | Entry JS chunk `283.85 kB` raw / `74.21 kB` gzip (`@onq/glasses`: `148.38 kB` raw / `55.34 kB` gzip); Three.js and the 3D glasses load lazily |
| Modern web guidance | `legacy-scan` on `apps/web/src` | `0` findings across `41` files; `tabs` & `content-first-noise-reduction` (`<details>` drawer) guides applied |

**Live connector status, stated exactly.** Durable `~/.onq/vault.enc` auto-reconnect verified live across reboot (`Telegram=LIVE` `@onq_g2_copilot_bot` `28–34 ms`, `AssemblyAI=LIVE` `648 ms` + `TTS-1` `45–47` chunks), plus **Ollama `qwen3:1.7b` LIVE** (`$0` local cost, `1,759 ms` wrap-up draft, `31 ms` zero-LLM 409 conflict lock, live `/run ollama` PASS) and **OmniRoute** (`295` models) + `8` local MCP server names. Google Workspace and Notion run honestly in `SANDBOX` (`1 ms`) until credentials are saved at `http://127.0.0.1:5173/#connectors`.

**Final-pass changes.** Day-in-the-Life product parity (Morning Brief, Notion voice check-off, Coding PR Gate + `git_diff_stat` + dry-run PR receipt + L5 hard-blocks, Career Pack + Code-Guard draft), 13 `76×76` 4-bit real-app G2 logos + native menu goodies + Web Real-App Dock, zero-key GitHub Pages live studio (`docs/demo/`), durable `~/.onq/vault.enc` migration + 45m OAuth keepalive, Computer = AI Power Source + `npm run tunnel`, `31 ms` zero-LLM 409 pre-check, Film v5 (`2:45`, `23.14 MB`, `-16.0 LUFS`), and Round 3 5-persona + 4-judge adversarial verdict (`9.66 / 10` controllable score in `docs/JUDGING_ROUND_REPORT.md` and `docs/ADVERSARIAL_JUDGE_VERDICT.md`).
