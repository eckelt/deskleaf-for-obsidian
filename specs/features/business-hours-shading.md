# Feature: Business Hours Shading

## Status
`approved`
<!-- draft -> ux-reviewed -> design-reviewed -> approved -> in-development -> qa -> done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/2

## User Story
Als Nutzer möchte ich Zeiten außerhalb meiner Arbeitszeit im Kalender visuell abgesetzt sehen, damit freie Slots innerhalb der relevanten Tagesbereiche schneller erkennbar sind.

## Acceptance Criteria
- [ ] AC1: Die Calendar View unterscheidet visuell zwischen Business Hours und Non-Business Hours.
- [ ] AC2: Business Hours werden dezent, aber sichtbar hervorgehoben; Non-Business Hours bleiben der normale Grid-Hintergrund.
- [ ] AC3: Das Highlight bleibt hinter Hour-Lines, Now-Line, Drag-Ghosts und Event-Cards und blockiert keine Kalenderinteraktion.
- [ ] AC4: Das Highlight funktioniert auf Desktop und Mobile in allen sichtbaren Kalenderlayouts: Single-Day, N-Day, Week View und der zusammengelegten Sa|So-Spalte.
- [ ] AC5: Die erste Version unterstützt genau einen zusammenhängenden Business-Hours-Zeitblock pro aktiviertem Wochentag.
- [ ] AC6: Die Business-Hours-Regeln sind global konfigurierbar und gelten für alle Kalender.
- [ ] AC7: Der Default ist Montag bis Freitag, 09:00-17:00; Samstag und Sonntag sind standardmäßig vollständig Non-Business Hours.
- [ ] AC8: Das Highlight ist in Light Mode und Dark Mode sichtbar, aber schwächer als Event-Cards, Today-State, Selected-State und Now-Line.

## Out of Scope
- Automatisches Ableiten der Arbeitszeit aus Kalenderdaten.
- Provider-spezifische Arbeitszeit aus CalDAV, EventKit oder externen APIs.
- Unterschiedliche Arbeitszeiten pro Kalender.
- Mehrere Business-Hours-Segmente pro Tag, etwa 09:00-12:00 und 13:00-17:00.
- Verändern des 24h-Zeitrasters oder des initialen Scroll-Verhaltens.

## Open Questions
_None_

## Affected Areas
- `src/calendar-view.ts`: Rendern von Day-Body-Hintergrundsegmenten im bestehenden 24h-Grid.
- `styles.css`: Subtile Business-/Non-Business-Shading-Klassen und Theme-Kontrast.
- `src/types.ts`: Business-Hours-Settings und Defaults.
- `src/settings.ts`: Settings-UI für aktivierte Wochentage sowie Start-/Endzeit.
- `specs/calendar-view.md`: Kalenderverhalten und Visual States dokumentieren.
- `specs/styles.md`: CSS-Klassen und Variablen dokumentieren.
- `CONTEXT.md`: Glossarbegriffe ergänzen, sobald Business Hours und Non-Business Hours fachlich festgelegt sind.

## Test Expectations
- Unit tests für Business-Hours-Settings-Defaults und Zeitsegment-Berechnung.
- Build muss sicherstellen, dass neue Settings-Typen und Defaults vollständig sind.
- Manuelle QA in Obsidian: Light/Dark Mode, Week View, Single-Day View, Sa|So-Spalte, Today-State, Selected-State, Now-Line und Drag-to-create.

---

## Grill-With-Docs Review

### Current Implementation

- Die Calendar View rendert aktuell ein fixes 24h-Grid (`DAY_START = 0`, `DAY_END = 24`) mit 64px pro Stunde.
- Jede Day Body Column rendert Hour-Lines und Half-Hour-Lines, danach Now-Line und Event-Cards.
- Sa und So werden als eine gemeinsame Spalte dargestellt, haben intern aber eigene Day-Body-Subspalten.
- Es gibt noch keine Settings für Arbeitszeiten oder Kalenderanzeigezeiten.

### Pressure Points

- "Business Hours" ist fachlich unscharf. Ohne Definition würde die Implementierung eine implizite Arbeitszeit in die UI schreiben.
- Feste Defaults sind schnell, aber wahrscheinlich persönlich falsch. Konfigurierbare Regeln sind nützlicher, berühren aber Settings, Defaults und Migration.
- Non-Business-Shading kann mit Today/Selected/Now-Line konkurrieren. Die visuelle Hierarchie muss klar bleiben: Events und Interaktion vor Hintergrundhilfe.
- Die Sa|So-Spalte ist ein Sonderfall. Wenn Wochenenden komplett frei sind, ist sie einfach. Wenn Samstag anders als Sonntag ist, muss die Darstellung pro Subspalte erfolgen.

### Current Recommendation

Build-ready. Die UX- und Designentscheidungen sind geklärt.

MVP-Entscheidungen:
- Business Hours sind pro Plugin global, nicht pro Kalender.
- Business Hours sind konfigurierbar.
- Default: Montag bis Freitag, 09:00-17:00.
- Samstag und Sonntag sind standardmäßig vollständig Non-Business Hours.
- Erste Version erlaubt eine zusammenhängende Zeitspanne pro Business Day.
- Die Settings-UI bleibt bewusst einfach: ein globaler Start-/Endzeit-Block für Montag bis Freitag; keine individuellen Wochentag-Toggles in v1.
- Business Hours werden dezent, aber sichtbar hervorgehoben.
- Das Highlight ist auch auf Mobile sichtbar.
- Das 24h-Grid und das initiale Scroll-Verhalten bleiben unverändert.
- Die Sa|So-Spalte rendert Highlights pro interner Subspalte, auch wenn das Wochenende in v1 standardmäßig Non-Business bleibt.

---

## Design Review
### Ergebnis

Freigabe für `approved`. Der Builder kann ohne weitere Produktfragen implementieren.

### Settings Design

- `DeskleafSettings` bekommt globale Business-Hours-Settings.
- Default: Business Hours aktiv, Start `09:00`, Ende `17:00`, Tage Montag bis Freitag.
- Die Settings-UI bleibt KISS: ein Abschnitt für Business Hours mit Startzeit und Endzeit.
- Keine individuellen Wochentag-Toggles in v1.
- Samstag und Sonntag sind standardmäßig Non-Business und in v1 nicht in der UI aktivierbar.

### Rendering Design

- Business-Hours-Highlights werden als Hintergrundsegmente im `Calendar Time Grid` gerendert.
- Die Segmente liegen hinter Hour-Lines, Now-Line, Drag-Ghosts und Event-Cards.
- Die Sa|So-Spalte rendert pro vorhandener Day-Body-Subspalte, damit die Darstellung zur bestehenden internen Struktur passt.
- Business Hours werden hervorgehoben; Non-Business Hours bleiben der normale Grid-Hintergrund.
- Die visuelle Stärke muss unter Event-Cards, Today-State, Selected-State und Now-Line bleiben.

### Implementation Notes

- Extrahiere die Zeitsegment-Berechnung in eine kleine pure Funktion, bevor DOM gerendert wird.
- Verwende CSS-Klassen und Theme-Variablen in `styles.css`; vermeide Inline-Farben.
- Halte das bestehende 24h-Grid und initiale Scroll-Verhalten unverändert.
- Dokumentiere die neuen Klassen in `specs/styles.md` und das Verhalten in `specs/calendar-view.md`.

---

## QA Report
_Pending_
