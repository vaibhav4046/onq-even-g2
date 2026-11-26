# OnQ — Final Hackathon & Product Hunt Submission Handoff

> **1-Click Google Workspace & Notion Resume URL (Permanent Persistence Ready):**  
> Open **`http://127.0.0.1:5173/#connectors`** while `npm run dev` is running to connect Google OAuth 2.0 (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) or Notion (`ntn_...` + Database ID). Once saved, tokens are encrypted in your durable **`~/.onq/vault.enc`** (`AES-256-GCM`, mode `0600` — outside the repository, never touched by `npm test`, `verify:sim`, `verify:security`, or `git clean`) and silently auto-reconnected on every boot with a 45-minute Google OAuth token keepalive.  
> **Current Live Connectors Verified on This Machine (2026-11-26):** `Ollama qwen3:1.7b` (**LIVE**, `$0` local inference, `1,759 ms` wrap-up, `31 ms` zero-LLM 409 lock), `OmniRoute` (**LIVE**, `295` models), `Telegram @onq_g2_copilot_bot` (**LIVE**, `28 ms`, chat `...1658`), `AssemblyAI STT-3.7 + TTS-1` (**LIVE**, `633 ms`, `47` audio chunks). `Google Workspace` & `Notion` remain honestly in `SANDBOX` (`1 ms`) until credentials are saved above.

**Project Root:** `C:\Users\lalwa\.gemini\antigravity\scratch\oncue-even-g2`  
**Verified Clean-Room Code Commit:** `41b9912` (all 7 clean-room gates exit `0` with zero env vars; transcript in `docs/VERIFICATION_LOG.txt`)  
**Public Repository:** https://github.com/vaibhav4046/onq-even-g2  
**Live Docs & Privacy Policy:** https://vaibhav4046.github.io/onq-even-g2/ · https://vaibhav4046.github.io/onq-even-g2/privacy.html  
**Hard Safety Stop Enforced:** Every local verification gate and clean-room zero-env clone passed with exit `0` on `2026-11-26`. **Nothing has been pushed to GitHub (`git push`), submitted to DoraHacks, published to Product Hunt, or deployed to paid hosting.** All external actions wait for your explicit final review and click.

---

## 1. Verified Artifact Inventory (2026-11-26 Final Run)

| Artifact | Path | Observed Verification |
| :--- | :--- | :--- |
| **Monorepo Source & Tests** | `packages/core`, `apps/server`, `apps/glasses`, `apps/web` | `npm test`: **`515` tests passing** across **`53` files** (`0` TS errors across all 4 `tsconfig.json` projects) |
| **Orchestration & Safety Eval** | `docs/HARNESS_EVAL.json` (`npm run eval:harness`) | **`32/32` intents (100%)**, **`5/5` prompt injections blocked**, **`3/3` 409 locks**, **`5/5` RMS silence blocks**, **`4` failover scenarios** |
| **EvenHub G2 Package** | `dist/onq.ehpk` (`npm run pack`) | **`57,865` bytes**, SDK `0.0.16`, `min_app_version 2.2.10` (`ONQ_RELAY_ORIGIN` / `ONQ_RELAY_URL` supported for remote builds) |
| **Official Simulator Captures** | `docs/screenshots/sim-01..15.png` (`npm run verify:sim`) | **`15` real `576×288` captures** from `@evenrealities/evenhub-simulator@0.9.5` with **`0` console/uncaught errors** (`sim-11` double-prefix fixed; `sim-13` 4-line L4 crew) |
| **11-Check Geometry Gate** | `scripts/verify-geometry.mjs` | **`11/11` PASS** + Check 11 negative control (`97.4%`–`98.0%` pure-black optical field, `<= 266` UTF-8 bytes, `0` console errors) |
| **Security Audit Report** | `SECURITY_AUDIT.md` (`npm run verify:security`) | **`10/10` PASS**, `0` secret hits across `167` source files + `dist/onq.ehpk`, `npm audit --omit=dev`: **`0` vulnerabilities** |
| **Web Bundle & Modern Web Guidance** | `apps/web` (`npm run build`), `legacy-scan` | Entry JS chunk **`272.89 kB` raw / `70.80 kB` gzip** (`@onq/glasses`: `141.68 kB` / `52.89 kB` gzip); Three.js lazy-loaded; `modern-web-guidance legacy-scan`: **`0` findings across `41` files** |
| **Live E2E UI & Mobile Audit** | `scripts/brutal-live-check.mjs` + `390×844` audit | **`BRUTAL_LIVE_CHECK_PASS`**: `0` console errors, `0` page errors, `0` horizontal overflow at `1280×800`, `1024×768`, and `390×844`; `9/9` verified connector badges |
| **Clean-Room Verification Log** | `docs/VERIFICATION_LOG.txt` | Fresh zero-env isolated build in `%TEMP%\onq-clean-final` (`npm ci`, `515` tests, `eval`, `build`, `pack`, `geometry`, `security` — all exit `0`) |
| **Emerald Cyber-Anime Launch Film v4** | `media/out/onq-film-v4.mp4` | **`1920×1080`, `30 fps`, `160.0 s` (`2:40` `<= 2:45`), `26.10 MB`**, `-17.88 LUFS`, dual-voice AssemblyAI `TTS-1` (`aai-kyla` + `aai-titus`), real `#000000` simulator captures (`0` whiteout), 6 sampled frames visually verified |
| **Adversarial Judge & 5-Persona Audit** | `docs/ADVERSARIAL_JUDGE_VERDICT.md` | **5/5 customer personas PASS**, 4-judge controllable weighted score **`9.50 / 10`** (`>= 9.3/10` on every controllable rubric bucket) |
| **Hackathon Rubric Audit & Pitch Deck** | `docs/HACKATHON_RUBRIC_AUDIT.md`, `docs/TVM_PITCH_DECK.md`, `docs/COMPETITIVE_ANALYSIS.md`, `docs/DORAHACKS_SUBMISSION.md` | Fully synced with exact verified numbers & honest physical-G2 disclosure |
| **API Feedback Deliverable** | `API_FEEDBACK.md` | 5 concrete Even Hub SDK `0.0.16`, Simulator `0.9.5`, and WebView OAuth PKCE requests |
| **Product Hunt Launch Kit** | `media/product-hunt/` | `gallery-01..04.png` (`1270×760`), `thumbnail-240x240.gif`, `PRODUCT_HUNT_LAUNCH_COPY.md` |

> **Honest Physical Hardware Disclosure:** Verified in `@evenrealities/evenhub-simulator@0.9.5`, our 11-check Chromium `576×288` Geometry Gate, live Playwright desktop/mobile checks, clean-room zero-env build, and `515` automated tests. **Physical Even Realities G2 glasses and R1 ring hardware testing is NOT done** (no physical hardware attached in the build environment).

---

## 2. What Changed Across Phases 1–7

1. **Phase 1 — Durable Vault & Silent Auto-Reconnect:** Defaulted encrypted vault to **`~/.onq/vault.enc`** (`AES-256-GCM`, mode `0600`, `ONQ_VAULT_PATH` strictly for isolated tests/CI) with zero-loss automatic migration from legacy `tokens.vault.json`, silent startup auto-reconnect (`[onq:boot] Auto-reconnect: Telegram=LIVE | AssemblyAI=LIVE`), and 45-minute Google OAuth token keepalive.
2. **Phase 2 — Computer = AI Power Source + Remote Tunnel:** Built `apps/server/src/harness/pcPowerSource.ts` (`HOSTED · READY`, `HOSTED · STANDBY`, `CLOUD API · OPTIONAL`, local MCP server discovery reading names only with zero secrets, OpenBot CLI bridge via `openbot-cli.mjs`, owner-only allowlisted `ollama`/`omniroute` wake, honest GUI boundary), `apps/server/src/remote/tunnelBridge.ts`, `scripts/tunnel.mjs` (`npm run tunnel`), and `ONQ_RELAY_ORIGIN` `.ehpk` packing.
3. **Phase 3 — G2 Thin Client & Best Telegram Integration:** Strict `<= 42 × 7` LVGL formatting (`sim-11` `REPO: APPS:` double prefix fixed), Card 3 `REMOTE TUNNEL` / `PC ONLINE · LOCAL` provenance, optical thinking feedback, Telegram inline **`[Kill Switch (Pause All)]`** alongside `[Approve Once]` and `[Reject]` (owner-DM guarded), and full `/apps`, `/inference`, `/use`, `/run` menu parity.
4. **Phase 4 — Unified Web Companion & Track 04 Purity:** Sharpened hero framing around Computer = AI Power Source + Even G2 = Thin Optical Window, exposed `HOSTED · READY`/`STANDBY` + 1-click `Wake` + Remote Access badge + collapsed `<details>` MCP/OpenBot drawer in `ThisComputerPanel.tsx`, synced `ProofStrip` to `515` tests & `15` simulator captures, `0` `modern-web-guidance` legacy findings.
5. **Phase 5 — Fast 409 Lock, Ollama Speedup, Clean-Room & Film v4:** Added deterministic `409` busy-slot pre-check *before* LLM calls (**2,709 ms -> 31 ms**, `0` wasted LLM tokens, covered by automated test), capped grounded reply `maxTokens: 120` (**9,658 ms -> 1,759 ms** live Ollama wrap-up), rendered & visually inspected `media/out/onq-film-v4.mp4` (`2:40`, `26.10 MB`), and passed fresh zero-env clean-room clone (`docs/VERIFICATION_LOG.txt`).
6. **Phase 6 — 5-Persona & 4-Judge Adversarial Loop:** Audited against all 54 field entries (`TapBack`, `PinGuard`, `Aside`, `Nod`, `FUSE Brief`, `PulseHUD`, `WickSight`, `OcuClaw`) in `docs/ADVERSARIAL_JUDGE_VERDICT.md` (**5/5 personas PASS**, **9.50 / 10** controllable weighted score).

---

## 3. Manual Pre-Publish Checklist (Your Final Clicks Only)

1. *(Optional, 30s)* Open `http://127.0.0.1:5173/#connectors` to plug in your Google OAuth or Notion token into `~/.onq/vault.enc` if you want live Google/Notion during Demo Day.
2. Push local `master` commits to GitHub (`git push -u origin master`) and confirm GitHub Pages (`https://vaibhav4046.github.io/onq-even-g2/`) & Privacy Policy are live.
3. Upload **`media/out/onq-film-v4.mp4`** (`2:40`, `26.10 MB`, `1080p`) to YouTube/DoraHacks and attach **`dist/onq.ehpk`** (`57,865` bytes).
4. Paste **`docs/DORAHACKS_SUBMISSION.md`** + the 5 SDK requests from **`API_FEEDBACK.md`** into DoraHacks before **Sunday, 29 Nov 2026, 19:59 GMT** and click Submit.
5. *(Optional)* Publish Product Hunt using `media/product-hunt/gallery-01..04.png`, `thumbnail-240x240.gif`, and `media/product-hunt/PRODUCT_HUNT_LAUNCH_COPY.md`.
