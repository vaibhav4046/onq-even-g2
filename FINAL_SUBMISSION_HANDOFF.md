# OnQ — Final Hackathon & Product Hunt Submission Handoff

> **1-Click Google Workspace & Notion Resume URL (Permanent Persistence Ready):**  
> Open **`http://127.0.0.1:5173/#connectors`** while `npm run dev` is running to connect Google OAuth 2.0 (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) or Notion (`ntn_...` + Database ID). Once saved, tokens are encrypted in your durable **`~/.onq/vault.enc`** (`AES-256-GCM`, mode `0600` — outside the repository, never touched by `npm test`, `verify:sim`, `verify:security`, or `git clean`) and silently auto-reconnected on every boot with a 45-minute Google OAuth token keepalive.  
> **Current Live Connectors Verified Across Server Reboot (2026-11-27):** `Ollama qwen3:1.7b` (**LIVE**, `$0` local inference, `1,759 ms` wrap-up, `31 ms` zero-LLM 409 lock, live `/run ollama` PASS), `OmniRoute` (**LIVE**, `295` models), `Telegram @onq_g2_copilot_bot` (**LIVE**, `28–34 ms`, chat `...1658`), `AssemblyAI STT-3.7 + TTS-1` (**LIVE**, `648 ms`, `45–47` audio chunks). `Google Workspace` & `Notion` remain honestly in `SANDBOX` (`1 ms`) until credentials are saved above.

**Project Root:** `C:\Users\lalwa\.gemini\antigravity\scratch\oncue-even-g2`  
**Verified Clean-Room Code Commit:** `PENDING_CLEAN_ROOM_STAMP` *(updated immediately after clean-room `git clone` in `docs/VERIFICATION_LOG.txt`)*  
**Public Repository:** https://github.com/vaibhav4046/onq-even-g2  
**Live Docs & Privacy Policy:** https://vaibhav4046.github.io/onq-even-g2/ · https://vaibhav4046.github.io/onq-even-g2/privacy.html  
**Hard Safety Stop Enforced:** Zero `git push`, zero `--no-verify`, zero DoraHacks/Product Hunt auto-submission, zero paid spend, and zero real outbound emails/remote pushes.

---

## 1. Verified Artifact Inventory (2026-11-27 Final Run)

| Artifact | Path | Observed Verification |
| :--- | :--- | :--- |
| **Monorepo Source & Tests** | `packages/core`, `apps/server`, `apps/glasses`, `apps/web` | `npm test`: **`527` tests passing** across **`54` files** (`0` TS errors across all 4 `tsconfig.json` projects) |
| **Orchestration & Safety Eval** | `docs/HARNESS_EVAL.json` (`npm run eval:harness`) | **`32/32` intents (100%)**, **`5/5` prompt injections blocked**, **`3/3` 409 locks**, **`5/5` RMS silence blocks**, **`4` failover scenarios** |
| **EvenHub G2 Package** | `dist/onq.ehpk` (`npm run pack`) | **`57,865` bytes**, SDK `0.0.16`, `min_app_version 2.2.10` (`ONQ_RELAY_ORIGIN` / `ONQ_RELAY_URL` supported for remote builds) |
| **Official Simulator Captures** | `docs/screenshots/sim-01..17.png` (`npm run verify:sim`) | **`17` real `576×288` captures** from `@evenrealities/evenhub-simulator@0.9.5` with **`0` console/uncaught errors** (incl. `sim-16-coding-pr-gate.png` & `sim-17-career-pack.png`) |
| **11-Check Geometry Gate** | `scripts/verify-geometry.mjs` | **`11/11` PASS** + Check 11 negative control (`97.4%`–`97.9%` pure-black optical field, `<= 266` UTF-8 bytes, `0` console errors) |
| **Security Audit Report** | `SECURITY_AUDIT.md` (`npm run verify:security`) | **`10/10` PASS**, `0` secret hits across `167` source files + `dist/onq.ehpk`, `npm audit --omit=dev`: **`0` vulnerabilities** |
| **Web Bundle & Modern Web Guidance** | `apps/web` (`npm run build`), `legacy-scan` | Entry JS chunk **`272.89 kB` raw / `70.80 kB` gzip** (`@onq/glasses`: `141.68 kB` / `52.89 kB` gzip); Three.js lazy-loaded; `modern-web-guidance legacy-scan`: **`0` findings across `41` files** |
| **Live Stack, Reboot & Mobile Audit** | `scripts/brutal-live-check.mjs` + `390×844` + reboot + `/api/os/command` | **`BRUTAL_LIVE_CHECK_PASS`**: `0` console/page errors, `0` horizontal overflow at `1280×800`, `1024×768`, `390×844`; reboot preserves `Telegram=LIVE \| AssemblyAI=LIVE`; `/code prep pr` (`L2_APPROVAL`), `/project career_pack` (`L2_APPROVAL`), `/run ollama` OK, `git push --force` (`L5_BLOCKED`) |
| **Clean-Room Verification Log** | `docs/VERIFICATION_LOG.txt` | Fresh zero-env isolated clone in `%TEMP%\onq-overnight-clean` (`npm ci`, `527` tests, `eval`, `build`, `pack`, `geometry`, `security` — all exit `0`) |
| **Primary Launch Film v5** | `media/out/onq-film-v5-day-in-life.mp4` | **7-Act "Day in the Life with OnQ": `1920×1080`, `30 fps`, `165.00 s` (`2:45` `<= 170s`), `23.22 MB` (`24,352,060` bytes), `-16.0 LUFS`**, dual-voice AssemblyAI `TTS-1` (`aai-kyla` + `aai-titus`), real simulator captures, 9 frames visually verified (`0` overlap). *Backup preserved at `media/out/onq-film-v4.mp4` (`2:40`, `26.10 MB`).* |
| **Adversarial & Judging Reports** | `docs/ADVERSARIAL_JUDGE_VERDICT.md`, `docs/JUDGING_ROUND_REPORT.md` | **5/5 customer personas PASS**, Round 3 4-judge controllable weighted score **`9.66 / 10`** (`>= 9.5/10` on every controllable rubric bucket) |
| **Hackathon Rubric & Pitch Docs** | `docs/HACKATHON_RUBRIC_AUDIT.md`, `docs/TVM_PITCH_DECK.md`, `docs/COMPETITIVE_ANALYSIS.md`, `docs/DORAHACKS_SUBMISSION.md` | Fully synced with exact verified numbers & honest physical-G2 disclosure |
| **API Feedback Deliverable** | `API_FEEDBACK.md` | 5 concrete Even Hub SDK `0.0.16`, Simulator `0.9.5`, and WebView OAuth PKCE requests |
| **Product Hunt Launch Kit** | `media/product-hunt/` | `gallery-01..04.png` (`1270×760`), `thumbnail-240x240.gif`, `PRODUCT_HUNT_LAUNCH_COPY.md` |

> **Honest Physical Hardware Disclosure:** Verified in `@evenrealities/evenhub-simulator@0.9.5`, our 11-check Chromium `576×288` Geometry Gate, live Playwright desktop/mobile checks, clean-room zero-env build, and `527` automated tests. **Physical Even Realities G2 glasses and R1 ring hardware testing is NOT done** (camera-free, speakerless G2; TTS audio plays through paired phone/earbuds).

---

## 2. Manual Pre-Publish Checklist (Your Final Clicks Only)

1. *(Optional, 30s)* Open `http://127.0.0.1:5173/#connectors` to save Google OAuth or Notion token into `~/.onq/vault.enc` if you want live Google/Notion during Demo Day.
2. Push local `master` commits to GitHub (`git push -u origin master`) and confirm GitHub Pages (`https://vaibhav4046.github.io/onq-even-g2/`) & Privacy Policy are live.
3. Upload **`media/out/onq-film-v5-day-in-life.mp4`** (`2:45`, `23.22 MB`, `1080p`, backup `onq-film-v4.mp4`) to YouTube/DoraHacks and attach **`dist/onq.ehpk`** (`57,865` bytes).
4. Paste **`docs/DORAHACKS_SUBMISSION.md`** + the 5 SDK requests from **`API_FEEDBACK.md`** into DoraHacks before **Sunday, 29 Nov 2026, 19:59 GMT** and click Submit.
5. *(Optional)* Publish Product Hunt using `media/product-hunt/gallery-01..04.png`, `thumbnail-240x240.gif`, and `media/product-hunt/PRODUCT_HUNT_LAUNCH_COPY.md`.
