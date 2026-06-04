# Feature: iCal Feed Settings UI & Plugin Integration

## Status
`approved`

## User Story
Als Nutzer möchte ich in den Deskleaf-Einstellungen iCal-Feed-URLs (webcal:// oder https://) hinzufügen, benennen, togglen und entfernen, damit deren Events beim Plugin-Start automatisch geladen und im Kalender angezeigt werden.

## Acceptance Criteria
- [ ] AC1: Im Settings-Tab gibt es einen Abschnitt „Kalender-Abonnements" mit einer Liste aller konfigurierten Feeds (Name + URL + Toggle + Farbwahl + Entfernen-Button). Ist die Liste leer, wird ein Hinweistext angezeigt.
- [ ] AC2: Über einen „+ Abonnement hinzufügen"-Button kann der Nutzer eine URL und einen Namen eingeben und speichern; webcal://-URLs werden akzeptiert.
- [ ] AC3: Jeder Feed hat eine wählbare Farbe aus `CAL_COLOR_PALETTE` (6 Swatches, identisches UI wie bei CalDAV-Kalendern); die gewählte Farbe wird als `--cal-h` auf den Event-Cards des Feeds gesetzt und unterscheidet den Feed visuell von anderen Kalendern.
- [ ] AC4: `main.ts` instanziiert `ICalFeedManager` beim Plugin-Start (`onload`), ruft `startPolling()` auf, und ruft `stopPolling()` in `onunload()` auf.
- [ ] AC5: Die Kalender-View ruft `icalFeedManager.getAllEvents()` ab und fügt die Events der bestehenden Event-Liste hinzu; Feed-Events sind durch `isOrganizer: false` read-only (kein Drag-Handle, kein Resize-Griff).
- [ ] AC6: Schlägt ein Feed-Fetch fehl, zeigt die Kalender-View den Warn-Status in der Statusleiste; andere Feeds und der Primärkalender sind nicht betroffen.

## Out of Scope
- Mehrere CalDAV-Konten
- Authentifizierung für geschützte iCal-Feeds
- Bearbeiten von Feed-Events

## Open Questions
_None_

---

## UX Review
_Pending_

---

## Design Review
_Pending_

---

## QA Report
_Pending_
