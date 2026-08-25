# Feature: Code Quality Baseline (ESLint + sonarjs, Decoupled Nightly Report)

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## Related Issue
#71

## User Story
Als Projektinhaber möchte ich einmal täglich automatisiert eine über die Zeit
vergleichbare Code-Qualitäts-Kennzahl sehen (Anzahl gemeldeter Code-Smells im
`src/`-Baum), ohne ein kostenpflichtiges Cloud-Tool zu benötigen und ohne dass
ein schlechter oder roter Lauf jemals einen PR-Merge blockiert.

## Acceptance Criteria
- [ ] AC1: ESLint ist als Dev-Dependency installiert und per `eslint.config.mjs`
      (Flat Config) so konfiguriert, dass es `src/**/*.ts` parst
      (`@typescript-eslint/parser`) und die Regeln aus `eslint-plugin-sonarjs`
      anwendet.
- [ ] AC2: Alle `sonarjs`-Regeln sind auf Severity `"warn"` gesetzt, nicht
      `"error"` — analog zu Stryker's `thresholds.break: null` bei der
      Mutation-Testing-Baseline gibt es hier bewusst kein Gate: `eslint`
      terminiert unabhängig von der Anzahl gefundener Code-Smells mit
      Exit-Code 0.
- [ ] AC3: `npm run lint:quality` führt ESLint gegen `src/**/*.ts` aus, schreibt
      einen JSON-Report nach `reports/quality/eslint.json` und terminiert lokal
      reproduzierbar mit Exit-Code 0, unabhängig von der Anzahl der Findings.
- [ ] AC4: Ein neues Skript liest diesen JSON-Report und berechnet die
      Kennzahl (Gesamtzahl der Findings im `src/`-Baum) sowie eine Aufschlüsselung
      nach Regel (`ruleId` → Anzahl) und eine Top-N-Liste der betroffenen
      Datei:Zeile-Stellen.
- [ ] AC5: Ein neuer Workflow `.github/workflows/code-quality-baseline.yml`
      läuft auf `schedule:` (ein täglicher Cron, nachts UTC, zeitlich versetzt
      zum bestehenden `mutation-testing.yml`-Cron) und zusätzlich auf
      `workflow_dispatch`. Er ist ein eigenständiger `on:`-Trigger-Satz,
      referenziert keinen `concurrency`-Namen der Build-Lane oder von
      `mutation-testing.yml`, und wird von keinem anderen Workflow ausgelöst
      oder blockiert.
- [ ] AC6: Der Workflow-Lauf schreibt das Ergebnis (Gesamtzahl Findings,
      Aufschlüsselung nach Regel, Top-N Fundstellen mit Datei:Zeile) als
      GitHub Actions Job Summary (`$GITHUB_STEP_SUMMARY`). Das ist der
      alleinige, garantierte Sichtbarkeitskanal für dieses Issue.
- [ ] AC7: Ein Lauf mit vielen oder gestiegenen Findings im Cron-Workflow hat
      keinerlei Auswirkung auf `build-lane.yml`, offene PRs oder den
      Merge-Prozess — die Job-Konfiguration macht das strukturell unmöglich
      (kein gemeinsamer `concurrency`-Group, kein Aufruf aus der Build-Lane
      heraus, kein Status-Check-Requirement auf PRs).

## Acceptance Scenarios
```gherkin
Scenario: Nightly cron runs the code-quality baseline independent of the build lane
  Given the code-quality-baseline workflow's schedule trigger fires
  When the run executes `npm run lint:quality`
  Then it completes with exit code 0 regardless of how many findings sonarjs reports
  And it does not touch the build-lane or mutation-testing concurrency groups
  And no open pull request or the build lane is affected by its outcome
```

```gherkin
Scenario: Result is visible without any external reporting channel
  Given a code-quality-baseline workflow run has finished
  When a maintainer opens that run in GitHub Actions
  Then the Job Summary shows the total finding count, the breakdown by rule,
    and the top offending file:line locations
```

```gherkin
Scenario: Manual reproduction
  Given a developer has the repo checked out locally
  When they run `npm run lint:quality`
  Then ESLint executes the sonarjs rules against the same `src/**/*.ts` scope
    as the scheduled workflow
  And the process exits 0 regardless of the number of findings (no local gate failure)
```

```gherkin
Scenario: Findings are informative, never a merge gate
  Given the eslint.config.mjs sonarjs rule set
  When any sonarjs rule matches code in src/
  Then it is reported at "warn" severity, not "error"
  And `npm run lint:quality` still exits 0
```

## Out of Scope
- SonarCloud or any other paid cloud service — explicitly excluded per the
  issue's constraints (private repo, no budget).
- Any lint/quality threshold or `break` gate on this metric, or wiring
  `lint:quality` into `build-lane.yml` or branch protection — this is a
  reporting-only nightly run, exactly like the mutation-testing precedent.
- General-purpose ESLint style/formatting rules (e.g. `eslint:recommended`,
  Prettier integration, import-order rules). This issue is scoped to the
  Sonar-style code-smell/complexity/duplication metric from
  `eslint-plugin-sonarjs`, not a general linting baseline for the codebase.
  A broader lint setup is future work.
- Fixing any of the code smells `eslint-plugin-sonarjs` currently reports in
  `src/`. This issue ships the measurement, not the cleanup.
- Adding the metric as a step inside `mutation-testing.yml`. A dedicated
  workflow is chosen instead so the two nightly reports (test-suite strength
  vs. static code smells) stay independently triggerable, readable, and
  timeable, matching this issue's title ("entkoppelter Nightly-Report") and
  the existing one-report-per-workflow pattern.
- Posting results as a GitHub issue comment on regression. Same reasoning as
  the mutation-testing precedent: no single issue this repo-wide nightly
  check naturally attaches to, and "regression" needs a baseline-tracking
  policy this issue does not define. The Job Summary alone satisfies
  "visible."

## Affected Areas
- `package.json` (new `devDependencies`: `eslint`, `@typescript-eslint/parser`,
  `eslint-plugin-sonarjs`; new scripts `lint:quality` and `quality:summary`).
  `@typescript-eslint/eslint-plugin` is also required alongside the parser: two
  pre-existing `// eslint-disable-next-line @typescript-eslint/<rule>` comments
  in `src/` (unrelated to this feature, out of scope to touch) reference rules
  from that plugin's namespace. Without registering the plugin, ESLint's flat
  config reports "Definition for rule '@typescript-eslint/<rule>' was not
  found" as an error and `eslint` exits 1 — violating AC3/AC7's exit-0
  guarantee. No rules from the plugin are enabled; it is registered solely so
  those pre-existing disable comments resolve.
- `eslint.config.mjs` (new)
- `scripts/quality-summary.mjs` (new)
- `.github/workflows/code-quality-baseline.yml` (new)
- `.gitignore` (new report output directory `reports/quality/` should not be
  committed, same pattern as `reports/mutation/`)

## Test Expectations
- Automated: add a focused Vitest suite for `scripts/quality-summary.mjs`
  covering total-finding count, per-rule breakdown, and top-N file:line
  selection from a fixture ESLint JSON report — mirrors the existing
  `mutation-summary.mjs` test coverage pattern.
- Manual: run `npm run lint:quality` locally; verify it starts, scopes to
  `src/**/*.ts`, applies sonarjs rules at `warn` severity, and exits 0 even
  with findings present.
- Manual: trigger the workflow via `workflow_dispatch` in the Actions tab;
  verify it completes independent of `build-lane.yml` and `mutation-testing.yml`
  (no shared `concurrency` group with either, no dispatch relationship in
  either direction) and that the run's Job Summary shows the total count,
  per-rule breakdown, and top offending locations.
- Manual: confirm `.github/workflows/code-quality-baseline.yml` has no
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
`build-lane.yml` and from `mutation-testing.yml` per the issue's explicit
"entkoppelt" requirement.

Freigabe für `design-reviewed`.

---

## QA Report
_Pending_
