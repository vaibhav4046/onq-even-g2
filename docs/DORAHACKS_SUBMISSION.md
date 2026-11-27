# DoraHacks submission text (ready to paste)

**Project name:** OnQ

**Track:** Primary: **04 · AI Assistants & Work** (also tagging **01 · Messaging & News** for genuine two-way Telegram Bot bridge, plus Special Prize: **Best Telegram Integration**).

**One-liner (under 120 characters):**
Own the 90 seconds between meetings on Even G2: glance, one phrase or tap, AI draft ready, confirm, done with undo.

**Problem:**
Between back-to-back meetings you have about 90 seconds. Checking Calendar, Gmail, Notion and Telegram on a phone while walking means missed asks and rushed replies.

**Who it is for:**
People who live in Google Calendar, Gmail, Notion and Telegram and move between meetings all day.

**How it works:**
1. Glance: the G2 lens shows one thing: your next meeting and the one message that needs you (Gmail, or a Telegram chat you picked).
2. Act: say one short phrase ("push 15 and tell Investor") or tap the R1 ring. The reply or change is already drafted by AI or a smart default.
3. Confirm: the lens defaults to NO. Tap yes, a 2-second undo ring runs, then Calendar, Gmail, Notion or Telegram update, with a receipt and a 30-second undo.
4. Safe by default: a double-booking lock blocks taken slots (`31 ms`, zero LLM calls) and offers the next free time. Nothing is sent without your yes.

**Telegram (Best Telegram Integration):**
- Reads new messages only from the chats you pick; ignores everything else.
- One tap gets an AI-drafted reply, staged as NO until you approve it on the glasses, the web app, or Telegram's inline `[Approve Once]` / `[Reject]` / `[Kill Switch (Pause All)]` buttons.
- Only your paired chat can control OnQ (`/myid` pairs it in one paste); full slash-command parity (`/apps`, `/inference`, `/use`, `/run`, `/inbox`, `/calendar`, `/task`, `/status`, `/pause`, `/resume`); the bot stays silent in groups.

**Built with:** Even Hub SDK 0.0.16, Computer-as-AI-Power-Source (`Ollama qwen3:1.7b` local `$0` hosting + optional `Claude` / `ChatGPT` / `OpenRouter` APIs + `Rules` fallback + `npm run tunnel` remote HTTPS bridge), Google Workspace (Calendar, Gmail, Drive), Notion (`2026-03-11`), Telegram Bot API, AssemblyAI voice (`STT-3.7` and `TTS-1` to earbuds; G2 has no speaker), durable `~/.onq/vault.enc` AES-256-GCM (`0600`) storage.

**What existed before Nov 23:** nothing. The repository's first commit is 2026-11-24; everything was built in the hackathon window on open-source libraries listed in the README.

**Verified (2026-11-27 full gate + reboot durability + clean-room clone):** `530` automated tests across `55` files, `32/32` eval intents with `5/5` prompt-injection blocks, `11/11` display geometry checks (`97.2%–97.8%` dark pixels, `<= 266` UTF-8 bytes), `17` real captures in the official Even Hub simulator `0.9.5` (`sim-01..17.png` with `76×76` 4-bit Gray4 real-app logos & native `MenuContainerProperty` goodies, `0` console errors), `10/10` security checks (`169` source files, `0` prod vulnerabilities), `dist/onq.ehpk` (`60,341` bytes), flagship launch film `media/out/onq-film-v5-day-in-life.mp4` (`2:45`, `1080p @ 30fps`, `-16.0 LUFS`), live Ollama `qwen3:1.7b` (`1.76 s` wrap-up, `31 ms` zero-LLM 409 lock), live Telegram `@onq_g2_copilot_bot` (`36 ms`), live AssemblyAI (`720 ms`), `0` `modern-web-guidance` legacy findings across `41` files, reboot-durable `~/.onq/vault.enc`, and zero-env clean-room `git clone` build. **Not yet tested on physical G2 glasses or R1 ring.**

**Business:** Free BYO-PC local tier (`$0.0000` marginal LLM cost on hosted Ollama/local AI), Pro `$7/month` (managed HTTPS remote relay, AssemblyAI voice, multi-workspace sync), Team `$19/seat`. Deterministic `31 ms` 409 locks run before any LLM call; tokens stay encrypted in `~/.onq/vault.enc`; nothing sends without approval.

**Links:**
- **GitHub:** https://github.com/vaibhav4046/onq-even-g2
- **Live Interactive G2 Studio (Zero Setup):** https://vaibhav4046.github.io/onq-even-g2/demo/
- **Landing Page & Privacy Policy:** https://vaibhav4046.github.io/onq-even-g2/
- **Direct `.ehpk` Download (`v1.0.0`):** https://github.com/vaibhav4046/onq-even-g2/releases/download/v1.0.0/onq.ehpk
- **Demo Video (2:45, under 3-min cap):** https://github.com/vaibhav4046/onq-even-g2/releases/download/v1.0.0/onq-film-v5-day-in-life.mp4 *(Tip: also upload this MP4 as Unlisted YouTube if you want DoraHacks inline player embed)*

**Feature Requests (Optional DoraHacks Field — 5 concrete SDK requests from `API_FEEDBACK.md`):**
1. **Normalize Proto3 Zero-Value Enum Defaults (`@evenrealities/even_hub_sdk`):** Plain temple taps (`CLICK_EVENT = 0`) and first-row `ListContainer` selections (`index = 0`) omit fields in proto3 JSON; normalize inside `evenHubEventFromJson()`.
2. **Permissioned 1-Line Ambient Heads-Up Slot:** Allow rate-limited background 1-line alerts (`pushAmbientBanner({ text, ttlSec })`) when urgent corridor conflicts occur while switched away from the foreground WebView.
3. **Text Measurement & Overflow Metrics on `textContainerUpgrade`:** Return `{ ok, truncated, renderedLines, utf8Bytes }` or expose the LVGL font width table so apps don't need external Chromium geometry gates.
4. **Audio Injection Endpoint on `evenhub-simulator --automation-port`:** Add `POST /api/audio` (16 kHz mono PCM16 WAV -> 100 ms `audioEvent` chunks) so CI can exercise the full `long_press -> audioEvent -> RMS -> STT` pipeline headlessly.
5. **Scoped System-Browser OAuth PKCE Helper:** Provide `bridge.startOAuthPkce({ authUrl, callbackScheme })` to bypass Google's `disallowed_useragent` block in WebViews without custom phone pairing pages or client secrets inside `.ehpk`.
