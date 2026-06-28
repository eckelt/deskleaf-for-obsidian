# Feature: Event Edit Form Redesign

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/12

## User Story
Als Nutzer möchte ich bestehende Events in einer bewusst gestalteten Edit-Maske bearbeiten können, damit sich das Ändern von Titel, Zeit, Ort, Beschreibung und Kalender auf Mobile und Desktop wie ein sauberer Teil von Deskleaf anfühlt und nicht wie ein zufällig platzierter Popover.

## Acceptance Criteria
- [ ] AC1: Auf Mobile öffnet die bestehende Event-Edit-Maske als Bottom Sheet, das von unten in den Viewport kommt, die verfügbare Breite nutzt, Safe-Area-Inset berücksichtigt und nicht außerhalb des sichtbaren Bereichs liegt.
- [ ] AC2: Das mobile Bottom Sheet hat eine erkennbare Sheet-Struktur mit Griff/Handle, Kopfbereich, scrollbarem Formularbereich und am unteren Rand erreichbaren Aktionen; lange Inhalte scrollen innerhalb des Sheets statt den Kalender darunter zu verschieben.
- [ ] AC2a: Der mobile Sheet-Handle ist nicht nur dekorativ: Ein klares Ziehen nach unten schließt das Sheet ohne Backend-Update und ohne Note-Sync. Kurze oder versehentliche Bewegungen dürfen das Sheet nicht schließen.
- [ ] AC3: Auf Desktop öffnet die bestehende Event-Edit-Maske als bewusst gestalteter Dialog/Popover mit stabiler Breite, klarer Feldgruppierung und viewport-sicherer Positionierung; sie darf weder an der Event-Card kleben noch zufällig wie ein Create-Popover wirken.
- [ ] AC4: Mobile und Desktop verwenden dieselben vorhandenen Edit-Felder und Werte wie `edit-existing-events`: Titel, Startzeit, Endzeit, Ort, Beschreibung, Kalender, Speichern, Abbrechen/Schließen und Löschen/Ablehnen, sofern das Event nach der bestehenden `edit-existing-events`-Semantik schreibbar ist. Das Redesign darf keine zusätzlichen Events read-only machen.
- [ ] AC5: Read-only Events behalten die bestehende Semantik: Felder sind nicht bearbeitbar, es gibt keine Speichern-Option, und die Maske erklärt knapp, dass das Event in Deskleaf schreibgeschützt ist.
- [ ] AC6: Wiederkehrende Events behalten den bestehenden Speichern-Flow: Nach Speichern erscheint vor dem Backend-Write die Auswahl zwischen dieser Instanz und der Serie.
- [ ] AC7: Abbrechen, Outside-Click/Outside-Tap und Escape schließen die Maske ohne Backend-Update und ohne Note-Sync; Speichern und Löschen/Ablehnen behalten die bestehenden Schreibpfade.
- [ ] AC8: Das Redesign bleibt innerhalb des Deskleaf/Obsidian-Designsystems: Monokai-Pro-kompatible Flächen, Obsidian-Theme-Variablen, kompakte operative UI, keine Apple-Calendar-Kopie und keine dekorative Marketing-Optik.
- [ ] AC9: Create-Popover und bestehende mobile Start-/Endzeit-Handle-Bearbeitung bleiben funktional; gemeinsame Styles dürfen nur verändert werden, wenn Create- und Edit-Zustände danach weiterhin unterscheidbar und viewport-sicher sind.

## Acceptance Scenarios
```gherkin
Scenario: Mobile edit form opens as bottom sheet
  Given a writable timed event is visible in the mobile calendar view
  When the user opens the event editor
  Then the edit form appears as a bottom sheet anchored to the bottom of the viewport
  And the sheet shows the current title, time, location, description and calendar values
  And the primary actions remain reachable without horizontal overflow
```

```gherkin
Scenario: Mobile long content stays inside the sheet
  Given an event has a long description
  When the user opens the event editor on mobile
  Then the form content scrolls inside the sheet
  And the calendar behind the sheet does not become the active scroll target for the form content
```

```gherkin
Scenario: Mobile sheet handle dismisses the editor
  Given the user has opened the mobile edit sheet for a writable event
  When the user drags the sheet handle clearly downward
  Then the edit sheet closes
  And no backend update and no note sync are triggered
  When the user opens the sheet again and makes only a short accidental handle movement
  Then the edit sheet remains open
```

```gherkin
Scenario: Desktop edit form feels distinct from create
  Given a writable timed event is visible in the desktop calendar view
  When the user opens the event editor
  Then the edit form appears as a viewport-safe dialog or refined popover
  And the fields are grouped in a readable edit layout
  And the form remains visually distinct from the create popover while using the same Deskleaf design language
```

```gherkin
Scenario: Read-only edit form keeps write actions unavailable
  Given a read-only event is visible in the calendar view
  When the user opens the event editor
  Then the form shows the event details in a disabled/read-only state
  And no save action is available
  And closing the form does not call the backend update path
```

```gherkin
Scenario: Cancel and save semantics are unchanged
  Given the user has opened the redesigned edit form for a writable event
  When the user changes form values and cancels
  Then no backend update and no note sync are triggered
  When the user opens the form again, changes values and saves
  Then the existing `calendarReader.updateEvent(...)` and note-sync behavior are used
```

## Out of Scope
- Neue bearbeitbare Event-Felder.
- Teilnehmerbearbeitung, RSVP, Einladungen oder neue Zeitvorschläge.
- Backend-Änderungen an EventKit, CalDAV oder iCal-Feed-Handling.
- Änderungen am Create-Event-Workflow außer notwendige Style-Entkopplung.
- Pixelgenaue Nachbildung von Apple Calendar.

## Open Questions
_None_

## Design Decisions
- This is a UI redesign of the existing editor, not a new event-editing capability.
- The Apple Calendar screenshot is directional only: compact, intentional, sheet/dialog-like. The implementation must use Deskleaf's own visual language and Obsidian theme variables.
- Mobile uses a bottom sheet because it gives the form a predictable touch target, avoids tiny floating popovers, and matches the user's explicit "slide from bottom up" request.
- Desktop may be centered or card-adjacent as long as it is viewport-safe, stable, visually intentional and clearly an edit surface rather than the create popover.
- The existing edit behavior from `specs/features/edit-existing-events.md` remains the behavioral contract for field values, validation, save, delete, read-only and recurring scope.

## Affected Areas
- `src/calendar-view.ts`: `showEventEditPopover(...)` structure/classes, mobile/desktop positioning, close behavior wiring if class names change.
- `src/event-edit.ts` or similarly focused helper module: pure edit rules such as read-only classification and input validation, if they need to be shared or tested outside the view.
- `styles.css`: Dedicated edit-form styling for mobile bottom sheet and desktop dialog/popover states.
- `tests/*.test.ts`: Focused DOM/class/interaction coverage where feasible.

## Test Expectations
- Automated coverage for the shared edit-form rendering path is sufficient; tests do not need to duplicate every field on both desktop and mobile if the same builder function renders them.
- Automated DOM-level coverage should assert representative mobile behavior: the mobile edit form gets the bottom-sheet class/structure, contains the current event values, and keeps save/cancel actions present for writable events. CSS implementation details such as exact pixels, `safe-area-inset` arithmetic and animation timing are covered by manual QA unless they are expressed through stable classes or CSS custom properties.
- Automated DOM-level coverage should assert representative desktop behavior: the desktop edit form gets the desktop edit-dialog/popover class/structure, is distinct from the create-only styling, and contains the current event values. Stable width and viewport-safe placement do not require brittle layout assertions in Vitest.
- Automated coverage should verify long-content support through stable structure: a dedicated scrollable form/body container exists inside the sheet/dialog. Visual scroll feel remains manual QA.
- Automated coverage should verify Escape and outside-click/tap close the edit form without `updateEvent` or note sync; one representative close-path test may cover the shared close implementation when Escape and outside-click call the same close function.
- Automated coverage should verify the mobile handle drag path through stable pointer/touch events: a downward drag beyond the chosen threshold closes the sheet without `updateEvent` or note sync, while a short movement below the threshold leaves it open.
- Automated coverage should verify read-only rendering has no save action and does not call `updateEvent`.
- Automated coverage should include at least one writable EventKit-style or CalDAV-style event that still renders editable fields and a save action, so the redesign cannot regress writable events into read-only mode.
- Automated coverage should verify cancel/close still avoids `updateEvent` and note sync.
- Existing tests for VEVENT updates, backend update paths, note sync, recurring scope and validation remain the behavioral safety net; do not rewrite them solely for visual class changes.
- Create-popover regression coverage should be representative: opening the create popover and successfully invoking the existing create path is enough to prove shared style changes did not break creation.
- Manual QA in Obsidian is required for visual fit: mobile bottom sheet on iPhone-sized viewport, desktop Obsidian window at narrow and normal widths, dark and light themes, long description, read-only event and recurring-event save prompt.
- Manual QA must include dragging the mobile sheet handle down to dismiss and verifying normal writable events still show editable controls.

## Fix-Forward Clarifications

### 2026-06-26

Human acceptance feedback clarified two product expectations:
- Normal writable events must stay editable after the redesign; showing them as read-only is a regression against `edit-existing-events`.
- A visible mobile sheet handle implies direct manipulation. The handle must support downward drag-to-dismiss, not only signal that the surface is a sheet.

---

## UX Review

### Ergebnis

Freigabe für `ux-reviewed`.

### Bewertung

Die Issue-Anforderung ist bewusst subjektiv formuliert ("something you wanna use"), aber der Kern ist konkret genug: Die bestehende Event-Edit-Maske wirkt unabsichtlich und soll auf Mobile als Bottom Sheet und auf Desktop als sauber gestaltete Edit-Oberfläche erscheinen.

Die wichtigste Produktgrenze ist, dass dieses Feature keine neue Event-Edit-Semantik einführt. Nutzer sollen dieselben Felder und Schreibpfade erhalten, nur in einer Oberfläche, die auf Touch und Desktop jeweils passend wirkt.

### UX Constraints

- Mobile muss touch-first sein: große erreichbare Aktionszone, Sheet-Griff, interne Scrollfläche, Safe Area.
- Desktop muss kompakt und scanbar bleiben: keine Landing-Page-Optik, keine übergroßen Cards, keine visuelle Kopie von Apple Calendar.
- Die Create-Maske darf nicht versehentlich wie die neue Edit-Maske wirken, sofern beide unterschiedliche Aufgaben haben.

---

## Design Review

### Ergebnis

Freigabe für `design-reviewed` und `approved`.

### UI Design

Mobile:
- Fixed bottom sheet mit eigener Klasse, z. B. `.dl-edit-sheet`.
- Breite: Viewport-basiert, mit horizontalem Abstand und `env(safe-area-inset-bottom)`.
- Max-Höhe: begrenzt, Formularinhalt intern scrollbar.
- Kopfbereich mit Handle und Event-Titel-Feld oder klarer Editor-Kopfzeile.
- Actions am unteren Sheet-Rand oder in einer stabilen Action-Zone.

Desktop:
- Eigene Edit-Klasse, z. B. `.dl-edit-dialog`, statt nur `.dl-create-popover`.
- Stabile Breite im Bereich eines kompakten Formulars.
- Gruppen: Titel, Zeit, Ort/Beschreibung, Kalender, Aktionen.
- Viewport-sicheres Placement mit Max-Höhe und internem Scrollen bei kleinen Fenstern.

### Implementation Notes

- Bestehende Validation und Save/Delete/Recurring-Logik nicht neu erfinden.
- Wenn Create und Edit aktuell Styles teilen, zuerst minimal entkoppeln: gemeinsame Basisklassen nur für echte gemeinsame Feldoptik, spezifische Layoutklassen für Create vs Edit.
- Keine Inline-Styles für statische Optik; TypeScript darf nur dynamische Positionierung oder CSS custom properties setzen.

---

## QA Report
_Pending_
