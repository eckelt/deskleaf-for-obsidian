#!/usr/bin/env bash
# Deskleaf Issue Watch — lokaler Polling-Daemon für die Entwicklungspipeline
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${REPO_DIR}/scripts/.issue-watch-state.json"
AGENTS_DIR="${REPO_DIR}/.github/agents"

LABEL_PLANNER="agent:planner"
LABEL_BUILDER="agent:builder"
LABEL_PLANNING="status:planning"
LABEL_READY_BUILD="status:ready-for-build"
LABEL_QA="status:qa"
LABEL_READY_ACCEPT="status:ready-for-acceptance"
LABEL_WONTFIX="wontfix"

MAX_LOOPS=5
POLL_INTERVAL=60

# ── State-Datei ────────────────────────────────────────────────────────────────

init_state_file() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo '{"lastCheck":"1970-01-01T00:00:00Z","issues":{}}' > "$STATE_FILE"
    fi
}

get_issue_field() {
    local number="$1" field="$2" default="${3:-}"
    jq -r --arg n "$number" --arg f "$field" --arg d "$default" \
        '.issues[$n][$f] // $d' "$STATE_FILE"
}

set_issue_field_str() {
    local number="$1" field="$2" value="$3"
    local tmp; tmp=$(mktemp)
    jq --arg n "$number" --arg f "$field" --arg v "$value" \
        '.issues[$n][$f] = $v' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
}

set_issue_field_json() {
    local number="$1" field="$2" value="$3"
    local tmp; tmp=$(mktemp)
    jq --arg n "$number" --arg f "$field" --argjson v "$value" \
        '.issues[$n][$f] = $v' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
}

init_issue() {
    local number="$1" updated_at="$2"
    local tmp; tmp=$(mktemp)
    jq --arg n "$number" --arg u "$updated_at" \
        '.issues[$n] = {"lastUpdatedAt":$u,"stage":"new","loopCount":0,"specPath":null,"prNumber":null,"awaitingHuman":false}' \
        "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
}

increment_loop() {
    local number="$1"
    local count; count=$(get_issue_field "$number" "loopCount" "0")
    local new_count=$(( count + 1 ))
    local tmp; tmp=$(mktemp)
    jq --arg n "$number" --argjson c "$new_count" \
        '.issues[$n].loopCount = $c' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
    echo "$new_count"
}

update_last_check() {
    local tmp; tmp=$(mktemp)
    jq --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.lastCheck = $t' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
}

# ── GitHub-Helfer ──────────────────────────────────────────────────────────────

get_repo() {
    git -C "$REPO_DIR" remote get-url origin \
        | sed 's/.*[:/]\([^/:]*\/[^/:]*\)\.git$/\1/'
}

add_label() {
    local number="$1" label="$2"
    gh issue edit "$number" --add-label "$label" --repo "$(get_repo)" 2>/dev/null || true
}

remove_label() {
    local number="$1" label="$2"
    gh issue edit "$number" --remove-label "$label" --repo "$(get_repo)" 2>/dev/null || true
}

post_comment() {
    local number="$1" body="$2"
    gh issue comment "$number" --body "$body" --repo "$(get_repo)"
}

get_last_comment() {
    local number="$1"
    gh issue view "$number" --repo "$(get_repo)" --json comments \
        --jq '.comments[-1].body // ""' 2>/dev/null || echo ""
}

# ── Claude-Aufruf ──────────────────────────────────────────────────────────────

# Builds a prompt from: agent file + separator + context + separator + instruction.
# Stores result in $CLAUDE_PROMPT (avoids nested heredoc/subshell quoting issues).
build_prompt() {
    local agent_file="$1" context="$2" instruction="$3"
    local agent_text; agent_text=$(cat "$agent_file")
    CLAUDE_PROMPT="${agent_text}

---

${context}

---

${instruction}"
}

run_claude() {
    cd "$REPO_DIR" && claude -p "$1"
}

# ── Pipeline-Stufen ────────────────────────────────────────────────────────────

assess() {
    local number="$1" title="$2" labels="$3" body="$4"
    echo "  -> Bewerte Issue #${number}..."

    local context="Issue #${number}: ${title}
Labels: ${labels}

${body}"

    build_prompt "${AGENTS_DIR}/feature-assessor.md" \
        "$context" \
        'Respond with exactly one line: either "PROCESS" or "SKIP: <reason>".'

    local result; result=$(run_claude "$CLAUDE_PROMPT")

    if echo "$result" | grep -q "^PROCESS"; then
        add_label "$number" "$LABEL_PLANNER"
        set_issue_field_str "$number" "stage" "planning"
        post_comment "$number" "🤖 **Issue Assessor**: Dieses Issue kommt in die Pipeline."
        echo "PROCESS"
    else
        local reason; reason=$(echo "$result" | sed 's/^SKIP: //')
        add_label "$number" "$LABEL_WONTFIX"
        set_issue_field_str "$number" "stage" "skipped"
        post_comment "$number" "🤖 **Issue Assessor**: Dieses Issue wird nicht automatisch bearbeitet.

Grund: ${reason}"
        echo "SKIP"
    fi
}

plan() {
    local number="$1" title="$2" body="$3"
    echo "  -> Plane Feature für Issue #${number}..."

    add_label "$number" "$LABEL_PLANNING"

    local context="Issue #${number}: ${title}

${body}

Repository: ${REPO_DIR}"

    build_prompt "${AGENTS_DIR}/feature-planner.md" \
        "$context" \
        'Create the feature spec in specs/features/ with a kebab-case filename. Respond with exactly one line: "SPEC: specs/features/<filename>.md"'

    local result; result=$(run_claude "$CLAUDE_PROMPT")

    local spec_path; spec_path=$(echo "$result" | grep "^SPEC:" | sed 's/^SPEC: //' || true)

    if [[ -n "$spec_path" ]]; then
        set_issue_field_str "$number" "specPath" "$spec_path"
        set_issue_field_str "$number" "stage" "ready-for-build"
        remove_label "$number" "$LABEL_PLANNING"
        add_label "$number" "$LABEL_READY_BUILD"
        post_comment "$number" "🤖 **Feature Planner**: Spec erstellt: \`${spec_path}\`

Implementierung startet beim nächsten Zyklus."
        echo "DONE"
    else
        post_comment "$number" "🤖 **Feature Planner**: Planung läuft noch — nächste Überprüfung in ${POLL_INTERVAL}s."
        echo "PENDING"
    fi
}

build() {
    local number="$1" spec_path="$2"
    echo "  -> Implementiere Feature für Issue #${number}..."

    local repo; repo=$(get_repo)
    local context="Feature spec: ${spec_path}
Repository: ${REPO_DIR}"

    build_prompt "${AGENTS_DIR}/feature-builder.md" \
        "$context" \
        "Implement the feature. Run npm test and npm run build. If all checks pass, open a PR with: gh pr create --repo ${repo}
Respond with exactly one line: \"PR: <pr-number>\" on success, or \"FAIL: <reason>\" on failure."

    local result; result=$(run_claude "$CLAUDE_PROMPT")

    if echo "$result" | grep -q "^PR:"; then
        local pr_number; pr_number=$(echo "$result" | sed 's/^PR: //')
        set_issue_field_str "$number" "prNumber" "$pr_number"
        set_issue_field_str "$number" "stage" "reviewing"
        remove_label "$number" "$LABEL_READY_BUILD"
        add_label "$number" "$LABEL_BUILDER"
        post_comment "$number" "🤖 **Feature Builder**: PR #${pr_number} erstellt. Code-Review startet beim nächsten Zyklus."
        echo "PR:${pr_number}"
    else
        local reason; reason=$(echo "$result" | sed 's/^FAIL: //' || echo "$result")
        post_comment "$number" "🤖 **Feature Builder**: Build fehlgeschlagen.

Grund: ${reason}"
        echo "FAIL"
    fi
}

review() {
    local number="$1" pr_number="$2"
    echo "  -> Code Review für PR #${pr_number} (Issue #${number})..."

    local pr_diff
    pr_diff=$(gh pr diff "$pr_number" --repo "$(get_repo)" 2>/dev/null || echo "(PR-Diff nicht verfügbar)")

    local context="PR #${pr_number} diff:

${pr_diff}"

    build_prompt "${AGENTS_DIR}/feature-reviewer.md" \
        "$context" \
        'Respond with exactly one line: "PASS" or "FAIL: <specific reason referencing the violated standard and the offending line>".'

    local result; result=$(run_claude "$CLAUDE_PROMPT")

    if echo "$result" | grep -q "^PASS"; then
        set_issue_field_str "$number" "stage" "qa"
        remove_label "$number" "$LABEL_BUILDER"
        add_label "$number" "$LABEL_QA"
        post_comment "$number" "🤖 **Code Reviewer**: Review bestanden. QA startet beim nächsten Zyklus."
        echo "PASS"
    else
        local reason; reason=$(echo "$result" | sed 's/^FAIL: //' || echo "$result")
        set_issue_field_str "$number" "stage" "ready-for-build"
        remove_label "$number" "$LABEL_BUILDER"
        add_label "$number" "$LABEL_READY_BUILD"
        post_comment "$number" "🤖 **Code Reviewer**: Review nicht bestanden.

Problem: ${reason}

Implementierung wird wiederholt."
        echo "FAIL"
    fi
}

run_qa() {
    local number="$1" spec_path="$2"
    echo "  -> QA-Prüfung für Issue #${number}..."

    local context="Feature spec: ${spec_path}
Repository: ${REPO_DIR}"

    build_prompt "${AGENTS_DIR}/feature-qa.md" \
        "$context" \
        'Run npm test. Verify each AC in the spec is covered by a test. Respond with exactly one line: "PASS" or "FAIL: AC-<number> <description of the coverage gap>".'

    local result; result=$(run_claude "$CLAUDE_PROMPT")

    if echo "$result" | grep -q "^PASS"; then
        set_issue_field_str "$number" "stage" "done"
        remove_label "$number" "$LABEL_QA"
        add_label "$number" "$LABEL_READY_ACCEPT"
        post_comment "$number" "🤖 **QA Agent**: Alle Acceptance Criteria erfüllt.

**Dieses Feature wartet auf deine finale Abnahme.**
Bitte das Issue schliessen oder mit einem Kommentar bestaetigen."
        echo "PASS"
    else
        local reason; reason=$(echo "$result" | sed 's/^FAIL: //' || echo "$result")
        set_issue_field_str "$number" "stage" "planning"
        remove_label "$number" "$LABEL_QA"
        add_label "$number" "$LABEL_PLANNER"
        post_comment "$number" "🤖 **QA Agent**: QA nicht bestanden.

Luecke: ${reason}

Das Feature geht zurueck in die Planung."
        echo "FAIL"
    fi
}

# ── Loop-Limit ─────────────────────────────────────────────────────────────────

check_loop_limit() {
    local number="$1"
    local count; count=$(get_issue_field "$number" "loopCount" "0")

    if (( count > 0 && count % MAX_LOOPS == 0 )); then
        local awaiting; awaiting=$(get_issue_field "$number" "awaitingHuman" "false")
        if [[ "$awaiting" == "false" ]]; then
            set_issue_field_json "$number" "awaitingHuman" "true"
            post_comment "$number" "🤖 **Pipeline**: Issue #${number} hat ${count} Iterationen durchlaufen.

Soll die Pipeline weiterlaufen? Antworte mit **'weiter'** um fortzufahren, oder schliesse das Issue."
        fi
        return 1
    fi
    return 0
}

check_human_reply() {
    local number="$1"
    local awaiting; awaiting=$(get_issue_field "$number" "awaitingHuman" "false")
    [[ "$awaiting" != "true" ]] && return 0

    local last_comment; last_comment=$(get_last_comment "$number")
    if echo "$last_comment" | grep -qi "weiter"; then
        set_issue_field_json "$number" "awaitingHuman" "false"
        # Bump loopCount by 1 so count % MAX_LOOPS != 0 and the trigger doesn't fire again immediately
        increment_loop "$number" > /dev/null
        post_comment "$number" "🤖 **Pipeline**: Verstanden — Pipeline laeuft weiter."
        return 0
    fi

    echo "  [#${number}] Wartet auf menschliche Bestaetigung."
    return 1
}

# ── Dispatch ───────────────────────────────────────────────────────────────────

dispatch() {
    local number="$1" title="$2" labels="$3" body="$4" updated_at="$5"

    check_human_reply "$number" || return 0

    local stage; stage=$(get_issue_field "$number" "stage" "new")
    local spec_path; spec_path=$(get_issue_field "$number" "specPath" "")
    local pr_number; pr_number=$(get_issue_field "$number" "prNumber" "")

    echo "  [#${number}] Stage: ${stage}"

    if [[ "$stage" != "new" && "$stage" != "skipped" && "$stage" != "done" ]]; then
        check_loop_limit "$number" || return 0
        increment_loop "$number" > /dev/null
    fi

    case "$stage" in
        new)             assess "$number" "$title" "$labels" "$body" || echo "  [#${number}] assess fehlgeschlagen" ;;
        planning)        plan "$number" "$title" "$body" || echo "  [#${number}] plan fehlgeschlagen" ;;
        ready-for-build) build "$number" "$spec_path" || echo "  [#${number}] build fehlgeschlagen" ;;
        reviewing)       [[ -n "$pr_number" ]] && { review "$number" "$pr_number" || echo "  [#${number}] review fehlgeschlagen"; } ;;
        qa)              run_qa "$number" "$spec_path" || echo "  [#${number}] qa fehlgeschlagen" ;;
        done|skipped)    echo "  [#${number}] Ueberspringe (${stage})." ;;
    esac

    set_issue_field_str "$number" "lastUpdatedAt" "$updated_at" || true
}

# ── Polling ────────────────────────────────────────────────────────────────────

poll() {
    local repo; repo=$(get_repo)
    local issues_json
    issues_json=$(gh issue list --repo "$repo" \
        --json number,title,labels,updatedAt,body \
        --state open --limit 50)

    local issue number title updated_at body labels_str last_seen existing
    while IFS= read -r issue; do
        number=$(echo "$issue" | jq -r '.number')
        title=$(echo "$issue"  | jq -r '.title')
        updated_at=$(echo "$issue" | jq -r '.updatedAt')
        body=$(echo "$issue"   | jq -r '.body // ""')
        labels_str=$(echo "$issue" | jq -r '[.labels[].name] | join(", ")')

        last_seen=$(get_issue_field "$number" "lastUpdatedAt" "1970-01-01T00:00:00Z")

        if [[ "$updated_at" > "$last_seen" ]]; then
            existing=$(jq -r --arg n "$number" '.issues[$n] // empty' "$STATE_FILE")
            [[ -z "$existing" ]] && init_issue "$number" "$updated_at"
            dispatch "$number" "$title" "$labels_str" "$body" "$updated_at" \
                || echo "  [#${number}] Dispatch fehlgeschlagen, weiter mit nächstem Issue."
        fi
    done < <(echo "$issues_json" | jq -c '.[]')

    update_last_check
}

# ── Main ───────────────────────────────────────────────────────────────────────

main() {
    init_state_file

    local repo; repo=$(get_repo)
    echo "Deskleaf Issue Watch gestartet"
    echo "   Repo:     ${repo}"
    echo "   State:    ${STATE_FILE}"
    echo "   Interval: ${POLL_INTERVAL}s"
    echo "   Strg+C zum Beenden."
    echo ""

    while true; do
        local ts; ts=$(date +%H:%M:%S)
        echo "[${ts}] Poll..."
        poll || echo "[WARN] Poll fehlgeschlagen, weiter im ${POLL_INTERVAL}s-Takt."
        ts=$(date +%H:%M:%S)
        echo "[${ts}] Naechste Pruefung in ${POLL_INTERVAL}s."
        sleep "$POLL_INTERVAL"
    done
}

main
