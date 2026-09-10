# Feature: Reminders Overlay (read-only EventKit)

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

> Delta-Spec für die Produktlinie **obsidian** (Factory-Feature `fr-20260902085426-b180f116`,
> Issue [#81](https://github.com/eckelt/deskleaf-for-obsidian/issues/81)). Die Produktlinie
> **display** ist außerhalb dieses Repos spezifiziert und nicht Teil dieser Spec.

> **Fix-forward (2026-09-10, nach #82-Merge)**: Der fest verdrahtete Listenname war
> ursprünglich fälschlich als „EK" spezifiziert und implementiert (`main.swift`:
> `reminder.calendar?.title != "EK"`). Der Nutzer hat bestätigt, dass die tatsächliche
> Erinnerungsliste auf seinem Gerät „Erinnerungen" heißt — mit „EK" filtert der Binary
> jede Erinnerung heraus, weshalb im Obsidian-Kalender nie etwas erschien. Diese Spec
> ersetzt „EK" durchgängig durch „Erinnerungen"; der Builder muss den String in
> `swift/Sources/DeskleafCalendarSync/main.swift` (und den zugehörigen Swift-Tests in
> `DeskleafCoreTests/ReminderMappingTests.swift`) entsprechend korrigieren.

> **Fix-forward (2026-09-10, CalDAV-Koexistenz)**: Der Nutzer hat im Factory-Refinement
> bestätigt, dass er CalDAV als aktives Backend nutzt (`caldav.username`+`password`
> gesetzt). Weil `main.ts:makeReader()` genau einen Reader exklusiv wählt, wurde der
> binary-basierte `CalendarReader` — und damit jede `isReminder`-Quelle — für ihn nie
> instanziiert: das in #82/#83 gemergte Feature zeigt bei ihm keine Erinnerungen. Diese
> Spec-Erweiterung führt einen parallelen, reminders-only Binary-Prozess ein, der
> zusätzlich zum CalDAV-Eventpfad läuft, sofern das Gerät lokalen Dateisystemzugriff auf
> das Binary hat (macOS Desktop). Siehe
> [ADR 3](../../docs/adr/0003-reminders-coexist-with-caldav.md) für die architektonische
> Entscheidung. AC8–AC12 und die zugehörigen Scenarios sind neu; AC1–AC7 gelten
> unverändert weiter.

## User Story
Als Nutzer möchte ich meine macOS/iOS-Erinnerungen aus der EventKit-Erinnerungsliste „Erinnerungen"
im Deskleaf-Kalender sehen, damit ich Termine und fällige Erinnerungen an einem Ort im
Blick habe, ohne die Reminders-App zu öffnen.

## Acceptance Criteria
- [ ] AC1: Erinnerungen aus der EventKit-Erinnerungsliste **„Erinnerungen"** erscheinen im
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
- [ ] AC8: Ist CalDAV das aktive Event-Backend (`caldav.username`+`password` gesetzt)
  **und** läuft das Plugin auf einem Gerät mit lokalem Dateisystemzugriff auf das Binary
  (macOS Desktop — derselbe `basePath`-Check wie in `getBinaryPath()`), startet das Plugin
  zusätzlich einen zweiten, parallelen Binary-Prozess im Reminders-only-Modus. Erinnerungen
  aus Liste „Erinnerungen" erscheinen dann **zusätzlich** zu den CalDAV-Events im Kalender,
  mit demselben Mapping wie in AC2–AC5.
- [ ] AC9: Dieser zweite Prozess liefert ausschließlich `isReminder`-Objekte, nie
  `EKEvent`-Daten — es entstehen dadurch keine Duplikate mit den CalDAV-Events, und es wird
  keine macOS-Kalenderzugriffs-Berechtigung angefragt (nur der `.reminder`-Scope).
- [ ] AC10: Auf einem Gerät ohne lokalen Dateisystemzugriff zum Binary (iOS/Mobile) bleiben
  Erinnerungen bei aktivem CalDAV-Backend weiterhin unsichtbar — unverändert zum
  bestehenden "Mobiles Gerät"-Fallback-Verhalten für Events.
- [ ] AC11: Schlägt der zweite, reminders-only Prozess fehl (Berechtigung verweigert,
  Binary fehlt, Absturz), bleibt der CalDAV-Eventpfad davon vollständig unberührt — es gibt
  höchstens einen reminder-spezifischen Fehlerhinweis, nie einen Fehler im Event-Kalender.
- [ ] AC12: Ist der Binary selbst das aktive Event-Backend (keine CalDAV-Zugangsdaten
  gesetzt), ändert sich nichts gegenüber #82/#83 — Erinnerungen kommen weiterhin aus
  demselben, bereits laufenden Prozess (kein zweiter Prozess, keine Regression).

## Acceptance Scenarios
```gherkin
Scenario: Erinnerung ohne Fälligkeitszeit als Tagesevent
  Given eine Erinnerung in Liste "Erinnerungen" mit Fälligkeitsdatum 2026-09-10 und keiner Uhrzeit
  When der Kalender für den 10.09.2026 gerendert wird
  Then erscheint die Erinnerung als ganztägige Kachel an diesem Tag

Scenario: Erinnerung mit Fälligkeitszeit als 30-Minuten-Block
  Given eine Erinnerung in Liste "Erinnerungen" mit Fälligkeit 2026-09-10 14:00
  When der Kalender für den 10.09.2026 gerendert wird
  Then erscheint die Erinnerung als Zeitblock von 14:00 bis 14:30

Scenario: Erinnerung ohne jedes Fälligkeitsdatum wird ausgeblendet
  Given eine Erinnerung in Liste "Erinnerungen" ohne Fälligkeitsdatum
  When der Kalender gerendert wird
  Then erscheint diese Erinnerung an keinem Tag

Scenario: Erledigte Erinnerung wird ausgeblendet
  Given eine Erinnerung in Liste "Erinnerungen", die in EventKit als erledigt markiert ist
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

Scenario: CalDAV aktiv, Desktop → Erinnerungen erscheinen zusätzlich
  Given CalDAV ist als aktives Backend konfiguriert und das Plugin läuft auf macOS Desktop
  And eine Erinnerung in Liste "Erinnerungen" mit Fälligkeit heute 14:00 existiert
  When der Kalender gerendert wird
  Then erscheinen sowohl die CalDAV-Events als auch die Erinnerung als 14:00–14:30-Block

Scenario: CalDAV aktiv, Mobile → keine Erinnerungen
  Given CalDAV ist als aktives Backend konfiguriert und das Plugin läuft auf iOS/Mobile
  When der Kalender gerendert wird
  Then erscheinen nur CalDAV-Events, keine Erinnerungen

Scenario: Reminders-Zusatzprozess schlägt fehl → Events unberührt
  Given CalDAV ist aktiv und der reminders-only Zusatzprozess kann das Binary nicht starten
  When der Kalender gerendert wird
  Then erscheinen die CalDAV-Events unverändert und es wird keine Erinnerung angezeigt
```

## Out of Scope
- CalDAV/VTODO-Erinnerungen (z. B. Fastmail) — nur `EKReminder` über den macOS/iOS-Binary
- Zwei-Wege-Sync: Abhaken, Verschieben oder Bearbeiten von Erinnerungen aus Obsidian heraus
- Konfigurierbarer Listen-Filter/-Einstellung — die Liste „Erinnerungen" ist fest verdrahtet, keine UI zur Auswahl anderer Listen
- Anzeige erledigter Erinnerungen (auch nicht optional/durchgestrichen)
- Brain-Vault-Notiz-Beziehung für Erinnerungen (keine eigene Datei, keine Verknüpfung zu Kunden/Todos)
- Nutzerkonfigurierbare Farbe/Icon für Erinnerungs-Kacheln
- Die Produktlinie **display** (separates Repo/Spec)
- iOS-Erinnerungen ohne lokalen macOS-Binary (das Binary läuft nur auf macOS; auf
  iOS/Mobile bleibt der bestehende "Mobiles Gerät"-Fallback ohne Live-Reminders-Daten
  bestehen — auch bei aktivem CalDAV-Backend, siehe AC10)
- Kein neues Setting/Toggle für die Reminders-Zusatzabfrage bei CalDAV — automatisch
  analog zur bestehenden Backend-Auswahl (`makeReader()`), keine UI-Konfiguration
- Kein Versuch, Erinnerungen selbst über CalDAV/VTODO zu synchronisieren — der
  Zusatzprozess bleibt EventKit-only (weiterhin konsistent mit AC1)

## Open Questions
_None — geklärt in [#81](https://github.com/eckelt/deskleaf-for-obsidian/issues/81)._

## Affected Areas
- `swift/Sources/DeskleafCalendarSync/main.swift` — `EKReminder`-Zugriff (`requestAccess`
  um `.reminder`-Scope erweitern), Fetch der Liste „Erinnerungen", Mapping auf das bestehende
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
- `swift/Sources/DeskleafCalendarSync/main.swift` — neuer Modus `--reminders-only` für
  `export`/`watch`: überspringt `requestAccess()` (Event-Scope) vollständig, fragt nur
  `requestReminderAccess()` an, und ruft eine aus `fetchAndPrint` extrahierte
  `fetchAndPrintReminders`, die ausschließlich `EKReminder`→`DeskleafEvent`-Objekte
  ausgibt (kein `store.events(matching:)`-Aufruf in diesem Modus).
- `main.ts` — bei aktivem CalDAV-Backend **und** vorhandenem `basePath` (Desktop) einen
  zweiten `CalendarReader`-Prozess im `--reminders-only`-Modus zusätzlich
  starten/stoppen: gleicher Lifecycle wie der bestehende Reader
  (`load()`/`startWatching()`/`stopWatching()`), inklusive Cleanup in `onunload()` und
  Neustart bei Zugangsdaten-Wechsel in `saveSettings()`. Läuft der Zusatzprozess auf
  einem Gerät ohne `basePath`, wird er gar nicht erst instanziiert (AC10).
  Empfohlen: ein Composite, der beide Quellen (CalDAV-Events + reminders-only
  Binary-Events) hinter derselben Reader-Schnittstelle zusammenführt, damit
  `calendar-view.ts`/`sidebar-view.ts` unverändert bleiben und `plugin.calendarReader`
  für die View-Schicht weiterhin eine einzelne Quelle ist. Write-Methoden
  (`createEvent`/`moveEvent`/`updateEvent`/`cancelEvent`) delegieren dabei ausschließlich
  an den primären (CalDAV-)Reader — Erinnerungen bleiben über AC7 read-only.

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
- Merge-Logik der Composite-Quelle (pure function, unabhängig vom Binary testbar gegen
  Fixtures): CalDAV-Events + reminders-only-Events werden dedupliziert/zusammengeführt,
  ausschließlich `isReminder`-Objekte aus der zweiten Quelle werden übernommen (deckt
  AC9 und Scenario "CalDAV aktiv, Desktop").
- Reader-Auswahl: Bei CalDAV-Zugangsdaten **und** vorhandenem `basePath` wird der
  reminders-only Zusatzprozess instanziiert; ohne `basePath` (iOS) oder ohne
  CalDAV-Zugangsdaten (Binary bereits aktiv) nicht (deckt AC8, AC10, AC12).

Manuell (QA, da EventKit-Berechtigungen und echte Reminders-Daten nur auf einem
macOS-Gerät mit konfigurierter Liste „Erinnerungen" verifizierbar sind):
- Erledigte Erinnerung wird nach Abhaken in Reminders.app beim nächsten Sync im
  Deskleaf-Kalender ausgeblendet (Scenario "erledigte Erinnerung").
- Erinnerung aus einer anderen Liste als „Erinnerungen" bleibt unsichtbar (Scenario "andere Liste").
- Berechtigungsdialog für Erinnerungszugriff erscheint beim ersten Start nach Update und
  blockiert bei Ablehnung nicht den bestehenden Event-Kalender.
- Mit konfiguriertem CalDAV-Backend auf einem macOS-Desktop-Vault: Erinnerungen aus
  Liste „Erinnerungen" erscheinen zusätzlich zu den CalDAV-Events, und der
  Reminders-only-Zusatzprozess fragt **nur** nach Erinnerungszugriff, nicht nach
  vollem Kalenderzugriff (deckt AC8, AC9, Scenario "CalDAV aktiv, Desktop").
- Mit CalDAV auf iOS (keine lokale Binary-Datei): keine Erinnerungen sichtbar, keine
  Fehlermeldung im Event-Kalender (deckt AC10, Scenario "CalDAV aktiv, Mobile").
- Binary-Pfad ungültig/Prozess crasht bei aktivem CalDAV+Desktop: CalDAV-Events bleiben
  unbeeinträchtigt sichtbar (deckt AC11, Scenario "Reminders-Zusatzprozess schlägt fehl").

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
5. **CalDAV aktiv, aber kein Desktop-Binary vorhanden/lauffähig**: Kein Fehlerzustand —
   Erinnerungen bleiben einfach unsichtbar, exakt wie beim bestehenden Mobile-Fallback für
   Events (AC10/AC11). Kein zusätzlicher UI-Hinweis nötig, da dies kein neuer, sondern der
   bereits bekannte Zustand ist.
6. **Zwei Prozesse gleichzeitig auf Desktop mit CalDAV**: Der primäre CalDAV-Poll-Zyklus
   und der reminders-only Binary-Prozess laufen unabhängig und beeinflussen sich nicht
   gegenseitig in Timing/Fehlerbehandlung (AC11) — kein gemeinsamer Fehlerzustand.

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
  - `nil`, wenn `reminder.calendar?.title != "Erinnerungen"`, `reminder.isCompleted == true`, oder
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
| Listenname „Erinnerungen" ändert sich/wird umbenannt | Niedrig | Fest verdrahteter String ist bewusste Nutzerentscheidung (siehe Issue #81); keine Fehlerbehandlung nötig, Liste erscheint dann einfach leer |
| iOS hat keinen lokalen Binary-Prozess | Niedrig | Bestehendes Fallback-Verhalten ("Mobiles Gerät", Cache-Anzeige) bleibt unverändert; explizit in Out of Scope benannt |
| Zweiter Binary-Prozess bei CalDAV+Desktop erhöht Ressourcen-/Prozessverbrauch | Niedrig | Reminders-only-Modus fragt nur `.reminder`-Scope an und überspringt den teuren Event-Fetch; Lifecycle exakt an den bestehenden Reader gekoppelt (kein verwaister Prozess) |
| Reminders-only-Modus fragt versehentlich weiter nach vollem Kalenderzugriff (falls `requestAccess()` nicht übersprungen wird) | Mittel | Explizit in Affected Areas gefordert: `requestAccess()` (Event) wird im `--reminders-only`-Zweig des Binarys nicht aufgerufen; nur `requestReminderAccess()` |

**Gesamteinschätzung**: Kleines, additives Feature. Kein Umbau des bestehenden
Event-Datenmodells; ein neues Boolean-Feld plus eine zusätzliche Guard-Stelle im
View-Layer. Größte Abweichung vom Bestehenden ist die neue `openOrCreate`-Guard-Stelle
(AC6), die es für iCal-Feed-Events bislang nicht gibt.

*Feature Planner — 2026-09-09*

---

## Design Review — CalDAV-Koexistenz (Nachtrag 2026-09-10)

### 5. Reminders-only Binary-Modus
- `main.swift`: neuer erster Positionsparameter-Zweig bzw. `--reminders-only`-Flag auf
  `export`/`watch`. Wenn gesetzt: `requestAccess()` (Event-Scope, aktuell hart per `guard`
  vor dem `switch` erzwungen) wird **nicht** aufgerufen — stattdessen direkt
  `requestReminderAccess()`, danach eine neue `fetchAndPrintReminders(daysBack:daysForward:)`,
  die nur den `evs += await fetchReminders()...`-Teil von `fetchAndPrint` enthält (kein
  `store.events(matching:)`). Ohne das Flag verhält sich der Binary exakt wie heute — keine
  Breaking Changes am bestehenden `export`/`watch`-Pfad.
- `watch --reminders-only` bleibt über denselben `EKEventStoreChanged`-Observer aktuell
  (feuert auch bei Reminder-Änderungen, wie im ursprünglichen Design Review Punkt 1
  festgehalten).

### 6. `main.ts` — zweiter Reader-Lifecycle
- Bedingung für den Zusatzprozess: `caldav.username && caldav.password` **und**
  `getBinaryPath()` liefert einen echten Dateisystempfad (nicht den iOS-Platzhalter) —
  wiederverwendet denselben `basePath`-Check, der heute schon zwischen Desktop/iOS
  unterscheidet.
- Der Zusatzprozess ist eine zweite Instanz von `CalendarReader`, gestartet mit
  `["export"/"watch", "--reminders-only", ...]`; sein `getEvents()`-Ergebnis enthält per
  Konstruktion nur `isReminder`-Objekte (AC9), muss also clientseitig nicht gefiltert
  werden.
- Empfohlene Kapselung: ein schlanker Composite (z. B. `CompositeCalendarReader`), der
  die bestehende Reader-Schnittstelle (`getEvents`, `getEventsForDate`,
  `getAllDayEventsForDate`, `onChange`, `load`, `startWatching`, `stopWatching`,
  `getLoadError`, `getCacheDate`, `getEventUrl`) implementiert, intern beide Reader hält
  und ihre Events zusammenführt sowie ihre `onChange`-Watcher weiterleitet. Write-Methoden
  delegieren ausschließlich an den primären (CalDAV-)Reader. Dadurch bleiben
  `calendar-view.ts`, `sidebar-view.ts` und `note-manager.ts` unverändert — sie kennen nur
  `plugin.calendarReader` als eine Quelle.
- Lifecycle-Kopplung: `onLayoutReady` (`load()`+`startWatching()`), `onunload`
  (`stopWatching()`) und der Zugangsdaten-Wechsel-Zweig in `saveSettings()` müssen den
  Zusatzprozess exakt wie den primären Reader mitführen — kein separater Timer, keine
  eigene Lifecycle-Quelle.

### 7. Risiken (Nachtrag)
Siehe aktualisierte Risikotabelle oben.

**Gesamteinschätzung (Nachtrag)**: Die Änderung bleibt additiv und reversibel — das Flag
ist optional, der bestehende Binary- und CalDAV-Pfad ändert sich ohne CalDAV+Desktop-
Kombination nicht. Der einzige strukturelle Eingriff ist der empfohlene Composite-Reader
in `main.ts`, der aber die View-Schicht komplett abschirmt.

*Feature Planner — 2026-09-10*

---

## QA Report
_Pending_
