# Feature: Pinch to Zoom (Vertical Time Density)

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/5

## User Story
Als Mobile-Nutzer möchte ich mit einer Pinch-Geste die vertikale Dichte der Calendar View stufenlos verändern, damit ich je nach Bedarf zwischen Tagesüberblick und detaillierter Stundenansicht wechseln kann.

## Acceptance Criteria
- [ ] AC1: Eine Zwei-Finger-Pinch-Geste auf dem Kalender-Grid (Touch) verändert die vertikale Zoomstufe. Auseinanderziehen zoomt hinein (weniger Stunden sichtbar, höhere Stunden), Zusammenziehen zoomt heraus (mehr Stunden sichtbar, flachere Stunden).
- [ ] AC2: Der Zoom verändert ausschließlich die vertikale Höhe pro Stunde. Horizontales Layout (Tagesspalten, N-Day/Week, Sa|So-Spalte) bleibt unverändert.
- [ ] AC3: Die Zoom-Untergrenze (maximal herausgezoomt) ist erreicht, wenn der gesamte Tag (00:00–24:00) ohne vertikales Scrollen in den sichtbaren Grid-Bereich passt. Weiter Herauszoomen ist nicht möglich.
- [ ] AC4: Die Zoom-Obergrenze (maximal hineingezoomt) ist erreicht, wenn genau 4 Stunden den sichtbaren Grid-Bereich füllen. Weiter Hineinzoomen ist nicht möglich.
- [ ] AC5: Während der Geste bleibt der Zeitpunkt unter dem Pinch-Mittelpunkt unter den Fingern verankert (Scroll-Position wird passend nachgeführt).
- [ ] AC6: Alle vom Stundenraster abhängigen Elemente (Hour-/Half-Hour-Lines, Time-Labels im Gutter, Now-Line, Event-Cards, Drag-Ghosts, Business-Hours-Shading) skalieren konsistent mit der aktuellen Zoomstufe.
- [ ] AC7: Die gewählte Zoomstufe bleibt innerhalb der laufenden Session erhalten — über Tages-/Wochen-Navigation und Re-Renders hinweg. Beim erstmaligen Öffnen der View startet der Zoom auf der bisherigen Default-Dichte (64px/Stunde, geclampt auf die gültigen Grenzen).
- [ ] AC8: Auf Desktop verändert sich nichts: Es gibt keine Pinch-/Zoom-Interaktion, das Rendering nutzt dort weiterhin die Default-Dichte.

## Out of Scope
- Desktop-Zoom (Strg+Scroll, Tastatur, UI-Buttons o. Ä.).
- Persistieren der Zoomstufe über Obsidian-Neustarts hinweg (kein Settings-Feld). Bewusst session-only, um eine auf Mobile gesetzte Zoomstufe nicht ohne Korrekturmöglichkeit auf den Desktop zu schleppen.
- Horizontales Zoomen oder Verändern der Anzahl sichtbarer Tage.
- Verändern des 24h-Grid-Bereichs (`DAY_START`/`DAY_END` bleiben 0–24).
- Snap auf diskrete Zoomstufen — der Zoom ist stufenlos innerhalb der Grenzen.

## Open Questions
_None_

## Affected Areas
- `src/event-layout.ts`: `HOUR_PX` ist heute eine Modul-Konstante (64) und fließt in die puren Funktionen `topFromISO` / `heightFromISO` ein. Diese Funktionen müssen die Stundenhöhe als expliziten Parameter erhalten, damit sie pur bleiben und mit dynamischem Zoom rechnen können. Der bisherige `HOUR_PX`-Wert bleibt als `DEFAULT_HOUR_PX` exportierte Default-/Startdichte.
- `src/calendar-view.ts`: Hält die aktuelle Stundenhöhe als Instanz-State (session-scoped). Registriert Touch-Pinch-Handler auf dem Grid-Body (nur Touch). Berechnet Clamp-Grenzen aus der sichtbaren Höhe des `.dl-grid-body-scroll` (Untergrenze = `viewportHeight / 24`, Obergrenze = `viewportHeight / 4`). Führt während der Geste die Scroll-Position nach (Fokus-Anker). Reicht die Stundenhöhe an alle Pixel-Berechnungen (`gridHeight`, Gutter-Labels, Now-Line, Event-Layout) durch.
- `styles.css`: Falls Stundenhöhe als CSS-Variable (`--f-hour-px`) durchgereicht wird, hier die abhängigen Maße darauf umstellen statt fixer Pixelwerte.
- `tests/`: Tests für die parametrisierte Layout-Math und für die Clamp-Berechnung (Grenzen, Fokus-Anker-Mathe).

## Test Expectations
- Unit-Tests für `topFromISO` / `heightFromISO` mit variabler Stundenhöhe (Default und je ein Wert nahe Unter-/Obergrenze).
- Unit-Tests für die Clamp-Funktion: Untergrenze = ganzer Tag passt in Viewport, Obergrenze = 4 Stunden füllen Viewport; Werte außerhalb werden korrekt geclampt.
- Unit-Test für die Fokus-Anker-Rechnung (Zeitpunkt unter dem Pinch-Mittelpunkt bleibt nach Zoom an gleicher Bildschirmposition).
- `npm run build` und `npm test` grün.
- Manuelle QA in Obsidian Mobile: Pinch hinein/heraus, Grenzen, Fokus-Anker, Now-Line, Event-Cards, Business-Hours-Shading, Tages-/Wochen-Navigation (Zoom bleibt erhalten). Desktop-Regression: keine Verhaltensänderung.

---

## Planning Notes (Planner)

### Current Implementation
- Das Grid ist ein fixes 24h-Raster (`DAY_START = 0`, `DAY_END = 24`, `TOTAL_HOURS = 24`) mit fester Dichte `HOUR_PX = 64`.
- `HOUR_PX` wird an vielen Stellen direkt verrechnet: `gridHeight = TOTAL_HOURS * HOUR_PX`, Gutter-Time-Labels, Now-Line-Position (mehrere Stellen), sowie in den puren Layout-Funktionen `topFromISO` / `heightFromISO` in `event-layout.ts`.
- Es gibt heute keine Zoom-, Touch-Pinch- oder Gesture-Handler.

### Pressure Points & Decisions
- **Grenzen sind viewport-relativ, nicht fixe Pixel.** "Ganzer Tag sichtbar" und "4 Stunden sichtbar" definieren sich aus der sichtbaren Höhe des Scroll-Containers: Untergrenze `viewportHeight / 24`, Obergrenze `viewportHeight / 4`. Bei sehr kleinen Viewports kann die Untergrenze unter die Default-Dichte fallen; der Start-Default (64px) wird daher auf die gültigen Grenzen geclampt.
- **Pure Funktionen bleiben pur.** Statt eine veränderliche Modul-Variable zu mutieren, wird die Stundenhöhe als Parameter durch `event-layout.ts` gereicht. Das hält die Layout-Math testbar und vermeidet verstecktes globales State.
- **Session-only statt persistiert.** Persistieren in den Settings würde eine auf Mobile gesetzte Dichte unkorrigierbar auf den Desktop tragen (dort gibt es keine Geste). Daher Zoom als Instanz-State der View: überlebt Navigation und Re-Render innerhalb der Session, startet bei jedem frischen Öffnen auf Default.
- **Fokus-Anker** entspricht Standard-Pinch-Verhalten: Der Zeitpunkt unter dem Pinch-Mittelpunkt bleibt unter den Fingern; die Scroll-Position wird beim Skalieren entsprechend nachgeführt.
- Keine ADR nötig: Dynamisierung der Stundenhöhe ist eine bounded Implementierungsentscheidung, keine schwer umkehrbare, übergreifende Architekturregel.

---

## PR Review
_Pending_

---

## Validation Report
_Pending_
