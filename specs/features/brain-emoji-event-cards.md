# Feature: Brain Emoji auf Event-Cards

## Status
`draft`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## User Story
Als Nutzer des Kalenders möchte ich auf jeder timed Event-Card ein farbiges 🧠-Emoji in der unteren linken Ecke sehen, als rein dekoratives, verspieltes Detail — ohne dass es die bestehende Icon- oder Textinformation stört.

## Acceptance Criteria
- [ ] AC1: Jede timed Event-Card (gerendert über `buildEventCard`, unabhängig von Dauer, `isCancelled`, `isRecurring` oder Notiz-Status) zeigt ein 🧠-Emoji als natives, farbiges Glyph — kein monochromes SVG, keine Anpassung an `currentColor`/`--cal-h`.
- [ ] AC2: Das Emoji sitzt visuell in der unteren linken Ecke der Card, unabhängig vom Karteninhalt (Titel, Ort, Zeit) und ohne dessen Layout zu verschieben oder Zeilenumbrüche zu verursachen.
- [ ] AC3: All-day-Events erhalten **kein** Brain-Emoji — weder als Chip (`buildAllDayAreaInto`) noch an anderer Stelle der All-day-Zeile.
- [ ] AC4: Das Emoji ist rein dekorativ: kein Klick-Handler, kein Tooltip, kein Setting zum Ein-/Ausschalten.
- [ ] AC5: Bei sehr kurzen Cards (geringe `heightPx`, in denen Ortszeile/Zeitzeile bereits ausgeblendet sind) bleibt die Card durch das vorhandene `overflow: hidden` visuell intakt — das Emoji wird ggf. clipped, verursacht aber keinen Layout-Bruch oder Overflow außerhalb der Card-Grenzen.

## Acceptance Scenarios
```gherkin
Scenario: Normale timed Event-Card zeigt Brain-Emoji
  Given ein timed Event mit ausreichend Platz für Titel, Ort und Zeit
  When die Event-Card gerendert wird
  Then erscheint ein farbiges 🧠-Emoji in der unteren linken Ecke der Card
  And Titel-, Orts- und Zeitzeile sind unverändert lesbar

Scenario: All-day-Event bleibt ohne Brain-Emoji
  Given ein All-day-Event
  When der All-day-Chip gerendert wird
  Then erscheint kein 🧠-Emoji auf dem Chip

Scenario: Cancelled- oder sehr kurze Event-Card zeigt weiterhin das Emoji
  Given ein storniertes timed Event oder ein timed Event mit sehr kurzer Dauer (Card < 26px hoch)
  When die Event-Card gerendert wird
  Then erscheint dennoch ein 🧠-Emoji in der unteren linken Ecke
  And die Card bleibt visuell intakt (kein Overflow, kein Layout-Bruch)
```

## Out of Scope
- Monochrome/SVG-Variante des Brain-Icons (Autor hat sich explizit für das farbige native Emoji entschieden).
- Anpassbarkeit/Setting zum Ein- oder Ausblenden.
- Brain-Emoji auf All-day-Chips oder in der Removal-Hint-Zeile (`⏱ <date>`).
- Änderungen am Datenmodell (`CalendarEvent`) oder an der Parsing-Logik.
- Barrierefreiheits-Semantik über `aria-hidden="true"` hinaus (das Emoji trägt keine zusätzliche Information, daher rein dekorativ und für Screenreader ausgeblendet).

## Open Questions
_None — Scope wurde vom Autor in Issue #36 bestätigt: farbiges Emoji, rein dekorativ, nur timed Events, All-day-Events bleiben unberührt._

## Affected Areas
- `src/calendar-view.ts` — `buildEventCard` (Emoji-Span hinzufügen, absolut positioniert analog zu `dl-event-note-indicator`).
- `styles.css` — neue Klasse für Positionierung (`position: absolute; bottom: ...; left: ...`), keine Farb-/Theme-Anpassung nötig, da natives Emoji-Rendering.
- `tests/` — neuer Test für `buildEventCard`-DOM-Struktur (Emoji-Span vorhanden bei timed Events, fehlend bei All-day-Chips).

## Test Expectations
- **Automatisiert (Vitest):** Ein Test, der `buildEventCard` für ein normales timed Event, ein storniertes Event und ein sehr kurzes Event rendert und prüft, dass der Brain-Emoji-Span in allen drei Fällen vorhanden ist und `aria-hidden="true"` trägt. Ein weiterer Test prüft, dass `buildAllDayAreaInto` (All-day-Chip-Pfad) **keinen** Brain-Emoji-Span erzeugt.
- **Manuelle QA:** Visuelle Positionierung (untere linke Ecke, kein Overlap mit Titel/Ort/Zeit) bei unterschiedlichen Card-Höhen und -Breiten (schmale Cluster-Cards, sehr kurze Events) — das ist ein reines Rendering-/Layout-Detail, das Vitest nicht zuverlässig prüfen kann.

---

## UX Review
_Pending_

---

## Design Review
_Pending_

---

## QA Report
_Pending_
