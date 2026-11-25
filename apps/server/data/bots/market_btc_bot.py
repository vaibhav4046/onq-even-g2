"""OnQ 24/7 Paper Market Research & Telegram Alert Bot (BTC)"""
import json, time, urllib.request

COINGECKO_MAP = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "TAO": "bittensor"}

def fetch_signal(symbol="BTC"):
    cid = COINGECKO_MAP.get(symbol, "bitcoin")
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={cid}&vs_currencies=usd&include_24hr_change=true"
    with urllib.request.urlopen(url, timeout=5) as r:
        data = json.loads(r.read().decode("utf-8"))[cid]
    chg = float(data.get("usd_24h_change", 0.0))
    sig = "ACCUMULATE_WATCH" if chg >= 2.2 else "MEAN_REVERT" if chg <= -2.0 else "WAIT_RANGE"
    return {"symbol": symbol, "price": data["usd"], "chg_24h": round(chg, 2), "signal": sig}

if __name__ == "__main__":
    print("OnQ Market Research Bot (Paper Only):", json.dumps(fetch_signal(), indent=2))