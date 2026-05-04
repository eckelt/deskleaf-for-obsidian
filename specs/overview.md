# Deskleaf for Obsidian — Overview

## Purpose

An Obsidian plugin that renders macOS calendar data as a time-grid calendar and pairs it
with a structured note-taking workflow. Calendar events are fetched via a bundled Swift
binary (`focal-cal`) that reads from EventKit directly. The plugin lets the user view,
navigate, and create meeting notes directly from the calendar.

Visual language: e-paper / document aesthetic — low contrast, accent-tinted surfaces,
no heavy chrome.

---

## File map

```
src/
  main.ts             Plugin entry: registration, ribbon, commands, startup
  types.ts            All TS interfaces and constants
  calendar-reader.ts  Load / parse / cache / watch via focal-cal binary
  calendar-view.ts    Main time-grid calendar (ItemView)
  sidebar-view.ts     Left-panel sidebar: Topics + Todos (ItemView)
  note-manager.ts     Create / find / template / remove event notes
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

Deploy by copying `main.js`, `styles.css`, and the `focal-cal` binary into the Obsidian
plugin folder:

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>/.obsidian/plugins/obs-focal/
```

The binary must be built separately: `cd swift && bash build.sh`

---

## Plugin lifecycle

### `onload`
1. Register custom SVG icon `focal-point` (circle with crosshair ticks).
2. Load settings + persisted calendar cache from `data.json`.
3. Instantiate `CalendarReader` (binary-based) and `NoteManager`.
4. Register view types `focal-calendar` and `focal-sidebar`.
5. On `workspace.onLayoutReady`:
   - Run `calendarReader.load()` (one-shot `focal-cal export`).
   - Start `focal-cal watch` process for live updates.
   - Run removal cleanup (`NoteManager.runRemovalCleanup`).
   - Open default views (see below).
6. Add ribbon icons: Kalender (`calendar-days`), Sidebar (`focal-point`), Suche (`search`).
7. Add commands: `focal-open-calendar`, `focal-open-sidebar`, `focal-search` (hotkey `Cmd+F`).
8. Add settings tab.

### Default view layout
- Calendar view opens in the main content area (if not already open).
- Sidebar is placed in the **left panel** (if not already open).

### `onunload`
Stops the `CalendarReader` watch process (`focal-cal watch` subprocess killed).

---

## Settings

| Setting | Key | Default |
|---|---|---|
| focal-cal binary path | `binaryPath` | `""` (auto-detect in plugin directory) |
| Template folder | `templateFolder` | `templates` |
| Notes folder | `notesFolder` | `notes` |
| Topics folder | `topicsFolder` | `topics` |
| Topics order | `topicsOrder` | `[]` |

`weekStartsOn` is fixed to `"monday"` and not exposed in settings UI.

Changing `binaryPath` immediately restarts the binary watch process and reloads data.

### data.json persistence

In addition to settings, `data.json` stores:
- `calendarCache`: `CalendarEvent[]` — last successful load
- `calendarCacheDate`: `string | null` — ISO timestamp of that load

This cache is used as a fallback on load failure and on mobile (where the binary is unavailable).
