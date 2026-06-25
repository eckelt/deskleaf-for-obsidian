# Deskleaf for Obsidian — Project Context

Obsidian plugin: time-grid calendar + structured note-taking workflow.
Two backends: **CalDAV** (all platforms) and a bundled **Swift binary** reading macOS EventKit.
Active backend is auto-selected: CalDAV if `caldav.username + password` set, else binary.

---

## Source map

```
src/
  main.ts             Plugin entry: icons, settings, reader factory, view registration
  types.ts            All TS types + CAL_COLOR_PALETTE constant
  calendar-view.ts    Time-grid calendar ItemView (drag, resize, create, navigate)
  sidebar-view.ts     Left panel: Topics list + Todos board
  calendar-reader.ts  macOS EventKit backend (binary bridge)
  caldav-reader.ts    CalDAV backend (HTTP polling, iCal parsing)
  caldav-client.ts    Low-level CalDAV HTTP client (PROPFIND, REPORT, PUT, DELETE)
  ical-parser.ts      RFC 5545 iCal parser + VEVENT builder
  event-filter.ts     Pure date-range filtering (shared by both readers)
  event-layout.ts     Pixel math: event position, height, overlap columns
  note-manager.ts     Create / find / template / remove event notes
  note-utils.ts       Pure helpers: attendee normalisation, filename sanitisation
  date-utils.ts       Date arithmetic, column builders, header label formatters
  open-file.ts        Shared navigation helper (modifier-aware tab/split logic)
  search-modal.ts     Full-text search over notesFolder
  settings.ts         Settings tab UI
styles.css            All styles — single flat file, no CSS modules
```

---

## Design system

**Theme:** Monokai Pro.

**Dark mode chrome:**
- Background: `#2d2a2e` · Panel: `#221f22` · Text: `#fcfcfa` · Muted: `#727072`
- Borders: `#3e3b3f` (subtle) / `#5b595c` (strong)

**Light mode chrome:**
- Background: `#f9f7f5` · Text: `#2d2a2e` · Muted: `#a09c98` · Borders: `#e6e2dd`

**Calendar palette — 6 Monokai Pro hues** (`CAL_COLOR_PALETTE`):
`346` pink · `21` orange · `48` yellow · `96` green · `188` cyan · `252` purple

**Event cards** use CSS custom prop `--cal-h` (hue only):
- Light: `hsl(h, 52%, 91%)` bg / `hsl(h, 58%, 47%)` border / `hsl(h, 58%, 24%)` text
- Dark: `hsl(h, 28%, 15%)` bg / `hsl(h, 78%, 63%)` border / `hsl(h, 72%, 70%)` text

**CSS variable naming:** `--f-*` for layout/surface vars, `--cal-h` per event card.
All Obsidian accent colours come from `--accent-h/s/l` and `--interactive-accent`.

---

## Key data types (`src/types.ts`)

```ts
CalendarEvent { id, title, start, end, calendar?, isAllDay?, isRecurring?,
                isOrganizer?, isCancelled?, meetingPlatform?, attendees?, body?,
                location?, numAttendees?, organizer? }

DeskleafSettings { binaryPath, weekStartsOn: "monday", templateFolder,
                   notesFolder, topicsFolder, topicsOrder, caldav, icalSubscriptions }

CAL_COLOR_PALETTE = [346, 21, 48, 96, 188, 252]  // hues for calendar colour picker
```

Event IDs: binary non-recurring = raw `eventIdentifier`; binary recurring = `id|YYYY-MM-DD`;
CalDAV = `UID` or `UID_RECURRENCE-ID`.

---

## Build & deploy

```bash
npm run build            # tsc type-check + esbuild → main.js
npm test                 # vitest (TZ=UTC always)
bash deploy.sh           # build + copy main.js + styles.css to Obsidian vault
```

Vault plugin path:
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Verknüpfungen/.obsidian/plugins/deskleaf-for-obsidian/`

---

## Architecture principles

- **Lean modules** — each `src/*.ts` has one clear responsibility; no cross-cutting God classes
- **Pure functions first** — date math, filtering, layout math live in pure utility files
- **No direct DOM** outside view files — `calendar-view.ts` and `sidebar-view.ts` own the DOM
- **Shared types in `types.ts`** — domain/shared/exported cross-module types live there;
  local unexported helper types may stay next to the code or tests that use them
- **styles.css is single-file** — no inline styles for static styling; dynamic
  CSS custom properties are allowed for runtime layout/colour values (`--f-*`,
  `--cal-h`)
- **Tests use vitest** — run with `TZ=UTC`; test files in `tests/*.test.ts`

---

## Feature development workflow

Specs live in `specs/features/[feature-name].md` — the shared artefact between all agents.
Status progression: `draft → ux-reviewed → design-reviewed → approved → in-development → qa → done`

Each spec contains: User Story · Acceptance Criteria · Out of Scope · UX Review · Design Review · QA Report.

For agent context: read the **feature spec only** — do not read all of `specs/` unless specifically relevant.
