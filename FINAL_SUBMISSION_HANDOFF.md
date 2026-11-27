# OnQ — Final Hackathon & Product Hunt Submission Handoff

> **1-Click Google Workspace & Notion Resume URL (Permanent Persistence Ready):**  
> Open **`http://127.0.0.1:5173/#connectors`** while `npm run dev` is running to connect Google OAuth 2.0 (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) or Notion (`ntn_...` + Database ID). Once saved, tokens are encrypted in your durable **`~/.onq/vault.enc`** (`AES-256-GCM`, mode `0600` — outside the repository, never touched by `npm test`, `verify:sim`, `verify:security`, or `git clean`) and silently auto-reconnected on every boot with a 45-minute Google OAuth token keepalive.  
> **Current Live Connectors Verified (2026-11-27):** `Notion OnQ G2` (**LIVE · TESTED**, `580 ms`, `2026-03-11 schema OK`), `Ollama qwen3:1.7b` (**LIVE**, `$0` local inference, `31 ms` zero-LLM 409 lock), `OmniRoute` (**LIVE**, `295` models), `Telegram @onq_g2_copilot_bot` (**LIVE**, `28–34 ms`, `/menu` Control Center + `/bot` Studio), `Open-Meteo` (**LIVE**, zero-key weather), `AssemblyAI STT-3.7 + TTS-1` (**LIVE**, `648 ms`). `Google Workspace` OAuth Web Client (`OnQ Local G2`) is provisioned in Google Cloud Console (`OnQ Even G2`) and ready for 1-click OAuth sign-in at `http://127.0.0.1:5173/#connectors`.

**Project Root:** `C:\Users\lalwa\.gemini\antigravity\scratch\oncue-even-g2`  
**Verified Clean-Room Code Commit:** `dbd50ca` *(all 7 clean-room gates exit `0` with zero env vars; transcript in `docs/VERIFICATION_LOG.txt`)*  
**Public Repository:** https://github.com/vaibhav4046/onq-even-g2  
**Live Interactive G2 Studio (Zero Keys):** https://vaibhav4046.github.io/onq-even-g2/demo/  
**Live Docs & Privacy Policy:** https://vaibhav4046.github.io/onq-even-g2/ · https://vaibhav4046.github.io/onq-even-g2/privacy.html  
**GitHub Release `v1.0.0` (`.ehpk` + Film v5 MP4):** https://github.com/vaibhav4046/onq-even-g2/releases/tag/v1.0.0  
**Finalist Discord Pitch Script (Dec 1):** `docs/FINALIST_PITCH_SCRIPT.md`  
**Hard Safety Stop Enforced:** Zero `git push` forced, zero `--no-verify`, zero DoraHacks/Product Hunt auto-submission, zero paid spend, and zero real outbound emails/remote pushes.

---

## 1. Verified Artifact Inventory (2026-11-27 Final Run)

| Artifact | Path | Observed Verification |
| :--- | :--- | :--- |
| **Monorepo Source & Tests** | `packages/core`, `apps/server`, `apps/glasses`, `apps/web` | `npm test`: **`537` tests passing** across **`56` files** (`0` TS errors across all 4 `tsconfig.json` projects) |
| **Orchestration & Safety Eval** | `docs/HARNESS_EVAL.json` (`npm run eval:harness`) | **`32/32` intents (100%)**, **`5/5` prompt injections blocked**, **`3/3` 409 locks**, **`5/5` RMS silence blocks**, **`4` failover scenarios** |
| **EvenHub G2 Package** | `dist/onq.ehpk` (`npm run pack`) | **`60,271` bytes**, SDK `0.0.16`, `min_app_version 2.2.10` (`ONQ_RELAY_ORIGIN` / `ONQ_RELAY_URL` supported for remote builds) |
| **Official Simulator Captures** | `docs/screenshots/sim-01..17.png` (`npm run verify:sim`) | **`17` real `576×288` captures** from `@evenrealities/evenhub-simulator@0.9.5` with live weather top bar, minimal monochrome Voice Orb, `76×76` 4-bit Gray4 real-app logos, zero dashed-line/tutorial clutter & **`0` console/uncaught errors** |
| **11-Check Geometry Gate** | `scripts/verify-geometry.mjs` | **`11/11` PASS** + Check 11 negative control (`97.3%`–`98.5%` pure-black optical field, `<= 178` UTF-8 bytes, `0` console errors) |
| **Security Audit Report** | `SECURITY_AUDIT.md` (`npm run verify:security`) | **`10/10` PASS**, `0` secret hits across source files + `dist/onq.ehpk`, `npm audit --omit=dev`: **`0` vulnerabilities** |
| **Web Bundle & Modern Web Guidance** | `apps/web` (`npm run build`), `legacy-scan` | Entry JS chunk **`305.02 kB` raw / `81.20 kB` gzip** (`@onq/glasses`: `148.64 kB` / `55.32 kB` gzip); Three.js lazy-loaded; `modern-web-guidance legacy-scan`: **`0` findings across `41` files** |
| **Live Stack, Reboot & Mobile Audit** | `scripts/brutal-live-check.mjs` + `390×844` + `/api/harness/pool` + `/api/weather` | **`BRUTAL_LIVE_CHECK_PASS`**: `0` console/page errors, `0` horizontal overflow (`1280×800`, `1024×768`, `390×844`); Notion LIVE (`580ms`), Telegram LIVE, AssemblyAI LIVE, Ollama LIVE |
| **Clean-Room Verification Log** | `docs/VERIFICATION_LOG.txt` | Fresh zero-env isolated clone in `%TEMP%\onq-overnight-clean` (`npm ci`, tests, `eval`, `build`, `pack`, `geometry`, `security` — all exit `0`) |
| **Primary Launch Film v5** | `media/out/onq-film-v5-day-in-life.mp4` | **Photorealistic Editorial 7-Act "Day in the Life with OnQ": `1920×1080`, `30 fps`, `165.00 s` (`2:45`), `19.46 MB` (`20,408,467` bytes), `-16.0 LUFS`**, strict in-lens Even G2 optical fit (zero rim spill), living Voice Orb, OnQ Studio typography, dual-voice AssemblyAI `TTS-1`, refreshed 17 simulator captures, `537` test count. |
| **OpenBot REA Analysis** | `docs/OPENBOT_HARNESS_ANALYSIS.md` | REA-verified backend sync/ACP/CPU-limit patterns adapted into `HarnessLoadBalancer` + circuit breaker + local agent/cron discovery |
| **Adversarial & Judging Reports** | `docs/ADVERSARIAL_JUDGE_VERDICT.md`, `docs/JUDGING_ROUND_REPORT.md` | **5/5 customer personas PASS**, Round 4 4-judge controllable weighted score **`9.75 / 10`** (`>= 9.5/10` on every controllable rubric bucket) |
| **Hackathon Rubric & Pitch Docs** | `docs/HACKATHON_RUBRIC_AUDIT.md`, `docs/TVM_PITCH_DECK.md`, `docs/COMPETITIVE_ANALYSIS.md`, `docs/DORAHACKS_SUBMISSION.md` | Fully synced with exact verified numbers & honest physical-G2 disclosure |
| **API Feedback Deliverable** | `API_FEEDBACK.md` | 5 concrete Even Hub SDK `0.0.16`, Simulator `0.9.5`, and WebView OAuth PKCE requests |
| **Product Hunt Launch Kit** | `media/product-hunt/` | `gallery-01..04.png` (`1270×760`), `thumbnail-240x240.gif`, `PRODUCT_HUNT_LAUNCH_COPY.md` |

> **Honest Physical Hardware Disclosure:** Verified in `@evenrealities/evenhub-simulator@0.9.5`, our 11-check Chromium `576×288` Geometry Gate, live Playwright desktop/mobile checks, clean-room zero-env build, and `537` automated tests. **Physical Even Realities G2 glasses and R1 ring hardware testing is NOT done** (camera-free, speakerless G2; TTS audio plays through paired phone/earbuds).

---

## 2. Manual Pre-Publish Checklist (Your Final Clicks Only)

1. *(Optional, 30s)* Open `http://127.0.0.1:5173/#connectors` to save Google OAuth or Notion token into `~/.onq/vault.enc` if you want live Google/Notion during Demo Day.
2. Push local `master` commits to GitHub (`git push -u origin master`) and confirm GitHub Pages (`https://vaibhav4046.github.io/onq-even-g2/`) & Privacy Policy are live.
2. GitHub Releases `v1.0.0` (`onq.ehpk` + `onq-film-v5-day-in-life.mp4`) and GitHub Pages (`https://vaibhav4046.github.io/onq-even-g2/demo/`) are live — *(optional, 60s)* upload **`media/out/onq-film-v5-day-in-life.mp4`** (`2:45`, `23.14 MB`, `1080p`, backup `onq-film-v4.mp4`) as Unlisted YouTube if you want an inline player embed alongside the direct `v1.0.0` MP4 link.
4. Paste **`docs/DORAHACKS_SUBMISSION.md`** + the 5 SDK requests from **`API_FEEDBACK.md`** into DoraHacks before **Sunday, 29 Nov 2026, 19:59 GMT** and click Submit.
5. *(Optional)* Publish Product Hunt using `media/product-hunt/gallery-01..04.png`, `thumbnail-240x240.gif`, and `media/product-hunt/PRODUCT_HUNT_LAUNCH_COPY.md`.
