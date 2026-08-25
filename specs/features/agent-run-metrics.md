# Feature: Agent-Run-Metriken im Pipeline-State

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## Related Issue
#69 (Teilaufgabe A von Epic #68)

## User Story
Als Projektinhaber möchte ich, dass jeder Agentenlauf der Cloud-Pipeline
(Planner, Builder, Validator, Reviewer — Claude oder Codex) seine Kosten-,
Token- und Laufzeitdaten strukturiert im Pipeline-State des Issues ablegt,
damit ein späterer Report (Kind-Issue B von #68) belastbare Zahlen hat, ohne
dass diese Erfassung das bestehende Verdict-Parsing der Aufrufer verändert
oder die Pipeline bei fehlenden CLI-Feldern blockiert.

## Acceptance Criteria
- [ ] AC1: `run_agent()` in `scripts/pipeline/lib.sh` ruft für
      `backend=claude` die CLI mit `--output-format json` statt reinem
      `-p`-Text auf, und für `backend=codex` mit `codex exec --json` statt
      der reinen `-o <file>`-Textausgabe. In beiden Fällen bleibt `run_agent`s
      stdout exakt derselbe Ein-Zeilen-Verdict-Text, den die aufrufenden
      Skripte (`planner.sh`, `build-lane.sh`) heute per Regex/String-Match
      extrahieren (`grep -E '^(SKIP|QUESTIONS|SPLIT|SPEC|BUILD)'`, `PASS`,
      `FAIL:`, `PR:`) — kein zusätzliches Logging und keine rohen
      JSON-/JSONL-Rohdaten landen in dem stdout, das die Aufrufer erfassen.
- [ ] AC2: `run_agent()` erhält zwei neue Pflichtparameter — Rolle
      (`planner`|`builder`|`validator`|`reviewer`) und Versuchsnummer —, die
      jede der vier Aufrufstellen aus ihrem bereits vorhandenen lokalen
      Kontext übergibt: `run_planner()` in `planner.sh` übergibt `planner`
      und `1` (kein Attempt-Loop dort); `build_step()`/`validate_step()`/
      `review_step()` in `build-lane.sh` übergeben ihre Rolle und die
      laufende `attempt`-Zählung der bestehenden Build-Schleife.
- [ ] AC3: Nach jedem Agentenlauf hängt `run_agent()` genau einen Eintrag an
      das Array-Feld `agentRuns` im Pipeline-State-JSON des Issues an
      (akkumulierend, nicht überschreibend), mit mindestens den Feldern
      `role`, `backend`, `model` (literaler String `"default"`, wenn kein
      Modell-Override gesetzt ist), `attempt`, `costUsd`, `inputTokens`,
      `outputTokens`, `durationMs`.
- [ ] AC4: Liefert die CLI für einen Lauf ein bestimmtes Zahlenfeld nicht
      (z. B. `costUsd` bei einer älteren Codex-Version ohne Kosteninfo), wird
      das jeweilige Feld im Eintrag als JSON `null` geschrieben statt den
      Eintrag oder den Lauf abzubrechen; `run_agent()` liefert seinen
      normalen stdout-Verdict wie zuvor und die aufrufenden Skripte laufen
      unverändert weiter.
- [ ] AC5: `state_load()`s Default-JSON (bei fehlendem oder leerem
      State-Kommentar) enthält neu `"agentRuns": []`, sodass auch ein Issue,
      das die Pipeline schon vor diesem Feature durchlaufen hat, ab dem
      nächsten Lauf ein wohlgeformtes Array besitzt statt eines fehlenden
      Felds.

## Acceptance Scenarios
```gherkin
Scenario: Structured output does not change what callers parse (Claude backend)
  Given run_agent is invoked with backend "claude"
  When the underlying CLI call now requests --output-format json instead of plain text
  Then run_agent's stdout still contains exactly the same verdict text a caller's
    regex/string match currently extracts (e.g. "SPEC: specs/features/x.md", "PASS", "FAIL: ...")
  And no raw JSON or diagnostic output appears in that stdout
```

```gherkin
Scenario: Structured output does not change what callers parse (Codex backend)
  Given run_agent is invoked with backend "codex"
  When the underlying CLI call now requests codex exec --json instead of plain -o text
  Then run_agent's stdout still contains exactly the same verdict text a caller's
    regex/string match currently extracts
  And no raw JSONL events appear in that stdout
```

```gherkin
Scenario: Metrics accumulate across stateless workflow runs
  Given the issue's pipeline-state JSON already contains two entries in agentRuns
    from earlier workflow runs
  When a new stateless workflow run calls run_agent once more (e.g. one validator attempt)
  Then the resulting pipeline-state JSON's agentRuns array contains three entries total
  And the two prior entries are unchanged
```

```gherkin
Scenario: A missing cost field never blocks the run
  Given the backend's structured output for a given call does not include a cost field
  When run_agent records the metric entry for that call
  Then the entry's costUsd field is written as null
  And run_agent's stdout verdict and exit behaviour are unaffected
  And the calling script proceeds exactly as it would without metrics collection
```

```gherkin
Scenario: Every call site supplies its known role and attempt number
  Given the four call sites: run_planner (planner.sh), build_step, validate_step,
    review_step (build-lane.sh)
  When each invokes run_agent
  Then each supplies its role name and its known attempt number (the build loop's
    current attempt for build_step/validate_step/review_step; 1 for the planner)
  And the resulting agentRuns entry reflects the correct role/attempt pairing
```

## Out of Scope
- Reporting oder Aggregation über mehrere Issues hinweg (`scripts/factory-metrics.mjs`
  erweitern) — das ist Kind-Issue B von Epic #68, nicht dieses Issue.
- Zeit-bis-fertig- oder GitHub-Actions-Minuten-Metriken — ebenfalls Kind-Issue B.
- Code-Qualitäts-Baseline (ESLint/`eslint-plugin-sonarjs`) — Kind-Issue C von Epic #68.
- Kosten-/Token-Vergleich gegen manuelle "Vibing"-Sessions außerhalb der Factory.
- Ein Gate oder ein Schwellenwert auf Basis dieser Daten — die Erfassung ist rein
  informativ, wie bei Issue #58 (Mutation Testing).
- Das exakte Feld-Schema der `--output-format json`/`--json`-Ausgaben beider CLIs
  wird hier nicht vorgeschrieben — der Builder verifiziert es empirisch anhand
  eines echten Testlaufs gegen die tatsächlich installierten CLI-Versionen und
  mappt die vorhandenen Kosten-/Token-/Laufzeit-Felder auf die in AC3 geforderten
  Zielfelder (fehlende Quellfelder → `null`, siehe AC4).
- Timestamps pro Agentenlauf oder weitere Metadatenfelder über die in AC3
  geforderten Pflichtfelder hinaus — der Builder darf zusätzliche Felder
  ergänzen, sofern die Pflichtfelder unverändert vorhanden bleiben, aber es ist
  keine Anforderung dieses Issues.
- Änderungen an den bestehenden Verdict-Parsing-Ausdrücken in `planner.sh`/
  `build-lane.sh` (den `grep`/`case`-Mustern) — die bleiben laut AC1 unverändert.

## Affected Areas
- `scripts/pipeline/lib.sh` — `run_agent()` Signatur und Implementierung
  (strukturierte Ausgabe anfordern, Verdict weiterhin isoliert extrahieren,
  Metrik-Eintrag bauen und an `agentRuns` anhängen); `state_load()`s
  Default-JSON-Literal erweitert um `"agentRuns": []`; vermutlich eine neue
  interne Helper-Funktion zum Anhängen an ein Array-Feld im Pipeline-State
  (die bestehenden `state_set`/`state_set_num` überschreiben nur Skalarfelder).
- `scripts/pipeline/planner.sh` — `run_planner()` übergibt Rolle `planner`
  und Attempt `1` an `run_agent()`.
- `scripts/pipeline/build-lane.sh` — `build_step()`/`validate_step()`/
  `review_step()` übergeben ihre Rolle und die laufende `attempt`-Zählung an
  `run_agent()`.

## Test Expectations
- Automated: keine `tests/*.test.ts`-Abdeckung für dieses Issue — die gesamte
  Änderung liegt in `scripts/pipeline/*.sh` (Bash), das Repo hat kein
  Bash-Testharness (kein `bats`/`shellspec`, `npm test` deckt ausschließlich
  `src/**` per Vitest ab). Dieselbe Ausnahme wurde bereits für die
  Mutation-Testing-Infrastruktur (Issue #58) akzeptiert. Der Builder führt
  **keine** neue Test-Tooling-Einführung durch, um dies zu umgehen.
- Manual: einen echten Planner-Lauf gegen ein Test-Issue auslösen (z. B. per
  `workflow_dispatch` auf `issue-pipeline.yml`) und im Actions-Log
  bestätigen, dass `claude ... --output-format json` bzw. `codex exec
  ... --json` tatsächlich aufgerufen wird, dass der Planner trotzdem sein
  gewohntes `SKIP:`/`QUESTIONS`/`SPLIT:`/`SPEC:`/`BUILD:`-Verdict korrekt
  auslöst (Label-Wechsel, Kommentar, Dispatch — unverändertes Verhalten wie
  vor diesem Feature), und dass der `<!-- deskleaf-pipeline-state -->`-Kommentar
  danach ein `agentRuns`-Array mit einem neuen Eintrag
  (`role: "planner"`, `attempt: 1`, plus die übrigen AC3-Felder) enthält.
- Manual: einen Build-Lane-Lauf (Builder → Validator → Reviewer) gegen ein
  Test-Issue mit vorbereiteter Spec auslösen; bestätigen, dass `PR:`/`FAIL:`,
  `PASS`/`FAIL: AC-<n> ...` weiterhin korrekt geroutet werden (kein
  Verhaltensbruch) und dass nach dem Lauf drei weitere `agentRuns`-Einträge
  (`builder`, `validator`, `reviewer`) mit der jeweils korrekten `attempt`-
  Nummer im State stehen, akkumuliert zu den bereits vorhandenen Einträgen.
- Manual: einen Lauf gegen eine CLI-Version/Konfiguration ohne Kostenfeld
  provozieren (oder das Feld lokal aus der simulierten CLI-Antwort entfernen)
  und bestätigen, dass der entsprechende Eintrag `costUsd: null` enthält und
  der Lauf trotzdem normal durchläuft.
- Manual: `state_load()` gegen ein Issue ohne vorhandenen State-Kommentar
  ausführen und bestätigen, dass das initiale State-JSON `"agentRuns": []`
  enthält.

---

## UX Review
Kein sichtbares UI. Die einzige "Oberfläche" ist der bestehende
`<!-- deskleaf-pipeline-state -->`-Bot-Kommentar, der bereits heute
strukturiertes JSON enthält und ausschließlich maschinell (Pipeline-Skripte,
zukünftiger Report aus Kind-Issue B) gelesen wird — kein neuer
Mensch-lesbarer Text, keine neue Kommentar-Formatierung.

Freigabe für `ux-reviewed`.

---

## Design Review
Kein Produkt-Design-System-Impact — reine CI/Pipeline-Infrastruktur, keine
Obsidian-Plugin-UI, kein Bezug zu `styles.css`/`CAL_COLOR_PALETTE`/Theme.

Freigabe für `design-reviewed`.

---

## QA Report
_Pending_
