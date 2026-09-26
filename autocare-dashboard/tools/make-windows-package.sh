#!/usr/bin/env bash
# Builds a ready-to-run Windows package: AutoCare-Dashboard-Windows.zip
#
# The zip contains the built website, the backend with its libraries, and a
# portable copy of Node.js (64-bit and 32-bit). The person using it only has
# to unzip it and double-click START-AutoCare.bat; nothing needs installing.
#
# Usage (on Linux or macOS, needs curl, unzip and zip):
#   bash tools/make-windows-package.sh [output-folder]
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-v22.23.3}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist-windows}"
WORK="$(mktemp -d)"
PKG="$WORK/AutoCare-Dashboard"
trap 'rm -rf "$WORK"' EXIT

echo "Building the website..."
(cd "$ROOT/frontend" && npm install --no-audit --no-fund >/dev/null && npm run build >/dev/null)

echo "Copying the app..."
mkdir -p "$PKG/app/backend" "$PKG/app/frontend" "$PKG/node"
cp -r "$ROOT/backend/src" "$ROOT/backend/scripts" "$ROOT/backend/package.json" "$ROOT/backend/package-lock.json" \
      "$ROOT/backend/.env.example" "$PKG/app/backend/"
cp -r "$ROOT/frontend/dist" "$PKG/app/frontend/"
cp "$ROOT/README.md" "$PKG/app/"
# Only the libraries needed to run (all plain JavaScript, so they work on Windows as-is).
(cd "$PKG/app/backend" && npm ci --omit=dev --no-audit --no-fund >/dev/null)

echo "Downloading Node.js $NODE_VERSION for Windows..."
for arch in x64 x86; do
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-win-$arch.zip" -o "$WORK/node-$arch.zip"
  unzip -q -j "$WORK/node-$arch.zip" "node-$NODE_VERSION-win-$arch/node.exe" -d "$WORK/node-$arch"
  mkdir -p "$PKG/node/$arch"
  mv "$WORK/node-$arch/node.exe" "$PKG/node/$arch/node.exe"
done

cp "$ROOT/tools/windows/START-AutoCare.bat" "$ROOT/tools/windows/HOW-TO-START.txt" "$PKG/"

mkdir -p "$OUT"
rm -f "$OUT/AutoCare-Dashboard-Windows.zip"
(cd "$WORK" && zip -qr -9 "$OUT/AutoCare-Dashboard-Windows.zip" AutoCare-Dashboard)
echo "Done: $OUT/AutoCare-Dashboard-Windows.zip ($(du -h "$OUT/AutoCare-Dashboard-Windows.zip" | cut -f1))"
