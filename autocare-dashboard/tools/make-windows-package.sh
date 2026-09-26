#!/usr/bin/env bash
# Builds a ready-to-run Windows package: AutoCare-Dashboard-Windows.zip
#
# The zip contains the built website and the backend with its libraries. The
# person using it unzips it and double-clicks START-AutoCare.bat. On the first
# run that file downloads a portable Node.js (checksum-verified) into the
# package folder, so nothing is installed on the computer.
# If you change the Node.js version, update NODE_VERSION and both checksums in
# tools/windows/START-AutoCare.bat (from https://nodejs.org/dist/<version>/SHASUMS256.txt).
#
# Usage (on Linux or macOS, needs curl, unzip and zip):
#   bash tools/make-windows-package.sh [output-folder]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist-windows}"
WORK="$(mktemp -d)"
PKG="$WORK/AutoCare-Dashboard"
trap 'rm -rf "$WORK"' EXIT

echo "Building the website..."
(cd "$ROOT/frontend" && npm install --no-audit --no-fund >/dev/null && npm run build >/dev/null)

echo "Copying the app..."
mkdir -p "$PKG/app/backend" "$PKG/app/frontend"
cp -r "$ROOT/backend/src" "$ROOT/backend/scripts" "$ROOT/backend/package.json" "$ROOT/backend/package-lock.json" \
      "$ROOT/backend/.env.example" "$PKG/app/backend/"
cp -r "$ROOT/frontend/dist" "$PKG/app/frontend/"
cp "$ROOT/README.md" "$PKG/app/"
# Only the libraries needed to run (all plain JavaScript, so they work on Windows as-is).
(cd "$PKG/app/backend" && npm ci --omit=dev --no-audit --no-fund >/dev/null)

# sql.js ships many builds; the app only loads dist/sql-wasm.js + .wasm.
find "$PKG/app/backend/node_modules/sql.js/dist" -type f ! -name 'sql-wasm.js' ! -name 'sql-wasm.wasm' -delete

cp "$ROOT/tools/windows/START-AutoCare.bat" "$ROOT/tools/windows/HOW-TO-START.txt" "$PKG/"

mkdir -p "$OUT"
rm -f "$OUT/AutoCare-Dashboard-Windows.zip"
(cd "$WORK" && zip -qr -9 "$OUT/AutoCare-Dashboard-Windows.zip" AutoCare-Dashboard)
echo "Done: $OUT/AutoCare-Dashboard-Windows.zip ($(du -h "$OUT/AutoCare-Dashboard-Windows.zip" | cut -f1))"
