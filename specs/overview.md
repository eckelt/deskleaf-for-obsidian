# Deskleaf for Obsidian — Overview

## Purpose

An Obsidian plugin that renders macOS calendar data as a time-grid calendar and pairs it
with a structured note-taking workflow. Calendar events are fetched via a bundled Swift
binary (`deskleaf-calendar-sync`) that reads from EventKit directly. The plugin lets the
user view, navigate, and create meeting notes directly from the calendar.

Visual language: e-paper / document aesthetic — low contrast, accent-tinted surfaces,
no heavy chrome.

---

## File map

```
src/
  main.ts             Plugin entry: registration, ribbon, commands, startup
  types.ts            All TS interfaces and constants
  calendar-reader.ts  Load / parse / cache / watch via deskleaf-calendar-sync binary
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

Deploy by copying `main.js`, `styles.css`, `manifest.json`, and the `deskleaf-calendar-sync`
binary into the Obsidian plugin folder:

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>/.obsidian/plugins/deskleaf-for-obsidian/
```

The binary must be built separately: `cd swift && bash build.sh`

---

## Plugin lifecycle

### `onload`
1. Register custom SVG icons:
   - `dl-point` — circle with crosshair ticks (used for sidebar ribbon).
   - `deskleaf-calendar` — leaf+calendar composite (tab icon for calendar view).
   - `deskleaf` — leaf only (ribbon icon for calendar).
2. Load settings + persisted calendar cache from `data.json`.
3. Instantiate `CalendarReader` (binary-based) and `NoteManager`.
4. Register view types `deskleaf-calendar` and `deskleaf-sidebar`.
5. On `workspace.onLayoutReady`:
   - Run `calendarReader.load()` (one-shot `deskleaf-calendar-sync export`).
   - Start `deskleaf-calendar-sync watch` process for live updates.
   - Run removal cleanup (`NoteManager.runRemovalCleanup`).
   - Open default views via `ensureView` helper (see below).
6. Add ribbon icons: Kalender (`deskleaf`), Sidebar (`dl-point`), Suche (`search`).
7. Add commands: `dl-open-calendar`, `dl-open-sidebar`, `dl-search` (hotkey `Cmd+F`).
8. Add settings tab.
9. Register `window.beforeunload` handler to kill the watch process on Electron shutdown.

### Default view layout

`ensureView(viewType, getLeaf, active)` is a helper that either opens the view (if no leaf
of that type exists yet) or calls `leaf.updateHeader()` to refresh tab icons that may have
been painted before `addIcon()` ran.

- Calendar view opens in the main content area via `workspace.getLeaf(false)`.
- Sidebar is placed in the **left panel** via `workspace.getLeftLeaf(false)`.

After both views are ensured, `revealLeaf` makes the calendar the active leaf.

### `onunload`
Stops the `CalendarReader` watch process (`deskleaf-calendar-sync watch` subprocess killed
via SIGKILL). Also fires via the `beforeunload` handler on Electron exit.

---

## Settings

| Setting | Key | Default |
|---|---|---|
| deskleaf-calendar-sync binary path | `binaryPath` | `""` (auto-detect in plugin directory) |
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
