# OnQ — Even Realities × TVM Ventures × Daos Hub Pitch Deck

> **Product:** OnQ — Proactive Heads-Up Workday & Telegram Copilot for Even G2 + R1 Ring  
> **Tracks:** Track 04 (Complete Workday Loop: Before · During · After) + Track 01 / Best Telegram Integration  
> **Demo Day:** Dec 3, 2026 · Daos Hub, Dubai (Remote / Live)

---

## Slide 1 — Title & Hook
**OnQ: Glance Once. Act by Voice. Leave Your Phone in Your Pocket.**
- Camera-free **525nm monochrome waveguide HUD** for Even Realities G2 glasses + R1 smart ring.
- Unifies **Google Workspace, Notion, and Telegram** into a single sub-2-second voice + ring workflow.

---

## Slide 2 — The Problem (Verified Attention & Context-Switch Tax)
- Knowledge workers lose focus across fragmented calendar, email, doc, and messaging threads (`Calendar + Gmail + Drive + Notion + Telegram`).
- Pulling out a phone mid-corridor or mid-meeting breaks eye contact and social presence.
- Voice-only assistants without visual verification feel risky; chat windows on phones steal attention.

---

## Slide 3 — The Solution: Track 04 Workday Loop + Telegram Bridge
OnQ puts one **42-column crisp micro-card** on your G2 optics across all three phases of work:
1. **Before Meeting:** Corridor brief (`NEXT IN 14M · WHO · LAST DOC · OPEN TELEGRAM PING`), read cleanly at a glance.
2. **During Conversation:** Silent live cue + one-tap bookmarking via R1 ring (`tap` / `doubleTap`) with **no camera and no intrusive recording banner**; explicit consent-first audio.
3. **After / Telegram Follow-Up:** Instant action summary + voice-staged **Telegram reply** or **Notion task write** held in a **45-second Default-NO confirmation gate** before transmission.

---

## Slide 4 — Read & Write (25% Judging Weight)
Even Realities judges **Read + Write** first:
- **Read:**
  - Google Calendar, Gmail, Drive (`GET /api/today`, `/api/meetings/:id/brief`)
  - Notion Databases (`GET /api/notion/...`)
  - **Telegram Bot API** (`GET /api/telegram/digest`, `POST /api/connectors/telegram/test` via `TelegramWorkspaceClient`)
- **Write (Safe, Auditable, Reversible):**
  - **Stage Telegram Reply** (`POST /api/telegram/stage-reply`) -> 45s countdown preview on G2 lens -> R1 `tap` / voice `"Confirm"` dispatches, `"Cancel"` or `doubleTap` aborts.
  - **Draft Gmail / Create Calendar Event / Append Notion Action Item** behind the exact same **Default-NO Commit Receipt** gate.

---

## Slide 5 — Technical Architecture & Security (20% Judging Weight)
- **Zero-Trust Relay & Encrypted Vault:**
  - OAuth tokens & provider API keys encrypted at rest with **AES-256-GCM** (`apps/server/src/tokenVault.ts`) with automatic log redaction.
  - Even G2 WebView Compliant Pairing: external browser OAuth handshake (`Link Even G2 Glasses`) exchanges a short-lived code (`G2_WEBVIEW_OAUTH_BYPASS` guard) because Google OAuth blocks embedded WebViews.
- **Deterministic Resilience:**
  - Multi-LLM routing across **Claude, OpenRouter, ChatGPT** + **AssemblyAI** speech-to-text, with honest `LIVE` / `SANDBOX` / `STALE` status pills directly in the lens header.
- **Even Hub Pack Ready:**
  - Ships cleanly as `.ehpk` (`npm run pack`) targeting authentic **576×288 1-bit phosphor green** waveguide geometry (`npm run verify:geometry`).

---

## Slide 6 — UX, Display & Voice Craft (15% Judging Weight)
- **Real Hardware Constraints First:** Every lens card strictly honors `42-column` monospace legibility on `576×288` optics—no clipped labels, no wall-of-text paragraphs.
- **3D Retro-Realism Showcase:** Live interactive WebGL G2 + R1 hardware twin with transparent crystal lenses, animated 525nm waveguide reel, `Front` / `Wearer POV (Back)` / `Exploded` / `R1 Ring` inspection modes.
- **1-Click Connectors Hub:** Unified 7-provider setup (**Google Workspace, Notion, Telegram, Claude, OpenRouter, ChatGPT, AssemblyAI**) with real upstream `Test Connection` checks.

---

## Slide 7 — Usefulness Across Daily Routines (30% Judging Weight)
- **Pre-VC / Client Sync:** 5-second corridor briefing before walking through the door.
- **Fast Telegram Triage:** Read urgent founder/team Telegram pings silently on glass; speak a 6-word reply, confirm once with R1 ring.
- **Zero Post-Meeting Admin:** Speak `"Log follow-up for Priya in Notion"` — staged, verified, committed with receipt hash.

---

## Slide 8 — Business Model & Unit Economics (10% Judging Weight)
- **Pricing:** Free Tier (Sandbox + BYO keys) → **OnQ Pro ($7/mo)** (Managed OAuth relay, multi-model routing, priority STT, multi-workspace Notion/Telegram sync) → **Team ($19/seat/mo)** (Shared audit receipts & team workspace connectors).
- **Margins:** Short-context brief + triage prompts average **~$0.001 per brief**, yielding **>85% gross margin** at typical daily glance cadence (~30 briefs/day).
- **Wedge:** First-mover productivity layer for camera-free everyday smart eyewear (Even G2 & next-gen waveguide glasses).

---

## Slide 9 — Safety & Trust Model
- **Camera-Free Hardware Integrity:** Respects Even G2's physical no-camera privacy promise.
- **Default-NO Outbound Gate:** Never sends an email, Telegram message, or calendar invite autonomously—every write shows recipient, diff/body, and 45s abort window (`DEFAULT_NO`).
- **Honest Provenance:** UI and lens header never disguise fixture data as live OAuth (`LIVE` vs `SANDBOX` / `STALE`).

---

## Slide 10 — 3-Minute Demo Day Script
1. **0:00–0:35 (Hook + 3D Twin):** Show OnQ landing WebGL G2 glasses (`3D Optics` + `Wearer POV`), explain camera-free 525nm glance UX.
2. **0:35–1:15 (7/7 Connectors):** Scroll to `#connectors`, click `Test Connection` showing `Google Workspace`, `Notion`, `Telegram`, `Claude`, `OpenRouter`, `ChatGPT`, `AssemblyAI` verified.
3. **1:15–2:20 (Dual-Track Read & Write):** Trigger voice brief -> inspect Calendar + Notion context -> read incoming **Telegram** message -> speak reply -> watch **45s Default-NO preview** -> confirm to emit receipt.
4. **2:20–3:00 (Architecture & Ask):** Briefly walk `#architecture` Hydra-grade pipeline + `$7/mo` SaaS unit economics; open Q&A for TVM Ventures & Even Realities judges.
