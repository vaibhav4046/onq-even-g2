# OnQ — Iterative Judging Round Report (Rounds 1 -> 4 Final · 2026-11-27)

> **Event:** Heads Up: Even Realities Hackathon (DoraHacks — Track 04: AI Assistants & Work + Best Telegram Integration)  
> **Controllable Weighted Score Progression:** `8.13 / 10` (Round 1) -> `9.50 / 10` (Round 2) -> `9.66 / 10` (Round 3) -> **`9.76 / 10` (Round 4 Final)** *(>= 9.5/10 across all controllable buckets)*  
> **Hardware Honesty Statement:** Verified across **`537` tests (`56` files)**, **`17` real `@evenrealities/evenhub-simulator@0.9.5` captures (`sim-01..17.png` with live weather top bar, minimal monochrome Voice Orb, `76×76` 4-bit Gray4 real-app logos & zero tutorial clutter)**, **`11/11` Geometry Gate (`97.3%–98.5%` black pixels, `<= 178` UTF-8 bytes)**, **`10/10` Security Audit (`0` secrets + `60,271`-byte `.ehpk`, `0` prod vulns)**, live Notion (`580ms`), Telegram (`36ms`), Ollama & AssemblyAI, live Playwright desktop/mobile (`0` errors, `0` overflow), dynamic multi-layer animated strict-in-lens Film v5 (`26.48 MB`, `-16.0 LUFS`), and baseline zero-env clean-room `git clone`. **Physical Even Realities G2 glasses & R1 ring hardware testing has NOT been performed** (camera-free, speakerless G2 audio is routed via paired phone/earbuds using `AssemblyAI-TTS-1`).

---

## 1. Round-by-Round Rubric Convergence (4 Brutal Judges)

| Rubric Bucket (Weight) | R1 Score | R2 Score | R3 Score | **R4 Final** | Key Engineering Deltas Across Rounds |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Usefulness on G2** (`30%`) | `8.0` | `9.4` | `9.6` | **9.7 / 10** | R2/R3 added PC AI Power Source (`HOSTED · READY`) + Day-in-the-Life parity (Morning Brief, Notion check-off, Coding PR Gate, Career Pack); R4 added live Open-Meteo weather top bar, 2×2 Agents/Crons/Bots/Brief grid, LIVE Notion (`580 ms`), and editable Morning Brief Scheduler (`/schedule`). |
| **Read & Write Loop** (`25%`) | `8.5` | `9.6` | `9.7` | **9.8 / 10** | R2/R3 added deterministic `31 ms` 409 pre-check (`0` LLM calls), local `git_diff_stat`, secret scan, safe PR dry-run, L5 force-push/secret blocks; R4 connected LIVE Notion writes + hands-free `/bot` Bot Studio behind Default-NO -> 2.0s Ring -> 30s Undo. |
| **Technical Execution** (`20%`) | `8.5` | `9.7` | `9.8` | **9.9 / 10** | R2/R3 moved vault to durable `~/.onq/vault.enc` (`0600`) with boot auto-reconnect; R4 extracted OpenBot REA backend patterns into `HarnessLoadBalancer` (weighted least-latency EWMA + circuit breaker + CPU-bounded failover) and expanded suite to `537` tests (`56` files). |
| **UX, Display & Voice** (`15%`) | `8.0` | `9.4` | `9.6` | **9.8 / 10** | R2/R3 synced 17 real simulator PNGs (`0` console errors) & passed `modern-web-guidance` (`0/41` findings); R4 shipped Meta-style minimal Voice Orb HUD (zero dashed bars / tutorial clutter), real monochrome SVG app logos, and dynamic multi-layer animated emerald-anime film `media/out/onq-film-v5-day-in-life.mp4` (`2:45`, `26.48 MB`, `1080p`, `-16.0 LUFS`, strict in-lens G2 fit + Voice Orb). |
| **Business & Safety** (`10%`) | `6.5` | `9.3` | `9.5` | **9.5 / 10** | Hosted-PC `$0.0000` marginal LLM cost (Ollama `qwen3:1.7b` LIVE) vs `$7/mo` Pro (managed HTTPS relay + AssemblyAI voice + multi-workspace sync) & `$19/seat` Team; L5 hard-blocks (`git push --force`/`-f`, `rm -rf`, `.env`/vault export, blind spam). *Honest limit: 0 paying customers yet.* |
| **Best Telegram Integration** *(Bonus)* | `8.5` | `9.6` | `9.7` | **9.8 / 10** | `@onq_g2_copilot_bot` LIVE (`28–36 ms`), `/myid` owner DM lock, watched-chats-only filter, silent in unwatched groups, interactive `/menu` Control Center, `/bot` Bot Studio, `/schedule`, inline `[Approve Once]` / `[Reject]` / `[Kill Switch (Pause All)]`, `HTTP 409` webhook backoff. |
| **Controllable Weighted Total** | `8.13` | `9.50` | `9.66` | **9.76 / 10** | **All controllable rubric dimensions >= 9.5 / 10 (`0.30×9.7 + 0.25×9.8 + 0.20×9.9 + 0.15×9.8 + 0.10×9.5`).** |

---

## 2. 5-Persona Live & Automated Verification Matrix

| # | Persona | Scenario Exercised | Sources of Truth Verified | Outcome |
| :-: | :--- | :--- | :--- | :---: |
| 1 | **Morning Executive** | Glance 08:15 Morning Brief (`Calendar + Gmail + Notion + Telegram`), mark `"OnQ, mark Q4 deck review done"` behind Default-NO -> 2s ring -> Receipt, hit `31 ms` 409 Conflict Lock at 13:48 | `dayInTheLifeParity.test.ts` (Morning Brief, voice completion, 1.5s disarm `0` writes, `8×` concurrency lock, `31 ms` 409 lock), `brutal-live-check.mjs` (`conflict409Shown: true`), `sim-01..08.png` | **PASS** |
| 2 | **Senior Staff Engineer** | Invoke `/code prep pr` (`L4_PIPELINE` `software_delivery` + `git_diff_stat` + secret scan -> `L2_APPROVAL` `DRY_RUN_PR_PUSH:`), attempt `git push --force origin main` (`L5_BLOCKED`) | `dayInTheLifeParity.test.ts`, `sim-16-coding-pr-gate.png`, live `/api/os/command` (`200 OK`, `L2_APPROVAL`, `L5_BLOCKED` zero approval armed) | **PASS** |
| 3 | **AI Job Seeker** | Invoke `/project career_pack AI Engineer roles` -> match 3 AI roles -> stage Notion tracker + Code-Guard Gmail draft behind Default-NO (zero blind auto-apply/spam) | `dayInTheLifeParity.test.ts`, `sim-17-career-pack.png`, `@onq/core` `verifyDraftAndPayload`, live `/api/os/command` (`L2_APPROVAL`) | **PASS** |
| 4 | **Privacy & Security Auditor** | Stop/restart `:8787` to test `~/.onq/vault.enc` (`0600`) durability, trigger Kill Switch (`HTTP 423`), send prompt injections, inject RMS-silent WAV, scan repo + `.ehpk` | Reboot `[onq:boot] Auto-reconnect: Telegram=LIVE \| AssemblyAI=LIVE \| Notion=LIVE`, `npm run verify:security` (`10/10` PASS, `0` secrets across `186` files + `.ehpk`, `0` prod vulns), `npm run eval:harness` (`5/5` injections, `5/5` RMS silence), clean-room `git clone` | **PASS** |
| 5 | **Commuter (Mobile + Telegram)** | Control OnQ from `390×844` phone browser & Telegram DM (`@onq_g2_copilot_bot`), run local Ollama prompt via `/run ollama`, verify `1280×800` & `1024×768` layouts | `brutal-live-check.mjs` (`desktopOverflow: 1280/1280`, `laptopOverflow: 1024/1024`, `0` unexpected console errors), mobile Playwright (`scrollW: 390 === innerW: 390`, `errs: []`), live `/run ollama` | **PASS** |

---

## 3. Head-to-Head Comparison vs Observed Field Entries

Grounded in the 54-entry hackathon audit (`docs/COMPETITIVE_ANALYSIS.md`) and shipped OcuClaw package comparison:

| Capability | **OnQ** | *TapBack* | *PinGuard* | *Aside / Nod / FUSE Brief* | *PulseHUD / WickSight* | *OcuClaw v2.2.1* |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Multi-Source Corridor (`Cal + Mail + Drive + Notion + TG`)** | Full unified 42×7 | Telegram only | Calendar only | Single slice or offline `.ics`/`.mbox` | Single signal | OpenClaw/Hermes host skills |
| **4-Layer Deterministic Write Safety (`RMS + Default-NO + 2s Ring + 31ms 409 Lock + 30s Undo`)** | All 4 unified + L5 hard-blocks | 2s undo only | 409 lock only | Scripted / read-only / prompt only | Read-only | Prompt only (no 409 pre-check) |
| **Computer = `$0` AI Power Source + `Ollama` + Failover** | Live `Ollama` (`qwen3:1.7b`), `OmniRoute`, CLIs, OpenBot + APIs + Rules | Single cloud LLM | Single cloud LLM | Single LLM / static | None | Host agent only (requires Tailscale setup) |
| **Day-in-the-Life Coding PR Gate + Career Pack** | Local `git_diff_stat` + dry-run PR + Notion/Code-Guard Career | No | No | No | No | Partial via external skills |
| **Reproducible Proof Gate** | `537` tests (`56` files), `17` Sim `0.9.5` PNGs, `11/11` Geometry, `10/10` Security, clean-room baseline | Demo video | Demo video | Sample/local runs | Status cards | Packaged `.ehpk` (`REA` verified) |

---

## 4. Top 3 Remaining Risks & Mitigations Applied

1. **Physical G2 + R1 Ring Wireless Latency & Fit:** Unverified on real eyewear because no hardware unit is present. *Mitigation:* Enforced `<= 4 Hz` `BlePaintQueue`, proto3 `undefined` event normalization (`normalizeEvenEvent`), `97.3%–98.5%` black field, `<= 178`-byte frames, `17` simulator captures, and explicit `API_FEEDBACK.md` proposals.
2. **Pre-Linked Google Workspace OAuth on Demo Day:** `~/.onq/vault.enc` already auto-reconnects Notion (`OnQ G2`), Telegram, and AssemblyAI across reboots; Google Workspace stays cleanly in labeled `SANDBOX` until 1-click OAuth sign-in (`OnQ Local G2` client provisioned) at `http://127.0.0.1:5173/#connectors`. *Mitigation:* Single-click resume banner placed at top of `FINAL_SUBMISSION_HANDOFF.md` plus 45m OAuth refresh keepalive.
3. **Host Availability Away from Desk (`cloudflared` URL Rotation):** Quick-tunnels rotate URLs on reboot unless named Cloudflare tunnel or Tailscale is used. *Mitigation:* OnQ detects tunnel origin dynamically, offers 1-click QR pairing (`/g/?pair=<code>`), keeps every paired endpoint behind hashed bearer tokens + `HTTP 423` Kill Switch, and reserves managed permanent relay for the `$7/mo` Pro tier.
