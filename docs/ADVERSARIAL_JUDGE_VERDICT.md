# OnQ: Adversarial Judge Verdict (final pass, 2026-11-25)

This is a self-review written to be harsh. It scores OnQ the way four skeptical judges would: an Even Realities SDK lead, a VC partner, a technical judge, and an automated rubric reader. Nothing here predicts a real vote. Competitor facts come from `docs/COMPETITIVE_ANALYSIS.md` (the 24 Nov audit notes) and were not re-audited today.

## The two questions

**Will this place 1st in Track 04 and contend for the grand prize?**
It is a credible contender. It is not a safe pick. It is the only entry in the audit that closes the loop across Calendar, Gmail, Notion and Telegram with one safety model (confirm first, 2-second undo ring, double-booking lock). It is also the broadest entry, and broad entries get judged on their weakest claim.

**What is the single biggest reason a harsh judge ranks TapBack, PinGuard, Aside or WickSight above it?**
Nobody has worn it. Every display claim is verified in the simulator 0.9.5 and the Chromium geometry gate, not on physical G2 glasses. A narrower entry that shows one flow working end to end on a live account (TapBack's recorded Telegram reply, PinGuard's 409 lock) looks more finished than a wide entry whose best claims were last confirmed live in an earlier session. In today's run Google, Notion and Telegram probed as SANDBOX and the AI providers fell back to the deterministic Rules router. That is honest, and a judge who sees it may discount the "live" story.

## Scores (official rubric weights)

| Criterion | Weight | Score | Evidence | What a harsh judge says |
| :--- | ---: | ---: | :--- | :--- |
| Usefulness on G2 | 30% | 8.0 | 90-second corridor brief, voice shift, meeting scribe, all behind confirm. The default workspace now shows only Track 04 actions. | Never tested on glasses. The Personal OS panel (10 agents, autonomy levels) is more than a corridor needs. |
| Read and Write | 25% | 8.5 | 280 tests cover Default-NO, ring, 409 conflict, stale-thread lock, idempotent commit, undo. Sim captures show each state. | Real writes to the owner's Google and Notion were not re-run today. |
| Technical execution | 20% | 8.5 | 280/280 tests, 31 files. Eval 32/32 with 5/5 injections blocked. Security 10/10, 0 vulnerabilities. Web entry bundle 262 kB (was 1,756 kB). | A Windows-only bug (`spawn EINVAL` on `.cmd` shims) sat in the repo until today's test run caught it. Environment fragility is a fair worry. |
| UX for display and voice | 15% | 8.0 | 7 lines by 42 columns, 97.2% to 97.9% dark pixels. Period glyph bug fixed. Four workspaces instead of eight tabs. AssemblyAI STT and TTS live (660 ms probe). | Studio panels are still dense. Voice was probed, not demonstrated on glasses. |
| Business and safety | 10% | 6.5 | Safety is strong. $7 per month Pro and about $0.001 per brief are modeled, not measured. | No customers, no pricing test, no measured unit cost. |
| Best Telegram | bonus | 8.5 | Inline Approve/Reject synced with the glasses card and the web inbox, owner-DM privacy guard, and a clear message plus 5-minute backoff when a webhook blocks polling (HTTP 409). | Live polling was verified in an earlier session, not re-run today. |

Weighted total: **8.1 / 10.**

## Why some buckets stay under 9.0

The brief asked for every controllable bucket to reach 9.0. These stay below it because the missing piece is not code:

- Usefulness and UX need physical G2 plus R1 ring testing. That needs the hardware.
- Business needs real users or a measured per-brief cost. Neither exists yet.
- Live-account proof for Google, Notion and Telegram needs the owner's connected session. Run `node scripts/brutal-live-check.mjs` with those accounts connected and keep the output.

## Defects found and fixed in this pass

| Defect | Severity | Fix | Proof |
| :--- | :--- | :--- | :--- |
| sim-13 showed 1 of 4 crew lines | P0 | One multi-line text block, formatter keeps line breaks | `docs/screenshots/sim-13-os-pipeline-live.png`, new liveUi test |
| Pixel font drew "." as a plus-shaped mark | P0 | Period routed to a bold system sans; scramble animation no longer uses "+" | Screenshot of hero and big numbers |
| Music mood `coding` returned off-mood pop | P1 | Bare mood word now uses the tuned query | Live call returned lofi tracks; 2 new tests |
| Default workspace led with off-track actions (YouTube scout, BTC bot, Python bot) | P1 | Filtered out of Glasses Live, and the five off-track studio panels were removed | Studio screenshot |
| `npm test` failed on Windows (`spawn EINVAL`) | P1 | Skip `.cmd` shims, fall back to the built-in planner with a note | Test passes |
| Telegram 409 gave a bare HTTP error | P2 | Clear webhook message and 5-minute backoff | 2 new tests |
| 8-tab studio | P1 | 3 workspaces with real tab roles | Live check: 0 console errors, 0 overflow |
| 1.7 MB entry bundle | P2 | Lazy 3D chunk, vendor chunks | Build output |
| Test counts disagreed across pages (189, 213, 220, 246) | P2 | One constant, `apps/web/src/verifiedCounts.ts` | Page shows 280 |

## Still open

1. Physical G2 and R1 ring test (needs the hardware).
2. Re-run live Google, Notion and Telegram probes with the owner's connected session and attach the output.
3. The AI chain fell back to Rules in today's probe. Do not say "powered by frontier models" in a demo unless the badge shows Claude, ChatGPT or OpenRouter. Saying "deterministic rules first, models second" is accurate.
4. Measure the per-brief cost before quoting a number in the pitch.
5. The Personal OS panel still shows dense autonomy-level text. Keep it out of the 3-minute demo.
6. The pixel-anime film (`media/out/onq-anime-film.mp4`, 1:56) uses only real simulator captures and one real screen recording, and says the glasses are not yet tested. Do not describe it as footage from physical glasses.
