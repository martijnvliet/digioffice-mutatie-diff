# DigiOffice Mutatie Diff v1.0

## Release inhoud
- Manifest V3 Chromium extensie voor DigiOffice mutatievergelijking.
- Side-by-side diff voor oude/nieuwe waarden met line + word highlighting.
- Selectie van meerdere mutatieregels in het changelog-grid.
- Vergelijk-knop in de toolbar met DigiOffice-styling.
- Verbeterde verwerking van multiline PowerShell/XML-achtige waarden.
- Lichtgewicht autocomplete-ondersteuning in code-textareas (C# en PowerShell), inclusief toetsenbordnavigatie.

## Installatie
1. Open `chrome://extensions`.
2. Zet **Developer mode** aan.
3. Kies **Load unpacked** en selecteer de extensiemap, of gebruik de zip uit `dist/`.

## Artifacts genereren
- Run `./scripts/create-release.sh` om lokaal deze bestanden te genereren in `dist/`:
  - `digioffice-mutatie-diff-v1.0.zip`
  - `digioffice-mutatie-diff-v1.0.zip.sha256`
