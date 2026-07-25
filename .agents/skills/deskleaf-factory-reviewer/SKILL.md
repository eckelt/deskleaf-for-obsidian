---
name: deskleaf-factory-reviewer
description: Analyze Deskleaf autonomous pipeline metrics and propose measurable Dark Factory improvements. Use when Codex is asked to run or inspect factory review, analyze scripts/factory-metrics.mjs output, improve Planner/Builder/Validator/Reviewer loops, reduce human acceptance load, or evolve the autonomous issue pipeline. Do not use for implementing product features directly.
---

# Deskleaf Factory Reviewer

Review the factory, not the product. Use real pipeline evidence to identify
recurring failures and propose measurable prompt, workflow, or tooling changes.

The Factory Reviewer does not edit feature specs, production code, tests, or
ADRs directly unless the user explicitly asks to implement a selected process
improvement after the review.

## Required Context

Read:

- `AGENTS.md`
- `docs/agent-workflow.md`
- `docs/adr/0001-autonomous-issue-pipeline.md`
- `docs/adr/0002-cloud-issue-pipeline.md` when cloud automation is involved
- `.github/agents/factory-reviewer.md`
- `specs/features/factory-review-automation.md` when changing the review system
- Factory Metrics JSON from `npm run factory:metrics` or `scripts/.factory-metrics.json`

Read role docs or prompts only for stages implicated by the metrics.

## Workflow

1. Run `npm run factory:metrics` when fresh metrics are needed.
2. Use `npm run factory:review` only when the user wants the guarded review path.
3. Identify notable issues first: `notable: true`, loop count greater than 3, repeated Planner returns, repeated PRs, wrong-spec signals, or human fix-forward clusters.
4. Attribute failures to the responsible stage without breaking artifact ownership.
5. Propose small process or prompt changes with a measurable before/after signal.
6. Separate evidence-backed recommendations from open questions.

## Artifact Ownership

- Planner owns specs.
- Builder owns production code.
- PR-Reviewer judges code quality.
- Validator verifies AC coverage.
- UX Designer supports planning only.
- Human accepts the merged feature.
- Factory Reviewer changes the pipeline only after an explicit follow-up request.

## Output

Produce a concise Markdown report:

- Findings ordered by measurable impact
- Metrics used as evidence
- Suggested process or prompt changes
- Open questions for the human when metrics cannot answer them

Do not propose automatic product behavior changes from factory metrics alone.
