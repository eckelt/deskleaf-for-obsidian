# Feature: Calendar Subscriptions (read-only iCal feeds)

## Status
`design-reviewed`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## User Story
Als Nutzer möchte ich zusätzliche iCal-Feeds (z. B. Abfuhrkalender, WM-Spielplan) per URL abonnieren, damit deren Termine neben meinen persönlichen Kalender-Events im Deskleaf-Kalender sichtbar sind.

## Acceptance Criteria
- [ ] AC1: Der Nutzer kann in den Einstellungen eine oder mehrere iCal-Feed-URLs (webcal:// oder https://) hinzufügen, benennen und wieder entfernen; jeder Feed lässt sich per Toggle aktivieren oder deaktivieren.
- [ ] AC2: Deskleaf lädt abonnierte Feeds beim Plugin-Start sowie in einem konfigurierbaren Intervall (Standard: 60 Minuten) im Hintergrund und cacht die Events in `data.json` (analog zu `calendarCache`).
- [ ] AC3: Events aus abonnierten Feeds erscheinen in der Kalenderansicht als reguläre Event-Cards; jeder Feed erhält eine eigene Farbe aus `CAL_COLOR_PALETTE`, und der Feed-Name wird als `calendar`-Feld der `CalendarEvent`-Einträge gesetzt.
- [ ] AC4: Abonnierte Feeds sind read-only — Drag-to-move, Drag-to-resize und Drag-to-create erzeugen für diese Events keine Schreiboperation; der Nutzer sieht keinen Drag-Handle und keinen Resize-Griff an diesen Cards.
- [ ] AC5: Schlägt das Laden eines Feeds fehl (Netzwerkfehler, ungültige URL, Parse-Fehler), wird der zuletzt gecachte Stand weiterverwendet und ein Warn-Status in der Statusleiste der Kalenderansicht angezeigt; andere Feeds und der Primärkalender sind davon nicht betroffen.

## Out of Scope
- Zwei-Wege-Sync oder Schreibzugriff auf abonnierte Feeds
- Authentifizierung (Basic Auth, OAuth) für geschützte Feed-URLs
- Anzeige abonnierter Feeds als eigene Kalenderansicht oder Filterung nach Feed
- Import einzelner Events aus Feeds als lokale CalDAV-Events
- Automatische Erkennung von Feed-URLs (z. B. via DNS-SD/CalDAV-Discovery)

## Open Questions
_None_

---

## UX Review

### User Story

Die Story ist handlungsorientiert ("möchte ich abonnieren") und nennt einen klaren Outcome ("neben meinen persönlichen Events sichtbar"). Die Formulierung ist ausreichend nutzerorientiert. Kein Befund.

### Acceptance Criteria — Beobachtbarkeit

| AC | Beobachtbar? | Anmerkung |
|---|---|---|
| AC1 | Ja | Einstellungs-UI vollständig beschrieben (Add/Rename/Remove/Toggle) |
| AC2 | Teilweise | "cacht in `data.json`" ist eine interne Implementierungsdetail, nicht vom Nutzer beobachtbar. Das Kriterium sollte umformuliert werden: *"Events aus abonnierten Feeds sind nach dem Plugin-Start sichtbar und aktualisieren sich automatisch; das Intervall ist konfigurierbar (Standard: 60 Minuten)."* |
| AC3 | Ja | Farbe und Feed-Name als `calendar`-Feld sind am Ende über die UI beobachtbar (Farbe auf der Card, Feed-Name ggf. im Tooltip) |
| AC4 | Ja | Abwesenheit von Drag-Handle/Resize-Griff ist direkt sichtbar |
| AC5 | Ja | Warn-Status in der Statusleiste ist sichtbar; Verhalten bei Teilausfall klar definiert |

**Empfehlung:** AC2 um einen beobachtbaren Satz ergänzen; den Implementierungshinweis (`data.json`) in eine technische Notiz oder den Design-Review verschieben.

### Edge Cases

**Fehlend oder unklar:**

1. **Farbkonflikte / Farbzuweisung:** AC3 sagt "jeder Feed erhält eine eigene Farbe aus `CAL_COLOR_PALETTE`", aber die Palette hat laut Design-Spec 6 Farben. Was passiert bei mehr als 6 abonnierten Feeds? Wraparound? Zufallsfarbe? Muss spezifiziert werden.

2. **Doppelte URLs:** Kann derselbe Feed-URL zweimal hinzugefügt werden? Das würde zu doppelten Events führen. Eine Validierung auf Duplikat-URL beim Hinzufügen sollte in AC1 ergänzt werden.

3. **Leerer Feed / Feed ohne Events im sichtbaren Zeitraum:** Kein Fehler, aber kein sichtbares Ergebnis. Nutzer könnte glauben, der Feed sei defekt. Empfehlung: in den Einstellungen einen Zeitstempel "Zuletzt erfolgreich geladen: …" oder Eventanzahl pro Feed anzeigen.

4. **Sehr langer Feed-Name:** Wie wird der Feed-Name auf der Calendar-Card dargestellt? Truncation-Verhalten in engen Karten (Single-Day-View, Sa|So-Merged-Slot) fehlt.

5. **Plugin-Start ohne Netzwerk:** Wenn kein Cache vorhanden ist und kein Netzwerk verfügbar ist, sieht der Nutzer keinen Warn-Status für den Primärkalender (der funktioniert weiterhin). AC5 deckt nur den Fall "fehlerhafter Cache vorhanden" ab. Der Fall "kein Cache, kein Netz" (erster Start) ist nicht explizit adressiert.

6. **Sehr viele Events aus Feed:** Ein öffentlicher Kalender (z. B. bundesweite Feiertage über 10 Jahre) kann Tausende Events enthalten. Kein Hinweis auf Größenbeschränkung oder Ladezeit-Feedback.

### Barrierefreiheit

1. **Read-only-Indikator nicht tastaturzugänglich:** AC4 spricht von abwesendem Drag-Handle als visuellem Signal. Screenreader-Nutzer und Tastaturnutzer erhalten keine Information, dass ein Event read-only ist. Empfehlung: `aria-readonly="true"` oder ein `aria-label`-Zusatz ("read-only, aus Feed: \<Feed-Name\>") auf read-only Cards ergänzen.

2. **Warn-Status in der Statusleiste:** Die bestehende Statusleiste (`.dl-status-bar--warn`) ist bereits für Fehlerzustände vorhanden (laut `calendar-view.md`). Kein neuer A11y-Befund, solange dasselbe Muster verwendet wird.

3. **Farbkodierung als einziges Unterscheidungsmerkmal:** Wenn Feed-Events ausschließlich durch Farbe von Primärkalender-Events unterschieden werden, ist das für farbenblinde Nutzer problematisch. Empfehlung: zusätzlich den Feed-Namen als Tooltip oder kleines Label auf der Card (ggf. nur bei ausreichender Kartenhöhe, analog zur Locations-Anzeige ab 42px).

### Konsistenz mit bestehender UI

- **Drag-to-create auf read-only-Tagen:** Wenn ein Tag nur read-only Feed-Events enthält, ist Drag-to-create auf dem leeren Bereich weiterhin möglich (AC4 schränkt nur bestehende Events ein). Das ist konsistent mit dem bestehenden Modell, sollte aber explizit bestätigt werden.
- **Click-to-open-Note:** Bestehende Event-Cards öffnen eine verknüpfte Note bei Klick (`openEvent` → `noteManager.openOrCreate`). Für read-only Feed-Events ist kein Note-Link vorgesehen — ein Klick würde dennoch `openOrCreate` auslösen und eine leere Note anlegen. Das ist ein **Konsistenzproblem**: entweder Notes für Feed-Events explizit ausschließen (kein `openOrCreate`) oder als Feature zulassen und in Out of Scope klarstellen.
- **`--has-note`-Border:** Das visuelle Modifier `--has-note` (4px left border) würde erscheinen, sobald zufällig eine Note mit übereinstimmender `event-id` existiert. Bei Feed-Events ohne stabile `event-id`-Garantie (UIDs aus externen iCal-Feeds) kann das zu falsch-positiven Borders führen.
- **Farbpalette teilen mit Primärkalender:** Falls der Primärkalender bereits eine oder mehrere Farben der `CAL_COLOR_PALETTE` belegt, können Feed-Farben mit Primärkalender-Event-Farben visuell kollidieren. Die Zuweisung sollte entweder in einem separaten Slot-Raum erfolgen oder die Spezifikation muss klarmachen, dass Feed-Farben unabhängig vom Primärkalender-Farbschema vergeben werden.

### Zusammenfassung

Keine blockierenden Probleme. Zwei höher-priorisierte Punkte für AC-Überarbeitung vor Implementierungsstart empfohlen:

1. **AC2** um beobachtbare Formulierung ergänzen (intern → extern).
2. **Click-to-open-Note auf read-only Events** explizit ausschließen oder einschließen (Konsistenzlücke).

Weitere Punkte (Farbkonflikte bei >6 Feeds, Duplikat-URL-Validierung, A11y-Label für read-only Cards, Feed-Name als Tooltip) als Folge-ACs oder technische Notes aufnehmen.

*UX Agent — 2026-06-03*

---

## Design Review

### 1. Datenmodell-Kompatibilität

**`CalendarEvent` — kein Breaking Change erforderlich.**
Das bestehende Interface trägt bereits alle Felder, die für Feed-Events benötigt werden: `calendar` (→ Feed-Name), `isOrganizer` (→ `false` für read-only), `id`, `start`, `end`, `isAllDay`, `isRecurring`. Es sind keine neuen Felder nötig, sofern `isOrganizer: false` als Signal für „kein Schreibzugriff" verwendet wird — das setzt AC4 sauber um, ohne neue Flags einzuführen.

**Neues Interface erforderlich:**

```ts
interface ICalFeedSubscription {
  id: string;                  // stabile UUID, Schlüssel für Cache-Lookup und calendarColors
  label: string;               // Anzeigename; wird als CalendarEvent.calendar gesetzt
  url: string;                 // https:// oder webcal:// URL
  enabled: boolean;
  lastFetched: string | null;  // ISO timestamp; null = noch nie geladen
  lastError: string | null;    // letzter Fehler (Anzeige im Status-Banner)
}
```

**`DeskleafSettings` — Erweiterung:**
Ein neues Feld `icalSubscriptions: ICalFeedSubscription[]` (Default: `[]`) genügt. Keine Migration nötig — fehlende Eigenschaft wird als leeres Array interpretiert.

**`data.json` — Erweiterung:**
Pro Feed ein Cache-Eintrag analog zu `calendarCache`. Vorschlag:

```ts
icalCache: Record<string, CalendarEvent[]>;  // feedId → Events
```

Alternativ empfohlen: separater `ical-cache.json`-File via `this.app.vault.adapter.write`, um `data.json` bei vielen Events nicht aufzublähen (AC2 formuliert `data.json` explizit — der Spec-Text sollte bei Approved-Phase an einen separaten File-Ansatz angepasst werden, wenn diese Entscheidung so fällt).

**Farb-Persistenz:**
Die bestehende `CalDAVSettings.calendarColors`-Map verwendet `displayName` als Schlüssel. iCal-Feed-IDs könnten theoretisch kollidieren. Empfohlen: separater `icalColors: Record<string, number>` in `DeskleafSettings` (Schlüssel: `ICalFeedSubscription.id`), anstatt in den bestehenden CalDAV-Record zu schreiben.

---

### 2. Neue Komponente: `ICalReader`

Ein eigenständiger `ICalReader` (analog zu `CalendarReader` / `CalDAVReader`) ist die richtige Architekturwahl:

- **Fetch**: `requestUrl` aus der Obsidian-API verwenden — **nicht** `fetch` oder `node:https`. `requestUrl` ist Cross-Platform (Desktop + Mobile) und umgeht CORS-Beschränkungen. `webcal://`-URLs müssen vor dem Request auf `https://` umgeschrieben werden (`url.replace(/^webcal:/, "https:")`).
- **Parser**: `ical.js` (Mozilla) empfohlen — gepflegt, TypeScript-Typen verfügbar, verarbeitet RRULE, EXDATE und VTIMEZONE korrekt. Rein in JS, keine native Abhängigkeit → mobile-kompatibel.
- **Polling**: `window.setInterval` (explizit mit `window`, nicht global) im Plugin-Kontext. Interval-Handle muss in `onunload()` bzw. `ICalReader.destroy()` gecleart werden. Konfigurierbare Intervall-Dauer als `icalRefreshIntervalMin: number` in `DeskleafSettings`.
- **Plugin-Reload**: `ICalReader.destroy()` muss alle laufenden Intervals und `onChange`-Subscriptions freigeben — analog zu `CalendarReader.stopWatching()`. Ohne diesen Cleanup bleiben Polling-Timer nach Plugin-Deaktivierung über Obsidian-Einstellungen aktiv.

---

### 3. Obsidian-API-Constraints

| Thema | Befund |
|---|---|
| Netzwerk-Requests | `requestUrl` (Obsidian API) ist der einzig portable Weg. Kein `XMLHttpRequest`, kein `fetch`, kein `node:https`. |
| `webcal://`-Schema | `requestUrl` unterstützt dieses Schema nicht. Einfaches Schema-Rewrite auf `https://` vor dem Aufruf. |
| iOS/Mobile | `ICalReader` läuft rein in TypeScript, kein `child_process` nötig — kein Problem. Polling via `window.setInterval` funktioniert auf iOS. |
| Plugin-Reload | `onunload()` in `main.ts` muss `ICalReader.destroy()` aufrufen. Fehlender Cleanup = Polling-Timer läuft weiter nach Deaktivierung. |
| `data.json`-Größe | Viele Abonnements mit großen Feeds (Feiertage, mehrjährige Serien) können `data.json` erheblich aufblähen. Separater `ical-cache.json` mitigiert das vollständig. |

---

### 4. Integration in die Kalenderansicht

- `getEventsForDate` / `getAllDayEventsForDate` müssen Events aus `ICalReader` und aus `CalendarReader`/`CalDAVReader` zusammenführen. Empfohlen: zentraler `EventAggregator`-Service; alternativ Konkatenation direkt in der View.
- **ID-Kollisionsrisiko**: iCal-UIDs aus externen Feeds können zufällig mit Binary- oder CalDAV-IDs kollidieren. Empfehlung: iCal-IDs mit `ical:<feedId>:<uid>` präfixieren.
- **`isOrganizer: false`** für alle iCal-Feed-Events setzen → Drag-Handle und Resize-Griff werden automatisch unterdrückt (AC4), sofern die View dieses Flag bereits auswertet (laut Datenmodell: ja).
- **`NoteManager`-Schutz**: Feed-Events dürfen `openOrCreate` nicht auslösen (UX-Review-Befund: Konsistenzlücke). Die View muss `isOrganizer === false` prüfen oder ein neues `isReadOnly`-Flag einführen, bevor `noteManager.openOrCreate` aufgerufen wird. Das `--has-note`-Border-Problem (falsch-positiv durch UID-Zufallstreffer) wird durch den `ical:<feedId>:<uid>`-Präfix im ID-Schema bereits vermieden.

---

### 5. Implementierungskomplexität und Risiken

| Risiko | Schwere | Mitigation |
|---|---|---|
| RRULE-Expansion (Wiederholungsregeln) | Mittel | `ical.js` expandiert RRULE korrekt. Zeitfenster begrenzen (z. B. ±365 Tage wie beim Binary), sonst explodierende Event-Zahlen bei endlosen Serien. |
| Timezone-Handling | Mittel | iCal-Feeds liefern `TZID`-Namen (z. B. `Europe/Berlin`), die `ical.js` intern auflöst. Output-ISO-Strings müssen auf lokale Zeit normiert werden — analog zum Binary-Output. |
| `webcal://`-Schema | Niedrig | Einfaches Schema-Rewrite; kein Implementierungsrisiko. |
| `data.json`-Größe | Niedrig–Mittel | Separater Cache-File mitigiert vollständig. |
| Gleichzeitige Fetches | Niedrig | Sequentielles Laden pro Feed (kein unkontrolliertes `Promise.all`) verhindert Probleme bei vielen Abonnements. |
| AC5 — Fehler-Isolation | Niedrig | Per-Feed-Fehlerhandling in `ICalReader` isoliert Fehler korrekt, wenn jeder Feed separat gecacht wird. |

**Gesamteinschätzung**: Mittlere Komplexität. Kein Umbau bestehender Kernkomponenten nötig. Größtes Risiko ist korrekte RRULE/Timezone-Verarbeitung — durch `ical.js` beherrschbar. Klares additives Feature ohne Regressions-Risiko für den Binary- oder CalDAV-Pfad.

---

### 6. Offene Entscheidungen (vor Approved-Phase zu klären)

1. **Cache-Speicherort**: `data.json`-Erweiterung (wie AC2 formuliert) vs. separater `ical-cache.json`. Empfehlung: separater File.
2. **iCal-Parser-Library**: `ical.js` (Mozilla) vs. `node-ical`. Empfehlung: `ical.js` (aktiver, typisiert, RRULE-vollständig).
3. **Farb-Persistenz**: Gemeinsamer `calendarColors`-Record vs. separater `icalColors`-Record. Empfehlung: separater Record.
4. **Event-Aggregation**: Dedizierter `EventAggregator`-Service vs. Konkatenation in der View.
5. **`isReadOnly`-Flag**: Neues explizites Flag in `CalendarEvent` vs. Weiterverwendung von `isOrganizer: false` als Signal. Empfehlung: `isOrganizer: false` reicht für AC4; ein explizites `isReadOnly` wäre sauberer und für zukünftige Erweiterungen vorzuziehen.

*Design Agent — 2026-06-03*

---

## QA Report
_Pending_
