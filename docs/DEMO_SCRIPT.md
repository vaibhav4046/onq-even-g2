# OnQ 2-minute demo script

**The one idea to land:** OnQ is an agent that does real work on your own computer, and you steer it from your glasses with one glance and one tap. It never acts on the world without your yes.

Setup before you start: `npm run dev` running, web app open at http://127.0.0.1:5173, Even Hub simulator running (`node node_modules/@evenrealities/evenhub-simulator/bin/index.js http://localhost:5174 --automation-port 9898 --no-glow`), Telegram bot paired (`/myid`), and one AI route working (OpenRouter key, or the Claude Code CLI signed in). Do one dry run first so the first-load sync is warm.

| Time | Show | Say (plain, short) |
| :--- | :--- | :--- |
| 0:00 to 0:15 | Hero: 3D glasses, then the lens | "Between meetings you have 90 seconds. OnQ puts what matters on your glasses and does the work on your own laptop." |
| 0:15 to 0:40 | Tour step 1: Confirm and undo. Lens shows the change, defaults to No, 2-second ring, receipt | "I say: push my 2 pm by 15 minutes and tell Priya. Nothing happens until I say yes. Two-second ring, then Calendar and Gmail update, with a receipt and undo." |
| 0:40 to 0:55 | Tour step 2: Double-booking lock (409) | "If the slot is taken, OnQ blocks it and offers the next free time. Zero writes." |
| 0:55 to 1:30 | Telegram on phone: `/browse find the cheapest return flight London to Dubai next Friday`. Cut to the OnQ Chrome window working, then the approval card | "Now the agent part. OnQ drives its own Chrome window on my laptop, with my network and my logins. It reads and searches by itself. The moment it wants to book, it stops and asks me, here in Telegram, on the web, or on the glasses." Tap Reject. "I said no, so nothing was booked." |
| 1:30 to 1:45 | Personal OS: Run Morning crew, then Kill switch | "A crew of agents checks my calendar, mail and repo every morning. One switch stops everything." |
| 1:45 to 2:00 | Proof strip, then the anime film's last frame | "Built on Even Hub SDK, checked in the official simulator: 265 tests, 32 of 32 eval intents, 10 of 10 security checks. Physical glasses testing is next." |

## Lines to avoid
- Do not say "tested on glasses". Say "verified in the simulator".
- Do not say "powered by frontier models" unless the badge shows Claude, ChatGPT or OpenRouter. If it shows Rules, say "fixed rules first, models when available".
- Do not approve a real purchase on stage. Use Reject, or a test site.

## If something breaks live
- First-load sync is slow on a cold machine: open the page once before the demo.
- No model reachable: the browser agent stops and says so. Switch to the Claude Code CLI route or skip to the crew.
- Telegram silent: check `/myid` matches the owner chat in Connect, and that no webhook is set on the bot.
