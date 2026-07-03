# Feature: Remote Event Source of Truth

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/22
- Related issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/20

## User Story
Als Nutzer moechte ich mich darauf verlassen koennen, dass Deskleaf Kalenderereignisse so anzeigt, wie sie im Remote-Kalender stehen, damit versehentliche lokale oder stale Aenderungen nicht als falsche Wahrheit im Kalender sichtbar bleiben.

## Acceptance Criteria
- [ ] AC1: Nach jedem erfolgreichen Reload aus dem aktiven Backend ersetzt Deskleaf vorhandene Kalenderdaten fuer Events vollstaendig durch die Remote-Daten des Backends.
- [ ] AC2: Titel, Startzeit, Endzeit, All-day-Status, Wiederholungsstatus, Kalender, Ort, Teilnehmer, Organizer, Absage-Status und Schreibbarkeits-/Organizer-Flags werden nicht aus lokalen Notizen, Edit-Form-Zustand, Drag-/Resize-Zwischenzustand oder Cache-Daten ueberschrieben, wenn Remote-Daten verfuegbar sind.
- [ ] AC3: Wenn ein Drag-, Resize- oder Edit-Speichervorgang fehlschlaegt oder vom Backend nicht bestaetigt wird, bleibt beziehungsweise wird die Kalenderansicht wieder auf den letzten erfolgreich geladenen Remote-Zustand gesetzt; ein nur lokal gekuerztes oder verschobenes Event darf nicht als gespeichert sichtbar bleiben.
- [ ] AC4: Der persistierte `calendarCache` ist nur ein Offline-/Fehler-Fallback. Sobald ein Backend-Reload erfolgreich ist, darf kein Feld aus dem Cache gegenueber dem Remote-Ergebnis gewinnen.
- [ ] AC5: Die einzige erlaubte inhaltliche Normalisierung beim Lesen ist die Beschreibung: generierte Online-Meeting-Bloecke werden aus `CalendarEvent.body` entfernt, waehrend alle anderen Event-Felder remote-getreu bleiben.
- [ ] AC6: Google-Meet-Bloecke mit den `-::~...::-` Trennlinien, `Join with Google Meet`, Dial-in-Zeilen, `More phone numbers`, `Learn more about Meet` und `Please do not edit this section.` werden beim Lesen aus der Beschreibung entfernt.
- [ ] AC7: Bestehende Teams-/Online-Meeting-Beschreibungsbereinigung bleibt erhalten und wird nicht durch die Google-Meet-Bereinigung regressiert.
- [ ] AC8: Die Online-Meeting-Erkennung fuer Event-Icons und Meeting-Plattformen bleibt erhalten, auch wenn der generierte Meeting-Block aus der Beschreibung entfernt wird.
- [ ] AC9: Beim Speichern einer Beschreibung aus der Edit-Maske schreibt Deskleaf genau den sichtbaren, bereinigten Beschreibungstext als Nutzerinhalt; Deskleaf darf entfernte Provider-Bloecke nicht wieder aus lokalen Alt-Daten anhaengen.

## Acceptance Scenarios
```gherkin
Scenario: Remote reload restores the real event duration
  Given Deskleaf currently shows a cached or locally edited event from 10:00 to 10:30
  And the active backend returns the same event from 10:00 to 11:00
  When Deskleaf completes a successful backend reload
  Then the calendar shows the event from 10:00 to 11:00
  And no local cache, note metadata or edit-state value shortens the event
```

```gherkin
Scenario: Failed resize does not leave a false local duration
  Given a visible event is 10:00 to 11:00 according to the last successful backend load
  When the user resizes it locally to 10:00 to 10:30
  And the backend write fails or is not confirmed
  Then Deskleaf shows a failure notice
  And the visible event returns to 10:00 to 11:00
  And the shortened duration is not saved to `calendarCache`
```

```gherkin
Scenario: Cache is only used while the backend is unavailable
  Given `calendarCache` contains an event from 10:00 to 10:30
  And the backend initially cannot be reached
  When Deskleaf loads the calendar
  Then Deskleaf may show the cached event with an explicit cache/load warning
  When a later backend reload succeeds with the same event from 10:00 to 11:00
  Then Deskleaf shows 10:00 to 11:00
  And future cache data is updated from that remote result
```

```gherkin
Scenario: Google Meet description block is removed without changing event facts
  Given the backend returns an event with title "Planning", start 10:00, end 11:00, location "Room A" and a Google Meet generated block in `DESCRIPTION`
  When Deskleaf parses the event
  Then the event title, start, end and location match the backend values
  And the visible description does not include the Google Meet generated block
  And the event is still detected as a Google Meet event for icon/platform display
```

```gherkin
Scenario: User-written description text is preserved around a provider block
  Given the backend returns a description with user-written agenda text before or after a generated Online Meeting block
  When Deskleaf parses the event
  Then the agenda text remains in the visible description
  And only the generated provider block is removed
```

```gherkin
Scenario: Saving a cleaned description does not resurrect removed provider text
  Given the edit form shows a description with the Google Meet block already removed
  When the user saves the event without adding that block back manually
  Then the backend update receives the visible description text only
  And no old generated block is appended from cache or stale iCalendar text
```

## Out of Scope
- Conflict resolution UI for simultaneous remote edits.
- Full two-way sync beyond the existing explicit create, update, move, resize and cancel commands.
- Restoring provider-generated meeting blocks after the user edits and saves a cleaned description.
- New meeting-join buttons or provider-specific meeting clients.
- Changing iCal subscription read-only semantics.

## Open Questions
_None_

## Design Decisions
- Remote calendar data is the source of truth whenever a backend read succeeds. Local cache exists only to keep the calendar usable during backend failures and must be clearly subordinate to a successful reload.
- Description cleanup is a read-time normalization of `CalendarEvent.body`, not a license to normalize event identity, timing, location, calendar, attendees or permissions.
- Meeting-platform detection should use the raw description/location/URL data before description cleanup, so removing generated provider text from the visible body does not remove the Meet/Teams/Jitsi icon signal.
- The same description-cleaning helper should be shared by CalDAV parsing and the EventKit/binary import path where possible. If the Swift binary already emits cleaned descriptions for some providers, the TypeScript side must still be able to enforce the same invariant for CalDAV and tests.
- Failed writes should not create an optimistic permanent state. It is acceptable to keep the current UI interaction responsive while dragging/resizing, but after failure or reload the rendered event must come from confirmed backend/cache state only.

## Affected Areas
- `src/ical-parser.ts`: Preserve raw meeting-detection input while assigning cleaned `body` values for parsed CalDAV events.
- `src/note-utils.ts` or a focused helper module: Extend `cleanBody(...)` or equivalent description-cleaning logic for Google Meet generated blocks without breaking existing separator cleanup.
- `src/calendar-reader.ts`: Ensure EventKit/binary events receive the same description cleanup after JSON parsing if the binary does not already guarantee it.
- `src/caldav-reader.ts`: Ensure successful `fetchAll()` fully replaces the in-memory events and persisted cache with backend-derived events.
- `src/calendar-view.ts`: Ensure failed drag/resize/edit writes do not leave a shortened local visual state after the operation completes.
- `src/note-manager.ts`: Continue using cleaned descriptions for note creation/sync, without using note metadata to override remote calendar facts.
- `tests/*.test.ts`: Parser/cleaning, reader cache/source-of-truth and representative failed-write UI behavior.

## Test Expectations
- Automated tests must cover Google Meet block removal with the exact `-::~...::-` delimiter pattern from issue #20, including dial-in and support lines.
- Automated tests must cover preserving user-written description text before and after removed provider blocks.
- Automated tests must cover that meeting-platform detection still returns `meet` when the only Meet URL was in the removed provider block.
- Automated tests must cover that non-description fields parsed from CalDAV remain equal to the backend iCalendar values while the description is cleaned.
- Automated tests must cover cache precedence: a successful backend reload replaces stale cached event timing.
- Automated tests must cover at least one failed write path for drag/resize or edit save where `moveEvent(...)`/`updateEvent(...)` rejects and the rendered event does not remain at the attempted local time.
- Existing folded-description update tests remain relevant and must stay green; do not weaken them to implement this feature.
- Manual QA in Obsidian is required with one real Google Meet event and one real event whose time differs from a stale local/cache state: after reload, the calendar must show the remote time while the visible description omits only the generated meeting block.

---

## UX Review

### Ergebnis

Freigabe fuer `ux-reviewed`.

### Bewertung

Die Nutzererwartung ist eindeutig: Ein Kalender, der nicht die Remote-Wahrheit zeigt, ist nicht vertrauenswuerdig. Die UI muss daher lieber kurz einen Fehler oder Cache-Hinweis zeigen, als eine lokal veraenderte Dauer so wirken zu lassen, als sei sie bestaetigt.

Die Beschreibung ist der einzige bewusst abweichende Bereich, weil generierte Online-Meeting-Bloecke fuer die Lesbarkeit stoeren. Diese Abweichung muss eng begrenzt bleiben und darf keine anderen Event-Fakten veraendern.

---

## Design Review

### Ergebnis

Freigabe fuer `design-reviewed` und `approved`.

### Technische Richtung

Die bestehende Architektur passt: Reader laden Backend-Daten, Views rendern `CalendarEvent`, und der Cache ist bereits als Fallback gedacht. Der Builder soll diese Richtung schaerfen, nicht eine neue Sync-Schicht einfuehren.

Die sauberste Umsetzung ist ein kleiner, getesteter Normalisierungsschritt am Rand der Reader:
- Raw Event-Daten parsen.
- Meeting-Plattform aus raw `DESCRIPTION`, `URL` und `LOCATION` erkennen.
- Nur `body` mit der bestehenden beziehungsweise erweiterten `cleanBody(...)`-Logik bereinigen.
- Das vollstaendige Event-Array aus einem erfolgreichen Backend-Reload atomar in `events` und Cache uebernehmen.

Fehlgeschlagene Writes sollen keine lokale Wahrheit erzeugen. Wenn ein Write scheitert, kann die View entweder gar keinen Event-State mutieren oder direkt aus Reader-State neu rendern. Entscheidend ist das beobachtbare Ergebnis: Nach Abschluss des Fehlers steht wieder der zuletzt bestaetigte Backend-/Cache-Zustand im Kalender.

---

## QA Report
_Pending_
