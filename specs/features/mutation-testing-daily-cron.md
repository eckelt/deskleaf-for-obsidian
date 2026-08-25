# Feature: Mutation Testing (Daily Cron, Decoupled from Build Lane)

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## Related Issue
#58

## User Story
Als Projektinhaber möchte ich einmal täglich automatisiert sehen, wie scharf die
bestehende `vitest`-Suite die reinen Utility-Module wirklich prüft (Mutation
Score, überlebte Mutanten), ohne dass ein langsamer oder roter Mutation-Test-Lauf
jemals einen PR-Merge blockiert.

## Acceptance Criteria
- [ ] AC1: Stryker Mutator (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`)
      ist als Dev-Dependency installiert und per `stryker.config.mjs` (o. ä.)
      konfiguriert, den bestehenden `vitest`-Testlauf zu nutzen.
- [ ] AC2: Die Stryker-Konfiguration mutiert ausschließlich die pure
      Utility-Module ohne Obsidian-API-Abhängigkeit: `src/brain-vault.ts`,
      `src/todo-parser.ts`, `src/event-layout.ts`, `src/date-utils.ts`,
      `src/event-filter.ts`, `src/note-utils.ts`. Module mit Obsidian-Imports
      (z. B. `calendar-view.ts`, `note-manager.ts`) sind explizit ausgeschlossen.
- [ ] AC3: `npm run test:mutation` führt den Mutation-Test-Lauf lokal
      reproduzierbar aus und terminiert mit Exit-Code 0 unabhängig vom
      erreichten Mutation Score (kein `break`-Threshold — kein Gate, siehe
      Non-Goals).
- [ ] AC4: Ein neuer Workflow `.github/workflows/mutation-testing.yml` läuft auf
      `schedule:` (ein täglicher Cron, nachts UTC) und zusätzlich auf
      `workflow_dispatch`. Er ist ein eigenständiger `on:`-Trigger-Satz, referenziert
      keinen `concurrency`-Namen der Build-Lane und wird von keinem anderen
      Workflow ausgelöst oder blockiert.
- [ ] AC5: Der Workflow-Lauf schreibt das Ergebnis (Mutation Score, Anzahl
      Killed/Survived/Timeout-Mutanten, Top-N überlebte Mutanten mit
      Datei:Zeile) als GitHub Actions Job Summary (`$GITHUB_STEP_SUMMARY`).
      Das ist der alleinige, garantierte Sichtbarkeitskanal für dieses Issue.
- [ ] AC6: Ein roter oder fehlgeschlagener Mutation-Test-Lauf im Cron-Workflow
      hat keinerlei Auswirkung auf `build-lane.yml`, offene PRs oder den
      Merge-Prozess — die Job-Konfiguration macht das strukturell unmöglich
      (kein gemeinsamer `concurrency`-Group, kein Aufruf aus der Build-Lane
      heraus, kein Status-Check-Requirement auf PRs).

## Acceptance Scenarios
```gherkin
Scenario: Nightly cron runs mutation tests independent of the build lane
  Given the mutation-testing workflow's schedule trigger fires
  When the run executes `npm run test:mutation`
  Then it completes regardless of the resulting mutation score
  And it does not touch the build-lane concurrency group
  And no open pull request or the build lane is affected by its outcome
```

```gherkin
Scenario: Result is visible without any external reporting channel
  Given a mutation-testing workflow run has finished
  When a maintainer opens that run in GitHub Actions
  Then the Job Summary shows the mutation score and counts of killed/survived/timeout mutants
```

```gherkin
Scenario: Manual reproduction
  Given a developer has the repo checked out locally
  When they run `npm run test:mutation`
  Then Stryker executes against the same target files as the scheduled workflow
  And the process exits 0 regardless of score (no local gate failure)
```

```gherkin
Scenario: Mutation scope excludes Obsidian-coupled modules
  Given the Stryker configuration's `mutate` glob
  When it is evaluated against `src/**/*.ts`
  Then it includes brain-vault.ts, todo-parser.ts, event-layout.ts, date-utils.ts, event-filter.ts, note-utils.ts
  And it excludes files that import from "obsidian" (e.g. calendar-view.ts, note-manager.ts, sidebar-view.ts)
```

## Out of Scope
- Enforcing a mutation-score threshold/gate (`break` config) — explicitly
  deferred to a later iteration per the issue's constraints.
- Posting results as a GitHub issue comment on score decline. There is no
  single issue a repo-wide nightly health check naturally attaches to, and
  "significant decline" would require a baseline-tracking/threshold policy
  this issue does not define. The Job Summary alone fully satisfies "visible."
  A future issue can add issue-comment reporting once that policy exists.
- Touching `scripts/factory-review.sh` / `factory:review:daily` — mentioned in
  the source issue only as precedent, not in scope here.
- A reusable/generic cron-workflow template for other daily jobs — this issue
  ships one concrete workflow; extracting a shared pattern is future work.
- Mutating non-pure modules (view files, readers, clients) — out of reach for
  useful mutation testing without heavy Obsidian-API mocking.

## Affected Areas
- `package.json` (new `devDependencies`: `@stryker-mutator/core`,
  `@stryker-mutator/vitest-runner`; new script `test:mutation`)
- `stryker.config.mjs` (new)
- `.github/workflows/mutation-testing.yml` (new)
- `.gitignore` (Stryker's default report output directory, e.g. `.stryker-tmp/`
  and/or `reports/mutation/`, should not be committed)

## Test Expectations
- Automated: none of the pure-function test suites change — this feature adds
  tooling, not application behaviour, so there is no `tests/*.test.ts` coverage
  to add for AC1–AC3.
- Manual: run `npm run test:mutation` locally; verify it starts, targets only
  the six listed files (check Stryker's own console/HTML output for the file
  list), and exits 0 even if mutants survive.
- Manual: trigger the workflow via `workflow_dispatch` in the Actions tab;
  verify it completes independent of `build-lane.yml` (no shared
  `concurrency` group, no dispatch relationship in either direction) and that
  the run's Job Summary shows the mutation score and survived-mutant list.
- Manual: confirm `.github/workflows/mutation-testing.yml` has no
  `pull_request` or `push` trigger and is not referenced by `build-lane.yml`,
  `issue-pipeline.yml`, or any branch-protection required check.

---

## UX Review
No user-facing UI. The only "surface" is a GitHub Actions Job Summary, which
is Actions' standard reporting mechanism and needs no bespoke review.

Freigabe für `ux-reviewed`.

---

## Design Review
No product design system impact — CI/tooling only, decoupled from
`build-lane.yml` per the issue's explicit constraint.

Freigabe für `design-reviewed`.

---

## QA Report
_Pending_
