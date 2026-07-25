---
name: deskleaf-feature-builder
description: Implement approved Deskleaf feature specs into production code. Use when Codex is asked to build, implement, fix, or continue a Deskleaf feature from specs/features/[feature-name].md with status approved, in-development, or qa; add focused tests; update the spec QA notes; run npm test and npm run build. Do not use when only planning, triaging, reviewing a PR, or validating acceptance coverage.
---

# Deskleaf Feature Builder

Implement one approved feature spec with the smallest coherent code change.

The feature spec is the source of truth. Do not implement directly from a
GitHub issue unless the user explicitly asks for emergency manual work and
accepts bypassing the normal pipeline.

## Required Context

Read only the context needed for the feature:

- `AGENTS.md`
- `docs/agents/feature-builder.md`
- `docs/agent-workflow.md`
- relevant ADRs in `docs/adr/`
- `docs/design-system.md` when UI or interaction behavior is involved
- the target spec in `specs/features/`
- relevant source and test files named or implied by the spec

Do not scan all specs or all source files by default.

## Workflow

1. Confirm the spec status is `approved`, `in-development`, or `qa`.
2. Extract acceptance criteria, acceptance scenarios, affected areas, and test expectations.
3. If product behavior, design behavior, or architecture ownership is ambiguous, stop and return to planning.
4. Set the spec status to `in-development` before production edits.
5. Add or update focused tests before or alongside implementation.
6. Implement within existing module responsibilities and naming patterns.
7. Run `npm test` and `npm run build`.
8. Update the spec QA Report with exact verification results and known gaps.
9. Set the spec status to `qa` unless the user explicitly wants to mark it `done`.

## Implementation Rules

- Keep shared types in `src/types.ts`.
- Keep direct DOM work inside view files.
- Keep date math, filtering, parsing, layout, and note helpers pure where the repo already does so.
- Keep styling in `styles.css`, except dynamic CSS custom properties such as `--cal-h` or established `--f-*` values.
- Follow surrounding code before introducing abstractions.
- Do not add a shared abstraction before the third clear occurrence.
- Do not broaden scope beyond the spec.
- Do not weaken TypeScript types, tests, or acceptance criteria to make a build pass.

## Stop Conditions

Stop and report the planning gap if:

- the spec is missing or not mature enough to build from
- acceptance criteria conflict or require guessing
- a required UX decision is absent
- an ADR is needed before implementation can proceed
- implementation would require changing artifact ownership rules

## Output

Summarize changed files, verification commands, and remaining risks. Include the
spec path and status after the change.
