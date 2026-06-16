# Feature: Edit Existing Events

## Status
`draft`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## User Story
Als Nutzer möchte ich bestehende Kalenderereignisse auf Desktop und Mobile über eine Detailmaske bearbeiten können, damit ich Titel, Zeit, Ort, Beschreibung und Kalenderzuordnung korrigieren kann, ohne den Kalender außerhalb von Deskleaf öffnen zu müssen.

## Acceptance Criteria
- [ ] AC1: Auf Desktop öffnet ein Doppelklick auf eine timed Event-Card eine Edit-Maske für dieses Event.
- [ ] AC2: Auf Mobile ist die Edit-Maske über den bestehenden Long-Press-Pfad erreichbar, ohne die vorhandene mobile Zeitverschiebung und Resize-Bedienung unzugänglich zu machen.
- [ ] AC3: Die Edit-Maske zeigt initial die aktuellen Event-Werte für Titel, Startzeit, Endzeit, Ort, Beschreibung und Kalender an.
- [ ] AC4: Änderungen an Titel, Startzeit, Endzeit, Ort und Beschreibung können gespeichert oder verworfen werden.
- [ ] AC5: Beim Verwerfen bleiben Event und Kalenderansicht unverändert.
- [ ] AC6: Beim Speichern wird das Event im aktiven Backend aktualisiert und die Kalenderansicht anschließend neu geladen.
- [ ] AC7: Ungültige Eingaben blockieren das Speichern sichtbar, mindestens: leerer Titel, fehlende Start-/Endzeit, Endzeit nicht nach Startzeit.
- [ ] AC8: Für nicht bearbeitbare Events wie iCal-Feed-Events zeigt Deskleaf keine Speichern-Option und verändert das Event nicht.
- [ ] AC9: Das bestehende Verhalten zum Öffnen oder Erstellen einer verknüpften Event-Notiz bleibt erhalten.

## Out of Scope
- Serienweite Bearbeitung wiederkehrender Termine.
- Neue Einladungen versenden oder Teilnehmer per E-Mail benachrichtigen.
- Bearbeitung von All-day-Events.
- Bearbeitung von iCal-Feed-Events.
- Vollständiger Kalender-Provider-Support jenseits der bestehenden EventKit- und CalDAV-Backends.
- Community-Plugin-Submission oder Installationsmechanik.

## Open Questions
1. Soll "Teilnehmer bearbeiten" im ersten Wurf wirklich enthalten sein? Aktuell hat `CalendarEvent.attendees` nur Namen/Strings, keine E-Mail-Adressen oder RSVP-/Organizer-Semantik. Damit ist ein echtes Update bei CalDAV/EventKit nicht eindeutig spezifizierbar.
2. Soll ein Kalenderwechsel im ersten Wurf enthalten sein? CalDAV benötigt dafür vermutlich ein Delete+Create oder Move zwischen Calendar Collections; EventKit kann `event.calendar` ändern, aber Recurring-/Permission-Fälle sind offen.
3. Wie sollen wiederkehrende Events behandelt werden: nur diese Instanz, dieser und folgende Termine, oder im ersten Wurf gar nicht editierbar außer über bestehende Move/Resize-Pfade?
4. Soll die Edit-Maske auch für Events geöffnet werden, die der Nutzer nicht organisiert (`isOrganizer === false`)? Falls ja: Welche Felder dürfen geändert werden?
5. Soll Mobile Long-Press zuerst die Detailmaske öffnen oder weiterhin den bestehenden mobilen Edit-Modus für Move/Resize/Cancel? Wenn beides bleiben soll: Welche Aktion öffnet was?
6. Soll ein bestehender Event-Note-Inhalt beim Ändern von Titel/Ort/Beschreibung synchronisiert werden, oder bleibt die Notiz bewusst ein Snapshot?
7. Welche Felder sind für den ersten Builder-Scope verbindlich: Titel, Zeit, Ort, Beschreibung, Kalender, Teilnehmer?

## Affected Areas
- `src/calendar-view.ts`: Event-card interactions, context menu, edit mask UI, mobile long-press flow.
- `src/calendar-reader.ts`: EventKit update operations beyond move/cancel/create.
- `src/caldav-reader.ts`: CalDAV update operations beyond move/cancel/create.
- `src/caldav-client.ts`: Potential CalDAV write helpers for full VEVENT updates or calendar moves.
- `src/ical-parser.ts`: Potential VEVENT mutation helpers for summary/location/description.
- `src/types.ts`: Potential update command type if update operations are added.
- `styles.css`: Edit-mask layout and responsive states.
- `tests/*.test.ts`: Parser/update helpers and UI behavior where existing harness supports it.

## Test Expectations
- Unit tests for VEVENT update helpers: title, time, location, description, preserving unrelated fields.
- Unit tests for validation rules: empty title, invalid time range.
- Backend tests or focused mocks for CalDAV update behavior.
- DOM-level tests for edit-mask rendering and save/discard behavior if feasible with the current test harness.
- Regression tests that iCal feed events remain read-only.

---

## UX Review

### Current Behavior

Desktop:
- Timed events can be dragged to move.
- Timed events can be resized via the bottom resize handle.
- Right-click opens a context menu for deletion/decline.
- Click opens or creates the linked event note.
- There is no detail editor for existing events.

Mobile:
- Tap opens the linked event note.
- Long-press enters a mobile edit mode for moving/resizing/canceling.
- There is no detail editor for title, location, description, calendar or participants.

### UX Assessment

The request is directionally sound: editing details belongs close to the event card, and the create popover already establishes a compact form pattern for title, time, description and calendar selection.

The proposed desktop trigger, double-click, is plausible but must not break the existing single-click note workflow or drag-to-move behavior. The implementation needs a clear distinction between click, double-click and drag.

Mobile needs a sharper interaction decision. Long-press is already occupied by the current move/resize/cancel edit mode. Replacing it with a detail editor would remove fast mobile time editing. A combined mobile edit bar with an additional "Details" action may be safer than changing the primary long-press behavior.

### UX Risks

| Risiko | Schwere | Empfehlung |
|---|---|---|
| Doppelklick kollidiert mit Single-click note opening | Mittel | Doppelklick-Erkennung explizit testen; Single-click darf nicht verzögert oder unzuverlässig wirken |
| Mobile Long-Press hat bereits eine Funktion | Hoch | Vor Implementierung entscheiden, ob Long-Press Edit-Modus bleibt und Details über Button geöffnet werden |
| Teilnehmerbearbeitung wirkt einfach, ist aber semantisch komplex | Hoch | Im ersten Wurf ausklammern oder stark präzisieren |
| Kalenderwechsel kann je Backend unterschiedlich wirken | Mittel-Hoch | Erst nach Backend-Design freigeben |

### Planner Recommendation

Feature nicht freigeben, bevor der erste Scope enger geschnitten ist. Empfohlenes MVP:
- Desktop: Doppelklick öffnet Detailmaske.
- Mobile: Long-press bleibt erhalten; mobile Edit-Bar bekommt "Details".
- Bearbeitbar im ersten Wurf: Titel, Startzeit, Endzeit, Ort, Beschreibung.
- Nicht im ersten Wurf: Teilnehmer, Kalenderwechsel, Recurring-Serienlogik.

---

## Design Review
_Pending_

Design Review sollte erst erfolgen, wenn der genaue MVP-Scope und der Mobile-Zugang entschieden sind.

---

## QA Report
_Pending_
