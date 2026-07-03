#!/bin/bash
set -euo pipefail

if [[ -f "$PWD/manifest.json" ]]; then
  BUNDLE_DIR="$PWD"
else
  BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

MANIFEST="$BUNDLE_DIR/manifest.json"
PLUGIN_FILES=(
  "main.js"
  "styles.css"
  "manifest.json"
  "deskleaf-calendar-sync"
)

fail() {
  echo "$1" >&2
  exit 1
}

plugin_id_from_manifest() {
  sed -nE 's/^[[:space:]]*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$MANIFEST" | head -n 1
}

validate_bundle() {
  for file in "${PLUGIN_FILES[@]}"; do
    [[ -f "$BUNDLE_DIR/$file" ]] || fail "Missing bundle file: $file"
  done
  [[ -x "$BUNDLE_DIR/deskleaf-calendar-sync" ]] || fail "deskleaf-calendar-sync must be executable"
}

is_vault_root() {
  local candidate="$1"
  [[ -n "$candidate" && -d "$candidate/.obsidian" ]]
}

single_icloud_vault() {
  local icloud_root="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents"
  [[ -d "$icloud_root" ]] || return 1

  local candidates=()
  for vault_config in "$icloud_root"/*/.obsidian "$icloud_root"/*/*/.obsidian; do
    if [[ -d "$vault_config" ]]; then
      candidates+=("$(dirname "$vault_config")")
    fi
  done

  [[ "${#candidates[@]}" -eq 1 ]] || return 1
  printf '%s\n' "${candidates[0]}"
}

ask_for_vault() {
  local entered=""
  echo "Enter Obsidian vault directory:" >&2
  if read -r entered; then
    printf '%s\n' "$entered"
  fi
}

resolve_vault_root() {
  local provided="${1:-}"

  if is_vault_root "$provided"; then
    printf '%s\n' "$provided"
    return 0
  fi

  if is_vault_root "$PWD"; then
    printf '%s\n' "$PWD"
    return 0
  fi

  local inferred=""
  inferred="$(single_icloud_vault || true)"
  if is_vault_root "$inferred"; then
    printf '%s\n' "$inferred"
    return 0
  fi

  local entered=""
  entered="$(ask_for_vault)"
  if is_vault_root "$entered"; then
    printf '%s\n' "$entered"
    return 0
  fi

  fail "Obsidian vault directory is required. Provide a directory containing .obsidian."
}

validate_bundle
PLUGIN_ID="$(plugin_id_from_manifest)"
[[ -n "$PLUGIN_ID" ]] || fail "manifest.json must contain an id"

VAULT_ROOT="$(resolve_vault_root "${1:-}")"
PLUGIN_DIR="$VAULT_ROOT/.obsidian/plugins/$PLUGIN_ID"

mkdir -p "$PLUGIN_DIR"
install -m 0644 "$BUNDLE_DIR/main.js" "$PLUGIN_DIR/main.js"
install -m 0644 "$BUNDLE_DIR/styles.css" "$PLUGIN_DIR/styles.css"
install -m 0644 "$BUNDLE_DIR/manifest.json" "$PLUGIN_DIR/manifest.json"
install -m 0755 "$BUNDLE_DIR/deskleaf-calendar-sync" "$PLUGIN_DIR/deskleaf-calendar-sync"

echo "Installed Deskleaf to $PLUGIN_DIR"
