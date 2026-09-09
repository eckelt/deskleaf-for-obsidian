# Feature: Reminders Overlay (read-only EventKit)

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

> Delta-Spec für die Produktlinie **obsidian** (Factory-Feature `fr-20260902085426-b180f116`,
> Issue [#81](https://github.com/eckelt/deskleaf-for-obsidian/issues/81)). Die Produktlinie
> **display** ist außerhalb dieses Repos spezifiziert und nicht Teil dieser Spec.

## User Story
Als Nutzer möchte ich meine macOS/iOS-Erinnerungen aus der EventKit-Erinnerungsliste „EK"
im Deskleaf-Kalender sehen, damit ich Termine und fällige Erinnerungen an einem Ort im
Blick habe, ohne die Reminders-App zu öffnen.

## Acceptance Criteria
- [ ] AC1: Erinnerungen aus der EventKit-Erinnerungsliste **„EK"** erscheinen im
  Deskleaf-Kalender. Datenquelle ist ausschließlich der macOS/iOS-Binary-Backend
  (`EKReminder` über den Deskleaf-Binary); es gibt keinen CalDAV/VTODO-Codepfad für
  Erinnerungen. Erinnerungen aus anderen Listen werden nicht angezeigt.
- [ ] AC2: Eine Erinnerung **ohne** Fälligkeitszeit (nur Datum) erscheint als
  ganztägiges Event an ihrem Fälligkeitsdatum. Eine Erinnerung **mit** Fälligkeitszeit
  erscheint als 30-Minuten-Block, beginnend zur Fälligkeitsuhrzeit.
- [ ] AC3: Eine Erinnerung **ganz ohne** Fälligkeitsdatum (weder Datum noch Zeit gesetzt)
  wird im Kalender nicht angezeigt — es gibt keinen Tag, an dem sie platziert werden könnte.
- [ ] AC4: Erledigte Erinnerungen werden im Kalender **nicht angezeigt** (weder normal noch
  durchgestrichen), sobald EventKit sie als abgeschlossen führt.
- [ ] AC5: Erinnerungs-Kacheln sind visuell klar von echten Kalender-Events unterscheidbar
  — festes Icon (Checkbox) plus eine feste Farbe außerhalb der 6 Hues aus
  `CAL_COLOR_PALETTE`. Die Farbe ist nicht nutzerkonfigurierbar.
- [ ] AC6: Erinnerungs-Kacheln sind vollständig **read-only**: kein Drag-to-move, kein
  Resize, kein Bearbeiten-Formular. Ein Klick auf eine Erinnerungs-Kachel öffnet oder
  erstellt **keine** Note (keine Brain-Vault-Notiz-Beziehung, kein Aufruf von
  `noteManager.openOrCreate`).
- [ ] AC7: Das Plugin schreibt nie nach EventKit zurück, um eine Erinnerung zu ändern
  (keine Fälligkeits-Änderung, kein Abhaken). Reminders.app/EventKit bleibt für
  Erinnerungen alleinige Quelle der Wahrheit.

## Acceptance Scenarios
```gherkin
Scenario: Erinnerung ohne Fälligkeitszeit als Tagesevent
  Given eine Erinnerung in Liste "EK" mit Fälligkeitsdatum 2026-09-10 und keiner Uhrzeit
  When der Kalender für den 10.09.2026 gerendert wird
  Then erscheint die Erinnerung als ganztägige Kachel an diesem Tag

Scenario: Erinnerung mit Fälligkeitszeit als 30-Minuten-Block
  Given eine Erinnerung in Liste "EK" mit Fälligkeit 2026-09-10 14:00
  When der Kalender für den 10.09.2026 gerendert wird
  Then erscheint die Erinnerung als Zeitblock von 14:00 bis 14:30

Scenario: Erinnerung ohne jedes Fälligkeitsdatum wird ausgeblendet
  Given eine Erinnerung in Liste "EK" ohne Fälligkeitsdatum
  When der Kalender gerendert wird
  Then erscheint diese Erinnerung an keinem Tag

Scenario: Erledigte Erinnerung wird ausgeblendet
  Given eine Erinnerung in Liste "EK", die in EventKit als erledigt markiert ist
  When der Kalender gerendert wird
  Then erscheint diese Erinnerung nicht im Kalender

Scenario: Erinnerung aus anderer Liste wird nicht angezeigt
  Given eine Erinnerung in Liste "Einkauf" mit Fälligkeit heute
  When der Kalender gerendert wird
  Then erscheint diese Erinnerung nicht im Kalender

Scenario: Erinnerungs-Kachel ist read-only
  Given eine sichtbare Erinnerungs-Kachel im Kalender
  When der Nutzer versucht, die Kachel per Drag zu verschieben oder in der Höhe zu ändern
  Then bleibt die Kachel unverändert und es wird keine Schreiboperation an EventKit ausgelöst

Scenario: Klick auf Erinnerungs-Kachel öffnet keine Note
  Given eine sichtbare Erinnerungs-Kachel im Kalender ohne zugehörige Datei
  When der Nutzer auf die Kachel klickt
  Then wird keine neue Note erstellt und keine bestehende Note geöffnet

Scenario: Erinnerungs-Kachel visuell unterscheidbar
  Given eine sichtbare Erinnerungs-Kachel neben einem echten Kalender-Event am selben Tag
  When beide Kacheln im Kalender dargestellt werden
  Then trägt die Erinnerungs-Kachel ein Checkbox-Icon und eine feste Farbe außerhalb von CAL_COLOR_PALETTE
```

## Out of Scope
- CalDAV/VTODO-Erinnerungen (z. B. Fastmail) — nur `EKReminder` über den macOS/iOS-Binary
- Zwei-Wege-Sync: Abhaken, Verschieben oder Bearbeiten von Erinnerungen aus Obsidian heraus
- Konfigurierbarer Listen-Filter/-Einstellung — die Liste „EK" ist fest verdrahtet, keine UI zur Auswahl anderer Listen
- Anzeige erledigter Erinnerungen (auch nicht optional/durchgestrichen)
- Brain-Vault-Notiz-Beziehung für Erinnerungen (keine eigene Datei, keine Verknüpfung zu Kunden/Todos)
- Nutzerkonfigurierbare Farbe/Icon für Erinnerungs-Kacheln
- Die Produktlinie **display** (separates Repo/Spec)
- iOS-Erinnerungen ohne lokalen macOS-Binary (das Binary läuft nur auf macOS; auf iOS/Mobile bleibt der bestehende "Mobiles Gerät"-Fallback ohne Live-Reminders-Daten bestehen, analog zum bestehenden Event-Verhalten)

## Open Questions
_None — geklärt in [#81](https://github.com/eckelt/deskleaf-for-obsidian/issues/81)._

## Affected Areas
- `swift/Sources/DeskleafCalendarSync/main.swift` — `EKReminder`-Zugriff (`requestAccess`
  um `.reminder`-Scope erweitern), Fetch der Liste „EK", Mapping auf das bestehende
  `DeskleafEvent`-JSON-Schema mit einem neuen `isReminder`-Feld; Ausschluss erledigter
  Erinnerungen und Erinnerungen ohne Fälligkeitsdatum bereits im Binary.
- `src/types.ts` — `CalendarEvent.isReminder?: boolean`.
- `src/calendar-reader.ts` — übernimmt Reminder-Einträge unverändert aus dem
  Binary-Export (kein neuer Request-Typ nötig, wenn im selben `export`-Aufruf enthalten).
- `src/event-edit.ts` — `isEventReadOnly` muss `isReminder`-Kacheln als read-only werten.
- `src/calendar-view.ts` — Rendering der Erinnerungs-Kachel (Icon, Farbe), Unterdrückung
  von Drag/Resize-Handles, Guard vor `noteManager.openOrCreate` für Erinnerungs-Kacheln.
- `styles.css` — Kachel-Styling für Erinnerungen (Checkbox-Icon, feste Farbe außerhalb
  `CAL_COLOR_PALETTE`).

## Test Expectations
Automatisiert (Vitest):
- Mapping-Logik "Fälligkeit ohne Uhrzeit → ganztägig" / "mit Uhrzeit → 30-Min-Block" /
  "ohne Fälligkeitsdatum → ausgeschlossen" (deckt Scenarios 1–3; reine Datumslogik,
  testbar unabhängig vom Binary z. B. gegen ein Fixture-JSON).
- `isEventReadOnly(reminderEvent) === true` und Abwesenheit von Drag/Resize-Handles beim
  Rendern einer Reminder-Kachel (deckt Scenario "read-only").
- Guard vor `noteManager.openOrCreate`: Klick-Handler ruft für `isReminder`-Events keine
  Note-Erstellung/-Öffnung auf (deckt Scenario "keine Note").
- Farb-/Icon-Zuweisung: Reminder-Kachel erhält eine feste, von `CAL_COLOR_PALETTE`
  verschiedene Farbe (deckt Scenario "visuell unterscheidbar").

Manuell (QA, da EventKit-Berechtigungen und echte Reminders-Daten nur auf einem
macOS-Gerät mit konfigurierter Liste „EK" verifizierbar sind):
- Erledigte Erinnerung wird nach Abhaken in Reminders.app beim nächsten Sync im
  Deskleaf-Kalender ausgeblendet (Scenario "erledigte Erinnerung").
- Erinnerung aus einer anderen Liste als „EK" bleibt unsichtbar (Scenario "andere Liste").
- Berechtigungsdialog für Erinnerungszugriff erscheint beim ersten Start nach Update und
  blockiert bei Ablehnung nicht den bestehenden Event-Kalender.

---

## UX Review

### User Story
Handlungsorientiert, klarer Nutzen ("an einem Ort im Blick, ohne Reminders-App zu
öffnen"). Kein Befund.

### Acceptance Criteria — Beobachtbarkeit
Alle ACs sind rein am gerenderten Kalender beobachtbar (Kachel-Position, Kachel-Optik,
Abwesenheit von Interaktionsmöglichkeiten). Kein internes Implementierungsdetail in den
ACs selbst.

### Edge Cases
1. **Überlappung mit echten Terminen zur selben Uhrzeit**: Ein 30-Minuten-Reminder-Block
   kann mit einem echten Termin kollidieren. Das bestehende Overlap-Layout
   (`event-layout.ts`) behandelt das bereits generisch für beliebige Events am selben Tag
   — keine Sonderbehandlung nötig, da die Reminder-Kachel wie jedes andere timed Event in
   die Spaltenberechnung eingeht.
2. **Sehr viele Erinnerungen an einem Tag**: Kein Sonderfall — Layout skaliert wie bei
   vielen Events bereits heute.
3. **Erinnerung wird während einer offenen Session in Reminders.app abgehakt**: Wird beim
   nächsten Fetch/Watch-Zyklus des Binarys aus dem Kalender entfernt (AC4), kein Sofort-Push
   nötig — konsistent mit dem bestehenden Polling-Modell des Binary-Backends.
4. **Zeitzonen**: Fälligkeitszeit einer Erinnerung wird wie bei Events lokal interpretiert
   (`EKReminder.dueDateComponents` ist bereits lokal/Kalender-bezogen) — kein Zusatzaufwand.

### Barrierefreiheit
- Reminder-Kacheln sollten wie bei den read-only iCal-Feed-Kacheln (siehe
  `calendar-subscriptions.md`) einen `aria-readonly`/`aria-label`-Zusatz erhalten
  ("Erinnerung, nicht bearbeitbar"), damit Screenreader-Nutzer den read-only-Status nicht
  nur über die fehlende Drag-Möglichkeit erschließen müssen.
- Da die Unterscheidung zu echten Events über Icon **und** Farbe erfolgt (AC5), nicht nur
  über Farbe, ist das Feature für farbenblinde Nutzer bereits robuster als reine
  Farbkodierung.

### Konsistenz mit bestehender UI
- Folgt demselben Read-only-Muster wie iCal-Feed-Events (`isFeedEvent` /
  `isEventReadOnly` in `event-edit.ts`) — Erinnerungen erweitern dieselbe Guard-Funktion
  um ein `isReminder`-Flag, statt ein Parallelsystem einzuführen.
- Der bereits im iCal-Feed-Review notierte Konsistenz-Gap ("Klick auf read-only Event
  löst trotzdem `openOrCreate` aus") wird durch AC6 für Erinnerungen explizit
  ausgeschlossen und sollte bei Gelegenheit auch für iCal-Feed-Events nachgezogen werden
  (nicht Teil dieser Spec).

*Feature Planner — 2026-09-09*

---

## Design Review

### 1. Binary-Protokoll (`DeskleafCalendarSync`)
- `requestAccess()` erweitern: zusätzlich zu `.event` auch Zugriff auf `.reminder`
  anfragen (macOS 14+: `requestFullAccessToReminders()`; älter: `requestAccess(to: .reminder)`).
  Fehlender Reminder-Zugriff darf den bestehenden Event-Pfad **nicht** blockieren — beide
  Zugriffe unabhängig behandeln, wie es die bestehende `guard await requestAccess()`-Struktur
  heute schon für Events tut.
- `DeskleafEvent` um `let isReminder: Bool` erweitern (Default `false` über einen zweiten
  Initializer, kein Breaking Change für bestehende Event-Konsumenten).
- Neuer Initializer `DeskleafEvent(reminder: EKReminder) -> DeskleafEvent?`:
  - `nil`, wenn `reminder.calendar?.title != "EK"`, `reminder.isCompleted == true`, oder
    `reminder.dueDateComponents` fehlt (AC1, AC3, AC4 bereits im Binary durchgesetzt —
    kleinere JSON-Payload, keine Filterlogik im TS-Layer nötig).
  - `isAllDay = reminder.dueDateComponents?.hour == nil` (AC2).
  - `start`/`end`: bei `isAllDay` beide auf das Fälligkeitsdatum; sonst `start` = Fälligkeits-
    zeitpunkt, `end` = `start + 30min`.
  - `id = "reminder:\(reminder.calendarItemIdentifier)"` (eigener Namensraum, analog zu
    `ical:` bei Feed-Events — verhindert Kollision mit Event-IDs und macht die
    `isFeedEvent`-artige Erkennung robust, falls künftig zusätzlich ein `id`-basierter
    Check gewünscht wird).
  - `isOrganizer` **nicht** wiederverwenden (dieses Feld steuert bereits die
    "Einladung ablehnen"-Logik für Termine) — stattdessen ausschließlich über das neue
    `isReminder`-Flag read-only erzwingen.
- `fetchAndPrint` fasst `EKEvent`- und `EKReminder`-Ergebnisse in ein gemeinsames Array
  zusammen und behält damit das bestehende Single-Array-JSON-Schema bei — keine neue
  Top-Level-Struktur, kein neuer CLI-Befehl. `watch` profitiert automatisch mit
  (`EKEventStoreChanged` feuert auch bei Reminder-Änderungen).

### 2. TypeScript-Datenmodell
- `CalendarEvent.isReminder?: boolean` in `types.ts` — einziges neues Feld, keine
  Migration nötig (fehlt = `false`/`undefined`, bestehende Events unverändert).
- `calendar-reader.ts` braucht keine Änderung, sofern der Binary-Export Reminder bereits
  als reguläre `CalendarEvent`-Objekte mit `isReminder: true` liefert — der bestehende
  Cache- und Watch-Pfad (`calendarCache` in `data.json`) trägt sie transparent mit.

### 3. View-Layer
- `isEventReadOnly` (`event-edit.ts:10`) um `|| !!event.isReminder` erweitern — deckt
  AC6/AC7 zentral ab, an derselben Stelle, die bereits `isFeedEvent`/`isAllDay`/
  `isOrganizer === false` behandelt.
- `openEvent`/Klick-Handler (`calendar-view.ts` um Zeile 3132) muss vor
  `noteManager.openOrCreate` auf `event.isReminder` prüfen und früh zurückkehren — dies
  ist eine **neue** Guard-Stelle, da der bestehende iCal-Feed-Pfad diesen Check laut
  UX-Review von `calendar-subscriptions.md` bislang nicht hat. Für Erinnerungen ist der
  Guard durch AC6 verbindlich.
- Kachel-Rendering: Checkbox-Icon + feste Hue außerhalb `CAL_COLOR_PALETTE` (Vorschlag:
  neutraler Grauton statt einer weiteren Hue, um jede visuelle Nähe zu den 6
  Kalenderfarben zu vermeiden) über einen dedizierten CSS-Klassen-Modifier
  (`.dl-event-card--reminder`), analog zum bestehenden `--cal-h`-Custom-Property-Muster.
  Kein neuer Farbwert in `CAL_COLOR_PALETTE` selbst, da diese Konstante explizit die
  6 nutzerwählbaren Kalenderfarben repräsentiert.
- Drag-to-move/-resize-Initialisierung bereits heute an `isEventReadOnly`/`isFeedEvent`
  gekoppelt (`calendar-view.ts:1599`) — mit dem `isReminder`-Zusatz in `isEventReadOnly`
  automatisch mit abgedeckt, keine separate Sonderbehandlung nötig.

### 4. Risiken
| Risiko | Schwere | Mitigation |
|---|---|---|
| Reminder-Berechtigung separat von Event-Berechtigung (macOS fragt beide einzeln ab) | Niedrig | Unabhängige Fehlerbehandlung; fehlender Reminder-Zugriff darf Event-Export nicht stoppen |
| `dueDateComponents` ohne Zeitzone-Info bei manchen Alt-Erinnerungen | Niedrig | `Calendar.current`-Interpretation wie bei Events; kein bekannter Sonderfall in EventKit |
| Listenname „EK" ändert sich/wird umbenannt | Niedrig | Fest verdrahteter String ist bewusste Nutzerentscheidung (siehe Issue #81); keine Fehlerbehandlung nötig, Liste erscheint dann einfach leer |
| iOS hat keinen lokalen Binary-Prozess | Niedrig | Bestehendes Fallback-Verhalten ("Mobiles Gerät", Cache-Anzeige) bleibt unverändert; explizit in Out of Scope benannt |

**Gesamteinschätzung**: Kleines, additives Feature. Kein Umbau des bestehenden
Event-Datenmodells; ein neues Boolean-Feld plus eine zusätzliche Guard-Stelle im
View-Layer. Größte Abweichung vom Bestehenden ist die neue `openOrCreate`-Guard-Stelle
(AC6), die es für iCal-Feed-Events bislang nicht gibt.

*Feature Planner — 2026-09-09*

---

## QA Report
_Pending_
