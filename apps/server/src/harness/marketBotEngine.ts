import { clipLine42 } from '@onq/core';

export interface MarketSignal {
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  signal: 'ACCUMULATE_WATCH' | 'MEAN_REVERT' | 'WAIT_RANGE';
  confidence: number;
  rsiProxy: number;
  rationale: string;
  source: 'COINGECKO_LIVE' | 'DETERMINISTIC_SNAPSHOT';
  updatedAtIso: string;
}

export interface MarketPaperTrade {
  id: string;
  symbol: string;
  side: 'PAPER_BUY' | 'PAPER_ALERT';
  notionalUsd: number;
  entryPriceUsd: number;
  status: 'SIMULATED' | 'ALERT_STAGED';
  createdAtIso: string;
}

const SYMBOL_CATALOG: Array<{
  symbol: string;
  coingeckoId: string;
  name: string;
  fallbackPrice: number;
  fallbackChange: number;
}> = [
  { symbol: 'BTC', coingeckoId: 'bitcoin', name: 'Bitcoin', fallbackPrice: 96420, fallbackChange: 2.84 },
  { symbol: 'ETH', coingeckoId: 'ethereum', name: 'Ethereum', fallbackPrice: 3485, fallbackChange: 3.41 },
  { symbol: 'SOL', coingeckoId: 'solana', name: 'Solana', fallbackPrice: 238.5, fallbackChange: 5.12 },
  { symbol: 'TAO', coingeckoId: 'bittensor', name: 'Bittensor', fallbackPrice: 542.1, fallbackChange: -1.64 },
  { symbol: 'FET', coingeckoId: 'fetch-ai', name: 'Artificial Superintelligence', fallbackPrice: 1.84, fallbackChange: 4.05 },
];

export class MarketResearchBotEngine {
  private lastSignals: MarketSignal[] = [];
  private paperTrades: MarketPaperTrade[] = [];

  private computeSignal(
    meta: (typeof SYMBOL_CATALOG)[number],
    priceUsd: number,
    change24hPct: number,
    source: MarketSignal['source'],
    nowIso: string,
  ): MarketSignal {
    const absChg = Math.abs(change24hPct);
    const rsiProxy = Math.max(18, Math.min(84, Math.round(50 + change24hPct * 3.1)));
    let signal: MarketSignal['signal'] = 'WAIT_RANGE';
    let rationale = 'Range-bound volatility; monitor breakout volume before paper entry.';
    if (change24hPct >= 2.2) {
      signal = 'ACCUMULATE_WATCH';
      rationale = `+${change24hPct.toFixed(1)}% 24h momentum above trend median (RSI-proxy ${rsiProxy}); watch pullback support.`;
    } else if (change24hPct <= -2.0) {
      signal = 'MEAN_REVERT';
      rationale = `${change24hPct.toFixed(1)}% pullback nearing oversold band (RSI-proxy ${rsiProxy}); paper dip watch only.`;
    }
    const confidence = Math.min(92, Math.max(58, Math.round(62 + absChg * 4.5)));
    return {
      symbol: meta.symbol,
      name: meta.name,
      priceUsd,
      change24hPct: Math.round(change24hPct * 100) / 100,
      signal,
      confidence,
      rsiProxy,
      rationale,
      source,
      updatedAtIso: nowIso,
    };
  }

  async fetchSignals(
    requestedSymbols: string[] = ['BTC', 'ETH', 'SOL', 'TAO'],
    fetchImpl: typeof fetch = fetch,
  ): Promise<{
    disclaimer: string;
    signals: MarketSignal[];
    paperTrades: MarketPaperTrade[];
    lensLines: string[];
  }> {
    const nowIso = new Date().toISOString();
    const wanted = requestedSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
    const catalog = SYMBOL_CATALOG.filter((c) => wanted.length === 0 || wanted.includes(c.symbol));
    const chosen = catalog.length > 0 ? catalog : SYMBOL_CATALOG.slice(0, 4);

    let liveMap: Record<string, { usd?: number; usd_24h_change?: number }> | null = null;
    try {
      const ids = chosen.map((c) => c.coingeckoId).join(',');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2800);
      try {
        const res = await fetchImpl(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`,
          { signal: ctrl.signal },
        );
        if (res.ok) {
          liveMap = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      liveMap = null;
    }

    this.lastSignals = chosen.map((meta) => {
      const row = liveMap?.[meta.coingeckoId];
      if (row && typeof row.usd === 'number' && Number.isFinite(row.usd)) {
        return this.computeSignal(
          meta,
          row.usd,
          typeof row.usd_24h_change === 'number' ? row.usd_24h_change : meta.fallbackChange,
          'COINGECKO_LIVE',
          nowIso,
        );
      }
      return this.computeSignal(
        meta,
        meta.fallbackPrice,
        meta.fallbackChange,
        'DETERMINISTIC_SNAPSHOT',
        nowIso,
      );
    });

    const lensLines = [
      'MARKET INTEL | PAPER ONLY (NO AUTO-TRADE)',
      ...this.lastSignals
        .slice(0, 3)
        .map((s) =>
          clipLine42(
            `${s.symbol} $${s.priceUsd.toLocaleString('en-US')} ${s.change24hPct >= 0 ? '+' : ''}${s.change24hPct}% [${s.signal}]`,
          ),
        ),
    ];

    return {
      disclaimer: 'Market research & paper simulation only — not investment advice. Live orders disabled by Default-NO gate.',
      signals: this.lastSignals,
      paperTrades: [...this.paperTrades],
      lensLines,
    };
  }

  simulatePaperAction(symbol: string, notionalUsd = 250): MarketPaperTrade {
    const cleanSym = symbol.trim().toUpperCase() || 'BTC';
    const found =
      this.lastSignals.find((s) => s.symbol === cleanSym) ??
      this.computeSignal(
        SYMBOL_CATALOG.find((c) => c.symbol === cleanSym) ?? SYMBOL_CATALOG[0],
        SYMBOL_CATALOG[0].fallbackPrice,
        SYMBOL_CATALOG[0].fallbackChange,
        'DETERMINISTIC_SNAPSHOT',
        new Date().toISOString(),
      );
    const trade: MarketPaperTrade = {
      id: `paper_${Date.now().toString(36)}`,
      symbol: found.symbol,
      side: 'PAPER_BUY',
      notionalUsd: Math.max(10, Math.min(10_000, notionalUsd)),
      entryPriceUsd: found.priceUsd,
      status: 'SIMULATED',
      createdAtIso: new Date().toISOString(),
    };
    this.paperTrades = [trade, ...this.paperTrades].slice(0, 20);
    return trade;
  }

  buildPythonSignalWatcherCode(symbol = 'BTC'): string {
    const s = symbol.trim().toUpperCase() || 'BTC';
    return [
      `"""OnQ 24/7 Paper Market Research & Telegram Alert Bot (${s})"""`,
      'import json, time, urllib.request',
      '',
      'COINGECKO_MAP = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "TAO": "bittensor"}',
      '',
      `def fetch_signal(symbol="${s}"):`,
      '    cid = COINGECKO_MAP.get(symbol, "bitcoin")',
      '    url = f"https://api.coingecko.com/api/v3/simple/price?ids={cid}&vs_currencies=usd&include_24hr_change=true"',
      '    with urllib.request.urlopen(url, timeout=5) as r:',
      '        data = json.loads(r.read().decode("utf-8"))[cid]',
      '    chg = float(data.get("usd_24h_change", 0.0))',
      '    sig = "ACCUMULATE_WATCH" if chg >= 2.2 else "MEAN_REVERT" if chg <= -2.0 else "WAIT_RANGE"',
      '    return {"symbol": symbol, "price": data["usd"], "chg_24h": round(chg, 2), "signal": sig}',
      '',
      'if __name__ == "__main__":',
      '    print("OnQ Market Research Bot (Paper Only):", json.dumps(fetch_signal(), indent=2))',
    ].join('\n');
  }
}
