# Data Model

## CalendarEvent (internal)

The normalised shape used everywhere in the plugin. Produced by both `CalendarReader`
(via the Swift binary) and `CalDAVReader` (via `ical-parser.ts`).

```ts
interface CalendarEvent {
  id: string;               // primary key — see Event ID schema below
  title: string;
  start: string;            // ISO 8601 datetime (timed) or YYYY-MM-DD (all-day)
  end: string;              // ISO 8601 datetime (timed) or YYYY-MM-DD (all-day)
  location?: string | null;
  attendees?: string[];
  body?: string | null;     // calendar event notes/description
  calendar?: string;        // source calendar name
  isRecurring?: boolean;
  isCancelled?: boolean;
  isAllDay?: boolean;
  isOrganizer?: boolean;    // true if organizer is nil OR isCurrentUser (binary); always false (CalDAV)
  meetingPlatform?: string; // "zoom" | "teams" | "meet" | "webex" | undefined
  numAttendees?: number;
  organizer?: string | null;
}
```

### Event ID schema

| Backend | Event type | ID format | Example |
|---|---|---|---|
| Binary | Non-recurring | Raw `eventIdentifier` | `"ABC123"` |
| Binary | Recurring | `eventIdentifier\|YYYY-MM-DD` | `"ABC123\|2026-04-22"` |
| CalDAV | Non-recurring | `UID` | `"abc-uuid"` |
| CalDAV | Recurring instance | `UID_RECURRENCE-ID.value` | `"abc-uuid_20260422T100000Z"` |

`id` is the stable link between the calendar and the note. Stored in note frontmatter as `event-id`.

Multi-day events from `getEventsForDate` carry two extra runtime flags (added as `any` casts,
not part of the interface):

```ts
_continuesBefore: boolean  // event started on an earlier day
_continuesAfter:  boolean  // event ends on a later day
```

---

## JSON input format (binary backend)

A JSON array is emitted on stdout by `deskleaf-calendar-sync export` and once per
`EKEventStoreChanged` notification by `deskleaf-calendar-sync watch`.

All-day events use `YYYY-MM-DD` for `start`/`end`. Timed events use full ISO 8601 with
timezone offset.

---

## Event note frontmatter

Written by `NoteManager` when creating a new note.

```yaml
---
event-id: "ABC123|2026-04-22"
title: "Team Weekly"
date: "2026-04-22"
start: "10:00"
end: "11:00"
location: ""
attendees: ["[[Alice Smith]]", "[[Bob Jones]]"]
type: meeting          # meeting | interview | recurring | task
toBeRemoved: false
removalDate: null
topics: []
---
```

`event-id` can be a single string or a YAML array (for notes linked to multiple events).

### Attendee name normalisation

Names in the format `"Last, First"` are normalised to `"First Last"`. Names without a comma
are used as-is. Implemented in `note-utils.normalizeAttendee`.

---

## Topic note

Any vault file with the `#topic` tag (inline body tag) or `topic` in frontmatter `tags`
array is treated as a topic.

Created by the sidebar:

```markdown
---
tags: [topic]
---

# <Title>

```

Topics are identified by file path. Display name = `file.basename`.

---

## DeskleafSettings

```ts
interface DeskleafSettings {
  binaryPath: string;         // empty = auto-detect deskleaf-calendar-sync in plugin directory
  weekStartsOn: "monday";     // fixed, not user-configurable
  templateFolder: string;     // default: "templates"
  notesFolder: string;        // default: "notes"
  topicsFolder: string;       // default: "topics"
  topicsOrder: string[];      // ordered file paths for sidebar sort
  caldav: CalDAVSettings;
}
```

## CalDAVSettings

```ts
interface CalDAVSettings {
  url: string;                // CalDAV server URL
  username: string;
  password: string;
  selectedCalendars: string[]; // hrefs; empty = all
  discoveredCalendars: Array<{ href: string; displayName: string }>;
  calendarColors: Record<string, number>; // displayName → hue from CAL_COLOR_PALETTE
}
```

## CAL_COLOR_PALETTE

Six Monokai Pro hues used for per-calendar colour assignment:

```ts
const CAL_COLOR_PALETTE = [346, 21, 48, 96, 188, 252] as const;
// pink · orange · yellow · green · cyan · purple
```

Assigned to calendars via colour swatches in the settings UI. Persisted in
`<manifest.dir>/calendar-colors.json` separately from `data.json`.

---

## data.json persistence

Stores `DeskleafSettings` plus:

```ts
calendarCache:     CalendarEvent[]  // last successful load
calendarCacheDate: string | null    // ISO timestamp of that load
```

Calendar colours are stored separately in `calendar-colors.json` (not in `data.json`).
