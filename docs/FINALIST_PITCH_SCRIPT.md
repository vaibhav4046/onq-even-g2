# OnQ — Top-20 Finalist Live Discord Pitch Script (2 Minutes · Dec 1 Evening)

**Target:** Heads Up: Even Realities Hackathon (Track 04: AI Assistants & Work + Track 01 Messaging & Best Telegram Integration).  
**Open live in browser during pitch:** `https://vaibhav4046.github.io/onq-even-g2/demo/` (or local `:5173` + EvenHub Simulator `:9898`).

---

## 0:00 – 0:20 · Hook & Problem (Usefulness on G2 · 30%)
> "Between back-to-back meetings you have about 90 seconds. Pulling your phone to check Calendar, Gmail, Notion, and Telegram means missed asks or rushed mistakes.  
> **OnQ** turns your own PC into the AI brain and Even G2 into a quiet optical window — no cloud token hoarding, and nothing ever sends until you confirm."

*(Action on screen: show the 3D G2 hero + `576×288` optical lens with crisp `76×76` 4-bit Gray4 real-app logos & corridor pips.)*

---

## 0:20 – 0:55 · Live Read & Write + 31 ms 409 Conflict Lock (Read & Write · 25% + Display/Voice · 15%)
> "Watch the full Read-and-Write loop in seconds:
> 1. Click **Test Conflict Lock** (`Move VC sync to 14:45`). Before hitting *any* LLM, OnQ blocks the double-booking deterministically in **31 milliseconds**, shows zero writes occurred, and offers the next free slot.
> 2. Say `'Push 15m and tell Investor'` — it stages **Default-NO** behind a 45-second TTL. One R1 tap flips YES, runs a **2-second 4-bit Gray4 countdown ring**, updates Calendar + Gmail + Notion together, and leaves a **30-second reversible undo receipt**."

*(Action on screen: click **Test Conflict Lock** -> show red 409 lock -> click **1 Confirm and undo** -> tap **YES** -> watch ring + receipt + click **Undo**.)*

---

## 0:55 – 1:25 · PC-as-`$0`-Brain + Coding PR Gate + Telegram Kill Switch (Tech Execution · 20% + Telegram `$1,000` Bounty)
> "Even G2 has no camera and no speaker, and most builders forget people already run local models and coding agents on their computer.
> - Click **Coding PR Gate**: OnQ inspects `git diff`, verifies `530/530` tests locally via **Ollama `qwen3:1.7b` at `$0` marginal API cost**, hard-blocks `git push --force` and leaked secrets at layer L5, and stages a Default-NO approval on both G2 and **Telegram `@onq_g2_copilot_bot`**.
> - In Telegram, OnQ only surfaces chats you explicitly watch, stays silent in groups, and lets you tap inline **`[Approve Once]`** or **`[Kill Switch (Pause All)]`** (instant `HTTP 423` global freeze)."

*(Action on screen: click **Coding PR Gate**, click **Kill Switch** twice to demonstrate instant lock & resume.)*

---

## 1:25 – 1:50 · Proof, Honesty & Business Model (Business & Safety · 10%)
> "Everything is reproducible in one command — and zero-key playable right now at **`vaibhav4046.github.io/onq-even-g2/demo/`**:
> - **530 passing tests** across **55 files**, **32/32** harness evals, **17 real EvenHub Simulator 0.9.5 captures**, **11/11** geometry gate (`97.2%–97.8%` black optical field), **10/10** security audit (`0` vulns), and packaged **`onq.ehpk`** (`60.3 KB`).
> - Physical G2 hardware isn't on my desk yet, so we disclose *Sim-Verified* honestly everywhere and route all TTS audio cleanly to paired earbuds.
> - **Business:** Free BYO-PC local tier (`$0` LLM cost), **$7/mo Pro** for managed HTTPS relay + AssemblyAI voice, **$19/seat Team**."

---

## 1:50 – 2:00 · Close
> "Ninety seconds between meetings. Glance, one phrase, Default-NO, 2-second undo ring, done. That is **OnQ** — thank you!"

---

## Rapid-Fire Judge Q&A Prep

| Likely Judge Question | Crisp 15-Second Answer |
| :--- | :--- |
| **"Did you test on physical Even G2 glasses?"** | "Not yet — we tested strictly on `@evenrealities/evenhub-simulator@0.9.5` (17 PNGs, 0 errors), our 11-check `576×288` Chromium geometry gate, and packaged `dist/onq.ehpk` with all G2 limits enforced (no camera, no speaker, proto3 `CLICK_EVENT` normalization, `<= 42×7` text, `<= 999` UTF-8 bytes)." |
| **"What happens if an LLM hallucinates an email address or double-books?"** | "Two deterministic code gates block it before sending: `Code-Guard` pins recipients strictly from workspace thread metadata (client `to` overrides return HTTP 400), and Calendar conflicts trigger HTTP `409` in `31 ms` with `0` LLM calls." |
| **"How does Google sign-in work inside EvenHub WebView?"** | "Google blocks `disallowed_useragent` in embedded WebViews, so auth happens on the companion host via OAuth 2.0 + `S256` PKCE, stored AES-256-GCM (`0600`) in `~/.onq/vault.enc` outside the repo, while glasses pair via short-lived Bearer code." |
| **"Why do you stand out vs `TeleGifts G2`, `Cue`, or `TriageG2`?"** | "OnQ unifies all 4 Track 04 pillars + watched-chat Telegram behind 4-layer write safety (`RMS -> Default-NO -> 2s ring -> 31 ms 409 lock + 30s undo + HTTP 423 Kill Switch`), local `$0` Ollama hosting, 13 `76×76` 4-bit real-app sprites, and `530` verified tests." |
| **"How do I try it right now without API keys?"** | "Open `vaibhav4046.github.io/onq-even-g2/demo/` — every button (`Cal + Mail`, `Notion`, `Telegram`, `PC AI`, `Morning Brief`, `Coding PR Gate`, `Kill Switch`, `Test Conflict Lock`) runs stateful in your browser with zero keys." |
