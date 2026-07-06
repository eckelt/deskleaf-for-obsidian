# ADR 1: Autonomous Multi-Agent Issue Pipeline

Date: 2026-06-25

## Status
Proposed

## Context

`scripts/issue-watch.sh` is a local polling daemon that drives GitHub issues
through a chain of `claude -p` agent calls (assess → plan → build → review →
qa). It encodes an implicit pipeline design that diverges from the intended
agile workflow in several structural ways, and parts of it are known to be
fragile (a comment from a bot bumps the issue `updatedAt`, which immediately
re-triggers the next dispatch — already worked around by *not* posting in one
branch).

We want a small set of role-based agents that mirror an agile team, with strict
artifact ownership and a human as the only one who accepts work. This ADR fixes
the design so future work on the daemon and the agent prompts has a stable rule
to follow. The decisions below were reached in a design interview; this record
is the shared contract between the daemon, the agent prompts, and the human.

## Decision

### Roles — four agents, not five

- **Planner (PO).** Picks up unlabelled issues and **triages them itself** —
  it may `SKIP` in its first pass (the previous separate `feature-assessor`
  stage is removed and folded in here). It clarifies scope with the issue
  author through a **multi-round, asynchronous grilling over GitHub comments**
  (see below). It owns the **spec**. When a feature is too large to be built
  reliably in one slice, it **splits it into N independent child sub-issues**.
- **Builder.** Implements an approved spec (TDD, Clean Code). It owns the
  **code**. A builder PR may contain code **plus an ADR** (see artifact rules).
- **PR-Reviewer.** Judges the PR diff for consistency, readability, and
  maintainability. **Never edits code.**
- **Validator.** Confirms the spec is met: `npm test` green **and** every
  acceptance criterion (AC) is covered by a test. **Never edits code.**
- **Factory Reviewer.** Audits completed build loops using Factory Metrics after
  real PRs have merged. It is a meta-reviewer: it proposes measurable pipeline
  or prompt improvements and **never edits specs or code**.
- **UX Designer (optional).** Supports the Planner for screenshot,
  interaction-flow, and manual QA exploration. It produces UX contract material
  for the Planner and **does not own specs or code**.

### Artifact ownership

- **Spec** — written **only by the Planner**.
- **Code** — written **only by the Builder**.
- **ADR / Glossary** — **shared artifacts**. The human, the Planner (capturing
  architecture insight from a grilling session), and the Builder (when a
  ground-rule decision is forced during implementation to keep code consistent)
  may all write them. They live globally under `docs/adr/`, are kept separate
  from feature specs, and are the primary long-lived artifact the human reads.

### Clarification is async, multi-round, and blocking

The Planner clarifies with the author by posting comments and reading replies
across poll cycles. Rounds are real (it keeps asking until scope is sharp), but
it **batches as many questions as possible per round** to minimise the number
of rounds. While it waits, the issue sits in an `awaiting-author` state and is
skipped each cycle — it does **not** block the build lane (see concurrency). The
Planner only writes the spec once it judges scope to be understood; it does not
ask artificial questions when the issue is already clear.

### Splitting large features

The Planner decomposes an oversized issue into **N new child sub-issues** (one
spec each). The parent becomes an epic, is labelled accordingly, and sleeps.
Each child runs the pipeline as a normal **1 issue = 1 spec = 1 PR** unit. The
**human closes the parent** once all children are done.

### Branching and merge — trunk-based in spirit

True commit-to-`main` by an autonomous agent is rejected: the Reviewer and
Validator stages exist precisely to gate bad code *before* it reaches the
trunk, and an Obsidian plugin runtime has no sane feature-flag mechanism to hide
unfinished work. Instead we keep the *spirit* of trunk-based development:

- Each (child) issue is already a **small, independent slice**.
- It is built on a **short-lived branch** in a **dedicated git worktree**,
  isolated from the human's working tree.
- The **PR is only the review/acceptance surface**, not a long-lived branch.
- On all-green (review + validate), the **agent auto-merges** and the worktree
  is cleaned up.

### Acceptance is post-merge, with fix-forward

After auto-merge the issue is labelled `ready-for-acceptance`.

- Human **closes the issue → accepted.**
- Human **comments a clarification → fix-forward**: a fresh pass on a new
  branch. The Planner reads the clarification, **classifies** it, asks back only
  if something is genuinely unclear, and otherwise routes straight to the
  Builder (adjusting the spec/ADR first only if architecture is affected).

### Failure routing

A Validator failure (e.g. "AC-3 has no test") goes **back to the Builder** by
default — it is an implementation gap, not a planning gap. It escalates **to the
Planner only after repeated failure on the same AC**, which signals an unclear
or contradictory spec.

### Concurrency — two lanes

- **Planning pool — parallel.** Any number of issues may sit in grilling at
  once. This is required because each clarification blocks on the *human* for
  hours or days; serialising it would stall everything.
- **Build queue — strictly sequential.** Build → Review → Validate → Merge runs
  under a **global mutex**: one issue, one worktree at a time. Parallel builds
  are explicitly deferred and may be revisited later.

### Signalling — `🤖` marker convention

The whole async design hinges on the loop distinguishing "the human said
something new → act" from "the bot commented → ignore". Because `gh` runs under
the human's own identity, author cannot disambiguate them. Therefore **every bot
comment is prefixed with `🤖`**, and the loop triggers **only on comments that
do not start with `🤖`**. This replaces the fragile `updatedAt > lastSeen`
trigger. (Trade-off: convention-based and breakable if the human ever types a
leading `🤖`; a dedicated bot account is the robust alternative if this proves
insufficient.)

## Consequences

This is a substantial rebuild of `scripts/issue-watch.sh`: the trigger mechanism
and state machine are effectively rewritten. Concrete deltas from today's
script:

1. Remove the `assess` stage; fold triage into the Planner's first pass.
2. Implement multi-round async grilling with an `awaiting-author` state and
   `🤖`-aware reply detection, replacing the `updatedAt > lastSeen` trigger.
3. Add sub-issue splitting and epic handling.
4. Build on a per-issue **git worktree + short-lived branch**; add a **global
   build mutex**, **auto-merge** on all-green, and worktree cleanup. (Today
   everything builds in the human's main tree on `main` — guaranteed to
   collide.)
5. Route Validator failures to the Builder with a per-AC escalation counter
   (today it wrongly goes to the Planner).
6. Allow the Builder to commit an ADR alongside code; keep `docs/adr/` and a
   glossary as shared, global artifacts.
7. Model **post-merge acceptance** and **fix-forward re-entry** as explicit
   stages.
8. Run a **two-lane scheduler**: planning parallel, build sequential.
9. Add a guarded Factory Review audit. It may run daily or manually, but first
   checks whether at least one PR was merged since the previous audit. If not,
   it updates the audit timestamp and exits without an LLM/agent call. If yes,
   it generates Factory Metrics and passes them to the Factory Reviewer.
10. Factory Metrics track each affected issue's PR count, Validator failures,
    Reviewer failures, Planner returns, human rejection/fix-forward signals,
    wrong-spec signals, total loop count, and `notable` flag. Issues are notable
    when the loop count is greater than 3, more than 3 PRs were merged, more
    than one Planner return occurred, or a wrong-spec signal was found. More
    than three total rejection loops are treated as notable human acceptance
    load.

Risks accepted: the `🤖` convention is breakable; sequential builds limit
throughput (deliberately, for now); auto-merge means unreviewed-by-human code
can land on `main`, mitigated by the Reviewer + Validator gates and the
fix-forward acceptance loop.
