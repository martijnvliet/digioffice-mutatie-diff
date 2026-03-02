#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(python - <<'PY'
import json
with open('manifest.json', 'r', encoding='utf-8') as f:
    data=json.load(f)
print(data['version'])
PY
)"

OUT="dist/digioffice-mutatie-diff-v${VERSION}.zip"

mkdir -p dist
zip -j "$OUT" manifest.json content.js diff.js styles.css README.md >/dev/null
sha256sum "$OUT" > "${OUT}.sha256"

echo "Created $OUT"
