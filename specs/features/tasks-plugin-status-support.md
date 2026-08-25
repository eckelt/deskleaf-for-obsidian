# Feature: Tasks Plugin Status Support

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->
<!-- ux-reviewed and design-reviewed were skipped for this spec: approved directly by the author after the Validator confirmed content/tests, not via the UX/Design skills. -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/33

## User Story
Als Nutzer, der das Community-Plugin **Tasks** verwendet, möchte ich, dass die
Deskleaf-Seitenleiste auch Todo-Zeilen mit anderen Status-Zeichen als `[ ]`
und `[x]` erkennt und sinnvoll behandelt, damit `[!]` (wichtig), `[/]` (in
Bearbeitung), `[-]` (abgebrochen) und weitere von Tasks unterstützte
Status-Zeichen nicht mehr komplett unsichtbar in der Seitenleiste bleiben.

## Acceptance Criteria
- AC1: Die Todo-Erkennung matched jede Zeile `- [<Zeichen>] ...` mit genau
  einem beliebigen Zeichen zwischen den eckigen Klammern, nicht nur ` ` und
  `x`/`X` wie bisher.
- AC2: `x`/`X` (erledigt) und `-` (abgebrochen) gelten beide als
  "geschlossen" und werden — wie heute bereits bei erledigten Todos — nicht
  in der Seitenleiste angezeigt.
- AC3: `!` (wichtig) gilt als offen und erscheint in einer eigenen Gruppe
  "Wichtig", die **oberhalb** aller bestehenden Datums-Gruppen (Heute / Diese
  Woche / Später / Ohne Datum / Früher) angezeigt wird. Ein `!`-Todo erscheint
  ausschließlich in dieser Gruppe, nicht zusätzlich in seiner Datums-Gruppe.
- AC4: Jedes andere Zeichen (nicht in AC2/AC3 genannt — z. B. `/`, `>`, `<`,
  `?`, `*` und weitere von Tasks unterstützte Status) gilt als offen und wird
  unverändert wie ein `[ ]`-Todo in seiner Datums-Gruppe angezeigt, ohne
  visuelle Sonderbehandlung in dieser Iteration.
- AC5: Der Zähler im Sektions-Header ("Todos") summiert weiterhin alle
  sichtbaren (offenen) Gruppen inklusive "Wichtig".
- AC6: Ein Klick auf die Checkbox eines angezeigten offenen Todos schreibt
  unabhängig vom ursprünglichen Status-Zeichen `[x]` in die Quell-Zeile
  zurück — analog zum bestehenden Verhalten für `[ ]`.
- AC7: Tasks-Inline-Datums-Metadaten (`📅` fällig, `⏳` geplant, `🛫` Start)
  werden im Todo-Text erkannt. Ist eines davon vorhanden, bestimmt es in der
  Reihenfolge `📅` > `⏳` > `🛫` die Datums-Gruppe des Todos anstelle des
  Frontmatter-Datums der Notiz. Fehlen alle drei, bleibt das bisherige
  Verhalten (Frontmatter-`date` der Notiz, sonst "Ohne Datum") unverändert.
- AC8: `➕` (erstellt), `✅` (erledigt) und `❌` (storniert) Inline-Daten
  werden erkannt, aber nicht für die Gruppierung verwendet.

## Acceptance Scenarios
```gherkin
Scenario: Wichtiges Todo erscheint in eigener Gruppe oberhalb der Datumsgruppen
  Given eine Notiz enthält die Zeile "- [!] Vertrag unterschreiben"
  When die Seitenleiste die Todos rendert
  Then erscheint "Vertrag unterschreiben" in einer Gruppe "Wichtig" oberhalb von "Heute"
  And das Todo erscheint nicht zusätzlich in einer Datums-Gruppe

Scenario: In-Progress-Todo wird wie ein offenes Todo behandelt
  Given eine Notiz mit Frontmatter-Datum von heute enthält die Zeile "- [/] Entwurf schreiben"
  When die Seitenleiste die Todos rendert
  Then erscheint "Entwurf schreiben" in der Gruppe "Heute"

Scenario: Abgebrochenes Todo wird ausgeblendet
  Given eine Notiz enthält die Zeile "- [-] Alten Plan verwerfen"
  When die Seitenleiste die Todos rendert
  Then erscheint "Alten Plan verwerfen" in keiner Gruppe

Scenario: Unbekanntes Tasks-Status-Zeichen wird als offen erkannt
  Given eine Notiz ohne Frontmatter-Datum enthält die Zeile "- [?] Klären ob nötig"
  When die Seitenleiste die Todos rendert
  Then erscheint "Klären ob nötig" in der Gruppe "Ohne Datum"

Scenario: Fälligkeitsdatum aus Tasks-Emoji überschreibt die Gruppierung
  Given eine Notiz mit Frontmatter-Datum "2026-08-01" enthält die Zeile "- [ ] Rechnung stellen 📅 2026-07-22"
  When die Seitenleiste die Todos rendert
  Then erscheint das Todo in der Gruppe "Heute"

Scenario: Klick auf Checkbox eines Prio-Todos hakt es ab
  Given die Seitenleiste zeigt "- [!] Vertrag unterschreiben" in der Gruppe "Wichtig"
  When der Nutzer die Checkbox anklickt
  Then wird die Quell-Zeile zu "- [x] Vertrag unterschreiben" geändert
  And das Todo verschwindet nach dem Neu-Rendern aus der Seitenleiste
```

## Out of Scope
- Visuelle/CSS-Sonderdarstellung einzelner offener Status (z. B. eigenes Icon
  für `[/]`) — laut Autor eine mögliche spätere Iteration über CSS.
- Entfernen/Hübsches Formatieren der Tasks-Emoji-Datumsmetadaten aus dem
  angezeigten Todo-Text; das Datum bleibt als Rohtext sichtbar, genau wie im
  Quelltext geschrieben.
- Auswertung von Tasks-Prioritäts-Emojis (`🔺⏫🔼🔽⏬`) oder Recurrence
  (`🔁`) — unabhängig vom Status-Zeichen-Thema dieses Issues.
- Eine feste, gepflegte Liste aller von Tasks-Community-Status-Kollektionen
  definierten Zeichen: Die generische Ein-Zeichen-Regex (AC1/AC4) deckt jedes
  zukünftige Zeichen automatisch als "offen" ab, ohne dass Deskleaf eine
  Liste pflegen muss.
- Schreiben zusätzlicher Tasks-Metadaten (z. B. `✅`-Datum) beim Abhaken über
  die Seitenleiste; es wird weiterhin nur das Status-Zeichen auf `x` gesetzt.

## Open Questions
_None_

## Affected Areas
- `src/sidebar-view.ts`: Checkbox-Regex, `TodoItem`/`TodoGroup`-Typen,
  `parseTodosFromFile`, `groupTodos`, `renderTodos`, `toggleTodo`.
- Neues `src/todo-utils.ts` (pure Funktionen): Status-Klassifizierung
  (offen/geschlossen/wichtig), Inline-Datums-Extraktion, Gruppierung —
  extrahiert für Testbarkeit gemäß "Pure functions first"-Prinzip aus
  `CLAUDE.md`.
- `styles.css`: Gruppenlabel "Wichtig" nutzt bestehende
  `.dl-board-group-label`/`.dl-todo-row`-Klassen, keine neue visuelle
  Sprache in dieser Iteration nötig.

## Test Expectations
- Automatisiert (Vitest, neue Datei `tests/todo-utils.test.ts` gegen die
  extrahierten pure Funktionen in `src/todo-utils.ts`):
  - Status-Klassifizierung für ` `, `x`, `X`, `-`, `!`, `/` und ein
    beliebiges unbekanntes Zeichen (z. B. `?`).
  - Inline-Datums-Extraktion und Prioritätsreihenfolge `📅` > `⏳` > `🛫`,
    inkl. Fallback auf Frontmatter-Datum und Fallback auf "Ohne Datum".
  - Gruppierung inkl. neuer "Wichtig"-Gruppe: `!`-Todos erscheinen nur dort,
    nicht zusätzlich in einer Datums-Gruppe.
  - Toggle-Verhalten: Checken eines Todos mit beliebigem offenem
    Status-Zeichen schreibt `[x]` in die Quellzeile.
- Manuelle QA:
  - Sichtprüfung, dass "Wichtig" oberhalb von "Heute" in einer echten
    Vault-Notiz mit `[!]`-Zeile erscheint.
  - Sichtprüfung, dass Emoji-Datumsangaben als Rohtext ohne Layout-Bruch
    gerendert werden.
  - End-to-End-Klick auf die Checkbox eines `[!]`/`[/]`-Todos in einer realen
    Notiz und Prüfung, dass die Quellzeile korrekt auf `[x]` aktualisiert
    wird.

---

## UX Review
Skipped by author decision — content and acceptance criteria were already validated end-to-end (tests + manual confirmation), a separate UX pass was judged to add no value here.

---

## Design Review
Skipped by author decision — same reasoning as UX Review; no new UI surface beyond the existing sidebar todo list.

---

## QA Report
_Pending_
