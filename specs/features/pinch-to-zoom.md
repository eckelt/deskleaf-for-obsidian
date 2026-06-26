# Feature: Pinch to Zoom (Vertical Time Density)

## Status
`approved`
<!-- draft → ux-reviewed → design-reviewed → approved → in-development → qa → done -->

## Source
- GitHub issue: https://github.com/eckelt/deskleaf-for-obsidian/issues/5

## User Story
Als Kalender-Nutzer möchte ich auf Mobile per Zwei-Finger-Pinch und auf Desktop per Trackpad-Pinch die vertikale Dichte der Calendar View stufenlos verändern, damit ich je nach Bedarf zwischen Tagesüberblick und detaillierter Stundenansicht wechseln kann.

## Acceptance Criteria
- [ ] AC1: Eine Zwei-Finger-Pinch-Geste auf dem Kalender-Grid (Touch) verändert auf Mobile die vertikale Zoomstufe. Auseinanderziehen zoomt hinein (weniger Stunden sichtbar, höhere Stunden), Zusammenziehen zoomt heraus (mehr Stunden sichtbar, flachere Stunden).
- [ ] AC2: Eine Trackpad-Pinch-Geste auf dem Kalender-Grid verändert in Obsidian Desktop die vertikale Zoomstufe mit derselben Richtung, denselben Grenzen und demselben Fokus-Anker wie Mobile-Pinch. Desktop-Pinch darf nicht als Browser-/Obsidian-Seitenzoom sichtbar werden.
- [ ] AC3: Der Zoom verändert ausschließlich vertikale Zeitgeometrie. Bei gleicher View-Breite und gleichem Anchor bleiben sichtbarer Datumsbereich, Anzahl und Reihenfolge der Tagesspalten, Week-/N-Day-/Sa|So-Spaltenlogik sowie Event-Overlap-Spalten (`col`/`totalCols`) vor und nach dem Zoom identisch; nur vertikale Positionen/Höhen ändern sich.
- [ ] AC4: Die Zoom-Untergrenze (maximal herausgezoomt) ist erreicht, wenn der gesamte Tag (00:00-24:00) ohne vertikales Scrollen in den sichtbaren Grid-Bereich passt. Weiter Herauszoomen ist nicht möglich.
- [ ] AC5: Die Zoom-Obergrenze (maximal hineingezoomt) ist erreicht, wenn genau 4 Stunden den sichtbaren Grid-Bereich füllen. Weiter Hineinzoomen ist nicht möglich.
- [ ] AC6: Während der Geste bleibt der Zeitpunkt unter dem Pinch-Mittelpunkt beziehungsweise Trackpad-Zoom-Fokus an derselben Bildschirmposition verankert (Scroll-Position wird passend nachgeführt).
- [ ] AC7: Alle vom Stundenraster abhängigen Elemente (Hour-/Half-Hour-Lines, Time-Labels im Gutter, Now-Line, Event-Cards, Drag-Ghosts, Business-Hours-Shading) skalieren konsistent mit der aktuellen Zoomstufe.
- [ ] AC8: Die gewählte Zoomstufe bleibt innerhalb der laufenden Session erhalten, über Tages-/Wochen-Navigation und Re-Renders hinweg. Beim erstmaligen Öffnen der View startet der Zoom auf der bisherigen Default-Dichte (64px/Stunde, geclampt auf die gültigen Grenzen).
- [ ] AC9: Bestehende Mobile-Ein-Finger-Gesten bleiben nutzbar und werden klar von Pinch getrennt: ein vertikal dominanter Touch-Move im Kalender-Grid bleibt nativer Scroll und wird vom Kalender nicht per `preventDefault()` übernommen; ein horizontal dominanter Touch-Move, der mindestens 80 CSS-Pixel vom linken und rechten Viewport-Rand startet, bleibt die bestehende Kalendernavigation zum nächsten/vorigen sichtbaren Zeitraum; ein horizontaler Touch-Move, der innerhalb von 80 CSS-Pixeln vom linken oder rechten Viewport-Rand startet, wird vom Kalender nicht übernommen und bleibt für Obsidian-Edge-Gesten verfügbar.
- [ ] AC10: Zwei-Finger-Gesten lösen Kalender-Zoom erst aus, wenn sich der Fingerabstand beziehungsweise Trackpad-Pinch-Scale erkennbar ändert. Eine reine Zwei-Finger-Vor-/Zurück-Geste mit stabiler Distanz darf keine Kalendernavigation auslösen und muss, wo Obsidian/Electron sie als App-Navigation anbietet, an Obsidian durchfallen.
- [ ] AC11: Eine Zwei-Finger-Pinch-Geste auf einer leeren Stelle des Zeitrasters darf keinen Drag-to-create-Flow starten, keinen Ghost-Event anzeigen und keinen neuen Termin anlegen. Drag-to-create bleibt ausschließlich eine Ein-Finger-Interaktion.

## Acceptance Scenarios
```gherkin
Scenario: Mobile pinch zooms the vertical time grid
  Given the Calendar View is open on a touch device
  When the user pinches outward with two fingers on the time grid
  Then fewer hours are visible in the same viewport
  And the hour rows, events, now-line, and business-hours shading grow vertically together
```

```gherkin
Scenario: Desktop trackpad pinch zooms the calendar instead of the app shell
  Given the Calendar View is open in Obsidian Desktop
  When the user performs a trackpad pinch over the time grid
  Then the calendar hour height changes within the 24-hour and 4-hour limits
  And Obsidian or Chromium page zoom does not visibly change
```

```gherkin
Scenario: Zoom keeps the focused time under the gesture
  Given 10:00 is under the center of the pinch gesture
  When the user zooms in or out
  Then 10:00 remains under the gesture center after the scroll position is adjusted
```

```gherkin
Scenario: Vertical zoom does not change horizontal layout
  Given a calendar range with multiple day columns and overlapping events
  When the user changes the zoom level
  Then the visible dates, day-column order, weekend column rules, and event overlap columns remain unchanged
  And only vertical positions and heights change
```

```gherkin
Scenario: Existing touch navigation does not conflict with pinch
  Given the Calendar View is open on iOS
  When the user swipes vertically with one finger on the time grid
  Then the grid uses native vertical scrolling through the time of day
  And the calendar does not prevent the vertical touch movement
  When the user swipes horizontally with one finger from at least 80 CSS pixels inside both viewport edges
  Then the calendar navigates to the next or previous visible date range
  When the user swipes horizontally with one finger starting within 80 CSS pixels of either viewport edge
  Then the calendar does not claim the gesture
  And Obsidian can show or hide its side panel
  When the user moves two fingers forward or backward with a stable distance
  Then the calendar does not navigate horizontally
  And Obsidian navigation is not prevented where the runtime provides it
  When the user changes the distance between two fingers
  Then the view zooms vertically
  And no drag-to-create ghost or new event is created
```

```gherkin
Scenario: Pinch on empty grid does not create an event
  Given the Calendar View is open on a touch device
  And the user starts a two-finger gesture on an empty area of the time grid
  When the user pinches inward or outward
  Then the calendar zooms vertically
  And no create-event ghost is shown
  And no new event creation is submitted
```

## Out of Scope
- Desktop zoom via keyboard shortcuts, UI buttons, mouse wheel without trackpad-pinch semantics, or command palette commands.
- Persisting the zoom level across Obsidian restarts (no settings field).
- Horizontal zooming or changing the number of visible days.
- Changing the 24h grid range (`DAY_START`/`DAY_END` remain 0-24).
- Snap to discrete zoom levels; zoom is continuous within the limits.
- Two-finger swipe as a calendar navigation gesture. Stable-distance two-finger app navigation belongs to Obsidian when the runtime supports it.

## Open Questions
_None_

## Affected Areas
- `src/event-layout.ts`: `HOUR_PX` is currently a module constant (64) used by pure functions `topFromISO` / `heightFromISO`. These functions need the hour height as an explicit parameter so the math remains pure and testable. The old value remains as `DEFAULT_HOUR_PX`.
- `src/calendar-view.ts`: Holds current hour height as view instance state (session-scoped). Registers two input paths on the grid body: TouchEvent-based two-finger pinch for Mobile and desktop trackpad-pinch via the wheel/gesture event path available in Obsidian Desktop's Chromium shell. Calculates clamp bounds from the visible height of `.dl-grid-body-scroll`: min = `viewportHeight / 24`, max = `viewportHeight / 4`. Adjusts scroll position around the gesture focus during zoom. Passes hour height through all time-to-pixel calculations.
- `styles.css`: Static styling stays in CSS. Runtime geometry may use existing dynamic style patterns or CSS custom properties for calculated positions/heights; avoid introducing unrelated static inline styling.
- `tests/`: Add pure tests for variable layout math, clamp math, focus-anchor math, and DOM/input wiring for representative mobile touch pinch and desktop trackpad pinch behavior.

## Test Expectations
- Automated Vitest coverage for `topFromISO` / `heightFromISO` with variable hour height (default plus values near min/max).
- Automated Vitest coverage for AC3: the same event set yields identical `assignColumns` `col`/`totalCols` at different hour heights, while `topFromISO` / `heightFromISO` change proportionally.
- Automated Vitest coverage for clamp calculation: min = whole day fits in viewport, max = 4 hours fill viewport, values outside are clamped.
- Automated Vitest coverage for focus-anchor scroll math.
- Automated DOM/input coverage for AC9 one-finger gesture separation on the mobile carousel path: vertical-dominant one-finger `touchmove` does not call `preventDefault()` or trigger date navigation; horizontal-dominant one-finger movement starting outside the 80 CSS-pixel edge zone still triggers the existing date navigation; horizontal-dominant movement starting inside the 80 CSS-pixel edge zone does not call `preventDefault()` and does not trigger calendar navigation. Representative coverage of the shared `setupSwipeGestures` path is sufficient; tests do not need to duplicate the same edge/vertical cases for every day-count layout.
- Automated DOM/input coverage for TouchEvent two-finger pinch: outward and inward movement update zoom, stable-distance movement does not trigger calendar navigation, and the non-pinch path is not explicitly prevented.
- Automated DOM/input coverage for AC11: a two-finger `touchstart`/pinch sequence on an empty day body does not enter the existing touch drag-to-create path, does not render a `dl-ghost-event`, and does not call calendar event creation.
- Automated DOM/input coverage for desktop trackpad pinch using the Chromium/Electron event shape the implementation handles; assert the event is consumed for calendar zoom and does not fall through to app/page zoom.
- Representative automated coverage is sufficient for AC7: test one shared geometry mechanism that drives hour lines/time labels/now-line/events/business-hours, plus one event/drag-ghost calculation path. Manual QA covers the full visual list.
- `npm run build` and `npm test` green.
- Manual QA in Obsidian Desktop on macOS trackpad: pinch in/out over Calendar View, limits, focus-anchor, no Obsidian/page zoom.
- Manual QA in Obsidian Mobile iOS: pinch in/out over Calendar View, pinch on empty grid does not start event creation, one-finger vertical time scrolling, one-finger horizontal calendar navigation from the interior, Obsidian side-panel gestures from the edge, two-finger stable swipe does not navigate the calendar, limits, focus-anchor, now-line, event-cards, business-hours shading, day/week navigation retains zoom.

---

## UX Review
Approved.

Notes:
- Trackpad and touch pinch use the same mental model and the same boundaries.
- Pinch recognition must be thresholded: do not claim every two-finger touch immediately, otherwise iOS scrolling/gesture behavior becomes brittle.
- No visible zoom controls are required for this slice because the user's validation target is the gesture itself.

---

## Design Review
Approved.

Notes:
- This is a geometry/state change, not a new visual component.
- The feature must preserve the existing calendar chrome, event card styling, and day-column structure.
- Dynamic time-grid dimensions should be centralized so dependent elements cannot drift apart visually.

---

## QA Report
_Pending_

---

## Planning Notes (Planner)

### Current Implementation Context
- The grid is a fixed 24h raster (`DAY_START = 0`, `DAY_END = 24`, `TOTAL_HOURS = 24`) with fixed density `HOUR_PX = 64`.
- `HOUR_PX` is used directly for grid height, gutter labels, now-line position, business-hours shading, event-card position/height, drag ghosts, drag/resize hit math, and pure layout helpers.
- Existing mobile navigation is one-finger swipe based. That path ignores multi-touch movement today, so pinch can be added without making two-finger swipe a navigation gesture.

### Decisions
- **Desktop is in scope.** The earlier desktop non-goal is superseded by the human clarification on 2026-06-25: macOS trackpad pinch in Obsidian Desktop must zoom the calendar with the same limits.
- **Gesture input paths are explicit.** Mobile uses two-touch pinch distance changes. Desktop uses the trackpad-pinch event path exposed by Obsidian Desktop's Chromium/Electron runtime, not generic mouse-wheel zoom.
- **Two-finger swipe is not a calendar navigation feature.** Single-finger gestures remain responsible for time scrolling, date navigation, and Obsidian edge-panel behavior. Two-finger movement is only treated as zoom after a measurable distance-ratio change; stable-distance two-finger back/forward remains Obsidian's responsibility where the runtime supports it.
- **Drag-to-create stays single-finger only.** The mobile create interaction may start from an empty day body only when exactly one touch is active. Any touch sequence with two active touches belongs to pinch recognition or platform gesture handling and must not create a ghost event or submit a new calendar event.
- **Bounds are viewport-relative.** "Whole day visible" and "4 hours visible" derive from the visible height of `.dl-grid-body-scroll`: min `viewportHeight / 24`, max `viewportHeight / 4`.
- **Pure functions stay pure.** Hour height is passed as a parameter instead of mutating module-level state.
- **Horizontal layout is invariant.** Vertical zoom must not influence date range selection, day-column count/order, weekend column logic, or overlap-column assignment.
- **Session-only remains correct.** Persisting zoom in settings would create cross-device surprises and needs explicit UI/reset affordances, which are out of scope for this slice.
- No ADR required: this remains a bounded interaction/geometry change, not a cross-cutting architecture rule.
