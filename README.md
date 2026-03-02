# DigiOffice Mutatie Diff

Chromium extensie voor DigiOffice waarmee je geselecteerde mutatieregels met elkaar vergelijkt in een side-by-side diff weergave.

## Functionaliteit

- Detecteert de DigiOffice change-log grid (`*_grdChangeLog`).
- Voegt een knop **Vergelijk mutaties** toe zodra de grid beschikbaar is.
- Ondersteunt multi-select van regels (Ctrl+klik).
- Opent een modal met diff per geselecteerde regel:
  - oude waarde links
  - nieuwe waarde rechts
  - line-by-line en word-by-word markering
- Formatteert XML/HTML-achtige tekst voor betere leesbaarheid.
- Synchroniseert scrollen tussen oude en nieuwe kolom.

## Installatie

1. Open `chrome://extensions`.
2. Zet **Developer mode** aan.
3. Kies **Load unpacked**.
4. Selecteer deze map.

## Bestanden

- `manifest.json` – MV3 configuratie.
- `diff.js` – diff helpers en renderer.
- `content.js` – DigiOffice-specifieke DOM-logica en modal opbouw.
- `styles.css` – styling voor knop, modal en diff highlights.
