# Feature: Event Edit Form Redesign

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/12

## User Story
Als Nutzer möchte ich bestehende Events in einer bewusst gestalteten Edit-Maske bearbeiten, auf Einladungen reagieren und Orts-URLs öffnen können, damit sich Event-Arbeit auf Mobile und Desktop wie ein sauberer Teil von Deskleaf anfühlt und nicht wie ein zufällig platzierter Popover.

## Acceptance Criteria
- [ ] AC1: Auf Mobile öffnet die bestehende Event-Edit-Maske als Bottom Sheet, das von unten in den Viewport kommt, die verfügbare Breite nutzt, Safe-Area-Inset berücksichtigt und nicht außerhalb des sichtbaren Bereichs liegt.
- [ ] AC2: Das mobile Bottom Sheet hat eine erkennbare Sheet-Struktur mit Griff/Handle, Kopfbereich, scrollbarem Formularbereich und am unteren Rand erreichbaren Aktionen; lange Inhalte scrollen innerhalb des Sheets statt den Kalender darunter zu verschieben.
- [ ] AC2a: Der mobile Sheet-Handle ist nicht nur dekorativ: Ein klares Ziehen nach unten schließt das Sheet ohne Backend-Update und ohne Note-Sync. Kurze oder versehentliche Bewegungen dürfen das Sheet nicht schließen.
- [ ] AC2b: Falls die aktuelle Obsidian-API ein natives mobiles Sheet/Modal-Element mit Bottom-up-Animation und Swipe-down-Dismiss bereitstellt, verwendet die Mobile-Edit-Maske dieses Element. Falls Obsidian nur ein normales `Modal` ohne steuerbaren Swipe-down-Dismiss bereitstellt, bleibt ein eigener Deskleaf-Bottom-Sheet-Container zulässig; die sichtbare Semantik aus AC1, AC2 und AC2a hat Vorrang.
- [ ] AC2c: Auf Mobile schließt ein klares Nach-unten-Wischen nicht nur auf dem sichtbaren Handle, sondern auf allen nicht-interaktiven Sheet-Flächen ohne Backend-Update und ohne Note-Sync. Interaktive Felder, Buttons, Selects und der interne Formular-Scrollbereich behalten ihre normale Bedienung und dürfen nicht durch den Dismiss-Gesture abgefangen werden.
- [ ] AC3: Auf Desktop öffnet die bestehende Event-Edit-Maske als bewusst gestalteter Dialog/Popover mit stabiler Breite, klarer Feldgruppierung und viewport-sicherer Positionierung; sie darf weder an der Event-Card kleben noch zufällig wie ein Create-Popover wirken.
- [ ] AC4: Mobile und Desktop verwenden dieselben vorhandenen Edit-Felder und Werte wie `edit-existing-events`: Titel, Startzeit, Endzeit, Ort, Beschreibung, Kalender, Speichern, Abbrechen/Schließen und Löschen/Ablehnen, sofern das Event nach der bestehenden `edit-existing-events`-Semantik schreibbar ist. Das Redesign darf keine zusätzlichen Events read-only machen.
- [ ] AC5: Read-only Events behalten die bestehende Edit-Semantik: Felder sind nicht bearbeitbar, es gibt keine Speichern-Option, und die Maske erklärt knapp, dass das Event in Deskleaf schreibgeschützt ist. Unterstützte RSVP-Aktionen dürfen trotzdem sichtbar sein, weil sie keine Event-Detailbearbeitung sind.
- [ ] AC6: Wiederkehrende Events behalten den bestehenden Speichern-Flow: Nach Speichern erscheint vor dem Backend-Write die Auswahl zwischen dieser Instanz und der Serie.
- [ ] AC7: Abbrechen, Outside-Click/Outside-Tap und Escape schließen die Maske ohne Backend-Update und ohne Note-Sync; Speichern und Löschen/Ablehnen behalten die bestehenden Schreibpfade.
- [ ] AC8: Das Redesign bleibt innerhalb des Deskleaf/Obsidian-Designsystems und wirkt bewusst gestaltet: Monokai-Pro-kompatible Flächen, Obsidian-Theme-Variablen, klare visuelle Hierarchie, konsistente Abstände, sauber gestaltete Buttons und Eingabefelder, kompakte operative UI, keine Apple-Calendar-Kopie und keine dekorative Marketing-Optik.
- [ ] AC9: Create-Popover und bestehende mobile Start-/Endzeit-Handle-Bearbeitung bleiben funktional; gemeinsame Styles dürfen nur verändert werden, wenn Create- und Edit-Zustände danach weiterhin unterscheidbar und viewport-sicher sind.
- [ ] AC10: Die Event-Edit-Maske darf auf keiner unterstützten Viewport-Breite horizontal scrollen. Inhalte, Formularfelder und Aktionsleisten müssen innerhalb der Sheet-/Dialogbreite umbrechen, schrumpfen oder vertikal fließen.
- [ ] AC11: Die Deskleaf-Sidebar darf durch dieses Fix-Forward keine horizontale Scrollbarkeit zeigen; Topics, Mini-Kalender, Toolbar und Todos müssen horizontal im Sidebar-Viewport bleiben, während vertikales Scrollen der Listen erhalten bleibt.
- [ ] AC12: Wenn ein Event einen Ort mit URL enthält, bietet die Edit-Maske eine klar erkennbare URL-Aktion direkt neben beziehungsweise im selben Feldblock wie `Ort` an, die die URL im Systembrowser beziehungsweise in Obsidian-default-external-open öffnet. Für v1 reicht das Öffnen der URL; ein eingebetteter Meeting-Client, Preview oder Provider-spezifischer Join-Flow ist nicht Teil des Scopes.
- [ ] AC13: Wenn der Nutzer Teilnehmer eines Events ist und das aktive Backend RSVP technisch anbietet, zeigt die Edit-Maske eine RSVP-Aktionsgruppe mit genau diesen Antworten: `Zusagen`, `Mit Vorbehalt`/`Vielleicht`, `Absagen`. Wenn der aktuelle Teilnahme-Status bekannt ist, muss er direkt an den Buttons erkennbar sein, zum Beispiel durch einen ausgewählten/aktiven Buttonzustand.
- [ ] AC14: RSVP-Aktionen werden ausgeblendet, wenn Deskleaf für das konkrete Event oder Backend keine belastbare RSVP-Operation anbieten kann. In diesem Fall bleibt das Event read-only beziehungsweise editierbar nach der bestehenden `edit-existing-events`-Semantik, aber ohne kaputte oder wirkungslose RSVP-Buttons.
- [ ] AC15: Eine erfolgreiche RSVP-Aktion schreibt ausschließlich den Teilnahme-Status, lädt den Kalender anschließend neu und löst keine Event-Note-Synchronisation aus. Eine fehlgeschlagene RSVP-Aktion zeigt einen Fehlerhinweis und lässt den sichtbaren RSVP-Zustand unverändert.

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
Scenario: Mobile blank sheet area dismisses the editor
  Given the user has opened the mobile edit sheet for a writable event
  When the user clearly swipes downward on a non-interactive sheet area outside a field or button
  Then the edit sheet closes
  And no backend update and no note sync are triggered
  When the user swipes or scrolls inside an input, select, textarea, button or the form body scroll area
  Then the sheet keeps the expected field or form interaction instead of dismissing accidentally
```

```gherkin
Scenario: Edit form and sidebar do not scroll sideways
  Given Deskleaf is displayed at a narrow mobile-sized viewport
  When the user opens the event edit form
  Then the edit form has no horizontal scroll
  And every visible edit control stays inside the sheet width
  Given the Deskleaf sidebar is visible at a narrow sidebar width
  Then the sidebar has no horizontal scroll
  And its toolbar, topics, mini-calendar and todos remain horizontally contained
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
Scenario: Read-only edit form keeps event editing unavailable
  Given a read-only event without RSVP support is visible in the calendar view
  When the user opens the event editor
  Then the form shows the event details in a disabled/read-only state
  And no save action is available
  And closing the form does not call the backend update path
```

```gherkin
Scenario: Location URL opens externally
  Given an event has a location value containing a URL
  When the user opens the event editor
  Then the form shows an action for opening the URL next to the location field
  When the user activates that action
  Then Deskleaf opens the URL externally
  And no event update and no note sync are triggered
```

```gherkin
Scenario: RSVP actions are offered only when supported
  Given the user is an invitee on an event where the active backend supports RSVP
  When the user opens the event editor
  Then the form shows actions for Zusagen, Mit Vorbehalt/Vielleicht and Absagen
  And the currently known participation status is visible on the matching action
  When the user chooses Mit Vorbehalt/Vielleicht
  Then Deskleaf writes the tentative RSVP state through the backend
  And the calendar reloads
  And no event note sync is triggered
  Given another event or backend cannot offer RSVP safely
  When the user opens the event editor
  Then no RSVP actions are shown
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
- Teilnehmerbearbeitung, neue Einladungen oder neue Zeitvorschläge.
- RSVP jenseits der drei expliziten Antworten `Zusagen`, `Mit Vorbehalt`/`Vielleicht`, `Absagen`.
- RSVP für Events oder Backends, bei denen Deskleaf keinen eindeutigen aktuellen Teilnehmer und keinen sicheren Schreibpfad bestimmen kann.
- Backend-Änderungen jenseits des eng notwendigen dedizierten RSVP-Schreibpfads.
- Änderungen am Create-Event-Workflow außer notwendige Style-Entkopplung.
- Pixelgenaue Nachbildung von Apple Calendar.

## Open Questions
_None_

## Design Decisions
- This is primarily a UI redesign of the existing editor. The only added capabilities are action affordances attached to the same event surface: opening a location URL and sending one of the three scoped RSVP responses.
- The Apple Calendar screenshot is directional only: compact, intentional, sheet/dialog-like. The implementation must use Deskleaf's own visual language and Obsidian theme variables.
- Fit and finish is part of the product contract, not optional polish. Buttons and inputs should look like first-class Deskleaf controls with consistent height, radius, spacing, focus states, disabled states and active/selected states; the builder should not leave native default browser controls visible where Deskleaf already styles equivalent controls.
- Mobile uses a bottom sheet because it gives the form a predictable touch target, avoids tiny floating popovers, and matches the user's explicit "slide from bottom up" request.
- The user's 2026-06-29 clarification prefers an Obsidian-native bottom-up, swipe-dismiss surface if one exists. Current Obsidian typings expose `Modal` with mobile animation, but no explicit bottom-sheet or swipe-down-dismiss control. Builders must verify the available API at implementation time and use a native primitive only if it satisfies the full mobile close behavior; otherwise implement/keep the Deskleaf sheet behavior directly.
- The user's 2026-06-29 acceptance feedback makes the sheet dismiss target larger than the visible handle: the same deliberate downward dismiss gesture should work on non-interactive sheet chrome and empty areas, while form controls and internal scrolling keep priority.
- The user's 2026-07-03 clarification adds two v1 actions to the edit surface: location URLs should simply open externally from an affordance next to the location field, and RSVP should expose the three explicit responses `Zusagen`, `Mit Vorbehalt`/`Vielleicht`, `Absagen` only when the backend can actually perform them.
- When the current RSVP status is known, the corresponding RSVP action must be visually selected. If the backend can write RSVP but cannot determine the current status, the actions may be shown without a selected state, but successful user selection must update the visible state after the write succeeds.
- RSVP is an invitation action, not an edit-save action. It must not reuse `updateEvent(...)`, must not trigger linked-note sync, and must be hidden instead of shown disabled when unsupported.
- Desktop may be centered or card-adjacent as long as it is viewport-safe, stable, visually intentional and clearly an edit surface rather than the create popover.
- The existing edit behavior from `specs/features/edit-existing-events.md` remains the behavioral contract for field values, validation, save, delete, read-only and recurring scope.

## Affected Areas
- `src/calendar-view.ts`: `showEventEditPopover(...)` structure/classes, mobile/desktop positioning, close behavior wiring if class names change.
- `src/calendar-view.ts`: Location URL action rendering and external-open wiring in the edit surface.
- `src/event-edit.ts` or similarly focused helper module: pure edit rules such as read-only classification, input validation, URL extraction and RSVP availability mapping, if they need to be shared or tested outside the view.
- `src/types.ts`: Add explicit RSVP response/status types only if needed by the backend contract.
- `src/calendar-reader.ts` and `src/caldav-reader.ts`: Add a dedicated RSVP capability/write method only where the backend can identify the current user's attendee entry and write the response safely.
- `src/ical-parser.ts` and `src/caldav-client.ts`: CalDAV RSVP support may require preserving/updating the current user's `ATTENDEE;PARTSTAT=...` line and writing the event resource without corrupting unrelated iCalendar properties.
- Obsidian UI API: Check whether `Modal` or another available primitive can provide the exact mobile bottom-up plus swipe-down-dismiss behavior before choosing a custom sheet.
- `src/sidebar-view.ts`: Verify sidebar structure does not require horizontal overflow for toolbar, topics, mini-calendar or todos.
- `styles.css`: Dedicated edit-form styling for mobile bottom sheet and desktop dialog/popover states.
- `tests/*.test.ts`: Focused DOM/class/interaction coverage where feasible.

## Test Expectations
- Automated coverage for the shared edit-form rendering path is sufficient; tests do not need to duplicate every field on both desktop and mobile if the same builder function renders them.
- Automated DOM-level coverage should assert representative mobile behavior: the mobile edit form gets the bottom-sheet class/structure, contains the current event values, and keeps save/cancel actions present for writable events. CSS implementation details such as exact pixels, `safe-area-inset` arithmetic and animation timing are covered by manual QA unless they are expressed through stable classes or CSS custom properties.
- Automated DOM-level coverage should assert representative desktop behavior: the desktop edit form gets the desktop edit-dialog/popover class/structure, is distinct from the create-only styling, and contains the current event values. Stable width and viewport-safe placement do not require brittle layout assertions in Vitest.
- Automated coverage should verify long-content support through stable structure: a dedicated scrollable form/body container exists inside the sheet/dialog. Visual scroll feel remains manual QA.
- Automated coverage should verify Escape and outside-click/tap close the edit form without `updateEvent` or note sync; one representative close-path test may cover the shared close implementation when Escape and outside-click call the same close function.
- Automated coverage should verify the mobile handle drag path through stable pointer/touch events: a downward drag beyond the chosen threshold closes the sheet without `updateEvent` or note sync, while a short movement below the threshold leaves it open.
- Automated coverage should verify the shared mobile dismiss gesture through representative non-interactive sheet chrome/empty-area pointer or touch events, using the same threshold as the handle. One representative test is sufficient when handle and blank-area dismiss call the same close path.
- Automated coverage should verify interactive controls are excluded from blank-area swipe dismissal at least for one representative text field and one representative action control, so normal editing cannot accidentally close the sheet.
- Automated or DOM-level style coverage should assert stable containment hooks for horizontal overflow prevention on the edit form and sidebar root. Exact browser scrollbar rendering remains manual QA, but the CSS must include explicit `overflow-x: hidden` or equivalent containment at the relevant roots and no fixed child width that forces horizontal scrolling.
- If the implementation uses an Obsidian-native mobile primitive, automated coverage should still assert the Deskleaf-visible contract: mobile edit opens as a bottom-anchored sheet-like surface and the supported downward dismiss path closes without `updateEvent` or note sync. If the implementation uses a custom sheet because Obsidian has no matching primitive, the test should cover the custom handle path.
- Automated coverage should verify read-only rendering has no save action and does not call `updateEvent`.
- Automated coverage should include at least one writable EventKit-style or CalDAV-style event that still renders editable fields and a save action, so the redesign cannot regress writable events into read-only mode.
- Automated coverage should verify cancel/close still avoids `updateEvent` and note sync.
- Automated coverage should verify URL extraction/opening through a stable helper or DOM test: a location containing `https://...` or `www...` exposes one open action in the location field block, activates the external-open path, and does not call `updateEvent` or note sync.
- Automated coverage should verify RSVP availability through representative cases: supported invitee event shows exactly `Zusagen`, `Mit Vorbehalt`/`Vielleicht`, `Absagen`; a known current RSVP status marks the corresponding action selected; unsupported backend/event hides the RSVP group entirely.
- Automated coverage should verify a successful RSVP action calls the dedicated RSVP backend path, reloads/refreshes through the existing reader behavior where applicable, updates the visible selected RSVP state after success and does not call `updateEvent` or linked-note sync.
- Automated coverage should verify an RSVP failure leaves the edit surface in place or otherwise preserves the visible event state while showing an error notice.
- Existing tests for VEVENT updates, backend update paths, note sync, recurring scope and validation remain the behavioral safety net; do not rewrite them solely for visual class changes.
- Create-popover regression coverage should be representative: opening the create popover and successfully invoking the existing create path is enough to prove shared style changes did not break creation.
- Manual QA in Obsidian is required for visual fit: mobile bottom sheet on iPhone-sized viewport, desktop Obsidian window at narrow and normal widths, dark and light themes, long description, read-only event, invitee event with RSVP support, location URL and recurring-event save prompt.
- Manual QA must include dragging the mobile sheet handle down to dismiss, swiping down on a blank/non-interactive sheet area to dismiss, verifying form controls do not dismiss accidentally, verifying normal writable events still show editable controls, confirming that neither the edit form nor the sidebar can be scrolled horizontally, opening a URL from the edit form, and verifying unsupported RSVP buttons are hidden.

## Fix-Forward Clarifications

### 2026-06-26

Human acceptance feedback clarified two product expectations:
- Normal writable events must stay editable after the redesign; showing them as read-only is a regression against `edit-existing-events`.
- A visible mobile sheet handle implies direct manipulation. The handle must support downward drag-to-dismiss, not only signal that the surface is a sheet.

### 2026-06-29

Human acceptance feedback clarified two additional fit-and-finish expectations:
- The mobile dismiss target is currently too small. A clear downward swipe on non-interactive sheet chrome or empty sheet areas must dismiss the editor, while real form controls and internal scrolling remain usable.
- Horizontal scrolling in the event edit form and the Deskleaf sidebar is a regression. Both surfaces must be horizontally contained again.

### 2026-07-03

Human clarification added two v1 interaction requirements:
- Location values that contain URLs should expose an action to open the URL externally; opening is sufficient for v1.
- RSVP should support `Zusagen`, `Mit Vorbehalt`/`Vielleicht` and `Absagen`, but the buttons must be hidden when Deskleaf cannot offer the action reliably for the current event/backend.

Human follow-up clarification sharpened the visible design contract:
- The URL open action belongs next to the location field, not as a detached footer action.
- If Deskleaf already knows the user's RSVP status, the RSVP buttons must show which status is currently selected.
- The redesign must make buttons and inputs feel intentionally designed, using the provided calendar screenshot only as visual direction and not as an Apple Calendar copy.

Second acceptance round on the same day added four decisions and one regression fix:
- Mobile regression: the edit sheet closed immediately after opening because document-level outside-close listeners caught iOS synthetic mouse events fired ~300ms after the opening tap. Outside-close listeners are desktop-only now; on mobile the full-screen overlay's own click handler covers outside taps.
- Read-only events render their values as plain non-editable text instead of disabled input fields; empty fields are omitted entirely.
- The selected RSVP button state is the feedback; no explanatory status text line next to the buttons.
- The URL open action uses the known meeting platform icon (Teams, Meet, Jitsi) when the event is a video call, falling back to a generic external-link icon.
- The calendar field moved out of the form: the calendar colour indicator in the header is a button that opens a small in-surface menu to move the event to another calendar. This frees vertical space, especially on mobile.

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
