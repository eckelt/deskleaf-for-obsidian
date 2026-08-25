# Feature: Factory Metrics — Time-to-Done, GitHub-Actions Minutes, Aggregated Agent Cost

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Related Issue
#70 (child of epic #68; builds on child #69 — Agent-Run-Metriken im Pipeline-State — but must not depend on #69 being merged)

## User Story
Als Projektinhaber moechte ich in den bestehenden Factory-Metriken pro Issue zusaetzlich sehen, wie lange es bis zur Fertigstellung gedauert hat, wie viele GitHub-Actions-Minuten dafuer verbraucht wurden und wie viel Kosten/Tokens die beteiligten Agentenlaeufe verursacht haben, damit ich die Factory objektiv gegen manuelles Arbeiten vergleichen kann, ohne dass fehlende Daten den bestehenden Report zum Absturz bringen.

## Acceptance Criteria
- [ ] AC1: `createFactoryMetrics()` ergaenzt pro Issue `timeToDoneMs`: die Differenz zwischen der Issue-`createdAt` und entweder der Issue-`closedAt` (wenn geschlossen) oder dem Zeitpunkt des letzten `status:ready-for-acceptance`-Label-Events (wenn das Issue noch offen ist, aber bereits einmal `ready-for-acceptance` erreicht hat). Hat das Issue weder ein `closedAt` noch je das Label erreicht, ist `timeToDoneMs` `null`.
- [ ] AC2: `createFactoryMetrics()` ergaenzt pro Issue `actionsMinutes`: die aufsummierte Laufzeit (in Minuten) aller "Issue Pipeline"- und "Build Lane"-Workflow-Runs, die zu diesem Issue gehoeren, als Kosten-Proxy. Ein Issue ohne zugeordnete Runs erhaelt `actionsMinutes: 0`, nicht `null` (es ist ein Summenwert, keine Zeitstempel-Differenz).
- [ ] AC3: `createFactoryMetrics()` ergaenzt pro Issue `agentCost`, aggregiert aus dem `agentRuns`-Array im Pipeline-State-Kommentar des Issues (falls vorhanden, siehe #69): `{ runCount, totalCostUsd, totalInputTokens, totalOutputTokens, totalDurationMs }`. Jede Summe zaehlt nur vorhandene numerische Werte zusammen; liefert kein einziger Run einen bestimmten Wert, ist dessen Summe `null` statt `0`. Fehlt der Pipeline-State-Kommentar, das `agentRuns`-Array oder ist es leer, ist das Ergebnis `{ runCount: 0, totalCostUsd: null, totalInputTokens: null, totalOutputTokens: null, totalDurationMs: null }` — der Report bricht in keinem Fall ab.
- [ ] AC4: Die drei neuen Felder erscheinen als zusaetzliche Felder auf demselben Pro-Issue-Objekt, das bereits `prCount`, `loopCount`, `notable` etc. traegt — kein separater Report, keine zweite Datenstruktur.
- [ ] AC5: Die bestehenden Felder und deren Berechnung (`prCount`, `validatorFailures`, `reviewerFailures`, `plannerReturns`, `humanRejections`, `wrongSpecSignals`, `loopCount`, `notable`, `pullRequests`) bleiben unveraendert.

## Acceptance Scenarios
```gherkin
Scenario: Time-to-done for a closed issue uses the close timestamp
  Given an issue with createdAt "2026-07-01T00:00:00Z" and closedAt "2026-07-03T00:00:00Z"
  When Factory Metrics are generated for that issue
  Then timeToDoneMs equals the difference between closedAt and createdAt
```

```gherkin
Scenario: Time-to-done for a still-open issue falls back to the last ready-for-acceptance event
  Given an issue with createdAt "2026-07-01T00:00:00Z" that is still open
  And the "status:ready-for-acceptance" label was most recently added at "2026-07-04T00:00:00Z"
  When Factory Metrics are generated for that issue
  Then timeToDoneMs equals the difference between "2026-07-04T00:00:00Z" and createdAt
```

```gherkin
Scenario: Time-to-done is null for an issue that never reached ready-for-acceptance and is still open
  Given an issue that is still open
  And the "status:ready-for-acceptance" label was never added
  When Factory Metrics are generated for that issue
  Then timeToDoneMs is null
```

```gherkin
Scenario: Actions minutes sum Issue Pipeline and Build Lane runs for the issue
  Given the issue has two associated "Issue Pipeline" runs of 4 and 6 minutes
  And one associated "Build Lane" run of 20 minutes
  When Factory Metrics are generated for that issue
  Then actionsMinutes is 30
```

```gherkin
Scenario: Aggregated agent cost sums available fields across agent runs
  Given the issue's pipeline-state comment has an agentRuns array with two entries
  And the first entry has costUsd 0.12 and inputTokens 1000, the second has costUsd 0.08 and no inputTokens field
  When Factory Metrics are generated for that issue
  Then agentCost.runCount is 2
  And agentCost.totalCostUsd is 0.20
  And agentCost.totalInputTokens is 1000
```

```gherkin
Scenario: Missing agent-run data does not abort the report
  Given the issue's pipeline-state comment has no agentRuns array
  When Factory Metrics are generated for that issue
  Then the report is generated successfully
  And agentCost is { runCount: 0, totalCostUsd: null, totalInputTokens: null, totalOutputTokens: null, totalDurationMs: null }
```

## Out of Scope
- Implementing the collection of `agentRuns` itself in `run_agent()` / the pipeline state (that is child issue #69). This feature only *reads* that array if it already exists and must work whether or not #69 has merged.
- Any comparison against manual "vibing" sessions with Claude directly outside the pipeline.
- Any gate or threshold based on time, Actions minutes, or agent cost — these fields are informational only, same as the existing loop metrics.
- The Code-Quality Baseline (child issue #71).
- Prescribing the exact `gh api`/`gh run list` fields used to associate a workflow run with an issue number, or the exact shape used to read label-add timestamps — these are existing-pattern GitHub API lookups the Builder verifies empirically against a real run (same allowance already used for the `agentRuns` CLI-output schema in #69), analogous to the existing `gh pr list` / `gh issue view` loaders already in this file.

## Open Questions
_None_

## Affected Areas
- `scripts/factory-metrics.mjs`
- `tests/factory-metrics.test.ts`
- `docs/agent-workflow.md`

## Test Expectations
- Automated: Extend `tests/factory-metrics.test.ts` so `createFactoryMetrics()` (or the pure helper(s) it delegates to) is tested directly for AC1 (closed-issue case, open-with-ready-for-acceptance case, open-never-ready case), AC2 (summed minutes across both workflow names, and the zero-runs case), and AC3 (full aggregation, partial-field case, and missing/empty-`agentRuns` case) — pass already-resolved timestamps/run-durations/`agentRuns` data into the pure function rather than mocking `gh`, following the existing pattern in this test file.
- Automated: Update the existing exact-shape assertions in `tests/factory-metrics.test.ts` (the `toEqual` checks that currently list every field) to include the three new fields, so they keep asserting the full per-issue shape rather than silently ignoring the additions.
- Automated: A regression test confirms the five pre-existing fields (`prCount`, `validatorFailures`, `reviewerFailures`, `plannerReturns`, `humanRejections`, `wrongSpecSignals`, `loopCount`, `notable`, `pullRequests`) are unchanged in value for an existing fixture (AC5).
- Manual: Run `npm run factory:metrics` against the live repository and inspect that at least one issue's JSON includes `timeToDoneMs`, `actionsMinutes`, and `agentCost` with the documented shape.
- Documentation review: `docs/agent-workflow.md`'s Factory Reviewer section is updated to mention time-to-done, Actions minutes, and aggregated agent cost alongside the existing PR/loop metrics list.

---

## UX Review
No user-facing UI. This is an internal reporting extension consumed by the Factory Reviewer agent and by manual `npm run factory:metrics` inspection; no Obsidian UI surface is touched.

Freigabe fuer `ux-reviewed`.

---

## Design Review
No product UI design impact — pure data/report extension of an existing Node script, consistent with the additive, non-blocking, informational-only pattern already established for Factory Metrics and Mutation Testing (issue #58). No new design-system elements.

Freigabe fuer `design-reviewed`.

---

## QA Report
_Pending_
