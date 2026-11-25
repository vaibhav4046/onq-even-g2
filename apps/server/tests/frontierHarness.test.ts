import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';
import {
  compressToolOutput,
  defuddleHtmlToText,
  encodeToon,
  TokenSavingsLedger,
} from '../src/harness/tokenOptimizer.js';
import { CitedKnowledgeEngine, isSafePublicHttpUrl } from '../src/harness/ragEngine.js';
import { MarketResearchBotEngine } from '../src/harness/marketBotEngine.js';

const closers: Array<() => Promise<void>> = [];
const cleanupFiles: string[] = [];

afterEach(async () => {
  while (closers.length > 0) {
    const fn = closers.pop();
    if (fn) await fn();
  }
});

afterAll(() => {
  for (const p of cleanupFiles) {
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    } catch {
      // ignore cleanup
    }
  }
});

async function startCleanServer(extra: Parameters<typeof createOnQServer>[0] = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-frontier-'));
  const srv = await createOnQServer({
    port: 0,
    dataDir,
    allowTestFaultControls: true,
    ...extra,
  });
  closers.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return { ...srv, dataDir };
}

describe('Frontier Harness: TOON, Defuddle, RTK, Cited RAG, Grok/OmniRoute, Market Bot & Explainer', () => {
  it('1. TOON encoder + Defuddle + RTK compressor achieve verified size savings', () => {
    const sampleRows = [
      { id: 't1', category: 'MEETING', title: 'VC Sync - Priya Nair', status: 'READY' },
      { id: 't2', category: 'INBOX', title: 'Follow up with Alex', status: 'DRAFT' },
      { id: 't3', category: 'NOTION', title: 'Finalize Q4 metrics', status: 'OPEN' },
      { id: 't4', category: 'TELEGRAM', title: 'Send daily digest', status: 'GATED' },
    ];
    const rawJson = JSON.stringify(sampleRows);
    const toon = encodeToon(sampleRows, 'insights');
    expect(toon).toContain('insights[4]{id,category,title,status}:');
    expect(toon.length).toBeLessThan(rawJson.length);

    const html = `<html><head><title>Even G2 Docs</title><style>.x{}</style></head><body><nav>Home | Docs | Pricing</nav><main><h1>Waveguide 525nm Spec</h1><p>Even G2 renders a 576x288 monochrome corridor.</p></main><footer>Copyright 2026</footer></body></html>`;
    const defuddled = defuddleHtmlToText(html);
    expect(defuddled.title).toBe('Even G2 Docs');
    expect(defuddled.markdown).toContain('Waveguide 525nm Spec');
    expect(defuddled.markdown).not.toContain('Pricing');

    const noisyLog = Array.from({ length: 12 }, () => '  OK polling calendar slot').join('\n') + '\nERR timeout';
    const rtkOut = compressToolOutput(noisyLog, 8);
    expect(rtkOut).toContain('x12');
    expect(rtkOut.length).toBeLessThan(noisyLog.length);

    const ledger = new TokenSavingsLedger();
    const rec = ledger.encodeWithMetrics(sampleRows, 'test');
    expect(rec.rawChars - rec.compressedChars).toBeGreaterThan(0);
    expect(ledger.getSummary().reductionPct).toBeGreaterThan(0);
  });

  it('2. SSRF URL guard blocks private/loopback hosts while Cited RAG retrieves [1] inline sources', async () => {
    expect(isSafePublicHttpUrl('http://127.0.0.1:8787/secret')).toBe(false);
    expect(isSafePublicHttpUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafePublicHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafePublicHttpUrl('https://docs.evenrealities.com/g2-overview')).toBe(true);

    const ledger = new TokenSavingsLedger();
    const engine = new CitedKnowledgeEngine(ledger);
    const res = engine.query('Default-NO safety hold G2 glasses');
    expect(res.citations.length).toBeGreaterThan(0);
    expect(res.answer).toContain('[1]');
    expect(res.lensLines[0].length).toBeLessThanOrEqual(42);
  });

  it('3. Grok & OmniRoute connect, persist in 0600 vault redacted, switch orchestrator, and probe cleanly', async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.x.ai')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ draft: 'Walk from Bldg 4; arrive at 14:15.' }) } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('127.0.0.1:20128')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ draft: 'On my way, arrive 14:15.' }) } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const srv = await startCleanServer({ fetchImpl: fakeFetch });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const gRes = await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider: 'grok', apiKey: 'xai-secret-demo-token-99' }),
    });
    expect(gRes.status).toBe(200);
    const gJson = (await gRes.json()) as { status: { connectors: { grok: { connected: boolean } } } };
    expect(gJson.status.connectors.grok.connected).toBe(true);
    expect(JSON.stringify(gJson)).not.toContain('xai-secret-demo-token-99');

    const oRes = await fetch(`${srv.url}/api/connectors/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: 'omniroute',
        baseUrl: 'http://127.0.0.1:20128/v1',
        model: 'deepseek-r1',
      }),
    });
    expect(oRes.status).toBe(200);

    const probeGrok = await (
      await fetch(`${srv.url}/api/connectors/grok/test`, { method: 'POST', headers })
    ).json() as { ok: boolean; mode: string; providerLabel: string };
    expect(probeGrok.ok).toBe(true);
    expect(probeGrok.providerLabel).toBe('Grok (xAI)');

    const probeOmni = await (
      await fetch(`${srv.url}/api/connectors/omniroute/test`, { method: 'POST', headers })
    ).json() as { ok: boolean; providerLabel: string };
    expect(probeOmni.ok).toBe(true);
    expect(probeOmni.providerLabel).toBe('OmniRoute');
  });

  it('4. RAG ingest-url enforces SSRF guard, Market Bot simulates paper & writes script, Explainer builds 5 scenes', async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('docs.example.org')) {
        return new Response(
          '<html><title>Smart Glass UX</title><body><nav>Skip</nav><article>Glanceable HUD lines never exceed 42 columns on G2.</article></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        );
      }
      if (url.includes('coingecko.com')) {
        return new Response(
          JSON.stringify({
            bitcoin: { usd: 98500, usd_24h_change: 3.4 },
            bittensor: { usd: 620, usd_24h_change: -1.8 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const srv = await startCleanServer({ fetchImpl: fakeFetch });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    // Blocked loopback metadata URL
    const ssrfRes = await fetch(`${srv.url}/api/rag/ingest-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }),
    });
    expect(ssrfRes.status).toBe(400);

    // Allowed public URL ingested via Defuddle
    const okIngest = await fetch(`${srv.url}/api/rag/ingest-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://docs.example.org/g2' }),
    });
    expect(okIngest.status).toBe(200);

    const ragAsk = await (
      await fetch(`${srv.url}/api/rag/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: '42 columns waveguide' }),
      })
    ).json() as { ok: boolean; answer: string; citations: Array<{ ref: string }> };
    expect(ragAsk.ok).toBe(true);
    expect(ragAsk.answer).toContain('[1]');

    const sigRes = await (
      await fetch(`${srv.url}/api/market/signals?symbols=BTC,TAO`, { headers })
    ).json() as { ok: boolean; signals: Array<{ symbol: string; priceUsd: number }>; disclaimer: string };
    expect(sigRes.ok).toBe(true);
    expect(sigRes.disclaimer.toLowerCase()).toContain('paper');
    expect(sigRes.signals[0].priceUsd).toBe(98500);

    const paperRes = await (
      await fetch(`${srv.url}/api/market/paper-trade`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ symbol: 'BTC', notionalUsd: 500 }),
      })
    ).json() as { ok: boolean; result: { symbol: string; mode: string } };
    expect(paperRes.ok).toBe(true);
    expect(paperRes.result.mode).toBe('PAPER_ONLY');

    const botRes = await (
      await fetch(`${srv.url}/api/market/bot-script`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ symbol: 'ZETA' }),
      })
    ).json() as { ok: boolean; scriptPath: string; code: string };
    expect(botRes.ok).toBe(true);
    expect(botRes.code).toContain('ZETA');
    cleanupFiles.push(path.resolve(process.cwd(), botRes.scriptPath));

    const expRes = await (
      await fetch(`${srv.url}/api/explainer/script`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ topic: 'OnQ Matrix Explainer', style: 'hand_drawn' }),
      })
    ).json() as { ok: boolean; style: string; scenes: unknown[]; g2Lines: string[] };
    expect(expRes.ok).toBe(true);
    expect(expRes.style).toBe('hand_drawn');
    expect(expRes.scenes.length).toBeGreaterThanOrEqual(3);
    expect(expRes.g2Lines[0].length).toBeLessThanOrEqual(42);

    const tokRes = await (
      await fetch(`${srv.url}/api/harness/tokens`, { headers })
    ).json() as { ok: boolean; summary: { totalCalls: number; rawChars: number } };
    expect(tokRes.ok).toBe(true);
    expect(tokRes.summary.totalCalls).toBeGreaterThan(0);

    const prefRes = await (
      await fetch(`${srv.url}/api/preferences`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ verbosity: 'caveman' }),
      })
    ).json() as { ok: boolean; taste: { verbosity: string } };
    expect(prefRes.taste.verbosity).toBe('caveman');

    const mktBotDirect = new MarketResearchBotEngine();
    expect(mktBotDirect.buildPythonSignalWatcherCode('TAO')).toContain('TAO');

    // 5. Telegram slash command (/market) + specialist Kanban roleTemplate remain Default-NO gated
    const tgSlash = await (
      await fetch(`${srv.url}/api/telegram/automate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: '/market' }),
      })
    ).json() as { ok: boolean; action: string; generatedText: string; preview: { defaultSelection: string } };
    expect(tgSlash.ok).toBe(true);
    expect(tgSlash.action).toBe('market_alert');
    expect(tgSlash.generatedText).toContain('BTC');
    expect(tgSlash.preview.defaultSelection).toBe('NO');

    const kbRole = await (
      await fetch(`${srv.url}/api/kanban/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'Audit API auth', roleTemplate: 'security_auditor' }),
      })
    ).json() as { ok: boolean; card: { title: string; agentName: string } };
    expect(kbRole.ok).toBe(true);
    expect(kbRole.card.title).toContain('[SEC]');
    expect(kbRole.card.agentName).toBe('Code-Guard Auditor');

    // 6. Personal AI Partner /api/agent/orchestrate coordinates Markets, LiveUI Apps, Cited QA & Ask-First actions
    const orchMarket = await (
      await fetch(`${srv.url}/api/agent/orchestrate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: 'Check BTC and TAO prices' }),
      })
    ).json() as { ok: boolean; domain: string; recommendedTab: string; reply: string; g2Lines: string[] };
    expect(orchMarket.ok).toBe(true);
    expect(orchMarket.domain).toBe('MARKET');
    expect(orchMarket.recommendedTab).toBe('market');
    expect(orchMarket.reply).toContain('BTC');

    const orchQa = await (
      await fetch(`${srv.url}/api/agent/orchestrate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: 'What is our safety hold rule for G2 glasses?' }),
      })
    ).json() as { ok: boolean; domain: string; reply: string; g2Lines: string[] };
    expect(orchQa.ok).toBe(true);
    expect(orchQa.domain).toBe('PARTNER_QA');
    expect(orchQa.g2Lines[0].length).toBeLessThanOrEqual(42);
  });
});
