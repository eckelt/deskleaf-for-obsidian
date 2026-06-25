#!/usr/bin/env bash
# Deskleaf Issue Watch — lokaler Polling-Daemon für die Entwicklungspipeline.
# Vertrag: docs/adr/0001-autonomous-issue-pipeline.md
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${REPO_DIR}/scripts/.issue-watch-state.json"
AGENTS_DIR="${REPO_DIR}/.github/agents"
WORKTREE_BASE="${HOME}/.cache/deskleaf-worktrees"   # bewusst außerhalb von iCloud

# Bot-Marker: jeder maschinelle Kommentar beginnt damit. Der Loop triggert nur
# auf Kommentare, die NICHT damit beginnen (= menschliche Eingabe).
BOT="🤖"

# Labels — spiegeln die Stages der State-Maschine.
LABEL_PLANNING="status:planning"
LABEL_AWAITING="status:awaiting-author"
LABEL_READY_BUILD="status:ready-for-build"
LABEL_ACCEPT="status:ready-for-acceptance"
LABEL_EPIC="status:epic"
LABEL_WONTFIX="wontfix"

MAX_BUILD_ATTEMPTS=3        # Build→Review→Validate-Runden pro Issue, dann Eskalation
AC_ESCALATE_THRESHOLD=2     # gleiches AC X-mal rot → zurück zum Planner
POLL_INTERVAL=60

# Permission-Modell der Agenten-Aufrufe. Der Daemon läuft unbeaufsichtigt — die
# Agenten brauchen gh/git/npm + Datei-Schreibrechte ohne interaktive Rückfrage.
# Default: per-Tool-Allowlist aus .claude/settings.json (auch in jeden Worktree
# kopiert) + acceptEdits für Datei-Edits. Nicht gelistete Bash-Kommandos werden
# im Headless-Modus still abgelehnt (kein Hängen). Bricht ein Agent daran, das
# fehlende Kommando in .claude/settings.json ergänzen.
# Grober Fallback (alles erlaubt): CLAUDE_FLAGS=(--dangerously-skip-permissions)
CLAUDE_FLAGS=(--permission-mode acceptEdits)

# ── State-Datei ────────────────────────────────────────────────────────────────

init_state_file() {
    [[ -f "$STATE_FILE" ]] || echo '{"lastCheck":"1970-01-01T00:00:00Z","issues":{}}' > "$STATE_FILE"
}

get_field() {
    local number="$1" field="$2" default="${3:-}"
    jq -r --arg n "$number" --arg f "$field" --arg d "$default" \
        '.issues[$n][$f] // $d' "$STATE_FILE"
}

set_field() {
    local number="$1" field="$2" value="$3"
    local tmp; tmp=$(mktemp)
    jq --arg n "$number" --arg f "$field" --arg v "$value" \
        '.issues[$n][$f] = $v' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
}

set_field_num() {
    local number="$1" field="$2" value="$3"
    local tmp; tmp=$(mktemp)
    jq --arg n "$number" --arg f "$field" --argjson v "$value" \
        '.issues[$n][$f] = $v' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
}

issue_known() {
    local number="$1"
    [[ -n "$(jq -r --arg n "$number" '.issues[$n] // empty' "$STATE_FILE")" ]]
}

init_issue() {
    local number="$1"
    local tmp; tmp=$(mktemp)
    jq --arg n "$number" \
        '.issues[$n] = {"stage":"new","specPath":"","prNumber":"","lastHumanCommentAt":"1970-01-01T00:00:00Z","fixForwardNote":"","lastFailedAc":"","acFailStreak":0}' \
        "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
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

add_label()    { gh issue edit "$1" --add-label "$2"    --repo "$(get_repo)" 2>/dev/null || true; }
remove_label() { gh issue edit "$1" --remove-label "$2" --repo "$(get_repo)" 2>/dev/null || true; }

# Postet einen Kommentar. Erzwingt den Bot-Marker, damit der Loop sich nicht
# durch die eigenen Kommentare selbst triggert.
post_comment() {
    local number="$1" body="$2"
    [[ "$body" == "$BOT"* ]] || body="${BOT} ${body}"
    gh issue comment "$number" --body "$body" --repo "$(get_repo)" >/dev/null
}

# Gibt den letzten Kommentar als "createdAt<TAB>body" zurück (leer, falls keiner).
latest_comment() {
    local number="$1"
    gh issue view "$number" --repo "$(get_repo)" --json comments \
        --jq '.comments[-1] // empty | "\(.createdAt)\t\(.body)"' 2>/dev/null || echo ""
}

# Erfolg, wenn es eine neue MENSCHLICHE Eingabe gibt (letzter Kommentar ohne
# Bot-Marker und neuer als die zuletzt verarbeitete). Setzt bei Treffer
# HUMAN_REPLY (Kommentartext) und aktualisiert lastHumanCommentAt.
HUMAN_REPLY=""
human_replied() {
    local number="$1"
    local last; last=$(latest_comment "$number")
    [[ -n "$last" ]] || return 1

    local created body
    created="${last%%$'\t'*}"
    body="${last#*$'\t'}"

    [[ "$body" == "$BOT"* ]] && return 1   # Bot-Kommentar → ignorieren

    local seen; seen=$(get_field "$number" "lastHumanCommentAt" "1970-01-01T00:00:00Z")
    [[ "$created" > "$seen" ]] || return 1

    set_field "$number" "lastHumanCommentAt" "$created"
    HUMAN_REPLY="$body"
    return 0
}

# ── Claude-Aufruf ──────────────────────────────────────────────────────────────

# Baut Prompt aus: Agent-Datei + Kontext + Instruktion. Ergebnis in CLAUDE_PROMPT.
build_prompt() {
    local agent_file="$1" context="$2" instruction="$3"
    CLAUDE_PROMPT="$(cat "$agent_file")

---

${context}

---

${instruction}"
}

run_claude()    { cd "$REPO_DIR" && claude "${CLAUDE_FLAGS[@]}" -p "$1"; }
run_claude_in() { cd "$1"        && claude "${CLAUDE_FLAGS[@]}" -p "$2"; }

# ── Planning-Spur (parallel, blockiert nur das einzelne Issue) ──────────────────

# Führt den Planner aus und verarbeitet seine eine Ausgabezeile.
plan() {
    local number="$1" title="$2" body="$3" human="$4"
    echo "  -> Planner für Issue #${number}..."

    add_label "$number" "$LABEL_PLANNING"

    local context="Issue #${number}: ${title}

${body}

Repository: ${REPO_DIR}"
    [[ -n "$human" ]]  && context="${context}

Latest human reply:
${human}"
    local ff; ff=$(get_field "$number" "fixForwardNote" "")
    [[ -n "$ff" ]] && context="${context}

Note from the pipeline (a fix-forward clarification or an escalation — address it):
${ff}"

    build_prompt "${AGENTS_DIR}/feature-planner.md" "$context" \
        'Follow your output contract. Respond with exactly one line:
"SKIP: <reason>" | "QUESTIONS" | "SPLIT: #<n> #<n> ..." | "SPEC: specs/features/<file>.md" | "BUILD: <note>"'

    local result; result=$(run_claude "$CLAUDE_PROMPT")
    local line; line=$(echo "$result" | grep -E '^(SKIP|QUESTIONS|SPLIT|SPEC|BUILD)' | head -1 || true)

    set_field "$number" "fixForwardNote" ""

    case "$line" in
        SKIP:*)
            remove_label "$number" "$LABEL_PLANNING"
            add_label "$number" "$LABEL_WONTFIX"
            set_field "$number" "stage" "skipped"
            post_comment "$number" "**Feature Planner**: Kommt nicht in die Pipeline. Grund: ${line#SKIP: }" ;;
        QUESTIONS)
            # Der Planner hat seine Fragen bereits als 🤖-Kommentar gepostet.
            remove_label "$number" "$LABEL_PLANNING"
            add_label "$number" "$LABEL_AWAITING"
            set_field "$number" "stage" "awaiting-author" ;;
        SPLIT:*)
            # Der Planner hat die Kind-Issues bereits via gh angelegt.
            remove_label "$number" "$LABEL_PLANNING"
            add_label "$number" "$LABEL_EPIC"
            set_field "$number" "stage" "epic"
            post_comment "$number" "**Feature Planner**: In Sub-Issues zerlegt (${line#SPLIT: }). Dieses Epic schließt du, wenn alle Kinder durch sind." ;;
        SPEC:*)
            remove_label "$number" "$LABEL_PLANNING"
            remove_label "$number" "$LABEL_AWAITING"
            add_label "$number" "$LABEL_READY_BUILD"
            set_field "$number" "specPath" "${line#SPEC: }"
            set_field "$number" "stage" "spec-ready"
            post_comment "$number" "**Feature Planner**: Spec bereit: \`${line#SPEC: }\`. Build startet sequentiell." ;;
        BUILD:*)
            # Fix-forward: reine Umsetzungssache, Spec bleibt. Neuer Build-Durchlauf.
            remove_label "$number" "$LABEL_PLANNING"
            add_label "$number" "$LABEL_READY_BUILD"
            set_field "$number" "prNumber" ""
            set_field "$number" "fixForwardNote" "${line#BUILD: }"
            set_field "$number" "stage" "spec-ready"
            post_comment "$number" "**Feature Planner**: Fix-forward an den Builder: ${line#BUILD: }" ;;
        *)
            echo "  [#${number}] Planner ohne gültige Zeile: ${result:0:200}" ;;
    esac
}

# Entscheidet pro Poll, ob das Issue in der Planning-Spur etwas zu tun hat.
dispatch_planning() {
    local number="$1" title="$2" body="$3"
    local stage; stage=$(get_field "$number" "stage" "new")

    case "$stage" in
        new)
            plan "$number" "$title" "$body" "" ;;
        planning)
            plan "$number" "$title" "$body" "" ;;
        awaiting-author)
            if human_replied "$number"; then
                plan "$number" "$title" "$body" "$HUMAN_REPLY"
            fi ;;
        ready-for-acceptance)
            # Gemergt, wartet auf Abnahme. Schließen = abgenommen (fällt aus dem
            # Poll). Menschlicher Kommentar = fix-forward → zurück zum Planner.
            if human_replied "$number"; then
                set_field "$number" "fixForwardNote" "$HUMAN_REPLY"
                set_field "$number" "stage" "planning"
                remove_label "$number" "$LABEL_ACCEPT"
                add_label "$number" "$LABEL_PLANNING"
                echo "  [#${number}] Fix-forward durch menschlichen Kommentar."
            fi ;;
    esac
}

# ── Build-Spur (streng sequentiell, ein Worktree zur Zeit) ──────────────────────

build_step() {
    local wt="$1" number="$2" spec="$3" branch="$4" pr="$5" feedback="$6" repo="$7"
    local instr="You are in worktree ${wt} on branch ${branch}. Implement the spec with TDD.
Run npm test and npm run build; both must pass.
Then commit, push: git push -u origin ${branch}, and open the PR:
gh pr create --base main --head ${branch} --fill --repo ${repo}"
    [[ -n "$pr" ]]       && instr="${instr}
A PR (#${pr}) already exists for this branch — push your fixes to it and reuse that number."
    [[ -n "$feedback" ]] && instr="${instr}

Address this feedback from the previous round:
${feedback}"
    instr="${instr}

Respond with exactly one line: \"PR: <number>\" or \"FAIL: <reason>\"."

    build_prompt "${AGENTS_DIR}/feature-builder.md" "Feature spec: ${spec}" "$instr"
    run_claude_in "$wt" "$CLAUDE_PROMPT"
}

review_step() {
    local pr="$1" repo="$2"
    local diff; diff=$(gh pr diff "$pr" --repo "$repo" 2>/dev/null || echo "(PR-Diff nicht verfügbar)")
    build_prompt "${AGENTS_DIR}/feature-reviewer.md" "PR #${pr} diff:

${diff}" \
        'Respond with exactly one line: "PASS" or "FAIL: <violated standard and offending line>".'
    run_claude "$CLAUDE_PROMPT"
}

validate_step() {
    local wt="$1" spec="$2"
    build_prompt "${AGENTS_DIR}/feature-validator.md" "Feature spec: ${spec}
Repository: ${wt}" \
        'Run npm test. Verify each AC is covered by a test. Respond with exactly one line: "PASS" or "FAIL: AC-<n> <gap>".'
    run_claude_in "$wt" "$CLAUDE_PROMPT"
}

# Räumt Worktree und lokalen Branch weg.
cleanup_worktree() {
    local wt="$1" branch="$2"
    git -C "$REPO_DIR" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
    git -C "$REPO_DIR" branch -D "$branch" 2>/dev/null || true
    git -C "$REPO_DIR" worktree prune 2>/dev/null || true
}

# Schickt das Issue zur (Neu-)Planung zurück und räumt den Worktree weg.
back_to_planner() {
    local number="$1" wt="$2" branch="$3" reason="$4"
    cleanup_worktree "$wt" "$branch"
    set_field "$number" "stage" "planning"
    set_field "$number" "prNumber" ""
    set_field "$number" "fixForwardNote" "$reason"
    remove_label "$number" "$LABEL_READY_BUILD"
    add_label "$number" "$LABEL_PLANNING"
    post_comment "$number" "**Pipeline**: Zurück zum Planner. Grund: ${reason}"
}

# Fährt eine Issue komplett durch Build → Review → Validate → Merge.
build_lane() {
    local number="$1"
    local repo; repo=$(get_repo)
    local spec; spec=$(get_field "$number" "specPath" "")

    if [[ -z "$spec" || ! -f "${REPO_DIR}/${spec}" ]]; then
        back_to_planner "$number" "" "" "Spec nicht gefunden (\`${spec:-leer}\`)."
        return 0
    fi

    local branch="feature/issue-${number}"
    local wt="${WORKTREE_BASE}/issue-${number}"

    echo "  -> Build-Spur für Issue #${number} (Branch ${branch})..."
    mkdir -p "$WORKTREE_BASE"
    cleanup_worktree "$wt" "$branch"
    git -C "$REPO_DIR" fetch origin main --quiet
    git -C "$REPO_DIR" worktree add -b "$branch" "$wt" origin/main --quiet
    ln -sfn "${REPO_DIR}/node_modules" "${wt}/node_modules"   # Installations-Overhead sparen
    mkdir -p "${wt}/.claude"   # permission-Allowlist mit in den Worktree geben
    cp "${REPO_DIR}/.claude/settings.json" "${wt}/.claude/settings.json" 2>/dev/null || true

    # Fix-forward-Notiz des Planners als erstes Builder-Feedback übernehmen.
    local feedback; feedback=$(get_field "$number" "fixForwardNote" "")
    set_field "$number" "fixForwardNote" ""
    local pr="" attempt=0
    while (( attempt < MAX_BUILD_ATTEMPTS )); do
        attempt=$(( attempt + 1 ))
        echo "     Versuch ${attempt}/${MAX_BUILD_ATTEMPTS}"

        local b; b=$(build_step "$wt" "$number" "$spec" "$branch" "$pr" "$feedback" "$repo")
        if echo "$b" | grep -q "^PR:"; then
            pr=$(echo "$b" | sed 's/^PR: *//')
            set_field "$number" "prNumber" "$pr"
        else
            back_to_planner "$number" "$wt" "$branch" "Builder: $(echo "$b" | sed 's/^FAIL: *//')"
            return 0
        fi

        local rev; rev=$(review_step "$pr" "$repo")
        if ! echo "$rev" | grep -q "^PASS"; then
            feedback="Code-Review: $(echo "$rev" | sed 's/^FAIL: *//')"
            post_comment "$number" "**Code Reviewer**: Nicht bestanden — ${feedback#Code-Review: } (Versuch ${attempt})."
            continue
        fi

        local val; val=$(validate_step "$wt" "$spec")
        if echo "$val" | grep -q "^PASS"; then
            if gh pr merge "$pr" --squash --delete-branch --repo "$repo" >/dev/null 2>&1; then
                cleanup_worktree "$wt" "$branch"
                remove_label "$number" "$LABEL_READY_BUILD"
                add_label "$number" "$LABEL_ACCEPT"
                set_field "$number" "stage" "ready-for-acceptance"
                post_comment "$number" "**Pipeline**: PR #${pr} reviewed, validiert und gemergt.

**Wartet auf deine Abnahme.** Schließe das Issue, wenn alles passt — oder kommentiere eine Klarstellung für einen Fix-forward."
                return 0
            fi
            back_to_planner "$number" "$wt" "$branch" "Merge von PR #${pr} fehlgeschlagen."
            return 0
        fi

        # Validate rot → AC-Eskalation prüfen.
        local ac; ac=$(echo "$val" | sed -n 's/^FAIL: *\(AC-[0-9]*\).*/\1/p')
        local last; last=$(get_field "$number" "lastFailedAc" "")
        local streak; streak=$(get_field "$number" "acFailStreak" "0")
        if [[ -n "$ac" && "$ac" == "$last" ]]; then
            streak=$(( streak + 1 ))
        else
            streak=1
        fi
        set_field "$number" "lastFailedAc" "$ac"
        set_field_num "$number" "acFailStreak" "$streak"

        if (( streak >= AC_ESCALATE_THRESHOLD )); then
            set_field "$number" "acFailStreak" "0"
            back_to_planner "$number" "$wt" "$branch" \
                "Validator scheitert wiederholt an ${ac:-einem AC} — Spec vermutlich unklar."
            return 0
        fi

        feedback="Validator: $(echo "$val" | sed 's/^FAIL: *//')"
        post_comment "$number" "**Validator**: Nicht bestanden — ${feedback#Validator: } (Versuch ${attempt})."
    done

    back_to_planner "$number" "$wt" "$branch" "Build nach ${MAX_BUILD_ATTEMPTS} Versuchen nicht grün."
}

# ── Poll ────────────────────────────────────────────────────────────────────────

poll() {
    local repo; repo=$(get_repo)
    local issues_json
    issues_json=$(gh issue list --repo "$repo" --json number,title,body --state open --limit 50)

    # Planning-Spur: alle berechtigten Issues parallel (jedes blockiert nur sich).
    local issue number title body
    while IFS= read -r issue; do
        number=$(echo "$issue" | jq -r '.number')
        title=$(echo "$issue"  | jq -r '.title')
        body=$(echo "$issue"   | jq -r '.body // ""')
        issue_known "$number" || init_issue "$number"
        dispatch_planning "$number" "$title" "$body" \
            || echo "  [#${number}] Planning-Dispatch fehlgeschlagen, weiter."
    done < <(echo "$issues_json" | jq -c '.[]')

    # Build-Spur: streng sequentiell — höchstens ein Issue pro Poll.
    while IFS= read -r number; do
        if [[ "$(get_field "$number" "stage" "")" == "spec-ready" ]]; then
            build_lane "$number" || echo "  [#${number}] Build-Spur fehlgeschlagen, weiter."
            break
        fi
    done < <(echo "$issues_json" | jq -r '.[].number')

    update_last_check
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    init_state_file
    echo "Deskleaf Issue Watch gestartet"
    echo "   Repo:      $(get_repo)"
    echo "   State:     ${STATE_FILE}"
    echo "   Worktrees: ${WORKTREE_BASE}"
    echo "   Interval:  ${POLL_INTERVAL}s · Strg+C zum Beenden."
    echo ""

    while true; do
        echo "[$(date +%H:%M:%S)] Poll..."
        poll || echo "[WARN] Poll fehlgeschlagen, weiter im ${POLL_INTERVAL}s-Takt."
        echo "[$(date +%H:%M:%S)] Nächste Prüfung in ${POLL_INTERVAL}s."
        sleep "$POLL_INTERVAL"
    done
}

main
