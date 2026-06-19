# Feature: Create Event Location Field

## Status
`done`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/3

## User Story
Als Nutzer möchte ich beim Anlegen eines Events direkt einen Ort eintragen können, damit ich Adressen, Räume oder Video-Call-Links nicht nachträglich über die Event-Bearbeitung ergänzen muss.

## Acceptance Criteria
- [x] AC1: Der Create-Popover zeigt ein optionales Eingabefeld `Ort`.
- [x] AC2: Das Feld akzeptiert Freitext, einschließlich physischer Adressen, Raumnamen und URLs.
- [x] AC3: Beim Erstellen wird ein befüllter Ort als `location` an `calendarReader.createEvent(...)` übergeben.
- [x] AC4: Ein leerer Ort wird nicht als künstlicher Leerwert gespeichert.
- [x] AC5: Das bestehende Erstellen mit Titel, Startzeit, Endzeit, Beschreibung und Kalenderauswahl bleibt unverändert.
- [x] AC6: Der Create-Popover bleibt auf Desktop und Mobile nutzbar und läuft nicht aus dem Viewport.

## Out of Scope
- Automatisches Erkennen oder Validieren von Video-Call-Anbietern.
- Separates Feld für Video-Call-Links.
- Link-Vorschau, Link-Parsing oder automatische Meeting-Buttons.
- Änderungen am Edit-Popover, außer falls shared styling zwingend berührt wird.
- Backend-Änderungen für CalDAV oder EventKit, solange die bestehende `location`-Unterstützung ausreicht.

## Open Questions
_None_

## Affected Areas
- `src/calendar-view.ts`: Create-Popover um ein Location-Input erweitern und an `createEvent` durchreichen.
- `styles.css`: Nur falls das zusätzliche Feld responsive Layout-Anpassungen braucht.
- `specs/calendar-view.md`: Create-Popover-Feldliste aktualisieren.

## Test Expectations
- Focused test oder code-level regression check, dass `createEvent` mit `location` aufgerufen wird, wenn das Feld befüllt ist.
- `npm test`
- `npm run build`
- Manuelle QA in Obsidian: Event mit Adresse erstellen, Event mit Video-Link erstellen, Event ohne Ort erstellen, Desktop und Mobile Popover prüfen.

---

## Grill-With-Docs Review

### Current Implementation

- `calendarReader.createEvent(...)` akzeptiert bereits `location`.
- `CalDAVReader.createEvent(...)` schreibt `location` bereits in das VEVENT.
- `CalendarReader.createEvent(...)` reicht `--location` bereits an das Swift-Binary weiter.
- Der Edit-Popover hat bereits ein Feld `Ort`.
- Der Create-Popover hat aktuell Titel, Zeit, Beschreibung und Kalenderauswahl, aber kein Ort-Feld.

### Pressure Points

- "Ort" darf nicht zu eng als physische Adresse verstanden werden. Im Deskleaf-Kontext ist `Event Location` ein Freitextfeld und darf auch einen Video-Call-Link enthalten.
- Ein separates Video-Link-Feld wäre verführerisch, ist aber nicht nötig und würde neue Semantik erzeugen. KISS: vorhandenes `location`-Feld sichtbar machen.
- Das zusätzliche Feld darf den mobilen Popover nicht unbenutzbar machen.

### Current Recommendation

Build-ready. Die Anforderung ist klein, das Backend unterstützt den Wert bereits, und es gibt keine offenen Produktfragen.

---

## Design Review

### Ergebnis

Freigabe für `approved`.

### UI Design

- Das neue Ort-Feld sitzt im Create-Popover zwischen Zeitreihe und Beschreibung.
- Placeholder: `Ort`.
- Das Feld ist optional und verwendet dieselbe kompakte Input-Optik wie Titel und Edit-Ort.

### Implementation Notes

- Trim value before create.
- Include `{ location }` only when the trimmed value non-empty.
- Keep `notes` mapped to Beschreibung; do not overload Beschreibung with location data.

---

## QA Report
### Automated Verification

- `npm test`: PASS — 9 test files, 153 tests.
- `npm run build`: PASS.
- `bash deploy.sh`: PASS — built JS/CSS, ran Vitest, built `deskleaf-calendar-sync`, and deployed the plugin locally.

### Implementation Summary

- Create-Popover now shows an optional `Ort` input between time and description.
- A non-empty trimmed `Ort` value is passed as `location` to `calendarReader.createEvent(...)`.
- Empty location values are omitted from create params.
- `specs/calendar-view.md` now documents location in the drag-to-create popover.
