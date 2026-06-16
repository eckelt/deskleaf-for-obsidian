# Feature: Edit Existing Events

## Status
`qa`
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
- [ ] AC13: Events, bei denen der Nutzer nicht Organizer ist, sind in dieser Version read-only und zeigen keine Speichern-Option.

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
_None_

## Design Decisions
- Non-organizer events are read-only for this feature. RSVP and proposing a new time need a separate spec.
- Mobile Long-Press is reassigned to the detail editor. The previous mobile move/resize mode can be removed or moved behind a future control, but it is not required for this feature.
- CalDAV calendar switching is implemented as PUT to the target calendar collection followed by DELETE of the old resource. The old event must not be deleted if the target PUT fails.
- EventKit calendar switching is implemented in the Swift binary by changing `EKEvent.calendar` before saving.
- Recurring edit scope is exposed in the UI as `"this"` vs `"series"`. The backend accepts that span explicitly.
- Linked note synchronization happens only after the calendar backend save succeeds. If note sync fails after the calendar save, Deskleaf reports the note-sync error but does not roll back the calendar change.

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
- Swift tests for parsing the new update command arguments where practical.

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
### Ergebnis

Freigabe für `design-reviewed`, aber noch nicht `approved`. Die technische Richtung ist klar genug, um die Spec belastbar zu machen. Vor dem Builder-Handoff sollte der Planner die Acceptance Criteria noch finalisieren und auf `approved` setzen.

### Backend Contract

Die bestehenden Reader haben bereits `createEvent`, `moveEvent` und `cancelEvent`. Für dieses Feature soll ein neuer gemeinsamer Schreibpfad ergänzt werden:

```ts
updateEvent(id: string, update: EventUpdate): Promise<CalendarEvent | void>
```

`EventUpdate` sollte in `src/types.ts` liegen und mindestens enthalten:

```ts
{
  title: string;
  start: string;
  end: string;
  location?: string;
  notes?: string;
  calendar?: string;
  span?: "this" | "series";
}
```

Die UI darf nicht direkt zwischen CalDAV- und EventKit-Details unterscheiden. Sie ruft nur `calendarReader.updateEvent(...)` auf.

### CalDAV Design

Aktueller Stand:
- `CalDAVReader.moveEvent` lädt das bestehende VEVENT per `GET`, ersetzt `DTSTART`/`DTEND` und schreibt per `PUT`.
- `ical-parser.ts` hat mit `updateVEventTimes` bereits einen sehr engen Mutator.

Erforderliche Änderung:
- `ical-parser.ts` bekommt einen allgemeineren Mutator, z. B. `updateVEvent(icalText, update)`, der `SUMMARY`, `DTSTART`, `DTEND`, `LOCATION` und `DESCRIPTION` ersetzt oder ergänzt.
- Textwerte müssen iCal-konform escaped werden: Backslash, newline, comma, semicolon.
- Für Kalenderwechsel:
  1. altes `href` über `hrefMap` ermitteln.
  2. target calendar über `calendar` displayName auflösen.
  3. aktualisiertes VEVENT per `PUT` in target calendar schreiben.
  4. altes `href` erst danach per `DELETE` entfernen, wenn target href anders ist.
  5. `fetchAll()` ausführen.
- Bei fehlgeschlagenem PUT bleibt das alte Event unverändert.
- Bei fehlgeschlagenem DELETE nach erfolgreichem PUT kann ein Duplikat entstehen. Dieser Fehler muss sichtbar gemeldet werden; automatisches Rollback ist nicht erforderlich.

Recurring:
- `"this"` soll auf dem aktuell gefundenen Resource-Href arbeiten.
- `"series"` soll im ersten Builder-Scope nur unterstützt werden, wenn der gefundene Resource-Href das Master-VEVENT enthält. Wenn nur eine expandierte Instanz ohne Master-Href verfügbar ist, muss Deskleaf eine verständliche Fehlermeldung anzeigen.

### EventKit / Swift Design

Aktueller Stand:
- Das Swift-Binary unterstützt `create`, `move`, `cancel`, `export`, `watch`.
- `CalendarReader` ruft diese Befehle über `execFile` auf.

Erforderliche Änderung:
- Swift-Binary bekommt einen neuen Befehl `update`.
- Argumente:
  - `--id`
  - `--title`
  - `--start`
  - `--end`
  - `--location`
  - `--notes`
  - `--calendar`
  - `--span this|series`
- `findEvent` kann weiter genutzt werden.
- Für `--span series` wird bei wiederkehrenden Events `EKSpan.futureEvents` oder eine passende Serienstrategie benötigt. Da EventKit nicht immer eine echte "ganze Serie ab Anfang"-Operation aus einer Instanz erlaubt, soll der erste Scope `series` als "diese und folgende" dokumentieren, falls EventKit keine vollständige Serie abdeckt.
- Kalenderwechsel setzt `ev.calendar` auf den Kalender mit passendem Titel, wenn vorhanden.

### UI Design

- Desktop:
  - Double-click öffnet die Edit-Maske.
  - Single-click bleibt Notiz öffnen/erstellen.
  - Drag und Resize behalten ihre aktuelle Bedienung.
  - Bei Doppelklick muss die Single-click-Notizöffnung unterdrückt werden.
- Mobile:
  - Long-Press öffnet die Edit-Maske.
  - Die bisherige mobile Move/Resize-Bar ist nicht mehr der Long-Press-Default.
- Edit-Maske:
  - Darf die bestehende Create-Popover-Optik wiederverwenden, sollte aber als eigener Pfad implementiert werden, damit Create und Edit nicht unübersichtlich koppeln.
  - Enthält Titel, Startzeit, Endzeit, Ort, Beschreibung, Kalenderauswahl, Speichern, Abbrechen.
  - Für recurring Events wird nach Klick auf Speichern ein kleiner Scope-Dialog angezeigt: `Nur dieser Termin` / `Serie`.
  - Für read-only Events wird keine Speichern-Schaltfläche angezeigt.

### Note Sync Design

`NoteManager` bekommt eine neue Methode, z. B.:

```ts
syncEventNote(previousEvent: CalendarEvent, updatedEvent: CalendarEvent): Promise<void>
```

Regeln:
- Nur ausführen, wenn bereits eine Note existiert.
- Frontmatter aktualisieren: `event-id`, `title`, `date`, `start`, `end`, `location`.
- Beschreibung aktualisieren oder ersetzen, wenn ein `## Beschreibung` Abschnitt existiert oder neue Beschreibung vorhanden ist.
- Hauptüberschrift/Titel im Markdown soll aktualisiert werden, wenn sie klar dem alten Event-Titel entspricht.
- Datei nicht automatisch umbenennen. Das vermeidet Link- und Pfad-Nebenwirkungen im ersten Scope.

### Risiken

| Risiko | Schwere | Entscheidung |
|---|---|---|
| CalDAV-Kalenderwechsel erzeugt Duplikat, wenn DELETE nach PUT fehlschlägt | Mittel | Fehler sichtbar melden, kein automatisches Rollback |
| Recurring-Serie ist backendabhängig | Hoch | Scope-Dialog, konservative Backend-Fehler statt stiller falscher Änderung |
| Doppelklick öffnet versehentlich Notiz | Mittel | Click/Dblclick-Verhalten explizit testen |
| Note-Sync nach Kalender-Save schlägt fehl | Mittel | Kalenderänderung bleibt bestehen; Nutzer sieht Fehler |
| Nicht-Organizer-Events erlauben Provider-spezifisch nur eingeschränkte Aktionen | Hoch | Read-only im ersten Scope |

---

## QA Report
**Datum:** 2026-06-16
**Status:** QA pending manual Obsidian verification.

### Automated Verification

- `npm test`: PASS — 9 test files, 151 tests.
- `npm run build`: PASS.
- `swift test`: PASS.
- `bash deploy.sh`: PASS — built JS/CSS, ran Vitest, built `deskleaf-calendar-sync`, copied `main.js`, `styles.css`, `manifest.json`, and `deskleaf-calendar-sync` into the local Obsidian plugin folder.

### Implemented Coverage

| AC | Automated / Code Coverage | Status |
|---|---|---|
| AC1 Desktop double-click opens editor | Implemented in `calendar-view.ts`; needs manual Obsidian check for click vs double-click feel | Pending manual |
| AC2 Mobile long-press opens editor | Implemented by redirecting long-press from mobile move mode to edit popover | Pending manual |
| AC3 Initial values in editor | Implemented for title, start/end, location, description, calendar | Pending manual |
| AC4 Save/discard title/time/location/description/calendar | Implemented through `EventUpdate`, CalDAV update path, Swift `update` command | Pending backend manual |
| AC5 Discard does not mutate | Editor cancel removes popover without backend or note calls | PASS by code inspection |
| AC6 Save updates backend and reloads calendar | CalDAV calls `fetchAll()` after update; EventKit command added, watch process handles refresh | Pending manual EventKit/CalDAV |
| AC7 Recurring asks this vs series | Implemented via `askRecurringEditSpan()` | Pending manual |
| AC8 Validation | Empty title, missing start/end, and invalid time range block save | PASS by code inspection |
| AC9 iCal feed events read-only | Read-only detection includes `isFeedEvent(event)` | PASS by code inspection |
| AC10 Participants excluded | No participant fields in editor or update contract | PASS |
| AC11 Linked note sync | `NoteManager.syncEventNote()` implemented and covered by tests | PASS automated |
| AC12 Existing note open/create behavior | Single-click path retained with double-click delay | Pending manual feel check |
| AC13 Non-organizer read-only | Read-only detection includes `event.isOrganizer === false` | PASS by code inspection |

### Notes

- CalDAV calendar switching writes to the target calendar before deleting the old resource. If the final delete fails after a successful PUT, Deskleaf reports an error but does not roll back.
- CalDAV series editing remains conservative: expanded recurrence resources with `RECURRENCE-ID` reject `"series"` instead of silently editing the wrong object.
- Existing event-note files are not renamed during note sync.
