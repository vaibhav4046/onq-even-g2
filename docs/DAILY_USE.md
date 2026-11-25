# Using OnQ in a normal day

Plain version. What works today, what does not, and how to set it up.

## What works today (no glasses needed)

OnQ runs on your own computer. You talk to it from **Telegram** (on your phone) and the **web app** (on your computer). Both use the same safety rules: nothing sends or changes until you approve it.

The glasses part is built and passes the simulator checks. It has **not been worn on real G2 glasses yet**, so do not count on it for anything important.

## One-time setup (about 10 minutes)

1. Start it: `npm ci`, then `npm run dev`. Open http://127.0.0.1:5173.
2. Open **Connect** (the `#connectors` section) and connect what you use:
   - **Google** (Calendar, Gmail, Drive). Try it first on a test calendar. Once connected, approved changes are real.
   - **Notion**: paste an integration token and a database ID.
   - **Claude, ChatGPT or OpenRouter**: one key is enough. Without any key OnQ still works, using fixed rules instead of a model.
   - **AssemblyAI**: needed for voice and the meeting scribe.
3. Telegram:
   - In Telegram, message @BotFather, run `/newbot`, copy the token.
   - Paste the token into OnQ under Telegram.
   - Open your new bot and send `/myid`. It replies with a number. Paste that number as your owner chat.
   - From then on only that chat can control OnQ. Anyone else gets "This bot is private." and nothing else.
4. Tap the **/** menu in your bot chat. OnQ fills it in for you.

## A normal day

| When | What you do | What happens |
| :--- | :--- | :--- |
| Morning | Send `/status`, `/calendar`, `/inbox` | Short brief of meetings and mail that needs you |
| Running late | Send `/task Push my 14:00 by 15 minutes and tell Priya` | An approval card appears with Approve and Reject. Tap Approve and Calendar and Gmail update. The card turns into a receipt |
| Slot is taken | Same message | OnQ blocks the double booking and offers the next free time. Nothing is written |
| In a meeting | Web app, Meeting Scribe, Start | Notes are kept in memory only. Say "OnQ, ..." to ask a question. Wrap Up stages Notion tasks, a calendar hold and an email draft for approval |
| Evening | Web app, Personal OS, Run Morning crew | Specialist agents check Calendar, mail and your repo. An auditor signs off |
| Any errand on the web | Send `/browse find the cheapest flight to Dubai on Friday` | OnQ works in its own Chrome window on your PC and reports back. Before it buys, sends or submits anything you get an approval card |
| Anytime | Send `/pause` | Kill switch: stops all scheduled work. `/resume` starts it again |

Web changes have a 30 second undo. The 2-second ring is for the glasses and the web preview.

## Browser agent setup

The first time, OnQ opens a separate Chrome window with its own profile. Sign in to the sites you want it to use, once, in that window. It needs one AI model: an OpenRouter, Claude or ChatGPT key in Connect, or the Claude Code or Codex CLI signed in on this PC (your existing subscription).

## Limits you should know

- **Your computer must be on** and OnQ running. Telegram only works while it runs.
- **Glasses cannot reach your computer yet.** The glasses app only allows `localhost`. To use real G2 glasses you need a phone-hosted or HTTPS relay first. Do not rely on this until it is tested.
- Writes to Google and Notion are real once connected. Start with a test calendar and a test Notion database.
- If you also set a webhook on the same bot, polling stops. OnQ shows "Webhook active on Telegram bot" and waits 5 minutes before retrying.
- The old video and docs say "simulator verified". That is the honest status.

## Good first week

1. Day 1: connect Google and Telegram, send `/calendar` for a few days.
2. Day 2 to 3: use `/task` to move one real meeting and check the receipt.
3. Day 4 to 5: try Meeting Scribe in one low-stakes meeting.
4. Day 6 to 7: add Notion and run the morning crew.
