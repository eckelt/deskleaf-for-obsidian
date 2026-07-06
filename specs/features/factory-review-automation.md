# Feature: Factory Review Automation

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Related Issue
#28

## User Story
Als Projektinhaber moechte ich die Agent Factory nach realen Build-Laeufen automatisch und messbar pruefen, damit wiederkehrende Planner-, Builder-, Validator-, Reviewer- und Human-Acceptance-Loops frueh sichtbar werden und der Human weniger vermeidbare Nacharbeit leisten muss.

## Acceptance Criteria
- [ ] AC1: Ein Factory-Review-Lauf kann taeglich oder manuell gestartet werden, prueft aber zuerst, ob seit dem letzten Audit mindestens ein PR gemerged wurde.
- [ ] AC2: Wenn seit dem letzten Audit kein PR gemerged wurde, beendet sich der Lauf ohne LLM-/Agent-Aufruf und aktualisiert den Audit-Zeitpunkt.
- [ ] AC3: Wenn seit dem letzten Audit PRs gemerged wurden, erzeugt der Lauf Factory-Metriken und uebergibt sie zusammen mit dem Factory-Reviewer-Prompt an den konfigurierten Backend-Agenten.
- [ ] AC4: Die Factory-Metriken enthalten pro betroffener Issue mindestens PR-Anzahl, Validator-Failures, Reviewer-Failures, Planner-Returns, Human-Rejections/Fix-Forward-Signale, Wrong-Spec-Signale, Loop-Count und ein `notable`-Flag.
- [ ] AC5: Eine Issue ist `notable`, wenn der Loop-Count groesser als 3 ist, mehr als 3 PRs dazu gemerged wurden, mehr als ein Planner-Return vorkam oder ein Wrong-Spec-Signal gefunden wurde.
- [ ] AC6: Die Factory-Reviewer-Regeln dokumentieren, dass Verbesserungen messbar begruendet werden sollen und Issues mit mehr als drei gesamten Rejection-Loops bemerkenswert sind.
- [ ] AC7: Die Workflow-Dokumentation beschreibt Factory Reviewer, Factory-Metriken, den guarded Audit-Lauf und den optionalen UX Designer als Planungsunterstuetzung.
- [ ] AC8: Die UX-Designer-Agentendefinition beschreibt Modellwahl, Eingaben, Scope-Control und Ausgabeformat, ohne dem UX Designer Spec- oder Code-Ownership zu geben.

## Acceptance Scenarios
```gherkin
Scenario: Guard skips review when nothing was built
  Given the Factory Review state contains a last audit timestamp
  And no pull request was merged after that timestamp
  When the guarded Factory Review command runs
  Then it exits successfully without invoking the Factory Reviewer agent
  And it records the new last audit timestamp
```

```gherkin
Scenario: Review runs with metrics after a build
  Given at least one pull request was merged after the last audit timestamp
  When the guarded Factory Review command runs
  Then it gathers Factory Metrics for the issues connected to those pull requests
  And it passes those metrics to the Factory Reviewer agent
  And it records the new last audit timestamp after the run
```

```gherkin
Scenario: Notable issue threshold protects human acceptance load
  Given an issue has two Validator failures, one Reviewer failure, and one human fix-forward comment
  When Factory Metrics are generated for that issue
  Then the loop count is 4
  And the issue is marked notable
```

```gherkin
Scenario: UX Designer remains planning support
  Given a feature needs screenshot or interaction-flow exploration
  When the UX Designer is used
  Then it produces UX contract material for the Planner
  And it does not own the feature spec or production code
```

## Out of Scope
- Running the Factory Reviewer after every poll cycle.
- Making the UX Designer a mandatory pipeline stage.
- Automatically changing feature specs or production code from Factory Reviewer output.
- Replacing human acceptance with automated UX approval.

## Open Questions
_None_

## Affected Areas
- `.github/agents/factory-reviewer.md`
- `.github/agents/ux-designer.md`
- `scripts/factory-review.sh`
- `scripts/factory-metrics.mjs`
- `package.json`
- `.gitignore`
- `docs/agent-workflow.md`
- `docs/adr/0001-autonomous-issue-pipeline.md`
- `CONTEXT.md`
- `README.md`

## Test Expectations
- Automated: Add or maintain focused tests or script-level checks for `scripts/factory-metrics.mjs` covering merged-PR filtering, issue association through `feature/issue-N` branches, loop-count calculation, human-rejection matching, wrong-spec matching, and the `notable` threshold.
- Automated: Add or maintain a shell-level check for `scripts/factory-review.sh` proving the no-merged-PR guard exits before invoking an agent and updates state.
- Manual: Run `npm run factory:metrics` against the live repository and inspect that the JSON shape contains `summary` and per-issue metric fields from AC4.
- Manual: Run `npm run factory:review` in a no-new-merge state and verify it prints a skip message instead of invoking a model.
- Documentation review: Verify ADR, workflow docs, Factory Reviewer prompt, and UX Designer prompt preserve artifact ownership: Planner owns specs, Builder owns code, Factory Reviewer is meta, UX Designer is planning support.

---

## UX Review
The UX Designer is intentionally introduced as optional planning support because the human identified visual and expected-behaviour misses as a recurring acceptance burden. The role should be used when screenshots, interaction flow, or manual QA expectations would otherwise stay implicit.

Freigabe fuer `ux-reviewed`.

---

## Design Review
No product UI design impact. Process design is captured in ADR 0001 and the workflow docs.

Freigabe fuer `design-reviewed`.

---

## QA Report
_Pending_
