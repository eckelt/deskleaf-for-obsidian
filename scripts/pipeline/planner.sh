#!/usr/bin/env bash
# Deskleaf Cloud Pipeline — planner lane, one run per triggering event.
# Ports plan()/dispatch_planning() from scripts/issue-watch.sh to a stateless,
# event-driven model: the workflow fires on issue opened/reopened, on human
# comments, and on explicit workflow_dispatch re-plans from the build lane.
#
# Env: REPO, ISSUE_NUMBER, EVENT_TYPE (issues|issue_comment|workflow_dispatch),
#      COMMENT_BODY (only for issue_comment events), PLAN_ONLY (optional).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/pipeline/lib.sh
source "${SCRIPT_DIR}/lib.sh"

EVENT_TYPE="${EVENT_TYPE:-workflow_dispatch}"
COMMENT_BODY="${COMMENT_BODY:-}"
PLAN_ONLY="${PLAN_ONLY:-false}"
AGENTS_DIR=".github/agents"
LABEL_FACTORY_REFINEMENT="factory:refinement-ready"

# The planner writes spec files into this fresh CI checkout; they must land on
# main or they evaporate with the runner. Push with rebase-retry because other
# lanes may push to main concurrently.
push_planner_artifacts() {
    git add specs docs CONTEXT.md 2>/dev/null || true
    git diff --cached --quiet && return 0
    git commit -m "Plan: update spec artifacts for issue #${ISSUE_NUMBER}"
    local i
    for i in 1 2 3; do
        git push origin HEAD:main 2>/dev/null && return 0
        git pull --rebase origin main || return 1
    done
    return 1
}

# Runs the planner agent and applies its one-line verdict to labels + state.
run_planner() {
    local human="$1"
    echo "-> Planner for issue #${ISSUE_NUMBER} (event: ${EVENT_TYPE})"

    add_label "$LABEL_PLANNING"

    local title body
    title=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json title --jq '.title')
    body=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json body --jq '.body // ""')

    local context="Issue #${ISSUE_NUMBER}: ${title}

${body}

Repository: $(pwd)
You are running in a disposable CI checkout of main. Write spec files into the
checkout; the pipeline commits and pushes them for you. Use gh for any issue
operations (comments you post appear as the pipeline bot)."
    [[ -n "$human" ]] && context="${context}

Latest human reply:
${human}"
    local ff; ff=$(state_get fixForwardNote "")
    [[ -n "$ff" ]] && context="${context}

Note from the pipeline (a fix-forward clarification or an escalation — address it):
${ff}"

    local instruction='Follow your output contract. Respond with exactly one line:
"SKIP: <reason>" | "QUESTIONS" | "SPLIT: #<n> #<n> ..." | "SPEC: specs/features/<file>.md" | "BUILD: <note>"'
    if [[ "$PLAN_ONLY" == "true" ]]; then
        instruction="${instruction}

This issue was delegated by the cross-product Deskleaf Factory in PLAN_ONLY mode.
Write or refine the Obsidian spec and ask clarification questions as usual, but do
not create child issues and do not hand work to the Builder. Return only QUESTIONS,
SPEC, or SKIP. The central Factory owns the next delivery decision."
    fi
    build_prompt "${AGENTS_DIR}/feature-planner.md" "$context" "$instruction"

    capture_stdout run_agent "$PLANNER_BACKEND" "$PLANNER_MODEL" "$(pwd)" "$CLAUDE_PROMPT" planner 1
    local result="$reply"
    local line; line=$(echo "$result" | grep -E '^(SKIP|QUESTIONS|SPLIT|SPEC|BUILD)' | head -1 || true)

    state_set fixForwardNote ""

    case "$line" in
        SKIP:*)
            remove_label "$LABEL_PLANNING"
            add_label "$LABEL_WONTFIX"
            state_set stage "skipped"
            post_comment "**Feature Planner**: Kommt nicht in die Pipeline. Grund: ${line#SKIP: }" ;;
        QUESTIONS)
            # The planner already posted its questions as a bot comment.
            remove_label "$LABEL_PLANNING"
            add_label "$LABEL_AWAITING"
            state_set stage "awaiting-author" ;;
        SPLIT:*)
            if [[ "$PLAN_ONLY" == "true" ]]; then
                remove_label "$LABEL_PLANNING"
                add_label "$LABEL_AWAITING"
                state_set stage "awaiting-author"
                post_comment "**Feature Planner**: Der Plan-only-Auftrag wäre zu groß für eine einzelne Spec. Bitte den zentralen Factory-Auftrag in begrenzte Produktaufträge schneiden; es wurden keine Kind-Issues erzeugt."
                return 0
            fi
            # Child issues were created by the agent via gh — with the workflow
            # token, so their "opened" events do NOT trigger this workflow.
            # Dispatch each child into the planner lane explicitly.
            remove_label "$LABEL_PLANNING"
            add_label "$LABEL_EPIC"
            state_set stage "epic"
            post_comment "**Feature Planner**: In Sub-Issues zerlegt (${line#SPLIT: }). Dieses Epic schließt du, wenn alle Kinder durch sind."
            local child
            for child in $(grep -oE '#[0-9]+' <<<"${line#SPLIT: }"); do
                dispatch_workflow issue-pipeline.yml -f issue="${child#\#}"
            done ;;
        SPEC:*)
            local spec="${line#SPEC: }"
            if [[ ! -f "$spec" ]]; then
                post_comment "**Feature Planner**: Meldete \`${spec}\`, aber die Datei existiert nicht — Lauf wird als fehlgeschlagen gewertet."
                remove_label "$LABEL_PLANNING"
                return 0
            fi
            if ! push_planner_artifacts; then
                post_comment "**Pipeline**: Spec erstellt, aber Push nach main fehlgeschlagen — bitte Actions-Log prüfen."
                remove_label "$LABEL_PLANNING"
                return 0
            fi
            if [[ "$PLAN_ONLY" == "true" ]]; then
                remove_label "$LABEL_PLANNING"
                remove_label "$LABEL_AWAITING"
                remove_label "$LABEL_READY_BUILD"
                add_label "$LABEL_FACTORY_REFINEMENT"
                state_set specPath "$spec"
                state_set stage "factory-refinement-ready"
                post_comment "**Feature Planner**: Spec bereit: \`${spec}\`. Plan-only-Auftrag beendet; die zentrale Factory entscheidet über weitere Produktarbeit."
                return 0
            fi
            remove_label "$LABEL_PLANNING"
            remove_label "$LABEL_AWAITING"
            add_label "$LABEL_READY_BUILD"
            state_set specPath "$spec"
            state_set stage "spec-ready"
            post_comment "**Feature Planner**: Spec bereit: \`${spec}\`. Build startet sequentiell."
            dispatch_workflow build-lane.yml -f issue="$ISSUE_NUMBER" ;;
        BUILD:*)
            # Fix-forward: implementation-only change, spec stays. New build pass.
            push_planner_artifacts || true
            if [[ "$PLAN_ONLY" == "true" ]]; then
                remove_label "$LABEL_PLANNING"
                remove_label "$LABEL_AWAITING"
                remove_label "$LABEL_READY_BUILD"
                add_label "$LABEL_FACTORY_REFINEMENT"
                state_set stage "factory-refinement-ready"
                state_set fixForwardNote "${line#BUILD: }"
                post_comment "**Feature Planner**: Plan-only-Fix-forward dokumentiert. Die zentrale Factory entscheidet über weitere Produktarbeit."
                return 0
            fi
            remove_label "$LABEL_PLANNING"
            remove_label "$LABEL_AWAITING"
            add_label "$LABEL_READY_BUILD"
            state_set prNumber ""
            state_set fixForwardNote "${line#BUILD: }"
            state_set stage "spec-ready"
            post_comment "**Feature Planner**: Fix-forward an den Builder: ${line#BUILD: }"
            dispatch_workflow build-lane.yml -f issue="$ISSUE_NUMBER" ;;
        *)
            post_comment "**Feature Planner**: Lauf ohne gültige Ergebniszeile beendet — bitte Actions-Log prüfen."
            echo "Planner without a valid verdict line: ${result:0:200}" ;;
    esac
}

# ── Routing (ports dispatch_planning) ─────────────────────────────────────────

main() {
    install_failure_trap

    local issue_state
    issue_state=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json state --jq '.state' 2>/dev/null || echo "")
    if [[ "$issue_state" != "OPEN" ]]; then
        echo "Issue #${ISSUE_NUMBER} is ${issue_state:-unknown} — nothing to do."
        return 0
    fi

    state_load
    local stage; stage=$(state_get stage "new")

    if [[ "$EVENT_TYPE" == "issue_comment" ]]; then
        case "$stage" in
            new|planning)
                run_planner "$COMMENT_BODY" ;;
            awaiting-author)
                run_planner "$COMMENT_BODY" ;;
            epic|skipped)
                echo "stage=${stage} — human comment ignored (reopen/relabel to restart)." ;;
            factory-refinement-ready)
                # A human clarification can refine the delegated product spec,
                # but PLAN_ONLY continues to prohibit builder dispatch.
                state_set stage "planning"
                remove_label "$LABEL_FACTORY_REFINEMENT"
                add_label "$LABEL_PLANNING"
                run_planner "$COMMENT_BODY" ;;
            *)
                # Any human comment during build or acceptance is a fix-forward:
                # back to the planner, which classifies and reroutes it.
                state_set fixForwardNote "$COMMENT_BODY"
                state_set stage "planning"
                remove_label "$LABEL_READY_BUILD"
                remove_label "$LABEL_ACCEPT"
                add_label "$LABEL_PLANNING"
                echo "Fix-forward via human comment; back to the planner."
                run_planner "" ;;
        esac
        return 0
    fi

    # issues opened/reopened or an explicit workflow_dispatch re-plan.
    case "$stage" in
        new|planning)
            run_planner "" ;;
        *)
            echo "stage=${stage} — nothing to plan." ;;
    esac
}

main
