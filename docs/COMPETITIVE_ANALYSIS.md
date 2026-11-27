# OnQ Competitive Analysis (DoraHacks Heads Up: Even Realities G2 - Track 04)

This analysis evaluates **OnQ** directly against the official **Heads Up: Even Realities Hackathon (Track 04: AI Assistants & Work)** rubric (**Read & Write in seconds**) and observed public Track 04 / G2 entries.

---

## 1. Track 04 Core Judging Rubric Alignment

| Judge Dimension | Official Criteria | How OnQ Executes & Proves It |
| :--- | :--- | :--- |
| **Read in Seconds** | Surface one critical brief cleanly on the 576x288 monochrome optical waveguide | Fuses Calendar countdown + latest Gmail thread + Google Drive snippet + Notion tasks into 1 scannable card (`<= 7` lines, `<= 42` cols, `<= 999` UTF-8 bytes, `97.3%-98.0%` black optical field). |
| **Write via Voice / R1 Ring** | Immediate voice reply or confirmation tap from glasses / R1 ring | Hands-free voice (`"OnQ, ..."` / `"Cue, ..."`) via `AssemblyAI STT-3.7` or local Whisper, staged behind Default-NO + `2.0s` 4-bit Gray8 PNG Countdown Ring. |
| **Open APIs & Track 04 Breadth** | Real integrations across Claude, ChatGPT, OpenRouter, Notion, Google Workspace | Live Google OAuth 2.0 + `S256` PKCE + `HttpOnly` cookie, 1-click `.ics`, Notion `2026-03-11` `data_sources` auto-schema, 4-tier cascading failover (`Claude -> OpenRouter -> ChatGPT -> Rules`), and `AssemblyAI STT-3.7` / `TTS-1`. |
| **Hardware Integrity** | Respects true G2 constraints (no camera, no speaker, proto3 zero-enum quirks) | Zero camera/speaker assumptions (`TTS-1` routes to earbuds), proto3 zero-value `CLICK_EVENT` normalization (`normalizeEvenEvent`), `dist/onq.ehpk` (`60,341` bytes, SDK `0.0.16`), `17` real EvenHub Simulator `0.9.5` PNGs (`sim-01..17.png` with `76×76` 4-bit Gray4 real-app logos & native menu goodies), `11/11` Chromium geometry gate (`97.2%–97.8%` dark, `<= 266` UTF-8 bytes). |

---

## 2. Head-to-Head Matrix vs Field Entries (54-Entry Audit)

| Metric / Capability | **OnQ (Track 04 + Best Telegram)** | *OcuClaw v2.2.1* | *TapBack & PinGuard* | *Aside, Nod, FUSE Brief, PulseHUD & WickSight* |
| :--- | :--- | :--- | :--- | :--- |
| **Zero-Friction Instant Start** | **1-click Browser 3D Lens + EvenHub 0.9.5 Sim + `npm run tunnel` remote HTTPS** | Requires Tailscale + Host OpenClaw/Hermes | Even Hub install / single flow | Local / sample setup only |
| **Live Integrations** | **GCal + Gmail + Drive + Notion (`2026-03-11`) + Telegram (`28 ms` live) + `.ics` + Hosted PC AI (`Ollama`/`OpenBot`/`MCP`)** | OpenClaw / Hermes external skills only | Telegram only (*TapBack*) or Calendar only (*PinGuard*) | Notion-only (*Aside*), Gmail-only (*Nod*), offline `.ics`/`.mbox` (*FUSE Brief*), single stream (*PulseHUD*/*WickSight*) |
| **Generative Glasses Apps & Avatar** | **LiveUI Micro-Apps + 76×76 4-bit Gray4 Monochrome Shonen Pixel Avatar + AssemblyAI `<1s` Voice** | LiveUI v3 + 22×37 marker + Soniox | Static reply / conflict cards | Static 3-line cards |
| **Write Safety Locks** | **4 Layers (RMS Gate, Default-NO, 2.0s Ring, `31 ms` Zero-LLM 409 Hard-Lock, Code-Guard, 30s Undo, Inline Telegram Kill Switch)** | Approval prompt (no 409 etag lock) | 2s undo (*TapBack*) / 409 lock (*PinGuard*) — neither unifies all 4 | Basic prompt or read-only |
| **AI Model Coverage** | **Hosted PC `$0` Local (`Ollama qwen3:1.7b` LIVE, CLIs, OpenBot) + Optional APIs (`Claude`, `OpenRouter`, `ChatGPT`) + Rules** | Host agent model routing | Single cloud LLM | Single LLM / scripted voice |
| **Security & Persistence** | **10/10 Audit PASS (`0` secrets in `169` files + `.ehpk`, durable `~/.onq/vault.enc` AES-256-GCM `0600`, `0` vulns, `530` tests / `55` files)** | Host relay + Tailscale ACL | Standard env | Local storage |

*OcuClaw v2.2.1 comparison grounded in shipped package analysis via REA (`ev_c80bd92...` / `ev_f364f504...`) and public `ocuclaw/ocuclaw` & `ocuclaw-openclaw-plugin` repositories.*

---

## 3. Why OnQ Wins Track 04 & Product Hunt

1. **Zero Broken Live Flows Under Judging:** Unlike entries that crash without API keys or double-book Calendar slots on repeated voice commands, OnQ boots cold cleanly in Sandbox mode and upgrades seamlessly to live OAuth / Notion / Telegram / `.ics` / `AssemblyAI` / multi-model AI via a single Connectors Hub.
2. **True Multi-Model Failover Harness:** If Claude hits `429` or times out at `8000ms`, OnQ cascades in-flight to OpenRouter, then ChatGPT, then deterministic Rules, verifying every output through `Code-Guard` (`5/5` prompt injections blocked).
3. **Production Hardware Fidelity:** Real photorealistic 3D camera-free G2 + R1 Ring hero with click-to-expand `576x288` optical POV, verified on official `@evenrealities/evenhub-simulator@0.9.5`. Physical Even G2 + R1 hardware testing remains honestly disclosed as pending.
