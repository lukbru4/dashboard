# Mein Depot – Live Dashboard

Statisches Dashboard für dein Trade-Republic-Depot. Zeigt alle Positionen mit
live nachgeführten Kursen (Yahoo Finance, kein API-Key nötig).

## Wie es funktioniert

- [`data/portfolio.json`](data/portfolio.json) enthält deine Positionen (Stückzahl, ISIN, Ticker) – ändert sich nur bei Kauf/Verkauf.
- [`data/quotes.json`](data/quotes.json) enthält die aktuellen Kurse – wird automatisch per GitHub Action aktualisiert.
- [`scripts/update-quotes.mjs`](scripts/update-quotes.mjs) holt die Kurse von Yahoo Finance und schreibt `quotes.json`.
- [`.github/workflows/update-quotes.yml`](.github/workflows/update-quotes.yml) läuft alle 15 Minuten (Mo–Fr, 7–22 Uhr UTC) und committed die neuen Kurse.
- `index.html` / `app.js` / `style.css` sind das eigentliche Dashboard, das die beiden JSON-Dateien lädt und Werte in EUR umrechnet.

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
- Für einige ETFs werden Londoner USD-Notierungen verwendet (Trade Republic bietet ggf. andere Handelsplätze); Werte werden aber korrekt in EUR umgerechnet.
- Fonds (Allianz GIF, DWS, BIT) werden über deren Frankfurt/München-Notierung abgebildet.
- Keine Anlageberatung.
