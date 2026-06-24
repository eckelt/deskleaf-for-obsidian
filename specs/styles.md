# Styles

All styles live in `styles.css` — a single flat file, no modules.

---

## Design language

- E-paper / document aesthetic: low contrast, no heavy shadows, minimal chrome.
- Accent colour is inherited from Obsidian's theme via CSS custom properties (`--accent-h`, `--accent-s`, `--accent-l`, `--interactive-accent`).
- Light and dark mode each have their own variable overrides under `.theme-light` / `.theme-dark`.

---

## CSS custom properties

Defined on `:root`, overridden per theme.

### Surface & text

| Variable | Purpose |
|---|---|
| `--f-bg` | Panel / grid background |
| `--f-bg-col` | Day column background |
| `--f-fg` | Primary text |
| `--f-muted` | Secondary text, labels, gutters |
| `--f-border` | Subtle grid lines, hour lines |
| `--f-border-dark` | Section dividers, header borders |
| `--f-gutter` | Time gutter width (44px) |

### State colours

| Variable | Purpose |
|---|---|
| `--f-today-bg` | Today column body tint |
| `--f-today-header` | Today column header tint; also used for active topic row background |
| `--f-now-color` | "Now" line and dot |

### Event card colours

| Variable | Light | Dark |
|---|---|---|
| `--f-event-bg` | `hsl(accent-h, 55%, 91%)` | `hsl(accent-h, 18%, 22%)` |
| `--f-event-border` | `hsl(accent-h, 50%, 55%)` | `hsl(accent-h, 35%, 42%)` |
| `--f-event-fg` | `var(--f-fg)` | `hsl(accent-h, 15%, 86%)` |
| `--f-event-sel-bg` | `hsl(accent-h, 55%, 48%)` | `var(--interactive-accent)` |
| `--f-event-sel-border` | `hsl(accent-h, 55%, 38%)` | `var(--interactive-accent)` |
| `--f-event-sel-fg` | `#fff` | `var(--text-on-accent, #fff)` |
| `--f-event-series-bg` | `hsl(accent-h, 62%, 62%)` | `hsl(accent-h, 40%, 40%)` |
| `--f-event-series-border` | `hsl(accent-h, 58%, 46%)` | `hsl(accent-h, 50%, 54%)` |

---

## Key CSS classes

### Calendar grid

| Class | Element |
|---|---|
| `.dl-root` | Root container of any focal view |
| `.dl-calendar-wrapper` | Flex column wrapper for nav + grid |
| `.dl-cal-header` | Sticky nav bar |
| `.dl-time-grid` | Grid container (flex column) |
| `.dl-grid-header-row` | Sticky day-header row |
| `.dl-day-header` | Single-day column header |
| `.dl-day-header--double` | Sa|So header wrapper (flex row) |
| `.dl-day-subheader` | Individual header within a double column |
| `.dl-day-header--today` | Today modifier |
| `.dl-day-header--selected` | Selected date modifier |
| `.dl-allday-row` | All-day event strip |
| `.dl-allday-chip` | All-day event pill |
| `.dl-allday-chip--selected` | Selected state |
| `.dl-allday-chip--series` | Series dim-highlight |
| `.dl-grid-body-scroll` | Scrollable body container |
| `.dl-day-body` | Single day column body |
| `.dl-day-body--double` | Sa|So body wrapper |
| `.dl-day-body--sub` | Individual body within a double column |
| `.dl-day-body--today` | Today tint |
| `.dl-day-body--selected` | Selected date tint |
| `.dl-business-hours-segment` | Subtle Business Hours background highlight |
| `.dl-now-line` + `.dl-now-dot` | Current time indicator |

### Event cards

| Class | Meaning |
|---|---|
| `.dl-event-card` | Base event card |
| `.dl-event-card--selected` | Active / highlighted event |
| `.dl-event-card--series` | Dimmed series highlight |
| `.dl-event-card--has-note` | Note exists (thicker left border) |
| `.dl-event-card--recurring` | Recurring event |
| `.dl-event-card--continues-before` | Multi-day continuation from earlier day |
| `.dl-event-card--continues-after` | Multi-day continuation to later day |

### Sidebar

| Class | Meaning |
|---|---|
| `.dl-sidebar-root` | Sidebar root |
| `.dl-topic-row` | Topic list row |
| `.dl-topic-row--active` | Active (currently open) topic |
| `.dl-topic-row.dl-dragging` | Row being dragged |
| `.dl-topic-row.dl-drop-before/after` | Drop insertion indicator |
| `.dl-todo-row` | Todo item row |

---

## Calendar color palette

Six fixed accent colors for multi-calendar display (one per calendar / iCal feed). Backgrounds use a muted version of these colors (lower saturation / higher lightness in light mode; lower saturation / lower lightness in dark mode) — the base colors here are for borders and text-on-card labels.

| # | Semantic | Light (`rgb`) | Dark (`rgb`) | Hue (HSL) |
|---|---|---|---|---|
| 1 | Rose | `rgb(225, 71, 117)` | `rgb(255, 97, 136)` | 346° |
| 2 | Orange | `rgb(225, 96, 50)` | `rgb(252, 152, 103)` | 21° |
| 3 | Yellow | `rgb(255, 216, 102)` | `rgb(255, 216, 102)` | 48° |
| 4 | Green | `rgb(38, 157, 105)` | `rgb(169, 220, 118)` | 154° |
| 5 | Teal | `rgb(28, 140, 168)` | `rgb(120, 220, 232)` | 188° |
| 6 | Purple | `rgb(112, 88, 190)` | `rgb(171, 157, 242)` | 252° |

**Code:** `CAL_COLOR_PALETTE` in `src/types.ts` stores the six hue values `[346, 21, 48, 154, 188, 252]` for HSL-based color calculations. Specific lightness/saturation values per theme are applied in CSS.

**Yellow note:** Yellow (hue 48°) uses the same base color in both themes. On light backgrounds white-text contrast requires the background to stay ≤ 36% lightness; on dark backgrounds the muted background can be standard.

---

## Status bar

Shown below the nav bar when data has a problem:

| Class | Condition |
|---|---|
| `.dl-status-bar--error` | File not found or parse error |
| `.dl-status-bar--warn` | Showing cached data; or no events loaded |
