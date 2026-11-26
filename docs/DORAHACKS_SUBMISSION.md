# DoraHacks submission text (ready to paste)

**Project name:** OnQ

**Track:** 04 AI Assistants & Work. Also entering: Best Telegram Integration.

**One-liner (under 120 characters):**
Own the 90 seconds between meetings on Even G2: glance, one phrase or tap, AI draft ready, confirm, done with undo.

**Problem:**
Between back-to-back meetings you have about 90 seconds. Checking Calendar, Gmail, Notion and Telegram on a phone while walking means missed asks and rushed replies.

**Who it is for:**
People who live in Google Calendar, Gmail, Notion and Telegram and move between meetings all day.

**How it works:**
1. Glance: the G2 lens shows one thing: your next meeting and the one message that needs you (Gmail, or a Telegram chat you picked).
2. Act: say one short phrase ("push 15 and tell Priya") or tap the R1 ring. The reply or change is already drafted by AI or a smart default.
3. Confirm: the lens defaults to NO. Tap yes, a 2-second undo ring runs, then Calendar, Gmail, Notion or Telegram update, with a receipt and a 30-second undo.
4. Safe by default: a double-booking lock blocks taken slots and offers the next free time. Nothing is sent without your yes.

**Telegram (Best Telegram Integration):**
- Reads new messages only from the chats you pick; ignores everything else.
- One tap gets an AI-drafted reply, staged as NO until you approve it on the glasses, the web app or Telegram's inline buttons.
- Only your paired chat can control OnQ (`/myid` pairs it in one paste); the bot stays silent in groups.

**Built with:** Even Hub SDK 0.0.16, Google Workspace (Calendar, Gmail, Drive), Notion, Telegram Bot API, Claude / ChatGPT / OpenRouter with a fixed-rules fallback, AssemblyAI voice (STT and TTS to earbuds; G2 has no speaker).

**What existed before Nov 23:** nothing. The repository's first commit is 2026-11-24; everything was built in the hackathon window on open-source libraries listed in the README.

**Verified (re-run before submitting):** 280 automated tests, 32/32 eval intents with 5/5 prompt-injection blocks, 11/11 display geometry checks, 13 captures in the official Even Hub simulator 0.9.5, 10/10 security checks, clean clone with zero keys. Not yet tested on physical G2 glasses.

**Business:** Pro $7/month, Team $19/seat. Most steps run on fixed rules, so model cost per brief stays low (estimate). Tokens stay encrypted on the user's computer; nothing sends without approval.

**Links:**
- GitHub: https://github.com/vaibhav4046/onq-even-g2
- Demo video (under 3 minutes): ADD LINK AFTER UPLOAD
- Package: `dist/onq.ehpk` in the repo build (`npm run pack`)
- API feedback: `API_FEEDBACK.md`

**Before you paste:** re-check the numbers above against the last `npm test` / gate run, and replace the video link.
