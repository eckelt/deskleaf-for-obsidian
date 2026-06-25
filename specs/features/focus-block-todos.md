# Feature: Focus Block Todos

## Status
`qa`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/4

## User Story
Als Nutzer möchte ich in Event Notes für Fokuszeiten automatisch relevante offene Todos sehen, damit Fokus-/Deepwork-Termine konkrete nächste Arbeit sichtbar machen, ohne ein eigenes Aufgaben-System in Deskleaf zu bauen.

## Acceptance Criteria
- [ ] AC1: V1 arbeitet nur mit bestehenden Focus Blocks und erzeugt keine neuen Kalendertermine.
- [ ] AC2: Focus Blocks werden primär über `type: focus` in der Event Note erkannt; Titelmuster wie `Fokus`, `Focus`, `Deep Work` oder `Deepwork` bleiben Fallback.
- [ ] AC3: Neue Focus-Block-Event-Notes verwenden eine konfigurierbare Focus-Template-Datei.
- [ ] AC4: Das Fokus-Template enthält eine Dataview-Task-Abfrage, die offene Todos aus den relevanten Quellnotizen live anzeigt.
- [ ] AC5: Abhaken eines angezeigten Tasks folgt dem Dataview-Verhalten und schreibt in den Ursprungstodo zurück.
- [ ] AC6: Der Ursprungstodo bleibt authoritative; Deskleaf erzeugt keine unabhängigen Todo-Kopien und schreibt keine Assignment-Metadaten in die Quelle.
- [ ] AC7: V1 benötigt keine externe KI und keinen eigenen Todo-Assignment-Speicher.
- [ ] AC8: Die akzeptierten Begriffe werden in UI, Spec und Glossar konsistent verwendet: `Event Note`, `Calendar Series`, `Focus Block`.
- [ ] AC9: Die Default-Dataview-Abfrage nutzt dieselben Todo-Quellen wie die Sidebar: `notesFolder/` und topic-getaggte Dateien, ohne Kanban-Boards.
- [ ] AC10: Dataview ist Voraussetzung für die Live-Todo-Liste; Deskleaf darf die Query als Dataview-Block erzeugen.
- [ ] AC11: Die Default-Dataview-Abfrage zeigt genau drei offene Todos.
- [ ] AC12: Die Auswahl der drei Todos ist semistabil: innerhalb derselben Focus-Block-Note bleibt sie stabil, unterschiedliche Focus Blocks können unterschiedliche Todos zeigen.

## Out of Scope
- Automatische Priorisierung ohne Nutzerentscheidung.
- Vollautomatische Kalenderplanung über mehrere Tage ohne Review.
- Neue Focus-/Blocker-Termine im Kalender erzeugen.
- Externe KI-Modelle oder Anbieterintegration.
- Eigenes Todo-Assignment-System inklusive Source-IDs, Assignment-Speicher oder Synchronisationslogik.
- Provider-spezifische Kalender-Features außerhalb der bestehenden EventKit/CalDAV-Abstraktion.
- Mehrere Nutzer, Team-Kalender oder fremde Verfügbarkeiten.

## Open Questions
_None_

## Affected Areas
- `src/sidebar-view.ts`: vorhandenes Todo-Scanning und Topic-Integration; Logik sollte für Focus Block Todos wiederverwendbar extrahiert werden.
- `src/note-manager.ts`: Focus-Block-Template und Note-Typ-Auswahl.
- `src/types.ts`: möglicher neuer Note-Typ `focus`.
- `specs/note-manager.md`: Dokumentation der Note-Semantik.
- `specs/sidebar-view.md`: Dokumentation der Todo-Quelle und Filterlogik.
- `CONTEXT.md`: stabile Begriffe nach Klärung ergänzen.

## Test Expectations
- Note-manager tests für Auswahl und Rendering des Focus-Block-Templates.
- Tests für neuen Note-Typ `focus`, falls `NoteType` erweitert wird.
- Regression tests für bestehende recurring carried todos.
- Manuelle QA mit installiertem Dataview: Query rendert Tasks und Toggle schreibt in die Quelle zurück.

---

## UX Review

UX review after user clarification:

- V1 uses existing Focus Blocks only; it does not create new calendar events.
- Focus Blocks are Event Notes with frontmatter `type: focus`; title patterns such as `Fokus`, `Focus`, `Deep Work`, `Deepwork` are fallback signals.
- Terminology is accepted: `Event Note`, `Calendar Series`, `Focus Block`, `Todo Assignment`.
- The feature likely does not need `Todo Assignments` in v1. It can be implemented as a Focus Block Event Note template containing a Dataview query.
- Candidate todos should follow the same mental model as existing Dataview-based Daily Note workflows.
- V1 is algorithmic. AI can be a later suggestion layer, but is not part of the first build.
- The intended behavior is a Dataview task query: a Focus Block Event Note shows source tasks, and checking one follows Dataview's source-task behavior.
- V1 does not write assignment metadata or task ids into the source note. This follows the user's Dataview mental model: the query/view references source tasks without annotating them.

Reference behavior from the user's current Daily Note workflow:

```dataview
TASK
FROM "Journal"
WHERE !completed AND file.name != this.file.name
SORT file.day DESC
LIMIT 3
```

Revised MVP:
- Add/recognize `type: focus`.
- Render/create Focus Block Event Notes with a configurable Focus Template file.
- Put the Dataview task query into that template.
- The default query should mirror the Sidebar Todos source set: files in `notesFolder/` plus topic-tagged files, excluding Kanban boards.
- The default query shows three todos using a deterministic per-Focus-Block shuffle, not render-time randomness.
- Dataview is a required dependency for the live task list behavior.
- Do not build a picker, assignment store, task IDs, or custom synchronization in v1.

## Design Review
Implemented as the reduced v1 design:
- `focus.md` is loaded from the configured template folder like other note templates.
- A built-in fallback Focus template is used when `templates/focus.md` does not exist.
- `{{focus_todos}}` expands to a DataviewJS task query that mirrors the Sidebar Todos source set.
- `type: focus` is written to newly created Focus Block Event Notes inferred from focus/deep-work title patterns.

## QA Report
Implementation ready for QA.

Automated verification:
- `npm test` passed: 10 test files, 173 tests.
- `npm run build` passed.

Implemented acceptance coverage:
- AC1/AC7: No calendar event creation, AI, picker, assignment store, or custom sync logic was added.
- AC2/AC3: Focus notes infer `type: focus` from `Fokus`, `Focus`, `Deep Work`, or `Deepwork`, and load `templates/focus.md` when present.
- AC4/AC9/AC10: `{{focus_todos}}` renders a DataviewJS block over `notesFolder/` and `#topic` files, excluding Kanban boards.
- AC5/AC6: Task toggling is delegated to Dataview's source-task behavior; Deskleaf creates no duplicate source tasks or assignment metadata.
- AC8: Terminology is documented in `CONTEXT.md` and note-manager specs.

Manual QA still recommended:
- Create a Focus Block note with a focus/deep-work title and verify `type: focus`.
- Add `templates/focus.md` with `{{focus_todos}}` and verify it overrides the built-in fallback.
- With Dataview installed, verify tasks render and toggling writes back to source tasks.
