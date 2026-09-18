const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const EUR2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const PCT = new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATE_SHORT = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

let portfolio, quoteData, historyData;
let currentHolding = null;
let currentRange = "1m";

function toEur(amount, currency, fx) {
  if (currency === "EUR") return amount;
  if (currency === "USD") return amount / fx.EURUSD;
  if (currency === "GBP") return amount / fx.EURGBP;
  if (currency === "GBp") return amount / 100 / fx.EURGBP; // pence
  throw new Error(`Unsupported currency: ${currency}`);
}

function relTime(iso) {
  if (!iso) return "unbekannt";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return `vor ${days} Tg.`;
}

async function loadJson(path) {
  const res = await fetch(`${path}?_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

// --- FX-aware series helpers -----------------------------------------

// series: [[unixSeconds, value], ...] sorted ascending by time
function nearestValue(series, t) {
  if (!series || series.length === 0) return null;
  let lo = 0, hi = series.length - 1;
  if (t <= series[0][0]) return series[0][1];
  if (t >= series[hi][0]) return series[hi][1];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  const after = series[lo];
  const before = series[lo - 1] || after;
  return Math.abs(after[0] - t) < Math.abs(t - before[0]) ? after[1] : before[1];
}

function convertSeriesToEur(series, currency, fx) {
  if (currency === "EUR") return series;
  const fxSeries = currency === "USD" ? fx.EURUSD_series : currency === "GBP" ? fx.EURGBP_series : null;
  if (!fxSeries || fxSeries.length === 0) return series;
  return series.map(([t, v]) => [t, v / nearestValue(fxSeries, t)]);
}

// Convert a single native-currency amount to EUR using the FX rate closest
// to timestamp t (falls back to the current FX rate if no series is loaded).
function toEurAt(amount, currency, t, fx) {
  if (currency === "EUR") return amount;
  const fxSeries = currency === "USD" ? fx.EURUSD_series : currency === "GBP" ? fx.EURGBP_series : null;
  const fallback = currency === "USD" ? fx.EURUSD : fx.EURGBP;
  const rate = fxSeries && fxSeries.length ? (nearestValue(fxSeries, t) ?? fallback) : fallback;
  return amount / rate;
}

function filterRange(series, rangeKey) {
  if (!series || series.length === 0) return [];
  if (rangeKey === "max") return series;
  const now = Date.now() / 1000;
  let cutoff;
  if (rangeKey === "1w") cutoff = now - 7 * 86400;
  else if (rangeKey === "1m") cutoff = now - 31 * 86400;
  else if (rangeKey === "ytd") cutoff = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).getTime() / 1000;
  else if (rangeKey === "1y") cutoff = now - 366 * 86400;
  else if (rangeKey === "3y") cutoff = now - 3 * 366 * 86400;
  else if (rangeKey === "5y") cutoff = now - 5 * 366 * 86400;
  else cutoff = 0;
  const filtered = series.filter(([t]) => t >= cutoff);
  return filtered.length >= 2 ? filtered : series.slice(-2);
}

// --- Chart rendering (inline SVG, no dependencies) --------------------

function renderChart(points) {
  const w = 640, h = 220, padX = 8, padY = 20;
  if (!points || points.length < 2) {
    return { html: `<div class="chart-empty">Keine Verlaufsdaten verfügbar.</div>`, geom: null };
  }
  const values = points.map((p) => p[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const t0 = points[0][0];
  const t1 = points[points.length - 1][0];
  const tRange = t1 - t0 || 1;

  const xy = (p) => {
    const x = padX + ((p[0] - t0) / tRange) * (w - 2 * padX);
    const y = h - padY - ((p[1] - min) / range) * (h - 2 * padY);
    return [x, y];
  };

  const coords = points.map(xy);
  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)},${h - padY} L${coords[0][0].toFixed(1)},${h - padY} Z`;

  const startVal = points[0][1];
  const endVal = points[points.length - 1][1];
  const isUp = endVal >= startVal;
  const color = isUp ? "var(--positive)" : "var(--negative)";

  return {
    geom: { w, h, padX, padY, min, range, t0, tRange },
    html: `
      <div class="chart-flaeche" tabindex="0" aria-label="Kursverlauf. Mit der Maus über den Chart fahren oder die Pfeiltasten nutzen, um einzelne Werte zu sehen.">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
          <path d="${areaPath}" fill="${color}" opacity="0.12" stroke="none"></path>
          <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
        </svg>
        <div class="fk-linie" hidden></div>
        <div class="fk-punkt" hidden></div>
        <div class="fk-info" hidden aria-live="polite"></div>
      </div>
    `,
  };
}

// Fadenkreuz: senkrechte Linie folgt Maus, Finger oder Pfeiltasten und zeigt den Wert an dieser Stelle.
function enableCrosshair(wrap, points, geom, { intraday, quantity }) {
  const flaeche = wrap.querySelector(".chart-flaeche");
  if (!flaeche || !geom) return;
  const linie = flaeche.querySelector(".fk-linie");
  const punkt = flaeche.querySelector(".fk-punkt");
  const info = flaeche.querySelector(".fk-info");
  const startWert = points[0][1];
  const zeit = intraday
    ? (d) => d.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : (d) => d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  let index = null;

  const naechsterIndex = (clientX) => {
    const rahmen = flaeche.getBoundingClientRect();
    const vx = ((clientX - rahmen.left) / rahmen.width) * geom.w;
    const t = geom.t0 + ((vx - geom.padX) / (geom.w - 2 * geom.padX)) * geom.tRange;
    let lo = 0, hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid][0] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && Math.abs(points[lo - 1][0] - t) < Math.abs(points[lo][0] - t) ? lo - 1 : lo;
  };

  const zeige = (i) => {
    index = Math.max(0, Math.min(points.length - 1, i));
    const [t, v] = points[index];
    const breite = flaeche.clientWidth, hoehe = flaeche.clientHeight;
    const x = ((geom.padX + ((t - geom.t0) / geom.tRange) * (geom.w - 2 * geom.padX)) / geom.w) * breite;
    const y = ((geom.h - geom.padY - ((v - geom.min) / geom.range) * (geom.h - 2 * geom.padY)) / geom.h) * hoehe;
    const diff = startWert ? (v - startWert) / startWert : 0;

    info.innerHTML = `
      <div class="fk-zeit">${zeit(new Date(t * 1000))}</div>
      <div class="fk-wert">${EUR.format(v)}</div>
      ${quantity ? `<div class="fk-kurs">Kurs ${EUR2.format(v / quantity)}</div>` : ""}
      <div class="${diff >= 0 ? "positive" : "negative"}">${diff >= 0 ? "+" : ""}${PCT.format(diff)} seit Beginn</div>`;
    linie.hidden = punkt.hidden = info.hidden = false;
    linie.style.left = `${x}px`;
    punkt.style.left = `${x}px`;
    punkt.style.top = `${y}px`;
    // Kästchen neben der Linie, auf der Seite mit mehr Platz — so verdeckt es den Kurs unter dem Mauszeiger nicht.
    const abstand = 12;
    const links = x + abstand + info.offsetWidth <= breite ? x + abstand : x - abstand - info.offsetWidth;
    info.style.left = `${Math.max(0, links)}px`;
  };

  const verstecke = () => {
    index = null;
    linie.hidden = punkt.hidden = info.hidden = true;
  };

  flaeche.addEventListener("pointermove", (e) => zeige(naechsterIndex(e.clientX)));
  flaeche.addEventListener("pointerdown", (e) => zeige(naechsterIndex(e.clientX)));
  flaeche.addEventListener("pointerleave", verstecke);
  flaeche.addEventListener("blur", verstecke);
  flaeche.addEventListener("keydown", (e) => {
    const schritt = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") zeige((index ?? points.length - 1) - schritt);
    else if (e.key === "ArrowRight") zeige((index ?? 0) + schritt);
    else if (e.key === "Home") zeige(0);
    else if (e.key === "End") zeige(points.length - 1);
    else return;
    e.preventDefault();
  });
}

// --- Portfolio total series ---------------------------------------------

const PORTFOLIO_SENTINEL = { isPortfolio: true, name: "Gesamtwert", isin: "", wkn: "", type: "Portfolio" };

// Builds a [[t, totalEurValue], ...] series for the whole portfolio by
// summing every holding's EUR value at each timestamp of a reference grid.
function buildPortfolioSeries(rangeKey, fx) {
  const isToday = rangeKey === "today";
  let grid = null;

  if (isToday) {
    let bestLen = 0;
    for (const h of portfolio.holdings) {
      const intraday = quoteData.quotes[h.symbol]?.intraday;
      if (intraday && intraday.length > bestLen) { grid = intraday; bestLen = intraday.length; }
    }
  } else {
    let bestLen = 0;
    for (const h of portfolio.holdings) {
      const s = historyData?.series?.[h.symbol];
      if (s && s.length > bestLen) { grid = s; bestLen = s.length; }
    }
    grid = grid ? filterRange(grid, rangeKey) : null;
  }

  if (!grid || grid.length < 2) return [];

  return grid.map(([t]) => {
    let total = 0;
    for (const h of portfolio.holdings) {
      const q = quoteData.quotes[h.symbol];
      if (!q) continue;
      let priceNative;
      if (isToday) {
        const intraday = q.intraday && q.intraday.length ? q.intraday : null;
        priceNative = intraday ? nearestValue(intraday, t) : q.price;
      } else {
        const raw = historyData?.series?.[h.symbol];
        priceNative = raw && raw.length ? nearestValue(raw, t) : q.price;
      }
      if (priceNative == null) continue;
      total += toEurAt(priceNative, h.native_currency, t, fx) * h.quantity;
    }
    return [t, total];
  });
}

// --- Modal --------------------------------------------------------------

function buildFx() {
  const usdSeries = historyData?.series?.["EURUSD=X"] || [];
  const gbpSeries = historyData?.series?.["EURGBP=X"] || [];
  return {
    EURUSD: quoteData.quotes["EURUSD=X"]?.price,
    EURGBP: quoteData.quotes["EURGBP=X"]?.price,
    EURUSD_series: usdSeries,
    EURGBP_series: gbpSeries,
  };
}

function openModal(holding) {
  currentHolding = holding;
  currentRange = "1m";
  document.getElementById("modal-title").textContent = holding.name;
  document.getElementById("modal-meta").textContent = holding.isPortfolio
    ? "Alle Positionen zusammen"
    : `${holding.isin} · ${holding.wkn} · ${holding.type}`;
  document.getElementById("modal-overlay").hidden = false;
  document.querySelectorAll("#range-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.range === currentRange));
  renderModalRange();
}

function closeModal() {
  document.getElementById("modal-overlay").hidden = true;
  currentHolding = null;
}

function renderModalRange() {
  const h = currentHolding;
  const chartWrap = document.getElementById("chart-wrap");
  const statsEl = document.getElementById("chart-stats");
  const fx = buildFx();

  let points; // [[t, eurValue], ...]
  let captionNote = "";

  if (h.isPortfolio) {
    points = buildPortfolioSeries(currentRange, fx);
    captionNote = currentRange === "today"
      ? "Intraday-Werte, alle 15 Minuten aktualisiert. Positionen ohne eigene Historie werden mit ihrem letzten bekannten Kurs eingerechnet."
      : "Tagesschlusskurse. Positionen ohne eigene Historie werden mit ihrem letzten bekannten Kurs eingerechnet.";
  } else if (currentRange === "today") {
    const q = quoteData.quotes[h.symbol];
    const intraday = q?.intraday || [];
    if (intraday.length >= 2) {
      points = convertSeriesToEur(intraday, h.native_currency, fx);
    } else if (q?.previousClose != null && q?.price != null) {
      const now = Math.floor(Date.now() / 1000);
      points = convertSeriesToEur([[now - 3600, q.previousClose], [now, q.price]], h.native_currency, fx);
    } else {
      points = [];
    }
    points = points.map(([t, v]) => [t, v * h.quantity]);
    captionNote = "Intraday-Kurse, alle 15 Minuten aktualisiert.";
  } else {
    const raw = historyData?.series?.[h.symbol] || [];
    const filtered = filterRange(raw, currentRange);
    points = convertSeriesToEur(filtered, h.native_currency, fx).map(([t, v]) => [t, v * h.quantity]);
    captionNote = "Tagesschlusskurse.";
  }

  if (!points || points.length < 2) {
    chartWrap.innerHTML = `<div class="chart-empty">Keine Verlaufsdaten verfügbar. ${captionNote}</div>`;
    statsEl.innerHTML = "";
    return;
  }

  const chart = renderChart(points);
  chartWrap.innerHTML = chart.html + `<div class="chart-hilfe">${captionNote} Mit der Maus über den Chart fahren, um einzelne Werte zu sehen.</div>`;
  enableCrosshair(chartWrap, points, chart.geom, {
    intraday: currentRange === "today",
    quantity: h.isPortfolio ? null : h.quantity,
  });

  const startVal = points[0][1];
  const endVal = points[points.length - 1][1];
  const changeAbs = endVal - startVal;
  const changePct = startVal ? changeAbs / startVal : 0;

  const priceRow = h.isPortfolio ? "" : `
    <div><div class="stat-label">Kurs aktuell</div><div class="stat-value">${EUR2.format(endVal / h.quantity)}</div></div>
    <div><div class="stat-label">Kurs Start</div><div class="stat-value">${EUR2.format(startVal / h.quantity)}</div></div>
  `;

  statsEl.innerHTML = `
    ${priceRow}
    <div><div class="stat-label">Veränderung</div><div class="stat-value ${changeAbs >= 0 ? "positive" : "negative"}">${changeAbs >= 0 ? "+" : ""}${PCT.format(changePct)}</div></div>
    <div><div class="stat-label">Wert aktuell</div><div class="stat-value">${EUR.format(endVal)}</div></div>
    <div><div class="stat-label">Wert Start</div><div class="stat-value">${EUR.format(startVal)}</div></div>
    <div><div class="stat-label">Zeitraum</div><div class="stat-value">${DATE_SHORT.format(new Date(points[0][0] * 1000))} – ${DATE_SHORT.format(new Date(points[points.length - 1][0] * 1000))}</div></div>
  `;
}

function setupModal() {
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  document.getElementById("range-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    currentRange = btn.dataset.range;
    document.querySelectorAll("#range-tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    renderModalRange();
  });
}

// --- Main table -----------------------------------------------------

async function main() {
  setupModal();
  const tbody = document.getElementById("holdings-body");
  try {
    [portfolio, quoteData, historyData] = await Promise.all([
      loadJson("data/portfolio.json"),
      loadJson("data/quotes.json"),
      loadJson("data/history.json").catch(() => ({ series: {} })),
    ]);

    const fx = {
      EURUSD: quoteData.quotes["EURUSD=X"]?.price,
      EURGBP: quoteData.quotes["EURGBP=X"]?.price,
    };

    const rows = portfolio.holdings.map((h) => {
      const q = quoteData.quotes[h.symbol];
      if (!q) {
        return { ...h, ok: false };
      }
      const priceEur = toEur(q.price, q.currency, fx);
      const valueEur = priceEur * h.quantity;
      const prevValueEur = q.previousClose != null
        ? toEur(q.previousClose, q.currency, fx) * h.quantity
        : null;
      const dayChangePct = q.previousClose ? (q.price - q.previousClose) / q.previousClose : null;
      return {
        ...h,
        ok: true,
        priceEur,
        marketTime: q.marketTime,
        valueEur,
        prevValueEur,
        dayChangePct,
      };
    });

    const totalValue = rows.reduce((sum, r) => sum + (r.ok ? r.valueEur : 0), 0);
    const totalPrev = rows.reduce((sum, r) => sum + (r.ok && r.prevValueEur != null ? r.prevValueEur : (r.ok ? r.valueEur : 0)), 0);
    const totalChangePct = totalPrev ? (totalValue - totalPrev) / totalPrev : 0;
    const totalChangeAbs = totalValue - totalPrev;

    document.getElementById("total-value").textContent = EUR.format(totalValue);
    const changeEl = document.getElementById("total-change");
    changeEl.textContent = `${totalChangeAbs >= 0 ? "+" : ""}${EUR.format(totalChangeAbs)} (${totalChangeAbs >= 0 ? "+" : ""}${PCT.format(totalChangePct)}) heute`;
    changeEl.className = `card-sub ${totalChangeAbs >= 0 ? "positive" : "negative"}`;

    document.getElementById("position-count").textContent = rows.length;
    document.getElementById("total-card").onclick = () => openModal(PORTFOLIO_SENTINEL);

    const top = [...rows].filter((r) => r.ok).sort((a, b) => b.valueEur - a.valueEur)[0];
    document.getElementById("top-position").textContent = top ? top.name.split(" - ")[0].split(" (")[0] : "–";

    tbody.innerHTML = "";
    [...rows]
      .sort((a, b) => (b.ok ? b.valueEur : -1) - (a.ok ? a.valueEur : -1))
      .forEach((r) => {
        const tr = document.createElement("tr");
        if (!r.ok) {
          tr.innerHTML = `
            <td class="col-name">${r.name}<span class="sub">${r.isin} · ${r.type}</span></td>
            <td class="col-type">${r.type}</td>
            <td class="col-qty">${r.quantity}</td>
            <td colspan="4" class="error">Kurs nicht verfügbar</td>
          `;
          tbody.appendChild(tr);
          return;
        }
        const weight = totalValue ? r.valueEur / totalValue : 0;
        const changeClass = r.dayChangePct == null ? "" : r.dayChangePct >= 0 ? "positive" : "negative";
        const changeText = r.dayChangePct == null ? "–" : `${r.dayChangePct >= 0 ? "+" : ""}${PCT.format(r.dayChangePct)}`;
        tr.dataset.clickable = "true";
        tr.title = "Klicken für Kursverlauf";
        tr.innerHTML = `
          <td class="col-name">${r.name}<span class="sub">${r.isin} · ${r.wkn}</span></td>
          <td class="col-type">${r.type}</td>
          <td class="col-qty">${r.quantity}</td>
          <td class="col-price">${EUR2.format(r.priceEur)}</td>
          <td class="col-change ${changeClass}">${changeText}</td>
          <td class="col-value">${EUR.format(r.valueEur)}</td>
          <td class="col-weight">${PCT.format(weight)}</td>
        `;
        tr.addEventListener("click", () => openModal(r));
        tbody.appendChild(tr);
      });

    document.getElementById("updated").textContent =
      `Kurse aktualisiert: ${relTime(quoteData.updated_at)} (${new Date(quoteData.updated_at).toLocaleString("de-DE")})`;
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" class="error">Fehler beim Laden der Daten: ${err.message}</td></tr>`;
  }
}

main();
