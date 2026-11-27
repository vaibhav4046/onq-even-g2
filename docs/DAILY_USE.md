# Using OnQ in a normal day

Plain version. What works today, what does not, and how to set it up.

## What works today (no glasses needed)

OnQ runs on your own computer. You talk to it from **Telegram** (on your phone) and the **web app** (on your computer). Both use the same safety rules: nothing sends or changes until you approve it.

The glasses part is built and passes the simulator checks. It has **not been worn on real G2 glasses yet**, so do not count on it for anything important.

## One-time setup (about 10 minutes)

1. Start it: `npm ci`, then `npm run dev`. Open http://127.0.0.1:5173.
2. Open **Connect** (the `#connectors` section). The top card is **This computer**. It shows which AI tools OnQ found here. Press **Scan this computer** to check again.
   - **Connect your phone or glasses** in **Connect glasses**. 1. Turn on remote (optional). 2. Scan the code. The code is inside the link, so you type nothing. It works once and ends after 5 minutes. No accounts on the glasses. Same Wi-Fi: press **Allow my Wi-Fi** once and restart OnQ. OnQ never opens your PC to the internet by default.
   - **Pick how each source is reached.** Calendar, Mail, Notion and Telegram each have **Auto | This computer | API**. **This computer** needs no keys and uses the Chrome you are signed in to. It is slower and asks you to approve risky steps. **API** is faster but needs a key or sign-in. If you pick nothing, **Auto** chooses.
   - The keys below are optional. They make things faster:
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
| Running late | Send `/task Push my 14:00 by 15 minutes and tell Investor` | An approval card appears with Approve and Reject. Tap Approve and Calendar and Gmail update. The card turns into a receipt |
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
- **Remote glasses access requires an HTTPS tunnel.** By default the local relay runs on `localhost`; to reach it away from home, start the optional Cloudflare tunnel (`npm run tunnel` or **Start my tunnel** under **Remote access for your own glasses** below). Note: physical Even G2 glasses have not been tested yet.
- Writes to Google and Notion are real once connected. Start with a test calendar and a test Notion database.
- If you also set a webhook on the same bot, polling stops. OnQ shows "Webhook active on Telegram bot" and waits 5 minutes before retrying.
- The old video and docs say "simulator verified". That is the honest status.

## Good first week

1. Day 1: connect Google and Telegram, send `/calendar` for a few days.
2. Day 2 to 3: use `/task` to move one real meeting and check the receipt.
3. Day 4 to 5: try Meeting Scribe in one low-stakes meeting.
4. Day 6 to 7: add Notion and run the morning crew.

## Remote access for your own glasses

Use your glasses away from home, with your own computer. You start it. It never starts by itself.

1. Open **Connect glasses**. Step 1 (optional): tick the box and press **Start my tunnel**. You need cloudflared installed (`winget install Cloudflare.cloudflared`).
2. Step 2: scan the QR. Even G2: open Even Hub and scan it. Any other glasses or phone: open the link. Telegram also works on any glasses that run it.

Safety:
- Only the sign-in door is public. Everything else needs a device token you gave out with a one-use code.
- The code in the link works once and ends after 5 minutes.
- **Stop tunnel** ends the address. The kill switch locks every paired device. **Revoke** removes one.

Limits:
- Untested on physical glasses. Tested in the simulator. It is not verified that the Even app accepts a tunnel address. The screen tells you which step failed.
- A quick-tunnel address changes each time you turn remote on. Scan the new QR. A packaged `.ehpk` needs a new build. For a stable address use a named Cloudflare tunnel or Tailscale.
- Your computer must be on, with OnQ running.
