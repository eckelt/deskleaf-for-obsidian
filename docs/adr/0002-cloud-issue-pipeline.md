# ADR 2: Cloud Issue Pipeline on GitHub Actions

Date: 2026-07-06

## Status
Accepted. Supersedes the *execution model* of ADR 1 (local polling daemon);
the roles, artifact ownership, and failure-routing rules of ADR 1 remain in
force unchanged.

## Context

`scripts/issue-watch.sh` implements ADR 1 as a local polling daemon. That works,
but it couples the whole factory to one machine being awake: no laptop, no
pipeline. Issues created from a phone sit untouched, and the merged build only
reaches the vault through a local file copy (`deploy_to_vault`), which a phone
can never receive.

## Decision

### Execution moves to GitHub Actions, event-driven

Two workflows replace the polling loop:

- **`issue-pipeline.yml` — planner lane.** Fires on `issues: opened/reopened`,
  on `issue_comment: created` (humans only), and on `workflow_dispatch` for
  re-plans. Runs `scripts/pipeline/planner.sh`, a port of the daemon's
  `plan()`/`dispatch_planning()`.
- **`build-lane.yml` — build lane.** `workflow_dispatch` only, with a global
  `concurrency: build-lane` group (the ADR 1 build mutex). Runs
  `scripts/pipeline/build-lane.sh`: builder → validator → reviewer →
  auto-merge, same attempt limits, AC escalation, and circuit breaker as ADR 1.

There is no polling anywhere; GitHub's events are the scheduler.

### The `🤖` convention is replaced by a real bot identity

Workflow-posted comments belong to `github-actions[bot]`. The comment trigger
filters on `comment.user.type != 'Bot'`, and events caused by `GITHUB_TOKEN`
never start workflows anyway — double protection where ADR 1 had a breakable
string convention. The `🤖` prefix is kept purely as a visual marker.

### State lives on the issue itself

The daemon's `.issue-watch-state.json` becomes a bot comment per issue
(`<!-- deskleaf-pipeline-state -->` + fenced JSON) holding `stage`, `specPath`,
`prNumber`, `fixForwardNote`, `lastFailedAc`, `acFailStreak`,
`plannerReturnCount`. Labels remain the human-visible stage display. Workflow
runs are stateless; per-issue races are prevented by a per-issue concurrency
group.

### Stages chain via `workflow_dispatch`

`workflow_dispatch` is exempt from GitHub's rule that `GITHUB_TOKEN` events do
not trigger workflows, so lanes hand work to each other explicitly:
planner → build lane on `SPEC:`/`BUILD:`, build lane → planner on escalation,
planner → planner for `SPLIT:` children. Because GitHub keeps only **one**
pending run per concurrency group, each build run re-dispatches the next
`status:ready-for-build` issue itself instead of trusting the queue.

### The planner commits specs straight to main

The runner checkout is disposable, so a spec that only exists there would
evaporate. `planner.sh` commits `specs/`, `docs/`, and `CONTEXT.md` changes and
pushes them to `main` (rebase-retry). This replaces the daemon's copy-the-spec-
into-the-worktree step; the builder branch simply includes the spec.

### Merges use a PAT; releases replace the vault deploy

A merge pushed with `GITHUB_TOKEN` would not trigger `release.yml` — and the
release *is* the deployment now. The build lane therefore merges with the
`PIPELINE_PAT` secret (fine-grained PAT: contents + pull-requests read/write).
`release.yml` stamps `manifest.json` with `major.minor.<run_number>` and
publishes a versioned pre-release per merge, installable on any device via
BRAT. `deploy_to_vault` is retired; the CLAUDE.md rule "deploy before human
review" is satisfied by the release: the acceptance comment tells the human to
update via BRAT before testing.

### Backends are mixed per stage

Defaults: Planner and Reviewer on **Claude** (`claude` CLI,
`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`), Builder and Validator on
**Codex** (`codex` CLI, `OPENAI_API_KEY`). Repository variables
(`PLANNER_BACKEND`, `BUILDER_MODEL`, …) override per stage without code
changes, mirroring the daemon's env overrides.

### The local daemon stays as a fallback — never in parallel

`scripts/issue-watch.sh` is kept for offline/emergency use. Its state file and
the state comments are **not** synchronised: run it only while the two pipeline
workflows are disabled (`gh workflow disable "Issue Pipeline" "Build Lane"`),
and re-enable them afterwards.

## Consequences

- One-time setup: repository secrets `OPENAI_API_KEY`,
  `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`), `PIPELINE_PAT`; BRAT with
  a read-only PAT on each device (private repo).
- Issues can be filed and accepted entirely from a phone; the Mac is out of the
  loop.
- Agent runs consume API/subscription quota in CI; the ADR 1 circuit breakers
  are the cost guard. Ubuntu runners are cheap; the Swift build in `release.yml`
  remains the only macOS job.
- `feature-planner.yml` (the earlier label-triggered Codex planner experiment)
  is removed as superseded.
- Direct spec pushes to `main` can race a human push; mitigated by
  rebase-retry, accepted as low-risk for spec files.
