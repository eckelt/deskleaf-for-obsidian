# Deskleaf for Obsidian — Overview

## Purpose

An Obsidian plugin that renders calendar data as a time-grid calendar and pairs it with a
structured note-taking workflow. Two calendar backends are supported:

- **CalDAV** (primary): any CalDAV server (Fastmail, iCloud, Google, etc.) via HTTP. Works
  on all platforms including iOS.
- **deskleaf-calendar-sync** (macOS-only): bundled Swift binary reading from EventKit directly.

The active backend is selected automatically at startup: CalDAV if `caldav.username` and
`caldav.password` are set, otherwise the binary.

Visual language: e-paper / document aesthetic — low contrast, accent-tinted surfaces, no heavy chrome.

---

## File map

```
src/
  main.ts             Plugin entry: registration, ribbon, commands, startup
  types.ts            All TS interfaces and constants (CalendarEvent, DeskleafSettings, CalDAVSettings, …)
  calendar-reader.ts  macOS EventKit backend: load / parse / cache / watch via binary
  caldav-reader.ts    CalDAV backend: HTTP polling, iCal parsing, same public interface as CalendarReader
  caldav-client.ts    Low-level CalDAV/WebDAV HTTP client (PROPFIND, REPORT, PUT, DELETE)
  ical-parser.ts      RFC 5545 iCalendar parser + VEVENT builder
  event-filter.ts     Pure date-filtering functions shared by both readers
  event-layout.ts     Event-to-pixel math: offsets, heights, overlap column assignment
  calendar-view.ts    Main time-grid calendar (ItemView)
  sidebar-view.ts     Left-panel sidebar: Topics + Todos (ItemView)
  note-manager.ts     Create / find / template / remove event notes
  note-utils.ts       Pure helpers: attendee normalisation, filename sanitisation, body cleaning
  open-file.ts        Shared helper: open file in existing tab or split
  date-utils.ts       Date arithmetic, column builders, label formatters
  search-modal.ts     Full-text search modal over the notes folder
  settings.ts         Settings tab UI
styles.css            All styles (single file)
esbuild.config.mjs    Build configuration
manifest.json         Obsidian plugin manifest
swift/
  Sources/FocalCal/main.swift   Swift binary source (EventKit bridge)
  build.sh                      Build script
```

---

## Build

```bash
# Production build → main.js
node esbuild.config.mjs production

# Dev watch (inline sourcemaps)
node esbuild.config.mjs
```

Deploy by copying `main.js`, `styles.css`, `manifest.json`, and `deskleaf-calendar-sync`
into the Obsidian plugin folder:

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>/.obsidian/plugins/deskleaf-for-obsidian/
```

The binary must be built separately: `cd swift && bash build.sh`

---

## Plugin lifecycle

### `onload`
1. Register custom SVG icons:
   - `dl-point` — circle with crosshair ticks (sidebar ribbon + tab icon).
   - `deskleaf-calendar` — leaf+calendar composite (calendar tab icon).
   - `deskleaf` — leaf only (calendar ribbon icon).
2. Load settings (`loadSettings`) + restore calendar colours from `calendar-colors.json`
   (`restoreCalendarColors`).
3. Create reader via `makeReader()`: returns `CalDAVReader` if both `caldav.username` and
   `caldav.password` are set; otherwise returns `CalendarReader` (binary path).
4. Call `reader.setCacheCallbacks(save, load)` to wire cache persistence into `data.json`.
5. Instantiate `NoteManager`.
6. Register view types `deskleaf-calendar` and `deskleaf-sidebar`.
7. On `workspace.onLayoutReady`:
   - Run `calendarReader.load()`.
   - Start `calendarReader.startWatching()`.
   - Run `NoteManager.runRemovalCleanup`.
   - Open default views via `openDefaultViews`.
8. Add ribbon icons: Kalender (`deskleaf`), Sidebar (`dl-point`), Suche (`search`).
9. Add commands: `dl-open-calendar`, `dl-open-sidebar`, `dl-search` (hotkey `Cmd+F`).
10. Add settings tab.
11. Register `window.beforeunload` handler to stop the reader on Electron shutdown.

### Default view layout

`ensureView(viewType, getLeaf, active)` opens the view if no leaf exists yet, or calls
`leaf.updateHeader()` to refresh tab icons.

- Calendar view opens in the main content area via `workspace.getLeaf(false)`.
- Sidebar is placed in the **left panel** via `workspace.getLeftLeaf(false)`.
- After both are ensured, `revealLeaf` makes the calendar active.

### `onunload`
Calls `calendarReader.stopWatching()` (kills the watch process for the binary backend,
clears the poll interval for CalDAV). Also fires via the `beforeunload` handler.

---

## Settings

### CalDAV section

| Setting | Key | Default |
|---|---|---|
| Server-URL | `caldav.url` | `"https://caldav.fastmail.com"` |
| Benutzername | `caldav.username` | `""` |
| App-Passwort | `caldav.password` | `""` |
| Ausgewählte Kalender | `caldav.selectedCalendars` | `[]` (= alle) |
| Entdeckte Kalender | `caldav.discoveredCalendars` | `[]` |
| Kalenderfarben | `caldav.calendarColors` | `{}` |

"Neu laden" button: discovers calendars, populates `discoveredCalendars`, activates all of them.

Per-calendar colour swatches use the 6 Monokai Pro hues from `CAL_COLOR_PALETTE`
(`[346, 21, 48, 96, 188, 252]`). Clicking a swatch calls `saveSettingsQuiet()` — writes
`calendar-colors.json` in the plugin directory without triggering a reader restart.

### Notizen section

| Setting | Key | Default |
|---|---|---|
| Template-Ordner | `templateFolder` | `"templates"` |
| Notizen-Ordner | `notesFolder` | `"notes"` |
| Topics-Ordner | `topicsFolder` | `"topics"` |

### Erweitert section

| Setting | Key | Default |
|---|---|---|
| Binary-Pfad (macOS) | `binaryPath` | `""` (auto-detect in plugin dir) |

`weekStartsOn` is fixed to `"monday"` and not exposed in the UI.

Changing CalDAV credentials via `saveSettings()` updates or recreates the reader live.
Changing `binaryPath` calls `setBinaryPath()` on the CalendarReader, which restarts the watch process.

### data.json persistence

`data.json` stores settings plus:

- `calendarCache`: `CalendarEvent[]` — last successful load
- `calendarCacheDate`: `string | null` — ISO timestamp of that load

Calendar colours are stored separately in `<manifest.dir>/calendar-colors.json` (written by
`persistCalendarColors`, read by `restoreCalendarColors` on startup).
