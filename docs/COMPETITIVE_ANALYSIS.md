# OnQ Competitive Analysis (DoraHacks Heads Up: Even Realities G2 - Track 04)

This analysis evaluates **OnQ** directly against the official **Heads Up: Even Realities Hackathon (Track 04: AI Assistants & Work)** rubric (**Read & Write in seconds**) and observed public Track 04 / G2 entries.

---

## 1. Track 04 Core Judging Rubric Alignment

| Judge Dimension | Official Criteria | How OnQ Executes & Proves It |
| :--- | :--- | :--- |
| **Read in Seconds** | Surface one critical brief cleanly on the 576x288 monochrome optical waveguide | Fuses Calendar countdown + live Open-Meteo weather + latest Gmail thread + Google Drive snippet + Notion tasks into 1 scannable card (`<= 7` lines, `<= 42` cols, `<= 178` UTF-8 bytes, `97.3%–98.5%` black optical field). |
| **Write via Voice / R1 Ring** | Immediate voice reply or confirmation tap from glasses / R1 ring | Hands-free voice (`"OnQ, ..."` / `"Cue, ..."`) via `AssemblyAI STT-3.7` or local Whisper, staged behind Default-NO + `2.0s` 4-bit Gray4 PNG Countdown Ring & minimal Voice Orb. |
| **Open APIs & Track 04 Breadth** | Real integrations across Claude, ChatGPT, OpenRouter, Notion, Google Workspace | Live Google OAuth 2.0 + `S256` PKCE + `HttpOnly` cookie, 1-click `.ics`, Notion `2026-03-11` `data_sources` auto-schema (LIVE verified), adaptive `HarnessLoadBalancer` failover (`Ollama -> Claude -> OpenRouter -> ChatGPT -> Rules`), and `AssemblyAI STT-3.7` / `TTS-1`. |
| **Hardware Integrity** | Respects true G2 constraints (no camera, no speaker, proto3 zero-enum quirks) | Zero camera/speaker assumptions (`TTS-1` routes to earbuds), proto3 zero-value `CLICK_EVENT` normalization (`normalizeEvenEvent`), `dist/onq.ehpk` (`60,271` bytes, SDK `0.0.16`), `17` real EvenHub Simulator `0.9.5` PNGs (`sim-01..17.png` with minimal Voice Orb, live weather & `76×76` 4-bit Gray4 real-app logos), `11/11` Chromium geometry gate (`97.3%–98.5%` dark, `<= 178` UTF-8 bytes). |

---

## 2. Head-to-Head Matrix vs Live DoraHacks Field (159-BUIDL Audit · Nov 27, 2026)

Direct comparison against observed top DoraHacks competitors (`TeleGifts G2`, `Glass Wallet`, `ByYourSide App`, `Cue`, `ThreadLock G2`, `TriageG2`, `Closer`, `Callout`) across `159` total submissions (`40` in Track 04 AI Assistants & Work, `73` in Track 01 Messaging & News):

| Metric / Capability | **OnQ (Track 04 + 01 + Best TG)** | *TeleGifts G2* (`/build/52023`) | *Cue* (`/build/51858`) & *TriageG2* (`/build/51976`) | *Closer*, *Callout*, *ThreadLock G2*, *ByYourSide*, *Glass Wallet* |
| :--- | :--- | :--- | :--- | :--- |
| **Zero-Key Judge Sandbox URL** | **Live GitHub Pages 3D + Lens Studio (`vaibhav4046.github.io/onq-even-g2/demo/`) + EvenHub 0.9.5 + `npm run tunnel`** | Live GitHub Pages Voice & HW Studio | Live GitHub Pages simulator | Live web sandboxes (`Closer`, `Callout`, `ThreadLock`, `ByYourSide`); *Glass Wallet* video-only |
| **Live Integrations** | **GCal + Gmail + Drive + Notion (`2026-03-11`) + Telegram (`36 ms` live) + `.ics` + Hosted PC AI (`Ollama qwen3:1.7b` / `Claude` / `OpenBot`)** | Telegram Bot SSE + TonAPI/CoinGecko | Notion + Telegram (*Cue*); Cal + Gmail + Notion (*TriageG2*) | Gmail haggling (*Closer*), Bybit+TG (*Callout*), Deal terms (*ThreadLock*), Dementia TG (*ByYourSide*), BNB (*Glass Wallet*) |
| **Glasses UI & 4-Bit Graphics** | **Unified `hud-split`, `13` `76×76` 4-bit Gray4 real-app logos, `76×76` Pixel Avatar, corridor pips, `MenuContainerProperty` goodies** | 256×144 4-bit waveguide charts | Gray8 QR pairing (*Cue*); 4-bit workload micro-LED (*TriageG2*) | Standard text / card flows |
| **Write Safety Locks** | **4 Layers (RMS Gate, Default-NO, 2.0s Ring, `31 ms` Zero-LLM 409 Lock, Code-Guard, 30s Undo, Inline Telegram Kill Switch `HTTP 423`)** | P1/P2/P3 triage + `👀` status | Basic confirm / guardrails | Single-tap confirm (*Glass Wallet*/*ByYourSide*) or Demo mode (*Callout*) |
| **Automated Test & Gate Proof** | **`537` tests / `56` files, `32/32` eval, `11/11` Geometry Gate, `17` Sim `0.9.5` PNGs (`0` errors), `10/10` Security (`0` vulns), `v1.0.0` `.ehpk`** | `259` tests + `.ehpk` | `evenhub-simulator@0.9.5` + `.ehpk` | Standard tests; partial `.ehpk` links (`11/159` direct in field) |
| **Hardware Parity Honesty** | **Explicitly disclosed as Simulator `0.9.5` Verified (`0` fake HW claims); audio via paired earbuds** | Simulator `0.9.5` tested | Simulator `0.9.5` tested | Overwhelmingly simulator-tested across 32/32 inspected builds |

*Prior comparison also benchmarked shipped package analysis (`OcuClaw v2.2.1`) and public Track 04 reference flows (`TapBack`, `PinGuard`, `Aside`, `Nod`, `FUSE Brief`).*

---

## 3. Why OnQ Wins Track 04 & Product Hunt

1. **Zero Broken Live Flows Under Judging:** Unlike entries that crash without API keys or double-book Calendar slots on repeated voice commands, OnQ boots cold cleanly in Sandbox mode and upgrades seamlessly to live OAuth / Notion / Telegram / `.ics` / `AssemblyAI` / multi-model AI via a single Connectors Hub.
2. **True Multi-Model Failover Harness:** If Claude hits `429` or times out at `8000ms`, OnQ cascades in-flight to OpenRouter, then ChatGPT, then deterministic Rules, verifying every output through `Code-Guard` (`5/5` prompt injections blocked).
3. **Production Hardware Fidelity:** Real photorealistic 3D camera-free G2 + R1 Ring hero with click-to-expand `576x288` optical POV, verified on official `@evenrealities/evenhub-simulator@0.9.5`. Physical Even G2 + R1 hardware testing remains honestly disclosed as pending.
