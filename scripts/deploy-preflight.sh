#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SWIFT_DIR="${REPO_DIR}/swift"
DEST="${DESKLEAF_DEPLOY_DEST:-/Users/nils/Library/Mobile Documents/iCloud~md~obsidian/Documents/Connections/.obsidian/plugins/deskleaf-for-obsidian}"

export CLANG_MODULE_CACHE_PATH="${SWIFT_DIR}/.build/clang-module-cache"
export SWIFTPM_MODULECACHE_PATH="${SWIFT_DIR}/.build/swiftpm-module-cache"

mkdir -p "$CLANG_MODULE_CACHE_PATH" "$SWIFTPM_MODULECACHE_PATH"

require_command() {
    local command_name="$1"
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: ${command_name}" >&2
        return 1
    fi
}

require_command npm
require_command node
require_command swift
require_command swiftc
require_command xcrun

if [[ ! -d "$SWIFT_DIR" ]]; then
    echo "Missing Swift package directory: ${SWIFT_DIR}" >&2
    exit 1
fi

mkdir -p "$DEST"
if [[ ! -w "$DEST" ]]; then
    echo "Deploy destination is not writable: ${DEST}" >&2
    exit 1
fi

echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Swift: $(swift --version | head -n 1)"
echo "SDK: $(xcrun --show-sdk-path)"
echo "Deploy destination: ${DEST}"

(
    cd "$SWIFT_DIR"
    swift package describe >/dev/null
)

echo "Deploy preflight passed"
