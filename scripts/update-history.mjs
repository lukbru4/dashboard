// Fetches long-range daily close history for all holdings + FX rates from
// Yahoo Finance's public chart endpoint and writes data/history.json.
// Runs on a daily schedule (long history doesn't need 15-minute refreshes).
import { readFileSync, writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (compatible; DepotDashboardBot/1.0)";

async function fetchDaily(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  // Note: a handful of thinly-traded fund listings (e.g. some Frankfurt/Munich
  // mirrors) only expose the latest quote via Yahoo, no history at all. The
  // frontend shows "no data" for those instead of failing.
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`${symbol}: no result in response`);

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  return timestamps
    .map((t, i) => [t, closes[i]])
    .filter(([, c]) => c != null);
}

async function main() {
  const portfolio = JSON.parse(
    readFileSync(new URL("../data/portfolio.json", import.meta.url), "utf8")
  );

  const symbols = [...new Set(portfolio.holdings.map((h) => h.symbol))];
  const fxSymbols = ["EURUSD=X", "EURGBP=X"];

  const series = {};
  const errors = [];

  for (const symbol of [...symbols, ...fxSymbols]) {
    try {
      series[symbol] = await fetchDaily(symbol);
    } catch (err) {
      errors.push({ symbol, error: String(err.message || err) });
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  const out = {
    updated_at: new Date().toISOString(),
    series,
    errors,
  };

  writeFileSync(
    new URL("../data/history.json", import.meta.url),
    JSON.stringify(out) + "\n"
  );

  console.log(`Wrote history for ${Object.keys(series).length} symbols, ${errors.length} errors.`);
  if (errors.length) console.log(errors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
