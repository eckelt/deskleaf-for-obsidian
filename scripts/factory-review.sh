#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${FACTORY_REVIEW_STATE:-${REPO_DIR}/scripts/.factory-review-state.json}"
METRICS_FILE="${FACTORY_REVIEW_METRICS_FILE:-${REPO_DIR}/scripts/.factory-metrics.json}"
PROMPT_FILE="${REPO_DIR}/.github/agents/factory-reviewer.md"
NOW="${FACTORY_REVIEW_NOW:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
FACTORY_REVIEW_BACKEND="${FACTORY_REVIEW_BACKEND:-codex}"
FACTORY_REVIEW_MODEL="${FACTORY_REVIEW_MODEL:-}"

init_state_file() {
    if [[ ! -f "$STATE_FILE" ]]; then
        mkdir -p "$(dirname "$STATE_FILE")"
        printf '{"lastAuditAt":"1970-01-01T00:00:00Z"}\n' > "$STATE_FILE"
    fi
}

last_audit_at() {
    node -e "const fs=require('node:fs'); const state=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(state.lastAuditAt || '1970-01-01T00:00:00Z');" "$STATE_FILE"
}

write_last_audit_at() {
    local timestamp="$1"
    node -e "const fs=require('node:fs'); const path=process.argv[1]; const ts=process.argv[2]; const state=fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {}; state.lastAuditAt=ts; fs.writeFileSync(path, JSON.stringify(state, null, 2) + '\n');" "$STATE_FILE" "$timestamp"
}

merged_pull_request_count() {
    node -e "const fs=require('node:fs'); const metrics=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(metrics.summary.mergedPullRequestCount);" "$METRICS_FILE"
}

is_default_model() {
    local model="$1"
    [[ -z "$model" || "$model" == "default" || "$model" == "-" ]]
}

run_factory_reviewer() {
    local prompt
    prompt="$(cat)"

    if [[ -n "${FACTORY_REVIEW_AGENT_CMD:-}" ]]; then
        printf '%s\n' "$prompt" | sh -c "$FACTORY_REVIEW_AGENT_CMD"
        return
    fi

    case "$FACTORY_REVIEW_BACKEND" in
        claude)
            local claude_args=(--permission-mode acceptEdits)
            is_default_model "$FACTORY_REVIEW_MODEL" || claude_args+=(--model "$FACTORY_REVIEW_MODEL")
            claude "${claude_args[@]}" -p "$prompt" ;;
        codex)
            local codex_args=(exec --sandbox workspace-write -c approval_policy=\"never\" -c sandbox_workspace_write.network_access=true)
            is_default_model "$FACTORY_REVIEW_MODEL" || codex_args+=(--model "$FACTORY_REVIEW_MODEL")
            codex "${codex_args[@]}" "$prompt" ;;
        *)
            echo "Unknown Factory Review backend: ${FACTORY_REVIEW_BACKEND}" >&2
            return 2 ;;
    esac
}

main() {
    init_state_file

    local last
    last="$(last_audit_at)"

    mkdir -p "$(dirname "$METRICS_FILE")"
    node "${REPO_DIR}/scripts/factory-metrics.mjs" "$last" > "$METRICS_FILE"

    if [[ "$(merged_pull_request_count)" == "0" ]]; then
        write_last_audit_at "$NOW"
        echo "No pull requests merged since last Factory Review audit; skipping reviewer."
        return 0
    fi

    {
        cat "$PROMPT_FILE"
        printf '\n---\nFactory Metrics:\n'
        cat "$METRICS_FILE"
    } | (cd "$REPO_DIR" && run_factory_reviewer)

    write_last_audit_at "$NOW"
}

main "$@"
