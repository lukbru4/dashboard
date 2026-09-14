const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const PCT = new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

async function main() {
  const tbody = document.getElementById("holdings-body");
  try {
    const [portfolio, quoteData] = await Promise.all([
      loadJson("data/portfolio.json"),
      loadJson("data/quotes.json"),
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
      const valueEur = toEur(q.price * h.quantity, q.currency, fx);
      const prevValueEur = q.previousClose != null
        ? toEur(q.previousClose * h.quantity, q.currency, fx)
        : null;
      const dayChangePct = q.previousClose ? (q.price - q.previousClose) / q.previousClose : null;
      return {
        ...h,
        ok: true,
        price: q.price,
        currency: q.currency,
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
        tr.innerHTML = `
          <td class="col-name">${r.name}<span class="sub">${r.isin} · ${r.wkn}</span></td>
          <td class="col-type">${r.type}</td>
          <td class="col-qty">${r.quantity}</td>
          <td class="col-price">${new Intl.NumberFormat("de-DE", { style: "currency", currency: r.currency }).format(r.price)}</td>
          <td class="col-change ${changeClass}">${changeText}</td>
          <td class="col-value">${EUR.format(r.valueEur)}</td>
          <td class="col-weight">${PCT.format(weight)}</td>
        `;
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
