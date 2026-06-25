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
- Owns the spec. Does not write production code.

### Feature Builder
Implements an approved spec with TDD and Clean Code.

- Runs inside a dedicated git worktree on a short-lived feature branch.
- Writes a failing test per acceptance criterion first, then makes it pass.
- May add an ADR alongside the code when a ground-rule decision is forced.
- Runs `npm test` and `npm run build`, then opens the PR.

### PR-Reviewer
Judges the PR diff for consistency, readability, and maintainability against
`CLAUDE.md`. Never edits code.

### Validator
Confirms the spec is met: `npm test` green **and** every acceptance criterion
covered by a test. Never edits code. Visual/manual QA in the running Obsidian
app is the human's job at acceptance.

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
5. On all-green the daemon **auto-merges** (`--squash`), cleans up the worktree,
   and labels the issue `ready-for-acceptance`.

## Signalling — the `🤖` convention

Because the daemon and the human comment under the same GitHub identity, every
bot comment is prefixed with `🤖`. The loop triggers **only on comments that do
not start with `🤖`**, so it never reacts to its own output.

## Human acceptance & fix-forward

Acceptance happens **after** merge:

- **Close the issue → accepted.** (Closed issues drop out of the poll.)
- **Comment a clarification → fix-forward.** The Planner reads it, asks back
  only if genuinely unclear, and otherwise routes a fresh build. The human
  closes the parent epic once all its children are done.

## Running it

```bash
bash scripts/issue-watch.sh
```

The daemon calls `claude -p` per stage. Tool permissions for the unattended
agents come from the checked-in `.claude/settings.json` allowlist (gh, git,
npm, file edits), which the daemon also copies into each worktree. If an agent
stalls on a denied command, add it there. The blunt fallback is
`--dangerously-skip-permissions` (see the `CLAUDE_FLAGS` comment in the script).
