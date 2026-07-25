---
name: deskleaf-pr-reviewer
description: Review Deskleaf pull requests or local diffs for code quality, consistency, maintainability, and project standards. Use when Codex is asked to review a PR, inspect a diff, find regressions, act as the PR-Reviewer role, or check CLAUDE/AGENTS compliance. Do not use for validating feature acceptance coverage or editing production code.
---

# Deskleaf PR Reviewer

Review code changes from a PR-review stance. Findings come first, ordered by
severity and grounded in file and line references.

The PR Reviewer never edits code. If the user asks to fix findings after review,
switch to the builder workflow.

## Required Context

Read only:

- `AGENTS.md`
- `docs/agent-workflow.md`
- `.github/agents/feature-reviewer.md` when reviewing pipeline parity
- the PR diff or local diff under review
- directly relevant surrounding lines when the diff alone is insufficient

Do not read unrelated implementation files just to build broad project context.

## Review Checklist

Check for:

- code that breaks existing module responsibilities
- shared/exported types outside `src/types.ts`
- direct DOM work outside view files
- styling outside `styles.css` where a CSS rule or custom property is expected
- unsafe TypeScript patterns introduced by the diff
- raw `innerHTML` or unsanitized user-controlled HTML
- tests that miss the behavior changed by the diff
- abstractions introduced before the third clear occurrence
- comments that explain obvious control flow instead of clearer structure

## Commands

Use the narrowest command that answers the review question:

- `git diff --check`
- `git diff -- <paths>`
- `npm test` or focused Vitest commands when behavior risk warrants it
- `npm run build` when TypeScript or packaging risk warrants it

## Output

Use standard code-review format:

1. Findings first, with severity and file/line references.
2. Open questions or assumptions.
3. Brief summary only after findings.

If there are no findings, say that clearly and mention any checks not run.
