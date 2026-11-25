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

| Metric / Capability | **OnQ (Track 04)** | *Aside (Track 04)* | *Nod (Track 04)* | *FUSE Brief (Track 04)* | *TapBack (Track 01)* |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Live Integrations** | **GCal + Gmail + Drive + Notion (`2026-03-11`) + `.ics`** | Notion only | Sample Gmail only | Static `.ics` / `.mbox` | Telegram only |
| **AI Model Coverage** | **Claude + OpenRouter + ChatGPT + Rules (8s failover)** | Single LLM | Single LLM | Summarizer mock | Local Whisper only |
| **Meeting Lifecycle** | **Before (Brief) + During (RAM Scribe + TTS-1) + After (Wrap-Up)** | Transcript playback | Read-only inbox triage | Pre-meeting brief | Reply loop |
| **Write Safety Locks** | **4 Layers (RMS Gate, Default-NO, 2.0s Ring, 409 Hard-Lock, Code-Guard)** | Manual draft prompt | Basic send prompt | In-memory mock | 2s undo confirm |
| **Automated Tests** | **213 / 213 passing** (`npm test`) | 48 tests | 13 tests | None | 132 tests |
| **Reproducible Eval Harness** | **32/32 intents, 5/5 injection block, 3/3 409 lock** (`npm run eval:harness`) | None | None | None | None |
| **Optical Geometry & Sim** | **11/11 Chromium Gate + 7 EvenHub Simulator 0.9.5 captures** | Simulator screenshots | Basic render | UI mockup | Simulator verified |
| **Security Verification** | **10/10 Audit PASS (`0` secrets across 83 files & `.ehpk`)** | Standard env | Standard env | Client keys | Local storage |

---

## 3. Why OnQ Wins Track 04 & Product Hunt

1. **Zero Broken Live Flows Under Judging:** Unlike entries that crash without API keys or double-book Calendar slots on repeated voice commands, OnQ boots cold with `213/213` verified behaviors in Sandbox mode and upgrades cleanly to live OAuth / Notion / `.ics` / `AssemblyAI` / multi-model AI via a single Connectors Hub.
2. **True Multi-Model Failover Harness:** If Claude hits `429` or times out at `8000ms`, OnQ cascades in-flight to OpenRouter, then ChatGPT, then deterministic Rules, verifying every output through `Code-Guard` (`5/5` prompt injections blocked).
3. **Production Hardware Fidelity:** Real photorealistic 3D camera-free G2 + R1 Ring hero with click-to-expand `576x288` optical POV, verified on official `@evenrealities/evenhub-simulator@0.9.5`. Physical Even G2 + R1 hardware testing remains honestly disclosed as pending.
