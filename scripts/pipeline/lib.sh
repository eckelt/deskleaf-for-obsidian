#!/usr/bin/env bash
# Deskleaf Cloud Pipeline — shared library for the GitHub Actions issue pipeline.
# Contract: docs/adr/0002-cloud-issue-pipeline.md
# Callers: scripts/pipeline/planner.sh and scripts/pipeline/build-lane.sh,
# invoked from .github/workflows/issue-pipeline.yml and build-lane.yml.
set -euo pipefail

: "${REPO:?owner/name of the GitHub repository}"
: "${ISSUE_NUMBER:?issue number this run operates on}"

BOT="🤖"
STATE_MARKER="<!-- deskleaf-pipeline-state -->"

LABEL_PLANNING="status:planning"
LABEL_AWAITING="status:awaiting-author"
LABEL_READY_BUILD="status:ready-for-build"
LABEL_ACCEPT="status:ready-for-acceptance"
LABEL_EPIC="status:epic"
LABEL_WONTFIX="wontfix"

MAX_BUILD_ATTEMPTS=6        # build→validate→review rounds per issue, then escalate
AC_ESCALATE_THRESHOLD=2     # same AC failing X times → back to the planner
MAX_PLANNER_RETURNS=2       # circuit breaker: afterwards the issue waits for a human

# Per-stage backend (claude|codex) and optional model. The workflows inject these
# from repository variables; empty model = the backend's default.
PLANNER_BACKEND="${PLANNER_BACKEND:-claude}";     PLANNER_MODEL="${PLANNER_MODEL:-}"
BUILDER_BACKEND="${BUILDER_BACKEND:-codex}";      BUILDER_MODEL="${BUILDER_MODEL:-}"
REVIEWER_BACKEND="${REVIEWER_BACKEND:-claude}";   REVIEWER_MODEL="${REVIEWER_MODEL:-}"
VALIDATOR_BACKEND="${VALIDATOR_BACKEND:-codex}";  VALIDATOR_MODEL="${VALIDATOR_MODEL:-}"

# Codex permissions: write access inside the workspace, network on (gh/push need
# it), never an interactive prompt. The runner itself is disposable.
CODEX_PERM_ARGS=(--sandbox workspace-write \
    -c approval_policy=\"never\" \
    -c sandbox_workspace_write.network_access=true)

# ── Issue state ────────────────────────────────────────────────────────────────
# Per-issue pipeline state lives in a bot comment on the issue itself (marker +
# fenced JSON). This replaces the local .issue-watch-state.json: every workflow
# run is stateless, so the issue is the only durable store. Concurrency per
# issue is serialised by the workflow's concurrency group.

STATE_COMMENT_ID=""
STATE_JSON=""

state_load() {
    # --paginate emits one JSON array per page; --slurp + flatten folds them
    # into a single array so the jq filters below see all comments at once.
    local comments
    comments=$(gh api "repos/${REPO}/issues/${ISSUE_NUMBER}/comments" --paginate --slurp 2>/dev/null \
        | jq 'flatten' 2>/dev/null || echo '[]')
    STATE_COMMENT_ID=$(echo "$comments" | jq -r --arg m "$STATE_MARKER" \
        '[.[] | select(.body | startswith($m))] | last | .id // empty')
    if [[ -n "$STATE_COMMENT_ID" ]]; then
        STATE_JSON=$(echo "$comments" | jq -r --argjson id "$STATE_COMMENT_ID" \
            '.[] | select(.id == $id) | .body' \
            | sed -n '/^```json$/,/^```$/p' | sed '1d;$d')
    fi
    if [[ -z "$STATE_JSON" ]] || ! jq -e . >/dev/null 2>&1 <<<"$STATE_JSON"; then
        STATE_JSON='{"stage":"new","specPath":"","prNumber":"","fixForwardNote":"","lastFailedAc":"","acFailStreak":0,"plannerReturnCount":0,"agentRuns":[]}'
    fi
}

state_save() {
    local body="${STATE_MARKER}
${BOT} <sub>Pipeline state — managed by the cloud pipeline, do not edit.</sub>

\`\`\`json
$(jq . <<<"$STATE_JSON")
\`\`\`"
    if [[ -n "$STATE_COMMENT_ID" ]]; then
        gh api -X PATCH "repos/${REPO}/issues/comments/${STATE_COMMENT_ID}" \
            -f body="$body" >/dev/null
    else
        STATE_COMMENT_ID=$(gh api -X POST "repos/${REPO}/issues/${ISSUE_NUMBER}/comments" \
            -f body="$body" --jq '.id')
    fi
}

state_get() {
    local field="$1" default="${2:-}"
    jq -r --arg f "$field" --arg d "$default" '.[$f] // $d' <<<"$STATE_JSON"
}

state_set() {
    local field="$1" value="$2"
    STATE_JSON=$(jq --arg f "$field" --arg v "$value" '.[$f] = $v' <<<"$STATE_JSON")
    state_save
}

state_set_num() {
    local field="$1" value="$2"
    STATE_JSON=$(jq --arg f "$field" --argjson v "$value" '.[$f] = $v' <<<"$STATE_JSON")
    state_save
}

# Appends a JSON value to an array field, accumulating instead of overwriting
# like state_set/state_set_num do. Defaults a missing/pre-feature field to []
# first, so issues that already ran the pipeline before this field existed
# still end up with a well-formed array.
state_append() {
    local field="$1" json_value="$2"
    STATE_JSON=$(jq --arg f "$field" --argjson v "$json_value" \
        '.[$f] = ((.[$f] // []) + [$v])' <<<"$STATE_JSON")
    state_save
}

# Runs "$@" with its stdout captured into $reply, without the subshell a plain
# x=$(...) command substitution would fork. run_agent mutates the global
# STATE_JSON (via state_append) as a side effect of recording agent-run
# metrics; if it ran inside a subshell, that mutation would be invisible to
# the caller's own STATE_JSON copy, and a later state_set/state_set_num call
# would overwrite the freshly-appended entry with the stale pre-call state.
capture_stdout() {
    local tmp; tmp=$(mktemp)
    "$@" >"$tmp"
    reply=$(cat "$tmp")
    rm -f "$tmp"
}

# ── GitHub helpers ─────────────────────────────────────────────────────────────

add_label()    { gh issue edit "$ISSUE_NUMBER" --add-label "$1"    --repo "$REPO" 2>/dev/null || true; }
remove_label() { gh issue edit "$ISSUE_NUMBER" --remove-label "$1" --repo "$REPO" 2>/dev/null || true; }

# Posts a comment. The workflow token makes it appear as github-actions[bot],
# which is what keeps the issue_comment trigger from firing on our own output;
# the 🤖 prefix stays for visual consistency with the local pipeline.
post_comment() {
    local body="$1"
    [[ "$body" == "$BOT"* ]] || body="${BOT} ${body}"
    gh issue comment "$ISSUE_NUMBER" --body "$body" --repo "$REPO" >/dev/null
}

# Chains to another workflow. workflow_dispatch is exempt from GitHub's
# "GITHUB_TOKEN events don't trigger workflows" rule, so this is the one
# sanctioned way for pipeline stages to hand work to each other.
dispatch_workflow() {
    local workflow="$1"; shift
    gh workflow run "$workflow" --repo "$REPO" "$@" 2>/dev/null \
        || echo "WARN: dispatch of ${workflow} failed" >&2
}

# The build lane is a global-mutex concurrency group, and GitHub keeps at most
# ONE pending run per group (older pending runs get cancelled). So each build
# run re-dispatches the next ready issue itself instead of relying on the queue.
dispatch_next_build() {
    local next
    next=$(gh issue list --repo "$REPO" --state open --label "$LABEL_READY_BUILD" \
            --json number --jq '.[].number' 2>/dev/null \
        | grep -vx "$ISSUE_NUMBER" | sort -n | head -1 || true)
    [[ -n "$next" ]] && dispatch_workflow build-lane.yml -f issue="$next"
    return 0
}

# ── Agent invocation ───────────────────────────────────────────────────────────

# Assembles: agent file + context + instruction. Result in CLAUDE_PROMPT.
build_prompt() {
    local agent_file="$1" context="$2" instruction="$3"
    CLAUDE_PROMPT="$(cat "$agent_file")

---

${context}

---

${instruction}"
}

is_default_model() {
    local model="$1"
    [[ -z "$model" || "$model" == "default" || "$model" == "-" ]]
}

# Codex CLI wants an explicit login; newer versions also honour OPENAI_API_KEY
# directly. Try the login once, tolerate it already being done.
ensure_codex_auth() {
    [[ -n "${OPENAI_API_KEY:-}" ]] || return 0
    codex login status >/dev/null 2>&1 && return 0
    codex login --with-api-key <<<"$OPENAI_API_KEY" >/dev/null 2>&1 || true
}

# Builds one agentRuns entry and appends it to the pipeline state. A missing
# numeric field (older CLI without cost info, a failed turn without usage,
# ...) is recorded as JSON null rather than blocking the run — see ADR/AC4.
record_agent_run() {
    local role="$1" backend="$2" model="$3" attempt="$4"
    local cost="$5" input_tokens="$6" output_tokens="$7" duration_ms="$8"
    local model_field="$model"; is_default_model "$model_field" && model_field="default"
    local entry; entry=$(jq -n \
        --arg role "$role" --arg backend "$backend" --arg model "$model_field" \
        --argjson attempt "$attempt" --argjson costUsd "$cost" \
        --argjson inputTokens "$input_tokens" --argjson outputTokens "$output_tokens" \
        --argjson durationMs "$duration_ms" \
        '{role: $role, backend: $backend, model: $model, attempt: $attempt,
          costUsd: $costUsd, inputTokens: $inputTokens, outputTokens: $outputTokens,
          durationMs: $durationMs}')
    state_append agentRuns "$entry"
}

# Runs one agent in the chosen backend. Stdout = agent answer; callers grep the
# single line-protocol line out of it. Also records cost/token/duration
# metrics for the run into the pipeline state (see ADR, AC3/AC4).
# run_agent <backend> <model> <dir> <prompt> <role> <attempt>
run_agent() {
    local backend="$1" model="$2" dir="$3" prompt="$4" role="$5" attempt="$6"
    local start_ms; start_ms=$(date +%s%3N)
    local verdict="" cost="null" input_tokens="null" output_tokens="null"
    case "$backend" in
        claude)
            # Headless CI on a disposable runner: skip the permission system.
            # Auth comes from ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.
            # --output-format json gives us cost/token metrics; .result carries
            # the exact same verdict text plain -p used to print directly.
            local args=(--dangerously-skip-permissions --output-format json)
            is_default_model "$model" || args+=(--model "$model")
            local raw; raw=$(cd "$dir" && claude "${args[@]}" -p "$prompt")
            verdict=$(jq -r '.result // empty' <<<"$raw")
            cost=$(jq -r '.total_cost_usd // "null"' <<<"$raw")
            input_tokens=$(jq -r '.usage.input_tokens // "null"' <<<"$raw")
            output_tokens=$(jq -r '.usage.output_tokens // "null"' <<<"$raw") ;;
        codex)
            ensure_codex_auth
            # -o still writes ONLY the final answer, unchanged from before.
            # --json additionally streams JSONL turn/usage events on stdout,
            # which we capture separately for metrics — never mixed into the
            # verdict text (that still comes only from the -o file).
            local last; last=$(mktemp)
            local events; events=$(mktemp)
            local args=(exec "${CODEX_PERM_ARGS[@]}" --cd "$dir" --json -o "$last")
            local git_dir; git_dir=$(git -C "$dir" rev-parse --path-format=absolute --git-dir 2>/dev/null || true)
            local git_common_dir; git_common_dir=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
            [[ -n "$git_dir" ]] && args+=(--add-dir "$git_dir")
            [[ -n "$git_common_dir" && "$git_common_dir" != "$git_dir" ]] && args+=(--add-dir "$git_common_dir")
            is_default_model "$model" || args+=(--model "$model")
            codex "${args[@]}" "$prompt" >"$events" 2>/dev/null || true
            verdict=$(cat "$last" 2>/dev/null)
            # codex reports cumulative usage per turn.completed, no cost field
            # at all (OpenAI CLI does not compute one) — costUsd stays null.
            local last_turn; last_turn=$(grep -F '"type":"turn.completed"' "$events" | tail -1) || true
            if [[ -n "$last_turn" ]]; then
                input_tokens=$(jq -r '.usage.input_tokens // "null"' <<<"$last_turn")
                output_tokens=$(jq -r '.usage.output_tokens // "null"' <<<"$last_turn")
            fi
            rm -f "$last" "$events" ;;
        *)
            echo "FAIL: unknown agent backend '${backend}'"
            return 0 ;;
    esac
    local end_ms; end_ms=$(date +%s%3N)
    echo "$verdict"
    record_agent_run "$role" "$backend" "$model" "$attempt" \
        "$cost" "$input_tokens" "$output_tokens" "$(( end_ms - start_ms ))"
}

# Posts a failure note with a link to the Actions run when a pipeline script
# dies unexpectedly — otherwise the issue would just silently stall.
install_failure_trap() {
    trap 'post_comment "**Pipeline**: Workflow-Lauf unerwartet abgebrochen. Details: ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-$REPO}/actions/runs/${GITHUB_RUN_ID:-?}" || true' ERR
}
