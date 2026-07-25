# Feature: Edit Event Date Picker

## Status
`qa`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Related Issue
Inline user request, 2026-07-08.

## User Story
Als Nutzer moechte ich im Event-Edit-Screen das Datum eines Termins aendern koennen, damit ich einen Termin nicht nur ueber Kalender-Drag-Gesten, sondern auch direkt im Formular auf einen anderen Tag verschieben kann.

## Acceptance Criteria
- [ ] AC1: Bei schreibbaren Events ist das Datum im Edit-Screen im Abschnitt `Zeit` als Datumsauswahl bedienbar.
- [ ] AC2: Die Datumsauswahl nutzt die native Date-Picker-UI des Betriebssystems, soweit vom WebView/Browser bereitgestellt.
- [ ] AC3: Beim Speichern verwendet Deskleaf das ausgewaehlte Datum fuer die bestehenden `updateEvent(...)`- und Note-Sync-Pfade.
- [ ] AC4: Start- und Endzeit bleiben bei einer Datumsaenderung unveraendert.
- [ ] AC5: Read-only Events zeigen das Datum weiterhin nur als Text und erhalten keine Datumsauswahl.
- [ ] AC6: Abbrechen oder Outside-Close verwirft eine geaenderte Datumsauswahl ohne Backend-Write und ohne Note-Sync.

## Acceptance Scenarios
```gherkin
Scenario: Writable event date can be changed from the time section
  Given a writable timed event is open in the edit screen
  When the user changes the date in the time section to another day
  And saves the edit
  Then Deskleaf sends the existing update path with the new start and end dates
  And the original start and end times are preserved
```

```gherkin
Scenario: Read-only event keeps date as text
  Given a read-only event is open in the edit screen
  Then the header shows the event date as text
  And no date input is rendered
```

## Out of Scope
- Custom calendar popover beyond the native date picker.
- Changing all-day events.
- Supporting events whose end time is earlier than the start time across midnight.
- Changing recurring-scope behavior.

## Affected Areas
- `src/calendar-view.ts`
- `styles.css`
- `tests/event-layout.test.ts`

## Test Expectations
- Automated: Writable edit screen renders a date input in the time section initialized to the event start date.
- Automated: Saving after changing the date calls `calendarReader.updateEvent(...)` with the new date and unchanged times.
- Automated: Read-only edit screen does not render a date input.
- Existing close/cancel tests continue to prove discarded edits do not write.

---

## QA Report
- PASS: `npm test -- --run tests/event-layout.test.ts` passed with 73 tests.
- PASS: `npm test` passed with 269 tests.
- PASS: `npm run build` passed.
- PASS: `bash deploy.sh` passed, including frontend build, full tests, Swift EventKit helper build, and artifact copy.
- Manual QA still required in Obsidian mobile to confirm the native date picker opens from the time section and saves through the real backend.
