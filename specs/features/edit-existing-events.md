# Feature: Edit Existing Events

## Status
`ux-reviewed`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## User Story
Als Nutzer möchte ich bestehende Kalenderereignisse auf Desktop und Mobile über eine Detailmaske bearbeiten können, damit ich Titel, Zeit, Ort, Beschreibung und Kalenderzuordnung korrigieren kann, ohne den Kalender außerhalb von Deskleaf öffnen zu müssen.

## Acceptance Criteria
- [ ] AC1: Auf Desktop öffnet ein Doppelklick auf eine timed Event-Card eine Edit-Maske für dieses Event.
- [ ] AC2: Auf Mobile öffnet ein Long-Press auf eine timed Event-Card direkt die Edit-Maske.
- [ ] AC3: Die Edit-Maske zeigt initial die aktuellen Event-Werte für Titel, Startzeit, Endzeit, Ort, Beschreibung und Kalender an.
- [ ] AC4: Änderungen an Titel, Startzeit, Endzeit, Ort, Beschreibung und Kalender können gespeichert oder verworfen werden.
- [ ] AC5: Beim Verwerfen bleiben Event, Kalenderansicht und verknüpfte Event-Notiz unverändert.
- [ ] AC6: Beim Speichern wird das Event im aktiven Backend aktualisiert und die Kalenderansicht anschließend neu geladen.
- [ ] AC7: Wenn ein wiederkehrendes Event gespeichert wird, fragt Deskleaf vor dem Schreiben, ob nur diese Instanz oder die ganze Serie geändert werden soll.
- [ ] AC8: Ungültige Eingaben blockieren das Speichern sichtbar, mindestens: leerer Titel, fehlende Start-/Endzeit, Endzeit nicht nach Startzeit.
- [ ] AC9: Für iCal-Feed-Events öffnet die Edit-Maske höchstens read-only und verändert das Event nicht.
- [ ] AC10: Teilnehmer werden in der ersten Version nicht bearbeitet.
- [ ] AC11: Nach erfolgreichem Speichern aktualisiert Deskleaf eine bereits verknüpfte Event-Notiz: `event-id`, relevante Frontmatter-Felder, Titel und Beschreibung werden an die geänderten Event-Daten angepasst.
- [ ] AC12: Das bestehende Verhalten zum Öffnen oder Erstellen einer verknüpften Event-Notiz bleibt außerhalb des neuen Edit-Zugangs erhalten.

## Out of Scope
- Teilnehmerbearbeitung.
- Neue Einladungen versenden oder Teilnehmer per E-Mail benachrichtigen.
- RSVP-Änderungen für Einladungen.
- Vorschlagen oder Anfragen neuer Zeiten bei Events, die der Nutzer nicht organisiert.
- Bearbeitung von All-day-Events.
- Bearbeitung von iCal-Feed-Events.
- Vollständiger Kalender-Provider-Support jenseits der bestehenden EventKit- und CalDAV-Backends.
- Community-Plugin-Submission oder Installationsmechanik.

## Open Questions
1. Wie genau wird "ganze Serie ändern" für CalDAV implementiert, wenn ein einzelnes expandiertes VEvent aus einem recurring Event editiert wird?
2. Wie genau wird ein Kalenderwechsel in CalDAV umgesetzt: DELETE im alten Calendar Collection + PUT im neuen Calendar Collection, oder wird ein anderer CalDAV-Move-Mechanismus benötigt?
3. Wie sollen nicht vom Nutzer organisierte Events im ersten implementierbaren Scope behandelt werden: komplette Edit-Maske read-only, nur Zeitänderung als lokale Änderung, oder explizit "nicht bearbeitbar"? RSVP und neue Zeit vorschlagen sind für diese Spec aus Scope genommen.
4. Soll die bisherige mobile Long-Press-Move/Resize-Funktion vollständig ersetzt werden, oder braucht sie einen neuen Zugang?

## Affected Areas
- `src/calendar-view.ts`: Event-card interactions, context menu, edit mask UI, mobile long-press flow.
- `src/calendar-reader.ts`: EventKit update operations beyond move/cancel/create.
- `src/caldav-reader.ts`: CalDAV update operations beyond move/cancel/create.
- `src/caldav-client.ts`: Potential CalDAV write helpers for full VEVENT updates or calendar moves.
- `src/ical-parser.ts`: Potential VEVENT mutation helpers for summary/location/description.
- `src/note-manager.ts`: Synchronize linked event note frontmatter, heading/title and description after event edits.
- `src/types.ts`: Potential update command type if update operations are added.
- `styles.css`: Edit-mask layout and responsive states.
- `tests/*.test.ts`: Parser/update helpers and UI behavior where existing harness supports it.

## Test Expectations
- Unit tests for VEVENT update helpers: title, time, location, description, preserving unrelated fields.
- Unit tests for validation rules: empty title, invalid time range.
- Backend tests or focused mocks for CalDAV update behavior.
- Note-manager tests for updating linked event note frontmatter and description after event edits.
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
- Long-press currently enters a mobile edit mode for moving/resizing/canceling.
- The requested target behavior changes Long-Press to open the detail editor directly.
- There is no detail editor for title, location, description, calendar or participants.

### UX Assessment

The request is directionally sound: editing details belongs close to the event card, and the create popover already establishes a compact form pattern for title, time, description and calendar selection.

The proposed desktop trigger, double-click, is plausible but must not break the existing single-click note workflow or drag-to-move behavior. The implementation needs a clear distinction between click, double-click and drag.

Mobile is now specified as Long-Press opens the detail editor directly. This is clear from a product perspective, but it displaces the current fast mobile move/resize/cancel mode. The builder must either remove that flow or provide a new access path in the editor.

The user explicitly wants calendar switching included because accidentally creating events in the wrong calendar is a real workflow problem. This makes backend design materially more complex than a simple field edit.

The user also wants linked notes updated after event edits. This turns the feature into a two-system update: calendar backend first, then note metadata/content sync after successful calendar save.

### UX Risks

| Risiko | Schwere | Empfehlung |
|---|---|---|
| Doppelklick kollidiert mit Single-click note opening | Mittel | Doppelklick-Erkennung explizit testen; Single-click darf nicht verzögert oder unzuverlässig wirken |
| Mobile Long-Press hat bereits eine Funktion | Mittel-Hoch | Long-Press öffnet künftig Details; bisherige Move/Resize-Funktion braucht neuen Zugang oder wird ersetzt |
| Teilnehmerbearbeitung wirkt einfach, ist aber semantisch komplex | Niedrig | Explizit aus Scope genommen |
| Kalenderwechsel kann je Backend unterschiedlich wirken | Hoch | Vor Builder-Freigabe Design Review für EventKit und CalDAV durchführen |
| Note-Sync nach Kalenderänderung kann Teilupdates erzeugen | Mittel-Hoch | Erst Kalender speichern, dann Note aktualisieren; Fehler sichtbar melden |
| Nicht-Organizer-Events haben andere Rechte | Hoch | Für ersten Scope read-only oder explizit nicht bearbeitbar festlegen |

### Planner Recommendation

Feature noch nicht zur Implementierung freigeben. Die UX-Richtung ist geklärt genug für `ux-reviewed`, aber das Feature braucht ein Design Review der Backend-Schreibpfade.

Aktueller Ziel-Scope:
- Desktop: Doppelklick öffnet Detailmaske.
- Mobile: Long-Press öffnet Detailmaske.
- Bearbeitbar: Titel, Startzeit, Endzeit, Ort, Beschreibung, Kalender.
- Recurring: Beim Speichern fragen, ob einzelne Instanz oder ganze Serie geändert wird.
- Notes: Verknüpfte Event-Notiz nach erfolgreichem Kalender-Save aktualisieren.
- Nicht im Scope: Teilnehmer, RSVP, neue Zeit vorschlagen, All-day, iCal-Feeds.

---

## Design Review
_Pending_

Design Review muss vor `approved` klären:
- CalDAV-Feldupdate für SUMMARY, DTSTART, DTEND, LOCATION, DESCRIPTION.
- CalDAV-Kalenderwechsel zwischen Collections.
- EventKit-Feldupdate inklusive Kalenderwechsel.
- Recurring-Semantik für einzelne Instanz vs. ganze Serie.
- Verhalten für nicht vom Nutzer organisierte Events.
- Note-Sync-Reihenfolge und Fehlerverhalten.

---

## QA Report
_Pending_
