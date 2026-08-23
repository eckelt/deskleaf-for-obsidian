#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SWIFT_DIR="${REPO_DIR}/swift"

# deploy.sh resolves the destination from the vault and manifest id and passes it
# in. Duplicating the path here is what let the two drift apart before.
DEST="${DESKLEAF_DEPLOY_DEST:-}"

require_command() {
    local command_name="$1"
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: ${command_name}" >&2
        return 1
    fi
}

require_command npm
require_command node

echo "Node: $(node --version)"
echo "npm: $(npm --version)"

# The EventKit backend is macOS-only and unnecessary when CalDAV is configured.
# Its toolchain is therefore checked only when it is actually present — a deploy
# must not fail on a machine that will never build it.
if command -v swift >/dev/null 2>&1; then
    require_command swiftc
    require_command xcrun

    if [[ ! -d "$SWIFT_DIR" ]]; then
        echo "Missing Swift package directory: ${SWIFT_DIR}" >&2
        exit 1
    fi

    export CLANG_MODULE_CACHE_PATH="${SWIFT_DIR}/.build/clang-module-cache"
    export SWIFTPM_MODULECACHE_PATH="${SWIFT_DIR}/.build/swiftpm-module-cache"
    mkdir -p "$CLANG_MODULE_CACHE_PATH" "$SWIFTPM_MODULECACHE_PATH"

    echo "Swift: $(swift --version | head -n 1)"
    echo "SDK: $(xcrun --show-sdk-path)"

    (
        cd "$SWIFT_DIR"
        swift package describe >/dev/null
    )
else
    echo "Swift: not installed — skipping the EventKit helper (CalDAV backend is used)"
fi

if [[ -n "$DEST" ]]; then
    mkdir -p "$DEST"
    if [[ ! -w "$DEST" ]]; then
        echo "Deploy destination is not writable: ${DEST}" >&2
        exit 1
    fi
    echo "Deploy destination: ${DEST}"
fi

echo "Deploy preflight passed"
