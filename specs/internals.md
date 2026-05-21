# Internals

## CalendarReader

Loads, parses, caches, and watches events via the `deskleaf-calendar-sync` Swift binary (EventKit bridge).

### Binary path resolution

- Empty string: auto-detect `deskleaf-calendar-sync` in the plugin's own directory
  (`<vault>/.obsidian/plugins/<plugin>/deskleaf-calendar-sync`). Resolved in `main.ts` via
  `(app.vault.adapter as any).basePath + manifest.dir + "/deskleaf-calendar-sync"`.
- Non-empty: used as-is (absolute path).
- On mobile (iOS): Node.js `child_process` / `fs` unavailable — falls back to cache immediately.

### Load sequence (`load()`)

1. Try `require("child_process")` and `require("fs")`. If unavailable → set `loadError = "Mobiles Gerät"`, try cache, notify.
2. Check `existsSync(binaryPath)`. If missing → set error, try cache, notify.
3. Run `deskleaf-calendar-sync export --days-back 90 --days-forward 365` (timeout: 15s) via `execFile`.
4. On error (non-zero exit): set `loadError`, try cache.
5. On success: parse JSON via `handleLine`. If zero events → treat as calendar access denied, try cache.
6. Notify all subscribers via `onChange` watchers.

### Watch process (`startWatching` / `stopWatching`)

Spawns `deskleaf-calendar-sync watch --days-back 90 --days-forward 365` as a long-lived child process.
The binary prints one JSON line per `EKEventStoreChanged` notification (and one immediately
on startup). The reader buffers partial lines and calls `handleLine` per complete newline.

`stopWatching` kills the process. Called by `main.ts` on plugin unload.
`setBinaryPath(newPath)` restarts the process if the path changes.

### Cache fallback

On any load failure (`tryLoadCache`): if the persisted cache has events, they are loaded
and `loadError` is appended with `"— Cache vom <dd.MM.yyyy HH:mm>"`.

If no cache exists: `loadError` is the raw error; `events = []`.

### Public API

| Method | Returns | Description |
|---|---|---|
| `getEvents()` | `CalendarEvent[]` | All loaded events |
| `getEventsForDate(date)` | `CalendarEvent[]` | Timed events touching `date`; multi-day events sliced to day boundaries with `_continuesBefore`/`_continuesAfter` flags |
| `getAllDayEventsForDate(date)` | `CalendarEvent[]` | All-day events; end date is **inclusive** (`s <= date && date <= en`) |
| `getLoadError()` | `string \| null` | Error or cache-fallback message |
| `getCacheDate()` | `string \| null` | ISO timestamp of the last successful load |
| `getPath()` | `string` | Current configured binary path |
| `onChange(fn)` | `() => void` | Subscribe to data changes; returns unsubscribe function |

### Write operations

| Method | Binary command | Description |
|---|---|---|
| `createEvent(params)` | `deskleaf-calendar-sync create --title … --start … --end … --calendar … [--notes …] [--location …]` | Creates a calendar event; returns the new `eventIdentifier` |
| `moveEvent(id, newStart, newEnd)` | `deskleaf-calendar-sync move --id … --start … --end …` | Moves/resizes an event |
| `cancelEvent(id, span)` | `deskleaf-calendar-sync cancel --id … --span this\|future` | Removes an event |

All write operations use `execFile` with a 10s timeout. Unavailable on mobile.

---

## deskleaf-calendar-sync binary (Swift)

Source: `swift/Sources/FocalCal/main.swift` (built to `deskleaf-calendar-sync` via `swift/build.sh`).

Uses `EventKit` (`EKEventStore`) to read and write macOS Calendar events.

### Commands

| Command | Description |
|---|---|
| `export` | Fetch events, print JSON array to stdout, exit 0 |
| `watch` | Fetch + print on start, then re-print on every `EKEventStoreChanged` notification; never exits |
| `create` | Create a new event; print its `eventIdentifier` to stdout |
| `move` | Find event by ID, update start/end, save |
| `cancel` | Find event by ID, remove it |

### `isOrganizer` logic

`isOrganizer = ev.organizer == nil || (ev.organizer?.isCurrentUser ?? false)`

Events without an organizer (personal/local calendar entries) are treated as organizer-owned,
enabling drag-to-move and drag-to-resize.

### `findEvent` (for move/cancel)

```
if id contains "|":
  split into baseId + dateStr
  search events on that date where eventIdentifier == baseId
else:
  store.event(withIdentifier: id)
```

### Meeting platform detection

Scanned from `ev.notes`, `ev.url`, and `ev.location` (all lowercased):

| Platform | Pattern |
|---|---|
| `zoom` | `zoom.us` |
| `teams` | `teams.microsoft.com` or `teams.live.com` |
| `meet` | `meet.google.com` |
| `webex` | `webex.com` |

---

## open-file helper

`src/open-file.ts` — used by all interaction points (calendar event cards, topic titles,
todo chips) to ensure consistent navigation behaviour.

```
openFile(app, file, modifier):
  if modifier (Cmd/Ctrl):
    getLeaf('split').openFile(file, { active: true })
  else:
    find first markdown leaf where leaf.view.file.path === file.path
    if found → setActiveLeaf(leaf, { focus: true })
    else     → getLeaf(false).openFile(file, { active: true })
```

---

## date-utils API

### Column builders

| Function | Returns | Description |
|---|---|---|
| `get1DayColumn(anchor)` | `DayColumn[]` (1 item) | Single day |
| `getNDayColumns(anchor, n)` | `DayColumn[]` (≤n items) | N day-slots; Sa+So are always merged into one double-column slot; if anchor lands on Sunday it snaps back to Saturday |
| `getWeekColumns(anchor)` | `DayColumn[]` (6 items) | Mon–Fri (5 individual) + Sa\|So (1 double-column); always starts from the Monday of the week containing anchor |

`DayColumn` interface:

```ts
interface DayColumn {
  label: string;
  dates: string[];  // one YYYY-MM-DD string, or two for Sa|So
}
```

### Label formatters

| Function | Example output |
|---|---|
| `dayHeaderLabel(anchor)` | `"Di, 22. April 2026"` |
| `weekHeaderLabel(anchor)` | `"KW 17 · April 2026"` |
| `rangeHeaderLabel(start, end)` | `"Mo 20. – Do 23. April 2026"` |
| `shortDayLabel(d)` | `"Mo 21.04."` |

### Date utilities

| Function | Description |
|---|---|
| `toDateStr(d)` | `Date → "YYYY-MM-DD"` |
| `toTimeStr(iso)` | `ISO string → "HH:MM"` |
| `parseDate(s)` | `"YYYY-MM-DD" → local Date at midnight` |
| `addDays(d, n)` | Add n days to a Date |
| `weekStart(d)` | Monday of the week containing d |
| `getWeekNumber(d)` | ISO week number (used by mini-month panel) |

---

## Search modal

`DeskleafSearchModal` — opened via ribbon, command, or `Cmd+F`.

- **Default state**: lists the 6 most recently modified files in `notesFolder`, labelled
  "Zuletzt bearbeitet".
- **On input (≥ 2 chars)**: searches all files in `notesFolder` by filename and full
  content (case-insensitive, via `vault.read`). Returns up to 20 matches with a ±40-char
  context snippet around the first match.
- Each result row shows: frontmatter `title` (or `file.basename`), `date`, and snippet.
- Clicking a result uses the `openFile` helper: switches to existing tab, or opens in
  current leaf. Cmd/Ctrl+click opens in a split. Modal closes on selection.
