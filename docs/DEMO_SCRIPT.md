# OnQ 2-minute demo script (simulator)

**The one idea to land:** between meetings, OnQ shows one thing on your glasses and lets you act on it in seconds, safely. Judges score read-and-write first, so it opens the video.

Setup: `npm run dev`, then the Even Hub simulator (`node node_modules/@evenrealities/evenhub-simulator/bin/index.js http://localhost:5174 --automation-port 9898 --no-glow`). Web app at http://127.0.0.1:5173 with "SDK Live" showing the simulator. Telegram bot paired (`/myid`) and one chat added to the watch list. One AI route working if you want "AI draft" rather than the smart default. Do one dry run first so the first load is warm.

| Time | Show (simulator first) | Say (short) |
| :--- | :--- | :--- |
| 0:00 to 0:08 | Lens: next meeting card | "Ninety seconds between meetings. One glance." |
| 0:08 to 0:30 | Say "push 15 and tell Investor". Lens shows the change, cursor on NO. Tap ring: YES. 2-second ring. Receipt. Put a small on-screen timer in the edit | "One phrase. The reply is already drafted. It waits on NO. One tap, two-second undo ring, done: calendar moved, Investor told, receipt saved." |
| 0:30 to 0:42 | Try the busy 14:45 slot: double-booking lock, next free time | "If the slot is taken it refuses, and suggests the next free time. Nothing written." |
| 0:42 to 1:10 | A message lands in a watched Telegram chat. Lens card 2 shows it. Tap: AI-drafted reply, NO by default. YES. Phone shows the reply in the chat | "Telegram, only from chats I picked. One tap for an AI-drafted reply. Approve on the glasses. Sent." |
| 1:10 to 1:30 | Meeting Scribe: speaker notes, "OnQ, wrap up": Notion tasks, calendar hold, email draft, all waiting for yes | "In the meeting it keeps notes in memory only. Wrap up stages tasks and drafts; I approve what goes out." |
| 1:30 to 1:45 | Lens card 4: "1 thing needs your yes", approve from Telegram inline button | "Anything waiting shows up once, on the glasses, the web or Telegram." |
| 1:45 to 2:00 | Proof strip | "Built on the Even Hub SDK, checked in the official simulator, with every number re-run before submitting. Not yet tested on physical glasses." |

## Keep out of the video
- Browser agent, crews, kill switch, music, market research: real, but not in the rubric. Mention only if asked in Q&A.

## Lines to avoid
- "Tested on glasses." Say "verified in the simulator".
- "Powered by AI" while the badge says Rules. Either connect a model before recording, or say "smart defaults first, AI drafts when a model is connected".
- Do not approve a real purchase or message a real person you did not warn.

## If something breaks live
- Slow first load: open the page once before you start.
- Telegram silent: check `/myid` matches the owner chat in Connect, the chat is on the watch list, and no webhook is set on the bot.
- No model reachable: the smart default reply is used and labelled; carry on.
