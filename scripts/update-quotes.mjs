// Fetches live quotes (+ today's intraday series) for all holdings + FX rates
// from Yahoo Finance's public chart endpoint (no API key required) and
// writes data/quotes.json.
import { readFileSync, writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (compatible; DepotDashboardBot/1.0)";

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || meta.regularMarketPrice == null) {
    throw new Error(`${symbol}: no price in response`);
  }

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const intraday = timestamps
    .map((t, i) => [t, closes[i]])
    .filter(([, c]) => c != null);

  return {
    symbol,
    price: meta.regularMarketPrice,
    currency: meta.currency,
    marketTime: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null,
    previousClose: meta.chartPreviousClose ?? null,
    dayOpen: meta.regularMarketOpen ?? null,
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    intraday, // [[unixSeconds, close], ...] for today, ~15min steps
  };
}

async function main() {
  const portfolio = JSON.parse(
    readFileSync(new URL("../data/portfolio.json", import.meta.url), "utf8")
  );

  const symbols = [...new Set(portfolio.holdings.map((h) => h.symbol))];
  const fxSymbols = ["EURUSD=X", "EURGBP=X"];

  const quotes = {};
  const errors = [];

  for (const symbol of [...symbols, ...fxSymbols]) {
    try {
      quotes[symbol] = await fetchQuote(symbol);
    } catch (err) {
      errors.push({ symbol, error: String(err.message || err) });
    }
    // be polite / avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  const out = {
    updated_at: new Date().toISOString(),
    quotes,
    errors,
  };

  writeFileSync(
    new URL("../data/quotes.json", import.meta.url),
    JSON.stringify(out) + "\n"
  );

  console.log(`Wrote ${Object.keys(quotes).length} quotes, ${errors.length} errors.`);
  if (errors.length) console.log(errors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
