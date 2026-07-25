#!/usr/bin/env bash
set -euo pipefail

REPO="/Users/nils/Library/Mobile Documents/com~apple~CloudDocs/Projekte/Repositories/deskleaf-for-obsidian"
DEST="/Users/nils/Library/Mobile Documents/iCloud~md~obsidian/Documents/Connections/.obsidian/plugins/deskleaf-for-obsidian"

cd "$REPO"

echo "▶  Running deploy preflight…"
bash scripts/deploy-preflight.sh

echo "▶  Building plugin frontend…"
npm run build

echo "▶  Running plugin tests…"
npm test

echo "▶  Building Swift EventKit helper…"
bash swift/build.sh

echo "▶  Copying plugin artifacts…"
mkdir -p "$DEST"
cp main.js "$DEST/main.js"
cp styles.css "$DEST/styles.css"
cp manifest.json "$DEST/manifest.json"
cp deskleaf-calendar-sync "$DEST/deskleaf-calendar-sync"

echo "deployed"
