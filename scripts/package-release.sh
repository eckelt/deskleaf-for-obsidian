#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_ROOT="${PACKAGE_ROOT:-$REPO_ROOT}"
RELEASE_ZIP="${RELEASE_ZIP:-$PACKAGE_ROOT/deskleaf-for-obsidian.zip}"

REQUIRED_FILES=(
  "main.js"
  "styles.css"
  "manifest.json"
  "deskleaf-calendar-sync"
  "install.sh"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$PACKAGE_ROOT/$file" ]]; then
    echo "Missing release file: $PACKAGE_ROOT/$file" >&2
    exit 1
  fi
done

if [[ ! -x "$PACKAGE_ROOT/deskleaf-calendar-sync" ]]; then
  echo "deskleaf-calendar-sync must be an executable release binary" >&2
  exit 1
fi

if [[ ! -x "$PACKAGE_ROOT/install.sh" ]]; then
  chmod +x "$PACKAGE_ROOT/install.sh"
fi

rm -f "$RELEASE_ZIP"
(
  cd "$PACKAGE_ROOT"
  zip -X -q "$RELEASE_ZIP" "${REQUIRED_FILES[@]}"
)

echo "Created $RELEASE_ZIP"
