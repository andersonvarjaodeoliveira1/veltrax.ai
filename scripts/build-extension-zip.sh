#!/usr/bin/env bash
# Rebuilds the downloadable Flow extension (served at /extensao/clipgringa-flow.zip) from extension/flow.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
rm -f "$root/frontend/public/extensao/clipgringa-flow.zip"
# Arquivos direto na raiz do zip: a pasta extraída já é a pasta da extensão (manifest.json dentro dela).
(cd "$root/extension/flow" && zip -qr "$root/frontend/public/extensao/clipgringa-flow.zip" . -x "*.DS_Store")
printf '{"version":"%s"}\n' "$(unzip -p "$root/frontend/public/extensao/clipgringa-flow.zip" manifest.json | sed -n 's/.*"version": "\([^"]*\)".*/\1/p')" > "$root/frontend/public/extensao/version.json"
echo "OK: $(unzip -p "$root/frontend/public/extensao/clipgringa-flow.zip" manifest.json | grep '"version"')"
