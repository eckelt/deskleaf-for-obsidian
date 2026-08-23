#!/usr/bin/env bash
# Deskleaf Issue Watch — lokaler Polling-Daemon für die Entwicklungspipeline.
# Vertrag: docs/adr/0001-autonomous-issue-pipeline.md
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${REPO_DIR}/scripts/.issue-watch-state.json"
AGENTS_DIR="${REPO_DIR}/.github/agents"
WORKTREE_BASE="${HOME}/.cache/deskleaf-worktrees"   # bewusst außerhalb von iCloud
# Obsidian-Vault: Ziel des Auto-Deploys nach dem Merge. Ohne diesen Schritt läuft
# die menschliche Abnahme gegen veralteten Vault-Code (siehe CLAUDE.md, Build & deploy).
VAULT_DIR="${DESKLEAF_VAULT:-${HOME}/Library/Mobile Documents/iCloud~md~obsidian/Documents/Connections}/.obsidian/plugins/deskleaf"

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

MAX_BUILD_ATTEMPTS=6        # Build→Review→Validate-Runden pro Issue, dann Eskalation
AC_ESCALATE_THRESHOLD=2     # gleiches AC X-mal rot → zurück zum Planner
MAX_PLANNER_RETURNS=2       # Circuit Breaker: danach wartet das Issue auf Human
POLL_INTERVAL=60

# Pro-Stage-Backend (claude|codex) und optionales Modell. Per Env-Var temporär
# überschreibbar, z.B.:  PLANNER_MODEL=gpt-5.5 bash scripts/issue-watch.sh
# Default: alle Stages auf Codex mit dem Default-Modell des Codex-Backends.
# Leeres Modell = Default des jeweiligen Backends.
PLANNER_BACKEND="${PLANNER_BACKEND:-codex}";      PLANNER_MODEL="${PLANNER_MODEL:-}"
BUILDER_BACKEND="${BUILDER_BACKEND:-codex}";      BUILDER_MODEL="${BUILDER_MODEL:-}"
REVIEWER_BACKEND="${REVIEWER_BACKEND:-codex}";    REVIEWER_MODEL="${REVIEWER_MODEL:-}"
VALIDATOR_BACKEND="${VALIDATOR_BACKEND:-codex}";  VALIDATOR_MODEL="${VALIDATOR_MODEL:-}"

# Codex-Rechte — knapp statt Holzhammer: Schreibzugriff nur im Workspace, Netz
# an (gh/push/merge brauchen es), nie interaktive Rückfrage (Headless kann nicht
# antworten). Für feinere Kontrolle (z.B. rm verbieten, Netz auf api.github.com
# beschränken): Command-Rules in .codex/rules/ bzw. ein Profil via `-p <name>`.
# Grober Fallback: CODEX_PERM_ARGS=(--dangerously-bypass-approvals-and-sandbox)
CODEX_PERM_ARGS=(--sandbox workspace-write \
    -c approval_policy=\"never\" \
    -c sandbox_workspace_write.network_access=true)

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
        '.issues[$n] = {"stage":"new","specPath":"","prNumber":"","lastHumanCommentAt":"1970-01-01T00:00:00Z","fixForwardNote":"","lastFailedAc":"","acFailStreak":0,"plannerReturnCount":0}' \
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

# Gibt den neuesten menschlichen Kommentar als "createdAt<TAB>body" zurück
# (leer, falls keiner). Bot-Kommentare können menschliche Kommentare überholen;
# deshalb darf nicht nur der allerletzte Kommentar betrachtet werden.
latest_human_comment() {
    local number="$1"
    # gh's --jq nimmt nur einen Filter-String und kann keine jq-Variablen binden;
    # darum gh nur das rohe JSON ausgeben lassen und mit echtem jq (--arg) filtern.
    gh issue view "$number" --repo "$(get_repo)" --json comments 2>/dev/null \
        | jq -r --arg bot "$BOT" \
            '.comments
                | map(select(.body | startswith($bot) | not))
                | .[-1] // empty
                | "\(.createdAt)\t\(.body)"' 2>/dev/null || echo ""
}

# Erfolg, wenn es eine neue MENSCHLICHE Eingabe gibt (neuester menschlicher
# Kommentar neuer als die zuletzt verarbeitete). Setzt bei Treffer
# HUMAN_REPLY (Kommentartext) und aktualisiert lastHumanCommentAt.
HUMAN_REPLY=""
human_replied() {
    local number="$1"
    local last; last=$(latest_human_comment "$number")
    [[ -n "$last" ]] || return 1

    local created body
    created="${last%%$'\t'*}"
    body="${last#*$'\t'}"

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

# Ruft einen Agenten im gewählten Backend auf. Stdout = Agent-Antwort; das
# Zeilen-Protokoll wird von den Aufrufern via grep herausgefiltert.
# run_agent <backend> <model> <dir> <prompt>
is_default_model() {
    local model="$1"
    [[ -z "$model" || "$model" == "default" || "$model" == "-" ]]
}

display_model() {
    local model="$1"
    if is_default_model "$model"; then
        echo "default"
    else
        echo "$model"
    fi
}

run_agent() {
    local backend="$1" model="$2" dir="$3" prompt="$4"
    case "$backend" in
        claude)
            # Rechte: .claude/settings.json-Allowlist + acceptEdits für Edits.
            local args=(--permission-mode acceptEdits)
            is_default_model "$model" || args+=(--model "$model")
            ( cd "$dir" && claude "${args[@]}" -p "$prompt" ) ;;
        codex)
            # Rechte aus CODEX_PERM_ARGS (workspace-write + Netz, nie nachfragen).
            # -o schreibt NUR die finale Antwort raus (Reasoning-Log verwerfen).
            local last; last=$(mktemp)
            local args=(exec "${CODEX_PERM_ARGS[@]}" --cd "$dir" -o "$last")
            local git_dir; git_dir=$(git -C "$dir" rev-parse --path-format=absolute --git-dir 2>/dev/null || true)
            local git_common_dir; git_common_dir=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
            [[ -n "$git_dir" ]] && args+=(--add-dir "$git_dir")
            [[ -n "$git_common_dir" && "$git_common_dir" != "$git_dir" ]] && args+=(--add-dir "$git_common_dir")
            is_default_model "$model" || args+=(--model "$model")
            # Fortschritt nach stderr (sichtbar, nicht ins Parsing eingefangen);
            # die saubere finale Antwort kommt aus -o.
            codex "${args[@]}" "$prompt" 1>&2 || true
            cat "$last" 2>/dev/null; rm -f "$last" ;;
        *)
            echo "FAIL: unbekanntes Agent-Backend '${backend}'" ;;
    esac
}

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

    local result; result=$(run_agent "$PLANNER_BACKEND" "$PLANNER_MODEL" "$REPO_DIR" "$CLAUDE_PROMPT")
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

    if [[ "$stage" != "new" && "$stage" != "planning" && "$stage" != "awaiting-author" ]]; then
        if human_replied "$number"; then
            set_field "$number" "fixForwardNote" "$HUMAN_REPLY"
            set_field "$number" "stage" "planning"
            remove_label "$number" "$LABEL_READY_BUILD"
            remove_label "$number" "$LABEL_ACCEPT"
            add_label "$number" "$LABEL_PLANNING"
            echo "  [#${number}] Menschlicher Kommentar hat Vorrang; zurück zum Planner."
            return
        fi
    fi

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
    run_agent "$BUILDER_BACKEND" "$BUILDER_MODEL" "$wt" "$CLAUDE_PROMPT"
}

review_step() {
    local pr="$1" repo="$2"
    local diff; diff=$(gh pr diff "$pr" --repo "$repo" 2>/dev/null || echo "(PR-Diff nicht verfügbar)")
    build_prompt "${AGENTS_DIR}/feature-reviewer.md" "PR #${pr} diff:

${diff}" \
        'Respond with exactly one line: "PASS" or "FAIL: <violated standard and offending line>".'
    run_agent "$REVIEWER_BACKEND" "$REVIEWER_MODEL" "$REPO_DIR" "$CLAUDE_PROMPT"
}

validate_step() {
    local wt="$1" spec="$2"
    build_prompt "${AGENTS_DIR}/feature-validator.md" "Feature spec: ${spec}
Repository: ${wt}" \
        'Run npm test. Verify each AC is covered by a test. Respond with exactly one line: "PASS" or "FAIL: AC-<n> <gap>".'
    run_agent "$VALIDATOR_BACKEND" "$VALIDATOR_MODEL" "$wt" "$CLAUDE_PROMPT"
}

# Deployt den frisch gemergten Build aus dem Worktree in den Obsidian-Vault.
# Baut aus genau dem Code, der gerade nach main gemergt wurde (node_modules ist
# bereits in den Worktree verlinkt) und kopiert die Plugin-Artefakte. Gibt 0 bei
# Erfolg zurück, sonst 1 — der Aufrufer meldet einen Fehler im Issue, statt die
# Abnahme stillschweigend gegen alten Vault-Code laufen zu lassen.
# Muss VOR cleanup_worktree laufen, solange der Worktree noch existiert.
deploy_to_vault() {
    local wt="$1"
    [[ -d "$VAULT_DIR" ]] || return 1
    ( cd "$wt" && npm run build ) >/dev/null 2>&1 || return 1
    cp "${wt}/main.js"       "${VAULT_DIR}/main.js"       || return 1
    cp "${wt}/styles.css"    "${VAULT_DIR}/styles.css"    || return 1
    cp "${wt}/manifest.json" "${VAULT_DIR}/manifest.json" || return 1
    return 0
}

# Räumt Worktree und lokalen Branch weg.
cleanup_worktree() {
    local wt="$1" branch="$2"
    if [[ -n "$wt" ]]; then
        git -C "$REPO_DIR" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
    fi
    if [[ -n "$branch" ]]; then
        git -C "$REPO_DIR" branch -D "$branch" 2>/dev/null || true
    fi
    git -C "$REPO_DIR" worktree prune 2>/dev/null || true
}

# Schickt das Issue zur (Neu-)Planung zurück und räumt den Worktree weg.
back_to_planner() {
    local number="$1" wt="$2" branch="$3" reason="$4"
    cleanup_worktree "$wt" "$branch"
    local return_count; return_count=$(get_field "$number" "plannerReturnCount" "0")
    return_count=$(( return_count + 1 ))
    set_field_num "$number" "plannerReturnCount" "$return_count"

    if (( return_count > MAX_PLANNER_RETURNS )); then
        set_field "$number" "stage" "awaiting-author"
        set_field "$number" "prNumber" ""
        set_field "$number" "fixForwardNote" ""
        remove_label "$number" "$LABEL_READY_BUILD"
        remove_label "$number" "$LABEL_PLANNING"
        add_label "$number" "$LABEL_AWAITING"
        post_comment "$number" "**Pipeline**: Circuit Breaker aktiv. Das Issue wurde ${return_count}x vom Build-Lane zurück zum Planner geschickt und wartet jetzt auf menschliche Entscheidung, um weitere Token-Kosten zu vermeiden. Letzter Grund: ${reason}"
        return
    fi

    set_field "$number" "stage" "planning"
    set_field "$number" "prNumber" ""
    set_field "$number" "fixForwardNote" "$reason"
    remove_label "$number" "$LABEL_READY_BUILD"
    add_label "$number" "$LABEL_PLANNING"
    post_comment "$number" "**Pipeline**: Zurück zum Planner. Grund: ${reason}"
}

send_pipeline_failure_to_planner() {
    local number="$1" wt="$2" branch="$3" reason="$4"
    cleanup_worktree "$wt" "$branch"
    set_field "$number" "stage" "planning"
    set_field "$number" "prNumber" ""
    set_field "$number" "fixForwardNote" "PIPELINE FAILURE: ${reason}

This is a pipeline/infrastructure failure, not product feedback. Decide whether to ask the human to fix pipeline state, mark the issue as awaiting-author, or reroute only if the issue/spec actually needs a product clarification."
    remove_label "$number" "$LABEL_READY_BUILD"
    add_label "$number" "$LABEL_PLANNING"
    post_comment "$number" "**Pipeline**: Technischer Pipeline-Fehler. Übergabe an den Feature Planner zur Einordnung. Grund: ${reason}"
}

# Fährt eine Issue komplett durch Build → Review → Validate → Merge.
build_lane() {
    local number="$1"
    local repo; repo=$(get_repo)
    local spec; spec=$(get_field "$number" "specPath" "")

    if [[ -z "$spec" || ! -f "${REPO_DIR}/${spec}" ]]; then
        send_pipeline_failure_to_planner "$number" "" "" "Spec nicht gefunden (\`${spec:-leer}\`)."
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
    cp "${REPO_DIR}/CLAUDE.md" "${wt}/CLAUDE.md"
    mkdir -p "${wt}/docs"
    cp "${REPO_DIR}/docs/design-system.md" "${wt}/docs/design-system.md"
    mkdir -p "${wt}/$(dirname "$spec")"   # Spec in den Worktree spiegeln — Builder/Validator lesen sie dort
    cp "${REPO_DIR}/${spec}" "${wt}/${spec}"

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
            # Guard: Ein Branch ohne eigenen Commit gegenüber origin/main bedeutet,
            # dass der Builder nichts geändert hat — fast immer eine bereits
            # umgesetzte oder dem Issue falsch zugewiesene Spec, KEIN Git-/Infra-
            # Problem. Klar benennen, statt den leeren Diff als Branch-State-Fehler
            # zu framen (siehe #12: Edit-Issue bekam die Pinch-Spec).
            if [[ -z "$(git -C "$wt" log --oneline origin/main..HEAD 2>/dev/null)" ]]; then
                send_pipeline_failure_to_planner "$number" "$wt" "$branch" \
                    "Builder hat keine Änderung produziert (Branch identisch mit origin/main). Die Spec \`${spec}\` ist vermutlich bereits umgesetzt oder diesem Issue falsch zugewiesen — bitte die Spec-Zuordnung prüfen, nicht den Branch-/Git-State."
            else
                send_pipeline_failure_to_planner "$number" "$wt" "$branch" "Builder konnte keinen PR liefern: $(echo "$b" | sed 's/^FAIL: *//')"
            fi
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
                local deploy_note="und in den Vault deployt"
                deploy_to_vault "$wt" \
                    || deploy_note="gemergt, aber der **Vault-Deploy ist fehlgeschlagen** — bitte \`bash deploy.sh\` manuell ausführen, bevor du testest"
                cleanup_worktree "$wt" "$branch"
                remove_label "$number" "$LABEL_READY_BUILD"
                add_label "$number" "$LABEL_ACCEPT"
                set_field "$number" "stage" "ready-for-acceptance"
                post_comment "$number" "**Pipeline**: PR #${pr} reviewed, validiert, gemergt ${deploy_note}.

**Wartet auf deine Abnahme.** Schließe das Issue, wenn alles passt — oder kommentiere eine Klarstellung für einen Fix-forward."
                return 0
            fi
            send_pipeline_failure_to_planner "$number" "$wt" "$branch" "Merge von PR #${pr} fehlgeschlagen."
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
    echo "   Backends:  Planner=${PLANNER_BACKEND}($(display_model "$PLANNER_MODEL")) · Builder=${BUILDER_BACKEND}($(display_model "$BUILDER_MODEL")) · Reviewer=${REVIEWER_BACKEND}($(display_model "$REVIEWER_MODEL")) · Validator=${VALIDATOR_BACKEND}($(display_model "$VALIDATOR_MODEL"))"
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
