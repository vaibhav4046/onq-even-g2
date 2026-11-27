# OnQ — Iterative Judging Round Report (Rounds 1 -> 2 -> 3 Final · 2026-11-27)

> **Event:** Heads Up: Even Realities Hackathon (DoraHacks — Track 04: AI Assistants & Work + Best Telegram Integration)  
> **Controllable Weighted Score Progression:** `8.13 / 10` (Round 1) -> `9.50 / 10` (Round 2) -> **`9.66 / 10` (Round 3 Final)** *(>= 9.5/10 across all controllable buckets)*  
> **Hardware Honesty Statement:** Verified across **`530` tests (`55` files)**, **`17` real `@evenrealities/evenhub-simulator@0.9.5` captures (`sim-01..17.png` with `76×76` 4-bit Gray4 real-app logos + native goodies)**, **`11/11` Geometry Gate (`97.2%–97.8%` black pixels)**, **`10/10` Security Audit (`0` secrets in `169` files + `60,341`-byte `.ehpk`, `0` prod vulns)**, live Playwright desktop/mobile (`0` errors, `0` overflow), reboot durability, and zero-env clean-room `git clone`. **Physical Even Realities G2 glasses & R1 ring hardware testing has NOT been performed** (camera-free, speakerless G2 audio is routed via paired phone/earbuds using `AssemblyAI-TTS-1`).

---

## 1. Round-by-Round Rubric Convergence (4 Brutal Judges)

| Rubric Bucket (Weight) | R1 Score | R2 Score | **R3 Final** | Key Engineering Deltas Across Rounds |
| :--- | :---: | :---: | :---: | :--- |
| **Usefulness on G2** (`30%`) | `8.0` | `9.4` | **9.6 / 10** | R2 added PC AI Power Source (`HOSTED · READY`/`STANDBY`) + `npm run tunnel`; R3 delivered full Day-in-the-Life product parity: Morning Brief (`<= 7×42`), Notion voice check-off (`"OnQ, mark Q4 deck review done"`), Coding PR Gate (`/code prep pr`), and Automated Career Pack (`/project career_pack`). |
| **Read & Write Loop** (`25%`) | `8.5` | `9.6` | **9.7 / 10** | R2 added deterministic `31 ms` 409 busy-slot pre-check (`0` LLM calls) and `1.76 s` Ollama cap; R3 added local `git_diff_stat`, secret scan, `DRY_RUN_PR_PUSH:` safe PR dry-run receipt, L5 force-push/secret blocks, and Code-Guard Gmail outreach staging behind Default-NO -> 2.0s Ring -> 30s Undo. |
| **Technical Execution** (`20%`) | `8.5` | `9.7` | **9.8 / 10** | R2 moved vault to durable `~/.onq/vault.enc` (`0600`) with silent boot auto-reconnect; R3 expanded suite to `527` tests (`54` files, incl. `dayInTheLifeParity.test.ts` write-safety gauntlet), proved reboot auto-reconnect live, and passed zero-env clean-room `git clone` across all 7 gates. |
| **UX, Display & Voice** (`15%`) | `8.0` | `9.4` | **9.6 / 10** | R2 fixed `sim-11` double prefix and synced 3D/Sim ProofStrip; R3 captured `sim-16-coding-pr-gate.png` + `sim-17-career-pack.png` (`17` total PNGs, `0` console errors), passed `modern-web-guidance` (`0/41` legacy findings), and shipped flagship emerald-anime film `media/out/onq-film-v5-day-in-life.mp4` (`2:45`, `1080p`, `-16.0 LUFS`, 9 verified frames). |
| **Business & Safety** (`10%`) | `6.5` | `9.3` | **9.5 / 10** | R2 established `$0.0000` hosted-PC LLM marginal cost (Ollama `qwen3:1.7b` LIVE) vs `$7/mo` Pro (managed HTTPS relay + AssemblyAI voice + multi-workspace sync) & `$19/seat` Team; R3 hardened L5 hard-blocks (`git push --force`/`-f`, `rm -rf`, `.env`/vault export, blind spam). *Honest limit: 0 paying customers yet.* |
| **Best Telegram Integration** *(Bonus)* | `8.5` | `9.6` | **9.7 / 10** | `@onq_g2_copilot_bot` LIVE (`28–34 ms`), `/myid` owner DM lock, watched-chats-only filter, silent in unwatched groups, inline `[Approve Once]` / `[Reject]` / `[Kill Switch (Pause All)]`, full `/code`, `/jobs`, `/apps`, `/inference`, `/run` parity, `HTTP 409` webhook backoff. |
| **Controllable Weighted Total** | `8.13` | `9.50` | **9.66 / 10** | **All controllable rubric dimensions >= 9.5 / 10.** |

---

## 2. 5-Persona Live & Automated Verification Matrix

| # | Persona | Scenario Exercised | Sources of Truth Verified | Outcome |
| :-: | :--- | :--- | :--- | :---: |
| 1 | **Morning Executive** | Glance 08:15 Morning Brief (`Calendar + Gmail + Notion + Telegram`), mark `"OnQ, mark Q4 deck review done"` behind Default-NO -> 2s ring -> Receipt, hit `31 ms` 409 Conflict Lock at 13:48 | `dayInTheLifeParity.test.ts` (Morning Brief, voice completion, 1.5s disarm `0` writes, `8×` concurrency lock, `31 ms` 409 lock), `brutal-live-check.mjs` (`conflict409Shown: true`), `sim-01..08.png` | **PASS** |
| 2 | **Senior Staff Engineer** | Invoke `/code prep pr` (`L4_PIPELINE` `software_delivery` + `git_diff_stat` + secret scan -> `L2_APPROVAL` `DRY_RUN_PR_PUSH:`), attempt `git push --force origin main` (`L5_BLOCKED`) | `dayInTheLifeParity.test.ts`, `sim-16-coding-pr-gate.png`, live `/api/os/command` (`200 OK`, `L2_APPROVAL`, `L5_BLOCKED` zero approval armed) | **PASS** |
| 3 | **AI Job Seeker** | Invoke `/project career_pack AI Engineer roles` -> match 3 AI roles -> stage Notion tracker + Code-Guard Gmail draft behind Default-NO (zero blind auto-apply/spam) | `dayInTheLifeParity.test.ts`, `sim-17-career-pack.png`, `@onq/core` `verifyDraftAndPayload`, live `/api/os/command` (`L2_APPROVAL`) | **PASS** |
| 4 | **Privacy & Security Auditor** | Stop/restart `:8787` to test `~/.onq/vault.enc` (`0600`) durability, trigger Kill Switch (`HTTP 423`), send prompt injections, inject RMS-silent WAV, scan repo + `.ehpk` | Reboot `[onq:boot] Auto-reconnect: Telegram=LIVE \| AssemblyAI=LIVE`, `npm run verify:security` (`10/10` PASS, `0` secrets, `0` prod vulns), `npm run eval:harness` (`5/5` injections, `5/5` RMS silence), clean-room `git clone` | **PASS** |
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
| **Reproducible Proof Gate** | `527` tests, `17` Sim `0.9.5` PNGs, `11/11` Geometry, `10/10` Security, zero-env clean-room | Demo video | Demo video | Sample/local runs | Status cards | Packaged `.ehpk` (`REA` verified) |

---

## 4. Top 3 Remaining Risks & Mitigations Applied

1. **Physical G2 + R1 Ring Wireless Latency & Fit:** Unverified on real eyewear because no hardware unit is present. *Mitigation:* Enforced `<= 4 Hz` `BlePaintQueue`, proto3 `undefined` event normalization (`normalizeEvenEvent`), `97.4%–97.9%` black field, `<= 266`-byte frames, `17` simulator captures, and explicit `API_FEEDBACK.md` proposals.
2. **Pre-Linked Google / Notion OAuth on Demo Day:** `~/.onq/vault.enc` already auto-reconnects Telegram & AssemblyAI across reboots; Google/Notion stay cleanly in labeled `SANDBOX` until user connects once at `http://127.0.0.1:5173/#connectors`. *Mitigation:* Single-click resume banner placed at top of `FINAL_SUBMISSION_HANDOFF.md` plus 45m OAuth refresh keepalive.
3. **Host Availability Away from Desk (`cloudflared` URL Rotation):** Quick-tunnels rotate URLs on reboot unless named Cloudflare tunnel or Tailscale is used. *Mitigation:* OnQ detects tunnel origin dynamically, offers 1-click QR pairing (`/g/?pair=<code>`), keeps every paired endpoint behind hashed bearer tokens + `HTTP 423` Kill Switch, and reserves managed permanent relay for the `$7/mo` Pro tier.
