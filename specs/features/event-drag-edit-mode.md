# Feature: Event Drag Edit Mode

## Status
`qa`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Related Issue
#31

## User Story
Als mobiler Kalendernutzer moechte ich Termine nach einem Long-Press im Kalender verschieben oder ueber Handles anpassen und die Aenderung explizit bestaetigen oder verwerfen, damit ich nicht versehentlich die Edit-Maske oeffne oder ungewollte Terminzeiten speichere.

## Acceptance Criteria
- [ ] AC1: Auf Mobile oeffnet ein Long-Press auf einem editierbaren Termin ausschliesslich den Kalender-Edit-Mode mit Handles und oeffnet auch bei sehr langem Gedrueckthalten nicht anschliessend die Event-Edit-Maske.
- [ ] AC2: Im Mobile-Edit-Mode veraendern Handle- und Drag-Gesten ausschliesslich den Ghost-Twin des Termins; die originale Termin-Card bleibt bis zur Bestaetigung am Ursprungsort sichtbar.
- [ ] AC3: Beim Loslassen nach einem Verschiebe-Drag bleibt der Mobile-Edit-Mode aktiv, bis der Nutzer auf den Termin oder ausserhalb tippt.
- [ ] AC4: Eine Wisch- oder Drag-Geste verlaesst den Mobile-Edit-Mode nicht; nur ein Short-Tap auf den Termin oder ausserhalb beendet ihn.
- [ ] AC5: Im Mobile-Edit-Mode speichert ein Tap auf den Ghost-Twin die aktuell sichtbare Startzeit, Endzeit und den aktuell sichtbaren Tag ueber den bestehenden Move-Pfad und aktualisiert die originale Termin-Card direkt auf das Zielergebnis.
- [ ] AC6: Im Mobile-Edit-Mode verwirft ein Tap ausserhalb des Termins die aktuell sichtbaren Kalender-Edit-Aenderungen und erzeugt keinen Backend-Write.
- [ ] AC7: Mehrere Aenderungen innerhalb desselben Mobile-Edit-Modes bleiben kumulativ erhalten; eine per Handle geaenderte Dauer bleibt beim anschliessenden Verschieben auf einen anderen Tag erhalten.
- [ ] AC8: Der Mobile-Edit-Mode zeigt keine separate `x`-Aktion zum Schliessen mehr; Abbrechen und Bestaetigen passieren ueber Outside-Tap bzw. Termin-Tap.
- [ ] AC9: Der Mobile-Edit-Mode zeigt keine ueberholten Aktionen wie `Ablehnen` oder `Loeschen`; diese bleiben der Event-Edit-Maske vorbehalten.
- [ ] AC10: Beim Veraendern im Mobile-Edit-Mode sind Startzeit ueber dem Start-Handle und Endzeit unter dem End-Handle in Akzentfarbe ohne Hintergrund lesbar.
- [ ] AC11: Ein normaler Mobile-Tap auf einen Termin ausserhalb des Edit-Modes oeffnet weiterhin die Event-Edit-Maske, und ein Mobile-Double-Tap oeffnet weiterhin die verknuepfte Notiz.
- [ ] AC12: Desktop-Verhalten bleibt in diesem Slice unveraendert: Drag-to-move und Resize-Handles committen weiterhin beim Loslassen. Ein expliziter Desktop-Bestaetigen/Abbrechen-Modus ist nicht Teil dieses Issues.

## Acceptance Scenarios
```gherkin
Scenario: Mobile long-press does not open the edit sheet afterwards
  Given an editable timed event is visible on mobile
  When the user long-presses the event long enough to enter calendar edit mode
  And then lifts the finger after the long press
  Then the event card stays in calendar edit mode
  And no event edit sheet is opened
```

```gherkin
Scenario: Mobile tap on edited event confirms the visible edit
  Given an editable timed event is in mobile calendar edit mode
  And the user has moved a handle or dragged the event body
  When the user taps the edited ghost twin
  Then Deskleaf saves the visible start, end, and day through the existing event move path
  And the original event card moves to the confirmed placement
  And the calendar edit mode closes
```

```gherkin
Scenario: Mobile drag moves the event instead of navigating days
  Given an editable timed event is in mobile calendar edit mode
  When the user drags the event body
  Then Deskleaf consumes the gesture
  And only the ghost twin placement changes
  And the original event card remains at its previous placement
  When the user releases
  Then calendar edit mode remains active
```

```gherkin
Scenario: Mobile outside tap cancels the visible edit
  Given an editable timed event is in mobile calendar edit mode
  And the user has moved a handle or dragged the event body
  When the user taps outside the event card
  Then Deskleaf closes calendar edit mode
  And no event move write is sent
```

```gherkin
Scenario: Normal mobile tap behavior remains available
  Given no event is in mobile calendar edit mode
  When the user taps an event once
  Then the event edit sheet opens
  When the user double-taps an event
  Then the linked note opens
```

## Out of Scope
- Introducing desktop confirm/cancel edit mode.
- Adding floating accept/reject buttons.
- Moving events to days that are not currently visible in the calendar grid.
- Redesigning the full Event-Edit-Maske.

## Open Questions
_None_

## Affected Areas
- `src/calendar-view.ts`
- `styles.css`
- `tests/event-layout.test.ts`

## Test Expectations
- Automated: Cover mobile long-press suppression so a very long press cannot also open the edit sheet.
- Automated: Cover mobile handle edits confirming on event-card tap through `calendarReader.moveEvent`.
- Automated: Cover handle duration edits followed by body drag to another day preserving the edited duration on the ghost twin and on commit.
- Automated: Cover mobile outside tap cancelling handle edits without `calendarReader.moveEvent`.
- Automated: Cover that mobile edit-mode body drag prevents native scrolling, moves only the ghost twin to the hit day body, and leaves the original card unchanged until commit.
- Automated: Cover that no mobile edit bar renders.
- Automated: Cover that start and end handle labels update while handle edits change the visible time.
- Automated: Preserve existing tests for normal mobile single-tap and double-tap behavior.
- Manual: In Obsidian mobile, long-press a timed editable event, drag it vertically and to another visible day, confirm by tapping the card, and verify the event reloads at the new time/day.
- Manual: Repeat the same edit and cancel by tapping outside the card, then verify the original event remains unchanged after refresh.

---

## UX Review
The issue is an interaction fix for an existing edit mode. The accepted UX contract is deliberately minimal: inside-tap confirms, outside-tap cancels, and the separate `x` action is removed to avoid contradicting the gesture model.

Freigabe fuer `ux-reviewed`.

---

## Design Review
The Mobile-Edit-Mode uses an accent-colored ghost twin as the editable preview. Existing edit-card styling and handles remain on the ghost twin. Time feedback belongs directly to the handles; the mobile edit bar is removed from this mode. The original card stays visually unchanged until commit.

Freigabe fuer `design-reviewed`.

---

## QA Report
- PASS: `npm test -- tests/event-layout.test.ts` passed with 72 tests.
- PASS: `npm run build` passed.
- PASS: After the Move-Mode refinement, `npm test -- tests/event-layout.test.ts` still passed with 72 tests.
- PASS: After removing stale Mobile-Edit-Mode actions and adding the event-local time label, `npm test -- tests/event-layout.test.ts` still passed with 72 tests.
- PASS: After the time-label change, `npm run build` passed.
- PASS: After removing the bottom edit bar, moving time labels to the handles, restoring direct body drag, and adding optimistic accept/cancel placement, `npm test -- tests/event-layout.test.ts` passed with 72 tests.
- PASS: `npm test` passed with 268 tests.
- PASS: `npm run build` passed.
- PASS: After preserving edited duration across body drags, `npm test -- tests/event-layout.test.ts` passed with 72 tests.
- PASS: After switching Mobile-Edit-Mode to a ghost-twin preview, `npm test -- --run tests/event-layout.test.ts` passed with 72 tests.
- PASS: Ghost-twin preview keeps the edited duration during day drag while the original card stays unchanged until accept.
- PASS: `npm test` passed with 268 tests.
- PASS: `npm run build` passed.
- PASS: `bash deploy.sh` passed, including frontend build, full tests, Swift EventKit helper build, and artifact copy.
- PASS: After keeping the source card visually unchanged and limiting visual changes to the ghost twin, `npm test -- --run tests/event-layout.test.ts`, `npm run build`, and `bash deploy.sh` passed.
- PARTIAL: `npm run check:issue -- 31` still reports unchecked issue comments, including the pipeline state comment and the author clarification that this spec incorporates.
- Manual QA still required in Obsidian mobile for dragging to another visible day, confirming by card tap, and cancelling by outside tap.
