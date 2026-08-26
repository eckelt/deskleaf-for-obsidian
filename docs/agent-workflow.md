# Deskleaf Agent Workflow

How the autonomous issue pipeline runs day to day. The authoritative design
decisions live in [`docs/adr/0001-autonomous-issue-pipeline.md`](adr/0001-autonomous-issue-pipeline.md);
this document is the operational companion.

## Purpose

GitHub stays the main interface; feature specs stay versioned artifacts.

- GitHub issues are the inbox, the discussion thread, and the status surface.
- `specs/features/[feature-name].md` is the source of truth for implementation.
- The pipeline is driven by a local polling daemon: `scripts/issue-watch.sh`.

## Roles

Four agents, defined under `.github/agents/`. Strict artifact ownership:
**only the Planner writes specs, only the Builder writes code.** ADRs and the
glossary under `docs/adr/` are shared — the human, the Planner, and the Builder
may all write them.

### Feature Planner (PO)
Turns a raw issue into an implementation-ready spec.

- Triages the issue itself — may `SKIP` low-value or unbounded issues.
- Clarifies scope with the author through **async, multi-round GitHub
  comments** (batching questions to minimise rounds); the issue waits in
  `awaiting-author` until the human replies.
- Splits an oversized feature into **N independent child sub-issues**; the
  parent becomes an epic and sleeps.
- Writes lightweight Given/When/Then acceptance scenarios in the spec for
  non-trivial behaviours. These are Markdown scenarios, not Cucumber files.
- Owns the spec. Does not write production code.

### Feature Builder
Implements an approved spec with TDD and Clean Code.

- Runs inside a dedicated git worktree on a short-lived feature branch.
- Uses acceptance scenarios as the test plan; writes failing Vitest coverage
  for automated scenarios first, then makes it pass.
- May add an ADR alongside the code when a ground-rule decision is forced.
- Runs `npm test` and `npm run build`, then opens the PR.

### PR-Reviewer
Judges the PR diff for consistency, readability, and maintainability against
`CLAUDE.md`. Never edits code.

### Validator
Confirms the spec is met: `npm test` green **and** every acceptance criterion
and automated acceptance scenario covered by a test. Never edits code.
Visual/manual QA in the running Obsidian app is the human's job at acceptance.

### Factory Reviewer
Reviews real completed pipeline runs after builds have merged.

- Runs through `scripts/factory-review.sh`, either manually or from a daily
  scheduler.
- First checks whether any PR was merged since the last Factory Review audit.
  If not, it updates the audit timestamp and exits without invoking an agent.
- Uses Factory Metrics from `scripts/factory-metrics.mjs`, including PR counts,
  Validator failures, Reviewer failures, Planner returns, human fix-forward
  signals, wrong-spec signals, loop counts, and a `notable` flag per issue, plus
  time-to-done, GitHub Actions minutes, and aggregated agent cost/tokens/duration
  as an objective comparison against manual work — informational only, no gate
  or threshold is based on them.
- Proposes measurable pipeline or prompt improvements only. It does not edit
  specs, code, tests, or ADRs directly.

### UX Designer
Optional planning support for visually or interaction-heavy features.

- Helps the Planner explore screenshots, interaction flows, states, and manual
  acceptance expectations before a spec is finalized.
- Produces UX contract material for the Planner.
- Does not own specs, write code, approve implementation, or replace human
  acceptance.

## Pipeline Stages

Issue stages (tracked in `scripts/.issue-watch-state.json`, mirrored to labels):

```text
new → planning → awaiting-author → spec-ready → ready-for-acceptance
                       ↘ epic (split) / skipped
```

| Stage                  | Label                          | Meaning                                        |
| ---------------------- | ------------------------------ | ---------------------------------------------- |
| planning               | `status:planning`              | Planner is assessing / re-assessing            |
| awaiting-author        | `status:awaiting-author`       | Blocked on a human reply to the Planner        |
| spec-ready             | `status:ready-for-build`       | Spec written, queued for the build lane        |
| ready-for-acceptance   | `status:ready-for-acceptance`  | Merged, awaiting human acceptance              |
| epic                   | `status:epic`                  | Split into sub-issues; sleeping                |
| skipped                | `wontfix`                      | Triaged out                                    |

These labels must exist in the repo for the status to be visible; the daemon
ignores missing labels silently.

## Concurrency — two lanes

- **Planning pool — parallel.** Any number of issues may sit in grilling at
  once; each blocks only on its own author.
- **Build queue — strictly sequential.** Build → Review → Validate → Merge runs
  one issue at a time, in its own worktree.

## Build mechanics

1. Daemon creates a worktree (`~/.cache/deskleaf-worktrees/issue-N`) on
   `feature/issue-N`, branched from `origin/main`.
2. Builder implements, tests, builds, opens the PR.
3. PR-Reviewer judges the diff. A failure routes back to the Builder.
4. Validator checks AC coverage. A failure routes back to the Builder;
   repeated failure on the same AC escalates to the Planner (the spec is likely
   unclear).
5. Pipeline/infrastructure failures are written to the issue and routed to the
   Planner for classification. The Planner usually asks for human intervention
   and moves the issue to `awaiting-author`; it only reroutes to the Builder if
   the cause is clearly implementation-side.
6. As a token-safety circuit breaker, an issue may return from the build lane to
   the Planner at most twice. The next return moves it to `awaiting-author` for
   human intervention.
7. On all-green the daemon **auto-merges** (`--squash`), cleans up the worktree,
   and labels the issue `ready-for-acceptance`.

## Signalling — the `🤖` convention

In the cloud pipeline (ADR 2) bot comments come from `github-actions[bot]`, a
real bot identity, and the comment trigger filters on it — the `🤖` prefix is
kept only as a visual marker. In the local fallback daemon the convention is
load-bearing: daemon and human comment under the same identity, so every bot
comment is prefixed with `🤖` and the loop triggers **only on comments that do
not start with `🤖`**.

Human comments have priority in every active stage. If a human comments while
an issue is queued for build, under review, validating, or waiting for
acceptance, the daemon removes it from the build/acceptance lane and routes it
back to the Planner with the comment as required context. Human clarification is
never ignored just because implementation has started.

## Human acceptance & fix-forward

Acceptance happens **after** merge:

- **Close the issue → accepted.** (Closed issues drop out of the poll.)
- **Comment a clarification → fix-forward.** The Planner reads it, asks back
  only if genuinely unclear, and otherwise routes a fresh build. The human
  closes the parent epic once all its children are done.

## Running it

### Cloud pipeline (default) — ADR 2

The pipeline runs machine-independently on GitHub Actions:

- `.github/workflows/issue-pipeline.yml` — planner lane, fires on new issues
  and human comments.
- `.github/workflows/build-lane.yml` — build lane, dispatched per spec-ready
  issue, globally serialised.

Nothing to start: opening an issue (also from the phone) triggers planning; a
merge triggers `release.yml`, whose versioned pre-release is installable via
BRAT (README → Installation). Per-issue pipeline state lives in a bot comment
on the issue.

One-time setup — repository secrets:

| Secret | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Codex stages (builder, validator by default) |
| `CLAUDE_CODE_OAUTH_TOKEN` *or* `ANTHROPIC_API_KEY` | Claude stages (planner, reviewer by default). Create the OAuth token with `claude setup-token`. |
| `PIPELINE_PAT` | Fine-grained PAT (this repo; contents + pull-requests read/write). Used **only** for the merge so the push triggers `release.yml`. |

Backends/models per stage via repository **variables**: `PLANNER_BACKEND`,
`PLANNER_MODEL`, `BUILDER_BACKEND`, `BUILDER_MODEL`, `VALIDATOR_BACKEND`,
`VALIDATOR_MODEL`, `REVIEWER_BACKEND`, `REVIEWER_MODEL`
(backend `claude` or `codex`; empty model = backend default).

### Local fallback daemon

```bash
bash scripts/issue-watch.sh
```

The daemon calls the configured backend per stage. Defaults are Codex for all
stages, with per-stage `*_BACKEND` and `*_MODEL` environment overrides.
Codex permissions are configured in `scripts/issue-watch.sh`; Claude permissions
come from the checked-in `.claude/settings.json` allowlist, which the daemon
also copies into each worktree.

**Never run both.** The daemon's `.issue-watch-state.json` and the cloud state
comments are not synchronised. Before starting the daemon, disable the cloud
workflows — and re-enable them afterwards:

```bash
gh workflow disable "Issue Pipeline" && gh workflow disable "Build Lane"
gh workflow enable  "Issue Pipeline" && gh workflow enable  "Build Lane"
```

## Factory Review

Run metrics only:

```bash
npm run factory:metrics
```

Run the guarded review:

```bash
npm run factory:review
```

Run the same guard from a daily scheduler:

```bash
npm run factory:review:daily
```

The guarded command writes `scripts/.factory-review-state.json` and
`scripts/.factory-metrics.json` locally. Both entry points use the same guard.
If no merged PR is newer than the last audit timestamp, the command
prints a skip message, records the new timestamp, and does not invoke the
Factory Reviewer backend.
