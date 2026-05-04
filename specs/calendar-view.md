# Calendar View

View type: `focal-calendar`. Opened in the main content area. Icon: `calendar-days`.
Display text: `"Deskleaf"`.

---

## Responsive layout

The number of visible day-slots is computed continuously from container width via
`ResizeObserver`:

```
visibleDays = clamp(floor((containerWidth - 44px) / 120px), 1, 6)
```

| `visibleDays` | Behaviour |
|---|---|
| 6 | Week view: Mon–Fri as 5 individual columns + Sa\|So as one shared column |
| 2–5 | N-day view: N day-slots from `anchor` (Sa+So always merged into one slot) |
| 1 | Single-day view |

Approximate breakpoints:

| Container width | visibleDays |
|---|---|
| < 164px | 1 |
| 164–283px | 1 |
| 284–403px | 2 |
| 404–523px | 3 |
| 524–643px | 4 |
| 644–763px | 5 |
| ≥ 764px | 6 (week) |

---

## Weekend column rule

Sa and So are **always** shown as a single merged double-column, regardless of view width:

- If Saturday falls within the visible range, Sunday is always included alongside it (even if
  it is outside the original n-day window).
- If the anchor lands on Sunday, it snaps back to Saturday so the pair starts at Sa.
- In week view (visibleDays=6), Mon–Fri get one full slot each; Sa+So share the sixth slot.

---

## Navigation

- **‹ / ›** arrows: move `anchor` by the full visible window — **7 days** in week view
  (visibleDays=6), **N days** otherwise (not 1 day per click).
- **Heute** button: reset `anchor` to today. Uses a custom SVG icon: a calendar with a dot
  in the centre cell and an upward arrow emerging from below the calendar frame.
- In week view (visibleDays=6), the grid always starts from the Monday of the week
  containing `anchor`.

### Header label

| visibleDays | Format | Example |
|---|---|---|
| 1 | `"Di, 22. April 2026"` | `dayHeaderLabel(anchor)` |
| 6 | `"KW 17 · April 2026"` | `weekHeaderLabel(anchor)` |
| 2–5 | `"Mo 20. – Do 23. April 2026"` | `rangeHeaderLabel(anchor, anchor+n-1)` |

---

## Time grid

- Full 24-hour grid (`DAY_START=0`, `DAY_END=24`). Each hour = 64px. Total height = 1536px.
- Hour lines at every hour; half-opacity lines at every half-hour.
- Sticky column-header row at the top.
- All-day strip rendered only when ≥ 1 all-day event is visible in the current range.
- Scrollable body; on first render scrolls to 30 minutes before the earliest event in
  the visible range, or 08:00 if no events exist.
- On subsequent renders (e.g. data refresh): scroll position is preserved.

### Column headers

| State | CSS class | Appearance |
|---|---|---|
| Default | `focal-day-header` | Muted text |
| Today | `focal-day-header--today` | Accent tint background |
| Selected date | `focal-day-header--selected` | Full accent background, white text |

The Sa\|So slot uses `focal-day-header--double` with two `focal-day-subheader` children;
each sub-header gets the same `--today` / `--selected` modifiers independently.

### Day body

| State | CSS class | Appearance |
|---|---|---|
| Today | `focal-day-body--today` | Light accent tint |
| Selected date | `focal-day-body--selected` | Very light accent wash |

A red "now line" with a circular dot is rendered in today's column at the current time.
The now line is updated every 60 seconds via a repeating interval timer.

---

## Event cards (timed events)

Positioned absolutely within the day body. Width and horizontal offset are computed by
a **cluster algorithm**: overlapping events are grouped into clusters; within each cluster,
events are assigned sub-columns greedily.

```
top    = max(0, rawTop) + 1px
height = min(gridBottom, rawBottom) − top − 1px   (min 20px)
left   = calc(col/totalCols * 100% + 1px)
width  = calc(1/totalCols * 100% − 3px)
```

Where `rawTop` and `rawBottom` are derived from the event's ISO start/end timestamps
using the 64px/hour scale.

### Visual states

| CSS modifier | Condition | Appearance |
|---|---|---|
| `--selected` | `event.id === selectedEventId` | Full accent bg + white text |
| `--series` | Same title as selected, different instance | Dimmed accent bg (`--f-event-series-bg`) |
| `--has-note` | Note with matching `event-id` exists | 4px left border |
| `--recurring` | `event.isRecurring === true` | ↻ icon next to time |
| `--cancelled` | `event.isCancelled === true` | Cancelled styling |
| `--continues-before` | Multi-day, not the start day | Top border + radius removed |
| `--continues-after` | Multi-day, not the end day | Bottom border + radius removed |

Cards show: start time, recurring icon (↻), title, location (if card height > 42px),
removal hint (`⏱ <date>`) if the linked note has `toBeRemoved: true`.

### Drag interactions on event cards (desktop only, organizer events only)

- **Drag-to-move**: mousedown on card body → after 5px movement threshold, a ghost element
  appears and a landing indicator shows the target slot. On mouseup over a day column,
  calls `calendarReader.moveEvent()` (→ `focal-cal move`).
- **Drag-to-resize**: resize handle element at the card's bottom edge. Dragging changes the
  card height live. On mouseup, calls `calendarReader.moveEvent()` with the new end time.

### All-day chips

Rendered in the all-day strip using a **spanning chip** layout:

- Each all-day event is rendered once, spanning the full range of visible columns it covers
  (absolute-positioned, inclusive end date: `s <= date <= end`).
- Non-overlapping chips are packed into the same row (greedy row assignment).
- Same `--selected` / `--series` / `--recurring` / `--cancelled` states as timed cards.

---

## Selection and series highlight

### Series detection

A "series" is detected by counting how many loaded events share the exact same title.
If count > 1, `selectedSeriesTitle` is set to that title. This handles modified recurring
instances that have `isRecurring: false`.

### Active tab → calendar highlight

The calendar listens to two events:

1. `workspace.on("active-leaf-change")` — fires on every tab switch including already-open
   tabs. Gets the file from `leaf.view.file`.
2. `metadataCache.on("changed")` — fallback for files that become active before their
   metadata is indexed.

When the active file changes:
- `null` (non-file view like file explorer): keep existing highlight unchanged.
- File has no `event-id` in frontmatter: clear selection.
- File has `event-id` (string or array) matching a loaded event: apply selection and
  re-render. Falls back to title+date match for legacy notes.

`applySelection` sets:
- `selectedEventId` — for the `--selected` card
- `selectedDate` — for the highlighted column header + body
- `selectedSeriesTitle` — for `--series` cards (null if event is unique by title)

---

## Drag-to-create (desktop only)

Mousedown on an empty area in a day body starts a drag-to-create gesture:

1. A ghost element appears, snapping start/end times to 15-minute intervals.
2. On mouseup: a **popover** appears near the cursor with a title input field and
   Erstellen / Abbrechen buttons.
3. On confirmation: calls `calendarReader.createEvent()` (→ `focal-cal create`).
4. Pressing Escape or clicking outside the popover cancels without creating.

---

## Mini-month panel

Displayed below the time grid (same wrapper). Shows the current month of `anchor` with:

- A KW (Kalen­derwoche) column on the left.
- Day-of-week header row (Mo–So).
- Each day cell clickable to jump `anchor` to that date.
- Visual modifiers: `--has-event` (dot), `--anchor` (current anchor date), `--today`.

---

## Status bar

Shown above the time grid when data has a problem:

| Class | Condition |
|---|---|
| `.focal-status-bar--error` | Binary not found, calendar access denied, or parse error |
| `.focal-status-bar--warn` | Showing cached data (error + cache message); or no events loaded |

---

## Note opening

All click handlers on event cards and all-day chips call `openEvent(event, date, modifier)`.

```
openEvent(event, date, modifier):
  applySelection(event, date)
  render()
  { file, isNew } = noteManager.openOrCreate(event)
  openFile(app, file, modifier)
  if isNew: fold frontmatter properties in editor (after 100ms timeout)
```

- **Plain click**: switches to an existing open tab for the note, or opens in the current leaf.
- **Cmd/Ctrl+click**: opens in a new vertical split.

See `open-file.ts` in [internals.md](internals.md).
