# Feature: Settings UI Redesign — Tabs, Strikethrough Disabled, Trash Icon

## Status
`approved`

## User Story
Als Nutzer möchte ich die Deskleaf-Einstellungen in logischen Tabs (Kalender, Notizen, Erweitert) sehen, mit mehrzeiligen Listen mobil, durchgestrichenen Farb-Indikatoren für deaktivierte Feeds, und einer Mülltonne statt Entfernen-Button — damit die Settings-Seite aufgeräumter und mobil-freundlicher ist.

## Acceptance Criteria
- [ ] AC1: Settings-Tab hat drei Hauptseiten/Tabs: „Kalender" (CalDAV + iCal-Feeds), „Notizen" (Template/Notes/Topics), „Erweitert" (Binary Path).
- [ ] AC2: CalDAV-Sektion und iCal-Feed-Sektion sind beide auf dem „Kalender"-Tab; CalDAV bleibt kompakt (URL + User + Passwort + Reload-Button + Kalender-Liste), iCal-Feeds folgen darunter.
- [ ] AC3: Für jeden iCal-Feed auf dem Kalender-Tab: eine Zeile mit Name, URL (gekürzt oder hidden auf mobil), 6 Farb-Swatches, durchgestrichenes Swatch-Set (strikethrough-css) für disabled-State, Mülltonne-Icon (🗑 oder SVG) zum Löschen. Mobil: mehrzeilig (Name + URL auf Zeile 1, Swatches + Mülltonne auf Zeile 2).
- [ ] AC4: Disabled iCal-Feeds zeigen: durchgestrichene Farb-Swatches UND keinen Toggle mehr; ein durchgestrichenes Swatch repräsentiert visuell „disabled" (statt eines aktiven Swatches). Nutzer toggle zwischen enabled (aktives Swatch) und disabled (durchgestrichenes Swatch) durch Klick auf das durchgestrichene Swatch.
- [ ] AC5: Mülltonne-Button ruft sofort `removeICalFeed()` auf (bestätigung optional, aber empfohlen auf mobil).
- [ ] AC6: Notizen-Tab zeigt nur die drei Ordner-Einstellungen (Template, Notes, Topics) — clean und fokussiert.
- [ ] AC7: Erweitert-Tab zeigt nur den Binary-Path — keine anderen Optionen.

## Out of Scope
- CalDAV-Authentifizierung oder Protokoll-Änderungen
- Color picker (Swatches bleiben wie aktuell)
- Permanente Deletions-Bestätigung (optional)

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
