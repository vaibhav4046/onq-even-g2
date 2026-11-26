# Overnight summary (2026-11-25 to 26)

Deadline: **2026-11-29 19:59 UTC** (Dubai 23:59). Nothing was pushed, published or submitted. 10 local commits are waiting for you (9 listed below plus this summary).

## What changed (local commits, newest first)
- `99360ac` Landing page rebuilt in the openbot.run style (inspired, not copied): hero is the read-and-write loop (Glance, Say it or tap, Draft ready, Confirm, 2s undo ring, Done) plus Telegram; 5 real video cards; a day story; extras kept off the hero. Film re-rendered. Counts synced. One flaky test fixed.
- `3777036` Film re-ordered to the rubric: write loop on screen by 0:20, Telegram by 0:45, crew scene dropped. Now 1:56.
- `0291547` README and demo script lead with read-and-write and Telegram. Adds "What existed before Nov 23: nothing (first commit 2026-11-24)", a short business paragraph, and real-G2 relay steps. Browser agent and other extras moved into one collapsed "Engineering" block.
- `4ca13ee` Lens cards reworded for a glance: "1 thing needs your yes", "All quiet", "Tap to reply. Nothing sends without yes". Removed the music action from the lens.
- `ac09779` **Telegram bug fixed:** approving a reply never sent it (empty operation). Now it sends, only into your own chat or chats you pick. New AI-drafted reply endpoint. Digest now reads picked chats from the live poller instead of fighting it.
- `1b6ab20`, `599d3c2`, `a8f8263` Browser agent in your own Chrome on this PC, with approvals for risky steps, `/browse`, and a web card. Kept out of the judged story on purpose.
- `845baae` Telegram owner-only gate (a stranger could DM `/calendar` before), `/myid` pairing, slash menu, approval cards that edit in place. Daily-use guide.

## Verified numbers (re-run tonight, all exit 0)
- `npm test`: **268 passed, 30 files** (one flaky WebSocket timing test fixed, then green twice).
- `npm run eval:harness`: 32/32 intents, 5/5 injections blocked, 3/3 409 locks, 5/5 silence rejections.
- `npm run verify:geometry`: 11/11 plus desktop and mobile UI checks, 0 console errors.
- `npm run verify:sim`: 13 real Even Hub Simulator 0.9.5 captures, 0 errors (re-captured with the new lens wording).
- `npm run verify:security`: 10/10 PASS, 0 secrets in 119 files and the `.ehpk`, 0 vulnerabilities.
- `npm run pack`: `dist/onq.ehpk` 51,344 bytes (51,351 in a fresh clone; build stamp differs).
- Web entry bundle: 252 kB raw / 64 kB gzip.
- Live browser check (`scripts/brutal-live-check.mjs`) on the new page: 409 lock shown, 0 console errors, 0 page errors, no overflow at 1280 and 1024.
- **Clean room:** fresh clone of `99360ac`, no `.env`, no keys: `npm ci`, `npm test`, `npm run eval:harness`, `npm run build`, `npm run pack` all exit 0.
- Browser agent live smoke: real Chrome, planned by "Claude Code CLI (your subscription)", answered a Wikipedia question correctly.

## Not verified
- **Physical G2 glasses: never tested.** The real-glasses relay steps in the README are written but untested.
- **Live accounts:** tonight's probes ran in the demo sandbox: Google, Notion and Telegram SANDBOX; Claude, ChatGPT and OpenRouter fell back to Rules. Only AssemblyAI was live. The new Telegram send path is proven with tests and a mock, not with your real bot.
- The landing page's "Watch it work" clip is a real recording of the older layout.
- `media/out/onq-launch-demo.mp4` (technical walkthrough) is from before tonight's changes and shows a few loading frames. Use the anime film or record a fresh simulator demo.

## "15 failed background tasks"
I found no 15 failed OnQ tasks. The two scheduled tasks on this PC belong to the job-application project (left alone, as instructed). This session had 3 failed demo-recorder runs: 2 were slow first-load waits (fixed with longer waits), 1 was a click timeout under heavy CPU load (not reproduced on a quiet machine). If you meant a different list, tell me where it is.

## Decisions for you
1. **Push** the 10 local commits (`git push origin master`)?
2. **Connect real accounts** before recording: Google, Notion, Telegram bot (send `/myid`, add one chat to the watch list), and one model key (or keep Claude Code CLI). Otherwise the video shows sandbox and Rules.
3. **Which video to submit:** the 1:56 pixel-anime film (real simulator captures, rubric order) or a fresh live simulator recording following `docs/DEMO_SCRIPT.md`. The rubric says the demo must run in the simulator or on G2; a live recording is the safest reading.
4. Keep the browser agent hidden in "Engineering" (recommended by the plan), or show it?

## Nov 26 to 29 plan
- **Nov 26:** connect real accounts; re-run `node scripts/brutal-live-check.mjs` with them and keep the output; push.
- **Nov 27:** record the 2-minute simulator demo from `docs/DEMO_SCRIPT.md` (read-and-write in the first 30 seconds, Telegram by 1:00); refresh the "Watch it work" clip from it.
- **Nov 28:** final full gate and clean clone; make every number in README, description and video match; fill the DoraHacks form as a draft.
- **Nov 29 before 19:59 UTC:** submit (you click). Leave a buffer of several hours.

## Final submission checklist
- [ ] Public GitHub repo pushed, README explains setup and says what existed before Nov 23
- [ ] Demo video under 3 minutes, in the simulator or on G2, read-and-write in the first 30 seconds
- [ ] Short description: problem, who it is for, how it works, track (04 + Best Telegram)
- [ ] `API_FEEDBACK.md` (5 requests) and `dist/onq.ehpk` attached
- [ ] No keys or secrets in the repo (security scan passes)
- [ ] Numbers in README, description and video match the last gate run
- [ ] Physical-glasses status stated plainly ("verified in the simulator")
