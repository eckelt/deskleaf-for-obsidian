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
| `.focal-root` | Root container of any focal view |
| `.focal-calendar-wrapper` | Flex column wrapper for nav + grid |
| `.focal-cal-header` | Sticky nav bar |
| `.focal-time-grid` | Grid container (flex column) |
| `.focal-grid-header-row` | Sticky day-header row |
| `.focal-day-header` | Single-day column header |
| `.focal-day-header--double` | Sa|So header wrapper (flex row) |
| `.focal-day-subheader` | Individual header within a double column |
| `.focal-day-header--today` | Today modifier |
| `.focal-day-header--selected` | Selected date modifier |
| `.focal-allday-row` | All-day event strip |
| `.focal-allday-chip` | All-day event pill |
| `.focal-allday-chip--selected` | Selected state |
| `.focal-allday-chip--series` | Series dim-highlight |
| `.focal-grid-body-scroll` | Scrollable body container |
| `.focal-day-body` | Single day column body |
| `.focal-day-body--double` | Sa|So body wrapper |
| `.focal-day-body--sub` | Individual body within a double column |
| `.focal-day-body--today` | Today tint |
| `.focal-day-body--selected` | Selected date tint |
| `.focal-now-line` + `.focal-now-dot` | Current time indicator |

### Event cards

| Class | Meaning |
|---|---|
| `.focal-event-card` | Base event card |
| `.focal-event-card--selected` | Active / highlighted event |
| `.focal-event-card--series` | Dimmed series highlight |
| `.focal-event-card--has-note` | Note exists (thicker left border) |
| `.focal-event-card--recurring` | Recurring event |
| `.focal-event-card--continues-before` | Multi-day continuation from earlier day |
| `.focal-event-card--continues-after` | Multi-day continuation to later day |

### Sidebar

| Class | Meaning |
|---|---|
| `.focal-sidebar-root` | Sidebar root |
| `.focal-topic-row` | Topic list row |
| `.focal-topic-row--active` | Active (currently open) topic |
| `.focal-topic-row.focal-dragging` | Row being dragged |
| `.focal-topic-row.focal-drop-before/after` | Drop insertion indicator |
| `.focal-todo-row` | Todo item row |

---

## Status bar

Shown below the nav bar when data has a problem:

| Class | Condition |
|---|---|
| `.focal-status-bar--error` | File not found or parse error |
| `.focal-status-bar--warn` | Showing cached data; or no events loaded |
