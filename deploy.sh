#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"

# Obsidian maps the plugin folder to the `id` in manifest.json — deriving it
# here keeps deploy.sh and install.sh from drifting apart, as they had.
PLUGIN_ID="$(sed -nE 's/^[[:space:]]*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' manifest.json | head -n 1)"
[[ -n "$PLUGIN_ID" ]] || { echo "manifest.json has no id" >&2; exit 1; }

# Which vault to deploy into. Override for a second vault:
#   DESKLEAF_VAULT="$HOME/Code/brain" bash deploy.sh
VAULT="${DESKLEAF_VAULT:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Connections}"
[[ -d "$VAULT/.obsidian" ]] || { echo "Not an Obsidian vault: $VAULT" >&2; exit 1; }
DEST="$VAULT/.obsidian/plugins/$PLUGIN_ID"

echo "▶  Running deploy preflight…"
DESKLEAF_DEPLOY_DEST="$DEST" bash scripts/deploy-preflight.sh

echo "▶  Building plugin frontend…"
npm run build

echo "▶  Running plugin tests…"
npm test

# The EventKit backend is only reachable on macOS with a Swift toolchain, and it
# is not needed at all when CalDAV credentials are configured. Skip rather than
# fail the deploy — the plugin falls back to CalDAV on its own.
if command -v swift >/dev/null 2>&1; then
  echo "▶  Building Swift EventKit helper…"
  bash swift/build.sh
else
  echo "▶  Skipping Swift EventKit helper (no swift toolchain; CalDAV backend is used)"
fi

echo "▶  Copying plugin artifacts to $DEST…"
mkdir -p "$DEST"
cp main.js "$DEST/main.js"
cp styles.css "$DEST/styles.css"
cp manifest.json "$DEST/manifest.json"
# An `A && B` list that fails would abort the script under `set -e`.
if [[ -f deskleaf-calendar-sync ]]; then
  cp deskleaf-calendar-sync "$DEST/deskleaf-calendar-sync"
fi

echo "deployed to $DEST"
