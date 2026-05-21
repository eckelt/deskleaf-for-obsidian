#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "▶  Building deskleaf-calendar-sync…"
if swift build -c release --arch arm64 --arch x86_64 2>/dev/null; then
    BINARY=".build/apple/Products/Release/DeskleafCalendarSync"
else
    echo "   (universal build unavailable, building for current arch)"
    swift build -c release
    BINARY=".build/release/DeskleafCalendarSync"
fi
DEST="../deskleaf-calendar-sync"

cp "$BINARY" "$DEST"
chmod +x "$DEST"
codesign --force --sign - "$DEST"

OBSIDIAN_PLUGIN="/Users/nils.eckelt/Library/Mobile Documents/iCloud~md~obsidian/Documents/Verknüpfungen/.obsidian/plugins/obs-focal"
if [ -d "$OBSIDIAN_PLUGIN" ]; then
    cp "$DEST" "$OBSIDIAN_PLUGIN/deskleaf-calendar-sync"
    # Also deploy JS/CSS so the plugin is always in sync with the binary
    REPO="$(cd .. && pwd)"  # script already cd'd into swift/, so .. = repo root
    [ -f "$REPO/main.js"    ] && cp "$REPO/main.js"    "$OBSIDIAN_PLUGIN/main.js"
    [ -f "$REPO/styles.css" ] && cp "$REPO/styles.css" "$OBSIDIAN_PLUGIN/styles.css"
    echo "✓  Deployed to Obsidian plugin directory"
fi

echo "✓  Done: deskleaf-calendar-sync"
