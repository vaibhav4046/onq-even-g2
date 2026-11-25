# OnQ Competitive Analysis (DoraHacks Heads Up: Even Realities G2 - Track 04)

This analysis evaluates **OnQ** directly against the official **Heads Up: Even Realities Hackathon (Track 04: AI Assistants & Work)** rubric (**Read & Write in seconds**) and observed public Track 04 / G2 entries.

---

## 1. Track 04 Core Judging Rubric Alignment

| Judge Dimension | Official Criteria | How OnQ Executes & Proves It |
| :--- | :--- | :--- |
| **Read in Seconds** | Surface one critical brief cleanly on the 576x288 monochrome optical waveguide | Fuses Calendar countdown + latest Gmail thread + Google Drive snippet + Notion tasks into 1 scannable card (`<= 7` lines, `<= 42` cols, `<= 999` UTF-8 bytes, `97.3%-98.0%` black optical field). |
| **Write via Voice / R1 Ring** | Immediate voice reply or confirmation tap from glasses / R1 ring | Hands-free voice (`"OnQ, ..."` / `"Cue, ..."`) via `AssemblyAI STT-3.7` or local Whisper, staged behind Default-NO + `2.0s` 4-bit Gray8 PNG Countdown Ring. |
| **Open APIs & Track 04 Breadth** | Real integrations across Claude, ChatGPT, OpenRouter, Notion, Google Workspace | Live Google OAuth 2.0 + `S256` PKCE + `HttpOnly` cookie, 1-click `.ics`, Notion `2026-03-11` `data_sources` auto-schema, 4-tier cascading failover (`Claude -> OpenRouter -> ChatGPT -> Rules`), and `AssemblyAI STT-3.7` / `TTS-1`. |
| **Hardware Integrity** | Respects true G2 constraints (no camera, no speaker, proto3 zero-enum quirks) | Zero camera/speaker assumptions (`TTS-1` routes to earbuds), proto3 zero-value `CLICK_EVENT` normalization (`normalizeEvenEvent`), `Dist/onq.ehpk` (`45,096` bytes, SDK `0.0.16`). |

---

## 2. Head-to-Head Matrix vs Field Entries

| Metric / Capability | **OnQ (Track 04 + Track 01)** | *OcuClaw v2.2.1 (Akelu · Hub)* | *Chesly / TeleGlance* | *Aside & TapBack* |
| :--- | :--- | :--- | :--- | :--- |
| **Zero-Friction Instant Start** | **1-click Browser 3D Lens + EvenHub 0.9.5 Sim** | Requires Tailscale + Host OpenClaw/Hermes + Hub | Even Hub mobile install only | Hub app / local setup |
| **Live Integrations** | **GCal + Gmail + Drive + Notion (`2026-03-11`) + Telegram + `.ics`** | OpenClaw / Hermes external skills only | Telegram / Slack / Mail digest | Notion / Telegram only |
| **Generative Glasses Apps** | **LiveUI Micro-Apps (Timers, Split Bill, Tables, Games, Safe Formulas)** | LiveUI v3 (depends on TypeSafe JEV API) | Static 3-line cards | Static note / reply cards |
| **Alive Companion & Voice** | **JJK Six Eyes Viseme Lip-Sync + AssemblyAI <1s Duplex + `<dwell>`/`<beat/>` Pacing** | Speck 22x37 marker + Soniox turn STT/TTS | None | None |
| **Multi-Agent + Remote Screen** | **4-Lane Kanban + Watch Agent Screen w/ Human Lease + Quiet Chips + 3D Memory Galaxy** | Hermes Kanban + RFB Bot Screen + 3D Map + JEV | Single thread view | Basic approval prompt |
| **Write Safety Locks** | **4 Layers (RMS Gate, Default-NO, 2.0s Ring, 409 Hard-Lock, Code-Guard)** | Explicit approval prompts (no 409 etag lock) | Confirm prompt | 2s undo confirm |
| **AI Model Coverage** | **Claude + OpenRouter Free Cascade + ChatGPT + Local CLIs + Rules** | Host agent model routing | Single cloud LLM | Single LLM / Whisper |
| **Security Verification** | **10/10 Audit PASS (`0` secrets, AES-256-GCM 0600 Vault, zero `eval`)** | Host relay + Tailscale ACL | Standard env | Local storage |

*OcuClaw v2.2.1 comparison grounded in shipped package analysis via REA (`ev_c80bd92...` / `ev_f364f504...`) and public `ocuclaw/ocuclaw` & `ocuclaw-openclaw-plugin` repositories.*

---

## 3. Why OnQ Wins Track 04 & Product Hunt

1. **Zero Broken Live Flows Under Judging:** Unlike entries that crash without API keys or double-book Calendar slots on repeated voice commands, OnQ boots cold with `236/236` verified behaviors in Sandbox mode and upgrades cleanly to live OAuth / Notion / `.ics` / `AssemblyAI` / multi-model AI via a single Connectors Hub.
2. **True Multi-Model Failover Harness:** If Claude hits `429` or times out at `8000ms`, OnQ cascades in-flight to OpenRouter, then ChatGPT, then deterministic Rules, verifying every output through `Code-Guard` (`5/5` prompt injections blocked).
3. **Production Hardware Fidelity:** Real photorealistic 3D camera-free G2 + R1 Ring hero with click-to-expand `576x288` optical POV, verified on official `@evenrealities/evenhub-simulator@0.9.5`. Physical Even G2 + R1 hardware testing remains honestly disclosed as pending.
