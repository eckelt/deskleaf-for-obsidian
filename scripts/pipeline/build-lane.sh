#!/usr/bin/env bash
# Deskleaf Cloud Pipeline — build lane, one issue per run, globally serialised
# via the workflow's concurrency group. Ports build_lane() from
# scripts/issue-watch.sh: builder → validator → reviewer → auto-merge.
#
# The runner checkout replaces the local git worktree (it is disposable and
# isolated by construction). deploy_to_vault is gone: merging to main triggers
# release.yml, which publishes a BRAT-installable release.
#
# Env: REPO, ISSUE_NUMBER, optional MERGE_TOKEN (PAT). The merge must use a PAT:
# a merge pushed with GITHUB_TOKEN would NOT trigger release.yml (GitHub
# suppresses workflow runs for events caused by GITHUB_TOKEN).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/pipeline/lib.sh
source "${SCRIPT_DIR}/lib.sh"

AGENTS_DIR=".github/agents"
BRANCH="feature/issue-${ISSUE_NUMBER}"

# ── Stage steps (ported 1:1, dir = the runner checkout) ───────────────────────

build_step() {
    local pr="$1" feedback="$2" spec="$3"
    local instr="You are in a disposable CI checkout on branch ${BRANCH}. Implement the spec with TDD.
Run npm test and npm run build; both must pass.
Then commit, push: git push -u origin ${BRANCH}, and open the PR:
gh pr create --base main --head ${BRANCH} --fill --repo ${REPO}"
    [[ -n "$pr" ]]       && instr="${instr}
A PR (#${pr}) already exists for this branch — push your fixes to it and reuse that number."
    [[ -n "$feedback" ]] && instr="${instr}

Address this feedback from the previous round:
${feedback}"
    instr="${instr}

Respond with exactly one line: \"PR: <number>\" or \"FAIL: <reason>\"."

    build_prompt "${AGENTS_DIR}/feature-builder.md" "Feature spec: ${spec}" "$instr"
    run_agent "$BUILDER_BACKEND" "$BUILDER_MODEL" "$(pwd)" "$CLAUDE_PROMPT"
}

validate_step() {
    local spec="$1"
    build_prompt "${AGENTS_DIR}/feature-validator.md" "Feature spec: ${spec}
Repository: $(pwd)" \
        'Run npm test. Verify each AC is covered by a test. Respond with exactly one line: "PASS" or "FAIL: AC-<n> <gap>".'
    run_agent "$VALIDATOR_BACKEND" "$VALIDATOR_MODEL" "$(pwd)" "$CLAUDE_PROMPT"
}

review_step() {
    local pr="$1"
    local diff; diff=$(gh pr diff "$pr" --repo "$REPO" 2>/dev/null || echo "(PR diff not available)")
    build_prompt "${AGENTS_DIR}/feature-reviewer.md" "PR #${pr} diff:

${diff}" \
        'Respond with exactly one line: "PASS" or "FAIL: <violated standard and offending line>".'
    run_agent "$REVIEWER_BACKEND" "$REVIEWER_MODEL" "$(pwd)" "$CLAUDE_PROMPT"
}

# ── Failure routing (ported; re-plans run via workflow_dispatch) ──────────────

drop_remote_branch() {
    git push origin --delete "$BRANCH" 2>/dev/null || true
}

back_to_planner() {
    local reason="$1"
    drop_remote_branch
    local return_count; return_count=$(state_get plannerReturnCount "0")
    return_count=$(( return_count + 1 ))
    state_set_num plannerReturnCount "$return_count"

    if (( return_count > MAX_PLANNER_RETURNS )); then
        state_set stage "awaiting-author"
        state_set prNumber ""
        state_set fixForwardNote ""
        remove_label "$LABEL_READY_BUILD"
        remove_label "$LABEL_PLANNING"
        add_label "$LABEL_AWAITING"
        post_comment "**Pipeline**: Circuit Breaker aktiv. Das Issue wurde ${return_count}x vom Build-Lane zurück zum Planner geschickt und wartet jetzt auf menschliche Entscheidung, um weitere Token-Kosten zu vermeiden. Letzter Grund: ${reason}"
        return 0
    fi

    state_set stage "planning"
    state_set prNumber ""
    state_set fixForwardNote "$reason"
    remove_label "$LABEL_READY_BUILD"
    add_label "$LABEL_PLANNING"
    post_comment "**Pipeline**: Zurück zum Planner. Grund: ${reason}"
    dispatch_workflow issue-pipeline.yml -f issue="$ISSUE_NUMBER"
}

send_pipeline_failure_to_planner() {
    local reason="$1"
    drop_remote_branch
    state_set stage "planning"
    state_set prNumber ""
    state_set fixForwardNote "PIPELINE FAILURE: ${reason}

This is a pipeline/infrastructure failure, not product feedback. Decide whether to ask the human to fix pipeline state, mark the issue as awaiting-author, or reroute only if the issue/spec actually needs a product clarification."
    remove_label "$LABEL_READY_BUILD"
    add_label "$LABEL_PLANNING"
    post_comment "**Pipeline**: Technischer Pipeline-Fehler. Übergabe an den Feature Planner zur Einordnung. Grund: ${reason}"
    dispatch_workflow issue-pipeline.yml -f issue="$ISSUE_NUMBER"
}

# ── Lane ──────────────────────────────────────────────────────────────────────

run_lane() {
    local spec; spec=$(state_get specPath "")
    if [[ -z "$spec" || ! -f "$spec" ]]; then
        send_pipeline_failure_to_planner "Spec nicht gefunden (\`${spec:-leer}\`)."
        return 0
    fi

    echo "-> Build lane for issue #${ISSUE_NUMBER} (branch ${BRANCH})"
    git switch -c "$BRANCH"

    # The planner's fix-forward note becomes the builder's first feedback.
    local feedback; feedback=$(state_get fixForwardNote "")
    state_set fixForwardNote ""
    local pr="" attempt=0
    while (( attempt < MAX_BUILD_ATTEMPTS )); do
        attempt=$(( attempt + 1 ))
        echo "   Attempt ${attempt}/${MAX_BUILD_ATTEMPTS}"

        local b; b=$(build_step "$pr" "$feedback" "$spec")
        if echo "$b" | grep -q "^PR:"; then
            pr=$(echo "$b" | sed 's/^PR: *//')
            state_set prNumber "$pr"
        else
            # Guard: a branch without its own commit against origin/main means
            # the builder changed nothing — almost always a spec that is already
            # implemented or wrongly assigned to this issue, NOT a git problem.
            if [[ -z "$(git log --oneline origin/main..HEAD 2>/dev/null)" ]]; then
                send_pipeline_failure_to_planner "Builder hat keine Änderung produziert (Branch identisch mit origin/main). Die Spec \`${spec}\` ist vermutlich bereits umgesetzt oder diesem Issue falsch zugewiesen — bitte die Spec-Zuordnung prüfen, nicht den Branch-/Git-State.

Builder-Rohausgabe (zur Diagnose, sonst nie sichtbar):
\`\`\`
${b:-<leer>}
\`\`\`"
            else
                send_pipeline_failure_to_planner "Builder konnte keinen PR liefern: $(echo "$b" | sed 's/^FAIL: *//')"
            fi
            return 0
        fi

        local val; val=$(validate_step "$spec")
        if ! echo "$val" | grep -q "^PASS"; then
            local ac; ac=$(echo "$val" | sed -n 's/^FAIL: *\(AC-[0-9]*\).*/\1/p')
            local last; last=$(state_get lastFailedAc "")
            local streak; streak=$(state_get acFailStreak "0")
            if [[ -n "$ac" && "$ac" == "$last" ]]; then
                streak=$(( streak + 1 ))
            else
                streak=1
            fi
            state_set lastFailedAc "$ac"
            state_set_num acFailStreak "$streak"

            if (( streak >= AC_ESCALATE_THRESHOLD )); then
                state_set_num acFailStreak 0
                back_to_planner "Validator scheitert wiederholt an ${ac:-einem AC} — Spec vermutlich unklar."
                return 0
            fi

            feedback="Validator: $(echo "$val" | sed 's/^FAIL: *//')"
            post_comment "**Validator**: Nicht bestanden — ${feedback#Validator: } (Versuch ${attempt})."
            continue
        fi

        local rev; rev=$(review_step "$pr")
        if ! echo "$rev" | grep -q "^PASS"; then
            feedback="Code-Review: $(echo "$rev" | sed 's/^FAIL: *//')"
            post_comment "**Code Reviewer**: Nicht bestanden — ${feedback#Code-Review: } (Versuch ${attempt})."
            continue
        fi

        local merge_note=""
        if [[ -z "${MERGE_TOKEN:-}" ]]; then
            merge_note="

⚠️ Kein \`PIPELINE_PAT\`-Secret konfiguriert — der Merge lief über das Workflow-Token, deshalb wurde **kein Release gebaut**. Bitte Secret anlegen (siehe README) oder den Release-Workflow manuell anstoßen."
        fi
        if GH_TOKEN="${MERGE_TOKEN:-${GH_TOKEN:-}}" gh pr merge "$pr" --squash --delete-branch --repo "$REPO" >/dev/null 2>&1; then
            remove_label "$LABEL_READY_BUILD"
            add_label "$LABEL_ACCEPT"
            state_set stage "ready-for-acceptance"
            post_comment "**Pipeline**: PR #${pr} validiert, reviewed und gemergt. Der Release-Workflow baut jetzt die neue Version — in wenigen Minuten per **BRAT → Check for updates** installierbar.

**Wartet auf deine Abnahme.** Schließe das Issue, wenn alles passt — oder kommentiere eine Klarstellung für einen Fix-forward.${merge_note}"
            return 0
        fi
        send_pipeline_failure_to_planner "Merge von PR #${pr} fehlgeschlagen."
        return 0
    done

    back_to_planner "Build nach ${MAX_BUILD_ATTEMPTS} Versuchen nicht grün."
}

main() {
    install_failure_trap
    state_load

    local stage; stage=$(state_get stage "")
    if [[ "$stage" != "spec-ready" ]]; then
        echo "stage=${stage:-unset} — build lane has nothing to do."
    else
        run_lane
    fi

    dispatch_next_build
}

main
