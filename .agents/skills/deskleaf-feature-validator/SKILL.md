---
name: deskleaf-feature-validator
description: Validate a Deskleaf implemented feature against its feature spec. Use when Codex is asked to verify QA readiness, validate acceptance criteria, check test coverage for specs/features/[feature-name].md, run validator-style checks, or decide whether a feature can move from qa to done. Do not use for implementing fixes or code-reviewing style-only PR quality.
---

# Deskleaf Feature Validator

Verify that an implemented feature satisfies its acceptance criteria and that
automated acceptance scenarios have meaningful test coverage.

The Validator does not own production code. If validation fails, report the gap;
do not silently fix it unless the user explicitly switches to builder work.

## Required Context

Read only:

- `AGENTS.md`
- `docs/agents/qa-agent.md`
- `docs/agent-workflow.md`
- the target feature spec in `specs/features/`
- relevant tests in `tests/`
- source files needed to confirm UI wiring to tested helpers
- latest GitHub issue comments when the user provides an issue number or asks for live issue validation

Read `docs/design-system.md` when visual or interaction behavior is in scope.

## Workflow

1. Extract every numbered acceptance criterion and acceptance scenario.
2. Check the spec status. `qa` is expected; `approved` is acceptable for pre-merge pipeline validation.
3. Run `npm run check:issue -- <issue-number>` when an issue number is available.
4. Run `npm test`.
5. Run `npm run build`.
6. Run `swift test` only when EventKit or deploy packaging is affected.
7. Map each AC and automated scenario to tests that would fail if the behavior were removed.
8. Inspect source wiring when a DOM or Obsidian interaction is covered through pure helper tests.
9. Update the spec QA Report with pass/fail details, commands run, and untested manual areas.
10. Mark the spec `done` only when the user asked for that final handoff and all required checks pass.

## Pass Standard

Pass only when:

- all relevant commands pass
- each AC has a direct or justified representative test
- skipped or todo tests are not counted as coverage
- current human comments are addressed
- manual QA gaps are explicit instead of hidden

## Failure Output

Lead with the first blocking gap:

- failing command and relevant error
- uncovered AC or scenario
- missing source wiring evidence
- manual QA that is required but not performed

Keep implementation advice concise and separate from the verdict.
