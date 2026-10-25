#!/usr/bin/env bash
# Rebuilds the downloadable Flow extension (served at /extensao/clipgringa-flow.zip) from extension/flow.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
rm -f "$root/frontend/public/extensao/clipgringa-flow.zip"
(cd "$root/extension" && zip -qr "$root/frontend/public/extensao/clipgringa-flow.zip" flow -x "*.DS_Store")
echo "OK: $(unzip -p "$root/frontend/public/extensao/clipgringa-flow.zip" flow/manifest.json | grep '"version"')"
