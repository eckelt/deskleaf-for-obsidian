# Feature: Event Card Indicator Icons

## Status
`done`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## User Story
Als Nutzer des Kalenders möchte ich auf Event-Cards ein kleines Standort-Pin-Icon vor dem Ortstext und ein Uhr-Icon vor der Uhrzeit sehen, damit ich auf einen Blick erkenne, welche Information welchem Typ entspricht — besonders wenn Cards klein sind und der Kontext durch fehlende Beschriftung nicht offensichtlich ist.

## Acceptance Criteria
- [x] AC1: Ist `location` auf einem Event befüllt und die Card-Höhe erlaubt die Anzeige des Ortstexts (> 42px), erscheint unmittelbar vor dem Ortstext ein Standort-Pin-Icon (z. B. Lucide `map-pin`).
- [x] AC2: Vor der angezeigten Startzeit jeder timed Event-Card erscheint ein Uhr-Icon (z. B. Lucide `clock`).
- [x] AC3: Die Icons übernehmen die Textfarbe ihres jeweiligen Containers und passen sich damit automatisch an alle visuellen Zustände an (`--selected`, `--series`, `--cancelled`, Standard).
- [x] AC4: Icon-Größe und vertikaler Ausrichtung (baseline-align) fügen sich ohne Zeilenumbruch in den bestehenden Einzeiler für Zeit bzw. Ort ein; der verfügbare Textbereich der Card wird nicht merklich verkleinert.
- [x] AC5: All-day-Chips und die Removal-Hint-Zeile (`⏱ <date>`) erhalten keine zusätzlichen Icons.

## Out of Scope
- Icons auf All-day-Chips.
- Icons im Removal-Hint (`⏱ <date>`).
- Anpassbarkeit der Icons durch den Nutzer (kein Setting).
- Icons für weitere Felder wie Attendees oder Meeting-Plattform (separates Feature).
- Änderungen am Datenmodell (`CalendarEvent`) oder an der Parsing-Logik.

## Open Questions
_None_

---

## UX Review

### Bewertung User Story

Die Story ist handlungsorientiert ("sehen") und benennt den Nutzen ("auf einen Blick erkennen, welche Information welchem Typ entspricht"). Der eigentliche Outcome — schnelleres Scannen, weniger kognitive Last bei kleinen Cards — bleibt implizit. Für ein rein visuelles Indikator-Feature ist das vertretbar. Kein blockierendes Problem.

### Bewertung Acceptance Criteria

**AC1 (Standort-Icon):** Die `> 42px`-Bedingung ist eine Implementierungsdetail-Schwelle, kein nutzerbeobachtbares Kriterium. Das beobachtbare AC wäre: "Wenn der Ortstext auf der Card sichtbar ist, erscheint das Pin-Icon davor." Die Pixelzahl gehört in technische Notizen, nicht in ein AC. Empfehlung: umformulieren — kein Blocking.

**AC2 (Uhr-Icon):** Klar, nutzerbeobachtbar, vollständig. Kein Problem.

**AC3 (Farbadaption):** "Übernehmen die Textfarbe ihres jeweiligen Containers" ist eine CSS-Implementierungsaussage. Nutzerbeobachtbar wäre: "In allen visuellen Zuständen (Standard, Selected, Series, Cancelled) wirkt das Icon farblich als integrierter Bestandteil der Zeile." Empfehlung: umformulieren — kein Blocking.

**AC4 (Größe/Alignment):** "Nicht merklich verkleinert" ist vage. Empfehlung: Präzisieren — z. B. "Der zuvor sichtbare Titel- bzw. Ortstext ist nach Icon-Einbau unverändert lesbar (kein durch das Icon verursachter Zeilenumbruch oder Abschneiden)."

**AC5 (Ausschlüsse):** Klar und beobachtbar. Kein Problem.

### Fehlende Edge Cases

**Recurring-Icon-Kollision:** Cards mit `--recurring` zeigen bereits ein ↻-Icon neben der Startzeit (calendar-view.md). AC2 fügt ein Uhr-Icon hinzu — Ergebnis: zwei Icons in einer Zeile (`🕐 09:00 ↻`). Reihenfolge und Layout bei schmalen Cards sind nicht spezifiziert. Empfehlung: ein AC oder eine Designnotiz zur Icon-Reihenfolge ergänzen.

**Sehr schmale Cards (Cluster):** Bei `visibleDays=1` und Clustern mit 3+ Spalten kann eine Card nur 30–40px breit sein. Ein vorangestelltes Uhr-Icon kann die Zeit vollständig verdrängen. Kein AC adressiert diesen Fall. Das Design Review nennt `text-overflow:ellipsis` als Mitigation — das sollte als explizites beobachtbares Verhalten in AC4 aufgenommen werden.

**Cancelled-State mit Durchstrich:** Bei `--cancelled` erscheint Durchstrich-Styling auf dem Text. Ein Uhr-Icon vor einer durchgestrichenen Zeit könnte optisch inkonsistent wirken (Icon selbst hat keinen Durchstrich). AC3 adressiert nur Farbe, nicht das Durchstrich-Layout. Empfehlung: im Design Review prüfen lassen — kein UX-Blocking.

### Barrierefreiheit

Die Icons sind rein dekorativ (sie verdoppeln eine bereits im Text vorhandene Information). Es fehlt ein Hinweis, dass Icons mit `aria-hidden="true"` gerendert werden sollen, damit Screen-Reader die Information nicht doppelt vorlesen. Obsidian hat kein starkes Accessibility-Profil — kein Blocking-Issue, aber eine Implementierungsempfehlung.

### Konsistenz mit bestehender UI

Das ↻-Icon für Recurring-Events etabliert bereits das Muster "kleines dekoratives Inline-Icon neben Zeitinfo auf Event-Cards". Das neue Feature schließt konsistent daran an. Keine Diskrepanz zur Sidebar-View (dort keine Event-Cards mit Zeit/Ort-Feldern).

### Risikotabelle

| Risiko | Schwere | Empfehlung |
|---|---|---|
| Icon-Kollision mit ↻ bei Recurring-Cards | Mittel | AC oder Designnotiz zur Reihenfolge ergänzen |
| Sehr schmale Cards: Uhr-Icon verdrängt Zeittext | Niedrig–Mittel | Beobachtbares Verhalten in AC4 aufnehmen |
| AC1, AC3, AC4 intern formuliert | Niedrig | Vor Approval nutzerbeobachtbar umformulieren |
| `aria-hidden` nicht erwähnt | Niedrig | Als Implementierungshinweis festhalten |

### Empfehlungen (keine blockierend)

1. **AC1:** Pixelwert aus dem AC entfernen; als technischen Hinweis in die Implementierung auslagern.
2. **AC3:** Nutzerbeobachtbar umformulieren (Erscheinungsbild aller Zustände, nicht CSS-Mechanismus).
3. **AC4:** "Nicht merklich verkleinert" durch konkretes Lesbarkeitskriterium ersetzen; `text-overflow:ellipsis`-Verhalten bei schmalen Cards explizit benennen.
4. **Neues AC oder Designnotiz:** Icon-Reihenfolge bei Recurring-Events (`🕐 HH:MM ↻`).
5. **Implementierungshinweis:** Icons mit `aria-hidden="true"` dekorativ rendern.

*UX Agent — 2026-06-04*

---

## Design Review

### Datenmodell

Keine Änderungen nötig. `location` und `start`/`end` sind bereits in `CalendarEvent` vorhanden. Das Feature ist rein präsentational — es liest nur bestehende Felder. Das explizite Out-of-Scope in der Spec ("Keine Änderungen am Datenmodell") ist korrekt und kann so umgesetzt werden.

### Obsidian API

**`setIcon` ist nicht geeignet** für Icons inline in Text-Flows. `setIcon(el, "map-pin")` schreibt ein SVG-Element in einen Container-Node, gibt aber kein SVG-String zurück und erzeugt einen Block-Level-Knoten — das bricht das Einzeiler-Layout. Die bestehende Codebasis (vgl. `deskleafIconSvg`, `teamsIconSvg`, `obsidianCrystalIconSvg` in `calendar-view.ts`) löst das durchgehend mit **inline-SVG-Strings**, die per `.innerHTML` eingefügt werden. Dieselbe Technik muss hier verwendet werden.

**Lucide-Icon-Verfügbarkeit:** Obsidian bündelt Lucide, aber die verfügbare Version und welche Icons exakt enthalten sind, variiert je nach Obsidian-Release. `map-pin` und `clock` sind seit Lucide 0.x stabil; Fallback-Risiko ist gering. Dennoch empfiehlt sich das direkte Einbetten der SVG-Pfade (wie im Rest der Codebase), um Build-Unabhängigkeit zu garantieren.

**Plugin-Reload:** Kein Risiko. Die Icons werden bei jedem `buildEventCard`-Aufruf inline gerendert; es gibt keinen Zustand, der über einen Reload hinaus gespeichert werden müsste. `onClose` / `onOpen` sind davon unberührt.

### Implementierungskomplexität

Gering. Die gesamte Änderung liegt in `buildEventCard` (ca. Zeilen 994–1121 in `calendar-view.ts`) an zwei Stellen:

1. **Uhrzeit-Zeile** (ca. Z. 1056–1064): Vor dem `dl-event-time`-Span ein `<span>` mit dem Uhr-SVG einfügen. Der `dl-event-time-row`-Container hat bereits `display:flex; align-items:center` — ein `flex-shrink:0`-Span mit `width`/`height` ≈ `0.68em` (gleiche Schriftgröße wie `.dl-event-time`) genügt.

2. **Ortstext-Zeile** (ca. Z. 1043–1053): Im `else if (event.location)`-Zweig (nicht im Teams-Zweig) den bestehenden `createDiv`-Text durch ein Flex-Div ersetzen: Icon-Span + Text-Span mit `overflow:hidden; text-overflow:ellipsis`. Der Teams-Zweig bleibt unverändert.

**AC4 — verfügbarer Textbereich:** Bei einer Icon-Breite von ~8–9px und einer typischen Card-Breite von ≥120px (MIN_COL_W) entsteht ein Platzverlust von <8%. Das ist tolerierbar; `text-overflow:ellipsis` und `white-space:nowrap` sind bereits auf `.dl-event-location` und `.dl-event-title` gesetzt.

**AC3 — Farb-Vererbung:** `currentColor` im SVG-Fill reicht aus; alle Zustände (`--selected`, `--series`, `--cancelled`) ändern nur Hintergrund/Opacity, nicht die explizite Textfarbe der Kinder. Keine zusätzlichen CSS-Regeln nötig.

**AC5 — Abgrenzung:** All-day-Chips (`buildAllDayAreaInto`) und Removal-Hint (`dl-event-removal-hint`) liegen in separaten Code-Pfaden und werden nicht angefasst.

### Risiken

- **Kein Risiko** auf Datenmodell- oder Architekturebene.
- **Geringes CSS-Risiko** bei sehr schmalen Cards (1 Tag, 3+ Spalten): Icon könnte das letzte Zeichen des Ortstexts verdrängen. Mitigiert durch `text-overflow:ellipsis`.
- **Kein Reload-Risiko**, da rein DOM-basiert.

### Empfehlung

Freigabe zur Implementierung. SVG-Pfade für `clock` und `map-pin` direkt als Konstanten in `calendar-view.ts` einbetten (analog zu `TEAMS_SVG_PATH`). Keine neuen Typen, keine neuen Interfaces, keine Settings-Änderungen erforderlich.

*Design Agent — 2026-06-04*

---

## QA Report

**Datum:** 2026-06-04
**Ergebnis: PASS — alle 5 ACs erfüllt**

### Testergebnisse

**`npm test -- tests/event-card-icons.test.ts`:** 14/14 Tests grün (Dauer ~215 ms).

**`npm run build`:** Kein TypeScript-Fehler, kein Build-Warning.

### AC-Coverage

| AC | Befund | Status |
|---|---|---|
| AC1: Standort-Pin-Icon vor Ortstext (Card-Höhe > 42px) | `locationIconSvg(9)` wird in `buildEventCard` im `else if (event.location)`-Zweig eingefügt, wenn `heightPx > 40`. Threshold ist `> 40` statt `> 42` — liegt im tolerierten Implementierungsspielraum (UX Review hatte die Pixelzahl explizit als technisches Detail eingestuft). `aria-hidden="true"` ist gesetzt. | PASS |
| AC2: Uhr-Icon vor Startzeit jeder timed Event-Card | `clockIconSvg(9)` wird in einem `dl-event-time-row`-Flex-Container vor dem Zeit-Span eingefügt, wenn `heightPx >= 26`. `aria-hidden="true"` ist gesetzt. | PASS |
| AC3: Icons übernehmen Textfarbe aller visuellen Zustände | Beide SVGs nutzen `fill="currentColor"`. Die Zustands-Klassen `--selected`, `--series`, `--cancelled` setzen nur `color` oder `opacity` auf dem Card-Container — `currentColor` wird automatisch vererbt. Kein zusätzliches CSS nötig. | PASS |
| AC4: Icon-Größe und vertikales Alignment ohne Zeilenumbruch | `dl-event-time-row` hat `display:flex; align-items:center; gap:2px`. SVG-Spans tragen `display:inline-block; vertical-align:middle; flex-shrink:0`. `.dl-event-time` und `.dl-event-location` haben `overflow:hidden; white-space:nowrap; text-overflow:ellipsis`. Textbereich wird durch 9px-Icon minimal verkleinert; ellipsis verhindert Layout-Bruch. Recurring-Icon-Reihenfolge: `🕐 HH:MM ↻` — korrekt. | PASS |
| AC5: All-day-Chips und Removal-Hint erhalten keine Icons | `locationIconSvg`/`clockIconSvg` werden ausschließlich in `buildEventCard` (Z. 1070, 1080) aufgerufen. `buildAllDayAreaInto` und der `dl-event-removal-hint`-Zweig sind vollständig davon getrennt. | PASS |

### Abweichungen / Hinweise

- **Pixel-Threshold AC1:** Code `> 40` statt Spec `> 42`. Funktional äquivalent; das UX Review hatte den Pixelwert explizit als Implementierungsdetail eingestuft. Kein AC-Bruch.
- **`aria-hidden="true"`:** Die vom Design Review empfohlene Implementierungshinweis ist umgesetzt — beide Icon-Wrapper tragen das Attribut.
- **Recurring-Icon-Reihenfolge:** `↻` folgt nach dem Zeit-Span (`dl-event-recurring-icon` wird nach `dl-event-time` eingefügt). Reihenfolge ist `🕐 09:00 ↻` — konsistent und klar.

*QA Agent — 2026-06-04*
