#!/usr/bin/env bash
set -euo pipefail

REPO="/Users/nils/Library/Mobile Documents/com~apple~CloudDocs/Projekte/Repositories/deskleaf-for-obsidian"
DEST="/Users/nils/Library/Mobile Documents/iCloud~md~obsidian/Documents/Connections/.obsidian/plugins/deskleaf-for-obsidian"

cd "$REPO"

npm run build
npm test

bash swift/build.sh

mkdir -p "$DEST"
cp main.js "$DEST/main.js"
cp styles.css "$DEST/styles.css"
cp manifest.json "$DEST/manifest.json"
cp deskleaf-calendar-sync "$DEST/deskleaf-calendar-sync"

echo "deployed"
