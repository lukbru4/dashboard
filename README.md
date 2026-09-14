# Mein Depot – Live Dashboard

Statisches Dashboard für dein Trade-Republic-Depot. Zeigt alle Positionen mit
live nachgeführten Kursen (Yahoo Finance, kein API-Key nötig).

## Wie es funktioniert

- [`data/portfolio.json`](data/portfolio.json) enthält deine Positionen (Stückzahl, ISIN, Ticker) – ändert sich nur bei Kauf/Verkauf.
- [`data/quotes.json`](data/quotes.json) enthält aktuelle Kurse + heutigen Intraday-Verlauf – wird automatisch per GitHub Action aktualisiert.
- [`data/history.json`](data/history.json) enthält bis zu 5 Jahre Tagesschlusskurse je Position – wird einmal täglich aktualisiert.
- [`scripts/update-quotes.mjs`](scripts/update-quotes.mjs) holt Kurse + Intraday-Daten von Yahoo Finance und schreibt `quotes.json`.
- [`scripts/update-history.mjs`](scripts/update-history.mjs) holt die Langfrist-Historie und schreibt `history.json`.
- [`.github/workflows/update-quotes.yml`](.github/workflows/update-quotes.yml) läuft alle 15 Minuten (Mo–Fr, 7–22 Uhr UTC) und committed die neuen Kurse.
- [`.github/workflows/update-history.yml`](.github/workflows/update-history.yml) läuft einmal täglich und committed die Kurshistorie.
- `index.html` / `app.js` / `style.css` sind das eigentliche Dashboard: Tabelle mit allen Positionen in EUR, per Klick auf eine Zeile öffnet sich der Kursverlauf (Heute / 1W / 1M / YTD / 1J / 3J / 5J / Max).

## Setup in GitHub

```bash
git init
git add .
git commit -m "Initial commit: Depot-Dashboard"
git branch -M main
git remote add origin https://github.com/<dein-user>/<dein-repo>.git
git push -u origin main
```

Dann in den Repo-Einstellungen:

1. **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)`. Danach ist das Dashboard unter `https://<dein-user>.github.io/<dein-repo>/` erreichbar.
2. **Settings → Actions → General → Workflow permissions** → `Read and write permissions` aktivieren, damit die Action `quotes.json` committen darf.
3. Fertig – die Action läuft ab dem nächsten 15-Minuten-Takt automatisch. Du kannst sie auch manuell anstoßen: **Actions → Update quotes → Run workflow**.

## Neue Position hinzufügen

In `data/portfolio.json` einen neuen Eintrag mit `name`, `type`, `isin`, `wkn`, `quantity`, `symbol` (Yahoo-Ticker) und `native_currency` ergänzen. Den Yahoo-Ticker findest du z. B. über:

```
https://query2.finance.yahoo.com/v1/finance/search?q=<ISIN>
```

## Hinweise

- Kurse sind mit ca. 15 Minuten Verzögerung "live" (Takt der GitHub Action), keine Echtzeit-Handelsdaten.
- Für einige ETFs werden Londoner USD-Notierungen verwendet (Trade Republic bietet ggf. andere Handelsplätze); alle Werte werden aber live in EUR umgerechnet (inkl. historischer FX-Kurse für die Charts).
- Fonds (Allianz GIF, DWS, BIT) werden über deren Frankfurt/München-Notierung abgebildet. Für Allianz GIF und BIT Global Technology Leaders liefert Yahoo dort keine Kurshistorie – die Detailansicht zeigt für diese beiden nur "Heute" bzw. den aktuellen Kurs, keinen Langfrist-Chart.
- Keine Anlageberatung.
