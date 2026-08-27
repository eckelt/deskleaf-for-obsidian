# Feature: Build Lane Hardening — Strict PR-Number Parsing & Safe Branch Deletion

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## Related Issue
#76

## User Story
Als Projektinhaber möchte ich, dass die Build-Lane (`scripts/pipeline/build-lane.sh`)
eine unklare Builder-Antwort niemals als gültige PR-Nummer akzeptiert und
niemals den Head-Branch eines noch offenen, mergefähigen PRs löscht, damit ein
Parsing- oder Fehlerbehandlungsfehler nicht wieder einen grünen, mergefähigen
PR zerstört (siehe Root-Cause-Analyse zu Issue #71, PR #73).

## Background

Konkreter Vorfall (Issue #71, Kommentar-Thread): der Builder antwortete mit
einem mehrzeiligen Text, der mit `PR:` begann (`PR: PR #73 is open, clean,
mergeable; ... no new commit was needed.`), statt der geforderten Einzeilen-
Antwort. `run_lane()`'s Parsing (`grep -q "^PR:"` + `sed 's/^PR: *//'`,
`scripts/pipeline/build-lane.sh:131-132`) akzeptierte den gesamten Text als
PR-Nummer, `gh pr merge` schlug mit dieser ungültigen Kennung fehl, der Lauf
fiel in `send_pipeline_failure_to_planner` — und deren unbedingter Aufruf von
`drop_remote_branch()` (`scripts/pipeline/build-lane.sh:64-66`) löschte den
Head-Branch eines zu dem Zeitpunkt noch offenen, grünen PRs. GitHub schließt
einen PR automatisch und unwiederbringlich, wenn sein Head-Branch gelöscht
wird — es gibt keinen Papierkorb oder Retention-Zeitraum. Der Human (`eckelt`)
bestätigte in Issue #71, dass dies ein Pipeline-Defekt war, kein manueller
Eingriff.

## Acceptance Criteria
- [ ] AC1: Die PR-Nummer wird aus der Builder-Antwort mit einem strikten
      Muster extrahiert, das die **gesamte** Antwort gegen `^PR: *([0-9]+)$`
      prüft (nicht nur einen Präfix-Test auf die erste Zeile). Eine
      mehrzeilige oder sonst wie von der geforderten Einzeiler-Form
      abweichende Antwort — auch wenn sie mit `PR:` beginnt — wird **nicht**
      als PR-Nummer akzeptiert, sondern nimmt denselben Fehlerpfad wie eine
      `FAIL:`-Antwort (`send_pipeline_failure_to_planner`, siehe bestehendes
      Verhalten für den `FAIL:`-Zweig in `run_lane()`).
- [ ] AC2: `drop_remote_branch()` löscht den Branch nur noch, wenn er nicht
      (mehr) der Head-Branch eines offenen PRs ist. Dazu prüft die Funktion
      vor dem Löschen per `gh pr view <branch> --json state,mergeable`
      (oder gleichwertig), ob ein PR mit `state == "OPEN"` auf diesen Branch
      zeigt.
- [ ] AC3: Zeigt ein offener PR auf den Branch, löscht `drop_remote_branch()`
      ihn **nicht**, sondern überspringt die Löschung und protokolliert eine
      Warnung (z. B. via `echo` auf stderr oder `post_comment`) mit der
      betroffenen PR-Nummer, statt den Vorgang stillschweigend zu ignorieren.
- [ ] AC4: Existiert kein offener PR für den Branch (der Normalfall bei einem
      fehlgeschlagenen Build-Versuch ohne PR oder nach dessen Schließung),
      löscht `drop_remote_branch()` den Branch weiterhin wie bisher — das
      bestehende Aufräumverhalten für den Normalfall bleibt unverändert.
- [ ] AC5: Der bestehende Erfolgspfad (`gh pr merge ... --delete-branch`) ist
      von dieser Änderung nicht betroffen — dort löscht GitHub selbst den
      Branch nur nach erfolgreichem Merge; `drop_remote_branch()` wird auf
      diesem Pfad gar nicht aufgerufen.

## Acceptance Scenarios
```gherkin
Scenario: Multi-line builder reply starting with "PR:" is rejected, not accepted
  Given the builder's reply is "PR: PR #73 is open, clean, mergeable; ... no new commit was needed."
  When run_lane() parses the reply for a PR number
  Then the reply does not match the strict "^PR: *([0-9]+)$" pattern against the whole reply
  And the lane takes the failure path (send_pipeline_failure_to_planner), not the merge path

Scenario: Well-formed single-line PR reply is still accepted
  Given the builder's reply is exactly "PR: 73"
  When run_lane() parses the reply for a PR number
  Then the extracted PR number is 73
  And the lane proceeds to validate_step as before

Scenario: Branch deletion is skipped when its PR is still open
  Given branch "feature/issue-71" is the head branch of an open, mergeable PR
  When drop_remote_branch() is called for "feature/issue-71" during failure handling
  Then the branch is not deleted
  And a warning naming the open PR is logged

Scenario: Branch deletion still happens when there is no open PR
  Given branch "feature/issue-76" has no associated open PR
  When drop_remote_branch() is called for "feature/issue-76" during failure handling
  Then the branch is deleted as before
```

## Out of Scope
- Any broader retention/soft-delete/trash policy for branches — GitHub has no
  such mechanism; the fix stops deletion of branches with a live PR, it does
  not add a recovery window after the fact.
- Changing the required single-line contract for the Builder's reply
  (`"PR: <number>"` / `"FAIL: <reason>"`) — this hardens the *parser* on the
  pipeline side, not the Builder's agent prompt.
- Changing `back_to_planner()`'s or `send_pipeline_failure_to_planner()`'s
  logic beyond the fact that they now call a safer `drop_remote_branch()`.
- A GitHub Actions workflow or spec-level product feature — this is
  `scripts/pipeline/*` infrastructure with no user-facing behaviour.

## Open Questions
_None — scope confirmed against issue #76 and the root-cause thread on #71._

## Affected Areas
- `scripts/pipeline/build-lane.sh`: `drop_remote_branch()`, `run_lane()`'s
  `PR:`/`FAIL:` parsing branch.

## Test Expectations
- Automated: keine `tests/*.test.ts`-Abdeckung für dieses Issue — die gesamte
  Änderung liegt in `scripts/pipeline/*.sh` (Bash), das Repo hat kein
  Bash-Testharness (kein `bats`/`shellspec`; `npm test` deckt ausschließlich
  `src/**` per Vitest ab). Dieselbe Ausnahme wurde bereits für die
  Pipeline-Infrastruktur in Issue #58 (Mutation Testing) und Issue #74
  (Agent-Run-Metriken) akzeptiert. Der Builder führt **keine** neue
  Test-Tooling-Einführung durch, um dies zu umgehen.
- Manual: `run_lane()`'s Parsing-Logik gegen die drei Beispiele aus
  `Acceptance Scenarios` lokal durchspielen (echte Werte für `$b` setzen und
  die Bedingung isoliert auswerten, z. B. via `bash -c`) — bestätigen, dass
  der mehrzeilige `PR: PR #73 is open ...`-Text den Fehlerpfad nimmt und
  `PR: 73` weiterhin den Merge-Pfad nimmt.
- Manual: `drop_remote_branch()` gegen einen präparierten Branch mit einem
  offenen PR aufrufen (Test-Repo oder Trockenlauf mit `gh pr view --json
  state,mergeable`) und bestätigen, dass der Branch nicht gelöscht wird und
  eine Warnung mit der PR-Nummer erscheint.
- Manual: `drop_remote_branch()` gegen einen Branch ohne zugehörigen PR
  aufrufen und bestätigen, dass die Löschung wie bisher durchläuft
  (`git push origin --delete <branch>` erfolgreich, kein Fehler bei
  bereits fehlendem Branch).
- Manual: einen kompletten Build-Lane-Lauf gegen ein Test-Issue auslösen, bei
  dem der Builder absichtlich fehlschlägt (`FAIL:`-Antwort), und bestätigen,
  dass sich das bestehende Verhalten (Branch wird gelöscht, Rückgabe an den
  Planner) für den Normalfall ohne offenen PR nicht ändert.

---

## UX Review
_Not applicable — pipeline infrastructure, no user-facing UI._

---

## Design Review
Kein Eingriff in Produktarchitektur oder Datenmodell des Plugins. Die Änderung
hält sich strikt an die bestehende Fehlerbehandlungs-Struktur in
`build-lane.sh` (`run_lane()`, `drop_remote_branch()`,
`send_pipeline_failure_to_planner()`) und führt keine neuen Abhängigkeiten
ein — `gh pr view` wird bereits an anderer Stelle im selben Skript
(`review_step()` via `gh pr diff`) verwendet, das Muster ist konsistent zum
bestehenden Code.

---

## QA Report
_Pending_
