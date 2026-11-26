# OnQ unified harness

OnQ is one harness. The computer is the host. The glasses are a client.

The glasses show a card, hear your voice and send a tap. Everything else runs on the computer: models, tools, memory, safety checks and the connections to other apps. Nothing important lives on the glasses.

This page says what is built, what is measured and what is not built yet. Every "built" line points at code in this repo.

## Who does what

| Part | Where it runs | What it does |
| :--- | :--- | :--- |
| Host | Your computer (`apps/server`, port 8787) | Holds the models, the tools, the vault, the safety rules and the metrics. |
| Glasses | G2 plus R1 ring (`apps/glasses`) | Display, tap, voice capture. No keys, no accounts. |
| Web studio | Browser on the computer (`apps/web`) | Setup, proof and the live simulator mirror. |
| Telegram | Phone | Same approvals, from anywhere. Owner chat only. |

## The agent step loop

Every request goes round the same loop. The harness builds the prompt, the model reads it all at once, then writes its answer one piece at a time. When the answer asks for a tool, the harness runs the tool while the model waits.

1. **Build.** The host assembles instructions, tools, memory and history into one prompt.
2. **Prefill.** The model reads the whole prompt in one parallel pass. This is the first delay you feel (time to first token).
3. **Decode.** The model writes tokens one at a time. This sets the speed you read at.
4. **Tool.** If the answer is a tool call, the host runs it on the CPU or over the network. Calendar, Notion, Telegram and the browser agent all work this way.
5. **Repeat** until the model answers in plain text. Writes stop at the confirm card first.

Sub-agents are extra requests started in parallel. The Personal OS crews (`unifiedOsHarness.ts`) use this today.

## What the host measures

`GET /api/harness/metrics` (needs a signed-in session) returns the last 200 steps and totals per run. Each step records provider, model, kind (llm, tool or subagent), total time, tokens, cost and how many calls were in flight.

| Metric | Status |
| :--- | :--- |
| Total time per step, p50 and p95 | Measured |
| Time to first token | Measured for local CLI calls only. Remote calls report null. |
| Tokens per task | Real when the provider reports usage. Otherwise characters divided by 4, flagged `estimated`. |
| Cost per run | From a small price table. Local CLI subscriptions count as zero marginal cost. Models missing from the table are counted, not guessed. |
| Calls in flight (queue depth) | Measured |
| Cache hit rate | Only when the provider reports it. Otherwise null. |
| KV cache use and batch size | Always null. OnQ does not run the model server, so it cannot see them. |

If you run a model server that exposes these numbers, add them to the ledger. Until then OnQ reports nothing for them.

## Model routing

`modelRouter.ts` tries, in order: Claude, OpenRouter, ChatGPT, then local CLIs and servers, then the deterministic rules. A provider only shows as connected after a real test call answers. The Connect page scans this computer for installed CLIs and local servers and lets you pick one.

OpenRouter is the load balancer. One key reaches many models. A failure puts that provider on a short cooldown and the next one answers.

## Computer first, no sign-in

Each source (calendar, mail, Notion, Telegram) can use either path:

- **This computer.** The browser agent uses the Chrome you are already signed in to. It needs no key. It is slower and can break when a site changes.
- **API or sign-in.** A Notion token, Google OAuth or a Telegram bot token. This is faster and steadier.

Auto uses the API when it is connected and falls back to the computer path. The glasses read a stored copy, so a slow source never freezes a card. The glasses show "queued" while a write runs in the background.

## Safety on every path

- Nothing writes without a yes. The default is No.
- A 2-second undo ring follows every confirm.
- A double-booking attempt returns HTTP 409 and writes nothing.
- A kill switch halts every agent.
- The vault is AES-256-GCM and keeps a backup before each save.

## Remote use

On the same Wi-Fi the glasses reach the computer by its local address. From anywhere else you need a tunnel you choose and start yourself. OnQ never opens your computer to the internet by default.

## Remote access for your own glasses

Two steps: 1. Turn on remote (optional). 2. Scan the code.

- **Tunnel.** In Connect, tick the box and press **Start my tunnel**. OnQ runs `cloudflared tunnel --url http://127.0.0.1:<port>` for you, reads the `https://*.trycloudflare.com` address, and stops it on **Stop tunnel** or when OnQ closes. Only one tunnel runs at a time. Tailscale is guidance only: OnQ shows the steps (`tailscale serve --bg <port>`) and never starts it.
- **One link.** The host serves the glasses app at `/g/`, same origin as the API. The QR holds `<address>/g/?pair=123456`. The page claims the one-use code, stores a device token, and strips the code from the address bar. Works for Even G2 (scan in Even Hub), any browser on glasses or a phone (big buttons and the same 7x42 text), and Telegram (approve there).
- **What stays closed.** Through the tunnel, only the static page, `/api/health` (`{ok:true}`) and `POST /api/pair/claim` need no token. Everything else needs a device token. Owner endpoints (`/api/remote/*`, `/api/pair/code`) answer 403 to a paired device. The kill switch locks all devices.
- **When the app blocks the network.** The client checks the host, blocked versus offline, the pairing, and the live stream, shows the failing step, and backs off 1, 2, 4, 8, then 15 seconds. If the live stream is blocked it long-polls `GET /api/poll?since=<rev>&wait=20`. If both are blocked, approvals still go to your Telegram chat.
- **Limits.** Untested on physical glasses. Tested in the simulator. Whether the Even app accepts the tunnel origin is unverified. A quick-tunnel address changes each time, so scan the new QR; a packaged `.ehpk` needs a repack. For a stable address use a named Cloudflare tunnel or Tailscale.


## Not built yet

- A common tool registry. Tools are named strings today.
- An MCP client. The router runs local CLIs with MCP turned off.
- A generic step loop. Only the browser agent loops today. Other flows are one call.
- Adapters for OpenBot, Hermes and ChatGPT desktop. OpenBot has a command-line tool that could serve as one. ChatGPT desktop has no known local API.
- Real glasses testing. Everything was verified in the Even Hub simulator.

See `docs/OPENBOT_FEATURE_MAP.md` for the full comparison.
