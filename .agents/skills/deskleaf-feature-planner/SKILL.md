---
name: deskleaf-feature-planner
description: Plan Deskleaf GitHub feature issues into challenged, implementation-ready specs. Use when Codex is asked to analyze, triage, clarify, or plan a Deskleaf issue before implementation; create or update specs/features/[feature-name].md; ask focused GitHub issue questions when product behavior, UX, architecture, or acceptance criteria are ambiguous. Do not use for implementing code from an approved spec.
---

# Deskleaf Feature Planner

Turn a human-authored GitHub issue into a clear, challenged feature spec in
`specs/features/[feature-name].md`.

The GitHub issue is the discussion surface. The feature spec is the source of
truth for implementation.

## Canonical Context

Read only the context needed for the issue.

Always start with:

- `AGENTS.md`
- `docs/agents/feature-planner.md`
- `docs/agent-workflow.md`
- `docs/design-system.md` when UI or interaction behavior is involved
- `docs/adr/README.md` and relevant ADRs when architecture or pipeline rules are involved
- existing relevant specs in `specs/features/`
- relevant implementation files in `src/`

Do not scan the whole repository by default.

## Workflow

1. Read the issue text and latest human comments.
2. Check whether a feature spec already exists.
3. Compare the request with current implementation and relevant specs.
4. Challenge vague, overloaded, contradictory, or risky requirements.
5. Ask focused questions when implementation would otherwise require guessing.
6. Create or update one feature spec when scope is clear enough.
7. Keep open questions explicit in the spec.
8. Mark the spec `approved` only when the Feature Builder can implement without inferring product intent.

## Triage

Triaging is part of planning. Do not create a spec if the issue is:

- empty or too vague to infer a desired outcome
- only a question or discussion
- a duplicate
- unbounded in scope
- already labelled `wontfix`, `invalid`, or `duplicate`

Ask questions instead of inventing intent.

## Spec Requirements

The spec must include:

- user story
- acceptance criteria
- out of scope
- open questions
- UX review notes when interaction behavior is involved
- design review notes or a design review request when visual behavior is uncertain
- affected areas
- test expectations
- current status

For non-trivial behavior, include lightweight Given/When/Then acceptance
scenarios in Markdown. Do not introduce Cucumber tooling.

Acceptance criteria must be observable from user behavior, plugin output, or
stable domain invariants. Keep implementation notes separate from acceptance
criteria.

## GitHub Comments

When posting planner questions or status comments to GitHub, start every comment
with `🤖`.

Batch related questions into one comment. After asking questions, stop planning
until the author replies.

When running in an eval, dry run, or local planning review, do not post to
GitHub unless the user explicitly asks for live issue updates.

## Stop Conditions

Do not produce an implementation-ready spec if:

- user-facing behavior is ambiguous
- required design behavior is unspecified
- acceptance criteria are not observable
- the issue conflicts with an ADR or architecture rule
- a new architecture decision is required but not captured
- the Feature Builder would need to infer product intent

Return the issue to planning or ask questions instead.

## Handoff

When the spec is ready:

- set status to `approved`
- update the GitHub label to `status:ready-for-build` if live GitHub updates are in scope
- comment with the spec path and a short handoff summary if live GitHub updates are in scope

Do not implement production code.
